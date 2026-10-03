/**
 * Stage 3S-C7 schema parity helpers -- mirrors
 * super-agent-commission-schema.ts's own established technique exactly:
 * TypeORM's entity decorators cannot express a CHECK on three nullable
 * columns the way raw SQL can, and a BEFORE UPDATE/DELETE trigger has no
 * decorator at all, so a synchronize:true test schema (built purely from
 * entity decorators) never sees either one unless this same function is
 * called from both the real migration and the test's own setup.
 */

/**
 * Wallet's exactly-one-owner CHECK, extended to the THIRD owner type C7
 * introduces (superAgentId). The Wallet entity itself has never carried a
 * `@Check` decorator for this invariant even for its original two-owner
 * form (I2G's own migration-only CHECK, pre-dating this gate) -- this
 * helper only ensures the NEW three-way version C7 depends on is real and
 * enforced wherever Wallet is registered in a synchronize:true DataSource
 * for a C7 test, matching the migration's own SQL exactly. It does not
 * retroactively touch the I2G migration itself.
 *
 * Also (re)creates `UQ_wallet_super_agent` -- a migration-only partial
 * unique index (same gap class), required for
 * WalletService.getOrCreateSuperAgentWallet's own `ON CONFLICT
 * ("superAgentId") WHERE "superAgentId" IS NOT NULL` upsert to resolve
 * against anything in a synchronize:true test schema.
 */
export async function ensureWalletSuperAgentOwnershipConstraint(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  await query(`ALTER TABLE public.wallet DROP CONSTRAINT IF EXISTS "CK_wallet_exactly_one_owner"`);
  await query(`
    ALTER TABLE public.wallet ADD CONSTRAINT "CK_wallet_exactly_one_owner"
      CHECK (
        (("userId" IS NOT NULL)::int + ("workspaceId" IS NOT NULL)::int + ("superAgentId" IS NOT NULL)::int) = 1
      )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wallet_super_agent" ON public.wallet ("superAgentId") WHERE "superAgentId" IS NOT NULL`);
}

/**
 * Immutability (BEFORE UPDATE/DELETE raises an exception) for all seven
 * Stage 3S-C7 tables -- settlement proposals and their membership rows are
 * "frozen... cannot be changed except through a new adjustment/version"
 * exactly like the C5/C6 earning/cash-collection ledgers; remittances,
 * remittance allocations, payouts, and payout allocations are the same
 * class of permanent financial evidence.
 */
export async function ensureSuperAgentSettlementLedgersImmutable(
  query: (sql: string) => Promise<any>,
): Promise<void> {
  for (const table of [
    'super_agent_settlement_proposal',
    'super_agent_settlement_earning_member',
    'super_agent_settlement_cash_collection_member',
    'super_agent_cash_remittance',
    'super_agent_cash_remittance_allocation',
    'super_agent_handling_earning_payout',
    'super_agent_handling_earning_payout_allocation',
  ]) {
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
