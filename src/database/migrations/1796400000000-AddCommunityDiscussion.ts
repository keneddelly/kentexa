import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communities built for discussion (issue #374 part D, owner approved 2026-11-16). Additive only:
 *  - business_feed_item."pinnedAt"        a moderator pinned the post to the top of its community;
 *  - business_feed_item."repliesLocked"   a moderator closed replies on it;
 *  - business_feed_item."bestCommentId"   the reply the writer (or a moderator) chose as "Jibu bora";
 *  - community_member."lastSeenAt"        when the member last opened the community's list,
 *                                         so threads with new replies show a dot;
 *  - an index for a post's replies by time (reply counts and "jibu la mwisho").
 * Owner rule: never run down() on live.
 */
export class AddCommunityDiscussion1796400000000 implements MigrationInterface {
  name = 'AddCommunityDiscussion1796400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "pinnedAt" timestamptz NULL`);
    await q.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "repliesLocked" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "bestCommentId" integer NULL`);
    await q.query(`ALTER TABLE public.community_member ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamptz NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_post_comment_post_created" ON public.post_comment ("postId", "createdAt") WHERE "postId" IS NOT NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_feed_item_community_pinned" ON public.business_feed_item ("communityId", "pinnedAt") WHERE "pinnedAt" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP INDEX IF EXISTS public."IDX_feed_item_community_pinned"`);
    await q.query(`DROP INDEX IF EXISTS public."IDX_post_comment_post_created"`);
    await q.query(`ALTER TABLE public.community_member DROP COLUMN IF EXISTS "lastSeenAt"`);
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "bestCommentId"`);
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "repliesLocked"`);
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "pinnedAt"`);
  }
}
