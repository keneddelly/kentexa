import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hotel food ordering, part 1 (owner 2026-10-27: "food ordering made purposely for
 * hotels"; "some hotel allow COD"). A hotel is a Business; its menu and its food
 * orders belong to that Business identity.
 *
 *   food_menu_settings - one row per Business: food ordering on/off, which ways it
 *                        serves (eat here at a table or room, pick up), which ways the
 *                        customer may pay (after eating, on pickup = COD), how many
 *                        tables and rooms get a QR code, opening hours, its Lipa Namba.
 *   food_menu_item     - a dish or drink: group (e.g. Mchana), name, price, photo,
 *                        "kipo leo" (available today). Removing hides it (active=false).
 *   food_order         - a customer's order to the kitchen: the dishes as they were
 *                        priced when ordered, where it goes (table/room number or
 *                        pickup), how it is paid, and the kitchen steps:
 *                        new -> cooking (with the hotel's own minutes) -> ready -> done,
 *                        or rejected / cancelled. KenteXa holds no money: the customer
 *                        pays the hotel directly.
 *
 * Delivery ("Letewa") is part 2, through the shipment engine; no column for it yet.
 * Deploy-order safe: until this runs the app does not offer food ordering.
 * Owner rule: never run down() on live.
 */
export class AddFoodOrdering1793400000000 implements MigrationInterface {
  name = 'AddFoodOrdering1793400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.food_menu_settings (
      "businessId" integer PRIMARY KEY REFERENCES public.business(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT true,
      "acceptingOrders" boolean NOT NULL DEFAULT true,
      "dineIn" boolean NOT NULL DEFAULT true,
      pickup boolean NOT NULL DEFAULT true,
      "payAfterDineIn" boolean NOT NULL DEFAULT true,
      "codPickup" boolean NOT NULL DEFAULT false,
      "tableCount" integer NOT NULL DEFAULT 0 CHECK ("tableCount" BETWEEN 0 AND 500),
      "roomCount" integer NOT NULL DEFAULT 0 CHECK ("roomCount" BETWEEN 0 AND 2000),
      "openingHours" varchar(120) NULL,
      "lipaNamba" varchar(20) NULL,
      "lipaNambaName" varchar(100) NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.food_menu_item (
      id serial PRIMARY KEY,
      "businessId" integer NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
      section varchar(40) NOT NULL,
      name varchar(80) NOT NULL,
      description varchar(200) NULL,
      price numeric(12,2) NOT NULL CHECK (price > 0),
      "photoUrl" text NULL,
      "availableToday" boolean NOT NULL DEFAULT true,
      active boolean NOT NULL DEFAULT true,
      "sortOrder" integer NOT NULL DEFAULT 0,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_food_menu_item_business"
      ON public.food_menu_item ("businessId", active, section, "sortOrder")`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.food_order (
      id serial PRIMARY KEY,
      "businessId" integer NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
      "customerId" integer NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
      mode varchar(10) NOT NULL CHECK (mode IN ('dine_in', 'pickup')),
      "placeType" varchar(6) NULL CHECK ("placeType" IN ('table', 'room')),
      "placeNumber" integer NULL CHECK ("placeNumber" BETWEEN 1 AND 2000),
      items jsonb NOT NULL,
      note varchar(300) NULL,
      "totalAmount" numeric(12,2) NOT NULL CHECK ("totalAmount" > 0),
      "paymentMethod" varchar(12) NOT NULL CHECK ("paymentMethod" IN ('lipa_namba', 'pay_after', 'cod')),
      "paymentStatus" varchar(12) NOT NULL DEFAULT 'pending'
        CHECK ("paymentStatus" IN ('pending', 'proof_sent', 'paid', 'rejected')),
      "lipaProofUrl" text NULL,
      "paymentNote" varchar(200) NULL,
      status varchar(10) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'cooking', 'ready', 'done', 'rejected', 'cancelled')),
      "readyInMinutes" integer NULL CHECK ("readyInMinutes" BETWEEN 1 AND 240),
      "rejectReason" varchar(200) NULL,
      "acceptedAt" timestamp NULL,
      "readyAt" timestamp NULL,
      "doneAt" timestamp NULL,
      "paidAt" timestamp NULL,
      "cancelledAt" timestamp NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CHECK ((mode = 'dine_in') = ("placeType" IS NOT NULL AND "placeNumber" IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_food_order_business_status"
      ON public.food_order ("businessId", status, "createdAt")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_food_order_customer"
      ON public.food_order ("customerId", "createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.food_order`);
    await q.query(`DROP TABLE IF EXISTS public.food_menu_item`);
    await q.query(`DROP TABLE IF EXISTS public.food_menu_settings`);
  }
}
