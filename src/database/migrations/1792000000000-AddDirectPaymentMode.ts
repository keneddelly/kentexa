import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace payment mode "cod_lipa" (owner 2026-10-19). KenteXa does not hold
 * the money: the buyer pays the seller directly, by hand on delivery (COD, same
 * city only) or to the seller's Lipa Namba. Columns only; every existing row
 * keeps NULL, so old orders and sellers behave exactly as before.
 *
 * order_paymentmethod_enum gains 'lipa_namba' (online, cod unchanged).
 * order."paymentMode": the marketplace payment mode the order was created
 *   under ('cod_lipa'); NULL for every order created before this release.
 * order."sameCity": buyer region = seller region, decided by the server at
 *   order creation; NULL for older orders.
 * seller_profile."lipaNamba" / "lipaNambaName": the seller's Lipa Namba and
 *   the name it is registered to; NULL until the seller fills it in.
 *
 * Adding nullable columns without a default is a metadata-only change.
 * ADD VALUE IF NOT EXISTS needs PostgreSQL 9.6+ (live 18.6).
 */
export class AddDirectPaymentMode1792000000000 implements MigrationInterface {
  name = 'AddDirectPaymentMode1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE public.order_paymentmethod_enum ADD VALUE IF NOT EXISTS 'lipa_namba'`);
    await queryRunner.query(`
      ALTER TABLE public."order"
        ADD COLUMN IF NOT EXISTS "paymentMode" varchar(20) NULL,
        ADD COLUMN IF NOT EXISTS "sameCity" boolean NULL`);
    await queryRunner.query(`
      ALTER TABLE public.seller_profile
        ADD COLUMN IF NOT EXISTS "lipaNamba" varchar(30) NULL,
        ADD COLUMN IF NOT EXISTS "lipaNambaName" varchar(100) NULL`);
  }

  // Owner rule: never run down() on live. It drops the columns only; a
  // PostgreSQL enum value cannot be dropped safely, so 'lipa_namba' stays.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.seller_profile DROP COLUMN IF EXISTS "lipaNambaName", DROP COLUMN IF EXISTS "lipaNamba"`);
    await queryRunner.query(`ALTER TABLE public."order" DROP COLUMN IF EXISTS "sameCity", DROP COLUMN IF EXISTS "paymentMode"`);
  }
}
