import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * parcel_pickup_task."offeredAt" (owner 2026-11-09: a job is offered to agents for 5 minutes, then
 * it disappears from their Kazi list; the sender decides what next). The last re-offer: the
 * sender's "Waambie tena", or an agent who accepted gave it back. NULL: the job's creation counts
 * (src/shipments/pickup-offer-window.ts). Additive, nullable. Owner rule: never run down() on live.
 */
export class AddPickupTaskOfferedAt1795300000000 implements MigrationInterface {
  name = 'AddPickupTaskOfferedAt1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task ADD COLUMN IF NOT EXISTS "offeredAt" timestamp without time zone NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task DROP COLUMN IF EXISTS "offeredAt"`);
  }
}
