import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Privacy foundations (issue #365, owner approved 2026-11-16 "continue"): a person can say no to
 * KenteXa's news and offers. The privacy policy already promises "withdraw consent for marketing
 * communications"; until now nothing recorded it. Additive only. Owner rule: never run down() on live.
 */
export class AddMarketingOptOut1796200000000 implements MigrationInterface {
  name = 'AddMarketingOptOut1796200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS "marketingOptOut" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS "marketingOptOutAt" timestamptz NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`ALTER TABLE public."user" DROP COLUMN IF EXISTS "marketingOptOutAt"`);
    await q.query(`ALTER TABLE public."user" DROP COLUMN IF EXISTS "marketingOptOut"`);
  }
}
