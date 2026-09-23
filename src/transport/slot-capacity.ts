/**
 * Slot capacity primitives (Stage 2C) -- the ONLY place that mutates
 * provider_availability.usedSlots / usedCapacityKg.
 *
 * Why this exists: the previous JS read-modify-write (`avail.usedSlots++`,
 * `avail.usedCapacityKg += weight`) had three defects -- usedCapacityKg is a
 * `decimal` column that the driver returns as a string, so `+=` concatenated
 * ("0.00" + 2 -> "0.002") and kilograms were effectively never counted;
 * a full/missing slot was a silent no-op; and two concurrent reservations
 * could both "win" the last slot. Here every change is ONE conditional SQL
 * UPDATE whose WHERE clause is the final authority, with the arithmetic done
 * by PostgreSQL in numeric. Callers pass the EntityManager of the transaction
 * they want the change to be part of.
 */
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * The single canonical weight rule for reserve AND release. Unspecified
 * (null/undefined/''/0) means the agreed fallback of 1 kg, exactly the
 * existing `weightKg || 1` product meaning; anything non-finite or negative
 * is rejected rather than allowed to corrupt the arithmetic.
 */
export function capacityWeightKg(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException('weightKg must be a non-negative number');
  }
  return n === 0 ? 1 : n;
}

// TypeORM returns either the row array or [rows, affectedCount] for
// UPDATE ... RETURNING depending on version/driver path.
function rowsOf(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

export interface StrictReserveGuard {
  /** UTC calendar day, 'YYYY-MM-DD'; the slot's date must not be before it. */
  today: string;
  /**
   * The provider whose eligibility was validated (the shipment's selected
   * provider, or the slot's own provider when none was selected); re-checked
   * inside the UPDATE.
   */
  providerId: number;
  /**
   * The ROUTE CONTRACT the caller validated: the route the shipment selected.
   * When present the slot must have exactly this route -- a route-less slot
   * does NOT satisfy it. When absent (the shipment selected no route) no
   * route requirement exists and none is invented. Never derive this from the
   * slot row itself: that would let a mismatch validate itself.
   */
  routeId?: number;
}

/**
 * Atomically takes one slot and `weightKg`. Returns true iff a row was
 * updated.
 *
 * - `strict` (Shipment attach): the UPDATE itself requires status OPEN,
 *   date not past, a free slot, remaining kg >= weight (only when the slot
 *   declares a kg bound: totalCapacityKg = 0 means "not specified", as the
 *   provider UI already treats it), the validated provider, and -- when the
 *   shipment selected a route -- exactly that route. So no
 *   validate-then-update gap can be exploited.
 * - non-strict (legacy TransportService.reserveCapacity callers, i.e.
 *   createAssignment, which pre-validates its own slot): only "a free slot",
 *   exactly the previous condition, but with correct numeric kg arithmetic.
 */
export async function reserveSlotAtomic(
  manager: EntityManager,
  availabilityId: number,
  weightKg: number,
  strict?: StrictReserveGuard,
): Promise<boolean> {
  const params: any[] = [availabilityId, weightKg];
  let where = `id = $1 AND "usedSlots" < "totalSlots"`;
  if (strict) {
    params.push(strict.today, strict.providerId);
    where += ` AND "status" = 'open' AND "date" >= $3::date AND "providerId" = $4`;
    where += ` AND ("totalCapacityKg" = 0 OR ("totalCapacityKg" - "usedCapacityKg") >= $2::numeric)`;
    if (strict.routeId) {
      params.push(strict.routeId);
      where += ` AND "routeId" = $5`;
    }
  }
  const result = await manager.query(
    `UPDATE public.provider_availability
        SET "usedSlots" = "usedSlots" + 1,
            "usedCapacityKg" = "usedCapacityKg" + $2::numeric,
            "status" = CASE WHEN "usedSlots" + 1 >= "totalSlots" THEN 'full' ELSE "status" END,
            "updatedAt" = now()
      WHERE ${where}
      RETURNING id`,
    params,
  );
  return rowsOf(result).length === 1;
}

/**
 * Atomically gives one slot and `weightKg` back. Never underflows
 * (usedSlots must be > 0, kg floored at 0) and the only status it changes is
 * FULL -> OPEN: a DEPARTED or CANCELLED slot is never reopened. Returns true
 * iff a row was updated (false = nothing to release, e.g. already 0).
 */
export async function releaseSlotAtomic(
  manager: EntityManager,
  availabilityId: number,
  weightKg: number,
): Promise<boolean> {
  const result = await manager.query(
    `UPDATE public.provider_availability
        SET "usedSlots" = "usedSlots" - 1,
            "usedCapacityKg" = GREATEST(0, "usedCapacityKg" - $2::numeric),
            "status" = CASE WHEN "status" = 'full' AND "usedSlots" - 1 < "totalSlots" THEN 'open' ELSE "status" END,
            "updatedAt" = now()
      WHERE id = $1 AND "usedSlots" > 0
      RETURNING id`,
    [availabilityId, weightKg],
  );
  return rowsOf(result).length === 1;
}
