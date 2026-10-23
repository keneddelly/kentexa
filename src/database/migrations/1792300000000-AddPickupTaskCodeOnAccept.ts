import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * COD seller shipment, boda path (owner 2026-10-22, option A). The buyer's
 * delivery code is sent when the boda rider ACCEPTS the pickup and lasts until
 * delivery, so a direct-delivery task must be able to hold its recipient code
 * while still 'claimed', not only once 'collected'. The code stays on the task;
 * the Parcel's last-mile code columns are never used by the pickup flow.
 *
 * CHK_pickup_task_delivery_code is replaced by the same rule with
 * status IN ('claimed','collected'). Every other status still forces the code
 * columns empty, so a rider's release (back to 'requested') or a cancel clears
 * the code. Existing rows all satisfy the wider rule.
 *
 * Owner rule: never run down() on live.
 */
export class AddPickupTaskCodeOnAccept1792300000000 implements MigrationInterface {
  name = 'AddPickupTaskCodeOnAccept1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task DROP CONSTRAINT IF EXISTS "CHK_pickup_task_delivery_code"`);
    await q.query(`ALTER TABLE public.parcel_pickup_task ADD CONSTRAINT "CHK_pickup_task_delivery_code" CHECK (
      ("deliveryCodeHash" IS NULL AND "deliveryCodeIssuedAt" IS NULL AND "deliveryCodeExpiresAt" IS NULL)
      OR ("deliveryCodeHash" IS NOT NULL AND "deliveryCodeIssuedAt" IS NOT NULL
          AND "deliveryCodeExpiresAt" IS NOT NULL
          AND status IN ('claimed', 'collected') AND "servicePath" = 'direct_delivery')
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.parcel_pickup_task DROP CONSTRAINT IF EXISTS "CHK_pickup_task_delivery_code"`);
    await q.query(`ALTER TABLE public.parcel_pickup_task ADD CONSTRAINT "CHK_pickup_task_delivery_code" CHECK (
      ("deliveryCodeHash" IS NULL AND "deliveryCodeIssuedAt" IS NULL AND "deliveryCodeExpiresAt" IS NULL)
      OR ("deliveryCodeHash" IS NOT NULL AND "deliveryCodeIssuedAt" IS NOT NULL
          AND "deliveryCodeExpiresAt" IS NOT NULL
          AND status = 'collected' AND "servicePath" = 'direct_delivery')
    )`);
  }
}
