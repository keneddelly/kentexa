import { readFileSync } from 'fs';
import { join } from 'path';
import dataSource from './data-source';

const BASELINE_NAME = 'BaselineLiveKentexaSchema20260901100000';
// TypeORM derives a migration timestamp from the final 13 digits of its class
// name, not the 14-digit UTC-style filename prefix.
const BASELINE_TIMESTAMP = Number(BASELINE_NAME.slice(-13));

function expectedBaselineTables(): string[] {
  const dump = readFileSync(
    join(process.cwd(), 'database', 'kentexa-live-schema.sql'),
    'utf8',
  );

  return [...dump.matchAll(/^CREATE TABLE public\."?([A-Za-z0-9_]+)"? \(/gm)]
    .map((match) => match[1])
    .sort();
}

/**
 * Explicitly records the inspected live schema as having received the baseline.
 * This is only for an existing Kentexa database. It never executes the baseline
 * DDL and refuses a schema which differs in its public table set.
 */
async function adoptLiveBaseline(): Promise<void> {
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();

  try {
    const expected = expectedBaselineTables();
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
        'Baseline adoption refused: the live public table set does not exactly match database/kentexa-live-schema.sql.',
      );
    }

    if (await runner.hasTable('account_role')) {
      throw new Error(
        'Baseline adoption refused: account_role already exists; inspect the database before continuing.',
      );
    }

    await runner.query(`
      CREATE TABLE IF NOT EXISTS public.typeorm_migrations (
        id SERIAL NOT NULL,
        timestamp bigint NOT NULL,
        name character varying NOT NULL,
        CONSTRAINT "PK_typeorm_migrations" PRIMARY KEY (id)
      )
    `);

    const existing = (await runner.query(
      `SELECT 1 FROM public.typeorm_migrations WHERE timestamp = $1 AND name = $2`,
      [BASELINE_TIMESTAMP, BASELINE_NAME],
    )) as unknown[];

    if (existing.length === 0) {
      await runner.query(
        `INSERT INTO public.typeorm_migrations(timestamp, name) VALUES ($1, $2)`,
        [BASELINE_TIMESTAMP, BASELINE_NAME],
      );
    }
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

adoptLiveBaseline().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
