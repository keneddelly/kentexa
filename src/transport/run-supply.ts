/**
 * Run supply primitives (logistics repair Gate 2) -- the ONE definition of
 * "which trips can a sender book, and is there room".
 *
 * Before this gate there were two supply models. Senders were shown
 * provider_availability "slots" (today/tomorrow only, with a used/total
 * counter that no screen could create any more), while transporters planned
 * and executed TransportRuns. A scheduled 06:00 safari therefore never
 * appeared in a route search, and a booked slot was never the Run the
 * parcel actually travelled on.
 *
 * From this gate on a bookable trip IS an open, future TransportRun:
 *
 *   - discovery (findBookableRuns) reads Runs and their immutable stop
 *     snapshot; the sender is offered the stop pair that serves the journey;
 *   - capacity is the Run's vehicle (parcelCapacity / weightCapacityKg). A
 *     Run without a vehicle, or a dimension left null, is unconstrained --
 *     exactly the rule ParcelRunAssignmentService has always applied;
 *   - a booking is NOT a counter. It is the Shipment itself, reached through
 *     its committed Journey's transport leg (journey_leg.runId). The load of
 *     a Run is derived, under the Run's row lock, as
 *
 *         non-cancelled Shipments booked on the Run
 *       + active ParcelRunAssignments for parcels that are not one of those
 *
 *     so a parcel is counted exactly once whether it is still only booked or
 *     already tendered and assigned, and a cancelled Shipment gives its room
 *     back without any release step that could be forgotten or run twice.
 *
 * Like slot-capacity.ts these are plain functions over an EntityManager, so
 * a caller makes them part of whatever transaction it is already in.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DISCOVERY_CITY_MIN, escapeLikeLiteral } from './city-match';

/** East Africa Time has no daylight saving: always UTC+3. */
export const EAT_OFFSET_MS = 3 * 3600_000;

/** The Tanzania wall-clock date and time of an instant. */
export function eatDateTime(instant: Date): { date: string; time: string } {
  const iso = new Date(instant.getTime() + EAT_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** A 'YYYY-MM-DD' Tanzania calendar day, or a 400. */
export function parseTravelDate(raw: unknown): string {
  if (typeof raw !== 'string' || !DATE_ONLY.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00+03:00`))) {
    throw new BadRequestException('date must be YYYY-MM-DD');
  }
  return raw;
}

export interface BookableRun {
  runId: number;
  providerId: number;
  providerName: string | null;
  providerLogo: string | null;
  providerType: string | null;
  routeId: number;
  vehicleId: number | null;
  departureAt: Date;
  /** Tanzania wall-clock day and time of departure. */
  date: string;
  departureTime: string;
  estimatedHours: number | null;
  pricePerKg: number;
  fixedFee: number;
  loadRunStopId: number;
  loadRouteStopId: number | null;
  loadLabel: string;
  loadSuperAgentId: number | null;
  unloadRunStopId: number;
  unloadRouteStopId: number | null;
  unloadLabel: string;
  unloadSuperAgentId: number | null;
  /** null = the Run has no vehicle, or the vehicle does not declare this limit. */
  parcelCapacity: number | null;
  weightCapacityKg: number | null;
  bookedParcels: number;
  bookedKg: number;
  slotsAvailable: number | null;
  capacityAvailableKg: number | null;
}

export interface RunSearch {
  from: string;
  to: string;
  weightKg?: number;
  runId?: number;
  providerId?: number;
  /** Tanzania calendar day, 'YYYY-MM-DD'. */
  onDate?: string;
  now?: Date;
  limit?: number;
}

// The derived load of one Run (see the header). `run` is a SQL expression for
// the Run id; `exclude`, when given, is a SQL expression for a parcel id that
// must not be counted (the parcel whose own place is being checked).
function loadSql(run: string, exclude?: string): string {
  return `
    SELECT count(*)::int AS parcels, COALESCE(sum(x.w), 0)::float8 AS kg FROM (
      SELECT COALESCE(s."weightKg", 0)::numeric AS w
        FROM public.journey_leg l
        JOIN public.shipment s ON s."journeySelectionId" = l."journeySelectionId"
       WHERE l."runId" = ${run} AND s.status <> 'cancelled'
         ${exclude ? `AND NOT EXISTS (SELECT 1 FROM public.parcel xp WHERE xp."shipmentId" = s.id AND xp.id = ${exclude})` : ''}
      UNION ALL
      SELECT COALESCE(pc."weightKg", 0)::numeric
        FROM public.parcel_run_assignment a
        JOIN public.parcel pc ON pc.id = a."parcelId"
       WHERE a."runId" = ${run} AND a.status IN ('scheduled', 'loaded')
         ${exclude ? `AND a."parcelId" <> ${exclude}` : ''}
         AND NOT EXISTS (
           SELECT 1 FROM public.journey_leg l2
             JOIN public.shipment s2 ON s2."journeySelectionId" = l2."journeySelectionId"
            WHERE l2."runId" = ${run} AND s2.status <> 'cancelled' AND s2.id = pc."shipmentId")
    ) x`;
}

/** Parcels and kilograms currently holding room on a Run. */
export async function runLoad(
  manager: EntityManager,
  runId: number,
  excludeParcelId?: number,
): Promise<{ parcels: number; kg: number }> {
  const rows = await manager.query(
    loadSql('$1', excludeParcelId != null ? '$2' : undefined),
    excludeParcelId != null ? [runId, excludeParcelId] : [runId],
  );
  return { parcels: Number(rows[0]?.parcels) || 0, kg: Number(rows[0]?.kg) || 0 };
}

function remaining(capacity: unknown, used: number): number | null {
  if (capacity === null || capacity === undefined) return null;
  return Math.max(0, Number(capacity) - used);
}

/**
 * Open, future Runs of verified providers that can carry a parcel from
 * `from` to `to`: a stop that allows loading and matches `from`, followed
 * later in the same Run by a stop that allows unloading and matches `to`.
 *
 * A stop matches by its own label (the same forgiving, wildcard-safe,
 * both-direction comparison every other discovery uses). The first and last
 * stop of a Run additionally answer to the route's origin and destination
 * city, so "Dar es Salaam -> Mwanza" finds a Run whose stops are named after
 * its terminals. Runs that are full, or cannot take `weightKg`, are left out.
 */
export async function findBookableRuns(manager: EntityManager, search: RunSearch): Promise<BookableRun[]> {
  // One key cannot name two different stops: "Dar es Salaam -> Dar es Salaam"
  // (the broadest pair of an in-city search) would otherwise pick whichever
  // two stops happen to mention the region.
  if (search.from.trim().toLowerCase() === search.to.trim().toLowerCase()) return [];
  const now = search.now ?? new Date();
  const weightKg = Number(search.weightKg) > 0 ? Number(search.weightKg) : 0;
  const params: unknown[] = [now];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const match = (column: string, city: string) => {
    const pattern = bind(`%${escapeLikeLiteral(city)}%`);
    const raw = bind(city);
    const escaped = `REPLACE(REPLACE(REPLACE(LOWER(${column}), '!', '!!'), '%', '!%'), '_', '!_')`;
    return `(LOWER(${column}) LIKE LOWER(${pattern}) ESCAPE '!' ` +
      `OR (LENGTH(TRIM(${column})) >= ${DISCOVERY_CITY_MIN} AND LOWER(${raw}) LIKE ('%' || ${escaped} || '%') ESCAPE '!'))`;
  };

  const where: string[] = [`r.status = 'open'`, `r."scheduledDeparture" > $1`];
  if (search.runId != null) where.push(`r.id = ${bind(search.runId)}`);
  if (search.providerId != null) where.push(`r."providerId" = ${bind(search.providerId)}`);
  if (search.onDate) {
    const start = new Date(`${parseTravelDate(search.onDate)}T00:00:00+03:00`);
    where.push(`r."scheduledDeparture" >= ${bind(start)}`);
    where.push(`r."scheduledDeparture" < ${bind(new Date(start.getTime() + 86400000))}`);
  }
  const limit = Math.min(200, Math.max(1, Number(search.limit) || 60));

  const rows: any[] = await manager.query(
    `SELECT r.id AS "runId", r."providerId", r."routeId", r."vehicleId", r."scheduledDeparture",
            p.name AS "providerName", p."logoUrl" AS "providerLogo", p.type AS "providerType",
            rt."pricePerKg", rt."fixedFee", rt."estimatedHours",
            ls.id AS "loadRunStopId", ls."sourceRouteStopId" AS "loadRouteStopId",
            ls."locationLabel" AS "loadLabel", ls."superAgentId" AS "loadSuperAgentId",
            us.id AS "unloadRunStopId", us."sourceRouteStopId" AS "unloadRouteStopId",
            us."locationLabel" AS "unloadLabel", us."superAgentId" AS "unloadSuperAgentId",
            v."parcelCapacity", v."weightCapacityKg", load.parcels AS "bookedParcels", load.kg AS "bookedKg"
       FROM public.transport_run r
       JOIN public.transport_provider p ON p.id = r."providerId" AND p.status IN ('verified', 'active')
       JOIN public.transport_route rt ON rt.id = r."routeId" AND rt."isActive" = true
       LEFT JOIN public.vehicle v ON v.id = r."vehicleId"
       JOIN LATERAL (
         SELECT s.* FROM public.transport_run_stop s
          WHERE s."runId" = r.id AND s."loadingAllowed" = true
            AND (${match('s."locationLabel"', search.from)}
                 OR (s.sequence = (SELECT min(f.sequence) FROM public.transport_run_stop f WHERE f."runId" = r.id)
                     AND ${match('rt."originCity"', search.from)}))
          ORDER BY s.sequence ASC LIMIT 1
       ) ls ON true
       JOIN LATERAL (
         SELECT s.* FROM public.transport_run_stop s
          WHERE s."runId" = r.id AND s."unloadingAllowed" = true AND s.sequence > ls.sequence
            AND (${match('s."locationLabel"', search.to)}
                 OR (s.sequence = (SELECT max(f.sequence) FROM public.transport_run_stop f WHERE f."runId" = r.id)
                     AND ${match('rt."destinationCity"', search.to)}))
          ORDER BY s.sequence ASC LIMIT 1
       ) us ON true
       LEFT JOIN LATERAL (${loadSql('r.id')}) load ON true
      WHERE ${where.join(' AND ')}
        AND (v."parcelCapacity" IS NULL OR load.parcels < v."parcelCapacity")
        AND (v."weightCapacityKg" IS NULL OR load.kg + ${bind(weightKg)}::numeric <= v."weightCapacityKg")
      ORDER BY r."scheduledDeparture" ASC, r.id ASC
      LIMIT ${limit}`,
    params,
  );

  return rows.map((row) => {
    const departureAt = new Date(row.scheduledDeparture);
    const bookedParcels = Number(row.bookedParcels) || 0;
    const bookedKg = Number(row.bookedKg) || 0;
    return {
      runId: Number(row.runId),
      providerId: Number(row.providerId),
      providerName: row.providerName ?? null,
      providerLogo: row.providerLogo ?? null,
      providerType: row.providerType ?? null,
      routeId: Number(row.routeId),
      vehicleId: row.vehicleId == null ? null : Number(row.vehicleId),
      departureAt,
      ...eatDateTimeFields(departureAt),
      estimatedHours: row.estimatedHours == null ? null : Number(row.estimatedHours),
      pricePerKg: Number(row.pricePerKg) || 0,
      fixedFee: Number(row.fixedFee) || 0,
      loadRunStopId: Number(row.loadRunStopId),
      loadRouteStopId: row.loadRouteStopId == null ? null : Number(row.loadRouteStopId),
      loadLabel: row.loadLabel,
      loadSuperAgentId: row.loadSuperAgentId == null ? null : Number(row.loadSuperAgentId),
      unloadRunStopId: Number(row.unloadRunStopId),
      unloadRouteStopId: row.unloadRouteStopId == null ? null : Number(row.unloadRouteStopId),
      unloadLabel: row.unloadLabel,
      unloadSuperAgentId: row.unloadSuperAgentId == null ? null : Number(row.unloadSuperAgentId),
      parcelCapacity: row.parcelCapacity == null ? null : Number(row.parcelCapacity),
      weightCapacityKg: row.weightCapacityKg == null ? null : Number(row.weightCapacityKg),
      bookedParcels,
      bookedKg,
      slotsAvailable: remaining(row.parcelCapacity, bookedParcels),
      capacityAvailableKg: remaining(row.weightCapacityKg, bookedKg),
    };
  });
}

function eatDateTimeFields(instant: Date): { date: string; departureTime: string } {
  const { date, time } = eatDateTime(instant);
  return { date, departureTime: time };
}

export interface RunBookingContext {
  providerId?: number | null;
  routeId?: number | null;
}

/**
 * Proves one Run can take one more parcel of `weightKg` right now: it exists,
 * belongs to the expected provider/route, is OPEN, has not departed, its
 * provider is still verified, and its vehicle (when it has one) has room.
 *
 * With `lock` the Run row is locked FOR UPDATE first, so two bookings for the
 * last place are serialised: the second one sees the first one's Shipment.
 * Use it inside the transaction that inserts the booking.
 */
export async function assertRunBookable(
  manager: EntityManager,
  runId: number,
  weightKg: number,
  ctx: RunBookingContext = {},
  opts: { lock?: boolean; now?: Date } = {},
): Promise<void> {
  const rows: any[] = await manager.query(
    `SELECT r.id, r.status, r."providerId", r."routeId", r."scheduledDeparture",
            p.status AS "providerStatus", v."parcelCapacity", v."weightCapacityKg"
       FROM public.transport_run r
       JOIN public.transport_provider p ON p.id = r."providerId"
       LEFT JOIN public.vehicle v ON v.id = r."vehicleId"
      WHERE r.id = $1 ${opts.lock ? 'FOR UPDATE OF r' : ''}`,
    [runId],
  );
  const run = rows[0];
  if (!run) throw new NotFoundException('That trip was not found');
  if (ctx.providerId != null && Number(run.providerId) !== Number(ctx.providerId)) {
    throw new BadRequestException('That trip does not belong to the selected transport provider');
  }
  if (ctx.routeId != null && Number(run.routeId) !== Number(ctx.routeId)) {
    throw new BadRequestException("That trip isn't for the selected route");
  }
  if (!['verified', 'active'].includes(run.providerStatus)) {
    throw new BadRequestException('Msafirishaji huyu hajahakikiwa au hafanyi kazi kwa sasa');
  }
  const now = opts.now ?? new Date();
  if (run.status !== 'open' || new Date(run.scheduledDeparture).getTime() <= now.getTime()) {
    throw new ConflictException('That trip is no longer open for booking');
  }
  if (run.parcelCapacity == null && run.weightCapacityKg == null) return;
  const load = await runLoad(manager, runId);
  if (run.parcelCapacity != null && load.parcels >= Number(run.parcelCapacity)) {
    throw new ConflictException('That trip is full');
  }
  const weight = Number(weightKg) > 0 ? Number(weightKg) : 0;
  if (run.weightCapacityKg != null && load.kg + weight > Number(run.weightCapacityKg)) {
    throw new ConflictException('That trip does not have room for this weight');
  }
}

/**
 * Holds room for a Shipment about to be inserted for `journeySelectionId`:
 * every Run named by that Journey's legs is locked (lowest id first, so two
 * multi-Run bookings cannot deadlock) and proved bookable. The Shipment row
 * the caller then inserts in the SAME transaction is the reservation.
 * Returns the Run ids held; an empty array means the Journey names no Run.
 */
export async function holdRunsForJourney(
  manager: EntityManager,
  journeySelectionId: number,
  weightKg: number,
  now?: Date,
): Promise<number[]> {
  const legs: any[] = await manager.query(
    `SELECT "runId", "providerId", "routeId" FROM public.journey_leg
      WHERE "journeySelectionId" = $1 AND "runId" IS NOT NULL ORDER BY "runId" ASC`,
    [journeySelectionId],
  );
  const held: number[] = [];
  for (const leg of legs) {
    await assertRunBookable(
      manager, Number(leg.runId), weightKg,
      { providerId: leg.providerId, routeId: leg.routeId },
      { lock: true, now },
    );
    held.push(Number(leg.runId));
  }
  return held;
}

/**
 * For a Shipment that ALREADY holds its place: the Runs of its Journey must
 * still be going to run. Full, closed or already departed is fine (this
 * Shipment is one of the bookings); cancelled or completed is not.
 */
export async function assertJourneyRunsOperating(manager: EntityManager, journeySelectionId: number): Promise<void> {
  const rows: any[] = await manager.query(
    `SELECT r.id FROM public.journey_leg l
       JOIN public.transport_run r ON r.id = l."runId"
      WHERE l."journeySelectionId" = $1 AND r.status IN ('cancelled', 'completed') LIMIT 1`,
    [journeySelectionId],
  );
  if (rows.length) {
    throw new ConflictException('The trip booked for this shipment is no longer running');
  }
}
