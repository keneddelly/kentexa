import { MigrationInterface, QueryRunner } from 'typeorm';
import { ensureRoutePriceHistoryNoOverlapConstraint } from '../../transport/route-price-history-schema';

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
 *
 * Post-review correction: the original version of this migration relied on
 * "at most one effectiveTo IS NULL row per route" as its only overlap guard.
 * That only ever protected the single open-ended row -- it never stopped two
 * CLOSED windows (e.g. a historical version and a future-scheduled one) from
 * overlapping, which would leave discovery/quote's `ORDER BY effectiveFrom
 * DESC LIMIT 1` resolver picking one of them ambiguously instead of failing
 * closed. Replaced with a proper range-EXCLUDE constraint (see
 * route-price-history-schema.ts) that forbids ANY two rows for the same
 * route from overlapping at all, enforced by Postgres itself under
 * concurrent writers exactly like a unique constraint would be.
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
    await ensureRoutePriceHistoryNoOverlapConstraint((sql) => queryRunner.query(sql));
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
