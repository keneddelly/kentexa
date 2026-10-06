/**
 * TransportRunService — Stage 3S-C1: ordered RouteStop management + the
 * canonical TransportRun creation authority.
 *
 * Two responsibilities, deliberately kept in one small, dedicated service
 * (mirroring TransportQuoteService's own precedent as a focused sibling to
 * TransportService, not a competing god-object):
 *   1. RouteStop CRUD against the REUSABLE plan (add/list/update/reorder/
 *      deactivate) -- ordinary editable configuration data.
 *   2. createRun() -- the one place a TransportRun + its immutable
 *      TransportRunStop snapshot get created together, transactionally.
 *
 * Ownership/ authorization reuses TransportService.getMyProfile() (the
 * existing canonical "which TransportProvider is this caller" resolver) --
 * not re-implemented here.
 */
import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRoute } from './entities/transport-route.entity';
import { TransportRun, TransportRunStatus } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
import { Vehicle, VehicleOperationalStatus } from './entities/vehicle.entity';
import { ProviderType } from './entities/transport-provider.entity';
import { TransportService } from './transport.service';
import { TzLocationService } from '../tz-location/tz-location.service';

export interface AddRouteStopDto {
  sequence: number;
  locationLabel: string;
  loadingAllowed?: boolean;
  unloadingAllowed?: boolean;
  parcelAcceptanceAllowed?: boolean;
  customerCollectionAllowed?: boolean;
  superAgentId?: number | null;
  estimatedArrivalOffsetMinutes?: number | null;
  estimatedDepartureOffsetMinutes?: number | null;
}

export interface UpdateRouteStopDto {
  locationLabel?: string;
  loadingAllowed?: boolean;
  unloadingAllowed?: boolean;
  parcelAcceptanceAllowed?: boolean;
  customerCollectionAllowed?: boolean;
  superAgentId?: number | null;
  estimatedArrivalOffsetMinutes?: number | null;
  estimatedDepartureOffsetMinutes?: number | null;
}

export interface CreateRunDto {
  routeId: number;
  scheduledDeparture: string | Date;
}

// Gate 1: 24-hour wall-clock HH:mm, e.g. 06:00, 18:30, 23:59. The original
// inline pattern doubled its backslashes inside a regex LITERAL, so it
// looked for a real backslash followed by "d" and rejected every valid
// time -- no recurring schedule could ever be saved. Exported and unit
// tested so that cannot regress silently. A browser <input type="time">
// may also send seconds (06:00:00); those are accepted and ignored.
const DEPARTURE_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
export function isValidDepartureTime(value: unknown): value is string {
  return typeof value === 'string' && DEPARTURE_TIME.test(value);
}

// Gate 2: how far ahead a recurring schedule keeps dated Runs on sale when
// the transporter does not say. Three weeks, so a sender can book "the 06:00
// safari on the 26th" today; the hourly materializer (extendScheduleHorizons)
// keeps that window rolling forward.
export const DEFAULT_SCHEDULE_HORIZON_DAYS = 21;
export const MAX_SCHEDULE_HORIZON_DAYS = 31;
const horizonOf = (raw: unknown): number =>
  Math.min(MAX_SCHEDULE_HORIZON_DAYS, Math.max(1, Number(raw) || DEFAULT_SCHEDULE_HORIZON_DAYS));

export interface MaterializeResult {
  created: number;
  /** Schedules that produced nothing, and why -- never silently. */
  skipped: Array<{ scheduleId: number; reason: string }>;
}

export interface UpsertRecurringScheduleDto {
  routeId: number;
  scheduleType: 'daily' | 'selected_days';
  daysOfWeek?: number[];
  departureTime: string; // HH:mm in Tanzania local time
  defaultVehicleId?: number | null;
  autoOpen?: boolean;
  horizonDays?: number;
}

export interface AddVehicleDto {
  identifier: string;
  registrationPlate?: string | null;
  type: ProviderType;
  parcelCapacity?: number | null;
  weightCapacityKg?: number | null;
  volumeCapacityM3?: number | null;
}

export interface UpdateVehicleDto {
  identifier?: string;
  registrationPlate?: string | null;
  type?: ProviderType;
  parcelCapacity?: number | null;
  weightCapacityKg?: number | null;
  volumeCapacityM3?: number | null;
  operationalStatus?: VehicleOperationalStatus;
}

@Injectable()
export class TransportRunService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TransportRunService.name);

  constructor(
    @InjectRepository(RouteStop) private routeStopRepo: Repository<RouteStop>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
    @InjectRepository(TransportRun) private runRepo: Repository<TransportRun>,
    @InjectRepository(TransportRunStop) private runStopRepo: Repository<TransportRunStop>,
    private readonly transportService: TransportService,
    private readonly tzLocation: TzLocationService,
    private readonly dataSource: DataSource,
    // Appended last and optional, per this lineage's own established
    // convention (e.g. ShipmentsService.quoteRepo in Stage 3S-B3), so every
    // existing hand-constructed positional test double from C1 keeps
    // compiling and passing unchanged.
    @InjectRepository(Vehicle) private vehicleRepo?: Repository<Vehicle>,
  ) {}

  // Best-effort, never-blocking ward/region resolution -- the SAME pattern
  // TransportService's own (private) resolveRegionId already uses for
  // TransportRoute.originRegionId/destinationRegionId. A failed/ambiguous
  // lookup never blocks stop creation; it just leaves wardId/regionId null.
  private async resolveWardAndRegion(locationLabel: string): Promise<{ wardId: number | null; regionId: number | null }> {
    const label = locationLabel?.trim();
    if (!label) return { wardId: null, regionId: null };
    try {
      const results = await this.tzLocation.search(label);
      const top = results?.[0] as { wardId?: number; regionId?: number } | undefined;
      return { wardId: top?.wardId ?? null, regionId: top?.regionId ?? null };
    } catch {
      return { wardId: null, regionId: null };
    }
  }

  private async assertOwnsRoute(userId: number, routeId: number): Promise<TransportRoute> {
    const provider = await this.transportService.getMyProfile(userId);
    const route = await this.routeRepo.findOne({ where: { id: routeId, providerId: provider.id } });
    if (!route) throw new NotFoundException('Njia haijapatikana');
    return route;
  }

  // Stage 3S-C4: RouteStop.superAgentId/TransportRunStop.superAgentId were
  // always accepted and persisted (Stage 3S-C1/C2) with no existence check
  // at all -- a plain int, by original design, not a DB-level FK (the same
  // "no real CREATE TABLE migration for super_agent" precedent every Stage
  // 3S migration already documents). A raw existence check closes that gap
  // the same way ParcelRunAssignmentService.assertParcelExists already does
  // for the identical cross-module situation, without pulling SuperAgent's
  // own entity/module into this one.
  private async assertSuperAgentExists(superAgentId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT id FROM public.super_agent WHERE id = $1', [superAgentId]);
    if (!rows.length) throw new BadRequestException('superAgentId does not reference an existing Super Agent');
  }

  async listActiveHubsForProvider(userId: number, search?: string) {
    await this.transportService.getMyProfile(userId);
    const q=(search || '').trim();
    return this.dataSource.query(
      `SELECT id, "businessName", city, address, phone, "agentCode"
         FROM public.super_agent
        WHERE status='active'
          AND ($1='' OR lower("businessName") LIKE lower('%'||$1||'%')
                    OR lower(city) LIKE lower('%'||$1||'%')
                    OR lower(COALESCE(address,'')) LIKE lower('%'||$1||'%'))
        ORDER BY city ASC, "businessName" ASC
        LIMIT 100`,
      [q],
    );
  }

  // ── RouteStop CRUD (reusable, editable plan) ──────────────────────────────

  async addRouteStop(userId: number, routeId: number, dto: AddRouteStopDto): Promise<RouteStop> {
    await this.assertOwnsRoute(userId, routeId);
    if (!Number.isInteger(dto.sequence) || dto.sequence < 0) {
      throw new BadRequestException('sequence must be a non-negative integer');
    }
    const label = dto.locationLabel?.trim();
    if (!label) throw new BadRequestException('locationLabel is required');
    if (dto.superAgentId != null) await this.assertSuperAgentExists(dto.superAgentId);

    const { wardId, regionId } = await this.resolveWardAndRegion(label);
    const stop = this.routeStopRepo.create({
      routeId,
      sequence: dto.sequence,
      locationLabel: label,
      wardId,
      regionId,
      loadingAllowed: dto.loadingAllowed ?? true,
      unloadingAllowed: dto.unloadingAllowed ?? true,
      parcelAcceptanceAllowed: dto.parcelAcceptanceAllowed ?? true,
      customerCollectionAllowed: dto.customerCollectionAllowed ?? false,
      superAgentId: dto.superAgentId ?? null,
      estimatedArrivalOffsetMinutes: dto.estimatedArrivalOffsetMinutes ?? null,
      estimatedDepartureOffsetMinutes: dto.estimatedDepartureOffsetMinutes ?? null,
      isActive: true,
    });
    return this.routeStopRepo.save(stop);
  }

  async listRouteStops(userId: number, routeId: number): Promise<RouteStop[]> {
    await this.assertOwnsRoute(userId, routeId);
    return this.routeStopRepo.find({ where: { routeId }, order: { sequence: 'ASC' } });
  }

  async updateRouteStop(userId: number, routeId: number, stopId: number, dto: UpdateRouteStopDto): Promise<RouteStop> {
    await this.assertOwnsRoute(userId, routeId);
    const stop = await this.routeStopRepo.findOne({ where: { id: stopId, routeId } });
    if (!stop) throw new NotFoundException('Route stop not found');
    if (dto.superAgentId != null) await this.assertSuperAgentExists(dto.superAgentId);

    if (dto.locationLabel !== undefined) {
      const label = dto.locationLabel.trim();
      if (!label) throw new BadRequestException('locationLabel cannot be empty');
      stop.locationLabel = label;
      const resolved = await this.resolveWardAndRegion(label);
      stop.wardId = resolved.wardId;
      stop.regionId = resolved.regionId;
    }
    const editable: (keyof UpdateRouteStopDto)[] = [
      'loadingAllowed', 'unloadingAllowed', 'parcelAcceptanceAllowed',
      'customerCollectionAllowed', 'superAgentId',
      'estimatedArrivalOffsetMinutes', 'estimatedDepartureOffsetMinutes',
    ];
    for (const key of editable) {
      if (dto[key] !== undefined) (stop as any)[key] = dto[key];
    }
    return this.routeStopRepo.save(stop);
  }

  // Swaps this stop's sequence with whichever stop (if any) currently holds
  // `newSequence`.
  //
  // Post-C1-review correction (second round): the first correction replaced
  // a negative sentinel with a "reserved-looking" positive one
  // (1_000_000_000 + target.id), on the mistaken assumption that value was
  // guaranteed collision-free. It was not: sequence's only constraint is
  // >= 0, so nothing in this schema rules out a legitimately persisted stop
  // already holding that exact number, and there is also no numeric value
  // any schema-level proof could rule out short of restricting the column's
  // usable range -- which would be inventing a second, undocumented
  // invariant on top of the real one.
  //
  // The fix that is correct BY DATABASE CONTRACT rather than by an assumed
  // numeric range: (routeId, sequence) is a DEFERRABLE unique constraint
  // (route-stop-schema.ts's ensureRouteStopDeferrableSequenceConstraint,
  // applied by the migration). Deferring it for the remainder of this
  // transaction lets both rows move directly to their final, correct,
  // non-negative, mutually distinct values -- uniqueness is then validated
  // by Postgres at commit time against the ACTUAL final state, not assumed
  // safe mid-transaction. CHK_route_stop_sequence (sequence >= 0) is
  // untouched and unweakened -- neither row is ever assigned a negative
  // value at any point.
  async reorderRouteStop(userId: number, routeId: number, stopId: number, newSequence: number): Promise<void> {
    await this.assertOwnsRoute(userId, routeId);
    if (!Number.isInteger(newSequence) || newSequence < 0) {
      throw new BadRequestException('sequence must be a non-negative integer');
    }
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RouteStop);
      const target = await repo.findOne({ where: { id: stopId, routeId }, lock: { mode: 'pessimistic_write' } });
      if (!target) throw new NotFoundException('Route stop not found');
      if (target.sequence === newSequence) return;

      const occupant = await repo.findOne({ where: { routeId, sequence: newSequence }, lock: { mode: 'pessimistic_write' } });
      // Transaction-scoped only (resets automatically at commit/rollback) --
      // never affects any other transaction's view of this constraint.
      await manager.query(`SET CONSTRAINTS "UQ_route_stop_sequence" DEFERRED`);
      await repo.update({ id: target.id }, { sequence: newSequence });
      if (occupant) {
        await repo.update({ id: occupant.id }, { sequence: target.sequence });
      }
    });
  }

  async deactivateRouteStop(userId: number, routeId: number, stopId: number): Promise<RouteStop> {
    await this.assertOwnsRoute(userId, routeId);
    const stop = await this.routeStopRepo.findOne({ where: { id: stopId, routeId } });
    if (!stop) throw new NotFoundException('Route stop not found');
    stop.isActive = false;
    return this.routeStopRepo.save(stop);
  }

  // ── Recurring route schedules ─────────────────────────────────────────────
  async listRecurringSchedules(userId: number) {
    const provider = await this.transportService.getMyProfile(userId);
    return this.dataSource.query(
      `SELECT s.*, r."routeType", r."originCity", r."destinationCity", r."coverageCity", r."loopStops",
              v.identifier AS "defaultVehicleIdentifier", v."registrationPlate" AS "defaultVehiclePlate"
         FROM public.transport_route_schedule s
         JOIN public.transport_route r ON r.id=s."routeId"
         LEFT JOIN public.vehicle v ON v.id=s."defaultVehicleId"
        WHERE s."providerId"=$1 ORDER BY s."routeId", s."departureTime"`, [provider.id]);
  }

  async createRecurringSchedule(userId: number, dto: UpsertRecurringScheduleDto) {
    const provider = await this.transportService.getMyProfile(userId);
    const route = await this.routeRepo.findOne({ where: { id:Number(dto.routeId), providerId:provider.id } });
    if (!route || !route.isActive) throw new NotFoundException('Active route not found');
    if (!isValidDepartureTime(dto.departureTime)) throw new BadRequestException('departureTime must be HH:mm');
    if (!['daily','selected_days'].includes(dto.scheduleType)) throw new BadRequestException('Invalid scheduleType');
    const days = dto.scheduleType === 'selected_days' ? [...new Set(dto.daysOfWeek || [])] : null;
    if (dto.scheduleType === 'selected_days' && (!days?.length || days.some(d=>!Number.isInteger(d)||d<0||d>6))) throw new BadRequestException('Choose valid operating days');
    const horizon = horizonOf(dto.horizonDays);
    let vehicleId:number|null = dto.defaultVehicleId == null ? null : Number(dto.defaultVehicleId);
    if (vehicleId != null) {
      const vehicle=await this.requireVehicleRepo().findOne({where:{id:vehicleId,providerId:provider.id}});
      if(!vehicle || !vehicle.isActive) throw new BadRequestException('Default vehicle is not active');
    }
    // Gate 1: a Run needs at least two active stops (createRun enforces it).
    // Checked BEFORE the insert: the schedule row and its first Runs are not
    // one transaction, so a route with no stop plan used to leave a saved
    // schedule behind an error response, and a retry saved a second one.
    const activeStops = await this.routeStopRepo.count({ where: { routeId: route.id, isActive: true } });
    if (activeStops < 2) {
      throw new ConflictException(
        'That route does not have a valid stop plan yet -- add at least 2 active stops before scheduling it',
      );
    }
    const rows=await this.dataSource.query(
      `INSERT INTO public.transport_route_schedule
       ("providerId","routeId","scheduleType","daysOfWeek","departureTime","defaultVehicleId","autoOpen","isActive","horizonDays","createdByUserId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9) RETURNING *`,
      [provider.id,route.id,dto.scheduleType,days,dto.departureTime,vehicleId,dto.autoOpen!==false,horizon,userId]);
    await this.materializeRecurringRuns(userId, rows[0].id);
    return rows[0];
  }

  async deactivateRecurringSchedule(userId:number, scheduleId:number) {
    const provider=await this.transportService.getMyProfile(userId);
    const rows=await this.dataSource.query(
      `UPDATE public.transport_route_schedule SET "isActive"=false,"updatedAt"=now()
        WHERE id=$1 AND "providerId"=$2 RETURNING *`,[scheduleId,provider.id]);
    if(!rows.length) throw new NotFoundException('Schedule not found');
    return rows[0];
  }

  // Provider-triggered (schedule creation, "refresh" in the workspace): the
  // caller's own schedules only.
  async materializeRecurringRuns(userId:number, onlyScheduleId?:number): Promise<MaterializeResult> {
    const provider=await this.transportService.getMyProfile(userId);
    return this.materializeSchedules({ providerId: provider.id, scheduleId: onlyScheduleId });
  }

  // ── Gate 2: the rolling horizon ───────────────────────────────────────────
  // A recurring schedule used to be turned into dated Runs exactly once, when
  // it was saved. Fourteen days later the last Run departed and the route
  // silently went off sale. This job is what keeps "every day at 06:00" true:
  // hourly, and once at start-up, it tops every active schedule back up to
  // its horizon. It is safe to run on several instances at once -- each
  // schedule row is locked while its Runs are created, and
  // UQ_transport_run_schedule_departure is the database backstop.
  @Cron('15 * * * *')
  async extendScheduleHorizons(): Promise<void> {
    try {
      const result = await this.materializeSchedules();
      if (result.created || result.skipped.length) {
        this.logger.log(
          `Recurring schedules: ${result.created} Run(s) created` +
          (result.skipped.length ? `; skipped ${result.skipped.map(s => `#${s.scheduleId} (${s.reason})`).join(', ')}` : ''),
        );
      }
    } catch (error) {
      // Never let a scheduling problem take the process down.
      this.logger.warn(`Recurring schedule materialization failed: ${(error as Error)?.message ?? error}`);
    }
  }

  onApplicationBootstrap(): void {
    // Not awaited: start-up must not wait on (or fail because of) this.
    setTimeout(() => { void this.extendScheduleHorizons(); }, 15_000).unref?.();
  }

  /**
   * Creates the dated Runs every matching ACTIVE schedule should have between
   * `now` and its horizon and does not have yet. Idempotent. A schedule whose
   * provider is not verified, whose route is inactive or whose route has no
   * valid stop plan produces nothing and is reported in `skipped`.
   */
  async materializeSchedules(
    filter: { providerId?: number; scheduleId?: number } = {},
    now: Date = new Date(),
  ): Promise<MaterializeResult> {
    const schedules: any[] = await this.dataSource.query(
      `SELECT s.*, p.status AS "providerStatus", r."isActive" AS "routeActive"
         FROM public.transport_route_schedule s
         JOIN public.transport_provider p ON p.id = s."providerId"
         JOIN public.transport_route r ON r.id = s."routeId"
        WHERE s."isActive" = true
          AND ($1::int IS NULL OR s."providerId" = $1)
          AND ($2::int IS NULL OR s.id = $2)
        ORDER BY s.id`,
      [filter.providerId ?? null, filter.scheduleId ?? null],
    );
    const result: MaterializeResult = { created: 0, skipped: [] };
    for (const s of schedules) {
      if (!['verified', 'active'].includes(s.providerStatus)) {
        result.skipped.push({ scheduleId: s.id, reason: 'provider is not verified' });
        continue;
      }
      if (!s.routeActive) {
        result.skipped.push({ scheduleId: s.id, reason: 'route is not active' });
        continue;
      }
      try {
        result.created += await this.materializeOneSchedule(s, now);
      } catch (error) {
        result.skipped.push({ scheduleId: s.id, reason: (error as Error)?.message ?? 'failed' });
      }
    }
    return result;
  }

  // The departures one schedule should have on sale: Tanzania wall-clock
  // (+03:00) built explicitly, so a server running UTC never shifts a 06:00
  // safari to 09:00 or 03:00.
  private scheduleDepartures(s: any, now: Date): Date[] {
    const horizon = horizonOf(s.horizonDays);
    const nowTz = new Date(now.getTime() + 3 * 3600000);
    const out: Date[] = [];
    for (let offset = 0; offset <= horizon; offset++) {
      const ymd = new Date(Date.UTC(nowTz.getUTCFullYear(), nowTz.getUTCMonth(), nowTz.getUTCDate() + offset));
      if (s.scheduleType === 'selected_days' && !(s.daysOfWeek || []).map(Number).includes(ymd.getUTCDay())) continue;
      const departure = new Date(`${ymd.toISOString().slice(0, 10)}T${String(s.departureTime).slice(0, 5)}:00+03:00`);
      if (departure.getTime() < now.getTime() - 5 * 60000) continue;
      out.push(departure);
    }
    return out;
  }

  private async materializeOneSchedule(s: any, now: Date): Promise<number> {
    const departures = this.scheduleDepartures(s, now);
    if (!departures.length) return 0;
    return this.dataSource.transaction(async (manager) => {
      // Serialises concurrent materializers of this schedule, and re-reads
      // whether it is still active.
      const locked = await manager.query(
        `SELECT id FROM public.transport_route_schedule WHERE id = $1 AND "isActive" = true FOR UPDATE`, [s.id]);
      if (!locked.length) return 0;
      const existing: any[] = await manager.query(
        `SELECT "scheduledDeparture" FROM public.transport_run WHERE "scheduleId" = $1`, [s.id]);
      const have = new Set(existing.map((r) => new Date(r.scheduledDeparture).getTime()));
      const missing = departures.filter((d) => !have.has(d.getTime()));
      if (!missing.length) return 0;

      let vehicleId: number | null = s.defaultVehicleId == null ? null : Number(s.defaultVehicleId);
      if (vehicleId != null) {
        const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: vehicleId, providerId: Number(s.providerId) } });
        if (!vehicle || !vehicle.isActive) vehicleId = null; // the Run is still created; a vehicle can be assigned later
      }
      for (const scheduledDeparture of missing) {
        const run = await this.insertRunWithStops(manager, {
          providerId: Number(s.providerId), routeId: Number(s.routeId), scheduledDeparture,
          createdByUserId: Number(s.createdByUserId),
        });
        await manager.query(
          `UPDATE public.transport_run SET "scheduleId" = $1, "autoGenerated" = true, "vehicleId" = $2, status = $3 WHERE id = $4`,
          [s.id, vehicleId, s.autoOpen ? 'open' : 'scheduled', run.id]);
      }
      return missing.length;
    });
  }

  // The one place a Run row and its immutable stop snapshot are written.
  private async insertRunWithStops(
    manager: EntityManager,
    input: { providerId: number; routeId: number; scheduledDeparture: Date; createdByUserId: number },
  ): Promise<TransportRun> {
    const routeStopRepo = manager.getRepository(RouteStop);
    const runRepo = manager.getRepository(TransportRun);
    const runStopRepo = manager.getRepository(TransportRunStop);

    const activeStops = await routeStopRepo.find({
      where: { routeId: input.routeId, isActive: true },
      order: { sequence: 'ASC' },
    });
    if (activeStops.length < 2) {
      throw new ConflictException(
        'That route does not have a valid stop plan yet -- at least 2 active stops are required to schedule a Run',
      );
    }
    const seen = new Set<number>();
    for (const s of activeStops) {
      if (seen.has(s.sequence)) {
        throw new ConflictException('That route has a duplicate stop sequence -- fix the stop plan before scheduling a Run');
      }
      seen.add(s.sequence);
    }

    const run = await runRepo.save(runRepo.create({
      providerId: input.providerId,
      routeId: input.routeId,
      scheduledDeparture: input.scheduledDeparture,
      status: TransportRunStatus.SCHEDULED,
      createdByUserId: input.createdByUserId,
    }));

    for (const stop of activeStops) {
      await runStopRepo.save(runStopRepo.create({
        runId: run.id,
        sourceRouteStopId: stop.id,
        sequence: stop.sequence,
        locationLabel: stop.locationLabel,
        wardId: stop.wardId,
        regionId: stop.regionId,
        loadingAllowed: stop.loadingAllowed,
        unloadingAllowed: stop.unloadingAllowed,
        parcelAcceptanceAllowed: stop.parcelAcceptanceAllowed,
        customerCollectionAllowed: stop.customerCollectionAllowed,
        superAgentId: stop.superAgentId,
        estimatedArrivalOffsetMinutes: stop.estimatedArrivalOffsetMinutes,
        estimatedDepartureOffsetMinutes: stop.estimatedDepartureOffsetMinutes,
      }));
    }
    return run;
  }

  // ── TransportRun creation (immutable itinerary snapshot) ──────────────────

  // Server-side, transactional, and idempotency was explicitly assessed: no
  // dedicated idempotency-key table is introduced in this gate. The caller
  // here is a server-side/provider action creating a NEW schedule entry, not
  // a customer-facing request replayed under network retry (unlike, say,
  // checkout or walk-in order creation, which DO have dedicated idempotency
  // columns elsewhere in this codebase) -- the meaningful safety property
  // this gate needs is "never leave a half-created Run", which the single
  // wrapping transaction already guarantees (a failed snapshot copy rolls
  // back the Run row too). A request-level idempotency key can be added
  // later if a retry-prone HTTP/Intent caller is wired to this method.
  async createRun(userId: number, dto: CreateRunDto): Promise<TransportRun> {
    const provider = await this.transportService.getMyProfile(userId);
    const route = await this.routeRepo.findOne({ where: { id: dto.routeId, providerId: provider.id } });
    if (!route) throw new NotFoundException('Njia haijapatikana');
    if (!route.isActive) throw new BadRequestException('That route is not currently active');

    const scheduledDeparture = new Date(dto.scheduledDeparture);
    if (Number.isNaN(scheduledDeparture.getTime())) {
      throw new BadRequestException('Invalid scheduledDeparture');
    }

    return this.dataSource.transaction((manager) =>
      this.insertRunWithStops(manager, {
        providerId: provider.id, routeId: route.id, scheduledDeparture, createdByUserId: userId,
      }),
    );
  }

  async getRunStops(runId: number): Promise<TransportRunStop[]> {
    return this.runStopRepo.find({ where: { runId }, order: { sequence: 'ASC' } });
  }

  async assertRunOperationalVisibility(
    userId: number, roleType: string, roleProfileId: number | null, runId: number,
  ): Promise<void> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');
    if (roleType === 'transport_provider') {
      const provider = await this.transportService.getMyProfile(userId);
      if (run.providerId !== provider.id) throw new NotFoundException('Run not found');
      return;
    }
    if (roleType === 'super_agent' && roleProfileId != null) {
      const stop = await this.runStopRepo.findOne({ where: { runId, superAgentId: roleProfileId } });
      if (!stop) throw new NotFoundException('Run not found');
      return;
    }
    throw new NotFoundException('Run not found');
  }

  async transitionRun(userId: number, runId: number, target: TransportRunStatus): Promise<TransportRun> {
    const provider = await this.transportService.getMyProfile(userId);
    const allowed: Partial<Record<TransportRunStatus, TransportRunStatus[]>> = {
      [TransportRunStatus.SCHEDULED]: [TransportRunStatus.OPEN],
      [TransportRunStatus.OPEN]: [TransportRunStatus.CLOSED],
      [TransportRunStatus.CLOSED]: [TransportRunStatus.STARTED],
      [TransportRunStatus.STARTED]: [TransportRunStatus.COMPLETED],
    };
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransportRun);
      const run = await repo.findOne({ where: { id: runId }, lock: { mode: 'pessimistic_write' } });
      if (!run || run.providerId !== provider.id) throw new NotFoundException('Run not found');
      if (!(allowed[run.status] || []).includes(target)) {
        throw new ConflictException(`Run cannot move from ${run.status} to ${target}`);
      }
      if (target === TransportRunStatus.STARTED) {
        const loaded = await manager.query(
          `SELECT id FROM public.parcel_run_assignment WHERE "runId" = $1 AND status = 'loaded' LIMIT 1`,
          [runId],
        );
        if (!loaded.length) throw new ConflictException('Load at least one parcel before starting this Run');
      }
      if (target === TransportRunStatus.COMPLETED) {
        const inTransit = await manager.query(
          `SELECT id FROM public.parcel_run_assignment WHERE "runId" = $1 AND status = 'loaded' LIMIT 1`,
          [runId],
        );
        if (inTransit.length) throw new ConflictException('Run cannot complete while parcels are still loaded');
      }
      run.status = target;
      return repo.save(run);
    });
  }

  async cancelRun(userId: number, runId: number): Promise<TransportRun> {
    const provider = await this.transportService.getMyProfile(userId);
    return this.dataSource.transaction(async (manager) => {
      const runRepo = manager.getRepository(TransportRun);
      const run = await runRepo.findOne({ where: { id: runId }, lock: { mode: 'pessimistic_write' } });
      if (!run || run.providerId !== provider.id) throw new NotFoundException('Run not found');
      if (run.status === TransportRunStatus.CANCELLED) return run;
      if (run.status === TransportRunStatus.COMPLETED || run.status === TransportRunStatus.STARTED) {
        throw new ConflictException('A started or completed Run cannot be cancelled through the pre-load recovery path');
      }
      const progressed = await manager.query(
        `SELECT id FROM public.parcel_run_assignment
          WHERE "runId" = $1 AND status NOT IN ('scheduled', 'cancelled') LIMIT 1`,
        [runId],
      );
      if (progressed.length) {
        throw new ConflictException('This Run already has physical parcel movement and cannot be cancelled');
      }
      await manager.query(
        `UPDATE public.parcel_run_assignment SET status = 'cancelled'
          WHERE "runId" = $1 AND status = 'scheduled'`,
        [runId],
      );
      run.status = TransportRunStatus.CANCELLED;
      return runRepo.save(run);
    });
  }

  // ── Vehicle administration (Stage 3S-C2) ──────────────────────────────────
  // Provider-scoped, without assuming Kentexa ownership (Issue #62 section
  // E). Deliberately minimal: no admin UI, no driver/operator, no capacity
  // RESERVATION algorithm -- a Vehicle here is a reusable resource record
  // that can be assigned to a TransportRun (assignVehicleToRun below), not
  // yet consulted by any pricing/capacity/manifest logic.

  private requireVehicleRepo(): Repository<Vehicle> {
    if (!this.vehicleRepo) throw new Error('Vehicle support is not configured on this TransportRunService instance');
    return this.vehicleRepo;
  }

  async addVehicle(userId: number, dto: AddVehicleDto): Promise<Vehicle> {
    const provider = await this.transportService.getMyProfile(userId);
    const identifier = dto.identifier?.trim();
    if (!identifier) throw new BadRequestException('identifier is required');
    for (const [key, value] of Object.entries({
      parcelCapacity: dto.parcelCapacity, weightCapacityKg: dto.weightCapacityKg, volumeCapacityM3: dto.volumeCapacityM3,
    })) {
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${key} must be a non-negative number`);
      }
    }
    const vehicle = this.requireVehicleRepo().create({
      providerId: provider.id,
      identifier,
      registrationPlate: dto.registrationPlate?.trim() || null,
      type: dto.type,
      parcelCapacity: dto.parcelCapacity ?? null,
      weightCapacityKg: dto.weightCapacityKg ?? null,
      volumeCapacityM3: dto.volumeCapacityM3 ?? null,
      isActive: true,
      operationalStatus: VehicleOperationalStatus.AVAILABLE,
    });
    return this.requireVehicleRepo().save(vehicle);
  }

  async listVehicles(userId: number): Promise<Vehicle[]> {
    const provider = await this.transportService.getMyProfile(userId);
    return this.requireVehicleRepo().find({ where: { providerId: provider.id }, order: { id: 'ASC' } });
  }

  async updateVehicle(userId: number, vehicleId: number, dto: UpdateVehicleDto): Promise<Vehicle> {
    const provider = await this.transportService.getMyProfile(userId);
    const vehicle = await this.requireVehicleRepo().findOne({ where: { id: vehicleId, providerId: provider.id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (dto.identifier !== undefined) {
      const identifier = dto.identifier.trim();
      if (!identifier) throw new BadRequestException('identifier cannot be empty');
      vehicle.identifier = identifier;
    }
    if (dto.registrationPlate !== undefined) vehicle.registrationPlate = dto.registrationPlate?.trim() || null;
    if (dto.type !== undefined) vehicle.type = dto.type;
    for (const key of ['parcelCapacity', 'weightCapacityKg', 'volumeCapacityM3'] as const) {
      const value = dto[key];
      if (value !== undefined) {
        if (value != null && (!Number.isFinite(value) || value < 0)) {
          throw new BadRequestException(`${key} must be a non-negative number`);
        }
        vehicle[key] = value;
      }
    }
    if (dto.operationalStatus !== undefined) vehicle.operationalStatus = dto.operationalStatus;
    return this.requireVehicleRepo().save(vehicle);
  }

  async deactivateVehicle(userId: number, vehicleId: number): Promise<Vehicle> {
    const provider = await this.transportService.getMyProfile(userId);
    const vehicle = await this.requireVehicleRepo().findOne({ where: { id: vehicleId, providerId: provider.id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    vehicle.isActive = false;
    vehicle.operationalStatus = VehicleOperationalStatus.RETIRED;
    return this.requireVehicleRepo().save(vehicle);
  }

  // Assigns (or reassigns) a vehicle to a Run. Both the Run and the Vehicle
  // must belong to the SAME caller-owned provider -- this never lets a
  // provider borrow another provider's vehicle. Refuses on a
  // cancelled/completed Run (assigning a vehicle to a Run that's already
  // over is never meaningful) and on an inactive Vehicle. Does not touch
  // RouteStop/TransportRunStop or any capacity/manifest state -- purely
  // records which vehicle executes an already-immutable itinerary.
  async assignVehicleToRun(userId: number, runId: number, vehicleId: number): Promise<TransportRun> {
    const provider = await this.transportService.getMyProfile(userId);
    const run = await this.runRepo.findOne({ where: { id: runId, providerId: provider.id } });
    if (!run) throw new NotFoundException('Run not found');
    if (run.status === TransportRunStatus.CANCELLED || run.status === TransportRunStatus.COMPLETED) {
      throw new ConflictException('Cannot assign a vehicle to a cancelled or completed Run');
    }
    const vehicle = await this.requireVehicleRepo().findOne({ where: { id: vehicleId, providerId: provider.id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (!vehicle.isActive) throw new BadRequestException('That vehicle is not active');

    run.vehicleId = vehicle.id;
    return this.runRepo.save(run);
  }

  // ── Stage 3S-C8 (C8-C): provider-facing Run visibility ─────────────────────
  // "View today's/upcoming Runs" -- no such query existed before this gate
  // (createRun/getRunStops only ever fetched by a known id).
  async listMyRuns(userId: number): Promise<TransportRun[]> {
    const provider = await this.transportService.getMyProfile(userId);
    return this.runRepo.find({
      where: { providerId: provider.id },
      order: { scheduledDeparture: 'DESC' },
      take: 100,
    });
  }

  // ── Stage 3S-C8 (C8-F): admin operational visibility ───────────────────────
  // Reuses canonical tables only -- no mutable "override status" shortcut.
  // Vehicle capacity usage is reported, never silently enforced here (that
  // remains ParcelRunAssignmentService.assertRunCapacity's own job at
  // assignment time) -- an admin may legitimately need to SEE an over-
  // capacity Run (e.g. one assigned a smaller vehicle after the fact) even
  // though no NEW assignment could have created that state going forward.
  async adminListRuns(): Promise<Array<{
    id: number; providerId: number; routeId: number; vehicleId: number | null;
    scheduledDeparture: Date; status: TransportRunStatus;
    activeAssignmentCount: number; parcelCapacity: number | null;
  }>> {
    return this.dataSource.query(
      `SELECT r.id, r."providerId", r."routeId", r."vehicleId", r."scheduledDeparture", r.status,
              (SELECT count(*)::int FROM public.parcel_run_assignment a
                WHERE a."runId" = r.id AND a.status IN ('scheduled','loaded')) AS "activeAssignmentCount",
              v."parcelCapacity"
         FROM public.transport_run r
         LEFT JOIN public.vehicle v ON v.id = r."vehicleId"
        ORDER BY r."scheduledDeparture" DESC
        LIMIT 200`,
    );
  }

  async adminGetRunDetail(runId: number): Promise<{
    run: TransportRun;
    stops: TransportRunStop[];
    assignmentsByStop: Record<number, { loading: number; unloading: number }>;
  }> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Run not found');
    const stops = await this.runStopRepo.find({ where: { runId }, order: { sequence: 'ASC' } });
    const rows = await this.dataSource.query(
      `SELECT "loadRunStopId", "unloadRunStopId" FROM public.parcel_run_assignment WHERE "runId" = $1`,
      [runId],
    );
    const assignmentsByStop: Record<number, { loading: number; unloading: number }> = {};
    for (const stop of stops) assignmentsByStop[stop.id] = { loading: 0, unloading: 0 };
    for (const row of rows) {
      if (assignmentsByStop[row.loadRunStopId]) assignmentsByStop[row.loadRunStopId].loading++;
      if (assignmentsByStop[row.unloadRunStopId]) assignmentsByStop[row.unloadRunStopId].unloading++;
    }
    return { run, stops, assignmentsByStop };
  }
}
