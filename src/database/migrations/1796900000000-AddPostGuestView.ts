import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Post views for guests (owner approved 2026-11-16: "count readers like Reels views").
 * Signed-in readers are already counted (post_engagement 'view', one per person per post).
 * post_guest_view: one row per post per browser (a random key, no personal data), for people
 * who read without an account. Kept 12 months (analytics retention); additive only.
 */
export class AddPostGuestView1796900000000 implements MigrationInterface {
  name = 'AddPostGuestView1796900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.post_guest_view (
        id serial PRIMARY KEY,
        "postId" integer NOT NULL REFERENCES public.business_feed_item(id) ON DELETE CASCADE,
        "sessionKey" varchar(64) NOT NULL,
        "fromShare" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_post_guest_view" ON public.post_guest_view ("postId", "sessionKey")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_post_guest_view_created" ON public.post_guest_view ("createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.post_guest_view`);
  }
}
