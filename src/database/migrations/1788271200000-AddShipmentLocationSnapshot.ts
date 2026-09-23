import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 2B shipment historical location snapshot. Adds 14 additive, nullable
 * columns (7 per side: origin/destination) to public.shipment so a Shipment
 * can carry a by-value record of the place the requester selected --
 * label, a validated coordinate pair, region/district names and provenance.
 *
 * Additive only: every column is nullable with no default, so every existing
 * row stays valid and simply has NULLs. This migration reads no rows, writes
 * no rows, backfills nothing, adds no constraint/index/FK, and touches no
 * existing column. down() drops exactly the columns up() adds.
 */
const SIDES = ['origin', 'destination'] as const;

// [suffix, SQL type]
const FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['LocationLabel', 'character varying(200)'],
  ['Latitude', 'double precision'],
  ['Longitude', 'double precision'],
  ['RegionName', 'character varying(120)'],
  ['DistrictName', 'character varying(120)'],
  ['ProviderKey', 'character varying(40)'],
  ['ResolutionMethod', 'character varying(40)'],
];

export const SHIPMENT_LOCATION_SNAPSHOT_COLUMNS: string[] = SIDES.flatMap((side) =>
  FIELDS.map(([suffix]) => `${side}${suffix}`),
);

export class AddShipmentLocationSnapshot1788271200000
  implements MigrationInterface
{
  name = 'AddShipmentLocationSnapshot1788271200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const adds = SIDES.flatMap((side) =>
      FIELDS.map(
        ([suffix, type]) => `ADD COLUMN IF NOT EXISTS "${side}${suffix}" ${type}`,
      ),
    );
    await queryRunner.query(`ALTER TABLE public.shipment ${adds.join(', ')}`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const drops = SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.map(
      (col) => `DROP COLUMN IF EXISTS "${col}"`,
    );
    await queryRunner.query(`ALTER TABLE public.shipment ${drops.join(', ')}`);
  }
}
