import { AddProductClassifiedWorkspaceOwnership1788259800000 } from './1788259800000-AddProductClassifiedWorkspaceOwnership';

describe('AddProductClassifiedWorkspaceOwnership1788259800000 — existence-aware up()', () => {
  const buildQueryRunner = (opts: {
    existingColumns?: Set<string>; // "table.column"
    existingIndexes?: Set<string>;
    existingConstraints?: Set<string>;
  }) => {
    const existingColumns = opts.existingColumns ?? new Set<string>();
    const existingIndexes = opts.existingIndexes ?? new Set<string>();
    const existingConstraints = opts.existingConstraints ?? new Set<string>();
    const executed: string[] = [];

    const queryRunner: any = {
      hasColumn: jest.fn((table: string, column: string) =>
        Promise.resolve(existingColumns.has(`${table}.${column}`)),
      ),
      query: jest.fn((sql: string, params?: any[]) => {
        executed.push(sql);
        if (sql.includes('FROM pg_constraint')) {
          const name = params?.[0];
          return Promise.resolve(existingConstraints.has(name) ? [{ x: 1 }] : []);
        }
        if (sql.includes('FROM pg_catalog.pg_indexes')) {
          const name = params?.[0];
          return Promise.resolve(existingIndexes.has(name) ? [{ x: 1 }] : []);
        }
        return Promise.resolve([]);
      }),
    };
    return { queryRunner, executed };
  };

  it('scenario A — empty schema: adds both columns, both FKs, both indexes', async () => {
    const { queryRunner, executed } = buildQueryRunner({});
    const migration = new AddProductClassifiedWorkspaceOwnership1788259800000();
    await migration.up(queryRunner);

    expect(executed.some((sql) => sql.includes('ALTER TABLE public.product ADD COLUMN "workspaceId"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.classified ADD COLUMN "workspaceId"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_product_workspace"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_classified_workspace"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE INDEX "IDX_product_workspace"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE INDEX "IDX_classified_workspace"'))).toBe(true);
  });

  it('scenario E — equivalent schema already present: creates nothing', async () => {
    const existingColumns = new Set(['product.workspaceId', 'classified.workspaceId']);
    const existingConstraints = new Set(['FK_product_workspace', 'FK_classified_workspace']);
    const existingIndexes = new Set(['IDX_product_workspace', 'IDX_classified_workspace']);

    const { queryRunner, executed } = buildQueryRunner({ existingColumns, existingConstraints, existingIndexes });
    const migration = new AddProductClassifiedWorkspaceOwnership1788259800000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(executed.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT'))).toBe(false);
    expect(executed.some((sql) => sql.startsWith('CREATE'))).toBe(false);
  });

  it('scenario D — column present but FK/index still pending: creates only what is missing', async () => {
    const existingColumns = new Set(['product.workspaceId', 'classified.workspaceId']);
    const { queryRunner, executed } = buildQueryRunner({ existingColumns });
    const migration = new AddProductClassifiedWorkspaceOwnership1788259800000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(executed.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_product_workspace"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ADD CONSTRAINT "FK_classified_workspace"'))).toBe(true);
  });

  it('down() remains a real, unconditional rollback refusal', async () => {
    const migration = new AddProductClassifiedWorkspaceOwnership1788259800000();
    await expect(migration.down()).rejects.toThrow(/intentionally non-reversible/);
  });
});
