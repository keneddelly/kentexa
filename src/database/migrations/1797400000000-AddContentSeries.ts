import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mfululizo (Topic Series, issue #410, owner approved 2026-11-17 "approve as you recommend"):
 * an ordered collection of existing posts ("Sehemu") that people can follow.
 *   content_series          the series: title, description, cover, publisher, status
 *                           (draft | published | archived); admin-made in the MVP
 *   content_series_topic    the topics (feed_topic) a series belongs to
 *   content_series_episode  one row per episode: the canonical post and its place; comments and
 *                           reactions stay on that post, never copied
 *   content_series_follow   who follows a series
 *   feed_topic.description  a longer text for the topic's own page
 * The place is unique per series and DEFERRABLE, so a reorder is one safe transaction.
 * Additive only. Owner rule: never run down() on live.
 */
export class AddContentSeries1797400000000 implements MigrationInterface {
  name = 'AddContentSeries1797400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.content_series (
        id serial PRIMARY KEY,
        title varchar(120) NOT NULL,
        description text NULL,
        "coverUrl" varchar(500) NULL,
        "ownerUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
        "commerceProfileId" integer NULL,
        "communityId" integer NULL,
        status varchar(12) NOT NULL DEFAULT 'draft',
        "createdByUserId" integer NULL,
        "publishedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_content_series_status" CHECK (status IN ('draft', 'published', 'archived'))
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_content_series_status" ON public.content_series (status, "publishedAt" DESC)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.content_series_topic (
        "seriesId" integer NOT NULL REFERENCES public.content_series(id) ON DELETE CASCADE,
        "topicKey" varchar(40) NOT NULL REFERENCES public.feed_topic(key) ON DELETE CASCADE,
        PRIMARY KEY ("seriesId", "topicKey")
      )`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.content_series_episode (
        id serial PRIMARY KEY,
        "seriesId" integer NOT NULL REFERENCES public.content_series(id) ON DELETE CASCADE,
        "postId" integer NOT NULL REFERENCES public.business_feed_item(id) ON DELETE CASCADE,
        position integer NOT NULL,
        title varchar(120) NULL,
        "addedByUserId" integer NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_content_series_episode_post" UNIQUE ("seriesId", "postId"),
        CONSTRAINT "UQ_content_series_episode_position" UNIQUE ("seriesId", position) DEFERRABLE INITIALLY IMMEDIATE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_content_series_episode_post" ON public.content_series_episode ("postId")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.content_series_follow (
        "seriesId" integer NOT NULL REFERENCES public.content_series(id) ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("seriesId", "userId")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_content_series_follow_user" ON public.content_series_follow ("userId")`);
    await q.query(`ALTER TABLE public.feed_topic ADD COLUMN IF NOT EXISTS description varchar(400) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.feed_topic DROP COLUMN IF EXISTS description`);
    await q.query(`DROP TABLE IF EXISTS public.content_series_follow`);
    await q.query(`DROP TABLE IF EXISTS public.content_series_episode`);
    await q.query(`DROP TABLE IF EXISTS public.content_series_topic`);
    await q.query(`DROP TABLE IF EXISTS public.content_series`);
  }
}
