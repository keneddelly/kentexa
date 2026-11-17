import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ada ya KenteXa for ofisi: TZS 500 per parcel (owner 2026-11-17: "the invoice is too large for
 * office to pay; we can use simple fixed price that is 500 per parcel"). Owner choices:
 *  - the fees already written since the start (before the first ankara on 1 December) become 500;
 *  - a parcel the ofisi charged less than 500 for pays what it charged (a free parcel pays nothing);
 *  - the first 20 parcels stay free.
 * The rule is the settings min = cap = 500 (10% of anything is then 500, never more than earned).
 * Every changed fee is recorded first in kentexa_fee_repriced with its old amount, so nothing is
 * lost. Months that already have an ankara are never changed. Agents and sellers are unchanged.
 * Owner rule: never run down() on live.
 */
export class OfficeFeeFlat5001797200000000 implements MigrationInterface {
  name = 'OfficeFeeFlat5001797200000000';

  public async up(q: QueryRunner): Promise<void> {
    const [ready] = await q.query(`SELECT to_regclass('public.kentexa_fee') IS NOT NULL AS ok`);
    if (!ready?.ok) return;
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.kentexa_fee_repriced (
        id serial PRIMARY KEY,
        "feeId" integer NOT NULL,
        "oldFee" numeric(12,2) NOT NULL,
        "newFee" numeric(12,2) NOT NULL,
        reason varchar(80) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_kentexa_fee_repriced" UNIQUE ("feeId", reason)
      )`);
    await q.query(`INSERT INTO public.kentexa_fee_setting (key, value, "updatedAt") VALUES ('office_min', '500', now()), ('office_cap', '500', now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`);
    const invoices = await q.query(`SELECT to_regclass('public.kentexa_fee_invoice') IS NOT NULL AS ok`);
    const notInvoiced = invoices?.[0]?.ok
      ? `AND NOT EXISTS (SELECT 1 FROM public.kentexa_fee_invoice i WHERE i."accountType" = 'office' AND i."accountId" = f."accountId"
           AND i."periodStart" = date_trunc('month', f."doneAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date)`
      : '';
    const pick = `FROM public.kentexa_fee f
      WHERE f."accountType" = 'office' AND f."freeJob" = false AND f."baseAmount" > 0
        AND f.fee <> LEAST(500, ROUND(f."baseAmount")) ${notInvoiced}`;
    await q.query(`INSERT INTO public.kentexa_fee_repriced ("feeId", "oldFee", "newFee", reason)
      SELECT f.id, f.fee, LEAST(500, ROUND(f."baseAmount")), 'office_flat_500_2026_11_17' ${pick}
      ON CONFLICT DO NOTHING`);
    await q.query(`UPDATE public.kentexa_fee f SET fee = LEAST(500, ROUND(f."baseAmount"))
      WHERE f.id IN (SELECT "feeId" FROM public.kentexa_fee_repriced WHERE reason = 'office_flat_500_2026_11_17')
        AND f."accountType" = 'office'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE public.kentexa_fee f SET fee = r."oldFee" FROM public.kentexa_fee_repriced r
      WHERE r."feeId" = f.id AND r.reason = 'office_flat_500_2026_11_17'`);
    await q.query(`UPDATE public.kentexa_fee_setting SET value = '200' WHERE key = 'office_min'`);
    await q.query(`UPDATE public.kentexa_fee_setting SET value = '5000' WHERE key = 'office_cap'`);
  }
}
