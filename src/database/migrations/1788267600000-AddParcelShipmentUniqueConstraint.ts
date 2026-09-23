import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 1 shipment integrity. "At most one Parcel per Shipment" is currently
 * enforced only by ShipmentsService.ensureParcelForShipment()'s
 * find-then-create application check -- a TOCTOU race under concurrent
 * confirmShipment() calls. parcel.shipmentId already has a real FK to
 * shipment(id) (ON DELETE SET NULL, untouched here); this migration adds
 * the missing database-level uniqueness on top of it.
 *
 * Fails closed: if any Shipment already has more than one Parcel, up()
 * throws and creates nothing, rather than silently picking a "winner"
 * among existing duplicate rows. No historical row is read for any other
 * purpose and none is rewritten either way.
 */
export class AddParcelShipmentUniqueConstraint1788267600000
  implements MigrationInterface
{
  name = 'AddParcelShipmentUniqueConstraint1788267600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ shipmentId: number; n: number }> =
      await queryRunner.query(
        `SELECT "shipmentId", COUNT(*)::int AS n
           FROM public.parcel
          WHERE "shipmentId" IS NOT NULL
          GROUP BY "shipmentId"
         HAVING COUNT(*) > 1`,
      );
    if (duplicates.length > 0) {
      throw new Error(
        `AddParcelShipmentUniqueConstraint1788267600000: refusing to add the unique index -- ` +
          `${duplicates.length} shipment(s) already have more than one Parcel ` +
          `(e.g. shipmentId=${duplicates[0].shipmentId} has ${duplicates[0].n} parcels). ` +
          `Resolve the duplicates before re-running this migration.`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_parcel_shipmentId" ON public.parcel ("shipmentId") WHERE "shipmentId" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_parcel_shipmentId"`);
  }
}
