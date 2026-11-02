import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Home Feed phase F (owner approved 2026-11-02): repost, report, mute.
 *
 *   post_engagement_type_enum gains 'repost' (one per person per post, like a like).
 *   business_feed_item."repostCount" - kept by CvsService.recalculate from post_engagement.
 *   post_report   - one report per person per post, with a reason; status 'open' until an
 *                   admin reviews it. Nothing is hidden or removed automatically.
 *   profile_mute  - a person hides one identity's posts from their own feeds: the commerce
 *                   profile, or the account for posts made before profiles existed.
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddRepostReportMute1794000000000 implements MigrationInterface {
  name = 'AddRepostReportMute1794000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.post_engagement_type_enum ADD VALUE IF NOT EXISTS 'repost'`);
    await q.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "repostCount" integer NOT NULL DEFAULT 0`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.post_report (
      id serial PRIMARY KEY,
      "postId" integer NOT NULL REFERENCES public.business_feed_item(id) ON DELETE CASCADE,
      "reporterId" integer NOT NULL,
      reason varchar(40) NOT NULL,
      note varchar(500) NULL,
      status varchar(20) NOT NULL DEFAULT 'open',
      "reviewedAt" timestamptz NULL,
      "reviewedById" integer NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_post_report_post_reporter" UNIQUE ("postId", "reporterId"))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_post_report_open" ON public.post_report ("createdAt") WHERE status = 'open'`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.profile_mute (
      id serial PRIMARY KEY,
      "userId" integer NOT NULL,
      "mutedProfileId" integer NULL,
      "mutedUserId" integer NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_profile_mute_target" CHECK (("mutedProfileId" IS NULL) <> ("mutedUserId" IS NULL)))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_profile_mute_profile" ON public.profile_mute ("userId", "mutedProfileId") WHERE "mutedProfileId" IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_profile_mute_user" ON public.profile_mute ("userId", "mutedUserId") WHERE "mutedUserId" IS NOT NULL`);
  }

  // Drops only what it made; the enum value stays (cannot be dropped safely).
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.profile_mute`);
    await q.query(`DROP TABLE IF EXISTS public.post_report`);
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "repostCount"`);
  }
}
