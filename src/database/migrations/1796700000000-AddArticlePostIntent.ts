import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makala (owner approved 2026-11-16): business_feed_item_intent_enum gains 'article', a long
 * article with a title, an optional cover photo, sub-headings, lists and quotes.
 *
 * Additive. The new value is not used inside this migration. Owner rule: never run down() on live.
 */
export class AddArticlePostIntent1796700000000 implements MigrationInterface {
  name = 'AddArticlePostIntent1796700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.business_feed_item_intent_enum ADD VALUE IF NOT EXISTS 'article'`);
  }

  // A PostgreSQL enum value cannot be dropped safely; nothing to undo.
  public async down(): Promise<void> {
    return undefined;
  }
}
