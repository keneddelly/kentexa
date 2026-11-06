import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds business-scoped Instagram connection storage.
 * No OAuth behavior is enabled by this schema-only migration.
 */
export class CreateInstagramBusinessConnection1793952000000 implements MigrationInterface {
  name = 'CreateInstagramBusinessConnection1793952000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE public.instagram_business_connection_status_enum
          AS ENUM ('active', 'reauth_required', 'disconnected');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.instagram_business_connection (
        id SERIAL PRIMARY KEY,
        "businessId" integer NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
        "instagramUserId" varchar(128) NOT NULL,
        "instagramUsername" varchar(255) NOT NULL,
        "accessTokenEncrypted" text NOT NULL,
        "tokenExpiresAt" timestamp without time zone,
        "grantedScopes" text[] NOT NULL DEFAULT '{}'::text[],
        status public.instagram_business_connection_status_enum NOT NULL DEFAULT 'active',
        "connectedByUserId" integer REFERENCES public."user"(id) ON DELETE SET NULL,
        "connectedAt" timestamp without time zone,
        "lastVerifiedAt" timestamp without time zone,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp without time zone NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_instagram_connection_business_account"
      ON public.instagram_business_connection ("businessId", "instagramUserId");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_connection_business_status"
      ON public.instagram_business_connection ("businessId", status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.instagram_business_connection');
    await queryRunner.query('DROP TYPE IF EXISTS public.instagram_business_connection_status_enum');
  }
}
