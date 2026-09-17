import dataSource from './data-source';

/**
 * `typeorm-ts-node-commonjs migration:run` is broken on this Node/typeorm
 * version — its CLI entrypoint requires `yargs`, which ships as an ESM-only
 * package, producing ERR_REQUIRE_ESM before any migration logic runs (fails
 * identically locally and on Render, since both pin NODE_VERSION=20.18.0).
 * This script never touches typeorm/cli.js — it calls the same
 * DataSource.runMigrations() the CLI would have called, directly, following
 * the same plain-ts-node pattern already used by adopt-render-baseline.ts
 * and reconcile-role-context-migrations.ts for the same reason.
 */
function assertExplicitConfirmation(): void {
  if (process.env.MIGRATION_RUN_CONFIRM !== 'RUN_REAL_MIGRATIONS') {
    throw new Error(
      'Migration run refused: set MIGRATION_RUN_CONFIRM=RUN_REAL_MIGRATIONS to run against whichever database DB_HOST/DB_NAME currently point at.',
    );
  }
}

async function main(): Promise<void> {
  assertExplicitConfirmation();
  await dataSource.initialize();

  const identity = (await dataSource.query(
    `SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS server_addr`,
  )) as Array<{ database: string; username: string; server_addr: string | null }>;
  console.log(
    `Connected as ${identity[0].username}@${identity[0].database} (server ${identity[0].server_addr}). Running migrations...`,
  );
  const executed = await dataSource.runMigrations();
  if (executed.length === 0) {
    console.log('No pending migrations — already up to date.');
  } else {
    console.log('Executed migrations:', executed.map((m) => m.name).join(', '));
  }
  await dataSource.destroy();
}

main().catch((e) => {
  console.error('Migration run failed:', e);
  process.exit(1);
});
