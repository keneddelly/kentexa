import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Premium POS, part 1 (owner 2026-10-27: "make it to allow even storing and use offline
 * in desktop").
 *
 *   sale."clientSaleId" - the id the till gave a sale (also made offline). Sending the same
 *                         sale twice (a retry after the network came back) records it once.
 *   sale."soldAt"       - when the sale really happened, for a sale made offline and sent later.
 *   sale.payments       - a split payment, e.g. [{method:'cash',amount:10000},{method:'mpesa',
 *                         amount:3200,reference:'...'}]. paymentMethod keeps the largest part.
 *   sale."creditSale"   - "Deni": the customer took the goods and owes the rest (balanceDue).
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddPosOfflineAndSplitPay1793600000000 implements MigrationInterface {
  name = 'AddPosOfflineAndSplitPay1793600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.sale
      ADD COLUMN IF NOT EXISTS "clientSaleId" uuid NULL,
      ADD COLUMN IF NOT EXISTS "soldAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS payments jsonb NULL,
      ADD COLUMN IF NOT EXISTS "creditSale" boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sale_seller_client_sale"
      ON public.sale ("sellerId", "clientSaleId") WHERE "clientSaleId" IS NOT NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_sale_seller_credit_open"
      ON public.sale ("sellerId") WHERE "creditSale" = true AND "balanceDue" > 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS public."IDX_sale_seller_credit_open"`);
    await q.query(`DROP INDEX IF EXISTS public."UQ_sale_seller_client_sale"`);
    await q.query(`ALTER TABLE public.sale DROP COLUMN IF EXISTS "creditSale", DROP COLUMN IF EXISTS payments,
      DROP COLUMN IF EXISTS "soldAt", DROP COLUMN IF EXISTS "clientSaleId"`);
  }
}
