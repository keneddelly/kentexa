import dataSource from './data-source';

/**
 * One-time, read-only post-flight check for Migration 11
 * (AddServiceBusinessAuthorityFoundation) against the real production
 * database — confirms the ledger, schema, and constraints landed exactly as
 * designed, and that no existing ServiceProvider/ServiceAd row was touched
 * (businessId must be NULL on every pre-existing row; this migration never
 * backfills).
 *
 * UQ_service_provider_business and UQ_service_provider_unbound_user are
 * partial unique INDEXES (CREATE UNIQUE INDEX ... WHERE ...), not table
 * constraints -- Postgres never lists a partial unique index in
 * pg_constraint, only in pg_indexes, so they're checked there.
 */
async function main(): Promise<void> {
  await dataSource.initialize();

  const ledger = await dataSource.query(
    `SELECT name FROM typeorm_migrations WHERE name = 'AddServiceBusinessAuthorityFoundation1788263400000'`,
  );
  console.log('Ledger entry present:', ledger.length === 1);

  const enumValues = await dataSource.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname IN ('business_capability_code_enum', 'role_profile_type_enum')
      AND e.enumlabel IN ('service', 'service_provider')
    ORDER BY t.typname, e.enumlabel
  `);
  console.log('New enum values:', JSON.stringify(enumValues));

  const columns = await dataSource.query(`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'service_provider' AND column_name = 'businessId')
       OR (table_name = 'service_ad' AND column_name = 'businessId')
  `);
  console.log('New columns:', JSON.stringify(columns));

  const fkConstraints = await dataSource.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN ('FK_service_provider_business', 'FK_service_ad_business')
    ORDER BY conname
  `);
  console.log('New FK constraints:', JSON.stringify(fkConstraints.map((c: { conname: string }) => c.conname)));

  const partialUniqueIndexes = await dataSource.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE indexname IN ('UQ_service_provider_business', 'UQ_service_provider_unbound_user')
    ORDER BY indexname
  `);
  console.log('Partial unique indexes:', JSON.stringify(partialUniqueIndexes));

  const plainIndexes = await dataSource.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN ('IDX_service_ad_provider', 'IDX_service_ad_business', 'IDX_service_ad_category', 'IDX_service_ad_status', 'IDX_service_ad_coverage_city')
    ORDER BY indexname
  `);
  console.log('New plain indexes:', JSON.stringify(plainIndexes.map((i: { indexname: string }) => i.indexname)));

  const legacyProviderCheck = await dataSource.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "businessId" IS NOT NULL)::int AS non_null FROM service_provider`,
  );
  console.log('service_provider rows (total / businessId-non-null):', JSON.stringify(legacyProviderCheck[0]));

  const legacyAdCheck = await dataSource.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "businessId" IS NOT NULL)::int AS non_null FROM service_ad`,
  );
  console.log('service_ad rows (total / businessId-non-null):', JSON.stringify(legacyAdCheck[0]));

  await dataSource.destroy();
}

main().catch((e) => {
  console.error('Post-flight verification failed:', e);
  process.exit(1);
});
