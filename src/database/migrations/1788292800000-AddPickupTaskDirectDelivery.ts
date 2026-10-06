import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Logistics repair Gate 4 -- direct Agent delivery (sender -> Agent ->
 * recipient) can now finish.
 *
 * parcel_pickup_task already allowed status 'delivered' for a
 * 'direct_delivery' task, but nothing could ever write it: the only handoff
 * challenge the table could hold was the sender's (allowed only while the
 * task is 'claimed'). These columns hold the RECIPIENT's challenge -- the
 * code sent to the recipient's phone, which the Agent must be given in
 * person before the delivery is recorded.
 *
 * Additive and idempotent.
 */
export class AddPickupTaskDirectDelivery1788292800000 implements MigrationInterface {
  name = 'AddPickupTaskDirectDelivery1788292800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task
      ADD COLUMN IF NOT EXISTS "deliveryCodeHash" character varying(128),
      ADD COLUMN IF NOT EXISTS "deliveryCodeIssuedAt" timestamp without time zone,
      ADD COLUMN IF NOT EXISTS "deliveryCodeExpiresAt" timestamp without time zone,
      ADD COLUMN IF NOT EXISTS "deliveryAttempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp without time zone`);
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_pickup_task_delivery_code') THEN
          ALTER TABLE public.parcel_pickup_task ADD CONSTRAINT "CHK_pickup_task_delivery_code" CHECK (
            ("deliveryCodeHash" IS NULL AND "deliveryCodeIssuedAt" IS NULL AND "deliveryCodeExpiresAt" IS NULL)
            OR ("deliveryCodeHash" IS NOT NULL AND "deliveryCodeIssuedAt" IS NOT NULL
                AND "deliveryCodeExpiresAt" IS NOT NULL
                AND status = 'collected' AND "servicePath" = 'direct_delivery')
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_pickup_task_delivery_attempts') THEN
          ALTER TABLE public.parcel_pickup_task ADD CONSTRAINT "CHK_pickup_task_delivery_attempts"
            CHECK ("deliveryAttempts" >= 0);
        END IF;
      END $$`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task DROP CONSTRAINT IF EXISTS "CHK_pickup_task_delivery_attempts"`);
    await q.query(`ALTER TABLE public.parcel_pickup_task DROP CONSTRAINT IF EXISTS "CHK_pickup_task_delivery_code"`);
    await q.query(`ALTER TABLE public.parcel_pickup_task
      DROP COLUMN IF EXISTS "deliveredAt", DROP COLUMN IF EXISTS "deliveryAttempts",
      DROP COLUMN IF EXISTS "deliveryCodeExpiresAt", DROP COLUMN IF EXISTS "deliveryCodeIssuedAt",
      DROP COLUMN IF EXISTS "deliveryCodeHash"`);
  }
}
