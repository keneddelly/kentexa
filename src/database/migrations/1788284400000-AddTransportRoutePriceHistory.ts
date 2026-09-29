import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-B4 — Route Price History + Effective Pricing. Schema only: no
 * pricing writer, discovery/quote read, or production deployment is enabled
 * by this migration alone.
 *
 * FK target (transport_route) follows the exact convention every other
 * Stage 3S table in this lineage already uses -- transport_route itself has
 * no CREATE TABLE migration of its own yet (flagged, not fixed, since
 * Stage 3S-B3's own AddTransportQuote migration). A future "ship Stage 3S"
 * migration must create transport_route (and every table depending on it,
 * including this one) together, in dependency order.
 */
export class AddTransportRoutePriceHistory1788284400000 implements MigrationInterface {
  name = 'AddTransportRoutePriceHistory1788284400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.transport_route_price_history (
      id SERIAL PRIMARY KEY,
      "routeId" integer NOT NULL,
      "pricePerKg" numeric(10,2) NOT NULL,
      "fixedFee" numeric(10,2) NOT NULL,
      "effectiveFrom" timestamp without time zone NOT NULL,
      "effectiveTo" timestamp without time zone,
      "changedByUserId" integer,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_route_price_history_route" FOREIGN KEY ("routeId")
        REFERENCES public.transport_route(id) ON DELETE CASCADE,
      CONSTRAINT "CHK_route_price_history_amounts" CHECK (
        "pricePerKg" >= 0 AND "fixedFee" >= 0
      ),
      CONSTRAINT "CHK_route_price_history_window" CHECK (
        "effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"
      )
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_route_price_history_route_effective"
      ON public.transport_route_price_history ("routeId", "effectiveFrom")`);
    // At most one OPEN (currently/future effective, not yet superseded)
    // version per route -- the DB-level guarantee against ambiguous/
    // overlapping active windows a concurrent price edit could otherwise
    // create. TransportService.setRoutePrice() always closes the existing
    // open row (effectiveTo = the new row's effectiveFrom) in the SAME
    // transaction that opens the next one, so this index should never be
    // hit in the normal path; it exists as the fail-closed backstop.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_route_price_history_open"
      ON public.transport_route_price_history ("routeId") WHERE "effectiveTo" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.transport_route_price_history IN ACCESS EXCLUSIVE MODE');
    const [{ exists: hasHistory }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.transport_route_price_history) AS exists',
    );
    if (hasHistory) {
      throw new Error('refusing to remove nonempty route price history');
    }
    await queryRunner.query('DROP TABLE public.transport_route_price_history');
  }
}
