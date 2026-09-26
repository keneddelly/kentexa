import { MigrationInterface, QueryRunner } from 'typeorm';

/** Pending, one-time recipient challenge; existing parcels remain unchanged. */
export class AddParcelPickupChallenge1788279000000 implements MigrationInterface {
  name = 'AddParcelPickupChallenge1788279000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.parcel
      ADD COLUMN IF NOT EXISTS "pickupCodeHash" varchar(128),
      ADD COLUMN IF NOT EXISTS "pickupCodeExpiresAt" timestamp,
      ADD COLUMN IF NOT EXISTS "pickupCodeIssuedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "pickupCodeAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event
      DROP CONSTRAINT "CHK_parcel_custody_to"`);
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event
      ADD CONSTRAINT "CHK_parcel_custody_to" CHECK (
        (("toCustodianType" IS NULL) = ("toCustodianId" IS NULL))
        OR ("toCustodianType" = 'recipient_contact' AND "toCustodianId" IS NULL)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE public.parcel_custody_event, public.parcel IN ACCESS EXCLUSIVE MODE`);
    const [{ count }] = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM public.parcel_custody_event
      WHERE "toCustodianType" = 'recipient_contact'`);
    if (count > 0) throw new Error('Cannot remove recipient contact custody evidence');
    const [{ pending }] = await queryRunner.query(`SELECT COUNT(*)::int AS pending FROM public.parcel
      WHERE "pickupCodeHash" IS NOT NULL`);
    if (pending > 0) throw new Error('Cannot remove pending pickup challenges');
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event DROP CONSTRAINT "CHK_parcel_custody_to"`);
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event ADD CONSTRAINT "CHK_parcel_custody_to"
      CHECK (("toCustodianType" IS NULL) = ("toCustodianId" IS NULL))`);
    await queryRunner.query(`ALTER TABLE public.parcel
      DROP COLUMN IF EXISTS "pickupCodeHash", DROP COLUMN IF EXISTS "pickupCodeExpiresAt",
      DROP COLUMN IF EXISTS "pickupCodeIssuedAt", DROP COLUMN IF EXISTS "pickupCodeAttempts"`);
  }
}
