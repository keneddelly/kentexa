import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C6: adds the "receiver-confirmed" terminal state to
 * ParcelRunAssignment, and a cross-pathway deduplication safety net to
 * SuperAgentHandlingEarning. Both changes are additive to already-approved
 * gates (C3, C5) -- their own migrations are left untouched, matching this
 * lineage's own established convention (C2 added Vehicle via a new
 * migration rather than editing C1's; C4 added the custody discriminator
 * via a new migration rather than editing C1's original
 * AddParcelCustodyEvent).
 *
 * 1. `parcel_run_assignment.status` gains 'received' -- the destination
 *    Super Agent's own confirmation that they physically received the
 *    parcel, a genuinely separate real-world moment from `markUnloaded`
 *    (the transport PROVIDER's own claim that the parcel came off the
 *    vehicle). `receivedAt` mirrors `loadedAt`/`unloadedAt`'s own
 *    convention. 'received' is additive to the existing partial unique
 *    index's definition of "active" (`scheduled`/`loaded`) -- it was never
 *    included, so it needs no change: a received assignment is terminal,
 *    exactly like `unloaded` already was, freeing the parcel for a new
 *    assignment.
 *
 * 2. `super_agent_handling_earning` gains a UNIQUE (parcelId, superAgentId)
 *    index -- the cross-pathway deduplication safety net Stage 3S-C5's own
 *    report documented as a plan rather than built: two DIFFERENT custody
 *    events (e.g. one from a legacy pathway, one from the new Run-based
 *    pathway) that both happen to describe what is really the SAME Super
 *    Agent physically handling the SAME parcel can now never each
 *    independently generate a second earning. The existing UNIQUE
 *    custodyEventId index is unrelated and untouched -- that one protects
 *    against reprocessing the SAME event twice; this one protects against
 *    two DIFFERENT events describing the same physical fact. Deliberately
 *    conservative: this also means one Super Agent can only ever earn ONCE
 *    per parcel in this schema (e.g. a genuine return/reship scenario where
 *    the same hub legitimately handles the same parcel twice would earn
 *    only the first time) -- failing toward under-payment rather than
 *    over-payment is the safe direction for a financial constraint, and can
 *    be revisited with an explicit adjustment mechanism if real pilot
 *    operation shows it matters.
 */
export class AddReceiptConfirmationAndCommissionDedup1788288000000 implements MigrationInterface {
  name = 'AddReceiptConfirmationAndCommissionDedup1788288000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment
      DROP CONSTRAINT IF EXISTS "CHK_parcel_run_assignment_status"`);
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment
      ADD CONSTRAINT "CHK_parcel_run_assignment_status"
      CHECK (status IN ('scheduled','loaded','unloaded','received','cancelled'))`);
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment
      ADD COLUMN IF NOT EXISTS "receivedAt" timestamp without time zone`);

    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UQ_super_agent_handling_earning_parcel_agent'
      ) THEN
        ALTER TABLE public.super_agent_handling_earning
          ADD CONSTRAINT "UQ_super_agent_handling_earning_parcel_agent" UNIQUE ("parcelId", "superAgentId");
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      DROP CONSTRAINT IF EXISTS "UQ_super_agent_handling_earning_parcel_agent"`);

    await queryRunner.query(`LOCK TABLE public.parcel_run_assignment IN ACCESS EXCLUSIVE MODE`);
    const [{ exists: hasReceived }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM public.parcel_run_assignment WHERE status = 'received') AS exists`,
    );
    if (hasReceived) {
      throw new Error('refusing to remove the received status while receipt-confirmed assignments exist');
    }
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment DROP COLUMN IF EXISTS "receivedAt"`);
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment
      DROP CONSTRAINT IF EXISTS "CHK_parcel_run_assignment_status"`);
    await queryRunner.query(`ALTER TABLE public.parcel_run_assignment
      ADD CONSTRAINT "CHK_parcel_run_assignment_status"
      CHECK (status IN ('scheduled','loaded','unloaded','cancelled'))`);
  }
}
