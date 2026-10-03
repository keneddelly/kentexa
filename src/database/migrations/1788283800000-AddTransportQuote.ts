import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-B3 — Canonical Quote Foundation. Schema only: no Quote writer,
 * Shipment/custody transition, historical reconciliation, or production
 * deployment is enabled by this migration.
 *
 * FK targets (transport_provider, transport_route, provider_availability,
 * shipment) follow the exact convention every other Stage 3S table in this
 * lineage already uses -- none of those tables have a CREATE TABLE migration
 * of their own yet either (the whole Transport/Shipment domain has existed
 * via `synchronize: true` in every environment through Stages 2C/2E/3S/
 * 3S-A/3S-B1/3S-B2). This migration does not fix that pre-existing gap; it
 * is flagged, not resolved, in the Issue #61 report. A future "ship Stage 3S"
 * migration must create those tables (and this one) together, in dependency
 * order, before any of this can run against a real, migration-only database.
 */
export class AddTransportQuote1788283800000 implements MigrationInterface {
  name = 'AddTransportQuote1788283800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.transport_quote (
      id SERIAL PRIMARY KEY,
      "requestedByUserId" integer NOT NULL,
      "providerId" integer NOT NULL,
      "routeId" integer NOT NULL,
      "availabilityId" integer,
      "originCity" character varying NOT NULL,
      "destinationCity" character varying NOT NULL,
      "weightKg" numeric(8,2) NOT NULL DEFAULT 0,
      "baseAmount" numeric(10,2) NOT NULL,
      components jsonb NOT NULL DEFAULT '{}',
      "totalAmount" numeric(10,2) NOT NULL,
      currency character varying(8) NOT NULL DEFAULT 'TZS',
      "priceEffectiveAt" timestamp without time zone NOT NULL,
      status character varying(16) NOT NULL DEFAULT 'offered',
      "expiresAt" timestamp without time zone NOT NULL,
      "acceptedAt" timestamp without time zone,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_transport_quote_provider" FOREIGN KEY ("providerId")
        REFERENCES public.transport_provider(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_transport_quote_route" FOREIGN KEY ("routeId")
        REFERENCES public.transport_route(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_transport_quote_availability" FOREIGN KEY ("availabilityId")
        REFERENCES public.provider_availability(id) ON DELETE RESTRICT,
      CONSTRAINT "CHK_transport_quote_status" CHECK (
        status IN ('offered','accepted','expired')
      ),
      CONSTRAINT "CHK_transport_quote_accepted_at" CHECK (
        (status = 'accepted') = ("acceptedAt" IS NOT NULL)
      ),
      CONSTRAINT "CHK_transport_quote_amounts" CHECK (
        "weightKg" >= 0 AND "baseAmount" >= 0 AND "totalAmount" >= 0
        AND jsonb_typeof(components) = 'object'
      ),
      CONSTRAINT "CHK_transport_quote_expiry" CHECK ("expiresAt" > "createdAt")
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transport_quote_requester"
      ON public.transport_quote ("requestedByUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transport_quote_status_expiry"
      ON public.transport_quote (status, "expiresAt")`);

    // Additive: a Shipment MAY be created from an accepted quote (Stage
    // 3S-B3); every existing/legacy Shipment row keeps quoteId NULL forever.
    // A quote can back at most one Shipment (partial unique index) -- this
    // is the DB-level backstop against a quote being consumed twice.
    await queryRunner.query(`ALTER TABLE public.shipment
      ADD COLUMN IF NOT EXISTS "quoteId" integer`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_shipment_quote') THEN
        ALTER TABLE public.shipment ADD CONSTRAINT "FK_shipment_quote"
          FOREIGN KEY ("quoteId") REFERENCES public.transport_quote(id) ON DELETE RESTRICT;
      END IF;
    END $$`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shipment_quote"
      ON public.shipment ("quoteId") WHERE "quoteId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.transport_quote, public.shipment IN ACCESS EXCLUSIVE MODE');
    const [{ exists: hasQuotes }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.transport_quote) AS exists',
    );
    const [{ exists: hasLinkedShipments }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.shipment WHERE "quoteId" IS NOT NULL) AS exists',
    );
    if (hasQuotes || hasLinkedShipments) {
      throw new Error('refusing to remove nonempty transport quote history');
    }
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_shipment_quote"');
    await queryRunner.query('ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "FK_shipment_quote"');
    await queryRunner.query('ALTER TABLE public.shipment DROP COLUMN IF EXISTS "quoteId"');
    await queryRunner.query('DROP TABLE public.transport_quote');
  }
}
