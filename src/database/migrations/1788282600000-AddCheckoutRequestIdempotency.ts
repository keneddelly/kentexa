import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckoutRequestIdempotency1788282600000 implements MigrationInterface {
  name = 'AddCheckoutRequestIdempotency1788282600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public."order"
      ADD COLUMN "checkoutRequestKey" uuid,
      ADD COLUMN "checkoutRequestPayloadHash" varchar(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_checkout_request_key"
      ON public."order" ("checkoutRequestKey") WHERE "checkoutRequestKey" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX public."IDX_order_checkout_request_key"');
    await queryRunner.query(`ALTER TABLE public."order"
      DROP COLUMN "checkoutRequestPayloadHash",
      DROP COLUMN "checkoutRequestKey"`);
  }
}
