import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hashtags (owner approved 2026-11-15, "approve"):
 *  - hashtag: one row per tag, by its key (#Mitumba and #mitumba are one tag). An admin can
 *    block a tag; its page then shows nothing and it is not suggested.
 *  - hashtag_usage: which posts use which tag. Rebuilt from the post's text on publish and
 *    edit, removed on delete. Old posts are filled in by the admin backfill.
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddHashtags1796100000000 implements MigrationInterface {
  name = 'AddHashtags1796100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.hashtag (
      id SERIAL PRIMARY KEY,
      key varchar(100) NOT NULL UNIQUE,
      display varchar(100) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'active',
      "createdAt" timestamptz NOT NULL DEFAULT NOW())`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.hashtag_usage (
      "hashtagId" int NOT NULL REFERENCES public.hashtag(id) ON DELETE CASCADE,
      "contentType" varchar(12) NOT NULL,
      "contentId" int NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("hashtagId", "contentType", "contentId"))`);
    // Composer suggestions look tags up by the start of the key (#mit → mitumba).
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_hashtag_key_prefix" ON public.hashtag (key varchar_pattern_ops)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_hashtag_usage_content" ON public.hashtag_usage ("contentType", "contentId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP TABLE IF EXISTS public.hashtag_usage`);
    await q.query(`DROP TABLE IF EXISTS public.hashtag`);
  }
}
