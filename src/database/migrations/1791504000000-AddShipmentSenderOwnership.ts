import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sender ownership is distinct from the intake operator. This migration does
 * not infer ownership from phone numbers or retroactively claim walk-ins.
 */
export class AddShipmentSenderOwnership1791504000000 implements MigrationInterface {
  name = 'AddShipmentSenderOwnership1791504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE public.shipment ADD COLUMN IF NOT EXISTS "senderUserId" integer');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_shipment_sender_user" ON public.shipment ("senderUserId", "createdAt" DESC) WHERE "senderUserId" IS NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS public."IDX_shipment_sender_user"');
    await queryRunner.query('ALTER TABLE public.shipment DROP COLUMN IF EXISTS "senderUserId"');
  }
}
