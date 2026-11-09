import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart Post (owner 2026-11-09): business_feed_item_intent_enum gains 'experience' (Uzoefu), a
 * story, review or lesson from the person's own experience.
 *
 * Additive. The new value is not used inside this migration. Owner rule: never run down() on live.
 */
export class AddExperiencePostIntent1795700000000 implements MigrationInterface {
  name = 'AddExperiencePostIntent1795700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.business_feed_item_intent_enum ADD VALUE IF NOT EXISTS 'experience'`);
  }

  // A PostgreSQL enum value cannot be dropped safely; nothing to undo.
  public async down(): Promise<void> {
    return undefined;
  }
}
