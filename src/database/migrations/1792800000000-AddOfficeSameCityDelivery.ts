import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Same-city delivery by an office (owner 2026-10-24): "on a shipment in the same city
 * no Super Agent office is required, only an agent or transport, unless the Super
 * Agent has chosen same-city delivery" (Kariakoo -> Mbezi showed offices).
 *
 * One new column on office_pickup_offer (migration 1792700000000), default false:
 * no office appears for a same-city trip until it switches this on in its settings.
 * Nothing existing changes. The code checks the column exists before using it, so a
 * deploy before or after this migration is safe (before it: no office on same-city trips).
 * Owner rule: never run down() on live.
 */
export class AddOfficeSameCityDelivery1792800000000 implements MigrationInterface {
  name = 'AddOfficeSameCityDelivery1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.office_pickup_offer
      ADD COLUMN IF NOT EXISTS "sameCityDelivery" boolean NOT NULL DEFAULT false`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.office_pickup_offer DROP COLUMN IF EXISTS "sameCityDelivery"`);
  }
}
