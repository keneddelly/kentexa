import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C2 — Vehicle administration + optional TransportRun assignment.
 * Schema only: no ParcelRunAssignment, load/unload custody write,
 * segment-capacity reservation, manifest, or production deployment is
 * enabled by this migration alone.
 *
 * FK target (transport_provider) follows the exact same convention every
 * prior Stage 3S migration in this lineage already uses -- flagged, not
 * fixed, since Stage 3S-B3's AddTransportQuote migration; every real
 * environment that runs this migration already has that table via
 * `synchronize: true`.
 *
 * `type`/`operationalStatus` are stored as character varying + CHECK
 * constraints rather than native Postgres enum types, matching this
 * lineage's own established precedent (TransportQuote.status,
 * TransportRun.status) -- the TypeORM entities themselves still declare
 * `type: 'enum'` for synchronize:true environments.
 */
export class AddVehicleFoundation1788285600000 implements MigrationInterface {
  name = 'AddVehicleFoundation1788285600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS public.vehicle (
      id SERIAL PRIMARY KEY,
      "providerId" integer NOT NULL,
      identifier character varying(120) NOT NULL,
      "registrationPlate" character varying(40),
      type character varying(16) NOT NULL,
      "parcelCapacity" integer,
      "weightCapacityKg" numeric(10,2),
      "volumeCapacityM3" numeric(10,2),
      "isActive" boolean NOT NULL DEFAULT true,
      "operationalStatus" character varying(16) NOT NULL DEFAULT 'available',
      "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT "FK_vehicle_provider" FOREIGN KEY ("providerId")
        REFERENCES public.transport_provider(id) ON DELETE CASCADE,
      CONSTRAINT "CHK_vehicle_type" CHECK (
        type IN ('bus','courier','van','truck','boda','rail','air','boat')
      ),
      CONSTRAINT "CHK_vehicle_operational_status" CHECK (
        "operationalStatus" IN ('available','in_use','maintenance','retired')
      ),
      CONSTRAINT "CHK_vehicle_capacity" CHECK ("parcelCapacity" IS NULL OR "parcelCapacity" >= 0),
      CONSTRAINT "CHK_vehicle_weight_capacity" CHECK ("weightCapacityKg" IS NULL OR "weightCapacityKg" >= 0),
      CONSTRAINT "CHK_vehicle_volume_capacity" CHECK ("volumeCapacityM3" IS NULL OR "volumeCapacityM3" >= 0)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_vehicle_provider_active"
      ON public.vehicle ("providerId", "isActive")`);

    // Additive: a Run MAY be assigned a vehicle (Stage 3S-C2); every
    // existing/legacy Run row keeps vehicleId NULL forever. Does not touch
    // the RouteStop/TransportRunStop snapshot contract C1 established.
    await queryRunner.query(`ALTER TABLE public.transport_run
      ADD COLUMN IF NOT EXISTS "vehicleId" integer`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_transport_run_vehicle') THEN
        ALTER TABLE public.transport_run ADD CONSTRAINT "FK_transport_run_vehicle"
          FOREIGN KEY ("vehicleId") REFERENCES public.vehicle(id) ON DELETE RESTRICT;
      END IF;
    END $$`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_transport_run_vehicle"
      ON public.transport_run ("vehicleId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE public.vehicle, public.transport_run IN ACCESS EXCLUSIVE MODE');
    const [{ exists: hasVehicles }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.vehicle) AS exists',
    );
    const [{ exists: hasAssignedRuns }] = await queryRunner.query(
      'SELECT EXISTS (SELECT 1 FROM public.transport_run WHERE "vehicleId" IS NOT NULL) AS exists',
    );
    if (hasVehicles || hasAssignedRuns) {
      throw new Error('refusing to remove nonempty vehicle history');
    }
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_transport_run_vehicle"');
    await queryRunner.query('ALTER TABLE public.transport_run DROP CONSTRAINT IF EXISTS "FK_transport_run_vehicle"');
    await queryRunner.query('ALTER TABLE public.transport_run DROP COLUMN IF EXISTS "vehicleId"');
    await queryRunner.query('DROP TABLE public.vehicle');
  }
}
