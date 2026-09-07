import { AddBusinessFirstFoundationSchema1788259200000 } from './1788259200000-AddBusinessFirstFoundationSchema';

/**
 * Migration readiness hardening, matching the pattern already established
 * for AddCommunicationParticipantAudience: OBJECT ABSENT (create), OBJECT
 * PRESENT AND CORRECT (skip), and OBJECT PRESENT BUT WRONG (stop with a
 * diagnostic) for every table/column this migration touches.
 */
describe('AddBusinessFirstFoundationSchema1788259200000 — existence-aware up()', () => {
  const buildQueryRunner = (opts: {
    existingTypes?: Set<string>;
    existingTables?: Set<string>;
    existingColumns?: Set<string>; // "table.column"
    existingIndexes?: Set<string>;
    existingConstraints?: Set<string>;
  }) => {
    const existingTypes = opts.existingTypes ?? new Set<string>();
    const existingTables = opts.existingTables ?? new Set<string>();
    const existingColumns = opts.existingColumns ?? new Set<string>();
    const existingIndexes = opts.existingIndexes ?? new Set<string>();
    const existingConstraints = opts.existingConstraints ?? new Set<string>();
    const executed: string[] = [];

    const queryRunner: any = {
      hasTable: jest.fn((table: string) => Promise.resolve(existingTables.has(table))),
      hasColumn: jest.fn((table: string, column: string) =>
        Promise.resolve(existingColumns.has(`${table}.${column}`)),
      ),
      query: jest.fn((sql: string, params?: any[]) => {
        executed.push(sql);
        if (sql.includes('FROM pg_type')) {
          const name = params?.[0];
          return Promise.resolve(existingTypes.has(name) ? [{ x: 1 }] : []);
        }
        if (sql.includes('FROM pg_catalog.pg_indexes')) {
          const name = params?.[0];
          return Promise.resolve(existingIndexes.has(name) ? [{ x: 1 }] : []);
        }
        if (sql.includes('FROM pg_constraint')) {
          return Promise.resolve(existingConstraints.has('FK_account_role_workspace_assignment') ? [{ x: 1 }] : []);
        }
        return Promise.resolve([]);
      }),
    };
    return { queryRunner, executed };
  };

  it('scenario A — empty schema: creates every enum, table, column, index, and FK', async () => {
    const { queryRunner, executed } = buildQueryRunner({});
    const migration = new AddBusinessFirstFoundationSchema1788259200000();
    await migration.up(queryRunner);

    expect(executed.some((sql) => sql.includes('CREATE TYPE public.operational_workspace_status_enum'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.operational_workspace'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.business_membership'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.workspace_assignment'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.business_capability'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.business_first_migration_audit'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.account_role ADD COLUMN "workspaceAssignmentId"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_account_role_workspace_assignment"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE UNIQUE INDEX "UQ_operational_workspace_default_per_business"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE UNIQUE INDEX "UQ_business_membership_one_owner"'))).toBe(true);
  });

  it('scenario E — equivalent schema already present (e.g. via synchronize): creates nothing, throws nothing', async () => {
    const existingTypes = new Set([
      'operational_workspace_status_enum', 'business_membership_role_template_enum',
      'business_membership_status_enum', 'workspace_assignment_status_enum',
      'business_capability_code_enum', 'business_capability_status_enum',
    ]);
    const existingTables = new Set([
      'operational_workspace', 'business_membership', 'workspace_assignment',
      'business_capability', 'business_first_migration_audit',
    ]);
    const existingColumns = new Set([
      ...['id', 'businessId', 'name', 'isDefault', 'status', 'createdAt', 'updatedAt'].map((c) => `operational_workspace.${c}`),
      ...['id', 'businessId', 'userId', 'roleTemplate', 'status', 'joinedAt', 'revokedAt', 'revokedByUserId', 'statusReason', 'createdAt', 'updatedAt'].map((c) => `business_membership.${c}`),
      ...['id', 'businessMembershipId', 'workspaceId', 'status', 'permissions', 'assignedAt', 'revokedAt', 'createdAt', 'updatedAt'].map((c) => `workspace_assignment.${c}`),
      ...['id', 'workspaceId', 'capabilityCode', 'status', 'approvedAt', 'approvedByUserId', 'suspendedAt', 'statusReason', 'createdAt', 'updatedAt'].map((c) => `business_capability.${c}`),
      ...['id', 'severity', 'code', 'sourceType', 'sourceId', 'userId', 'details', 'createdAt'].map((c) => `business_first_migration_audit.${c}`),
      'account_role.workspaceAssignmentId',
    ]);
    const existingConstraints = new Set(['FK_account_role_workspace_assignment']);
    const existingIndexes = new Set([
      'IDX_operational_workspace_business', 'UQ_operational_workspace_default_per_business',
      'IDX_business_membership_user_status', 'IDX_business_membership_business_status', 'UQ_business_membership_one_owner',
      'IDX_workspace_assignment_membership_status', 'IDX_workspace_assignment_workspace_status',
      'IDX_business_capability_workspace_status',
      'IDX_business_first_migration_audit_code', 'IDX_business_first_migration_audit_user',
      'IDX_account_role_workspace_assignment',
    ]);

    const { queryRunner, executed } = buildQueryRunner({
      existingTypes, existingTables, existingColumns, existingConstraints, existingIndexes,
    });
    const migration = new AddBusinessFirstFoundationSchema1788259200000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(executed.some((sql) => sql.includes('CREATE TYPE'))).toBe(false);
    expect(executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT'))).toBe(false);
    expect(executed.some((sql) => sql.startsWith('CREATE'))).toBe(false);
  });

  it('scenario F — table present but missing an expected column: throws a specific diagnostic', async () => {
    const existingTypes = new Set([
      'operational_workspace_status_enum', 'business_membership_role_template_enum',
      'business_membership_status_enum', 'workspace_assignment_status_enum',
      'business_capability_code_enum', 'business_capability_status_enum',
    ]);
    const existingTables = new Set(['operational_workspace']);
    // Missing "isDefault" -- an incompatible/partial shape.
    const existingColumns = new Set(['operational_workspace.id', 'operational_workspace.businessId', 'operational_workspace.name']);

    const { queryRunner } = buildQueryRunner({ existingTypes, existingTables, existingColumns });
    const migration = new AddBusinessFirstFoundationSchema1788259200000();

    await expect(migration.up(queryRunner)).rejects.toThrow(/missing expected column\(s\).*isDefault/s);
  });

  it('scenario D — some tables present but the account_role column-add is still pending: creates only what is missing', async () => {
    const existingTypes = new Set([
      'operational_workspace_status_enum', 'business_membership_role_template_enum',
      'business_membership_status_enum', 'workspace_assignment_status_enum',
      'business_capability_code_enum', 'business_capability_status_enum',
    ]);
    const existingTables = new Set(['operational_workspace', 'business_membership', 'workspace_assignment', 'business_capability', 'business_first_migration_audit']);
    const existingColumns = new Set([
      ...['id', 'businessId', 'name', 'isDefault', 'status', 'createdAt', 'updatedAt'].map((c) => `operational_workspace.${c}`),
      ...['id', 'businessId', 'userId', 'roleTemplate', 'status', 'joinedAt', 'revokedAt', 'revokedByUserId', 'statusReason', 'createdAt', 'updatedAt'].map((c) => `business_membership.${c}`),
      ...['id', 'businessMembershipId', 'workspaceId', 'status', 'permissions', 'assignedAt', 'revokedAt', 'createdAt', 'updatedAt'].map((c) => `workspace_assignment.${c}`),
      ...['id', 'workspaceId', 'capabilityCode', 'status', 'approvedAt', 'approvedByUserId', 'suspendedAt', 'statusReason', 'createdAt', 'updatedAt'].map((c) => `business_capability.${c}`),
      ...['id', 'severity', 'code', 'sourceType', 'sourceId', 'userId', 'details', 'createdAt'].map((c) => `business_first_migration_audit.${c}`),
      // account_role.workspaceAssignmentId deliberately NOT included.
    ]);
    const existingIndexes = new Set([
      'IDX_operational_workspace_business', 'UQ_operational_workspace_default_per_business',
      'IDX_business_membership_user_status', 'IDX_business_membership_business_status', 'UQ_business_membership_one_owner',
      'IDX_workspace_assignment_membership_status', 'IDX_workspace_assignment_workspace_status',
      'IDX_business_capability_workspace_status',
      'IDX_business_first_migration_audit_code', 'IDX_business_first_migration_audit_user',
    ]);

    const { queryRunner, executed } = buildQueryRunner({ existingTypes, existingTables, existingColumns, existingIndexes });
    const migration = new AddBusinessFirstFoundationSchema1788259200000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.account_role ADD COLUMN "workspaceAssignmentId"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_account_role_workspace_assignment"'))).toBe(true);
  });

  it('down() remains a real, unconditional rollback refusal', async () => {
    const migration = new AddBusinessFirstFoundationSchema1788259200000();
    await expect(migration.down()).rejects.toThrow(/intentionally non-reversible/);
  });
});
