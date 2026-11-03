import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS part 3 (owner approved 2026-11-03, design "KenteXa POS ya kisasa", boards "Stoo" and
 * "Madeni"; reminders by the shop's own WhatsApp/SMS, not KenteXa SMS):
 *   pos_supplier        the shop's suppliers (name, phone)
 *   pos_stock_receipt   goods received ("Pokea mzigo"): items, cost, and whether the supplier is
 *                       still unpaid ("bado sijamlipa msambazaji")
 *   pos_debt_payment    a payment of a customer's debt (to a credit sale) or to a supplier;
 *                       cash ones count in the cashier's drawer
 * Stock itself changes only through InventoryService (one stock, one audit trail).
 * Additive. Owner rule: never run down() on live.
 */
export class AddPosStockAndDebts1794900000000 implements MigrationInterface {
  name = 'AddPosStockAndDebts1794900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_supplier (
      id SERIAL PRIMARY KEY,
      "sellerId" integer NOT NULL,
      "workspaceId" integer NULL,
      name varchar(120) NOT NULL,
      phone varchar(30) NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pos_supplier_name" ON public.pos_supplier ("sellerId", lower(name))`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_stock_receipt (
      id SERIAL PRIMARY KEY,
      "sellerId" integer NOT NULL,
      "workspaceId" integer NULL,
      "supplierId" integer NULL,
      items jsonb NOT NULL,
      total numeric(14,2) NOT NULL,
      unpaid boolean NOT NULL DEFAULT false,
      note varchar(200) NULL,
      "createdByUserId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pos_stock_receipt_seller" ON public.pos_stock_receipt ("sellerId", "createdAt")`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.pos_debt_payment (
      id SERIAL PRIMARY KEY,
      "sellerId" integer NOT NULL,
      "workspaceId" integer NULL,
      kind varchar(10) NOT NULL,
      "saleId" integer NULL,
      "supplierId" integer NULL,
      amount numeric(14,2) NOT NULL,
      method varchar(20) NOT NULL DEFAULT 'cash',
      "createdByUserId" integer NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pos_debt_payment_seller" ON public.pos_debt_payment ("sellerId", kind, "createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['pos_debt_payment', 'pos_stock_receipt', 'pos_supplier']) await q.query(`DROP TABLE IF EXISTS public.${t}`);
  }
}
