import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logistics repair Gate 3 -- one lifecycle contract.
 *
 * Every intake now converges on Shipment -> Journey -> Parcel -> custody:
 * a parcel registered at a Super Agent desk, or created for a marketplace
 * Order, gets a Shipment too (linked by parcel."shipmentId", with the
 * commerce context kept in shipment."orderId"). "intakeChannel" records
 * which door the Shipment came in through, so "My shipments" can stay a
 * list of what the sender booked themselves and the desk/admin views can
 * tell the channels apart.
 *
 * Additive and idempotent. No existing row changes meaning: every Shipment
 * that exists today was booked through the send form ('self_service').
 */
export class AddShipmentIntakeChannel1788292200000 implements MigrationInterface {
  name = 'AddShipmentIntakeChannel1788292200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE public.shipment ADD COLUMN IF NOT EXISTS "intakeChannel" varchar(24) NOT NULL DEFAULT 'self_service'`,
    );
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_shipment_intake_channel') THEN
          ALTER TABLE public.shipment ADD CONSTRAINT "CHK_shipment_intake_channel"
            CHECK ("intakeChannel" IN ('self_service', 'walk_in', 'seller_shipment', 'order'));
        END IF;
      END $$`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_shipment_order" ON public.shipment ("orderId") WHERE "orderId" IS NOT NULL`,
    );
    // Gate 2 derives a Run's load through journey_leg."runId".
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_journey_leg_run" ON public.journey_leg ("runId") WHERE "runId" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS public."IDX_journey_leg_run"`);
    await q.query(`DROP INDEX IF EXISTS public."IDX_shipment_order"`);
    await q.query(`ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "CHK_shipment_intake_channel"`);
    await q.query(`ALTER TABLE public.shipment DROP COLUMN IF EXISTS "intakeChannel"`);
  }
}
