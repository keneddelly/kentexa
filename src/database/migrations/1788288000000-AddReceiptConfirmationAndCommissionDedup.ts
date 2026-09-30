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
 * 2. `super_agent_handling_earning` gains a new `sourceCustodianType` column
 *    and a UNIQUE (parcelId, superAgentId, sourceCustodianType) index -- the
 *    cross-pathway deduplication safety net Stage 3S-C5's own report
 *    documented as a plan rather than built: two DIFFERENT custody events
 *    (e.g. one from a legacy pathway, one from the new Run-based pathway)
 *    that both happen to describe what is really the SAME Super Agent
 *    physically handling the SAME parcel FROM THE SAME PRIOR CUSTODIAN TYPE
 *    can now never each independently generate a second earning -- two
 *    recordings of one real physical handoff always share the same
 *    fromCustodianType. The existing UNIQUE custodyEventId index is
 *    unrelated and untouched -- that one protects against reprocessing the
 *    SAME event twice; this one protects against two DIFFERENT events
 *    describing the same physical fact.
 *
 *    Correction (still within this same gate's own review cycle, so edited
 *    in place rather than via a follow-up migration): the first version of
 *    this constraint was (parcelId, superAgentId) alone, which wrongly
 *    blocked a Super Agent's second, genuinely separate handling operation
 *    on the same parcel (e.g. a local-loop origin receipt followed later by
 *    a real destination receipt at the same hub). `sourceCustodianType`,
 *    frozen from the qualifying event's own `fromCustodianType` ('unknown'
 *    when null), is the smallest addition that tells those two cases apart.
 *    Deliberately still conservative: one Super Agent can only ever earn
 *    ONCE per (parcel, prior-custodian-type) triple -- failing toward
 *    under-payment rather than over-payment is the safe direction for a
 *    financial constraint, and can be revisited with an explicit adjustment
 *    mechanism if real pilot operation shows it matters.
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

    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      ADD COLUMN IF NOT EXISTS "sourceCustodianType" varchar(32)`);
    // Backfill from the linked custody event's own fromCustodianType so any
    // row inserted before this column existed still gets a real, correct
    // value rather than a placeholder.
    await queryRunner.query(`UPDATE public.super_agent_handling_earning e
      SET "sourceCustodianType" = COALESCE(pce."fromCustodianType", 'unknown')
      FROM public.parcel_custody_event pce
      WHERE pce.id = e."custodyEventId" AND e."sourceCustodianType" IS NULL`);
    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      ALTER COLUMN "sourceCustodianType" SET NOT NULL`);

    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UQ_super_agent_handling_earning_parcel_agent_source'
      ) THEN
        ALTER TABLE public.super_agent_handling_earning
          ADD CONSTRAINT "UQ_super_agent_handling_earning_parcel_agent_source"
          UNIQUE ("parcelId", "superAgentId", "sourceCustodianType");
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      DROP CONSTRAINT IF EXISTS "UQ_super_agent_handling_earning_parcel_agent_source"`);
    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      DROP COLUMN IF EXISTS "sourceCustodianType"`);

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
