import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Social Home, part 1 (owner approved 2026-11-02): topics, and listings out of Home.
 *
 *   feed_topic                       - the topics people talk about (key, label, note, position,
 *                                      active). Seeded with the 8 approved; admin can change later.
 *   user_topic_follow                - the topics a person follows (one row per topic).
 *   business_feed_item.topic         - the topic a post is about (NULL for older posts).
 *   business_feed_item."autoListing" - true for a Moment a listing published by itself; such posts
 *                                      stay on profiles and in search, not in Home's feeds.
 *
 * The backfill marks only posts that are clearly automatic: a Moment linked to a product,
 * listing or service with no text of its own and no format chosen. Additive otherwise.
 * Owner rule: never run down() on live.
 */
export class AddFeedTopics1794100000000 implements MigrationInterface {
  name = 'AddFeedTopics1794100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.feed_topic (
      key varchar(40) PRIMARY KEY,
      label varchar(60) NOT NULL,
      note varchar(120) NULL,
      position integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`INSERT INTO public.feed_topic (key, label, note, position) VALUES
      ('biashara', 'Biashara', 'Bei, wateja, mbinu', 1),
      ('kilimo', 'Kilimo', 'Mazao, pembejeo', 2),
      ('usafiri', 'Usafiri na mizigo', 'Ofisi, mabasi, njia', 3),
      ('teknolojia', 'Teknolojia', 'Simu, mtandao', 4),
      ('mtaa', 'Mtaa wako', 'Habari za karibu', 5),
      ('ajira', 'Ajira na ujuzi', 'Kazi, mafunzo', 6),
      ('michezo', 'Michezo', 'Soka na zaidi', 7),
      ('chakula', 'Chakula na hoteli', 'Migahawa, mapishi', 8)
      ON CONFLICT (key) DO NOTHING`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.user_topic_follow (
      id serial PRIMARY KEY,
      "userId" integer NOT NULL,
      "topicKey" varchar(40) NOT NULL REFERENCES public.feed_topic(key) ON DELETE CASCADE,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_user_topic_follow" UNIQUE ("userId", "topicKey"))`);
    await q.query(`ALTER TABLE public.business_feed_item
      ADD COLUMN IF NOT EXISTS topic varchar(40) NULL,
      ADD COLUMN IF NOT EXISTS "autoListing" boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_business_feed_item_topic" ON public.business_feed_item (topic) WHERE topic IS NOT NULL`);
    await q.query(`UPDATE public.business_feed_item SET "autoListing" = true
      WHERE type::text = 'moment'
        AND "linkedEntityType" IN ('product', 'classified', 'service')
        AND (body IS NULL OR btrim(body) = '')
        AND (intent IS NULL OR intent::text = 'update')`);
  }

  // Drops only what it added.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS public."IDX_business_feed_item_topic"`);
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "autoListing", DROP COLUMN IF EXISTS topic`);
    await q.query(`DROP TABLE IF EXISTS public.user_topic_follow`);
    await q.query(`DROP TABLE IF EXISTS public.feed_topic`);
  }
}
