import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Uza tena" (resell), owner approved 2026-11-09: a supplier opens a product for reselling with a
 * reseller price; any person with a verified phone reposts it with their own price on top; the
 * buyer's order goes to the supplier carrying who resold it and the amounts. The supplier
 * collects and pays the reseller's profit. KenteXa holds no money.
 *
 *   product          resaleOpen, resalePrice (what a reseller pays), resaleMinPrice (lowest selling price)
 *   resale_offer     the repost: product, reseller, own price, note, on or off
 *   order            the reseller and the amounts fixed at order time, and the profit record
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddResale1795800000000 implements MigrationInterface {
  name = 'AddResale1795800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.product
      ADD COLUMN IF NOT EXISTS "resaleOpen" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "resalePrice" numeric(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "resaleMinPrice" numeric(10,2) NULL`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.resale_offer (
      id serial PRIMARY KEY,
      "productId" int NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
      "resellerUserId" int NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      price numeric(10,2) NOT NULL,
      note varchar(200) NULL,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resale_offer_product_reseller" ON public.resale_offer ("productId", "resellerUserId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_resale_offer_reseller" ON public.resale_offer ("resellerUserId")`);
    await q.query(`ALTER TABLE public."order"
      ADD COLUMN IF NOT EXISTS "resaleOfferId" int NULL,
      ADD COLUMN IF NOT EXISTS "resellerUserId" int NULL,
      ADD COLUMN IF NOT EXISTS "resaleUnitPrice" numeric(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "supplierUnitPrice" numeric(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "resellerProfit" numeric(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "resellerPaidAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "resellerPaidRef" varchar(60) NULL,
      ADD COLUMN IF NOT EXISTS "resellerConfirmedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "resellerDisputedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "resellerDisputeNote" varchar(300) NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_order_reseller" ON public."order" ("resellerUserId") WHERE "resellerUserId" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP INDEX IF EXISTS public."IDX_order_reseller"`);
    for (const c of ['resellerDisputeNote', 'resellerDisputedAt', 'resellerConfirmedAt', 'resellerPaidRef', 'resellerPaidAt',
      'resellerProfit', 'supplierUnitPrice', 'resaleUnitPrice', 'resellerUserId', 'resaleOfferId']) {
      await q.query(`ALTER TABLE public."order" DROP COLUMN IF EXISTS "${c}"`);
    }
    await q.query(`DROP TABLE IF EXISTS public.resale_offer`);
    for (const c of ['resaleMinPrice', 'resalePrice', 'resaleOpen']) {
      await q.query(`ALTER TABLE public.product DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
