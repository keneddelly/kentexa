import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Office pickup offer (owner 2026-10-23): "some Super Agents offer pickup and should
 * add a pickup price, or zero for free pickup -- this increases competition (like the
 * Kariakoo area)". One row per office:
 *   mode 'free'  -> the office collects from the sender for free
 *   mode 'fixed' -> the office collects for "fee" TZS
 *   no row / mode 'none' -> the office does not collect (an agent may, as before)
 * maxKm: optional, how far from the office's own point it goes.
 *
 * New table only; nothing existing changes. The code checks the table exists before
 * using it, so a deploy before or after this migration is safe.
 * Owner rule: never run down() on live.
 */
export class AddOfficePickupOffer1792700000000 implements MigrationInterface {
  name = 'AddOfficePickupOffer1792700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.office_pickup_offer (
      "superAgentId" integer PRIMARY KEY REFERENCES public.super_agent(id) ON DELETE CASCADE,
      mode varchar(8) NOT NULL DEFAULT 'none',
      fee numeric(12,2) NULL,
      "maxKm" integer NULL,
      "updatedByUserId" integer NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_office_pickup_offer_mode" CHECK (mode IN ('none','free','fixed')),
      CONSTRAINT "CHK_office_pickup_offer_fee" CHECK (
        (mode = 'fixed' AND fee IS NOT NULL AND fee > 0 AND fee <= 1000000)
        OR (mode IN ('none','free') AND fee IS NULL)),
      CONSTRAINT "CHK_office_pickup_offer_km" CHECK ("maxKm" IS NULL OR ("maxKm" >= 1 AND "maxKm" <= 200))
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.office_pickup_offer`);
  }
}
