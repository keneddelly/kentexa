import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJourneyFoundation1788291000000 implements MigrationInterface {
  name = 'AddJourneyFoundation1788291000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxItemLengthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxItemWidthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "maxItemHeightCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "acceptedCargoClasses" jsonb`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsLoadingAssistance" boolean`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsUnloadingAssistance" boolean`);
    await q.query(`ALTER TABLE "vehicle" ADD COLUMN IF NOT EXISTS "supportsLiftingEquipment" boolean`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxVolumeM3" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxItemLengthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxItemWidthCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "maxItemHeightCm" decimal(10,2)`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "acceptedCargoClasses" jsonb`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsLoadingAssistance" boolean`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsUnloadingAssistance" boolean`);
    await q.query(`ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "supportsLiftingEquipment" boolean`);

    await q.query(`CREATE TABLE "journey_selection" (
      "id" SERIAL PRIMARY KEY,
      "requestedByUserId" integer NOT NULL,
      "version" integer NOT NULL DEFAULT 1,
      "supersedesSelectionId" integer,
      "supersededBySelectionId" integer,
      "status" varchar(24) NOT NULL DEFAULT 'selected',
      "originSnapshot" jsonb NOT NULL,
      "destinationSnapshot" jsonb NOT NULL,
      "cargoRequirements" jsonb NOT NULL,
      "expectedCashCollectorType" varchar(32),
      "expectedCashCollectionLegSequence" integer,
      "selectedAt" timestamp NOT NULL DEFAULT now(),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_journey_selection_status" CHECK ("status" IN ('selected','quoted','committed','superseded','cancelled')),
      CONSTRAINT "CHK_journey_selection_version" CHECK ("version" >= 1),
      CONSTRAINT "CHK_journey_selection_cash_leg" CHECK ("expectedCashCollectionLegSequence" IS NULL OR "expectedCashCollectionLegSequence" >= 1),
      CONSTRAINT "FK_journey_selection_supersedes" FOREIGN KEY ("supersedesSelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_journey_selection_superseded_by" FOREIGN KEY ("supersededBySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE INDEX "IDX_journey_selection_requester" ON "journey_selection" ("requestedByUserId","createdAt")`);

    await q.query(`CREATE TABLE "journey_leg" (
      "id" SERIAL PRIMARY KEY,
      "journeySelectionId" integer NOT NULL,
      "sequence" integer NOT NULL,
      "type" varchar(24) NOT NULL,
      "fromNode" jsonb NOT NULL,
      "toNode" jsonb NOT NULL,
      "providerId" integer,
      "routeId" integer,
      "loadRouteStopId" integer,
      "unloadRouteStopId" integer,
      "availabilityId" integer,
      "runId" integer,
      "agentId" integer,
      "superAgentId" integer,
      "commitmentLevel" varchar(24) NOT NULL DEFAULT 'service_confirmed',
      "requiredActorCapability" varchar(32),
      "executionRequirements" jsonb NOT NULL DEFAULT '{}',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "FK_journey_leg_selection" FOREIGN KEY ("journeySelectionId") REFERENCES "journey_selection"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_journey_leg_sequence" CHECK ("sequence" >= 1),
      CONSTRAINT "CHK_journey_leg_type" CHECK ("type" IN ('first_mile','hub_intake','transport','transfer','last_mile','customer_pickup')),
      CONSTRAINT "CHK_journey_leg_commitment" CHECK ("commitmentLevel" IN ('service_confirmed','run_confirmed','vehicle_confirmed')),
      CONSTRAINT "UQ_journey_leg_sequence" UNIQUE ("journeySelectionId","sequence")
    )`);

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
    await q.query(`ALTER TABLE "parcel" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`ALTER TABLE "shipment" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`ALTER TABLE "transport_quote" DROP COLUMN IF EXISTS "journeySelectionId"`);
    await q.query(`DROP TABLE IF EXISTS "journey_leg"`);
    await q.query(`DROP TABLE IF EXISTS "journey_selection"`);
    for (const table of ['vehicle','agent']) {
      for (const col of ['maxItemLengthCm','maxItemWidthCm','maxItemHeightCm','acceptedCargoClasses','supportsLoadingAssistance','supportsUnloadingAssistance','supportsLiftingEquipment']) {
        await q.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${col}"`);
      }
    }
    await q.query(`ALTER TABLE "agent" DROP COLUMN IF EXISTS "maxVolumeM3"`);
  }
}
