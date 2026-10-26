import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Advertiser applications (owner 2026-10-26: "make it self service where user submit
 * application then admin review and accept by giving the advertisement link").
 *
 *   advertiser_application - a logged-in user asks to become an advertiser (name,
 *                            phone, area, how they will bring people). Admin accepts
 *                            (an advertiser row with its link is created for that
 *                            user) or rejects with a reason; a rejected user may
 *                            apply again. At most one pending application per user.
 *
 * Deploy-order safe: until this runs the app does not offer the application.
 * Owner rule: never run down() on live.
 */
export class AddAdvertiserApplications1793300000000 implements MigrationInterface {
  name = 'AddAdvertiserApplications1793300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.advertiser_application (
      id serial PRIMARY KEY,
      "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL,
      phone varchar(20) NOT NULL,
      area varchar(120) NULL,
      plan varchar(500) NULL,
      status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      reason varchar(300) NULL,
      "advertiserId" integer NULL REFERENCES public.advertiser(id) ON DELETE SET NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "decidedAt" timestamp NULL
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_advertiser_application_pending_user"
      ON public.advertiser_application ("userId") WHERE status = 'pending'`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_advertiser_application_status"
      ON public.advertiser_application (status, "createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.advertiser_application`);
  }
}
