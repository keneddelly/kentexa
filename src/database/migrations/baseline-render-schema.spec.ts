import { BaselineRenderProductionSchema1788256800000 } from './1788256800000-BaselineRenderProductionSchema';

describe('Render production schema baseline artifact', () => {
  const sql =
    BaselineRenderProductionSchema1788256800000.readSchemaOnlyDump();

  it('preserves the inspected application schema and vector extension', () => {
    expect(sql).toContain(
      'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;',
    );
    expect(sql).toContain('CREATE TABLE public."user"');
    expect(sql).toContain('CREATE TABLE public.seller_profile');
    expect(sql).toContain('"avatarUrl" character varying');
    expect(sql).toContain('"verificationTier"');
    expect((sql.match(/^CREATE TABLE public\./gm) ?? []).length).toBe(96);
  });

  it('contains no data, ledger operations, function bodies, or destructive schema setup', () => {
    expect(sql).not.toMatch(/^\\/m);
    expect(sql).not.toMatch(/^(?:COPY|INSERT INTO)\b/im);
    expect(sql).not.toMatch(/^CREATE\s+(?:OR REPLACE\s+)?FUNCTION\b/im);
    expect(sql).not.toMatch(/^(?:DROP|CREATE) SCHEMA\s+public\b/im);
    expect(sql).not.toMatch(/^ALTER\s+.+\s+OWNER TO\b/im);
    expect(sql).not.toMatch(/^(?:GRANT|REVOKE)\b/im);
    expect(sql).not.toContain('typeorm_migrations');
    expect(sql).not.toMatch(/set_config\('search_path',\s*''/i);
  });

  it('excludes Phase A role-context objects', () => {
    expect(sql).not.toContain('CREATE TABLE public.account_role');
    expect(sql).not.toContain('CREATE TABLE public.active_role_session');
    expect(sql).not.toContain('CREATE TABLE public.role_migration_audit');
  });
});
