import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viral engine A2 (issue #381, owner approved 2026-11-16): short share links, kentexa.com/s/<code>.
 * One row per (who shared, what, channel), so sharing the same post again on WhatsApp reuses its
 * code. A guest's share has no sharer. Additive only. Owner rule: never run down() on live.
 */
export class AddShareLinks1796500000000 implements MigrationInterface {
  name = 'AddShareLinks1796500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.share_link (
        id serial PRIMARY KEY,
        code varchar(12) NOT NULL,
        "sharerUserId" integer NULL REFERENCES public."user"(id) ON DELETE SET NULL,
        "contentType" varchar(20) NOT NULL,
        "contentId" integer NOT NULL,
        channel varchar(20) NOT NULL DEFAULT 'link',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_share_link_code" ON public.share_link (code)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_share_link_reuse" ON public.share_link ("sharerUserId", "contentType", "contentId", channel)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_share_link_content" ON public.share_link ("contentType", "contentId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.share_link`);
  }
}
