import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The seller's shop place, kept (owner 2026-11-03: "why does it ask 'Duka lako, mzigo
 * utachukuliwa hapo' every time even when already set"). Before, KenteXa only remembered the
 * shop from the last pay-on-delivery boda pickup, so any other send asked again. Now the place
 * the seller picks once is kept per city and offered every time, with "Badilisha".
 *
 * Additive. Owner rule: never run down() on live.
 */
export class AddSellerPickupPlace1794700000000 implements MigrationInterface {
  name = 'AddSellerPickupPlace1794700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS public.seller_pickup_place (
      "userId" integer NOT NULL,
      city varchar(80) NOT NULL,
      label varchar(200) NOT NULL,
      "providerKey" varchar(40) NULL,
      "providerPlaceId" varchar(120) NULL,
      latitude double precision NULL,
      longitude double precision NULL,
      region varchar(80) NULL,
      district varchar(80) NULL,
      "resolutionMethod" varchar(40) NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("userId", city)
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.seller_pickup_place`);
  }
}
