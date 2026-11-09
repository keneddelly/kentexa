import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Instagram through its Facebook Page (owner 2026-11-09: "investigate the Instagram connection ...
 * identify the core issue"). Kentexa signs in with Facebook Login, where Instagram messages are
 * sent and subscribed through the Page linked to the Instagram account, with the Page access
 * token (Meta: Instagram Messaging, Get started / Send a message). The old code kept the person's
 * short-lived user token and called the Instagram-Login endpoints, so the connection stopped
 * after about an hour and webhook subscription failed quietly.
 *
 *   facebookPageId / facebookPageName  the Page the Instagram account is linked to
 *   webhookError                       why Meta refused the message subscription, when it did
 * Connections made the old way have no Page and cannot send: they are marked reauth_required so
 * the business sees "Unganisha tena". Additive columns. Owner rule: never run down() on live.
 */
export class AddInstagramPageConnection1795400000000 implements MigrationInterface {
  name = 'AddInstagramPageConnection1795400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.instagram_business_connection ADD COLUMN IF NOT EXISTS "facebookPageId" varchar(128) NULL`);
    await q.query(`ALTER TABLE public.instagram_business_connection ADD COLUMN IF NOT EXISTS "facebookPageName" varchar(255) NULL`);
    await q.query(`ALTER TABLE public.instagram_business_connection ADD COLUMN IF NOT EXISTS "webhookError" varchar(300) NULL`);
    await q.query(`UPDATE public.instagram_business_connection SET status = 'reauth_required'
      WHERE "facebookPageId" IS NULL AND status = 'active'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.instagram_business_connection DROP COLUMN IF EXISTS "webhookError"`);
    await q.query(`ALTER TABLE public.instagram_business_connection DROP COLUMN IF EXISTS "facebookPageName"`);
    await q.query(`ALTER TABLE public.instagram_business_connection DROP COLUMN IF EXISTS "facebookPageId"`);
  }
}
