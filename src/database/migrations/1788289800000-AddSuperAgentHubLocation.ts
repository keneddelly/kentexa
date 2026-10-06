import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes a Super Agent hub a coordinate-aware logistics node.
 * Existing city/address remain compatibility fields while route matching migrates.
 * New location facts are written only after server-side Location Intelligence resolution.
 */
export class AddSuperAgentHubLocation1788289800000 implements MigrationInterface {
  name = 'AddSuperAgentHubLocation1788289800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "super_agent"
        ADD COLUMN IF NOT EXISTS "locationLabel" varchar(200),
        ADD COLUMN IF NOT EXISTS "latitude" decimal(10,7),
        ADD COLUMN IF NOT EXISTS "longitude" decimal(10,7),
        ADD COLUMN IF NOT EXISTS "locationProviderKey" varchar(40),
        ADD COLUMN IF NOT EXISTS "locationProviderPlaceId" varchar(80),
        ADD COLUMN IF NOT EXISTS "locationResolutionMethod" varchar(40),
        ADD COLUMN IF NOT EXISTS "regionId" integer,
        ADD COLUMN IF NOT EXISTS "regionName" varchar(120),
        ADD COLUMN IF NOT EXISTS "districtId" integer,
        ADD COLUMN IF NOT EXISTS "districtName" varchar(120),
        ADD COLUMN IF NOT EXISTS "wardId" integer,
        ADD COLUMN IF NOT EXISTS "wardName" varchar(120)
    `);
    await queryRunner.query(`
      ALTER TABLE "super_agent"
      ADD CONSTRAINT "CHK_super_agent_location_coordinate_pair"
      CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_super_agent_location_region_district"
      ON "super_agent" ("regionId", "districtId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_super_agent_location_region_district"');
    await queryRunner.query('ALTER TABLE "super_agent" DROP CONSTRAINT IF EXISTS "CHK_super_agent_location_coordinate_pair"');
    await queryRunner.query(`
      ALTER TABLE "super_agent"
        DROP COLUMN IF EXISTS "wardName", DROP COLUMN IF EXISTS "wardId",
        DROP COLUMN IF EXISTS "districtName", DROP COLUMN IF EXISTS "districtId",
        DROP COLUMN IF EXISTS "regionName", DROP COLUMN IF EXISTS "regionId",
        DROP COLUMN IF EXISTS "locationResolutionMethod",
        DROP COLUMN IF EXISTS "locationProviderPlaceId",
        DROP COLUMN IF EXISTS "locationProviderKey",
        DROP COLUMN IF EXISTS "longitude", DROP COLUMN IF EXISTS "latitude",
        DROP COLUMN IF EXISTS "locationLabel"
    `);
  }
}
