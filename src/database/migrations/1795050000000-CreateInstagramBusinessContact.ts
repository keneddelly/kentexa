import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstagramBusinessContact1795050000000 implements MigrationInterface {
  name = 'CreateInstagramBusinessContact1795050000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.instagram_business_contact (
        id SERIAL PRIMARY KEY,
        "connectionId" integer NOT NULL,
        "businessCustomerId" integer NOT NULL,
        "instagramScopedUserId" varchar(128) NOT NULL,
        username varchar(255),
        "displayName" varchar(255),
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "FK_instagram_contact_connection"
          FOREIGN KEY ("connectionId") REFERENCES public.instagram_business_connection(id)
          ON DELETE CASCADE,
        CONSTRAINT "FK_instagram_contact_business_customer"
          FOREIGN KEY ("businessCustomerId") REFERENCES public.business_customer(id)
          ON DELETE CASCADE,
        CONSTRAINT "UQ_instagram_contact_connection_sender"
          UNIQUE ("connectionId", "instagramScopedUserId")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_contact_customer"
      ON public.instagram_business_contact ("businessCustomerId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.instagram_business_contact');
  }
}
