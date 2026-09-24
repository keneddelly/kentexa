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
 *    source NULL => no hub; 'none_available'/'not_required' => no hub; naming
 *    sources use a hub id when the decision is first written;
 *  - TRG_shipment_hub_decision_guard: rejects INSERT/UPDATE that creates a
 *    naming source with NULL hub id. It permits only an unchanged historical
 *    naming source whose id was cleared because its referenced SuperAgent row
 *    no longer exists (the FK's ON DELETE SET NULL action);
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
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public."fn_shipment_hub_decision_guard"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        origin_deleted boolean := false;
        destination_deleted boolean := false;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          origin_deleted :=
            OLD."originHubId" IS NOT NULL
            AND NEW."originHubId" IS NULL
            AND NEW."originHubSource" = OLD."originHubSource"
            AND NEW."originHubSource" IN ('sender_selected', 'auto_single_candidate')
            AND NOT EXISTS (SELECT 1 FROM public.super_agent WHERE id = OLD."originHubId");

          destination_deleted :=
            OLD."destinationHubId" IS NOT NULL
            AND NEW."destinationHubId" IS NULL
            AND NEW."destinationHubSource" = OLD."destinationHubSource"
            AND NEW."destinationHubSource" IN ('sender_selected', 'auto_single_candidate')
            AND NOT EXISTS (SELECT 1 FROM public.super_agent WHERE id = OLD."destinationHubId");
        END IF;

        IF NEW."originHubSource" IN ('sender_selected', 'auto_single_candidate')
           AND NEW."originHubId" IS NULL
           AND NOT (
             (TG_OP = 'UPDATE' AND OLD."originHubId" IS NULL AND OLD."originHubSource" = NEW."originHubSource")
             OR origin_deleted
           )
        THEN
          RAISE EXCEPTION 'origin naming hub source requires a hub id'
            USING ERRCODE = '23514', CONSTRAINT = 'TRG_shipment_hub_decision_guard';
        END IF;

        IF NEW."destinationHubSource" IN ('sender_selected', 'auto_single_candidate')
           AND NEW."destinationHubId" IS NULL
           AND NOT (
             (TG_OP = 'UPDATE' AND OLD."destinationHubId" IS NULL AND OLD."destinationHubSource" = NEW."destinationHubSource")
             OR destination_deleted
           )
        THEN
          RAISE EXCEPTION 'destination naming hub source requires a hub id'
            USING ERRCODE = '23514', CONSTRAINT = 'TRG_shipment_hub_decision_guard';
        END IF;

        RETURN NEW;
      END $$`
    );
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_shipment_hub_decision_guard" ON public.shipment`);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_shipment_hub_decision_guard"
      BEFORE INSERT OR UPDATE OF "originHubId", "destinationHubId", "originHubSource", "destinationHubSource"
      ON public.shipment
      FOR EACH ROW EXECUTE FUNCTION public."fn_shipment_hub_decision_guard"()
    `);

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
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_shipment_hub_decision_guard" ON public.shipment`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS public."fn_shipment_hub_decision_guard"()`);
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
