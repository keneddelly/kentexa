/**
 * Shared DB-level no-overlap guarantee for TransportRoutePriceHistory
 * (Stage 3S-B4 correction, post-review).
 *
 * TypeORM's entity decorators can express an @Index/@Unique/@Check, but has
 * no way to express a cross-row range-EXCLUDE constraint, so this can't live
 * on the entity the way Stage 3S-B3's partial unique index could. It is
 * applied from exactly two places: the real migration (1788284400000) and
 * every real-PostgreSQL test's synchronize:true schema (which only builds
 * from entity decorators and therefore never sees the migration's SQL) --
 * both call this one function so the constraint text exists in one place.
 *
 * `btree_gist` is a standard, "trusted" Postgres contrib extension (installable
 * without superuser on Postgres 13+, including this repo's target Postgres
 * 16) -- needed for the `routeId WITH =` term inside a GiST exclusion index,
 * which otherwise only supports range/geometric operators natively.
 *
 * Why a range EXCLUDE constraint and not the old "at most one effectiveTo IS
 * NULL row" partial unique index it replaces: that index only ever protected
 * the ONE open-ended row, never the closed rows in between -- two closed
 * historical/future windows could still overlap undetected, and the review
 * correctly flagged that discovery/quote's `ORDER BY effectiveFrom DESC
 * LIMIT 1` would then silently pick one of them rather than fail closed. A
 * single EXCLUDE USING gist (routeId WITH =, tsrange(effectiveFrom,
 * effectiveTo) WITH &&) constraint forbids ANY two rows for the same route
 * from overlapping at all -- including the exactly-one-unbounded-row case
 * the old index covered, so it strictly subsumes it -- and Postgres enforces
 * it the same way it enforces a unique constraint under concurrent writers:
 * a second, genuinely concurrent INSERT/UPDATE whose range would overlap an
 * already-committed (or still-uncommitted-but-locked) row's range is made to
 * wait and then fails at commit, never silently succeeds.
 */
export const ROUTE_PRICE_HISTORY_EXCLUSION_CONSTRAINT_NAME =
  'EXCL_route_price_history_no_overlap';

export async function ensureRoutePriceHistoryNoOverlapConstraint(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  await query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = '${ROUTE_PRICE_HISTORY_EXCLUSION_CONSTRAINT_NAME}'
    ) THEN
      ALTER TABLE public.transport_route_price_history
        ADD CONSTRAINT "${ROUTE_PRICE_HISTORY_EXCLUSION_CONSTRAINT_NAME}"
        EXCLUDE USING gist ("routeId" WITH =, tsrange("effectiveFrom", "effectiveTo") WITH &&);
    END IF;
  END $$`);
}
