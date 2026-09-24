import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 2F shipment hub decision. Adds the canonical, write-once record of
 * which SuperAgent hub (if any) a sender selected for each side of a Shipment:
 *   "originHubId" / "destinationHubId"      integer NULL  -> super_agent(id)
 *   "originHubSource" / "destinationHubSource" varchar(24) NULL (provenance)
 *   "hubDecidedAt"                          timestamp NULL
 *
 * Additive only: every column is nullable with no default, so every existing
 * row stays valid with NULLs (= undecided). No backfill: this migration reads
 * no rows and writes no rows, and never derives a hub from a city string.
 *
 * Constraints (all created idempotently):
 *  - FK_shipment_origin_hub / FK_shipment_destination_hub: ON DELETE SET NULL
 *    (same as the Parcel hub FKs) -- the provenance survives a hub deletion
 *    and a user deletion is never blocked by a historical selection;
 *  - partial indexes on each hub id (serve the FK action / lookups);
 *  - CHK_shipment_origin_hub_decision / CHK_shipment_destination_hub_decision:
 *    source NULL => no hub; 'none_available'/'not_required' => no hub;
 *    naming sources may have a NULL id afterwards (hub row deleted);
 *  - CHK_shipment_hub_decision_atomic: both sides and hubDecidedAt are decided
 *    together or not at all.
 * The source vocabulary below is a frozen copy on purpose (a migration must
 * not change when application code does); a spec asserts it equals the
 * application enum.
 */
export const SHIPMENT_HUB_DECISION_COLUMNS: string[] = [
  'originHubId',
  'destinationHubId',
  'originHubSource',
  'destinationHubSource',
  'hubDecidedAt',
];
export const SHIPMENT_HUB_DECISION_SOURCES_FROZEN = [
  'sender_selected',
  'auto_single_candidate',
  'none_available',
  'not_required',
] as const;

const SIDES = ['origin', 'destination'] as const;

const addConstraint = (name: string, ddl: string) => `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = '${name}' AND conrelid = 'public.shipment'::regclass
    ) THEN
      ALTER TABLE public.shipment ADD CONSTRAINT "${name}" ${ddl};
    END IF;
  END $$`;

export class AddShipmentHubDecision1788274800000 implements MigrationInterface {
  name = 'AddShipmentHubDecision1788274800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.shipment
         ADD COLUMN IF NOT EXISTS "originHubId" integer,
         ADD COLUMN IF NOT EXISTS "destinationHubId" integer,
         ADD COLUMN IF NOT EXISTS "originHubSource" character varying(24),
         ADD COLUMN IF NOT EXISTS "destinationHubSource" character varying(24),
         ADD COLUMN IF NOT EXISTS "hubDecidedAt" timestamp without time zone`,
    );

    for (const side of SIDES) {
      await queryRunner.query(
        addConstraint(
          `FK_shipment_${side}_hub`,
          `FOREIGN KEY ("${side}HubId") REFERENCES public.super_agent(id) ON DELETE SET NULL`,
        ),
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_shipment_${side}HubId" ON public.shipment ("${side}HubId") WHERE "${side}HubId" IS NOT NULL`,
      );
      await queryRunner.query(
        addConstraint(
          `CHK_shipment_${side}_hub_decision`,
          `CHECK (
             ("${side}HubSource" IS NULL AND "${side}HubId" IS NULL)
             OR ("${side}HubSource" IS NOT NULL AND "${side}HubSource" IN ('sender_selected', 'auto_single_candidate'))
             OR ("${side}HubSource" IS NOT NULL AND "${side}HubSource" IN ('none_available', 'not_required') AND "${side}HubId" IS NULL)
           )`,
        ),
      );
    }
    await queryRunner.query(
      addConstraint(
        'CHK_shipment_hub_decision_atomic',
        `CHECK (
           ("originHubSource" IS NULL) = ("destinationHubSource" IS NULL)
           AND ("originHubSource" IS NULL) = ("hubDecidedAt" IS NULL)
         )`,
      ),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "CHK_shipment_hub_decision_atomic"`,
    );
    for (const side of SIDES) {
      await queryRunner.query(
        `ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "CHK_shipment_${side}_hub_decision"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS public."IDX_shipment_${side}HubId"`);
      await queryRunner.query(
        `ALTER TABLE public.shipment DROP CONSTRAINT IF EXISTS "FK_shipment_${side}_hub"`,
      );
    }
    const drops = SHIPMENT_HUB_DECISION_COLUMNS.map((c) => `DROP COLUMN IF EXISTS "${c}"`);
    await queryRunner.query(`ALTER TABLE public.shipment ${drops.join(', ')}`);
  }
}
