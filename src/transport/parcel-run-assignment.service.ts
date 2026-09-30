/**
 * ParcelRunAssignmentService — Stage 3S-C3: binds a Parcel to a specific
 * ordered load/unload leg of a TransportRun.
 *
 * "A Run starts wherever its scheduled route starts, but a parcel may enter
 * and leave that Run at any valid ordered pair of stops" (Issue #62). This
 * service is the one place that invariant is enforced: both stops must
 * belong to the SAME Run, the load stop's sequence must be strictly before
 * the unload stop's, and both reference the immutable TransportRunStop
 * snapshot -- never the mutable, reusable RouteStop.
 *
 * Mirrors TransportService.createAssignment's own already-established
 * concurrency pattern (Stage 3S-B1) exactly: lock the Parcel row FIRST
 * (`SELECT ... FOR UPDATE`), then check for a live (non-terminal)
 * assignment for that same parcel -- a matching retry is idempotent, a
 * genuinely different request is a real conflict. Not re-invented here.
 *
 * Stage 3S-C4: markLoaded/markUnloaded now also write the canonical
 * ParcelCustodyEvent ledger (see buildCustodyTransition below) -- closing
 * the gap where this row's own `status` column was the only trace a load/
 * unload ever happened at all.
 *
 * Stage 3S-C6: markUnloaded's own custody event no longer directly claims
 * Super Agent receipt. The C5 re-review's own forward-looking limitation
 * named this precisely: "C4 Run unloading is initiated under a transport-
 * provider context while the RunStop identifies the destination Super
 * Agent" -- that is the PROVIDER's claim, not independent confirmation FROM
 * the receiving Super Agent. markUnloaded now only records the provider
 * releasing custody (toCustodianType/Id stay null/pending, even when the
 * stop names a real Super Agent); confirmReceipt is the new, separate,
 * Super-Agent-authenticated action that actually closes the loop, writes
 * the real qualifying custody event, and triggers automatic commission
 * generation as a best-effort side effect (never blocking the physical
 * confirmation itself -- see confirmReceipt's own comment).
 */
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { ParcelRunAssignment, ParcelRunAssignmentStatus } from './entities/parcel-run-assignment.entity';
import { TransportService } from './transport.service';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { RoleContext } from '../role-context/role-context.types';
import { SuperAgentHandlingEarningService } from '../super-agent-commission/super-agent-handling-earning.service';

export interface CreateParcelRunAssignmentDto {
  runId: number;
  parcelId: number;
  loadRunStopId: number;
  unloadRunStopId: number;
}

const ACTIVE_STATUSES = [ParcelRunAssignmentStatus.SCHEDULED, ParcelRunAssignmentStatus.LOADED];

@Injectable()
export class ParcelRunAssignmentService {
  constructor(
    @InjectRepository(ParcelRunAssignment) private assignmentRepo: Repository<ParcelRunAssignment>,
    @InjectRepository(TransportRun) private runRepo: Repository<TransportRun>,
    @InjectRepository(TransportRunStop) private runStopRepo: Repository<TransportRunStop>,
    private readonly transportService: TransportService,
    private readonly dataSource: DataSource,
    private readonly earningService: SuperAgentHandlingEarningService,
  ) {}

  // A raw existence check rather than @InjectRepository(Parcel) -- Parcel's
  // own relation graph (Order, Shipment, User, SuperAgent, ...) is
  // substantial, and this service only ever needs to know "does this
  // parcelId exist", never any of Parcel's own fields/relations. Mirrors
  // this entity's own parcelId-as-plain-column choice: loose coupling
  // across the module boundary, consistent with Shipment.orderId's own
  // established convention.
  private async assertParcelExists(parcelId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.parcel WHERE id = $1', [parcelId]);
    if (!rows.length) throw new NotFoundException('Parcel not found');
  }

  async createAssignment(userId: number, dto: CreateParcelRunAssignmentDto): Promise<ParcelRunAssignment> {
    const provider = await this.transportService.getMyProfile(userId);
    const run = await this.runRepo.findOne({ where: { id: dto.runId, providerId: provider.id } });
    if (!run) throw new NotFoundException('Run not found');

    await this.assertParcelExists(dto.parcelId);

    const loadStop = await this.runStopRepo.findOne({ where: { id: dto.loadRunStopId, runId: run.id } });
    if (!loadStop) throw new BadRequestException("loadRunStopId doesn't belong to the selected Run");
    const unloadStop = await this.runStopRepo.findOne({ where: { id: dto.unloadRunStopId, runId: run.id } });
    if (!unloadStop) throw new BadRequestException("unloadRunStopId doesn't belong to the selected Run");

    // The central invariant: load must come before unload WITHIN this same
    // Run's own ordered itinerary. Comparing TransportRunStop.sequence
    // (immutable once the Run was created) rather than anything on the
    // reusable RouteStop -- this can never drift after the fact.
    if (loadStop.sequence >= unloadStop.sequence) {
      throw new BadRequestException('loadRunStopId must come before unloadRunStopId on this Run');
    }

    // 3S-B1's own established pattern (createAssignment): lock the parcel
    // row first, so two concurrent requests for the SAME parcel fully
    // serialize against each other and against the idempotent-reuse check
    // below -- not re-invented here.
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE', [dto.parcelId]);

      const live = await manager.getRepository(ParcelRunAssignment).findOne({
        where: { parcelId: dto.parcelId },
        order: { id: 'DESC' },
      });
      if (live && ACTIVE_STATUSES.includes(live.status)) {
        if (
          live.runId === run.id &&
          live.loadRunStopId === loadStop.id &&
          live.unloadRunStopId === unloadStop.id
        ) {
          return live; // idempotent retry -- the same request, not a new demand
        }
        throw new ConflictException('This parcel already has an active movement assignment');
      }

      const assignment = manager.getRepository(ParcelRunAssignment).create({
        runId: run.id,
        parcelId: dto.parcelId,
        loadRunStopId: loadStop.id,
        unloadRunStopId: unloadStop.id,
        status: ParcelRunAssignmentStatus.SCHEDULED,
        loadedAt: null,
        unloadedAt: null,
        createdByUserId: userId,
      });
      return manager.getRepository(ParcelRunAssignment).save(assignment);
    });
  }

  private async assertOwnsAssignment(userId: number, assignmentId: number): Promise<ParcelRunAssignment> {
    const provider = await this.transportService.getMyProfile(userId);
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const run = await this.runRepo.findOne({ where: { id: assignment.runId } });
    if (!run || run.providerId !== provider.id) {
      throw new ForbiddenException("You don't have authority over this assignment");
    }
    return assignment;
  }

  // Stage 3S-C4: the one place a load/unload transition writes to the
  // canonical ParcelCustodyEvent ledger. Before this gate, markLoaded/
  // markUnloaded only flipped this row's own `status` column -- pure
  // self-reported state, exactly the kind of claim
  // TransportService.syncParcelFromAssignment already treats as
  // untrustworthy on its own for the OLD TransportAssignment model (it
  // refuses to sync a Parcel to IN_TRANSIT without a real
  // 'transport_provider_collected' custody event backing it up). This
  // closes the same gap here: `assignment.status` alone must never become
  // financial evidence (Issue #62's own invariant #7).
  //
  // Custodian identity is read from the RELEVANT stop's own `superAgentId`
  // (TransportRunStop -- the immutable per-Run snapshot, itself copied from
  // RouteStop at Run-creation time, Stage 3S-C1) -- never inferred from
  // location text. A stop with no Super Agent still gets a real, immutable
  // custody event (the Run's own provider genuinely does take/release
  // physical custody at that leg) -- it simply never claims a Super Agent
  // side of the handoff, so an ordinary geographic stop can never manufacture
  // a fake Super Agent handling event (Issue #62's own invariant #3).
  private buildCustodyTransition(direction: 'load' | 'unload', run: TransportRun, runStop: TransportRunStop | null) {
    const superAgentId = runStop?.superAgentId ?? null;
    return direction === 'load'
      ? {
          fromCustodianType: superAgentId != null ? 'super_agent' : null,
          fromCustodianId: superAgentId,
          toCustodianType: 'transport_provider' as const,
          toCustodianId: run.providerId,
        }
      : {
          // Stage 3S-C6: the provider's own release never directly claims
          // Super Agent receipt anymore, even when the stop names one --
          // that claim now requires the Super Agent's own separate,
          // independently authenticated confirmReceipt() call. See this
          // file's own header comment for why.
          fromCustodianType: 'transport_provider' as const,
          fromCustodianId: run.providerId,
          toCustodianType: null,
          toCustodianId: null,
        };
  }

  // Idempotent, the same pattern this lineage already uses for every other
  // physical-state transition (Stage 3S-B1's updateAssignmentStatus, Stage
  // 3S-B3's acceptQuote): a retry of an already-LOADED assignment returns
  // the same row untouched -- and, since it returns BEFORE reaching the
  // custody insert below, never attempts a second one either; a terminal
  // (unloaded/cancelled) one fails closed. The deterministic operationKey
  // (scoped to this assignment's own id, which is already globally unique)
  // is a belt-and-suspenders DB-level backstop on top of that.
  async markLoaded(context: RoleContext, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      const provider = await this.transportService.getMyProfile(context.userId);
      if (!run || run.providerId !== provider.id) {
        throw new ForbiddenException("You don't have authority over this assignment");
      }
      if (assignment.status === ParcelRunAssignmentStatus.LOADED) return assignment; // idempotent
      if (assignment.status !== ParcelRunAssignmentStatus.SCHEDULED) {
        throw new ConflictException('Only a scheduled assignment can be marked loaded');
      }
      const loadRunStop = await manager.getRepository(TransportRunStop).findOne({ where: { id: assignment.loadRunStopId } });
      const transition = this.buildCustodyTransition('load', run, loadRunStop);
      await manager.getRepository(ParcelCustodyEvent).insert({
        parcelId: assignment.parcelId,
        eventKind: 'parcel_run_loaded',
        operationKey: `parcel-run-loaded:${assignment.id}`,
        ...transition,
        actorSource: 'account_role',
        actorUserId: context.userId,
        actorAccountRoleId: context.accountRoleId,
        actorRoleType: context.roleType,
        actorWorkspaceId: context.workspaceId ?? null,
        actorProviderId: null,
        hubId: transition.fromCustodianId,
        assignmentId: assignment.id,
        assignmentType: 'parcel_run_assignment',
        evidenceRef: null,
      });
      assignment.status = ParcelRunAssignmentStatus.LOADED;
      assignment.loadedAt = new Date();
      return repo.save(assignment);
    });
  }

  async markUnloaded(context: RoleContext, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      const provider = await this.transportService.getMyProfile(context.userId);
      if (!run || run.providerId !== provider.id) {
        throw new ForbiddenException("You don't have authority over this assignment");
      }
      if (assignment.status === ParcelRunAssignmentStatus.UNLOADED) return assignment; // idempotent
      if (assignment.status !== ParcelRunAssignmentStatus.LOADED) {
        throw new ConflictException('Only a loaded assignment can be marked unloaded');
      }
      const unloadRunStop = await manager.getRepository(TransportRunStop).findOne({ where: { id: assignment.unloadRunStopId } });
      const transition = this.buildCustodyTransition('unload', run, unloadRunStop);
      await manager.getRepository(ParcelCustodyEvent).insert({
        parcelId: assignment.parcelId,
        eventKind: 'parcel_run_unloaded',
        operationKey: `parcel-run-unloaded:${assignment.id}`,
        ...transition,
        actorSource: 'account_role',
        actorUserId: context.userId,
        actorAccountRoleId: context.accountRoleId,
        actorRoleType: context.roleType,
        actorWorkspaceId: context.workspaceId ?? null,
        actorProviderId: null,
        // Informational only -- which hub is EXPECTED at this stop, for
        // audit/traceability. Never asserts they've confirmed anything;
        // toCustodianType/Id above stay null/pending regardless.
        hubId: unloadRunStop?.superAgentId ?? null,
        assignmentId: assignment.id,
        assignmentType: 'parcel_run_assignment',
        evidenceRef: null,
      });
      assignment.status = ParcelRunAssignmentStatus.UNLOADED;
      assignment.unloadedAt = new Date();
      return repo.save(assignment);
    });
  }

  private async assertSuperAgentAuthority(userId: number, superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id, "userId" FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new NotFoundException('Super Agent not found');
    if (rows[0].userId !== userId) {
      throw new ForbiddenException("You don't have authority to confirm receipt for this Super Agent");
    }
  }

  // Stage 3S-C6: the RECEIVING Super Agent's own confirmation -- the real
  // qualifying event, independent of the provider's own markUnloaded claim.
  // Only reachable from UNLOADED, and only when the unload stop names a real
  // Super Agent (there is no one to confirm receipt at an ordinary
  // waypoint). Idempotent on an already-RECEIVED assignment.
  //
  // The custody write + status transition are one atomic unit (the same
  // transaction); automatic commission generation is a deliberately
  // SEPARATE, best-effort side effect performed AFTER that transaction
  // commits -- mirrors TransportService.syncParcelFromAssignment's own
  // established "never let a downstream derivation block the primary fact"
  // convention. A missing rate configuration or any earning-side failure
  // must never prevent a real physical receipt confirmation from succeeding;
  // it is retried by the exact same idempotent, custodyEventId-keyed
  // service if invoked again.
  async confirmReceipt(context: RoleContext, assignmentId: number): Promise<ParcelRunAssignment> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      if (assignment.status === ParcelRunAssignmentStatus.RECEIVED) {
        return { assignment, custodyEventId: null as number | null }; // idempotent
      }
      if (assignment.status !== ParcelRunAssignmentStatus.UNLOADED) {
        throw new ConflictException('Only an unloaded assignment can have its receipt confirmed');
      }
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      if (!run) throw new NotFoundException('Run not found');
      const unloadRunStop = await manager.getRepository(TransportRunStop).findOne({ where: { id: assignment.unloadRunStopId } });
      const superAgentId = unloadRunStop?.superAgentId ?? null;
      if (superAgentId == null) {
        throw new BadRequestException("This assignment's unload stop has no Super Agent to confirm receipt");
      }
      await this.assertSuperAgentAuthority(context.userId, superAgentId);

      const custody = await manager.getRepository(ParcelCustodyEvent).save(
        manager.getRepository(ParcelCustodyEvent).create({
          parcelId: assignment.parcelId,
          eventKind: 'parcel_run_received',
          operationKey: `parcel-run-received:${assignment.id}`,
          fromCustodianType: 'transport_provider',
          fromCustodianId: run.providerId,
          toCustodianType: 'super_agent',
          toCustodianId: superAgentId,
          actorSource: 'account_role',
          actorUserId: context.userId,
          actorAccountRoleId: context.accountRoleId,
          actorRoleType: context.roleType,
          actorWorkspaceId: context.workspaceId ?? null,
          actorProviderId: null,
          hubId: superAgentId,
          assignmentId: assignment.id,
          assignmentType: 'parcel_run_assignment',
          evidenceRef: null,
        } as any),
      );

      assignment.status = ParcelRunAssignmentStatus.RECEIVED;
      assignment.receivedAt = new Date();
      const saved = await repo.save(assignment);
      return { assignment: saved, custodyEventId: (custody as any).id as number };
    });

    if (result.custodyEventId != null) {
      try {
        await this.earningService.recordEarningForCustodyEvent(result.custodyEventId, { userId: context.userId });
      } catch {
        /* best-effort -- the physical receipt confirmation itself already succeeded and committed */
      }
    }
    return result.assignment;
  }

  // Only a still-SCHEDULED (not yet physically loaded) assignment can be
  // retracted this way -- once LOADED, cancellation is out of scope for
  // this foundation gate (it would need real custody/exception handling,
  // explicitly excluded).
  async cancelAssignment(userId: number, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      const provider = await this.transportService.getMyProfile(userId);
      if (!run || run.providerId !== provider.id) {
        throw new ForbiddenException("You don't have authority over this assignment");
      }
      if (assignment.status === ParcelRunAssignmentStatus.CANCELLED) return assignment; // idempotent
      if (assignment.status !== ParcelRunAssignmentStatus.SCHEDULED) {
        throw new ConflictException('Only a scheduled assignment can be cancelled');
      }
      assignment.status = ParcelRunAssignmentStatus.CANCELLED;
      return repo.save(assignment);
    });
  }

  async getAssignmentsForRun(runId: number): Promise<ParcelRunAssignment[]> {
    return this.assignmentRepo.find({ where: { runId }, order: { id: 'ASC' } });
  }

  async getActiveAssignmentForParcel(parcelId: number): Promise<ParcelRunAssignment | null> {
    const rows = await this.assignmentRepo.find({ where: { parcelId }, order: { id: 'DESC' } });
    return rows.find((a) => ACTIVE_STATUSES.includes(a.status)) ?? null;
  }
}
