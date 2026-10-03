/**
 * Shared DB-level no-overlap guarantee for SuperAgentHandlingRate
 * (Stage 3S-C5), reusing Stage 3S-B4's own established technique
 * (route-price-history-schema.ts) for the identical reason: TypeORM's
 * entity decorators cannot express a cross-row range-EXCLUDE constraint, so
 * this can't live on the entity itself. Applied from exactly two places --
 * the real migration and every real-Postgres test's synchronize:true schema
 * (which only builds from entity decorators and therefore never sees the
 * migration's own SQL) -- so the constraint text exists in one place.
 *
 * Unlike B4's own constraint, this one is PARTIAL (`WHERE ("isActive")`):
 * a retracted, still-future draft (isActive = false) must free its own time
 * range immediately so a corrected replacement can be configured at the
 * same window, without needing B4's own split/reschedule-in-place machinery
 * (this pilot's commission rate has no requirement to ever split an
 * already-in-effect window -- only to reject a genuinely overlapping new
 * configuration, or let a not-yet-effective mistake be withdrawn).
 */
export const SUPER_AGENT_HANDLING_RATE_EXCLUSION_CONSTRAINT_NAME =
  'EXCL_super_agent_handling_rate_no_overlap';

export async function ensureSuperAgentHandlingRateNoOverlapConstraint(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  await query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = '${SUPER_AGENT_HANDLING_RATE_EXCLUSION_CONSTRAINT_NAME}'
    ) THEN
      ALTER TABLE public.super_agent_handling_rate
        ADD CONSTRAINT "${SUPER_AGENT_HANDLING_RATE_EXCLUSION_CONSTRAINT_NAME}"
        EXCLUDE USING gist (
          "commissionType" WITH =,
          scope WITH =,
          tsrange("effectiveFrom", "effectiveTo") WITH &&
        ) WHERE ("isActive");
    END IF;
  END $$`);
}

/**
 * Immutability (BEFORE UPDATE/DELETE raises an exception) for both new
 * economic ledgers, reusing ParcelCustodyEvent's own established technique.
 * TypeORM has no decorator for a trigger at all, so -- exactly like the
 * exclusion constraint above -- a synchronize:true test schema never sees
 * one unless this same function is called from both the real migration and
 * the test's own setup.
 */
export async function ensureSuperAgentEconomicLedgersImmutable(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  for (const table of ['super_agent_handling_earning', 'super_agent_cash_collection']) {
    const fn = `fn_${table}_immutable`;
    const trigger = `TRG_${table}_immutable`;
    await query(`CREATE OR REPLACE FUNCTION public."${fn}"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '${table.replace(/_/g, ' ')} history is immutable' USING ERRCODE = '23514';
      END $$`);
    await query(`DROP TRIGGER IF EXISTS "${trigger}" ON public.${table}`);
    await query(`CREATE TRIGGER "${trigger}"
      BEFORE UPDATE OR DELETE ON public.${table}
      FOR EACH ROW EXECUTE FUNCTION public."${fn}"()`);
  }
}
