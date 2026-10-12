import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Door pickup by location pin (NEXT_STEPS.md section 18). Adds columns only;
 * nothing existing is changed and every new column is empty for old rows.
 *
 * shipment: the pickup point the SENDER gave (phone GPS) and a landmark note.
 *   Kept apart from originLatitude/originLongitude, which the server derives
 *   from the chosen place and the client may never set. pickupPinWardId is the
 *   nearest ward centre point (approximate; wards have no boundaries).
 * Both pairs: either both empty or both filled (a NULL comparison alone would pass a CHECK).
 * agent: the fixed base point the agent set once ("Weka kituo changu"), used to
 *   offer a pickup to the nearest agents first. No live position is stored.
 */
export class AddPickupPinAndAgentBase1791800000000 implements MigrationInterface {
  name = 'AddPickupPinAndAgentBase1791800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.shipment
        ADD COLUMN IF NOT EXISTS "pickupPinLatitude" double precision NULL,
        ADD COLUMN IF NOT EXISTS "pickupPinLongitude" double precision NULL,
        ADD COLUMN IF NOT EXISTS "pickupPinAccuracyM" integer NULL,
        ADD COLUMN IF NOT EXISTS "pickupPinCapturedAt" timestamptz NULL,
        ADD COLUMN IF NOT EXISTS "pickupLandmark" varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS "pickupPinWardId" integer NULL`);
    await queryRunner.query(`
      ALTER TABLE public.shipment
        ADD CONSTRAINT "CHK_shipment_pickup_pin_pair" CHECK (
          ("pickupPinLatitude" IS NULL AND "pickupPinLongitude" IS NULL) OR
          ("pickupPinLatitude" IS NOT NULL AND "pickupPinLongitude" IS NOT NULL AND
           "pickupPinLatitude" BETWEEN -90 AND 90 AND "pickupPinLongitude" BETWEEN -180 AND 180))`);
    await queryRunner.query(`
      ALTER TABLE public.agent
        ADD COLUMN IF NOT EXISTS "baseLatitude" double precision NULL,
        ADD COLUMN IF NOT EXISTS "baseLongitude" double precision NULL,
        ADD COLUMN IF NOT EXISTS "baseSetAt" timestamptz NULL`);
    await queryRunner.query(`
      ALTER TABLE public.agent
        ADD CONSTRAINT "CHK_agent_base_pair" CHECK (
          ("baseLatitude" IS NULL AND "baseLongitude" IS NULL) OR
          ("baseLatitude" IS NOT NULL AND "baseLongitude" IS NOT NULL AND
           "baseLatitude" BETWEEN -90 AND 90 AND "baseLongitude" BETWEEN -180 AND 180))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.agent DROP CONSTRAINT IF EXISTS "CHK_agent_base_pair"`);
    await queryRunner.query(`ALTER TABLE public.agent
      DROP COLUMN IF EXISTS "baseSetAt", DROP COLUMN IF EXISTS "baseLongitude", DROP COLUMN IF EXISTS "baseLatitude"`);
    await queryRunner.query(`ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "CHK_shipment_pickup_pin_pair"`);
    await queryRunner.query(`ALTER TABLE public.shipment
      DROP COLUMN IF EXISTS "pickupPinWardId", DROP COLUMN IF EXISTS "pickupLandmark",
      DROP COLUMN IF EXISTS "pickupPinCapturedAt", DROP COLUMN IF EXISTS "pickupPinAccuracyM",
      DROP COLUMN IF EXISTS "pickupPinLongitude", DROP COLUMN IF EXISTS "pickupPinLatitude"`);
  }
}
