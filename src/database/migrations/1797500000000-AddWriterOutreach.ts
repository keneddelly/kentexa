import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Writers & Contributors Programme, step B (#417, owner approved 2026-11-18).
 *
 * writer_prospect      people an admin may invite to write. Added by hand, reviewed one by one, sent
 *                      only by an admin press (max 50 a day, switch WRITER_OUTREACH_ENABLED).
 * email_suppression    addresses that asked for no more KenteXa invitations. Checked before any send.
 * founding_contributor the "Mchangiaji Mwanzilishi" label, given by an admin (it is not verification).
 *
 * Additive: three new tables. Owner rule: never run down() on live.
 */
export class AddWriterOutreach1797500000000 implements MigrationInterface {
  name = 'AddWriterOutreach1797500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.writer_prospect (
        id serial PRIMARY KEY,
        name varchar(120) NOT NULL,
        email varchar(200) NOT NULL,
        topic varchar(80) NULL,
        source varchar(300) NULL,
        note varchar(500) NULL,
        status varchar(20) NOT NULL DEFAULT 'new',
        token varchar(40) NOT NULL,
        "addedById" integer NULL,
        "reviewedById" integer NULL,
        "reviewedAt" timestamptz NULL,
        "sentById" integer NULL,
        "sentAt" timestamptz NULL,
        "sendError" varchar(200) NULL,
        "joinedUserId" integer NULL,
        "joinedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_writer_prospect_email" UNIQUE (email),
        CONSTRAINT "UQ_writer_prospect_token" UNIQUE (token)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_writer_prospect_status" ON public.writer_prospect (status)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_writer_prospect_sent" ON public.writer_prospect ("sentAt")`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.email_suppression (
        email varchar(200) PRIMARY KEY,
        reason varchar(40) NOT NULL DEFAULT 'unsubscribe',
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.founding_contributor (
        "userId" integer PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
        "assignedById" integer NULL,
        note varchar(200) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "removedAt" timestamptz NULL,
        "removedById" integer NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.founding_contributor`);
    await q.query(`DROP TABLE IF EXISTS public.email_suppression`);
    await q.query(`DROP TABLE IF EXISTS public.writer_prospect`);
  }
}
