import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Advertisers (owner 2026-10-26: "I am hiring advertisers to grow KenteXa; they need
 * special registration links so they win commission for each user they bring").
 *
 *   advertiser            - added by admin: name, phone, the user account it is (by
 *                           phone, when they have one), its link code, active or not;
 *   advertiser_referral   - one row per new user who registered through a link (a
 *                           user belongs to at most one advertiser, forever);
 *   advertiser_rate       - the admin's rate per event: first listing, a business
 *                           created, an office opened, becoming a seller;
 *   advertiser_commission - one row per (user, event), earned at the rate of that
 *                           moment, later marked paid by admin. KenteXa pays its own
 *                           advertisers; it never holds customers' money.
 *
 * Deploy-order safe: until this runs the app does not record or show advertisers.
 * Owner rule: never run down() on live.
 */
export class AddAdvertisers1793100000000 implements MigrationInterface {
  name = 'AddAdvertisers1793100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.advertiser (
      id serial PRIMARY KEY,
      "userId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
      name varchar(100) NOT NULL,
      phone varchar(20) NOT NULL,
      code varchar(16) NOT NULL,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_advertiser_code" ON public.advertiser (code)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_advertiser_phone" ON public.advertiser (phone)`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.advertiser_referral (
      id serial PRIMARY KEY,
      "advertiserId" integer NOT NULL REFERENCES public.advertiser(id) ON DELETE CASCADE,
      "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_advertiser_referral_user" ON public.advertiser_referral ("userId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_advertiser_referral_advertiser" ON public.advertiser_referral ("advertiserId")`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.advertiser_rate (
      event varchar(24) PRIMARY KEY,
      amount integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )`);
    await q.query(`INSERT INTO public.advertiser_rate (event, amount) VALUES
      ('first_listing', 0), ('business', 0), ('office', 0), ('seller', 0) ON CONFLICT (event) DO NOTHING`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.advertiser_commission (
      id serial PRIMARY KEY,
      "advertiserId" integer NOT NULL REFERENCES public.advertiser(id) ON DELETE CASCADE,
      "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      event varchar(24) NOT NULL,
      amount integer NOT NULL CHECK (amount >= 0),
      status varchar(8) NOT NULL DEFAULT 'earned' CHECK (status IN ('earned', 'paid')),
      "earnedAt" timestamp NOT NULL DEFAULT now(),
      "paidAt" timestamp NULL
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_advertiser_commission_user_event" ON public.advertiser_commission ("userId", event)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_advertiser_commission_advertiser" ON public.advertiser_commission ("advertiserId", status)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.advertiser_commission`);
    await q.query(`DROP TABLE IF EXISTS public.advertiser_rate`);
    await q.query(`DROP TABLE IF EXISTS public.advertiser_referral`);
    await q.query(`DROP TABLE IF EXISTS public.advertiser`);
  }
}
