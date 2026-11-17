import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ada ya KenteXa: kufungwa (owner 2026-11-17: "the threshold value should be 50000/= then the
 * account lock", "we should add even sms"). Owner choices: new work stops (work already started
 * goes on); it starts when the debt is at least TZS 50,000 AND part of it is more than 30 days
 * unpaid; it applies to ofisi, wakala and muuzaji. SMS: Mkumbushe, a new ankara, and one warning
 * 3 days before the lock. Additive: two columns and two settings.
 * Owner rule: never run down() on live.
 */
export class AddKentexaFeeLock1797300000000 implements MigrationInterface {
  name = 'AddKentexaFeeLock1797300000000';

  public async up(q: QueryRunner): Promise<void> {
    const [ready] = await q.query(`SELECT to_regclass('public.kentexa_fee_standing') IS NOT NULL AS ok`);
    if (!ready?.ok) return;
    await q.query(`ALTER TABLE public.kentexa_fee_standing ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE public.kentexa_fee_standing ADD COLUMN IF NOT EXISTS "lockedAt" timestamptz NULL`);
    await q.query(`INSERT INTO public.kentexa_fee_setting (key, value) VALUES ('lock_amount', '50000'), ('lock_warn_days', '3')
      ON CONFLICT (key) DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.kentexa_fee_standing DROP COLUMN IF EXISTS "lockedAt"`);
    await q.query(`ALTER TABLE public.kentexa_fee_standing DROP COLUMN IF EXISTS locked`);
    await q.query(`DELETE FROM public.kentexa_fee_setting WHERE key IN ('lock_amount', 'lock_warn_days')`);
  }
}
