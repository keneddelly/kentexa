import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Traffic step 2 (issue #368, owner approved 2026-11-16): indexes for the reads every visitor
 * makes. Until now business_feed_item had only the topic and community indexes, so the feed,
 * profiles and "Mpya" tabs read the whole table.
 *  - live, person-written posts by time: Home feed candidates, "Mpya" sorts, tag pages;
 *  - by account and time: a business's or person's posts (profiles, followers-only checks);
 *  - by identity and time: a profile's own timeline.
 * Additive only. Owner rule: never run down() on live.
 */
export class AddFeedReadIndexes1796300000000 implements MigrationInterface {
  name = 'AddFeedReadIndexes1796300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_feed_item_live_created" ON public.business_feed_item ("createdAt" DESC) WHERE "isActive" = true AND "autoListing" = false`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_feed_item_business_created" ON public.business_feed_item ("businessId", "createdAt" DESC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_feed_item_profile_created" ON public.business_feed_item ("commerceProfileId", "createdAt" DESC) WHERE "commerceProfileId" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP INDEX IF EXISTS public."IDX_feed_item_profile_created"`);
    await q.query(`DROP INDEX IF EXISTS public."IDX_feed_item_business_created"`);
    await q.query(`DROP INDEX IF EXISTS public."IDX_feed_item_live_created"`);
  }
}
