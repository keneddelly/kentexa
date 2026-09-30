import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensureSuperAgentHandlingRateNoOverlapConstraint,
  ensureSuperAgentEconomicLedgersImmutable,
} from '../../super-agent-commission/super-agent-commission-schema';

/**
 * Stage 3S-C5: the Super Agent handling-commission + cash-desk collection
 * foundation. Three new, additive tables -- no change to any existing table
 * except reading from ParcelCustodyEvent (unaltered here).
 *
 * Seeds exactly one row: the pilot's initial TZS 500 handling rate,
 * open-ended from this migration's own run time. Data-driven, not a
 * business-logic constant -- SuperAgentHandlingRateService always reads this
 * table, never a hard-coded number.
 *
 * super_agent/parcel still have no real CREATE TABLE migration anywhere in
 * this codebase (the same long-standing, repeatedly-documented condition
 * every Stage 3S-C migration already flags) -- FKs to
 * public.super_agent(id)/public.parcel(id) are therefore NOT declared here,
 * consistent with every prior migration's own treatment of those two tables.
 * super_agent_handling_rate/parcel_custody_event DO have real migrations, so
 * FKs to them ARE declared.
 *
 * Post-review correction (Stage 3S-C5 re-review, applied in place since this
 * migration has never been merged or deployed): added CHECK constraints for
 * positive rate amounts, valid (from < to) rate windows, and positive
 * collected/nonnegative price-context amounts on the cash collection table --
 * the reviewer's "enforce basic financial validity" finding. Mirrored on both
 * entities as plain @Check decorators (see super-agent-commission-schema.ts's
 * own comment for why a migration-only CHECK is otherwise invisible to a
 * synchronize:true test schema).
 */
export class AddSuperAgentCommissionFoundation1788287400000 implements MigrationInterface {
  name = 'AddSuperAgentCommissionFoundation1788287400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_agent_handling_rate (
        id SERIAL PRIMARY KEY,
        "commissionType" character varying(32) NOT NULL,
        scope character varying(32) NOT NULL DEFAULT 'global',
        amount numeric(10,2) NOT NULL,
        currency character varying(8) NOT NULL DEFAULT 'TZS',
        "effectiveFrom" timestamp NOT NULL,
        "effectiveTo" timestamp,
        "isActive" boolean NOT NULL DEFAULT true,
        reason text,
        "createdByUserId" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_super_agent_handling_rate_amount_positive" CHECK (amount > 0),
        CONSTRAINT "CHK_super_agent_handling_rate_window_valid"
          CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
      )`);
    await ensureSuperAgentHandlingRateNoOverlapConstraint((sql) => queryRunner.query(sql));

    // The pilot's own initial configuration -- data-driven from the first
    // moment this table exists, never a business-logic constant.
    await queryRunner.query(`
      INSERT INTO public.super_agent_handling_rate
        ("commissionType", scope, amount, currency, "effectiveFrom", "isActive", reason, "createdByUserId")
      SELECT 'handling', 'global', 500, 'TZS', now(), true,
        'Initial Kentexa Van pilot configuration (Stage 3S-C5)', NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM public.super_agent_handling_rate WHERE "commissionType" = 'handling' AND scope = 'global'
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_agent_handling_earning (
        id SERIAL PRIMARY KEY,
        "custodyEventId" integer NOT NULL,
        "parcelId" integer NOT NULL,
        "superAgentId" integer NOT NULL,
        "rateConfigId" integer NOT NULL,
        amount numeric(10,2) NOT NULL,
        currency character varying(8) NOT NULL,
        source character varying(64) NOT NULL,
        "actorUserId" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_super_agent_handling_earning_custody_event" FOREIGN KEY ("custodyEventId")
          REFERENCES public.parcel_custody_event(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_super_agent_handling_earning_rate_config" FOREIGN KEY ("rateConfigId")
          REFERENCES public.super_agent_handling_rate(id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_super_agent_handling_earning_custody_event"
      ON public.super_agent_handling_earning ("custodyEventId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_agent_cash_collection (
        id SERIAL PRIMARY KEY,
        "parcelId" integer NOT NULL,
        "superAgentId" integer NOT NULL,
        "quoteId" integer,
        "priceContextAmount" numeric(10,2) NOT NULL,
        "priceContextCurrency" character varying(8) NOT NULL,
        "collectedAmount" numeric(10,2) NOT NULL,
        currency character varying(8) NOT NULL,
        "paymentMethod" character varying(24) NOT NULL,
        "actorUserId" integer NOT NULL,
        "receiptReference" character varying(128),
        "idempotencyKey" character varying(128) NOT NULL,
        "reconciliationStatus" character varying(24) NOT NULL DEFAULT 'pending',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_super_agent_cash_collection_payment_method" CHECK ("paymentMethod" IN ('cash')),
        CONSTRAINT "CHK_super_agent_cash_collection_reconciliation_status"
          CHECK ("reconciliationStatus" IN ('pending', 'reconciled')),
        CONSTRAINT "CHK_super_agent_cash_collection_amount_positive" CHECK ("collectedAmount" > 0),
        CONSTRAINT "CHK_super_agent_cash_collection_price_context_nonnegative" CHECK ("priceContextAmount" >= 0)
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_super_agent_cash_collection_idempotency"
      ON public.super_agent_cash_collection ("idempotencyKey")`);

    await ensureSuperAgentEconomicLedgersImmutable((sql) => queryRunner.query(sql));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE public.super_agent_cash_collection, public.super_agent_handling_earning,
      public.super_agent_handling_rate IN ACCESS EXCLUSIVE MODE`);

    const earnings: { exists: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM public.super_agent_handling_earning LIMIT 1) AS "exists"`,
    );
    if (earnings[0]?.exists) throw new Error('Cannot revert: nonempty super agent handling earning history');

    const collections: { exists: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM public.super_agent_cash_collection LIMIT 1) AS "exists"`,
    );
    if (collections[0]?.exists) throw new Error('Cannot revert: nonempty super agent cash collection history');

    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_super_agent_cash_collection_immutable" ON public.super_agent_cash_collection`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public."fn_super_agent_cash_collection_immutable"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_cash_collection`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_super_agent_handling_earning_immutable" ON public.super_agent_handling_earning`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public."fn_super_agent_handling_earning_immutable"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_handling_earning`);

    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_handling_rate`);
  }
}
