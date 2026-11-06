import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstagramExternalMessageId1795060000000 implements MigrationInterface {
  name = 'AddInstagramExternalMessageId1795060000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.conversation_message
      ADD COLUMN IF NOT EXISTS "externalMessageId" varchar(255)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_conversation_message_external_id"
      ON public.conversation_message ("externalMessageId")
      WHERE "externalMessageId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS public."UQ_conversation_message_external_id"');
    await queryRunner.query('ALTER TABLE public.conversation_message DROP COLUMN IF EXISTS "externalMessageId"');
  }
}
