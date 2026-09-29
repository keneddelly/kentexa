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
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RouteStop } from './entities/route-stop.entity';
import { TransportRoute } from './entities/transport-route.entity';
import { TransportRun, TransportRunStatus } from './entities/transport-run.entity';
import { TransportRunStop } from './entities/transport-run-stop.entity';
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

@Injectable()
export class TransportRunService {
  constructor(
    @InjectRepository(RouteStop) private routeStopRepo: Repository<RouteStop>,
    @InjectRepository(TransportRoute) private routeRepo: Repository<TransportRoute>,
    @InjectRepository(TransportRun) private runRepo: Repository<TransportRun>,
    @InjectRepository(TransportRunStop) private runStopRepo: Repository<TransportRunStop>,
    private readonly transportService: TransportService,
    private readonly tzLocation: TzLocationService,
    private readonly dataSource: DataSource,
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

  // ── RouteStop CRUD (reusable, editable plan) ──────────────────────────────

  async addRouteStop(userId: number, routeId: number, dto: AddRouteStopDto): Promise<RouteStop> {
    await this.assertOwnsRoute(userId, routeId);
    if (!Number.isInteger(dto.sequence) || dto.sequence < 0) {
      throw new BadRequestException('sequence must be a non-negative integer');
    }
    const label = dto.locationLabel?.trim();
    if (!label) throw new BadRequestException('locationLabel is required');

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
  // Post-C1-review correction: the original approach staged the swap through
  // a temporary NEGATIVE sentinel value. That violates the real,
  // migration-enforced CHK_route_stop_sequence (sequence >= 0) constraint
  // the moment that UPDATE executes -- a genuinely migrated database rejects
  // it outright. The bug was invisible to this file's own real-PostgreSQL
  // tests because they ran against a synchronize:true schema built only
  // from entity decorators, which had no way to know about the migration's
  // raw-SQL CHECK constraint (fixed alongside this correction by adding an
  // equivalent @Check decorator directly on the RouteStop/TransportRunStop
  // entities -- see those files).
  //
  // A single UPDATE...FROM(VALUES) swapping both rows' final values in one
  // statement was tried and rejected during this correction: Postgres
  // enforces a plain (non-deferrable) unique b-tree index incrementally as
  // each target row is processed within a multi-row UPDATE, not only
  // against the statement's final state -- so it can still raise a
  // duplicate-key error mid-statement depending on row processing order.
  // Making the unique index DEFERRABLE would fix that, but is a schema
  // change beyond this bounded correction's scope.
  //
  // The fix that needs no schema change and never weakens the >= 0
  // invariant: stage the swap through a temporary POSITIVE sentinel that is
  // guaranteed to be both non-negative (never trips the CHECK) and
  // collision-free (derived from the row's own id, so no two concurrent
  // reorders of DIFFERENT rows can ever pick the same sentinel; the
  // pessimistic_write locks below also fully serialize concurrent reorders
  // of the SAME route regardless).
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
      // Comfortably below Postgres's int4 max (~2.147 billion) and, being
      // derived from this row's own primary key, unique across every other
      // row in the table -- never collides with a real sequence value or
      // with another row's own sentinel.
      const sentinel = 1_000_000_000 + target.id;
      await repo.update({ id: target.id }, { sequence: sentinel });
      if (occupant) {
        await repo.update({ id: occupant.id }, { sequence: target.sequence });
      }
      await repo.update({ id: target.id }, { sequence: newSequence });
    });
  }

  async deactivateRouteStop(userId: number, routeId: number, stopId: number): Promise<RouteStop> {
    await this.assertOwnsRoute(userId, routeId);
    const stop = await this.routeStopRepo.findOne({ where: { id: stopId, routeId } });
    if (!stop) throw new NotFoundException('Route stop not found');
    stop.isActive = false;
    return this.routeStopRepo.save(stop);
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

    return this.dataSource.transaction(async (manager) => {
      const routeStopRepo = manager.getRepository(RouteStop);
      const runRepo = manager.getRepository(TransportRun);
      const runStopRepo = manager.getRepository(TransportRunStop);

      const activeStops = await routeStopRepo.find({
        where: { routeId: route.id, isActive: true },
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
        providerId: provider.id,
        routeId: route.id,
        scheduledDeparture,
        status: TransportRunStatus.SCHEDULED,
        createdByUserId: userId,
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
    });
  }

  async getRunStops(runId: number): Promise<TransportRunStop[]> {
    return this.runStopRepo.find({ where: { runId }, order: { sequence: 'ASC' } });
  }
}
