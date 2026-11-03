import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Badilisha mhudumu" (owner approved 2026-11-03: "we need the professional POS"): several
 * cashiers share one till computer, even without internet. Each cashier of the shop (the owner
 * and active team members allowed to use the POS) gets a 4-digit PIN; the till switches the
 * cashier on duty with it, and every sale, receipt and shift carries that cashier.
 *   pos_cashier_pin     per shop and cashier: a random salt and SHA-256(salt + PIN). The till keeps
 *                       these to check a PIN offline; the PIN itself is never stored.
 *   sale."cashierUserId" the cashier on duty for the sale (the logged-in account stays in
 *                       createdByUserId).
 * Additive. Owner rule: never run down() on live.
 */
export class AddPosCashierPin1795000000000 implements MigrationInterface {
  name = 'AddPosCashierPin1795000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_cashier_pin (
      "sellerId" integer NOT NULL,
      "userId" integer NOT NULL,
      salt varchar(32) NOT NULL,
      "pinHash" varchar(64) NOT NULL,
      "setByUserId" integer NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("sellerId", "userId")
    )`);
    await q.query(`ALTER TABLE public.sale ADD COLUMN IF NOT EXISTS "cashierUserId" integer NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.sale DROP COLUMN IF EXISTS "cashierUserId"`);
    await q.query(`DROP TABLE IF EXISTS public.pos_cashier_pin`);
  }
}
