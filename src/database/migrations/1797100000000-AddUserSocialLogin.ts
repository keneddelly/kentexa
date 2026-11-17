import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ingia kwa Google / Facebook (owner 2026-11-17: "its time to allow login with google, facebook").
 * One row links an outside account (Google's "sub", Facebook's user id) to one KenteXa account.
 * A new person still gives a phone number and the SMS code once, so every account keeps a
 * verified phone (M-Pesa, delivery, the Lipa flows). Additive: one new table.
 * Owner rule: never run down() on live.
 */
export class AddUserSocialLogin1797100000000 implements MigrationInterface {
  name = 'AddUserSocialLogin1797100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.user_social_login (
        id serial PRIMARY KEY,
        provider varchar(20) NOT NULL,
        "providerUserId" varchar(100) NOT NULL,
        "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        email varchar(200) NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "lastUsedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_social_login_provider_user" UNIQUE (provider, "providerUserId"),
        CONSTRAINT "UQ_user_social_login_one_per_user" UNIQUE (provider, "userId")
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_user_social_login_user" ON public.user_social_login ("userId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.user_social_login`);
  }
}
