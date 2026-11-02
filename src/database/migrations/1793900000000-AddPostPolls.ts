import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Home Feed phase E, "Kura" (owner approved 2026-11-02).
 *
 *   business_feed_item_intent_enum gains 'poll'.
 *   post_poll         - one per post: question, "closesAt", "resultPolicy" ('after_vote').
 *   post_poll_option  - 2 to 6 per poll: label, position, "voteCount" (kept with each vote).
 *   post_poll_vote    - one per person per poll (unique), never changed.
 *
 * Additive: new tables and one enum value (not used inside this migration).
 * Owner rule: never run down() on live.
 */
export class AddPostPolls1793900000000 implements MigrationInterface {
  name = 'AddPostPolls1793900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.business_feed_item_intent_enum ADD VALUE IF NOT EXISTS 'poll'`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.post_poll (
      id serial PRIMARY KEY,
      "postId" integer NOT NULL UNIQUE REFERENCES public.business_feed_item(id) ON DELETE CASCADE,
      question varchar(300) NOT NULL,
      "closesAt" timestamptz NOT NULL,
      "resultPolicy" varchar(20) NOT NULL DEFAULT 'after_vote',
      "createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.post_poll_option (
      id serial PRIMARY KEY,
      "pollId" integer NOT NULL REFERENCES public.post_poll(id) ON DELETE CASCADE,
      label varchar(80) NOT NULL,
      position integer NOT NULL,
      "voteCount" integer NOT NULL DEFAULT 0)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_post_poll_option_poll" ON public.post_poll_option ("pollId")`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.post_poll_vote (
      id serial PRIMARY KEY,
      "pollId" integer NOT NULL REFERENCES public.post_poll(id) ON DELETE CASCADE,
      "optionId" integer NOT NULL REFERENCES public.post_poll_option(id) ON DELETE CASCADE,
      "userId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_post_poll_vote_poll_user" UNIQUE ("pollId", "userId"))`);
  }

  // Drops only what this migration made; the enum value stays (cannot be dropped safely).
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.post_poll_vote`);
    await q.query(`DROP TABLE IF EXISTS public.post_poll_option`);
    await q.query(`DROP TABLE IF EXISTS public.post_poll`);
  }
}
