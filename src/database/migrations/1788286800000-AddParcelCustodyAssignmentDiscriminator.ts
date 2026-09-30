import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 3S-C4: disambiguates `parcel_custody_event.assignmentId`, which
 * meant ONLY legacy TransportAssignment.id before this migration -- the new
 * ParcelRunAssignment (Stage 3S-C3) needs to reference custody evidence too,
 * and silently reusing the same untyped column would make it impossible to
 * tell which assignment system a given row's `assignmentId` actually points
 * at.
 *
 * Additive only. `parcel_custody_event` is append-only (a BEFORE UPDATE/
 * DELETE trigger already enforces this -- see 1788278400000), so this
 * migration never backfills or rewrites a single existing row:
 *
 *   - "assignmentType" is added with no default; every pre-existing row gets
 *     NULL, which is the correct, permanent classification for it (a legacy
 *     row's `assignmentId`, when set, has only ever meant
 *     "transport_assignment" in practice -- this migration documents that
 *     fact by convention rather than writing it into the row).
 *   - The vocabulary CHECK validates normally against the whole table --
 *     every existing row's `assignmentType` is NULL, which trivially
 *     satisfies "IS NULL OR IN (...)", so this never rejects historical data.
 *   - The pairing CHECK (assignmentId set <=> assignmentType set) is added
 *     NOT VALID specifically because it WOULD reject every pre-existing row
 *     that has `assignmentId` set (every one of them, today) if validated
 *     against history. NOT VALID grandfathers those rows in permanently
 *     while still enforcing the pairing on every INSERT/UPDATE from this
 *     migration forward -- the same "fix by DB contract, not by rewriting
 *     history" principle Stage 3S-C1's DEFERRABLE sequence constraint and
 *     Stage 3S-B4's GiST exclusion constraint already established for this
 *     lineage. It must never be VALIDATEd later without a real backfill
 *     decision -- running VALIDATE CONSTRAINT as-is would fail permanently
 *     against every legacy row.
 */
export class AddParcelCustodyAssignmentDiscriminator1788286800000 implements MigrationInterface {
  name = 'AddParcelCustodyAssignmentDiscriminator1788286800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.parcel_custody_event
        ADD COLUMN IF NOT EXISTS "assignmentType" character varying(24)`);

    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CHK_parcel_custody_assignment_type_vocab'
      ) THEN
        ALTER TABLE public.parcel_custody_event
          ADD CONSTRAINT "CHK_parcel_custody_assignment_type_vocab"
          CHECK ("assignmentType" IS NULL OR "assignmentType" IN ('transport_assignment','parcel_run_assignment'));
      END IF;
    END $$`);

    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CHK_parcel_custody_assignment_type_pairing'
      ) THEN
        ALTER TABLE public.parcel_custody_event
          ADD CONSTRAINT "CHK_parcel_custody_assignment_type_pairing"
          CHECK (("assignmentId" IS NULL) = ("assignmentType" IS NULL)) NOT VALID;
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Lock first so a concurrent insert can't land between the emptiness
    // check and the drop -- the same race the table's own original
    // migration already guards against for the table itself.
    await queryRunner.query(`LOCK TABLE public.parcel_custody_event IN ACCESS EXCLUSIVE MODE`);
    const rows: { exists: boolean }[] = await queryRunner.query(
      `SELECT EXISTS(SELECT 1 FROM public.parcel_custody_event WHERE "assignmentType" IS NOT NULL) AS "exists"`,
    );
    if (rows[0]?.exists) {
      throw new Error('Cannot revert: parcel custody events already carry a real assignmentType classification');
    }
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event
      DROP CONSTRAINT IF EXISTS "CHK_parcel_custody_assignment_type_pairing"`);
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event
      DROP CONSTRAINT IF EXISTS "CHK_parcel_custody_assignment_type_vocab"`);
    await queryRunner.query(`ALTER TABLE public.parcel_custody_event
      DROP COLUMN IF EXISTS "assignmentType"`);
  }
}
