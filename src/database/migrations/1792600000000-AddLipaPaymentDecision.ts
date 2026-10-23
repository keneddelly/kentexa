import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lipa Namba payment decision (owner 2026-10-23). The seller looks at the buyer's
 * payment screenshot and either confirms the money arrived on their Lipa Namba or
 * rejects it with a reason; a rejected buyer can send a new screenshot.
 *
 * order."lipaDecision": NULL = waiting for the seller, 'confirmed' or 'rejected'.
 * order."lipaDecidedAt" / "lipaDecidedByUserId": who decided and when.
 * order."lipaRejectReason": 'amount_wrong' | 'not_received' | 'unclear'.
 *
 * Nullable columns, no default: metadata-only, every existing row keeps NULL.
 * The code checks these columns exist before using them (they are NOT on the Order
 * entity), so a deploy before or after this migration is safe.
 * Owner rule: never run down() on live.
 */
export class AddLipaPaymentDecision1792600000000 implements MigrationInterface {
  name = 'AddLipaPaymentDecision1792600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE public."order"
        ADD COLUMN IF NOT EXISTS "lipaDecision" varchar(16) NULL,
        ADD COLUMN IF NOT EXISTS "lipaDecidedAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "lipaDecidedByUserId" integer NULL,
        ADD COLUMN IF NOT EXISTS "lipaRejectReason" varchar(30) NULL`);
    await q.query(`ALTER TABLE public."order" DROP CONSTRAINT IF EXISTS "CHK_order_lipa_decision"`);
    await q.query(`ALTER TABLE public."order" ADD CONSTRAINT "CHK_order_lipa_decision" CHECK (
      "lipaDecision" IS NULL
      OR ("lipaDecision" = 'confirmed' AND "lipaDecidedAt" IS NOT NULL AND "lipaRejectReason" IS NULL)
      OR ("lipaDecision" = 'rejected' AND "lipaDecidedAt" IS NOT NULL
          AND "lipaRejectReason" IN ('amount_wrong','not_received','unclear')))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public."order" DROP CONSTRAINT IF EXISTS "CHK_order_lipa_decision"`);
    await q.query(`
      ALTER TABLE public."order"
        DROP COLUMN IF EXISTS "lipaRejectReason",
        DROP COLUMN IF EXISTS "lipaDecidedByUserId",
        DROP COLUMN IF EXISTS "lipaDecidedAt",
        DROP COLUMN IF EXISTS "lipaDecision"`);
  }
}
