import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Uza tena" growth (owner 2026-11-10, "start"):
 *  - resale_offer_open: how many people opened a reseller's link, by where it was shared
 *    (WhatsApp Status or a normal share) and by day, so a reseller sees what works;
 *  - order."resaleSource": where the buyer of a resale order came from;
 *  - resale_member."nudgedAt": the one reminder sent a day after joining with no offer yet.
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddResaleTracking1796000000000 implements MigrationInterface {
  name = 'AddResaleTracking1796000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.resale_offer_open (
      "offerId" int NOT NULL REFERENCES public.resale_offer(id) ON DELETE CASCADE,
      source varchar(12) NOT NULL,
      day date NOT NULL DEFAULT CURRENT_DATE,
      opens int NOT NULL DEFAULT 0,
      PRIMARY KEY ("offerId", source, day))`);
    await q.query(`ALTER TABLE public."order" ADD COLUMN IF NOT EXISTS "resaleSource" varchar(12) NULL`);
    await q.query(`ALTER TABLE public.resale_member ADD COLUMN IF NOT EXISTS "nudgedAt" timestamptz NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`ALTER TABLE public.resale_member DROP COLUMN IF EXISTS "nudgedAt"`);
    await q.query(`ALTER TABLE public."order" DROP COLUMN IF EXISTS "resaleSource"`);
    await q.query(`DROP TABLE IF EXISTS public.resale_offer_open`);
  }
}
