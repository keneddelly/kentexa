import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Home Feed phase D, the composer (owner approved 2026-11-02).
 *
 *   business_feed_item.media       - up to 4 photos [{url,width,height}]; NULL for older posts
 *                                    (they keep showing their single imageUrl).
 *   business_feed_item."editedAt"  - when the author edited the post (15-minute window).
 *   business_feed_item_intent_enum - gains 'question' and 'discussion' (Swali, Mjadala).
 *
 * Additive. The new enum values are not used inside this migration. Owner rule: never
 * run down() on live.
 */
export class AddPostMediaAndFormats1793800000000 implements MigrationInterface {
  name = 'AddPostMediaAndFormats1793800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.business_feed_item_intent_enum ADD VALUE IF NOT EXISTS 'question'`);
    await q.query(`ALTER TYPE public.business_feed_item_intent_enum ADD VALUE IF NOT EXISTS 'discussion'`);
    await q.query(`ALTER TABLE public.business_feed_item
      ADD COLUMN IF NOT EXISTS media jsonb NULL,
      ADD COLUMN IF NOT EXISTS "editedAt" timestamptz NULL`);
  }

  // Drops the columns only; a PostgreSQL enum value cannot be dropped safely.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "editedAt", DROP COLUMN IF EXISTS media`);
  }
}
