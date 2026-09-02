import { readFileSync } from 'fs';
import { join } from 'path';
import dataSource from './data-source';

const BASELINE_NAME = 'BaselineRenderProductionSchema1788256800000';
const BASELINE_TIMESTAMP = Number(BASELINE_NAME.slice(-13));
const EXPECTED_TABLE_COUNT = 96;

const REQUIRED_TABLES = [
  'user',
  'seller_profile',
  'super_agent',
  'transport_provider',
  'order',
  'payment',
  'conversation',
] as const;

const REQUIRED_COLUMNS = [
  ['user', 'avatarUrl'],
  ['seller_profile', 'verificationTier'],
  ['super_agent', 'referralCode'],
  ['transport_provider', 'totalRatings'],
] as const;

const PHASE_A_TABLES = [
  'account_role',
  'active_role_session',
  'role_migration_audit',
] as const;

function expectedBaselineTables(): string[] {
  const dump = readFileSync(
    join(process.cwd(), 'database', 'kentexa-render-live-schema.sql'),
    'utf8',
  );

  return [...dump.matchAll(/^CREATE TABLE public\."?([A-Za-z0-9_]+)"? \(/gm)]
    .map((match) => match[1])
    .sort();
}

function assertConfiguredTarget(): void {
  const expectedDatabase = process.env.BASELINE_ADOPTION_EXPECTED_DATABASE;
  const expectedHost = process.env.BASELINE_ADOPTION_EXPECTED_HOST;

  if (!expectedDatabase || !expectedHost) {
    throw new Error(
      'Baseline adoption refused: BASELINE_ADOPTION_EXPECTED_DATABASE and ' +
        'BASELINE_ADOPTION_EXPECTED_HOST must both be explicit.',
    );
  }
  if (process.env.DB_NAME !== expectedDatabase || process.env.DB_HOST !== expectedHost) {
    throw new Error(
      'Baseline adoption refused: configured DB_NAME/DB_HOST do not match the explicit adoption target.',
    );
  }
}

async function adoptRenderBaseline(): Promise<void> {
  assertConfiguredTarget();
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();

  try {
    await runner.startTransaction();
    await runner.query(`SELECT pg_advisory_xact_lock(1788256800000)`);

    const identity = (await runner.query(
      `SELECT current_database() AS database, current_user AS username`,
    )) as Array<{ database: string; username: string }>;
    if (identity[0]?.database !== process.env.BASELINE_ADOPTION_EXPECTED_DATABASE) {
      throw new Error('Baseline adoption refused: connected database identity mismatch.');
    }

    const expected = expectedBaselineTables();
    if (expected.length !== EXPECTED_TABLE_COUNT) {
      throw new Error(
        `Baseline adoption refused: dump contains ${expected.length} tables, expected ${EXPECTED_TABLE_COUNT}.`,
      );
    }

    const tables = (await runner.query(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename <> 'typeorm_migrations'
      ORDER BY tablename
    `)) as Array<{ tablename: string }>;
    const actual = tables.map((table) => table.tablename);
    if (actual.length !== expected.length || actual.some((name, i) => name !== expected[i])) {
      throw new Error(
        'Baseline adoption refused: public application table set does not exactly match the reviewed Render dump.',
      );
    }

    for (const table of REQUIRED_TABLES) {
      if (!actual.includes(table)) {
        throw new Error(`Baseline adoption refused: representative table ${table} is missing.`);
      }
    }

    const columns = (await runner.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    )) as Array<{ table_name: string; column_name: string }>;
    const columnSet = new Set(
      columns.map((column) => `${column.table_name}.${column.column_name}`),
    );
    for (const [table, column] of REQUIRED_COLUMNS) {
      if (!columnSet.has(`${table}.${column}`)) {
        throw new Error(
          `Baseline adoption refused: required fingerprint column ${table}.${column} is missing.`,
        );
      }
    }

    const extensions = (await runner.query(
      `SELECT extname FROM pg_catalog.pg_extension WHERE extname = 'vector'`,
    )) as unknown[];
    if (extensions.length !== 1) {
      throw new Error('Baseline adoption refused: vector extension is missing.');
    }

    for (const table of PHASE_A_TABLES) {
      if (await runner.hasTable(table)) {
        throw new Error(
          `Baseline adoption refused: Phase A table ${table} already exists.`,
        );
      }
    }

    await runner.query(`
      CREATE TABLE IF NOT EXISTS public.typeorm_migrations (
        id SERIAL NOT NULL,
        timestamp bigint NOT NULL,
        name character varying NOT NULL,
        CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY (id)
      )
    `);

    const ledger = (await runner.query(
      `SELECT timestamp, name FROM public.typeorm_migrations ORDER BY id`,
    )) as Array<{ timestamp: string; name: string }>;
    if (ledger.length !== 0) {
      throw new Error(
        'Baseline adoption refused: migration ledger is not empty; no record was added.',
      );
    }

    await runner.query(
      `INSERT INTO public.typeorm_migrations(timestamp, name) VALUES ($1, $2)`,
      [BASELINE_TIMESTAMP, BASELINE_NAME],
    );
    await runner.commitTransaction();
    console.log(
      `Adopted ${BASELINE_NAME} on ${identity[0].database}; baseline DDL executed: 0.`,
    );
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

adoptRenderBaseline().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
