import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart Post: topic suggestions stored with a post (products in this first slice).
 * Additive only. Owner rule: never run down() on live.
 */
export class AddTopicSuggestions1797900000000 implements MigrationInterface {
  name = 'AddTopicSuggestions1797900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.business_feed_item ADD COLUMN IF NOT EXISTS "topicSuggestions" jsonb NULL`);
  }

  public async down(): Promise<void> {
    // Intentionally empty: never drop columns on live data.
  }
}
