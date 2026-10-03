import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C7 — Payment Validation and Cash-Desk Settlement Foundation.
 * Based on approved Stage 3S-C6 head `7c1bb9d`. New migration (own gate,
 * new tables) -- the ONE exception is `wallet`, a foundational, already-
 * deployed table from the I2G gate (1788264600000-AddWalletXorOwnership):
 * that migration is left untouched; this one only ADDS a third, optional
 * owner column and extends its existing CHECK, never rewriting its own
 * history.
 *
 * 1. `wallet` gains a `superAgentId` owner column. A Super Agent cannot
 *    safely reuse its operator's Personal wallet: `SuperAgent.userId` is
 *    only unique when `workspaceId IS NULL` (UQ_super_agent_unbound_user)
 *    -- a single user can legitimately operate MULTIPLE workspace-bound
 *    Super Agent hubs, so a Personal-wallet mapping would silently merge
 *    two different Super Agents' settlement money into one wallet. This
 *    extends the SAME exactly-one-owner vocabulary (CK_wallet_exactly_
 *    one_owner) with a third, equally exclusive owner type rather than
 *    guessing a mapping onto an existing one -- "reuse existing Wallet
 *    primitives and ownership/type vocabulary" per the C7 authorization.
 *
 * 2. Seven new, append-only C7 tables, all immutable (BEFORE UPDATE/DELETE
 *    trigger, mirroring ParcelCustodyEvent/SuperAgentHandlingEarning's own
 *    established technique) -- "frozen... cannot be changed except through
 *    a new adjustment/version":
 *
 *    super_agent_settlement_proposal          -- Part A: one frozen
 *      snapshot per (superAgentId, currency, period). No money movement.
 *    super_agent_settlement_earning_member    -- which SuperAgentHandling-
 *      Earning rows this settlement claims. UNIQUE(earningId) GLOBALLY --
 *      an earning can belong to at most one settlement, ever, across all
 *      time; this uniqueness IS the "no double-counting" authority, not a
 *      status flag on the (immutable) earning row itself.
 *    super_agent_settlement_cash_collection_member -- same guarantee for
 *      SuperAgentCashCollection rows: UNIQUE(cashCollectionId) globally.
 *    super_agent_cash_remittance               -- Part B-A: an immutable
 *      record that a Super Agent physically handed back collected cash.
 *    super_agent_cash_remittance_allocation    -- which cash-collection
 *      rows a remittance covers. Full-collection-only allocation (the
 *      existing SuperAgentCashCollection model has no "remaining
 *      unallocated amount" tracking, so partial allocation cannot be
 *      safely represented without redesigning that table -- out of this
 *      gate's scope per its own authorization). UNIQUE(cashCollectionId)
 *      globally: a collection can be remitted at most once, ever -- this
 *      is what makes `SuperAgentCashCollection.reconciliationStatus`
 *      effectively vestigial (it defaults to 'pending' at INSERT and can
 *      never be updated afterward -- the table is immutable -- so true
 *      reconciliation state is always DERIVED from this allocation table's
 *      own existence, never from that column; see the entity's own
 *      updated comment).
 *    super_agent_handling_earning_payout       -- Part B-B: an immutable
 *      record of one wallet-crediting payout, scoped to exactly one
 *      settlement proposal (UNIQUE(settlementProposalId) -- a settlement
 *      can be paid out at most once, ever) and carrying the real
 *      wallet_transaction id it credited.
 *    super_agent_handling_earning_payout_allocation -- which earning rows
 *      a payout covers. UNIQUE(earningId) globally: an earning can be paid
 *      at most once, ever -- "use payout/allocation uniqueness as the
 *      financial authority," not a mutable payoutStatus column (which the
 *      immutable earning table couldn't support anyway).
 *
 * No change to SuperAgent.totalEarnings/pendingEarnings/withdrawableEarnings/
 * commissionRate, and no change to codCashHeld/outstandingBalance/
 * recordCodCashRemittance -- explicitly out of scope per the C7 scope
 * decisions (legacy fields untouched; Agent COD accounting untouched).
 */
export class AddSuperAgentSettlementFoundation1788288600000 implements MigrationInterface {
  name = 'AddSuperAgentSettlementFoundation1788288600000';

  private async immutable(queryRunner: QueryRunner, table: string): Promise<void> {
    const fn = `fn_${table}_immutable`;
    const trigger = `TRG_${table}_immutable`;
    await queryRunner.query(`CREATE OR REPLACE FUNCTION public."${fn}"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '${table.replace(/_/g, ' ')} history is immutable' USING ERRCODE = '23514';
      END $$`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "${trigger}" ON public.${table}`);
    await queryRunner.query(`CREATE TRIGGER "${trigger}"
      BEFORE UPDATE OR DELETE ON public.${table}
      FOR EACH ROW EXECUTE FUNCTION public."${fn}"()`);
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Wallet: third owner type.
    await queryRunner.query(`ALTER TABLE public.wallet ADD COLUMN IF NOT EXISTS "superAgentId" integer`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT IF EXISTS "CK_wallet_exactly_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE public.wallet ADD CONSTRAINT "CK_wallet_exactly_one_owner"
        CHECK (
          (("userId" IS NOT NULL)::int + ("workspaceId" IS NOT NULL)::int + ("superAgentId" IS NOT NULL)::int) = 1
        )`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT IF EXISTS "FK_wallet_super_agent"`);
    await queryRunner.query(`
      ALTER TABLE public.wallet ADD CONSTRAINT "FK_wallet_super_agent"
        FOREIGN KEY ("superAgentId") REFERENCES public.super_agent(id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wallet_super_agent" ON public.wallet ("superAgentId") WHERE "superAgentId" IS NOT NULL`);

    // 2a. Settlement proposal (Part A).
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_settlement_proposal (
      id SERIAL PRIMARY KEY,
      "superAgentId" integer NOT NULL,
      currency varchar(8) NOT NULL,
      "periodStart" timestamp without time zone NOT NULL,
      "periodEnd" timestamp without time zone NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'finalized',
      "totalEarningsAmount" decimal(12,2) NOT NULL DEFAULT 0,
      "totalEarningsCount" integer NOT NULL DEFAULT 0,
      "totalCashCollectedAmount" decimal(12,2) NOT NULL DEFAULT 0,
      "totalCashCollectedCount" integer NOT NULL DEFAULT 0,
      "totalCashRemittedAmount" decimal(12,2) NOT NULL DEFAULT 0,
      "totalCashOutstandingAmount" decimal(12,2) NOT NULL DEFAULT 0,
      "hasDiscrepancy" boolean NOT NULL DEFAULT false,
      "discrepancyNote" text,
      "actorUserId" integer,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_super_agent_settlement_proposal_status" CHECK (status IN ('finalized')),
      CONSTRAINT "CHK_super_agent_settlement_proposal_period" CHECK ("periodEnd" > "periodStart"),
      CONSTRAINT "CHK_super_agent_settlement_proposal_nonnegative" CHECK (
        "totalEarningsAmount" >= 0 AND "totalCashCollectedAmount" >= 0 AND
        "totalCashRemittedAmount" >= 0 AND "totalCashOutstandingAmount" >= 0
      )
    )`);

    // 2b/2c. Settlement membership -- the "no double counting" authority.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_settlement_earning_member (
      id SERIAL PRIMARY KEY,
      "settlementProposalId" integer NOT NULL REFERENCES public.super_agent_settlement_proposal(id) ON DELETE RESTRICT,
      "earningId" integer NOT NULL REFERENCES public.super_agent_handling_earning(id) ON DELETE RESTRICT,
      CONSTRAINT "UQ_super_agent_settlement_earning_member" UNIQUE ("earningId")
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_settlement_cash_collection_member (
      id SERIAL PRIMARY KEY,
      "settlementProposalId" integer NOT NULL REFERENCES public.super_agent_settlement_proposal(id) ON DELETE RESTRICT,
      "cashCollectionId" integer NOT NULL REFERENCES public.super_agent_cash_collection(id) ON DELETE RESTRICT,
      CONSTRAINT "UQ_super_agent_settlement_cash_collection_member" UNIQUE ("cashCollectionId")
    )`);

    // 3a. Cash remittance (Part B-A).
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_cash_remittance (
      id SERIAL PRIMARY KEY,
      "superAgentId" integer NOT NULL,
      currency varchar(8) NOT NULL,
      amount decimal(12,2) NOT NULL,
      "actorUserId" integer NOT NULL,
      "evidenceRef" varchar(128),
      "idempotencyKey" varchar(128) NOT NULL,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_super_agent_cash_remittance_idempotency" UNIQUE ("idempotencyKey"),
      CONSTRAINT "CHK_super_agent_cash_remittance_amount_positive" CHECK (amount > 0)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_cash_remittance_allocation (
      id SERIAL PRIMARY KEY,
      "remittanceId" integer NOT NULL REFERENCES public.super_agent_cash_remittance(id) ON DELETE RESTRICT,
      "cashCollectionId" integer NOT NULL REFERENCES public.super_agent_cash_collection(id) ON DELETE RESTRICT,
      "allocatedAmount" decimal(12,2) NOT NULL,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_super_agent_cash_remittance_allocation_collection" UNIQUE ("cashCollectionId"),
      CONSTRAINT "CHK_super_agent_cash_remittance_allocation_amount_positive" CHECK ("allocatedAmount" > 0)
    )`);

    // 3b. Earning payout (Part B-B).
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_handling_earning_payout (
      id SERIAL PRIMARY KEY,
      "settlementProposalId" integer NOT NULL REFERENCES public.super_agent_settlement_proposal(id) ON DELETE RESTRICT,
      "superAgentId" integer NOT NULL,
      currency varchar(8) NOT NULL,
      amount decimal(12,2) NOT NULL,
      "walletTransactionId" integer NOT NULL REFERENCES public.wallet_transaction(id) ON DELETE RESTRICT,
      "actorUserId" integer,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_super_agent_handling_earning_payout_settlement" UNIQUE ("settlementProposalId"),
      CONSTRAINT "CHK_super_agent_handling_earning_payout_amount_positive" CHECK (amount > 0)
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_handling_earning_payout_allocation (
      id SERIAL PRIMARY KEY,
      "payoutId" integer NOT NULL REFERENCES public.super_agent_handling_earning_payout(id) ON DELETE RESTRICT,
      "earningId" integer NOT NULL REFERENCES public.super_agent_handling_earning(id) ON DELETE RESTRICT,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_super_agent_handling_earning_payout_allocation_earning" UNIQUE ("earningId")
    )`);

    for (const table of [
      'super_agent_settlement_proposal',
      'super_agent_settlement_earning_member',
      'super_agent_settlement_cash_collection_member',
      'super_agent_cash_remittance',
      'super_agent_cash_remittance_allocation',
      'super_agent_handling_earning_payout',
      'super_agent_handling_earning_payout_allocation',
    ]) {
      await this.immutable(queryRunner, table);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'super_agent_handling_earning_payout_allocation',
      'super_agent_handling_earning_payout',
      'super_agent_cash_remittance_allocation',
      'super_agent_cash_remittance',
      'super_agent_settlement_cash_collection_member',
      'super_agent_settlement_earning_member',
      'super_agent_settlement_proposal',
    ]) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_${table}_immutable" ON public.${table}`);
      await queryRunner.query(`DROP FUNCTION IF EXISTS public."fn_${table}_immutable"()`);
      await queryRunner.query(`DROP TABLE IF EXISTS public.${table}`);
    }

    const ws = await queryRunner.query(`SELECT count(*)::int AS n FROM public.wallet WHERE "superAgentId" IS NOT NULL`);
    if (ws[0].n > 0) {
      throw new Error('C7 wallet down refused: Super Agent wallets exist; restore-forward instead');
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wallet_super_agent"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT IF EXISTS "FK_wallet_super_agent"`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP CONSTRAINT IF EXISTS "CK_wallet_exactly_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE public.wallet ADD CONSTRAINT "CK_wallet_exactly_one_owner"
        CHECK (("userId" IS NOT NULL AND "workspaceId" IS NULL) OR ("userId" IS NULL AND "workspaceId" IS NOT NULL))`);
    await queryRunner.query(`ALTER TABLE public.wallet DROP COLUMN IF EXISTS "superAgentId"`);
  }
}
