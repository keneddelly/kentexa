import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Walk-in registration retry identity on public."order": a nullable request
 * UUID, its payload hash, the committed receipt snapshot, and a partial unique
 * index on the key. Purely additive; every existing Order keeps NULLs and is
 * never backfilled or reinterpreted.
 *
 * Hygiene (Stage 3K-3R prerequisite correction), matching the sibling custody
 * migrations:
 *  - UP is safe to repeat (IF NOT EXISTS on every statement);
 *  - DOWN refuses, changing nothing, while ANY walk-in request key, payload
 *    hash or receipt snapshot exists -- that history is the only proof that a
 *    retried registration was not charged twice, so it is never silently
 *    dropped. DOWN on a never-used schema still works and is idempotent.
 */
export class AddWalkInRequestIdempotency1788282000000 implements MigrationInterface {
  name = 'AddWalkInRequestIdempotency1788282000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public."order"
      ADD COLUMN IF NOT EXISTS "offlineRequestKey" uuid,
      ADD COLUMN IF NOT EXISTS "offlineRequestPayloadHash" varchar(64),
      ADD COLUMN IF NOT EXISTS "offlineReceiptSnapshot" jsonb`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_offline_request_key"
      ON public."order" ("offlineRequestKey") WHERE "offlineRequestKey" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public."order" IN ACCESS EXCLUSIVE MODE');
    const columns: { column_name: string }[] = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order'
          AND column_name IN ('offlineRequestKey', 'offlineRequestPayloadHash', 'offlineReceiptSnapshot')`,
    );
    if (columns.length === 3) {
      const [{ used }]: { used: number }[] = await queryRunner.query(
        `SELECT COUNT(*)::int AS used FROM public."order"
          WHERE "offlineRequestKey" IS NOT NULL
             OR "offlineRequestPayloadHash" IS NOT NULL
             OR "offlineReceiptSnapshot" IS NOT NULL`,
      );
      if (used > 0) {
        throw new Error('Cannot remove walk-in request idempotency history: retry receipts exist');
      }
    }
    await queryRunner.query('DROP INDEX IF EXISTS public."IDX_order_offline_request_key"');
    await queryRunner.query(`ALTER TABLE public."order"
      DROP COLUMN IF EXISTS "offlineReceiptSnapshot",
      DROP COLUMN IF EXISTS "offlineRequestPayloadHash",
      DROP COLUMN IF EXISTS "offlineRequestKey"`);
  }
}
