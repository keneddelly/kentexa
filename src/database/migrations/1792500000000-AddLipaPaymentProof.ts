import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lipa Namba proof (owner 2026-10-22). A Lipa Namba order is created only when
 * the buyer confirms payment with a screenshot; the proof is kept on the order.
 *
 * order."lipaProofUrl": the buyer's payment screenshot (our own upload).
 * order."lipaReference": optional payment reference the buyer typed (60 chars).
 * order."lipaConfirmedAt": when the buyer confirmed.
 *
 * Nullable columns without a default: metadata-only, every existing row keeps NULL.
 */
export class AddLipaPaymentProof1792500000000 implements MigrationInterface {
  name = 'AddLipaPaymentProof1792500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public."order"
        ADD COLUMN IF NOT EXISTS "lipaProofUrl" text NULL,
        ADD COLUMN IF NOT EXISTS "lipaReference" varchar(60) NULL,
        ADD COLUMN IF NOT EXISTS "lipaConfirmedAt" timestamptz NULL`);
  }

  // Owner rule: never run down() on live.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public."order"
        DROP COLUMN IF EXISTS "lipaConfirmedAt",
        DROP COLUMN IF EXISTS "lipaReference",
        DROP COLUMN IF EXISTS "lipaProofUrl"`);
  }
}
