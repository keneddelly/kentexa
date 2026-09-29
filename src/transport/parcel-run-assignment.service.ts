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

  // Idempotent, the same pattern this lineage already uses for every other
  // physical-state transition (Stage 3S-B1's updateAssignmentStatus, Stage
  // 3S-B3's acceptQuote): a retry of an already-LOADED assignment returns
  // the same row untouched; a terminal (unloaded/cancelled) one fails closed.
  async markLoaded(userId: number, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      const provider = await this.transportService.getMyProfile(userId);
      if (!run || run.providerId !== provider.id) {
        throw new ForbiddenException("You don't have authority over this assignment");
      }
      if (assignment.status === ParcelRunAssignmentStatus.LOADED) return assignment; // idempotent
      if (assignment.status !== ParcelRunAssignmentStatus.SCHEDULED) {
        throw new ConflictException('Only a scheduled assignment can be marked loaded');
      }
      assignment.status = ParcelRunAssignmentStatus.LOADED;
      assignment.loadedAt = new Date();
      return repo.save(assignment);
    });
  }

  async markUnloaded(userId: number, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      const provider = await this.transportService.getMyProfile(userId);
      if (!run || run.providerId !== provider.id) {
        throw new ForbiddenException("You don't have authority over this assignment");
      }
      if (assignment.status === ParcelRunAssignmentStatus.UNLOADED) return assignment; // idempotent
      if (assignment.status !== ParcelRunAssignmentStatus.LOADED) {
        throw new ConflictException('Only a loaded assignment can be marked unloaded');
      }
      assignment.status = ParcelRunAssignmentStatus.UNLOADED;
      assignment.unloadedAt = new Date();
      return repo.save(assignment);
    });
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
