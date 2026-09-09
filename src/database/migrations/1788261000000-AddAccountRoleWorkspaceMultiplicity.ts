import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Business Authority Stage 1 -- AccountRole workspace multiplicity +
 * SellerProfile business scoping.
 *
 * ============================================================================
 * PART A -- AccountRole: replace the blanket UQ_account_role_user_role
 * ============================================================================
 * Today one User can hold at most one AccountRole row per roleType, ever --
 * regardless of how many Businesses/WorkspaceAssignments exist. That is
 * correct for platform/account-scoped roles (buyer/admin/manager/
 * customer_care/arbitrator) and, deliberately, for agent (see below), but
 * wrong for the operational roles the Business-First model needs to support
 * per-Business authority for (seller/super_agent/transport_provider/
 * service_provider): the same human must eventually be able to hold e.g. a
 * Seller AccountRole for Business A AND a separate Seller AccountRole for
 * Business B simultaneously, each bound to its own WorkspaceAssignment.
 *
 * Replaces the single blanket constraint with THREE partial unique indexes,
 * split by role scope:
 *
 *  - UQ_account_role_singular: buyer/admin/manager/customer_care/arbitrator/
 *    agent stay unique per (userId, roleType), unconditionally -- byte-for-
 *    byte the same behavior as today for these six role types.
 *
 *    Agent is deliberately included here, not in the operational split
 *    below, even though its profile entity has no schema-level blocker to
 *    becoming workspace-scoped later. Nothing in the current product design
 *    ever sets workspaceAssignmentId for an Agent role (no AGENT
 *    BusinessCapabilityCode exists), so Agent is, in effect, ACCOUNT_SCOPE
 *    today. This migration preserves that exactly rather than silently
 *    manufacturing workspace-scoping the product has never asked for.
 *
 *  - UQ_account_role_workspace_bound: seller/super_agent/transport_provider/
 *    service_provider MAY repeat for the same user, but only when each row
 *    is bound to a DIFFERENT workspaceAssignmentId. Two rows of the same
 *    roleType for the same user pointed at the SAME WorkspaceAssignment are
 *    still rejected.
 *
 *  - UQ_account_role_unbound: the same four operational role types, but for
 *    the NULL-workspaceAssignmentId case. Postgres never treats two NULLs as
 *    equal in a unique index, so without this second partial index the
 *    workspace-bound one alone would let an unlimited number of un-bound
 *    placeholder rows accumulate. At most one un-bound row per (userId,
 *    roleType) is allowed -- exactly today's effective behavior for every
 *    seller/agent/etc. approved before any Business/WorkspaceAssignment
 *    exists for them.
 *
 * UQ_account_role_operational_profile (unique on (profileType, profileId)
 * where non-null/non-user) is untouched -- it remains correct and necessary
 * under this change: one concrete profile row, one AccountRole, regardless
 * of how many sibling rows of the same roleType the user now has.
 *
 * ============================================================================
 * PART B -- SellerProfile: OneToOne(User) -> ManyToOne(User)
 * ============================================================================
 * SellerProfile.user was declared @OneToOne + @JoinColumn(), which makes
 * TypeORM generate an IMPLICIT unique constraint on the join column. This is
 * an independent, second blocker to Seller multiplicity beyond AccountRole's
 * own constraint -- confirmed against production (see report) as constraint
 * "REL_c2b29aefac4072d2503cab6c0c", UNIQUE ("userId").
 *
 * Drops that constraint, replaces it with a plain (non-unique) index on
 * userId (still needed for lookup performance -- every "find my seller
 * profile" query keys on it), and adds a plain index on the already-existing
 * (but until now unused) businessId column, which becomes the real
 * Business-scoping dimension: SellerProfile A -> Business A, SellerProfile
 * B -> Business B, for the same human.
 *
 * businessId is backfilled ONLY where deterministically resolvable through
 * the existing organizational chain (AccountRole.workspaceAssignmentId ->
 * WorkspaceAssignment -> BusinessMembership -> OperationalWorkspace ->
 * Business), mirroring RoleContextService.resolveOrganizationalContext()'s
 * own join exactly. AccountRole's own UQ_account_role_operational_profile
 * guarantees at most one AccountRole row can point at a given SellerProfile,
 * so this backfill can never be ambiguous -- it either resolves exactly one
 * Business or resolves none (left NULL, reported, never guessed).
 *
 * Existence-aware, following AddConversationOperationalOwnerUniqueness's own
 * precedent: OBJECT ABSENT -> create; OBJECT PRESENT -> skip.
 *
 * down() reverses PART A/B's constraint shape. It intentionally does NOT
 * null out the businessId backfill on the way down (accurate historical
 * data, not something any constraint here depends on). Re-adding the
 * original singular constraints will fail -- correctly -- if any real
 * multiplicity row was created while this migration was applied; that is
 * the expected, safe behavior the mission asked for ("reverses cleanly when
 * no multiplicity rows have been created").
 */
export class AddAccountRoleWorkspaceMultiplicity1788261000000
  implements MigrationInterface
{
  name = 'AddAccountRoleWorkspaceMultiplicity1788261000000';

  private readonly OLD_ACCOUNT_ROLE_UNIQUE = 'UQ_account_role_user_role';
  private readonly NEW_SINGULAR = 'UQ_account_role_singular';
  private readonly NEW_WORKSPACE_BOUND = 'UQ_account_role_workspace_bound';
  private readonly NEW_UNBOUND = 'UQ_account_role_unbound';

  private readonly SINGULAR_ROLE_TYPES = `('buyer','admin','manager','customer_care','arbitrator','agent')`;
  private readonly OPERATIONAL_ROLE_TYPES = `('seller','super_agent','transport_provider','service_provider')`;

  private readonly OLD_SELLER_PROFILE_UNIQUE = 'REL_c2b29aefac4072d2503cab6c0c';
  private readonly NEW_SELLER_PROFILE_USER_IDX = 'IDX_seller_profile_user';
  private readonly NEW_SELLER_PROFILE_BUSINESS_IDX = 'IDX_seller_profile_business';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── PART A: AccountRole ────────────────────────────────────────────────
    await this.dropConstraintIfPresent(queryRunner, 'account_role', this.OLD_ACCOUNT_ROLE_UNIQUE);

    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_SINGULAR,
      `CREATE UNIQUE INDEX "${this.NEW_SINGULAR}" ON public.account_role
         USING btree ("userId", "roleType")
         WHERE "roleType" IN ${this.SINGULAR_ROLE_TYPES}`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_WORKSPACE_BOUND,
      `CREATE UNIQUE INDEX "${this.NEW_WORKSPACE_BOUND}" ON public.account_role
         USING btree ("userId", "roleType", "workspaceAssignmentId")
         WHERE "roleType" IN ${this.OPERATIONAL_ROLE_TYPES} AND "workspaceAssignmentId" IS NOT NULL`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_UNBOUND,
      `CREATE UNIQUE INDEX "${this.NEW_UNBOUND}" ON public.account_role
         USING btree ("userId", "roleType")
         WHERE "roleType" IN ${this.OPERATIONAL_ROLE_TYPES} AND "workspaceAssignmentId" IS NULL`,
    );

    // ── PART B: SellerProfile ───────────────────────────────────────────────
    await this.dropConstraintIfPresent(queryRunner, 'seller_profile', this.OLD_SELLER_PROFILE_UNIQUE);

    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_SELLER_PROFILE_USER_IDX,
      `CREATE INDEX "${this.NEW_SELLER_PROFILE_USER_IDX}" ON public.seller_profile USING btree ("userId")`,
    );
    await this.createIndexIfAbsent(
      queryRunner,
      this.NEW_SELLER_PROFILE_BUSINESS_IDX,
      `CREATE INDEX "${this.NEW_SELLER_PROFILE_BUSINESS_IDX}" ON public.seller_profile USING btree ("businessId")`,
    );

    await queryRunner.query(`
      UPDATE seller_profile sp
      SET "businessId" = chain."businessId"
      FROM (
        SELECT sp2.id AS seller_profile_id, b.id AS "businessId"
        FROM seller_profile sp2
        JOIN account_role ar
          ON ar."profileType" = 'seller_profile'
         AND ar."profileId" = sp2.id
         AND ar."roleType" = 'seller'
         AND ar."workspaceAssignmentId" IS NOT NULL
        JOIN workspace_assignment wa
          ON wa.id = ar."workspaceAssignmentId" AND wa.status = 'active'
        JOIN business_membership bm
          ON bm.id = wa."businessMembershipId" AND bm.status = 'active'
        JOIN operational_workspace ow
          ON ow.id = wa."workspaceId" AND ow.status = 'active' AND ow."businessId" = bm."businessId"
        JOIN business b
          ON b.id = ow."businessId" AND b.status = 'active'
      ) chain
      WHERE sp.id = chain.seller_profile_id AND sp."businessId" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // ── PART B reversal ──────────────────────────────────────────────────────
    await this.dropIndexIfPresent(queryRunner, this.NEW_SELLER_PROFILE_BUSINESS_IDX);
    await this.dropIndexIfPresent(queryRunner, this.NEW_SELLER_PROFILE_USER_IDX);
    await queryRunner.query(
      `ALTER TABLE public.seller_profile ADD CONSTRAINT "${this.OLD_SELLER_PROFILE_UNIQUE}" UNIQUE ("userId")`,
    );

    // ── PART A reversal ──────────────────────────────────────────────────────
    await this.dropIndexIfPresent(queryRunner, this.NEW_UNBOUND);
    await this.dropIndexIfPresent(queryRunner, this.NEW_WORKSPACE_BOUND);
    await this.dropIndexIfPresent(queryRunner, this.NEW_SINGULAR);
    await queryRunner.query(
      `ALTER TABLE public.account_role ADD CONSTRAINT "${this.OLD_ACCOUNT_ROLE_UNIQUE}" UNIQUE ("userId", "roleType")`,
    );
  }

  private async dropIndexIfPresent(queryRunner: QueryRunner, indexName: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length === 0) return;
    await queryRunner.query(`DROP INDEX public."${indexName}"`);
  }

  private async createIndexIfAbsent(queryRunner: QueryRunner, indexName: string, createSql: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length > 0) return;
    await queryRunner.query(createSql);
  }

  private async dropConstraintIfPresent(queryRunner: QueryRunner, table: string, constraintName: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
      [constraintName, `public.${table}`],
    )) as unknown[];
    if (rows.length === 0) return;
    await queryRunner.query(`ALTER TABLE public.${table} DROP CONSTRAINT "${constraintName}"`);
  }
}
