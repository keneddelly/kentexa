import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParcelMovementTender1788288600000 implements MigrationInterface {
  name = 'AddParcelMovementTender1788288600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parcel_movement_tender" (
        "id" SERIAL PRIMARY KEY,
        "parcelId" integer NOT NULL,
        "transportProviderId" integer NOT NULL,
        "runId" integer NULL,
        "loadRunStopId" integer NULL,
        "releasingSuperAgentId" integer NULL,
        "source" varchar(32) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "issuedByUserId" integer NULL,
        "issuedByRoleType" varchar(32) NULL,
        "idempotencyKey" varchar(128) NOT NULL,
        "expiresAt" timestamp NULL,
        "consumedByParcelRunAssignmentId" integer NULL,
        "consumedAt" timestamp NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_movement_tender_parcel" FOREIGN KEY ("parcelId") REFERENCES "parcel"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_tender_provider" FOREIGN KEY ("transportProviderId") REFERENCES "transport_provider"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_tender_run" FOREIGN KEY ("runId") REFERENCES "transport_run"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_tender_load_stop" FOREIGN KEY ("loadRunStopId") REFERENCES "transport_run_stop"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_tender_assignment" FOREIGN KEY ("consumedByParcelRunAssignmentId") REFERENCES "parcel_run_assignment"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_movement_tender_status" CHECK ("status" IN ('open','consumed','cancelled','expired')),
        CONSTRAINT "CHK_movement_tender_source" CHECK ("source" IN ('shipment_provider_booking','super_agent_release')),
        CONSTRAINT "CHK_movement_tender_hub_source" CHECK (
          ("source" = 'shipment_provider_booking' AND "releasingSuperAgentId" IS NULL)
          OR ("source" = 'super_agent_release' AND "releasingSuperAgentId" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_movement_tender_idempotency" ON "parcel_movement_tender" ("idempotencyKey")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_movement_tender_consumed_assignment" ON "parcel_movement_tender" ("consumedByParcelRunAssignmentId") WHERE "consumedByParcelRunAssignmentId" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movement_tender_open_lookup" ON "parcel_movement_tender" ("parcelId","transportProviderId","runId","loadRunStopId","status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "parcel_movement_tender"');
  }
}
