import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ada ya KenteXa: monthly ankara (owner approved 2026-11-17). On the 1st of each month every
 * account that had fees last month gets one invoice: a number, the month, the jobs, the total,
 * KenteXa's Lipa Namba and a due date 30 days later. Fees and rules are unchanged (2026-11-03);
 * an invoice only groups the month's kentexa_fee rows. Whether it is paid is worked out from
 * confirmed payments (oldest invoice first), never stored, so it cannot drift.
 * Additive: one new table. Owner rule: never run down() on live.
 */
export class AddKentexaFeeInvoice1797000000000 implements MigrationInterface {
  name = 'AddKentexaFeeInvoice1797000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.kentexa_fee_invoice (
        id serial PRIMARY KEY,
        number varchar(30) NOT NULL UNIQUE,
        "accountType" varchar(10) NOT NULL,
        "accountId" integer NOT NULL,
        "accountUserId" integer NULL,
        "periodStart" date NOT NULL,
        "periodEnd" date NOT NULL,
        jobs integer NOT NULL DEFAULT 0,
        "freeJobs" integer NOT NULL DEFAULT 0,
        amount numeric(12,2) NOT NULL,
        "dueAt" date NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_kentexa_fee_invoice_period" UNIQUE ("accountType", "accountId", "periodStart")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_kentexa_fee_invoice_account" ON public.kentexa_fee_invoice ("accountType", "accountId", "periodStart")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.kentexa_fee_invoice`);
  }
}
