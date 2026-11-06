import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstagramWebhookProcessingLease1795080000000 implements MigrationInterface {
  name = 'AddInstagramWebhookProcessingLease1795080000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.instagram_webhook_event
      ADD COLUMN IF NOT EXISTS "processingStartedAt" timestamp without time zone
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.instagram_webhook_event
      DROP COLUMN IF EXISTS "processingStartedAt"
    `);
  }
}
