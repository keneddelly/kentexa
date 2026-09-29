import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C3 — ParcelRunAssignment + multi-stop parcel movement foundation.
 * Schema only: no segment-capacity accounting, pricing, manifest UI,
 * payment, Admin UI, or automated custody transition is enabled by this
 * migration alone.
 *
 * FK targets (transport_run, transport_run_stop, parcel) follow the exact
 * same convention every prior Stage 3S migration in this lineage already
 * uses -- none of those tables have a CREATE TABLE migration of their own
 * yet (flagged, not fixed, since Stage 3S-B3's AddTransportQuote
 * migration); every real environment that runs this migration already has
 * all three via `synchronize: true`.
 *
 * `status` is stored as character varying + a CHECK constraint rather than
 * a native Postgres enum type, matching this lineage's own established
 * precedent (TransportQuote.status, TransportRun.status, Vehicle.
 * operationalStatus) -- the TypeORM entity itself still declares
 * `type: 'enum'` for synchronize:true environments.
 *
 * The "load stop must come before unload stop within the same Run"
 * invariant is enforced at the SERVICE layer (ParcelRunAssignmentService),
 * not as a DB constraint -- it requires comparing TransportRunStop.sequence
 * across two rows on a DIFFERENT table, which a single-table CHECK cannot
 * express, and a cross-table trigger was assessed as unnecessary
 * complexity for this foundation gate (both stop FKs already guarantee
 * both belong to a real, existing TransportRunStop; the ordering is a
 * business rule the service enforces and real-PostgreSQL tests prove
 * directly, the same way Stage 3S-B1 enforces its own cross-row invariants
 * in the service rather than the schema where a single CHECK cannot reach).
 */
export class AddParcelRunAssignment1788286200000 implements MigrationInterface {
  name = 'AddParcelRunAssignment1788286200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.parcel_run_assignment (
      id SERIAL PRIMARY KEY,
      "runId" integer NOT NULL,
      "parcelId" integer NOT NULL,
      "loadRunStopId" integer NOT NULL,
      "unloadRunStopId" integer NOT NULL,
      status character varying(16) NOT NULL DEFAULT 'scheduled',
      "loadedAt" timestamp without time zone,
      "unloadedAt" timestamp without time zone,
      "createdByUserId" integer NOT NULL,
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_parcel_run_assignment_run" FOREIGN KEY ("runId")
        REFERENCES public.transport_run(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_parcel_run_assignment_parcel" FOREIGN KEY ("parcelId")
        REFERENCES public.parcel(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_parcel_run_assignment_load_stop" FOREIGN KEY ("loadRunStopId")
        REFERENCES public.transport_run_stop(id) ON DELETE RESTRICT,
      CONSTRAINT "FK_parcel_run_assignment_unload_stop" FOREIGN KEY ("unloadRunStopId")
        REFERENCES public.transport_run_stop(id) ON DELETE RESTRICT,
      CONSTRAINT "CHK_parcel_run_assignment_status" CHECK (
        status IN ('scheduled','loaded','unloaded','cancelled')
      ),
      CONSTRAINT "CHK_parcel_run_assignment_distinct_stops" CHECK (
        "loadRunStopId" <> "unloadRunStopId"
      )
    )`);
    // At most one ACTIVE (scheduled/loaded) assignment per parcel -- the
    // DB-level backstop for "prevent conflicting active assignments for the
    // same parcel", the same partial-unique-index technique Stage 3S-B3's
    // UQ_shipment_quote already established.
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_parcel_run_assignment_active"
      ON public.parcel_run_assignment ("parcelId") WHERE status IN ('scheduled','loaded')`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_parcel_run_assignment_run"
      ON public.parcel_run_assignment ("runId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.parcel_run_assignment IN ACCESS EXCLUSIVE MODE');
    const [{ exists: hasAssignments }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.parcel_run_assignment) AS exists',
    );
    if (hasAssignments) {
      throw new Error('refusing to remove nonempty parcel run assignment history');
    }
    await queryRunner.query('DROP TABLE public.parcel_run_assignment');
  }
}
