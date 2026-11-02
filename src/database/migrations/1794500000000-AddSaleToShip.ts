import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS sales waiting to be sent (owner approved 2026-11-02: "the POS orders that need
 * shipping are not seen on seller orders"; choice "COD + marked Itatumwa").
 *
 *   sale."toShip" - the cashier ticked "Itatumwa kwa mteja" on a paid sale. A
 *                   pay-on-delivery sale (isCod) always needs sending; it does not need it.
 * A sale stays "Inasubiri kutumwa" until its shipment exists (shipmentTrackingNumber).
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddSaleToShip1794500000000 implements MigrationInterface {
  name = 'AddSaleToShip1794500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.sale ADD COLUMN IF NOT EXISTS "toShip" boolean NOT NULL DEFAULT false`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.sale DROP COLUMN IF EXISTS "toShip"`);
  }
}
