import 'reflect-metadata';
import { readdirSync } from 'fs';
import { getMetadataArgsStorage } from 'typeorm';
import { ServiceProvider } from '../../service-providers/entities/service-provider.entity';
import { ServiceAd } from '../../services/entities/service-ad.entity';
import { Business } from '../../business/entities/business.entity';
import { AddServiceBusinessAuthorityFoundation1788263400000 } from './1788263400000-AddServiceBusinessAuthorityFoundation';

describe('AddServiceBusinessAuthorityFoundation1788263400000', () => {
  const run = async (direction: 'up' | 'down') => {
    const sql: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        sql.push(statement.replace(/\s+/g, ' ').trim());
      }),
    } as any;
    const migration = new AddServiceBusinessAuthorityFoundation1788263400000();
    await migration[direction](queryRunner);
    return sql;
  };

  it('UP adds the two enum values, nullable businessId columns, SET NULL FKs, the two ServiceProvider partial unique indexes, and the five ServiceAd indexes -- no data mutation', async () => {
    const sql = await run('up');
    const joined = sql.join(' ');

    expect(joined).toContain(`ALTER TYPE business_capability_code_enum ADD VALUE IF NOT EXISTS 'service'`);
    expect(joined).toContain(`ALTER TYPE role_profile_type_enum ADD VALUE IF NOT EXISTS 'service_provider'`);

    expect(joined).toContain('ALTER TABLE public.service_provider ADD COLUMN "businessId" integer');
    expect(joined).toContain(
      'FOREIGN KEY ("businessId") REFERENCES public.business(id) ON DELETE SET NULL',
    );
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_service_provider_business" ON public.service_provider ("businessId") WHERE "businessId" IS NOT NULL',
    );
    expect(joined).toContain(
      'CREATE UNIQUE INDEX "UQ_service_provider_unbound_user" ON public.service_provider ("userId") WHERE "businessId" IS NULL',
    );

    expect(joined).toContain('ALTER TABLE public.service_ad ADD COLUMN "businessId" integer');
    expect(joined).toContain('CREATE INDEX "IDX_service_ad_provider" ON public.service_ad ("providerId")');
    expect(joined).toContain('CREATE INDEX "IDX_service_ad_business" ON public.service_ad ("businessId")');
    expect(joined).toContain('CREATE INDEX "IDX_service_ad_category" ON public.service_ad ("category")');
    expect(joined).toContain('CREATE INDEX "IDX_service_ad_status" ON public.service_ad ("status")');
    expect(joined).toContain('CREATE INDEX "IDX_service_ad_coverage_city" ON public.service_ad ("coverageCity")');

    // No uniqueness on ServiceAd.businessId -- one Business legitimately
    // owns many ServiceAd rows (B6A section 7/21). Checked per-statement
    // (not a substring/regex over the whole joined SQL, which spans
    // multiple unrelated statements with no delimiter between them).
    const serviceAdBusinessIndexStatements = sql.filter(
      (s) => s.includes('ON public.service_ad ("businessId")'),
    );
    expect(serviceAdBusinessIndexStatements).toHaveLength(1);
    expect(serviceAdBusinessIndexStatements[0]).not.toMatch(/CREATE UNIQUE INDEX/);

    // The two new columns must be nullable (no column-level NOT NULL) --
    // "IS NOT NULL" legitimately appears in the partial-index WHERE clauses
    // above, which is a different thing entirely.
    expect(joined).not.toMatch(/"businessId" integer NOT NULL/i);
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bDROP\s+TABLE/i);
  });

  it('DOWN removes only the B6B indexes, FKs, and columns (enum values intentionally left in place -- Postgres has no DROP VALUE) -- no data mutation', async () => {
    const sql = await run('down');
    const joined = sql.join(' ');

    expect(joined).toContain('DROP INDEX IF EXISTS "IDX_service_ad_coverage_city"');
    expect(joined).toContain('DROP INDEX IF EXISTS "IDX_service_ad_status"');
    expect(joined).toContain('DROP INDEX IF EXISTS "IDX_service_ad_category"');
    expect(joined).toContain('DROP INDEX IF EXISTS "IDX_service_ad_business"');
    expect(joined).toContain('DROP INDEX IF EXISTS "IDX_service_ad_provider"');
    expect(joined).toContain('DROP CONSTRAINT IF EXISTS "FK_service_ad_business"');
    expect(joined).toContain('ALTER TABLE public.service_ad DROP COLUMN IF EXISTS "businessId"');

    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_service_provider_unbound_user"');
    expect(joined).toContain('DROP INDEX IF EXISTS "UQ_service_provider_business"');
    expect(joined).toContain('DROP CONSTRAINT IF EXISTS "FK_service_provider_business"');
    expect(joined).toContain('ALTER TABLE public.service_provider DROP COLUMN IF EXISTS "businessId"');

    // down() never attempts to remove the two enum values -- Postgres has
    // no DROP VALUE; see the migration's own doc comment.
    expect(joined).not.toMatch(/ALTER TYPE.*DROP VALUE/i);
    expect(joined).not.toMatch(/\bUPDATE\s|\bINSERT\s+INTO|\bDELETE\s+FROM|\bDROP\s+TABLE/i);
  });

  it('ServiceProvider exposes a nullable businessId scalar, an explicit non-nullable userId, and a SET NULL Business relation', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(({ target }) => target === ServiceProvider);
    const column = (name: string) => columns.find(({ propertyName }) => propertyName === name);

    expect(column('businessId')?.options.nullable).toBe(true);
    // Deliberately NOT nullable -- unlike TransportProvider, ServiceProvider's
    // `user` relation was always required; only businessId is new/optional.
    expect(column('userId')?.options.nullable).toBeFalsy();
    expect(column('businessName')).toBeDefined();

    const relations = storage.relations.filter(({ target }) => target === ServiceProvider);
    const businessRelation = relations.find(({ propertyName }) => propertyName === 'business');
    expect(businessRelation?.options).toMatchObject({ nullable: true, onDelete: 'SET NULL' });
    expect(businessRelation?.type()).toBe(Business);
    const userRelation = relations.find(({ propertyName }) => propertyName === 'user');
    expect(userRelation?.options).toMatchObject({ onDelete: 'CASCADE' });
    expect(userRelation?.options?.nullable).not.toBe(true);
  });

  it('ServiceAd exposes a nullable, non-unique businessId scalar -- one Business may own many ServiceAd rows', () => {
    const storage = getMetadataArgsStorage();
    const columns = storage.columns.filter(({ target }) => target === ServiceAd);
    const column = (name: string) => columns.find(({ propertyName }) => propertyName === name);

    expect(column('businessId')?.options.nullable).toBe(true);
    expect(column('providerId')).toBeDefined();
    expect(column('commerceProfileId')).toBeDefined();

    const indices = storage.indices.filter(({ target }) => target === ServiceAd);
    const businessIndex = indices.find((i) => i.name === 'IDX_service_ad_business');
    expect(businessIndex?.columns).toEqual(['businessId']);
    expect(businessIndex?.options?.unique).not.toBe(true);
  });

  it('tracks the repository migration implementation count (12 pre-I2G + 6 I2G + 1 Stage-1 shipment-integrity migration + 1 Stage-2B shipment-location-snapshot migration = 20)', () => {
    const migrations = readdirSync(__dirname).filter((name) =>
      /^\d{13}-.+\.ts$/.test(name),
    );
    expect(migrations).toHaveLength(20);
  });
});
