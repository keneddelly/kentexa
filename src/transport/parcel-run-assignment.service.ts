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
 *
 * Stage 3S-C6 second correction: three further fixes.
 *   1. One shared lock ordering for every transition/allocation touching a
 *      parcel's assignment chain -- the Parcel row is now locked FIRST in
 *      markLoaded/markUnloaded/confirmReceipt/cancelAssignment too, exactly
 *      like createAssignment's own established pattern, so none of them can
 *      ever race a concurrent createAssignment (or each other) for the SAME
 *      parcel.
 *   2. The "does this parcel already have a blocking assignment" check
 *      (findBlockingAssignment) now scans EVERY assignment row for the
 *      parcel, not just the latest one -- an older still-unconfirmed
 *      UNLOADED-at-a-hub row can no longer be hidden by a newer row
 *      (including any inconsistent historical data).
 *   3. confirmReceipt() now verifies the calling Super Agent's authority
 *      BEFORE its idempotent early-return on an already-RECEIVED assignment
 *      -- an unrelated authenticated user could otherwise get a successful
 *      no-op "confirmation" for a receipt they have no authority over.
 *   Automatic commission generation is also now a real transactional-
 *   outbox obligation (SuperAgentHandlingEarningObligationService), written
 *   in the SAME transaction as the qualifying custody event, rather than a
 *   bare post-commit try/catch -- see that service's own header comment.
 *
 * Stage 3S-C8 (Van Pilot Operational Integration): two additive seams, both
 * purely integration -- no change to any C1-C7 invariant above.
 *
 *   1. Vehicle capacity (createAssignment): before this gate,
 *      Vehicle.parcelCapacity/weightCapacityKg were validated as
 *      non-negative on input and never read again. assertRunCapacity() is
 *      the first real enforcement -- a no-op whenever the Run has no
 *      vehicle assigned yet, or a dimension is left null ("not configured",
 *      never treated as zero). volumeCapacityM3 is deliberately never
 *      enforced: Parcel carries no per-parcel volume dimension to compare
 *      against, and pretending otherwise would be reporting an exactness
 *      the data cannot support.
 *   2. confirmReceipt now ALSO emits the pre-existing, already-consumed
 *      'destination_hub_received' custody signal (and the matching
 *      ParcelStatus.ARRIVED_AT_HUB transition + ParcelTracking row) when
 *      the receiving Super Agent IS the parcel's actual destination -- the
 *      exact same signal super-agents.service.ts's own
 *      recordDestinationHubReceipt() already produces for the legacy
 *      carrier-delivery path, and the exact signal
 *      lockedPickupParcel/lockedAgentHandoffParcel already hard-require as
 *      the parcel's LATEST custody event before self-pickup or Agent
 *      last-mile handoff can begin. Before this, a Run-delivered parcel's
 *      own Parcel.status never changed at all, so it could never reach
 *      either existing completion path. This makes a Run-delivered parcel
 *      indistinguishable, at those two existing gates, from a legacy
 *      carrier-delivered one -- "route into an existing legitimate
 *      completion path" by reusing its own canonical signal, not inventing
 *      a parallel one. An INTERMEDIATE transit hub (destinationSuperAgent
 *      already set to a DIFFERENT hub) never gets this signal; the parcel
 *      instead becomes eligible for a new ParcelRunAssignment leg via the
 *      existing findBlockingAssignment rule once RECEIVED -- multi-leg
 *      journeys need nothing further.
 */
import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { TransportRun } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle } from './entities/vehicle.entity';
import { ParcelRunAssignment, ParcelRunAssignmentStatus } from './entities/parcel-run-assignment.entity';
import { TransportService } from './transport.service';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
// A plain TS enum import only -- NOT the Parcel/ParcelTracking entity
// classes. Mirrors this file's own established "plain parcelId column, raw
// SQL, never @InjectRepository(Parcel)" convention (see assertParcelExists'
// own comment): Parcel's full relation graph (Order, Shipment, User,
// SuperAgent, ...) is exactly what the real-Postgres test suite for this
// service deliberately avoids registering, via a bare stub `parcel` table.
// Using the ORM repository for Parcel/ParcelTracking here would silently
// require that whole graph wherever this service is exercised.
import { ParcelStatus } from '../super-agents/entities/parcel.entity';
import { RoleContext } from '../role-context/role-context.types';
import { SuperAgentHandlingEarningObligationService } from '../super-agent-commission/super-agent-handling-earning-obligation.service';

const UNIQUE_VIOLATION = '23505';

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
    private readonly obligationService: SuperAgentHandlingEarningObligationService,
  ) {}

  // Stage 3S-C6 second correction: ONE shared lock ordering across every
  // transition/allocation touching a parcel's assignment chain -- always the
  // Parcel row first, exactly like createAssignment's own established
  // pattern. Callers that don't yet know the parcelId (every method keyed by
  // assignmentId) do an unlocked lookup first purely to discover it, then
  // acquire this lock, then re-read the assignment WITH its own row lock --
  // the second read is the authoritative one.
  private async lockParcel(manager: EntityManager, parcelId: number): Promise<void> {
    await manager.query('SELECT id FROM public.parcel WHERE id=$1 FOR UPDATE', [parcelId]);
  }

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

  // Stage 3S-C6 correction: UNLOADED is only a truly FREE state when the
  // unload stop named no Super Agent at all -- an ordinary waypoint, where
  // there is no one left to confirm anything and the next leg genuinely is a
  // brand-new movement. When the unload stop DOES name a real Super Agent,
  // UNLOADED means "the provider says they released it here, but the
  // receiving Super Agent has not yet confirmed physical receipt" -- the
  // parcel's whereabouts are still an open question, so it must stay pinned
  // to this assignment until confirmReceipt() (or a future exception-
  // handling path, out of scope here) resolves it. Without this, a parcel
  // could be reassigned to a brand-new Run while the FIRST Run's own
  // Super Agent receipt is still outstanding -- two conflicting custody
  // stories for the same parcel at once.
  private async hasUnconfirmedSuperAgentReceipt(
    assignment: Pick<ParcelRunAssignment, 'status' | 'unloadRunStopId'>,
    runStopRepo: Repository<TransportRunStop> = this.runStopRepo,
  ): Promise<boolean> {
    if (assignment.status !== ParcelRunAssignmentStatus.UNLOADED) return false;
    const unloadRunStop = await runStopRepo.findOne({ where: { id: assignment.unloadRunStopId } });
    return (unloadRunStop?.superAgentId ?? null) != null;
  }

  // Stage 3S-C6 second correction: scans EVERY assignment row for the
  // parcel (not just the latest one) for the first that's either genuinely
  // in-flight (ACTIVE_STATUSES) or UNLOADED-at-a-hub with an unconfirmed
  // Super Agent receipt -- so an older blocking row can never be hidden by
  // a newer, terminal one. Used identically by createAssignment's own
  // conflict/idempotent-retry check and by getActiveAssignmentForParcel.
  private async findBlockingAssignment(
    parcelId: number,
    assignmentRepo: Repository<ParcelRunAssignment> = this.assignmentRepo,
    runStopRepo: Repository<TransportRunStop> = this.runStopRepo,
  ): Promise<ParcelRunAssignment | null> {
    const rows = await assignmentRepo.find({ where: { parcelId }, order: { id: 'DESC' } });
    for (const a of rows) {
      if (ACTIVE_STATUSES.includes(a.status)) return a;
      if (await this.hasUnconfirmedSuperAgentReceipt(a, runStopRepo)) return a;
    }
    return null;
  }

  // Van Pilot Readiness: a provider may schedule a parcel only from an
  // explicit one-use movement authority. Shipment provider selection can
  // mint that authority server-side; hub/walk-in/multi-leg parcels require
  // an explicit current-holder Super Agent release.
  async tenderFromSuperAgent(
    ctx: RoleContext,
    dto: { parcelId: number; transportProviderId: number; runId: number; loadRunStopId: number; idempotencyKey: string; expiresAt?: string | null },
  ): Promise<any> {
    if (ctx.roleType !== 'super_agent' || ctx.profileId == null) throw new ForbiddenException('Super Agent role required');
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');

    return this.dataSource.transaction(async (manager) => {
      await this.lockParcel(manager, dto.parcelId);
      const latest = await manager.query(
        `SELECT "toCustodianType", "toCustodianId" FROM public.parcel_custody_event
          WHERE "parcelId"=$1 ORDER BY "recordedAt" DESC, id DESC LIMIT 1`,
        [dto.parcelId],
      );
      if (!latest.length || latest[0].toCustodianType !== 'super_agent' || Number(latest[0].toCustodianId) !== Number(ctx.profileId)) {
        throw new NotFoundException('Parcel not found');
      }
      const runRows = await manager.query(
        `SELECT r.id, r."providerId", s."superAgentId"
           FROM public.transport_run r
           JOIN public.transport_run_stop s ON s.id=$2 AND s."runId"=r.id
          WHERE r.id=$1 AND r."providerId"=$3`,
        [dto.runId, dto.loadRunStopId, dto.transportProviderId],
      );
      if (!runRows.length || Number(runRows[0].superAgentId) !== Number(ctx.profileId)) {
        throw new NotFoundException('Run not found');
      }
      const existing = await manager.query(
        `SELECT * FROM public.parcel_movement_tender WHERE "idempotencyKey"=$1`,
        [dto.idempotencyKey.trim()],
      );
      if (existing.length) {
        const e=existing[0];
        if (Number(e.parcelId)!==dto.parcelId || Number(e.transportProviderId)!==dto.transportProviderId ||
            Number(e.runId)!==dto.runId || Number(e.loadRunStopId)!==dto.loadRunStopId ||
            Number(e.releasingSuperAgentId)!==Number(ctx.profileId)) {
          throw new ConflictException('idempotencyKey was already used for a different movement tender');
        }
        return e;
      }
      const rows = await manager.query(
        `INSERT INTO public.parcel_movement_tender
          ("parcelId","transportProviderId","runId","loadRunStopId","releasingSuperAgentId","source","status",
           "issuedByUserId","issuedByRoleType","idempotencyKey","expiresAt")
         VALUES ($1,$2,$3,$4,$5,'super_agent_release','open',$6,'super_agent',$7,$8)
         RETURNING *`,
        [dto.parcelId,dto.transportProviderId,dto.runId,dto.loadRunStopId,ctx.profileId,ctx.userId,dto.idempotencyKey.trim(),dto.expiresAt ?? null],
      );
      return rows[0];
    });
  }

  private async resolveMovementTender(
    manager: EntityManager,
    userId: number,
    providerId: number,
    dto: CreateParcelRunAssignmentDto,
    loadStop: TransportRunStop,
  ): Promise<any> {
    // Lock an existing explicit tender first. SKIP no rows: assignment must
    // serialize on the tender and fail closed rather than infer authority.
    let rows = await manager.query(
      `SELECT * FROM public.parcel_movement_tender
        WHERE "parcelId"=$1 AND "transportProviderId"=$2
          AND ("runId" IS NULL OR "runId"=$3)
          AND ("loadRunStopId" IS NULL OR "loadRunStopId"=$4)
          AND status='open' AND ("expiresAt" IS NULL OR "expiresAt">now())
        ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [dto.parcelId,providerId,dto.runId,dto.loadRunStopId],
    );
    if (rows.length) return rows[0];

    // Direct-booking authority is derived only from persisted canonical
    // Parcel -> Shipment.providerId. Client input cannot assert it.
    const booked = await manager.query(
      `SELECT p."shipmentId" FROM public.parcel p
        JOIN public.shipment s ON s.id=p."shipmentId"
       WHERE p.id=$1 AND s."providerId"=$2 LIMIT 1`,
      [dto.parcelId,providerId],
    );
    if (booked.length) {
      const key=`shipment-provider:${booked[0].shipmentId}:parcel:${dto.parcelId}:provider:${providerId}`;
      rows = await manager.query(
        `INSERT INTO public.parcel_movement_tender
          ("parcelId","transportProviderId","runId","loadRunStopId","source","status",
           "issuedByUserId","issuedByRoleType","idempotencyKey")
         VALUES ($1,$2,$3,$4,'shipment_provider_booking','open',$5,'transport_provider',$6)
         ON CONFLICT ("idempotencyKey") DO UPDATE SET "idempotencyKey"=EXCLUDED."idempotencyKey"
         RETURNING *`,
        [dto.parcelId,providerId,dto.runId,dto.loadRunStopId,userId,key],
      );
      return rows[0];
    }
    throw new ForbiddenException('No carrier movement authority exists for this parcel');
  }

  async listOpenTendersForProvider(userId: number): Promise<any[]> {
    const provider = await this.transportService.getMyProfile(userId);
    return this.dataSource.query(
      `SELECT t.id AS "tenderId", t."parcelId", t."runId", t."loadRunStopId",
              t."releasingSuperAgentId", t.source, t."expiresAt", t."createdAt",
              p."trackingNumber", p."destinationCity", p."recipientName", p."buyerPhone",
              p."weightKg", p.description,
              ls."locationLabel" AS "loadLocation",
              us.id AS "unloadRunStopId", us."locationLabel" AS "unloadLocation",
              r."scheduledDeparture"
         FROM public.parcel_movement_tender t
         JOIN public.parcel p ON p.id=t."parcelId"
         JOIN public.transport_run r ON r.id=t."runId" AND r."providerId"=t."transportProviderId"
         JOIN public.transport_run_stop ls ON ls.id=t."loadRunStopId" AND ls."runId"=r.id
         JOIN LATERAL (
           SELECT s.id, s."locationLabel"
             FROM public.transport_run_stop s
            WHERE s."runId"=r.id
              AND s.sequence > ls.sequence
              AND (
                (p."destinationSuperAgentId" IS NOT NULL AND s."superAgentId"=p."destinationSuperAgentId")
                OR lower(s."locationLabel") LIKE lower('%' || p."destinationCity" || '%')
              )
            ORDER BY s.sequence ASC LIMIT 1
         ) us ON true
        WHERE t."transportProviderId"=$1
          AND t.status='open'
          AND (t."expiresAt" IS NULL OR t."expiresAt">now())
          AND r.status IN ('scheduled','open')
        ORDER BY r."scheduledDeparture" ASC, t.id ASC`,
      [provider.id],
    );
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

    // L5 Journey -> movement authority. For Journey-backed parcels, the
    // committed TRANSPORT leg is the commercial promise. A provider cannot
    // substitute a different provider/route/run after quote + shipment
    // commitment. Legacy parcels without a JourneySelection retain the
    // existing movement-tender authority path.
    const journeyRows = await this.dataSource.query(
      `SELECT p."journeySelectionId", j.status
         FROM public.parcel p
         LEFT JOIN public.journey_selection j ON j.id=p."journeySelectionId"
        WHERE p.id=$1`,
      [dto.parcelId],
    );
    const journeyId = journeyRows[0]?.journeySelectionId ?? null;
    if (journeyId != null) {
      if (journeyRows[0]?.status !== 'committed') {
        throw new ConflictException('Parcel journey is not commercially committed');
      }
      const legs = await this.dataSource.query(
        `SELECT "providerId","routeId","runId","loadRouteStopId","unloadRouteStopId"
           FROM public.journey_leg
          WHERE "journeySelectionId"=$1 AND type='transport'
          ORDER BY sequence ASC`,
        [journeyId],
      );
      const matchingLeg = legs.find((leg: any) =>
        Number(leg.providerId) === Number(provider.id) &&
        Number(leg.routeId) === Number(run.routeId) &&
        (leg.runId == null || Number(leg.runId) === Number(run.id))
      );
      if (!matchingLeg) {
        throw new ForbiddenException('Run is not authorized by the committed parcel journey');
      }
    }

    // 3S-B1's own established pattern (createAssignment): lock the parcel
    // row first, so two concurrent requests for the SAME parcel fully
    // serialize against each other and against the idempotent-reuse check
    // below -- not re-invented here.
    return this.dataSource.transaction(async (manager) => {
      await this.lockParcel(manager, dto.parcelId);
      // Stage 3S-C8: serializes concurrent createAssignment calls for the
      // SAME Run, so two parcels racing for the last unit of capacity can
      // never both pass assertRunCapacity's own count before either commits.
      await manager.query('SELECT id FROM public.transport_run WHERE id = $1 FOR UPDATE', [run.id]);

      const live = await this.findBlockingAssignment(
        dto.parcelId,
        manager.getRepository(ParcelRunAssignment),
        manager.getRepository(TransportRunStop),
      );
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
      if (live) {
        throw new ConflictException(
          "This parcel's prior Super Agent receipt has not yet been confirmed",
        );
      }

      const tender = await this.resolveMovementTender(manager, userId, provider.id, dto, loadStop);
      if (tender.source === 'super_agent_release' && Number(tender.releasingSuperAgentId) !== Number(loadStop.superAgentId)) {
        throw new ForbiddenException('Movement tender does not authorize this load stop');
      }
      // A Run stop that names a Super Agent is a physical-hub load claim,
      // not merely a routing label. Require the immutable latest custody
      // evidence to show that exact hub currently holds the parcel.
      if (loadStop.superAgentId != null) {
        const latestCustody = await manager.query(
          `SELECT "toCustodianType", "toCustodianId"
             FROM public.parcel_custody_event
            WHERE "parcelId"=$1
            ORDER BY "recordedAt" DESC, id DESC LIMIT 1`,
          [dto.parcelId],
        );
        if (!latestCustody.length || latestCustody[0].toCustodianType !== 'super_agent' ||
            Number(latestCustody[0].toCustodianId) !== Number(loadStop.superAgentId)) {
          throw new ForbiddenException('Parcel is not in custody of this Run load hub');
        }
      }

      await this.assertRunCapacity(manager, run, dto.parcelId);

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
      const saved = await manager.getRepository(ParcelRunAssignment).save(assignment);
      const consumed = await manager.query(
        `UPDATE public.parcel_movement_tender
            SET status='consumed', "consumedByParcelRunAssignmentId"=$2, "consumedAt"=now()
          WHERE id=$1 AND status='open'
          RETURNING id`,
        [tender.id,saved.id],
      );
      if (!consumed.length) throw new ConflictException('Movement tender is no longer available');
      return saved;
    });
  }

  // Stage 3S-C8: a no-op whenever the Run has no vehicle assigned yet --
  // capacity cannot be meaningfully enforced before a vehicle is known, and
  // a Run scheduled ahead of that decision must still accept assignments
  // (TransportRun.vehicleId has always been nullable for exactly this
  // reason -- see its own entity comment). Each dimension is checked
  // independently and only when the Vehicle itself has that dimension
  // configured; a null dimension means "not configured," never "zero."
  private async assertRunCapacity(manager: EntityManager, run: TransportRun, newParcelId: number): Promise<void> {
    if (run.vehicleId == null) return;
    const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: run.vehicleId } });
    if (!vehicle) return; // defensive -- FK guarantees this in practice
    if (vehicle.parcelCapacity == null && vehicle.weightCapacityKg == null) return;

    const activeAssignments = await manager.getRepository(ParcelRunAssignment).find({
      where: { runId: run.id, status: In(ACTIVE_STATUSES) },
    });

    if (vehicle.parcelCapacity != null && activeAssignments.length >= vehicle.parcelCapacity) {
      throw new ConflictException(
        `This Run's assigned vehicle is at its parcel-count capacity (${vehicle.parcelCapacity})`,
      );
    }

    if (vehicle.weightCapacityKg != null) {
      const parcelIds = activeAssignments.map((a) => a.parcelId);
      const sumRows = await manager.query(
        `SELECT COALESCE(SUM("weightKg"), 0) AS total FROM public.parcel WHERE id = ANY($1::int[])`,
        [parcelIds],
      );
      const currentWeight = Number(sumRows[0].total);
      const [newParcelRow] = await manager.query(`SELECT "weightKg" FROM public.parcel WHERE id = $1`, [newParcelId]);
      // An unweighed parcel contributes 0 to the running total -- this
      // dimension genuinely cannot be enforced for it ("do not pretend
      // weight enforcement is exact if Parcel currently lacks trustworthy
      // dimensions"), so it is admitted rather than wrongly blocked.
      const newWeight = Number(newParcelRow?.weightKg ?? 0);
      if (currentWeight + newWeight > Number(vehicle.weightCapacityKg)) {
        throw new ConflictException(
          `This Run's assigned vehicle would exceed its weight capacity (${vehicle.weightCapacityKg}kg)`,
        );
      }
    }
    // volumeCapacityM3 is deliberately never checked here -- Parcel has no
    // per-parcel volume column to compare against (see this file's own
    // header comment).
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
      const preview = await repo.findOne({ where: { id: assignmentId } });
      if (!preview) throw new NotFoundException('Assignment not found');
      await this.lockParcel(manager, preview.parcelId);
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
        evidenceRef: `parcel_run_assignment:${assignment.id}`,
      });
      // Stage 3S-C8: the customer-facing milestone this physical load
      // produces -- ParcelTracking is the existing, separate projection
      // trackParcel()/trackByOrderId() already read (never ParcelCustodyEvent
      // directly); a Van-pilot leg was previously invisible to it entirely.
      // Raw SQL, not the ORM repository -- see this file's own import
      // comment for why.
      await manager.query(
        `INSERT INTO public.parcel_tracking
          ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerLocation", "handlerType")
         VALUES ($1, $2, $3, $4, NULL, NULL, $5, 'transport_provider')`,
        [
          assignment.parcelId, ParcelStatus.IN_TRANSIT, loadRunStop?.locationLabel ?? null,
          `On board -- departed ${loadRunStop?.locationLabel ?? 'the load stop'}`, loadRunStop?.locationLabel ?? null,
        ],
      );
      assignment.status = ParcelRunAssignmentStatus.LOADED;
      assignment.loadedAt = new Date();
      return repo.save(assignment);
    });
  }

  async markUnloaded(context: RoleContext, assignmentId: number): Promise<ParcelRunAssignment> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const preview = await repo.findOne({ where: { id: assignmentId } });
      if (!preview) throw new NotFoundException('Assignment not found');
      await this.lockParcel(manager, preview.parcelId);
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
        evidenceRef: `parcel_run_assignment:${assignment.id}`,
      });
      // Stage 3S-C8: customer-facing milestone -- "arrived/unloaded (provider
      // claim)," deliberately distinct from the LATER, Super-Agent-confirmed
      // "received at destination desk/hub" milestone confirmReceipt writes
      // (see that method's own comment) -- the two remain separate, real
      // events even in the tracking projection, mirroring ParcelCustodyEvent
      // itself never conflating a provider's claim with independent receipt.
      // Raw SQL, not the ORM repository -- see this file's own import
      // comment for why.
      await manager.query(
        `INSERT INTO public.parcel_tracking
          ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerLocation", "handlerType")
         VALUES ($1, $2, $3, $4, NULL, NULL, $5, 'transport_provider')`,
        [
          assignment.parcelId, ParcelStatus.TRANSFERRED_HUB, unloadRunStop?.locationLabel ?? null,
          `Off-loaded by the carrier at ${unloadRunStop?.locationLabel ?? 'the unload stop'} -- awaiting hub confirmation`,
          unloadRunStop?.locationLabel ?? null,
        ],
      );
      assignment.status = ParcelRunAssignmentStatus.UNLOADED;
      assignment.unloadedAt = new Date();
      return repo.save(assignment);
    });
  }

  private async assertSuperAgentAuthority(
    userId: number,
    superAgentId: number,
  ): Promise<{ id: number; businessName: string; phone: string | null; address: string | null; city: string }> {
    const rows = await this.dataSource.query(
      'SELECT id, "userId", "businessName", phone, address, city FROM public.super_agent WHERE id = $1',
      [superAgentId],
    );
    if (!rows.length) throw new NotFoundException('Super Agent not found');
    if (rows[0].userId !== userId) {
      throw new ForbiddenException("You don't have authority to confirm receipt for this Super Agent");
    }
    return rows[0];
  }

  // Stage 3S-C6: the RECEIVING Super Agent's own confirmation -- the real
  // qualifying event, independent of the provider's own markUnloaded claim.
  // Only reachable from UNLOADED, and only when the unload stop names a real
  // Super Agent (there is no one to confirm receipt at an ordinary
  // waypoint). Idempotent on an already-RECEIVED assignment -- and authority
  // is verified even on that idempotent path (Stage 3S-C6 second
  // correction), since an unrelated caller must never get a successful
  // no-op confirmation just because the receipt already happened.
  //
  // The custody write, the transactional-outbox earning obligation, and the
  // status transition are one atomic unit (the same transaction) -- see
  // SuperAgentHandlingEarningObligation's own header comment. Actually
  // computing the earning is a deliberately SEPARATE, best-effort step
  // performed AFTER that transaction commits -- mirrors TransportService.
  // syncParcelFromAssignment's own established "never let a downstream
  // derivation block the primary fact" convention. A missing rate
  // configuration or any earning-side failure must never prevent a real
  // physical receipt confirmation from succeeding; unlike a bare try/catch,
  // durability of the RETRY here no longer depends on this post-commit step
  // succeeding at anything at all -- the obligation row already committed.
  async confirmReceipt(context: RoleContext, assignmentId: number): Promise<ParcelRunAssignment> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ParcelRunAssignment);
      const preview = await repo.findOne({ where: { id: assignmentId } });
      if (!preview) throw new NotFoundException('Assignment not found');
      await this.lockParcel(manager, preview.parcelId);
      const assignment = await repo.findOne({ where: { id: assignmentId }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Assignment not found');

      // The target Super Agent is determined by the unload stop, which is
      // fixed regardless of the assignment's current status -- so authority
      // can, and must, be verified before anything else is revealed,
      // including the idempotent RECEIVED short-circuit below. Otherwise an
      // unrelated authenticated user could get a successful no-op
      // "confirmation" for a receipt they have no authority over, merely
      // because it happened to already be RECEIVED.
      const unloadRunStop = await manager.getRepository(TransportRunStop).findOne({ where: { id: assignment.unloadRunStopId } });
      const superAgentId = unloadRunStop?.superAgentId ?? null;
      if (superAgentId == null) {
        throw new BadRequestException("This assignment's unload stop has no Super Agent to confirm receipt");
      }
      const hub = await this.assertSuperAgentAuthority(context.userId, superAgentId);

      if (assignment.status === ParcelRunAssignmentStatus.RECEIVED) {
        return { assignment, custodyEventId: null as number | null, obligationId: null as number | null }; // idempotent
      }
      if (assignment.status !== ParcelRunAssignmentStatus.UNLOADED) {
        throw new ConflictException('Only an unloaded assignment can have its receipt confirmed');
      }
      const run = await manager.getRepository(TransportRun).findOne({ where: { id: assignment.runId } });
      if (!run) throw new NotFoundException('Run not found');

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
          // Stage 3S-C6 second correction: the proven physical-handoff
          // identity SuperAgentHandlingEarning's own cross-pathway dedup now
          // keys on -- see that entity's own header comment.
          evidenceRef: `parcel_run_assignment:${assignment.id}`,
        } as any),
      );

      // Stage 3S-C6 second correction: a durable transactional-outbox
      // obligation is written in this SAME transaction as the qualifying
      // custody event and the RECEIVED status flip -- so the physical
      // receipt can only ever commit together with proof that an earning is
      // owed for it. See SuperAgentHandlingEarningObligation's own header
      // comment; actually computing the earning happens after commit, as a
      // separate, retryable step against this row.
      const obligation = await this.obligationService.createObligation(manager, {
        custodyEventId: (custody as any).id as number,
        parcelId: assignment.parcelId,
        superAgentId,
      });

      // Stage 3S-C8: if this Super Agent IS (or, per the pre-existing
      // auto-set convention recordDestinationHubReceipt already uses,
      // BECOMES) the parcel's actual destination, emit the same canonical
      // "destination hub received" signal the legacy carrier-delivery path
      // already produces -- see this file's own header comment for exactly
      // why. An intermediate transit hub (destinationSuperAgent already set
      // to someone else) gets no such signal; the parcel instead becomes
      // eligible for a new leg via findBlockingAssignment once RECEIVED.
      // Raw SQL throughout -- see this file's own import comment for why
      // Parcel/ParcelTracking are never resolved through the ORM here.
      const [parcelRow] = await manager.query(
        `SELECT id, "arrivedAtHubTime", "destinationSuperAgentId" FROM public.parcel WHERE id = $1`,
        [assignment.parcelId],
      );
      const isFinalDestination =
        !!parcelRow && (parcelRow.destinationSuperAgentId == null || parcelRow.destinationSuperAgentId === superAgentId);
      if (parcelRow && isFinalDestination) {
        // SAVEPOINT: in the rare case this exact parcel+hub combination was
        // already recorded (e.g. a second Run assignment terminating at the
        // same hub), the operationKey unique constraint correctly refuses a
        // duplicate -- treated as a harmless no-op rather than aborting the
        // whole confirmReceipt transaction, the same recovery technique this
        // lineage already established (Stage 3S-C6 third correction).
        await manager.query('SAVEPOINT before_destination_hub_received');
        try {
          await manager.getRepository(ParcelCustodyEvent).insert({
            parcelId: assignment.parcelId,
            eventKind: 'destination_hub_received',
            operationKey: `destination-hub-received:${superAgentId}`,
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
          });
        } catch (error: any) {
          if (error?.code !== UNIQUE_VIOLATION) throw error;
          await manager.query('ROLLBACK TO SAVEPOINT before_destination_hub_received');
        }
        await manager.query(
          `UPDATE public.parcel
              SET status = $1,
                  "arrivedAtHubTime" = COALESCE("arrivedAtHubTime", $2),
                  "destinationSuperAgentId" = COALESCE("destinationSuperAgentId", $3)
            WHERE id = $4`,
          [ParcelStatus.ARRIVED_AT_HUB, new Date(), superAgentId, parcelRow.id],
        );
        await manager.query(
          `INSERT INTO public.parcel_tracking
            ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerLocation", "handlerType")
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'super_agent')`,
          [
            parcelRow.id, ParcelStatus.ARRIVED_AT_HUB, hub.city, `Received at ${hub.businessName} via Run #${run.id}`,
            hub.businessName, hub.phone ?? null, hub.address || hub.city,
          ],
        );
      }

      assignment.status = ParcelRunAssignmentStatus.RECEIVED;
      assignment.receivedAt = new Date();
      const saved = await repo.save(assignment);
      return { assignment: saved, custodyEventId: (custody as any).id as number, obligationId: obligation.id };
    });

    if (result.obligationId != null) {
      // Best-effort IMMEDIATE resolution attempt -- never blocks or throws.
      // Durability no longer depends on this succeeding: the obligation row
      // above already committed, so even a crash right here still leaves a
      // durable, replayable PENDING obligation for a later reconciliation
      // sweep (SuperAgentHandlingEarningObligationService.processPending()).
      await this.obligationService.attemptResolve(result.obligationId, { userId: context.userId });
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
      const preview = await repo.findOne({ where: { id: assignmentId } });
      if (!preview) throw new NotFoundException('Assignment not found');
      await this.lockParcel(manager, preview.parcelId);
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

  async getManifestForRun(runId: number) {
    return this.dataSource.query(
      `SELECT a.id, a."parcelId", a.status, a."loadRunStopId", a."unloadRunStopId",
              a."loadedAt", a."unloadedAt", a."receivedAt",
              p."trackingNumber", p.status AS "parcelStatus", p."recipientName",
              p."buyerPhone" AS "recipientPhone", p."deliveryAddress", p.description,
              ls.sequence AS "loadSequence", ls."locationLabel" AS "loadLocation",
              us.sequence AS "unloadSequence", us."locationLabel" AS "unloadLocation",
              us."superAgentId" AS "destinationSuperAgentId"
         FROM public.parcel_run_assignment a
         JOIN public.parcel p ON p.id = a."parcelId"
         JOIN public.transport_run_stop ls ON ls.id = a."loadRunStopId"
         JOIN public.transport_run_stop us ON us.id = a."unloadRunStopId"
        WHERE a."runId" = $1
        ORDER BY ls.sequence ASC, us.sequence ASC, a.id ASC`,
      [runId],
    );
  }

  async getActiveAssignmentForParcel(parcelId: number): Promise<ParcelRunAssignment | null> {
    return this.findBlockingAssignment(parcelId);
  }
}
