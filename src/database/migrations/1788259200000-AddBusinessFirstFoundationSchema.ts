import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Business-First Stage 1 foundation -- schema only, additive, zero data
 * written. Creates the four new organizational tables (operational_workspace,
 * business_membership, workspace_assignment, business_capability), their own
 * audit table (business_first_migration_audit), and one nullable additive
 * column on account_role (workspaceAssignmentId). Every constraint/index is
 * created immediately -- safe because every new table starts empty, so there
 * is no "tighten later" pass needed (unlike a migration that alters existing
 * populated data).
 *
 * Deliberately does NOT backfill anything. Per the corrected Stage 1 plan,
 * backfilling existing Business/SellerProfile/CommerceProfileMember rows
 * into these tables is a separate, human-gated, dry-run-first operation
 * performed by the standalone backfill-business-first-foundation.ts tool
 * (mirroring the Stage 2 conversation-classification/participant-completion
 * tools), never embedded in a migration's up().
 *
 * Existence-aware, following the same hardening this repository already
 * applied to AddCommunicationParticipantAudience: OBJECT ABSENT -> create;
 * OBJECT PRESENT and matches the expected column set -> skip, log, continue;
 * OBJECT PRESENT but missing an expected column -> throw a specific
 * diagnostic rather than a generic Postgres "already exists" error or a
 * silent accept of an incompatible shape. This tolerates a dev database
 * where TypeORM `synchronize` already created some/all of these objects
 * from the entity definitions before this migration ran.
 */
export class AddBusinessFirstFoundationSchema1788259200000
  implements MigrationInterface
{
  name = 'AddBusinessFirstFoundationSchema1788259200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureEnumTypes(queryRunner);
    await this.ensureOperationalWorkspaceTable(queryRunner);
    await this.ensureBusinessMembershipTable(queryRunner);
    await this.ensureWorkspaceAssignmentTable(queryRunner);
    await this.ensureBusinessCapabilityTable(queryRunner);
    await this.ensureBusinessFirstMigrationAuditTable(queryRunner);
    await this.ensureAccountRoleWorkspaceAssignmentColumn(queryRunner);
  }

  private async ensureEnumTypes(queryRunner: QueryRunner): Promise<void> {
    const enums: Array<{ name: string; values: string[] }> = [
      { name: 'operational_workspace_status_enum', values: ['active', 'suspended'] },
      { name: 'business_membership_role_template_enum', values: ['owner', 'manager', 'staff'] },
      { name: 'business_membership_status_enum', values: ['active', 'revoked'] },
      { name: 'workspace_assignment_status_enum', values: ['active', 'revoked'] },
      { name: 'business_capability_code_enum', values: ['commerce', 'transport', 'cargo', 'super_agent'] },
      { name: 'business_capability_status_enum', values: ['active', 'suspended', 'revoked'] },
    ];
    for (const e of enums) {
      const rows = (await queryRunner.query(
        `SELECT 1 FROM pg_type WHERE typname = $1`,
        [e.name],
      )) as unknown[];
      if (rows.length > 0) continue;
      const valueList = e.values.map((v) => `'${v}'`).join(', ');
      await queryRunner.query(`CREATE TYPE public.${e.name} AS ENUM (${valueList});`);
    }
  }

  private async ensureOperationalWorkspaceTable(queryRunner: QueryRunner): Promise<void> {
    const expectedColumns = ['id', 'businessId', 'name', 'isDefault', 'status', 'createdAt', 'updatedAt'];
    if (await queryRunner.hasTable('operational_workspace')) {
      await this.assertColumnsPresent(queryRunner, 'operational_workspace', expectedColumns);
    } else {
      await queryRunner.query(`
        CREATE TABLE public.operational_workspace (
          id SERIAL NOT NULL,
          "businessId" integer NOT NULL,
          name character varying NOT NULL,
          "isDefault" boolean NOT NULL DEFAULT false,
          status public.operational_workspace_status_enum NOT NULL DEFAULT 'active',
          "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
          "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
          CONSTRAINT "PK_operational_workspace" PRIMARY KEY (id),
          CONSTRAINT "FK_operational_workspace_business" FOREIGN KEY ("businessId")
            REFERENCES public.business(id) ON DELETE CASCADE
        );
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_operational_workspace_business',
      `CREATE INDEX "IDX_operational_workspace_business" ON public.operational_workspace USING btree ("businessId")`);
    await this.ensureIndex(queryRunner, 'UQ_operational_workspace_default_per_business',
      `CREATE UNIQUE INDEX "UQ_operational_workspace_default_per_business" ON public.operational_workspace USING btree ("businessId") WHERE "isDefault" = true`);
  }

  private async ensureBusinessMembershipTable(queryRunner: QueryRunner): Promise<void> {
    const expectedColumns = [
      'id', 'businessId', 'userId', 'roleTemplate', 'status', 'joinedAt',
      'revokedAt', 'revokedByUserId', 'statusReason', 'createdAt', 'updatedAt',
    ];
    if (await queryRunner.hasTable('business_membership')) {
      await this.assertColumnsPresent(queryRunner, 'business_membership', expectedColumns);
    } else {
      await queryRunner.query(`
        CREATE TABLE public.business_membership (
          id SERIAL NOT NULL,
          "businessId" integer NOT NULL,
          "userId" integer NOT NULL,
          "roleTemplate" public.business_membership_role_template_enum NOT NULL,
          status public.business_membership_status_enum NOT NULL DEFAULT 'active',
          "joinedAt" timestamp without time zone NOT NULL DEFAULT now(),
          "revokedAt" timestamp without time zone,
          "revokedByUserId" integer,
          "statusReason" text,
          "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
          "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
          CONSTRAINT "PK_business_membership" PRIMARY KEY (id),
          CONSTRAINT "UQ_business_membership_user_business" UNIQUE ("userId", "businessId"),
          CONSTRAINT "FK_business_membership_business" FOREIGN KEY ("businessId")
            REFERENCES public.business(id) ON DELETE CASCADE,
          CONSTRAINT "FK_business_membership_user" FOREIGN KEY ("userId")
            REFERENCES public."user"(id) ON DELETE CASCADE,
          CONSTRAINT "FK_business_membership_revoked_by" FOREIGN KEY ("revokedByUserId")
            REFERENCES public."user"(id) ON DELETE SET NULL
        );
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_business_membership_user_status',
      `CREATE INDEX "IDX_business_membership_user_status" ON public.business_membership USING btree ("userId", status)`);
    await this.ensureIndex(queryRunner, 'IDX_business_membership_business_status',
      `CREATE INDEX "IDX_business_membership_business_status" ON public.business_membership USING btree ("businessId", status)`);
    await this.ensureIndex(queryRunner, 'UQ_business_membership_one_owner',
      `CREATE UNIQUE INDEX "UQ_business_membership_one_owner" ON public.business_membership USING btree ("businessId") WHERE "roleTemplate" = 'owner' AND status = 'active'`);
  }

  private async ensureWorkspaceAssignmentTable(queryRunner: QueryRunner): Promise<void> {
    const expectedColumns = [
      'id', 'businessMembershipId', 'workspaceId', 'status', 'permissions',
      'assignedAt', 'revokedAt', 'createdAt', 'updatedAt',
    ];
    if (await queryRunner.hasTable('workspace_assignment')) {
      await this.assertColumnsPresent(queryRunner, 'workspace_assignment', expectedColumns);
    } else {
      await queryRunner.query(`
        CREATE TABLE public.workspace_assignment (
          id SERIAL NOT NULL,
          "businessMembershipId" integer NOT NULL,
          "workspaceId" integer NOT NULL,
          status public.workspace_assignment_status_enum NOT NULL DEFAULT 'active',
          permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
          "assignedAt" timestamp without time zone NOT NULL DEFAULT now(),
          "revokedAt" timestamp without time zone,
          "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
          "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
          CONSTRAINT "PK_workspace_assignment" PRIMARY KEY (id),
          CONSTRAINT "UQ_workspace_assignment_membership_workspace" UNIQUE ("businessMembershipId", "workspaceId"),
          CONSTRAINT "FK_workspace_assignment_membership" FOREIGN KEY ("businessMembershipId")
            REFERENCES public.business_membership(id) ON DELETE CASCADE,
          CONSTRAINT "FK_workspace_assignment_workspace" FOREIGN KEY ("workspaceId")
            REFERENCES public.operational_workspace(id) ON DELETE CASCADE
        );
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_workspace_assignment_membership_status',
      `CREATE INDEX "IDX_workspace_assignment_membership_status" ON public.workspace_assignment USING btree ("businessMembershipId", status)`);
    await this.ensureIndex(queryRunner, 'IDX_workspace_assignment_workspace_status',
      `CREATE INDEX "IDX_workspace_assignment_workspace_status" ON public.workspace_assignment USING btree ("workspaceId", status)`);
  }

  private async ensureBusinessCapabilityTable(queryRunner: QueryRunner): Promise<void> {
    const expectedColumns = [
      'id', 'workspaceId', 'capabilityCode', 'status', 'approvedAt',
      'approvedByUserId', 'suspendedAt', 'statusReason', 'createdAt', 'updatedAt',
    ];
    if (await queryRunner.hasTable('business_capability')) {
      await this.assertColumnsPresent(queryRunner, 'business_capability', expectedColumns);
    } else {
      await queryRunner.query(`
        CREATE TABLE public.business_capability (
          id SERIAL NOT NULL,
          "workspaceId" integer NOT NULL,
          "capabilityCode" public.business_capability_code_enum NOT NULL,
          status public.business_capability_status_enum NOT NULL DEFAULT 'active',
          "approvedAt" timestamp without time zone,
          "approvedByUserId" integer,
          "suspendedAt" timestamp without time zone,
          "statusReason" text,
          "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
          "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
          CONSTRAINT "PK_business_capability" PRIMARY KEY (id),
          CONSTRAINT "UQ_business_capability_workspace_code" UNIQUE ("workspaceId", "capabilityCode"),
          CONSTRAINT "FK_business_capability_workspace" FOREIGN KEY ("workspaceId")
            REFERENCES public.operational_workspace(id) ON DELETE CASCADE,
          CONSTRAINT "FK_business_capability_approved_by" FOREIGN KEY ("approvedByUserId")
            REFERENCES public."user"(id) ON DELETE SET NULL
        );
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_business_capability_workspace_status',
      `CREATE INDEX "IDX_business_capability_workspace_status" ON public.business_capability USING btree ("workspaceId", status)`);
  }

  private async ensureBusinessFirstMigrationAuditTable(queryRunner: QueryRunner): Promise<void> {
    const expectedColumns = ['id', 'severity', 'code', 'sourceType', 'sourceId', 'userId', 'details', 'createdAt'];
    if (await queryRunner.hasTable('business_first_migration_audit')) {
      await this.assertColumnsPresent(queryRunner, 'business_first_migration_audit', expectedColumns);
    } else {
      await queryRunner.query(`
        CREATE TABLE public.business_first_migration_audit (
          id bigserial NOT NULL,
          severity character varying NOT NULL,
          code character varying NOT NULL,
          "sourceType" character varying NOT NULL,
          "sourceId" integer,
          "userId" integer,
          details jsonb NOT NULL DEFAULT '{}'::jsonb,
          "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
          CONSTRAINT "PK_business_first_migration_audit" PRIMARY KEY (id)
        );
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_business_first_migration_audit_code',
      `CREATE INDEX "IDX_business_first_migration_audit_code" ON public.business_first_migration_audit USING btree (code)`);
    await this.ensureIndex(queryRunner, 'IDX_business_first_migration_audit_user',
      `CREATE INDEX "IDX_business_first_migration_audit_user" ON public.business_first_migration_audit USING btree ("userId")`);
  }

  private async ensureAccountRoleWorkspaceAssignmentColumn(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('account_role', 'workspaceAssignmentId');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE public.account_role ADD COLUMN "workspaceAssignmentId" integer;`);
    }
    const fkRows = (await queryRunner.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'FK_account_role_workspace_assignment'
    `)) as unknown[];
    if (fkRows.length === 0) {
      await queryRunner.query(`
        ALTER TABLE public.account_role
          ADD CONSTRAINT "FK_account_role_workspace_assignment" FOREIGN KEY ("workspaceAssignmentId")
            REFERENCES public.workspace_assignment(id) ON DELETE SET NULL;
      `);
    }
    await this.ensureIndex(queryRunner, 'IDX_account_role_workspace_assignment',
      `CREATE INDEX "IDX_account_role_workspace_assignment" ON public.account_role USING btree ("workspaceAssignmentId")`);
  }

  /** OBJECT ABSENT -> create. OBJECT PRESENT (any definition) -> skip. */
  private async ensureIndex(queryRunner: QueryRunner, indexName: string, createSql: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length > 0) return;
    await queryRunner.query(createSql);
  }

  /** OBJECT PRESENT BUT WRONG -> STOP with diagnostic, never guess. */
  private async assertColumnsPresent(queryRunner: QueryRunner, table: string, expectedColumns: string[]): Promise<void> {
    const missing: string[] = [];
    for (const column of expectedColumns) {
      if (!(await queryRunner.hasColumn(table, column))) missing.push(column);
    }
    if (missing.length > 0) {
      throw new Error(
        `AddBusinessFirstFoundationSchema refused: table "${table}" already exists ` +
          `but is missing expected column(s): ${missing.join(', ')}. This table's shape ` +
          `does not match what this migration would create -- refusing to guess. ` +
          `Investigate manually before retrying.`,
      );
    }
  }

  async down(): Promise<void> {
    throw new Error(
      "Business-First Stage 1 foundation schema is intentionally " +
        "non-reversible, matching this repository's established precedent " +
        "for foundation-laying migrations (see AddAccountRoleAndActiveRoleSession). " +
        "Do not drop organizational foundation tables through migration rollback.",
    );
  }
}
