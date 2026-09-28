import { ConflictException } from '@nestjs/common';

/** Task states in which the Parcel has NOT yet been physically received by its origin hub. */
export const FIRST_MILE_OPEN_STATUSES = ['requested', 'claimed', 'collected', 'awaiting_hub'] as const;

/**
 * Boarding boundary (Stage 3S-A). A Parcel with an open Agent pickup task is
 * still in the sender -> Agent -> origin-hub leg, so nothing may present it as
 * dispatched, bulk-linked, or handed to a carrier/Run yet: only the hub's own
 * locked receipt (task 'hub_received') opens the Parcel to those movements.
 * Call it inside the transaction that already holds the Parcel row lock(s).
 * Cancelled/expired tasks and Parcels without a task (desk intake, legacy
 * Order collections) are unaffected.
 */
export async function assertFirstMileComplete(
  db: { query(sql: string, params?: any[]): Promise<any> },
  parcelIds: number | number[],
): Promise<void> {
  const ids = (Array.isArray(parcelIds) ? parcelIds : [parcelIds]).filter((n) => Number.isSafeInteger(n));
  if (!ids.length) return;
  const rows = await db.query(
    `SELECT id FROM public.parcel_pickup_task WHERE "parcelId" = ANY($1::integer[])
      AND status = ANY($2::text[]) LIMIT 1`,
    [ids, [...FIRST_MILE_OPEN_STATUSES]],
  );
  if (Array.isArray(rows) && rows.length) {
    throw new ConflictException(
      'Parcel is still in first-mile pickup; the origin hub must confirm physical receipt before it can move on',
    );
  }
}
