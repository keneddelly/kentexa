import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstagramWebhookEvent1795000000000 implements MigrationInterface {
  name = 'CreateInstagramWebhookEvent1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.instagram_webhook_event (
        id SERIAL PRIMARY KEY,
        "eventHash" varchar(64) NOT NULL,
        "objectType" varchar(64),
        payload jsonb NOT NULL,
        "processingStatus" varchar(24) NOT NULL DEFAULT 'received',
        "processingAttempts" integer NOT NULL DEFAULT 0,
        "processingError" text,
        "processedAt" timestamp without time zone,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_instagram_webhook_event_hash" UNIQUE ("eventHash")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_instagram_webhook_event_status_created"
      ON public.instagram_webhook_event ("processingStatus", "createdAt");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS public.instagram_webhook_event');
  }
}
