import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Social Home part 3: Jumuiya (communities). Owner approved 2026-11-02.
 *
 *   community          - name, purpose, one topic, optional rules, who can join ('open' or
 *                        'request'), status ('active' or 'hidden' by KenteXa), member count.
 *   community_member   - one row per person: role ('admin', 'helper', 'member') and status
 *                        ('active', 'pending' for a request, 'removed').
 *   business_feed_item."communityId" - the community a post was made in (NULL = Home).
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddCommunities1794200000000 implements MigrationInterface {
  name = 'AddCommunities1794200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.community (
      id serial PRIMARY KEY,
      name varchar(80) NOT NULL,
      purpose varchar(300) NOT NULL,
      "topicKey" varchar(40) NOT NULL REFERENCES public.feed_topic(key),
      rules varchar(500) NULL,
      "joinPolicy" varchar(10) NOT NULL DEFAULT 'open',
      status varchar(12) NOT NULL DEFAULT 'active',
      "memberCount" integer NOT NULL DEFAULT 0,
      "createdById" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_community_join" CHECK ("joinPolicy" IN ('open', 'request')),
      CONSTRAINT "CHK_community_status" CHECK (status IN ('active', 'hidden')))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_community_name" ON public.community (lower(name))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_community_topic" ON public.community ("topicKey") WHERE status = 'active'`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.community_member (
      id serial PRIMARY KEY,
      "communityId" integer NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
      "userId" integer NOT NULL,
      role varchar(10) NOT NULL DEFAULT 'member',
      status varchar(10) NOT NULL DEFAULT 'active',
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_community_member" UNIQUE ("communityId", "userId"),
      CONSTRAINT "CHK_community_member_role" CHECK (role IN ('admin', 'helper', 'member')),
      CONSTRAINT "CHK_community_member_status" CHECK (status IN ('active', 'pending', 'removed')))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_community_member_user" ON public.community_member ("userId") WHERE status = 'active'`);
    await q.query(`ALTER TABLE public.business_feed_item
      ADD COLUMN IF NOT EXISTS "communityId" integer NULL REFERENCES public.community(id) ON DELETE SET NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_business_feed_item_community" ON public.business_feed_item ("communityId") WHERE "communityId" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.business_feed_item DROP COLUMN IF EXISTS "communityId"`);
    await q.query(`DROP TABLE IF EXISTS public.community_member`);
    await q.query(`DROP TABLE IF EXISTS public.community`);
  }
}
