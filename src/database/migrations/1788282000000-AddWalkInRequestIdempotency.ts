import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalkInRequestIdempotency1788282000000 implements MigrationInterface {
  name = 'AddWalkInRequestIdempotency1788282000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public."order"
      ADD COLUMN "offlineRequestKey" uuid,
      ADD COLUMN "offlineRequestPayloadHash" varchar(64),
      ADD COLUMN "offlineReceiptSnapshot" jsonb`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_offline_request_key"
      ON public."order" ("offlineRequestKey") WHERE "offlineRequestKey" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX public."IDX_order_offline_request_key"');
    await queryRunner.query(`ALTER TABLE public."order"
      DROP COLUMN "offlineReceiptSnapshot",
      DROP COLUMN "offlineRequestPayloadHash",
      DROP COLUMN "offlineRequestKey"`);
  }
}
