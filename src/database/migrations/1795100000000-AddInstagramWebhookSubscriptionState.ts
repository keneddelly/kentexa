import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstagramWebhookSubscriptionState1795100000000 implements MigrationInterface {
  name = 'AddInstagramWebhookSubscriptionState1795100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.instagram_business_connection
      ADD COLUMN IF NOT EXISTS "webhookSubscribed" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.instagram_business_connection
      DROP COLUMN IF EXISTS "webhookSubscribed"
    `);
  }
}
