import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Phase A foundation. It intentionally does not read, update, or
 * delete legacy User.role/User.activeRoles and does not enable runtime guards.
 */
export class AddAccountRoleAndActiveRoleSession1788257400000
  implements MigrationInterface
{
  name = 'AddAccountRoleAndActiveRoleSession1788257400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE public.account_role_type_enum AS ENUM (
        'buyer', 'seller', 'agent', 'super_agent', 'transport_provider',
        'service_provider', 'customer_care', 'manager', 'admin', 'arbitrator'
      );
      CREATE TYPE public.account_role_status_enum AS ENUM (
        'active', 'pending', 'suspended', 'rejected', 'revoked'
      );
      CREATE TYPE public.role_profile_type_enum AS ENUM (
        'user', 'seller_profile', 'agent', 'super_agent', 'transport_provider'
      );

      CREATE TABLE public.account_role (
        id SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "roleType" public.account_role_type_enum NOT NULL,
        status public.account_role_status_enum NOT NULL,
        "profileType" public.role_profile_type_enum,
        "profileId" integer,
        capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
        "contextVersion" integer NOT NULL DEFAULT 1,
        "approvedAt" timestamp without time zone,
        "approvedByUserId" integer,
        "suspendedAt" timestamp without time zone,
        "suspendedByUserId" integer,
        "statusReason" text,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_account_role" PRIMARY KEY (id),
        CONSTRAINT "UQ_account_role_user_role" UNIQUE ("userId", "roleType"),
        CONSTRAINT "FK_account_role_user" FOREIGN KEY ("userId")
          REFERENCES public."user"(id) ON DELETE CASCADE,
        CONSTRAINT "FK_account_role_approved_by" FOREIGN KEY ("approvedByUserId")
          REFERENCES public."user"(id) ON DELETE SET NULL,
        CONSTRAINT "FK_account_role_suspended_by" FOREIGN KEY ("suspendedByUserId")
          REFERENCES public."user"(id) ON DELETE SET NULL
      );

      CREATE INDEX "IDX_account_role_user_status"
        ON public.account_role USING btree ("userId", status);
      CREATE INDEX "IDX_account_role_role_status"
        ON public.account_role USING btree ("roleType", status);
      CREATE INDEX "IDX_account_role_profile"
        ON public.account_role USING btree ("profileType", "profileId");
      CREATE UNIQUE INDEX "UQ_account_role_operational_profile"
        ON public.account_role USING btree ("profileType", "profileId")
        WHERE "profileId" IS NOT NULL AND "profileType" <> 'user';

      CREATE TABLE public.active_role_session (
        id uuid NOT NULL,
        "userId" integer NOT NULL,
        "accountRoleId" integer NOT NULL,
        "contextVersion" integer NOT NULL,
        "deviceId" character varying,
        "userAgentHash" character varying,
        "ipHash" character varying,
        "expiresAt" timestamp without time zone NOT NULL,
        "revokedAt" timestamp without time zone,
        "revokeReason" character varying,
        "lastSeenAt" timestamp without time zone,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_active_role_session" PRIMARY KEY (id),
        CONSTRAINT "FK_active_role_session_user" FOREIGN KEY ("userId")
          REFERENCES public."user"(id) ON DELETE CASCADE,
        CONSTRAINT "FK_active_role_session_account_role" FOREIGN KEY ("accountRoleId")
          REFERENCES public.account_role(id) ON DELETE CASCADE
      );

      CREATE INDEX "IDX_active_role_session_user_revoked"
        ON public.active_role_session USING btree ("userId", "revokedAt");
      CREATE INDEX "IDX_active_role_session_role_revoked"
        ON public.active_role_session USING btree ("accountRoleId", "revokedAt");
      CREATE INDEX "IDX_active_role_session_expires_at"
        ON public.active_role_session USING btree ("expiresAt");

      CREATE TABLE public.role_migration_audit (
        id bigserial NOT NULL,
        severity character varying NOT NULL,
        code character varying NOT NULL,
        "sourceProfileType" character varying NOT NULL,
        "sourceProfileId" integer,
        "userId" integer,
        "roleType" character varying,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_role_migration_audit" PRIMARY KEY (id)
      );
      CREATE INDEX "IDX_role_migration_audit_code"
        ON public.role_migration_audit USING btree (code);
      CREATE INDEX "IDX_role_migration_audit_user"
        ON public.role_migration_audit USING btree ("userId");
    `);

    // Every account receives the additive buyer membership. The corrected
    // partial unique index deliberately permits multiple user-backed roles.
    await queryRunner.query(`
      INSERT INTO public.account_role
        ("userId", "roleType", status, "profileType", "profileId")
      SELECT u.id, 'buyer', 'active', 'user', u.id
      FROM public."user" u
      ON CONFLICT ("userId", "roleType") DO NOTHING;
    `);

    await this.auditInvalidProfiles(queryRunner, 'seller_profile', 'seller');
    await this.auditInvalidProfiles(queryRunner, 'agent', 'agent');
    await this.auditInvalidProfiles(queryRunner, 'super_agent', 'super_agent');
    await this.auditInvalidProfiles(
      queryRunner,
      'transport_provider',
      'transport_provider',
    );

    await this.backfillProfileRoles(
      queryRunner,
      'seller_profile',
      'seller',
      'seller_profile',
      `CASE p.status::text
        WHEN 'approved' THEN 'active'
        WHEN 'pending' THEN 'pending'
        WHEN 'suspended' THEN 'suspended'
        WHEN 'rejected' THEN 'rejected'
      END`,
      `NULL::text`,
    );
    await this.backfillProfileRoles(
      queryRunner,
      'agent',
      'agent',
      'agent',
      `CASE p.status::text
        WHEN 'approved' THEN 'active'
        WHEN 'pending' THEN 'pending'
        WHEN 'suspended' THEN 'suspended'
        WHEN 'rejected' THEN 'rejected'
      END`,
      `NULL::text`,
    );
    await this.backfillProfileRoles(
      queryRunner,
      'super_agent',
      'super_agent',
      'super_agent',
      `CASE p.status::text
        WHEN 'active' THEN 'active'
        WHEN 'pending' THEN 'pending'
        WHEN 'suspended' THEN 'suspended'
        WHEN 'blocked' THEN 'suspended'
      END`,
      `CASE WHEN p.status::text = 'blocked'
        THEN 'legacy_super_agent_blocked' ELSE NULL END`,
    );
    await this.backfillProfileRoles(
      queryRunner,
      'transport_provider',
      'transport_provider',
      'transport_provider',
      `CASE p.status::text
        WHEN 'verified' THEN 'active'
        WHEN 'active' THEN 'active'
        WHEN 'pending' THEN 'pending'
        WHEN 'testing' THEN 'pending'
        WHEN 'inactive' THEN 'suspended'
        WHEN 'suspended' THEN 'suspended'
        WHEN 'rejected' THEN 'rejected'
      END`,
      `CASE p.status::text
        WHEN 'testing' THEN 'legacy_transport_provider_testing'
        WHEN 'inactive' THEN 'legacy_transport_provider_inactive'
        ELSE NULL END`,
    );

    // Legacy staff roles are account-level memberships and intentionally share
    // profileType/profileId with the buyer role for the same user.
    await queryRunner.query(`
      INSERT INTO public.account_role
        ("userId", "roleType", status, "profileType", "profileId")
      SELECT u.id, u.role::text::public.account_role_type_enum,
             'active', 'user', u.id
      FROM public."user" u
      WHERE u.role::text IN ('customer_care', 'manager', 'admin', 'arbitrator')
      ON CONFLICT ("userId", "roleType") DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO public.role_migration_audit
        (severity, code, "sourceProfileType", "sourceProfileId", "userId", "roleType", details)
      SELECT 'warning', 'legacy_operational_role_without_profile',
             'user', u.id, u.id, u.role::text,
             jsonb_build_object('legacyRole', u.role::text)
      FROM public."user" u
      WHERE u.role::text IN ('seller', 'agent', 'super_agent')
        AND NOT EXISTS (
          SELECT 1 FROM public.account_role ar
          WHERE ar."userId" = u.id
            AND ar."roleType"::text = u.role::text
            AND ar."profileType" <> 'user'
        );
    `);
  }

  private async auditInvalidProfiles(
    queryRunner: QueryRunner,
    tableName: string,
    roleType: string,
  ): Promise<void> {
    await queryRunner.query(`
      INSERT INTO public.role_migration_audit
        (severity, code, "sourceProfileType", "sourceProfileId", "userId", "roleType", details)
      SELECT 'error', 'invalid_profile_user_reference', '${tableName}', p.id,
             p."userId", '${roleType}',
             jsonb_build_object('reason', CASE
               WHEN p."userId" IS NULL THEN 'missing_user_id'
               ELSE 'referenced_user_missing' END)
      FROM public.${tableName} p
      LEFT JOIN public."user" u ON u.id = p."userId"
      WHERE p."userId" IS NULL OR u.id IS NULL;

      INSERT INTO public.role_migration_audit
        (severity, code, "sourceProfileType", "sourceProfileId", "userId", "roleType", details)
      SELECT 'error', 'duplicate_profiles_for_role', '${tableName}', p.id,
             p."userId", '${roleType}',
             jsonb_build_object('profileCount', d.profile_count)
      FROM public.${tableName} p
      JOIN (
        SELECT "userId", count(*) AS profile_count
        FROM public.${tableName}
        WHERE "userId" IS NOT NULL
        GROUP BY "userId"
        HAVING count(*) > 1
      ) d ON d."userId" = p."userId";
    `);
  }

  private async backfillProfileRoles(
    queryRunner: QueryRunner,
    tableName: string,
    roleType: string,
    profileType: string,
    statusExpression: string,
    statusReasonExpression: string,
  ): Promise<void> {
    await queryRunner.query(`
      INSERT INTO public.role_migration_audit
        (severity, code, "sourceProfileType", "sourceProfileId", "userId", "roleType", details)
      SELECT 'error', 'profile_already_owned_by_another_account_role',
             '${tableName}', p.id, p."userId", '${roleType}',
             jsonb_build_object('existingAccountRoleId', ar.id)
      FROM public.${tableName} p
      JOIN public.account_role ar
        ON ar."profileType"::text = '${profileType}' AND ar."profileId" = p.id
      WHERE ar."userId" <> p."userId"
         OR ar."roleType"::text <> '${roleType}';

      INSERT INTO public.role_migration_audit
        (severity, code, "sourceProfileType", "sourceProfileId", "userId", "roleType", details)
      SELECT 'error', 'role_membership_profile_conflict',
             '${tableName}', p.id, p."userId", '${roleType}',
             jsonb_build_object('existingAccountRoleId', ar.id,
               'existingProfileType', ar."profileType"::text,
               'existingProfileId', ar."profileId")
      FROM public.${tableName} p
      JOIN public.account_role ar
        ON ar."userId" = p."userId" AND ar."roleType"::text = '${roleType}'
      WHERE ar."profileType"::text <> '${profileType}' OR ar."profileId" <> p.id;

      INSERT INTO public.account_role
        ("userId", "roleType", status, "profileType", "profileId", "statusReason")
      SELECT p."userId", '${roleType}'::public.account_role_type_enum,
             (${statusExpression})::public.account_role_status_enum,
             '${profileType}'::public.role_profile_type_enum, p.id,
             ${statusReasonExpression}
      FROM public.${tableName} p
      JOIN public."user" u ON u.id = p."userId"
      LEFT JOIN (
        SELECT "userId"
        FROM public.${tableName}
        WHERE "userId" IS NOT NULL
        GROUP BY "userId"
        HAVING count(*) > 1
      ) duplicate_user ON duplicate_user."userId" = p."userId"
      LEFT JOIN public.account_role by_role
        ON by_role."userId" = p."userId"
          AND by_role."roleType"::text = '${roleType}'
      LEFT JOIN public.account_role by_profile
        ON by_profile."profileType"::text = '${profileType}'
          AND by_profile."profileId" = p.id
      WHERE duplicate_user."userId" IS NULL
        AND by_role.id IS NULL
        AND by_profile.id IS NULL
      ON CONFLICT ("userId", "roleType") DO NOTHING;
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Phase A role-context foundation is intentionally non-reversible. ' +
        'Do not delete role history or backfill audit records through rollback.',
    );
  }
}
