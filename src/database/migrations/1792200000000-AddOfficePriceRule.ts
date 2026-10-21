import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Office price rule (owner 2026-10-21, NEXT_STEPS section 12). See
 * src/super-agents/office-price.ts.
 *
 * super_agent_price_rule: one row per Super Agent office - how it charges for
 *   transport: "chargeMode" 'value' (percent of goods value, with a minimum) or
 *   'kg' (its existing per-destination shipping_rate rows). No row = the default
 *   (10%, minimum 5,000 TZS). Carries a currency and a country (default TZS / TZ).
 * invoice."breakdown": the price lines (pickup, transport, delivery, total, and the
 *   charged amount / change reason) frozen on a counter parcel's invoice. NULL for
 *   every existing invoice; adding a nullable column without a default is a
 *   metadata-only change.
 *
 * Nothing existing is changed. Owner rule: never run down() on live.
 */
export class AddOfficePriceRule1792200000000 implements MigrationInterface {
  name = 'AddOfficePriceRule1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.super_agent_price_rule (
        id SERIAL PRIMARY KEY,
        "superAgentId" integer NOT NULL REFERENCES public.super_agent(id) ON DELETE CASCADE,
        "chargeMode" varchar(10) NOT NULL DEFAULT 'value',
        "valuePercent" numeric(5,2) NOT NULL DEFAULT 10,
        "valueMinimum" numeric(12,2) NOT NULL DEFAULT 5000,
        currency varchar(3) NOT NULL DEFAULT 'TZS',
        country varchar(2) NOT NULL DEFAULT 'TZ',
        "updatedByUserId" integer NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_super_agent_price_rule_office" UNIQUE ("superAgentId"),
        CONSTRAINT "CHK_super_agent_price_rule_mode" CHECK ("chargeMode" IN ('value', 'kg')),
        CONSTRAINT "CHK_super_agent_price_rule_percent" CHECK ("valuePercent" > 0 AND "valuePercent" <= 100),
        CONSTRAINT "CHK_super_agent_price_rule_minimum" CHECK ("valueMinimum" >= 0)
      )`);
    await queryRunner.query(`ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS "breakdown" jsonb NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.invoice DROP COLUMN IF EXISTS "breakdown"`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.super_agent_price_rule`);
  }
}
