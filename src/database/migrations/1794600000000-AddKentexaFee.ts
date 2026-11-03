import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ada ya KenteXa (owner approved 2026-11-03). Rule: only the one who made money through
 * KenteXa pays.
 *   ofisi   10% of the shipping fee it charged, min TZS 200, cap TZS 5,000, after 20 free parcels
 *   agent   10% of the delivery fee, min TZS 100, cap TZS 5,000, after 20 free deliveries
 *   seller  2% of the product price of a marketplace (checkout) order, no free orders
 *   POS, own sales, transport: free.
 * Work never stops for an unpaid fee; payment is by KenteXa's Lipa Namba + screenshot,
 * which admin confirms.
 *
 *   kentexa_fee_setting   the numbers above and the Lipa Namba (admin can change later)
 *   kentexa_fee           one row per charge; never edited; one job is never charged twice
 *   kentexa_fee_payment   a payment the account sent (screenshot), waiting/confirmed/rejected
 *   kentexa_fee_standing  per account: is any fee unpaid for more than 30 days (paid-up first)
 *   kentexa_fee_reminder  the in-app reminders already sent (never twice)
 *   kentexa_fee_cleared   the old seller-shipment debts cleared by this migration (owner: "Clear it")
 *
 * Additive, plus one owner-approved data change: seller_profile."outstandingBalance" (old
 * TZS 1,000 per seller shipment) is copied into kentexa_fee_cleared and set to 0.
 * Owner rule: never run down() on live.
 */
export class AddKentexaFee1794600000000 implements MigrationInterface {
  name = 'AddKentexaFee1794600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee_setting (
      key varchar(40) PRIMARY KEY,
      value varchar(120) NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`INSERT INTO public.kentexa_fee_setting (key, value) VALUES
      ('office_rate', '10'), ('office_min', '200'), ('office_cap', '5000'), ('office_free', '20'),
      ('agent_rate', '10'), ('agent_min', '100'), ('agent_cap', '5000'), ('agent_free', '20'),
      ('market_rate', '2'),
      ('arrears_days', '30'), ('reminder_amount', '5000'), ('agent_first_minutes', '10'),
      ('lipa_number', '10473656887'), ('lipa_name', 'Bishoo System'), ('lipa_bank', 'CRDB'),
      ('start_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      ON CONFLICT (key) DO NOTHING`);

    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee (
      id SERIAL PRIMARY KEY,
      "accountType" varchar(10) NOT NULL,
      "accountId" integer NOT NULL,
      "accountUserId" integer NULL,
      "sourceType" varchar(20) NOT NULL,
      "sourceId" integer NOT NULL,
      "sourceRef" varchar(60) NULL,
      "baseAmount" numeric(14,2) NOT NULL,
      rate numeric(6,3) NOT NULL,
      fee numeric(12,2) NOT NULL,
      "freeJob" boolean NOT NULL DEFAULT false,
      "doneAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_kentexa_fee_source" UNIQUE ("accountType", "sourceType", "sourceId")
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_kentexa_fee_account" ON public.kentexa_fee ("accountType", "accountId", "createdAt")`);

    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee_payment (
      id SERIAL PRIMARY KEY,
      "accountType" varchar(10) NOT NULL,
      "accountId" integer NOT NULL,
      "userId" integer NOT NULL,
      amount numeric(12,2) NOT NULL,
      "proofRef" varchar(200) NOT NULL,
      reference varchar(60) NULL,
      status varchar(12) NOT NULL DEFAULT 'waiting',
      reason varchar(200) NULL,
      "reviewedByUserId" integer NULL,
      "reviewedAt" timestamptz NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_kentexa_fee_payment_account" ON public.kentexa_fee_payment ("accountType", "accountId", status)`);

    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee_standing (
      "accountType" varchar(10) NOT NULL,
      "accountId" integer NOT NULL,
      "accountUserId" integer NULL,
      "inArrears" boolean NOT NULL DEFAULT false,
      owed numeric(12,2) NOT NULL DEFAULT 0,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("accountType", "accountId")
    )`);

    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee_reminder (
      id SERIAL PRIMARY KEY,
      "accountType" varchar(10) NOT NULL,
      "accountId" integer NOT NULL,
      kind varchar(20) NOT NULL,
      "periodKey" varchar(20) NOT NULL,
      "sentAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_kentexa_fee_reminder" UNIQUE ("accountType", "accountId", kind, "periodKey")
    )`);

    await q.query(`CREATE TABLE IF NOT EXISTS public.kentexa_fee_cleared (
      id SERIAL PRIMARY KEY,
      "sellerProfileId" integer NOT NULL UNIQUE,
      amount numeric(12,2) NOT NULL,
      reason varchar(120) NOT NULL,
      "clearedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`INSERT INTO public.kentexa_fee_cleared ("sellerProfileId", amount, reason)
      SELECT id, "outstandingBalance", 'Seller shipments are free from 2026-11-03 (owner approved)'
        FROM public.seller_profile WHERE "outstandingBalance" > 0
      ON CONFLICT ("sellerProfileId") DO NOTHING`);
    await q.query(`UPDATE public.seller_profile SET "outstandingBalance" = 0
      WHERE id IN (SELECT "sellerProfileId" FROM public.kentexa_fee_cleared)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE public.seller_profile sp SET "outstandingBalance" = c.amount
      FROM public.kentexa_fee_cleared c WHERE c."sellerProfileId" = sp.id`);
    for (const t of ['kentexa_fee_cleared', 'kentexa_fee_reminder', 'kentexa_fee_standing', 'kentexa_fee_payment', 'kentexa_fee', 'kentexa_fee_setting']) {
      await q.query(`DROP TABLE IF EXISTS public.${t}`);
    }
  }
}
