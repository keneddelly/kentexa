import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotel food delivery, "Letewa" (owner 2026-10-27, part 2 of food ordering).
 *
 * A wakala brings the food and the customer pays on delivery: the food and the delivery
 * fee KenteXa sets (the Dar rate card), cash or the hotel's Lipa Namba at the door. The
 * hotel turns delivery on and sets once where the wakala collects (a KenteXa place).
 * When the kitchen accepts the order, a pay-on-delivery seller shipment is created through
 * the one shipment engine; the food order keeps that order's id and tracking number and is
 * done when that delivery is.
 *
 *   food_menu_settings: delivery (on/off), "pickupPlace" (the resolved KenteXa place).
 *   food_order: mode may be 'delivery'; the address, phone and fee; the shipping order,
 *               its tracking number, and why sending to a wakala failed (if it did).
 *
 * Additive. Runs after 1793400000000. Owner rule: never run down() on live.
 */
export class AddFoodDelivery1793500000000 implements MigrationInterface {
  name = 'AddFoodDelivery1793500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.food_menu_settings
      ADD COLUMN IF NOT EXISTS delivery boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "pickupPlace" jsonb NULL`);
    await q.query(`ALTER TABLE public.food_order
      ADD COLUMN IF NOT EXISTS "deliveryAddress" varchar(300) NULL,
      ADD COLUMN IF NOT EXISTS "deliveryPhone" varchar(20) NULL,
      ADD COLUMN IF NOT EXISTS "deliveryFee" numeric(12,2) NULL,
      ADD COLUMN IF NOT EXISTS "shippingOrderId" integer NULL REFERENCES public."order"(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "trackingNumber" varchar(40) NULL,
      ADD COLUMN IF NOT EXISTS "deliveryError" varchar(200) NULL`);
    await q.query(`ALTER TABLE public.food_order DROP CONSTRAINT IF EXISTS food_order_mode_check`);
    await q.query(`ALTER TABLE public.food_order DROP CONSTRAINT IF EXISTS "CHK_food_order_mode"`);
    await q.query(`ALTER TABLE public.food_order ADD CONSTRAINT "CHK_food_order_mode"
      CHECK (mode IN ('dine_in', 'pickup', 'delivery'))`);
    await q.query(`ALTER TABLE public.food_order DROP CONSTRAINT IF EXISTS "CHK_food_order_delivery"`);
    await q.query(`ALTER TABLE public.food_order ADD CONSTRAINT "CHK_food_order_delivery"
      CHECK ((mode = 'delivery') = ("deliveryAddress" IS NOT NULL AND "deliveryFee" IS NOT NULL AND "deliveryFee" >= 0))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_food_order_shipping_order"
      ON public.food_order ("shippingOrderId") WHERE "shippingOrderId" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS public."IDX_food_order_shipping_order"`);
    await q.query(`ALTER TABLE public.food_order DROP CONSTRAINT IF EXISTS "CHK_food_order_delivery"`);
    await q.query(`ALTER TABLE public.food_order DROP CONSTRAINT IF EXISTS "CHK_food_order_mode"`);
    await q.query(`ALTER TABLE public.food_order ADD CONSTRAINT food_order_mode_check CHECK (mode IN ('dine_in', 'pickup'))`);
    await q.query(`ALTER TABLE public.food_order DROP COLUMN IF EXISTS "deliveryError", DROP COLUMN IF EXISTS "trackingNumber",
      DROP COLUMN IF EXISTS "shippingOrderId", DROP COLUMN IF EXISTS "deliveryFee", DROP COLUMN IF EXISTS "deliveryPhone",
      DROP COLUMN IF EXISTS "deliveryAddress"`);
    await q.query(`ALTER TABLE public.food_menu_settings DROP COLUMN IF EXISTS "pickupPlace", DROP COLUMN IF EXISTS delivery`);
  }
}
