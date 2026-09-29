import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C1 — Ordered Route Stops + Immutable Run Itinerary Foundation.
 * Schema only: no RouteStop/Run writer, Parcel/Vehicle/manifest/capacity/
 * payment side effect, or production deployment is enabled by this
 * migration alone.
 *
 * FK targets (transport_route, transport_provider) follow the EXACT same
 * convention every other Stage 3S migration in this lineage already uses --
 * neither table has a CREATE TABLE migration of its own yet (flagged, not
 * fixed, since Stage 3S-B3's AddTransportQuote migration; reconfirmed by
 * the Issue #62 repository audit). This migration does not expand scope to
 * fix that pre-existing debt -- it was explicitly assessed and is NOT
 * strictly necessary for these specific new FK dependencies, since every
 * real environment that runs this migration already has both tables
 * present via `synchronize: true`, exactly as every prior Stage 3S
 * migration already relies on. A future "ship Stage 3S schema" migration
 * must create transport_provider/transport_route (and everything
 * depending on them, including this one) together, in dependency order,
 * before any of this can run against a real, migration-only database.
 *
 * `status` on transport_run is stored as character varying + a CHECK
 * constraint rather than a native Postgres enum type, matching this
 * lineage's own established precedent (TransportQuote.status in
 * 1788283800000-AddTransportQuote.ts) -- the TypeORM entity itself still
 * declares `type: 'enum'` for synchronize:true environments; this keeps the
 * SAME already-accepted, already-reviewed pattern rather than introducing
 * CREATE TYPE handling nothing else in this lineage uses.
 */
export class AddTransportRunFoundation1788285000000 implements MigrationInterface {
  name = 'AddTransportRunFoundation1788285000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── route_stop: the reusable, editable ordered plan ──────────────────
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.route_stop (
      id SERIAL PRIMARY KEY,
      "routeId" integer NOT NULL,
      sequence integer NOT NULL,
      "locationLabel" character varying(200) NOT NULL,
      "wardId" integer,
      "regionId" integer,
      "loadingAllowed" boolean NOT NULL DEFAULT true,
      "unloadingAllowed" boolean NOT NULL DEFAULT true,
      "parcelAcceptanceAllowed" boolean NOT NULL DEFAULT true,
      "customerCollectionAllowed" boolean NOT NULL DEFAULT false,
      "superAgentId" integer,
      "estimatedArrivalOffsetMinutes" integer,
      "estimatedDepartureOffsetMinutes" integer,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_route_stop_route" FOREIGN KEY ("routeId")
        REFERENCES public.transport_route(id) ON DELETE CASCADE,
      CONSTRAINT "CHK_route_stop_sequence" CHECK (sequence >= 0)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_route_stop_sequence"
      ON public.route_stop ("routeId", sequence)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_route_stop_route_active"
      ON public.route_stop ("routeId", "isActive")`);

    // ── transport_run: the actual scheduled physical execution ───────────
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.transport_run (
      id SERIAL PRIMARY KEY,
      "providerId" integer NOT NULL,
      "routeId" integer NOT NULL,
      "scheduledDeparture" timestamp without time zone NOT NULL,
      status character varying(16) NOT NULL DEFAULT 'scheduled',
      "createdByUserId" integer NOT NULL,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_transport_run_provider" FOREIGN KEY ("providerId")
        REFERENCES public.transport_provider(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_transport_run_route" FOREIGN KEY ("routeId")
        REFERENCES public.transport_route(id) ON DELETE RESTRICT,
      CONSTRAINT "CHK_transport_run_status" CHECK (
        status IN ('scheduled','open','closed','started','cancelled','completed')
      )
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transport_run_provider"
      ON public.transport_run ("providerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transport_run_route"
      ON public.transport_run ("routeId")`);

    // ── transport_run_stop: the immutable snapshot a Run actually executes ─
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.transport_run_stop (
      id SERIAL PRIMARY KEY,
      "runId" integer NOT NULL,
      "sourceRouteStopId" integer,
      sequence integer NOT NULL,
      "locationLabel" character varying(200) NOT NULL,
      "wardId" integer,
      "regionId" integer,
      "loadingAllowed" boolean NOT NULL,
      "unloadingAllowed" boolean NOT NULL,
      "parcelAcceptanceAllowed" boolean NOT NULL,
      "customerCollectionAllowed" boolean NOT NULL,
      "superAgentId" integer,
      "estimatedArrivalOffsetMinutes" integer,
      "estimatedDepartureOffsetMinutes" integer,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_transport_run_stop_run" FOREIGN KEY ("runId")
        REFERENCES public.transport_run(id) ON DELETE CASCADE,
      CONSTRAINT "FK_transport_run_stop_source" FOREIGN KEY ("sourceRouteStopId")
        REFERENCES public.route_stop(id) ON DELETE SET NULL,
      CONSTRAINT "CHK_transport_run_stop_sequence" CHECK (sequence >= 0)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_transport_run_stop_sequence"
      ON public.transport_run_stop ("runId", sequence)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'LOCK TABLE public.transport_run_stop, public.transport_run, public.route_stop IN ACCESS EXCLUSIVE MODE',
    );
    const [{ exists: hasRuns }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.transport_run) AS exists',
    );
    const [{ exists: hasStops }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.route_stop) AS exists',
    );
    if (hasRuns || hasStops) {
      throw new Error('refusing to remove nonempty route stop / transport run history');
    }
    await queryRunner.query('DROP TABLE public.transport_run_stop');
    await queryRunner.query('DROP TABLE public.transport_run');
    await queryRunner.query('DROP TABLE public.route_stop');
  }
}
