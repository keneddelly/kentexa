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
 * 2. `super_agent_handling_earning` gains a `physicalHandoffRef` column and a
 *    PARTIAL unique index on it (WHERE NOT NULL) -- the cross-pathway
 *    deduplication safety net, keyed on a PROVEN concrete-operation identity
 *    (the qualifying custody event's own `evidenceRef`) rather than a
 *    custodian-type category. See SuperAgentHandlingEarning's own header
 *    comment for the full reasoning; this migration went through two
 *    corrections on this point (parcelId+superAgentId alone, then adding a
 *    sourceCustodianType category column, both since abandoned in favour of
 *    this), all still within this same gate's own review cycle, so edited
 *    in place rather than via follow-up migrations each time.
 *
 * 3. A new `super_agent_handling_earning_obligation` table -- the
 *    transactional-outbox record for "this custody receipt owes an
 *    earning." Deliberately a MUTABLE processing-state table (no
 *    immutability trigger, unlike the earning/cash-collection ledgers) --
 *    see SuperAgentHandlingEarningObligation's own header comment. Its
 *    status vocabulary gained `held_ambiguous_identity` in this gate's
 *    third correction round (still the same never-merged migration, edited
 *    in place again) for the case where a qualifying receipt's physical-
 *    handoff identity can't be proven and must be held for explicit human
 *    resolution rather than automatically earning a second time.
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
      ADD COLUMN IF NOT EXISTS "physicalHandoffRef" varchar(128)`);
    // Best-effort backfill from the linked custody event's own evidenceRef
    // -- stays NULL when the custody event itself never had one, which is
    // an accepted, correctly-un-deduplicated state (see the header comment).
    await queryRunner.query(`UPDATE public.super_agent_handling_earning e
      SET "physicalHandoffRef" = pce."evidenceRef"
      FROM public.parcel_custody_event pce
      WHERE pce.id = e."custodyEventId" AND e."physicalHandoffRef" IS NULL AND pce."evidenceRef" IS NOT NULL`);

    // A PARTIAL unique index, not a table-wide UNIQUE constraint -- Postgres
    // has no "ADD CONSTRAINT ... UNIQUE ... WHERE" form, so a partial
    // uniqueness rule is always expressed as an index (same technique this
    // lineage's own shipment.entity.ts UQ_shipment_quote already uses).
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_super_agent_handling_earning_physical_handoff"
      ON public.super_agent_handling_earning ("physicalHandoffRef")
      WHERE "physicalHandoffRef" IS NOT NULL`);

    // Stage 3S-C6 second correction: the transactional-outbox obligation
    // table. Deliberately mutable (no immutability trigger) -- this tracks
    // in-flight processing state, never a final financial fact.
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.super_agent_handling_earning_obligation (
      id SERIAL PRIMARY KEY,
      "custodyEventId" integer NOT NULL,
      "parcelId" integer NOT NULL,
      "superAgentId" integer NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      "lastError" varchar(500),
      "lastAttemptedAt" timestamp without time zone,
      "resultingEarningId" integer,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_super_agent_handling_earning_obligation_custody_event" UNIQUE ("custodyEventId"),
      CONSTRAINT "CHK_super_agent_handling_earning_obligation_status_vocab"
        CHECK (status IN ('pending','processing','completed','failed_no_rate','failed_error','failed_permanent','held_ambiguous_identity')),
      CONSTRAINT "FK_super_agent_handling_earning_obligation_custody_event"
        FOREIGN KEY ("custodyEventId") REFERENCES public.parcel_custody_event(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_super_agent_handling_earning_obligation_resulting_earning"
        FOREIGN KEY ("resultingEarningId") REFERENCES public.super_agent_handling_earning(id) ON DELETE SET NULL
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_super_agent_handling_earning_obligation_status"
      ON public.super_agent_handling_earning_obligation (status)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_handling_earning_obligation`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_super_agent_handling_earning_physical_handoff"`);
    await queryRunner.query(`ALTER TABLE public.super_agent_handling_earning
      DROP COLUMN IF EXISTS "physicalHandoffRef"`);

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
