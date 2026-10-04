import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L1 Journey Foundation. Forward-only and additive after production head
 * 1788290400000. Historical duplicate 1788288600000 ledger entries are
 * intentionally untouched.
 */
export class AddJourneyFoundation1788291000000 implements MigrationInterface {
  name = 'AddJourneyFoundation1788291000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxCargoLengthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxCargoWidthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxCargoHeightCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "acceptedCargoClasses" text`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsLoadingAssistance" boolean`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsUnloadingAssistance" boolean`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsLiftingEquipment" boolean`);

    await q.query(`ALTER TABLE "transport_provider" ADD COLUMN IF NOT EXISTS "acceptedCargoClasses" text`);

    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxVolumeM3" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxCargoLengthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxCargoWidthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxCargoHeightCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "acceptedCargoClasses" text`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsLoadingAssistance" boolean`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsUnloadingAssistance" boolean`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsLiftingEquipment" boolean`);

    await q.query(`
      CREATE TABLE "journey_selection" (
        "id" SERIAL PRIMARY KEY,
        "requestedByUserId" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "supersedesSelectionId" integer,
        "supersededBySelectionId" integer,
        "originLabel" varchar(200) NOT NULL,
        "originWardId" integer,
        "originRegionId" integer,
        "originLatitude" double precision,
        "originLongitude" double precision,
        "destinationLabel" varchar(200) NOT NULL,
        "destinationWardId" integer,
        "destinationRegionId" integer,
        "destinationLatitude" double precision,
        "destinationLongitude" double precision,
        "cargoRequirements" jsonb NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'selected',
        "expectedCashCollectorType" varchar(32),
        "expectedCashCollectionLegSequence" integer,
        "selectedAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_journey_selection_status" CHECK ("status" IN ('selected','quoted','committed','superseded','cancelled')),
        CONSTRAINT "CHK_journey_cash_collector" CHECK ("expectedCashCollectorType" IS NULL OR "expectedCashCollectorType" IN ('agent','super_agent','transport_provider','customer'))
      )
    `);
    await q.query(`CREATE INDEX "IDX_journey_selection_requester_status" ON "journey_selection" ("requestedByUserId","status")`);
    await q.query(`ALTER TABLE "journey_selection" ADD CONSTRAINT "FK_journey_supersedes" FOREIGN KEY ("supersedesSelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "journey_selection" ADD CONSTRAINT "FK_journey_superseded_by" FOREIGN KEY ("supersededBySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT`);

    await q.query(`
      CREATE TABLE "journey_leg" (
        "id" SERIAL PRIMARY KEY,
        "journeySelectionId" integer NOT NULL REFERENCES "journey_selection"("id") ON DELETE RESTRICT,
        "sequence" integer NOT NULL,
        "legType" varchar(32) NOT NULL,
        "actorType" varchar(32) NOT NULL,
        "fromLabel" varchar(200) NOT NULL,
        "toLabel" varchar(200) NOT NULL,
        "providerId" integer,
        "routeId" integer,
        "availabilityId" integer,
        "runId" integer,
        "vehicleId" integer,
        "fromRouteStopId" integer,
        "toRouteStopId" integer,
        "agentId" integer,
        "superAgentId" integer,
        "commitmentLevel" varchar(32) NOT NULL DEFAULT 'service_confirmed',
        "compatibility" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_journey_leg_sequence" UNIQUE ("journeySelectionId","sequence"),
        CONSTRAINT "CHK_journey_leg_type" CHECK ("legType" IN ('first_mile','hub_intake','transport','transfer','last_mile','customer_pickup')),
        CONSTRAINT "CHK_journey_actor_type" CHECK ("actorType" IN ('agent','super_agent','transport_provider','customer'))
      )
    `);

    await q.query(`ALTER TABLE "transport_quote" ADD COLUMN IF NOT EXISTS "journeySelectionId" integer`);
    await q.query(`ALTER TABLE "transport_quote" ADD CONSTRAINT "FK_transport_quote_journey_selection" FOREIGN KEY ("journeySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "IDX_transport_quote_journey_selection" ON "transport_quote" ("journeySelectionId") WHERE "journeySelectionId" IS NOT NULL`);

    await q.query(`ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "journeySelectionId" integer`);
    await q.query(`ALTER TABLE "shipment" ADD CONSTRAINT "FK_shipment_journey_selection" FOREIGN KEY ("journeySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "IDX_shipment_journey_selection" ON "shipment" ("journeySelectionId") WHERE "journeySelectionId" IS NOT NULL`);

    await q.query(`ALTER TABLE "parcel" ADD COLUMN IF NOT EXISTS "journeySelectionId" integer`);
    await q.query(`ALTER TABLE "parcel" ADD CONSTRAINT "FK_parcel_journey_selection" FOREIGN KEY ("journeySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "IDX_parcel_journey_selection" ON "parcel" ("journeySelectionId") WHERE "journeySelectionId" IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "parcel" DROP CONSTRAINT IF EXISTS "FK_parcel_journey_selection"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_parcel_journey_selection"`);
    await q.query(`ALTER TABLE "parcel" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`ALTER TABLE "shipment" DROP CONSTRAINT IF EXISTS "FK_shipment_journey_selection"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_shipment_journey_selection"`);
    await q.query(`ALTER TABLE "shipment" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`ALTER TABLE "transport_quote" DROP CONSTRAINT IF EXISTS "FK_transport_quote_journey_selection"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_transport_quote_journey_selection"`);
    await q.query(`ALTER TABLE "transport_quote" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`DROP TABLE IF EXISTS "journey_leg"`);
    await q.query(`DROP TABLE IF EXISTS "journey_selection"`);
    for (const c of ['maxVolumeM3','maxCargoLengthCm','maxCargoWidthCm','maxCargoHeightCm','acceptedCargoClasses','supportsLoadingAssistance','supportsUnloadingAssistance','supportsLiftingEquipment']) {
      await q.query(`ALTER TABLE "agent" DROP COLUMN IF EXISTS "${c}"`);
    }
    await q.query(`ALTER TABLE "transport_provider" DROP COLUMN IF EXISTS "acceptedCargoClasses"`);
    for (const c of ['maxCargoLengthCm','maxCargoWidthCm','maxCargoHeightCm','acceptedCargoClasses','supportsLoadingAssistance','supportsUnloadingAssistance','supportsLiftingEquipment']) {
      await q.query(`ALTER TABLE "vehicle" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
