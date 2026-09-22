import { DataSource, MigrationInterface } from 'typeorm';
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
 *
 * Gate H bounded execution (MIGRATION_RUN_UPTO): DataSource.runMigrations()
 * has no built-in "stop at migration X" option, and its default transaction
 * mode bundles every pending migration into ONE transaction — see
 * selectMigrations()'s own comment for why a bound must therefore change
 * which migration CLASSES are considered, not just when runMigrations() is
 * called. dataSource.migrations is a readonly field on the shared exported
 * instance (mutating it in place would need an `as any` cast and could be
 * confused with the app's other uses of the same singleton), so a bounded
 * run instead builds a SEPARATE, throwaway DataSource — identical
 * connection options, identical migrationsTableName ('typeorm_migrations',
 * so it reads/writes the exact same ledger table) — whose migrations array
 * contains only the selected classes. Nothing is ever passed `fake: true`;
 * a migration excluded by the bound is simply never given to any
 * DataSource in this run, so it cannot be inserted into typeorm_migrations
 * and remains genuinely pending for a later, separate invocation.
 */
export function assertExplicitConfirmation(): void {
  if (process.env.MIGRATION_RUN_CONFIRM !== 'RUN_REAL_MIGRATIONS') {
    throw new Error(
      'Migration run refused: set MIGRATION_RUN_CONFIRM=RUN_REAL_MIGRATIONS to run against whichever database DB_HOST/DB_NAME currently point at.',
    );
  }
}

/**
 * The SAME derivation TypeORM's own MigrationExecutor.getMigrations() uses internally (see
 * node_modules/typeorm/migration/MigrationExecutor.js): the last 13 characters of the migration
 * class's own `name` property, parsed as an integer. Not imported (it's private to TypeORM) —
 * mirrored exactly so a bounded run interprets "timestamp" identically to how TypeORM itself
 * interprets the exact same classes on every other invocation, including whatever later,
 * unbounded run picks up what this one left pending.
 */
export function migrationTimestamp(instance: Pick<MigrationInterface, 'name'>): number {
  const className = instance.name ?? (instance as any).constructor?.name;
  const ts = parseInt(String(className).slice(-13), 10);
  if (!ts || Number.isNaN(ts)) {
    throw new Error(`${className} migration name is wrong. Migration class name should have a JavaScript timestamp appended.`);
  }
  return ts;
}

/**
 * Strict validation: MIGRATION_RUN_UPTO must be exactly a plain positive integer string (the
 * migration timestamp itself, e.g. "1788266400000") — nothing else. No decimals, no sign, no
 * scientific notation, no surrounding whitespace, no leading zero padding tricks. The anchored
 * regex rejects anything Number()/parseInt() would otherwise silently tolerate or coerce.
 */
export function parseUpperBound(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`MIGRATION_RUN_UPTO is malformed: "${raw}" is not a plain positive integer migration timestamp.`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`MIGRATION_RUN_UPTO is malformed: "${raw}" is not a safe integer.`);
  }
  return n;
}

export interface DiscoveredMigration {
  instance: MigrationInterface;
  name: string;
  timestamp: number;
}

export interface MigrationSelection {
  selected: DiscoveredMigration[];
  excluded: DiscoveredMigration[];
}

/**
 * Pure selection logic: no I/O, no DataSource construction. `upperBound === null` means no
 * MIGRATION_RUN_UPTO was set — every discovered migration is selected (existing, unbounded
 * behaviour, byte-for-byte). `upperBound` is only ever a value already proven (by the caller,
 * via parseUpperBound) to be a well-formed positive integer.
 *
 * Fails closed:
 *   - the bound must equal some discovered migration's own timestamp exactly (a boundary that
 *     matches nothing real is far more likely a typo/wrong-value than an intentional "run
 *     nothing past an arbitrary number", so it's refused rather than silently accepted).
 *   - the selected set can never legitimately be empty once the bound matched a discovered
 *     migration (that migration's own timestamp always satisfies "<= bound"); an empty result
 *     here would mean this function's own filtering is broken, not a real production scenario —
 *     asserted defensively rather than allowed to silently proceed to a no-op run.
 */
export function selectMigrations(discovered: DiscoveredMigration[], upperBound: number | null): MigrationSelection {
  const sorted = [...discovered].sort((a, b) => a.timestamp - b.timestamp);
  if (upperBound === null) {
    return { selected: sorted, excluded: [] };
  }

  const known = new Set(sorted.map((d) => d.timestamp));
  if (!known.has(upperBound)) {
    throw new Error(
      `MIGRATION_RUN_UPTO=${upperBound} does not match any discovered migration's timestamp. ` +
        `Known timestamps: ${[...known].sort((a, b) => a - b).join(', ')}`,
    );
  }

  const selected = sorted.filter((d) => d.timestamp <= upperBound);
  const excluded = sorted.filter((d) => d.timestamp > upperBound);

  if (selected.length === 0) {
    // Structurally unreachable given the `known.has(upperBound)` check above (that migration's
    // own timestamp always satisfies `<= upperBound`) — a defensive assertion, not a real path.
    throw new Error(`MIGRATION_RUN_UPTO=${upperBound} selected zero migrations — refusing to run.`);
  }

  return { selected, excluded };
}

function discover(ds: DataSource): DiscoveredMigration[] {
  return ds.migrations.map((instance) => ({
    instance,
    name: (instance as any).name ?? instance.constructor.name,
    timestamp: migrationTimestamp(instance as any),
  }));
}

function logSelection(upperBound: number | null, { selected, excluded }: MigrationSelection): void {
  if (upperBound === null) {
    console.log('No MIGRATION_RUN_UPTO set — running every pending migration (unbounded, existing behaviour).');
    return;
  }
  console.log(`MIGRATION_RUN_UPTO=${upperBound} — selecting ${selected.length} migration(s):`);
  for (const s of selected) console.log(`  [selected] ${s.name} (${s.timestamp})`);
  for (const e of excluded) console.log(`  [excluded, timestamp > bound] ${e.name} (${e.timestamp})`);
}

/**
 * Builds the DataSource that will actually run — the shared `ds` unchanged when unbounded, or a
 * fresh throwaway DataSource (same options, same migrationsTableName, only the selected migration
 * classes) when a bound is set. The caller is responsible for destroying whatever is returned
 * that isn't `ds` itself (see `owns`).
 */
export function buildRunner(ds: DataSource, upperBound: number | null): { runner: DataSource; owns: boolean; selection: MigrationSelection } {
  const discovered = discover(ds);
  const selection = selectMigrations(discovered, upperBound);
  logSelection(upperBound, selection);

  if (upperBound === null) {
    return { runner: ds, owns: false, selection };
  }

  // ConnectionMetadataBuilder.buildMigrations() always does `new migrationClass()` on whatever's
  // in options.migrations (see node_modules/typeorm/connection/ConnectionMetadataBuilder.js) --
  // it expects CLASSES, not the already-built instances ds.migrations holds post-initialize.
  // `.constructor` recovers the original class from each selected instance.
  const runner = new DataSource({
    ...(ds.options as any),
    migrations: selection.selected.map((s) => s.instance.constructor as any),
  });
  return { runner, owns: true, selection };
}

export async function main(): Promise<void> {
  assertExplicitConfirmation();
  await dataSource.initialize();

  const identity = (await dataSource.query(
    `SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS server_addr`,
  )) as Array<{ database: string; username: string; server_addr: string | null }>;
  console.log(
    `Connected as ${identity[0].username}@${identity[0].database} (server ${identity[0].server_addr}).`,
  );

  const rawUpperBound = process.env.MIGRATION_RUN_UPTO;
  const upperBound = rawUpperBound === undefined ? null : parseUpperBound(rawUpperBound);
  const { runner, owns } = buildRunner(dataSource, upperBound);
  if (owns) await runner.initialize();

  console.log('Running migrations...');
  const executed = await runner.runMigrations();
  if (executed.length === 0) {
    console.log('No pending migrations — already up to date.');
  } else {
    console.log('Executed migrations:', executed.map((m) => m.name).join(', '));
  }

  if (owns) await runner.destroy();
  await dataSource.destroy();
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Migration run failed:', e);
    process.exit(1);
  });
}
