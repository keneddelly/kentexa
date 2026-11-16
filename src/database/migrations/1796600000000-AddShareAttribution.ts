import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viral engine B8 (issue #381, owner approved 2026-11-16): what each shared link brings.
 *  - share_visit: one row per short link per browser session (a random key, no personal data;
 *    the viewer's account only when signed in, so the sharer's own opens are left out);
 *  - share_conversion: a new account that arrived through a short link (one per account).
 * First participation (reply, like, vote, join, post) is read from the existing tables at report
 * time, never stored twice. Kept 12 months; erased with the account. Additive only.
 */
export class AddShareAttribution1796600000000 implements MigrationInterface {
  name = 'AddShareAttribution1796600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.share_visit (
        id serial PRIMARY KEY,
        "shareLinkId" integer NOT NULL REFERENCES public.share_link(id) ON DELETE CASCADE,
        "sessionKey" varchar(64) NOT NULL,
        "viewerUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_share_visit_session" ON public.share_visit ("shareLinkId", "sessionKey")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_share_visit_created" ON public.share_visit ("createdAt")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.share_conversion (
        id serial PRIMARY KEY,
        "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        "shareLinkId" integer NOT NULL REFERENCES public.share_link(id) ON DELETE CASCADE,
        "registeredAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_share_conversion_user" ON public.share_conversion ("userId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_share_conversion_link" ON public.share_conversion ("shareLinkId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.share_conversion`);
    await q.query(`DROP TABLE IF EXISTS public.share_visit`);
  }
}
