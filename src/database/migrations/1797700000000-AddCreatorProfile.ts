import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personal brand page template (owner approved 2026-11-18, creator-mock).
 *
 * commerce_profile.headline        one line under the name ("Mhasibu · Anaandika kuhusu fedha"),
 *                                  written by the owner.
 * commerce_profile."pinnedPostId"  the post or Makala the owner pins on top of "Kazi zangu".
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddCreatorProfile1797700000000 implements MigrationInterface {
  name = 'AddCreatorProfile1797700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.commerce_profile ADD COLUMN IF NOT EXISTS headline varchar(120) NULL`);
    await q.query(`ALTER TABLE public.commerce_profile ADD COLUMN IF NOT EXISTS "pinnedPostId" integer NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.commerce_profile DROP COLUMN IF EXISTS "pinnedPostId"`);
    await q.query(`ALTER TABLE public.commerce_profile DROP COLUMN IF EXISTS headline`);
  }
}
