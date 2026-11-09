import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * order."shippingQuote" (owner 2026-11-09: "on marketplace order we need the exact shipping price
 * for intercity to come from the office price ... shipment should be the central logistics engine").
 * The office the buyer's shipping fee came from at checkout (bestOffice in
 * src/orders/engine-delivery-price.ts): fee, office id/name/place/phone, how many offices priced the
 * trip and the cheapest. The seller's send form opens on this office at this price.
 * Additive, nullable. Owner rule: never run down() on live.
 */
export class AddOrderShippingQuote1795200000000 implements MigrationInterface {
  name = 'AddOrderShippingQuote1795200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public."order" ADD COLUMN IF NOT EXISTS "shippingQuote" jsonb NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public."order" DROP COLUMN IF EXISTS "shippingQuote"`);
  }
}
