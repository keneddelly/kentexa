import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business Capability Activation Stage B1 -- BusinessCapabilityApplication
 * foundation.
 *
 * ============================================================================
 * PART A -- new table: business_capability_application
 * ============================================================================
 * The request/review/audit lifecycle for a workspace obtaining a
 * BusinessCapability, kept deliberately SEPARATE from BusinessCapability
 * itself (which represents granted entitlement only -- see that entity's
 * own doc comment and the Stage B architecture discovery report). Submitting
 * an application never creates or activates a BusinessCapability row; this
 * migration adds no data to that table and does not touch it structurally.
 *
 * Reuses two existing enum types verbatim rather than duplicating them:
 * business_capability_code_enum (capabilityCode) and role_profile_type_enum
 * (operationalProfileType) -- both already exist in production from earlier
 * migrations and describe exactly the same domains this table needs.
 * status gets its own new enum (pending/approved/rejected/cancelled) --
 * deliberately NOT the same type as business_capability_status_enum
 * (active/suspended/revoked): an application's lifecycle and a granted
 * capability's lifecycle are different concepts with different vocabularies
 * (Stage B architecture discovery §7: SUSPENDED belongs to BusinessCapability
 * only, never to an application).
 *
 * UQ_bca_workspace_code_pending is the one hard invariant this migration
 * enforces: at most one PENDING application per (workspaceId, capabilityCode)
 * at a time. It is a PARTIAL index (WHERE status = 'pending') so historical
 * APPROVED/REJECTED/CANCELLED rows for the same workspace+capability freely
 * coexist -- reapplication after rejection/cancellation creates a new row,
 * never mutates the old one (Stage B discovery §14/§17).
 *
 * ============================================================================
 * PART B -- optional defense-in-depth: SellerProfile.businessId uniqueness
 * ============================================================================
 * Added only after a read-only production preflight confirmed zero existing
 * SellerProfile rows share a non-null businessId (Stage B1 mission §7).
 * Today this is only prevented transitively (one active Owner per Business x
 * one SellerProfile ever per User, per the existing application-level
 * guards) -- once a future stage allows someone other than the applying user
 * to be involved, that transitive protection no longer holds by itself. This
 * partial unique index closes that gap at the database level without
 * changing any current behavior: activateSeller()/apply()'s own guards
 * already prevent a second SellerProfile per Business from ever being
 * attempted.
 */
export class AddBusinessCapabilityApplication1788261600000
  implements MigrationInterface
{
  name = 'AddBusinessCapabilityApplication1788261600000';

  private readonly TABLE = 'business_capability_application';
  private readonly STATUS_ENUM = 'business_capability_application_status_enum';

  private readonly IDX_BUSINESS_STATUS = 'IDX_bca_business_status';
  private readonly IDX_WORKSPACE_CODE_STATUS = 'IDX_bca_workspace_code_status';
  private readonly IDX_REQUESTED_BY_USER = 'IDX_bca_requested_by_user';
  private readonly UQ_WORKSPACE_CODE_PENDING = 'UQ_bca_workspace_code_pending';

  private readonly FK_BUSINESS = 'FK_bca_business';
  private readonly FK_WORKSPACE = 'FK_bca_workspace';
  private readonly FK_REQUESTED_BY_USER = 'FK_bca_requested_by_user';
  private readonly FK_REQUESTED_BY_ASSIGNMENT = 'FK_bca_requested_by_assignment';
  private readonly FK_REVIEWED_BY_USER = 'FK_bca_reviewed_by_user';

  private readonly SELLER_PROFILE_BUSINESS_UQ = 'UQ_seller_profile_business';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── PART A: business_capability_application ─────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "${this.STATUS_ENUM}" AS ENUM ('pending', 'approved', 'rejected', 'cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE public."${this.TABLE}" (
        "id" SERIAL PRIMARY KEY,
        "businessId" integer NOT NULL,
        "workspaceId" integer NOT NULL,
        "capabilityCode" business_capability_code_enum NOT NULL,
        "status" "${this.STATUS_ENUM}" NOT NULL DEFAULT 'pending',
        "requestedByUserId" integer NOT NULL,
        "requestedByWorkspaceAssignmentId" integer NOT NULL,
        "operationalProfileType" role_profile_type_enum,
        "operationalProfileId" integer,
        "applicationData" jsonb,
        "submittedAt" timestamp NOT NULL DEFAULT now(),
        "reviewedAt" timestamp,
        "reviewedByUserId" integer,
        "rejectionReason" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE public."${this.TABLE}"
        ADD CONSTRAINT "${this.FK_BUSINESS}" FOREIGN KEY ("businessId")
          REFERENCES public.business(id) ON DELETE CASCADE,
        ADD CONSTRAINT "${this.FK_WORKSPACE}" FOREIGN KEY ("workspaceId")
          REFERENCES public.operational_workspace(id) ON DELETE CASCADE,
        ADD CONSTRAINT "${this.FK_REQUESTED_BY_USER}" FOREIGN KEY ("requestedByUserId")
          REFERENCES public."user"(id) ON DELETE CASCADE,
        ADD CONSTRAINT "${this.FK_REQUESTED_BY_ASSIGNMENT}" FOREIGN KEY ("requestedByWorkspaceAssignmentId")
          REFERENCES public.workspace_assignment(id) ON DELETE CASCADE,
        ADD CONSTRAINT "${this.FK_REVIEWED_BY_USER}" FOREIGN KEY ("reviewedByUserId")
          REFERENCES public."user"(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "${this.IDX_BUSINESS_STATUS}" ON public."${this.TABLE}" USING btree ("businessId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_WORKSPACE_CODE_STATUS}" ON public."${this.TABLE}" USING btree ("workspaceId", "capabilityCode", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "${this.IDX_REQUESTED_BY_USER}" ON public."${this.TABLE}" USING btree ("requestedByUserId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.UQ_WORKSPACE_CODE_PENDING}" ON public."${this.TABLE}"
        USING btree ("workspaceId", "capabilityCode")
        WHERE "status" = 'pending'
    `);

    // ── PART B: SellerProfile.businessId defense-in-depth (proven safe by
    // the Stage B1 read-only preflight -- zero duplicates found) ───────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${this.SELLER_PROFILE_BUSINESS_UQ}" ON public.seller_profile
        USING btree ("businessId")
        WHERE "businessId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfPresent(queryRunner, this.SELLER_PROFILE_BUSINESS_UQ);

    await this.dropIndexIfPresent(queryRunner, this.UQ_WORKSPACE_CODE_PENDING);
    await this.dropIndexIfPresent(queryRunner, this.IDX_REQUESTED_BY_USER);
    await this.dropIndexIfPresent(queryRunner, this.IDX_WORKSPACE_CODE_STATUS);
    await this.dropIndexIfPresent(queryRunner, this.IDX_BUSINESS_STATUS);

    await queryRunner.query(`DROP TABLE IF EXISTS public."${this.TABLE}"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "${this.STATUS_ENUM}"`);
  }

  private async dropIndexIfPresent(queryRunner: QueryRunner, indexName: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length === 0) return;
    await queryRunner.query(`DROP INDEX public."${indexName}"`);
  }
}
