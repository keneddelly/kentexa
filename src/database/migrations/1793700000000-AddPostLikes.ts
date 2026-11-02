import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Home Feed phase C (owner 2026-11-02): the heart is a "like", apart from the
 * bookmark "save" (before, the heart wrote a save).
 *
 *   post_engagement_type_enum gains 'like'.
 *   business_feed_item."likeCount" - hearts on a post, kept by CvsService.recalculate
 *                                    from post_engagement, like the other counts.
 *
 * Existing 'save' rows stay saves: nothing is converted or guessed.
 * Additive. ADD VALUE IF NOT EXISTS needs PostgreSQL 9.6+ (live 18.6); the new value
 * is not used inside this migration. Owner rule: never run down() on live.
 */
export class AddPostLikes1793700000000 implements MigrationInterface {
  name = 'AddPostLikes1793700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.post_engagement_type_enum ADD VALUE IF NOT EXISTS 'like'`);
    await q.query(`ALTER TABLE public.business_feed_item
      ADD COLUMN IF NOT EXISTS "likeCount" integer NOT NULL DEFAULT 0`);
  }

  // Drops the column only; a PostgreSQL enum value cannot be dropped safely.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "likeCount"`);
  }
}
