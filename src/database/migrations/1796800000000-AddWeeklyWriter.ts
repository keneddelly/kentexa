import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mwandishi wa Wiki (owner approved 2026-11-16): each week's writer of the week and the next 3,
 * picked by plain counting from the week before. One row per (week, owner). An admin can remove
 * a pick that breaks the rules (removedAt / removedById / removeReason); the row is kept.
 *
 * Additive: one new table. Owner rule: never run down() on live.
 */
export class AddWeeklyWriter1796800000000 implements MigrationInterface {
  name = 'AddWeeklyWriter1796800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.weekly_writer (
        id serial PRIMARY KEY,
        "weekStart" date NOT NULL,
        rank integer NOT NULL,
        "ownerUserId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        "commerceProfileId" integer NULL,
        "topPostId" integer NULL,
        score integer NOT NULL DEFAULT 0,
        posts integer NOT NULL DEFAULT 0,
        replies integer NOT NULL DEFAULT 0,
        repliers integer NOT NULL DEFAULT 0,
        "removedAt" timestamptz NULL,
        "removedById" integer NULL,
        "removeReason" varchar(200) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_weekly_writer_week_owner" UNIQUE ("weekStart", "ownerUserId")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_weekly_writer_owner" ON public.weekly_writer ("ownerUserId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.weekly_writer`);
  }
}
