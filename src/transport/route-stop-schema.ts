/**
 * DB-level DEFERRABLE uniqueness for RouteStop's (routeId, sequence) pair
 * (Stage 3S-C1 second correction, post-re-review).
 *
 * TypeORM's @Index/@Unique decorators can express a plain unique index, but
 * NOT a deferrable one -- deferrability is a Postgres-specific constraint
 * property with no decorator equivalent, the same class of gap Stage
 * 3S-B4's GiST exclusion constraint hit. This function is called from both
 * the real migration and any real-PostgreSQL test's synchronize:true
 * schema that needs it, so the constraint text exists in one place and
 * every environment enforces the identical rule.
 *
 * Why deferrable, not a "reserved" sentinel value: TransportRunService.
 * reorderRouteStop() swaps two rows' `sequence` values within one
 * transaction. A plain (non-deferrable) unique index is checked as each row
 * is written, so a genuine two-row swap can transiently collide depending
 * on row-processing order. There is also no numeric value that is PROVABLY
 * collision-free as a temporary sentinel: sequence's only other constraint
 * is >= 0, so any positive integer -- including a "reserved-looking" large
 * one -- could already be a legitimately persisted value on some other row
 * for the same route (an earlier, rejected version of this fix used
 * 1_000_000_000 + target.id on exactly that mistaken assumption). Deferring
 * the uniqueness check to transaction-commit time instead lets both rows
 * reach their final, correct, non-negative, mutually-distinct values before
 * the database validates uniqueness at all -- the constraint itself, not an
 * assumed-unused numeric range, is what guarantees correctness.
 */
export const ROUTE_STOP_SEQUENCE_CONSTRAINT_NAME = 'UQ_route_stop_sequence';

export async function ensureRouteStopDeferrableSequenceConstraint(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  await query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = '${ROUTE_STOP_SEQUENCE_CONSTRAINT_NAME}'
    ) THEN
      ALTER TABLE public.route_stop
        ADD CONSTRAINT "${ROUTE_STOP_SEQUENCE_CONSTRAINT_NAME}"
        UNIQUE ("routeId", sequence) DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
  END $$`);
}
