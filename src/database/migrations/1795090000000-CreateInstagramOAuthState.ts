import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstagramOAuthState1795090000000 implements MigrationInterface {
  name = 'CreateInstagramOAuthState1795090000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.instagram_oauth_state (
        id SERIAL PRIMARY KEY,
        "stateHash" varchar(64) NOT NULL,
        "businessId" integer NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        "expiresAt" timestamp without time zone NOT NULL,
        "consumedAt" timestamp without time zone,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_instagram_oauth_state_hash" UNIQUE ("stateHash")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_instagram_oauth_state_expiry" ON public.instagram_oauth_state ("expiresAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.instagram_oauth_state`);
  }
}
