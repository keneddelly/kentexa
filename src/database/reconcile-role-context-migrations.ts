import dataSource from './data-source';
import { QueryRunner } from 'typeorm';

/**
 * Reconciles the migration ledger against ACTUAL schema state for the
 * Stage 1 (AccountRole/ActiveRoleSession) and Stage 2 (communication
 * participant/audience) migrations, without ever running their `up()` DDL
 * against a database that already has equivalent objects (which would
 * fail — see AddAccountRoleAndActiveRoleSession's CREATE TYPE/CREATE TABLE
 * statements, neither of which is idempotent).
 *
 * Why this exists: a real local database was found where TypeORM
 * `synchronize` had already created the account_role/active_role_session/
 * conversation_participant schema before these migrations were ever run,
 * AND the ledger had rows for logically-the-same migrations recorded
 * under an OLDER naming convention (`AddAccountRoleAndActiveRoleSession
 * 20260901101000` vs. the current file's `...1788257400000`). TypeORM
 * matches migrations by ledger NAME only, so it saw all of them as
 * pending and would have tried to re-run CREATE TYPE/CREATE TABLE against
 * a database that already has that exact type/table — a hard failure,
 * not a safe no-op.
 *
 * This tool NEVER runs a migration's up()/down(). It only ever:
 *   1. Reads the current ledger and the current schema (read-only).
 *   2. For each migration below, decides RESOLVED / NOT_APPLICABLE /
 *      ADOPTABLE / AMBIGUOUS by comparing the ACTUAL schema against an
 *      explicit fingerprint of what that migration's up() would create.
 *   3. Only in --apply mode, and only for ADOPTABLE migrations, inserts a
 *      single ledger row recording that migration as applied — no DDL, no
 *      data write to any business table, ever.
 *
 * Dry-run by default. Requires `--apply` (or RECONCILE_APPLY=true) to
 * write anything. Fail-closed: AMBIGUOUS always blocks that migration
 * from being touched, in either mode, and the tool exits non-zero.
 */

interface ColumnFingerprint {
  table: string;
  column: string;
}

interface MigrationFingerprint {
  /** The current, canonical ledger name (from the migration file's own `name` field). */
  canonicalName: string;
  timestamp: number;
  /** Names this migration has been recorded under historically. Any one of
   *  these present in the ledger means RESOLVED — no action needed. */
  knownAliases: string[];
  /**
   * Tables this migration's up() actually `CREATE TABLE`s — confirmed
   * directly from each migration's source (grep for CREATE TABLE), never
   * assumed. Deliberately does NOT include tables the migration only adds
   * columns to (e.g. AddCommunicationParticipantAudience's `ensureColumns`
   * calls against `conversation`/`conversation_message`/`notification`/
   * `communication_log` — those four tables predate Stage 2 entirely and
   * exist in every real deployment regardless of this migration's status,
   * so their bare existence carries no signal about whether it ran; only
   * their specific new columns, listed in requiredColumns below, do).
   * Together with requiredColumns this distinguishes "never applied"
   * (every newTable AND every requiredColumn absent) from "partially
   * applied" (anything present without the complete matching footprint).
   */
  newTables: string[];
  requiredColumns: ColumnFingerprint[];
  requiredConstraints?: string[];
  description: string;
}

const FINGERPRINTS: MigrationFingerprint[] = [
  {
    canonicalName: 'AddAccountRoleAndActiveRoleSession1788257400000',
    timestamp: 1788257400000,
    knownAliases: ['AddAccountRoleAndActiveRoleSession20260901101000'],
    // All three are genuinely CREATE TABLE'd by this migration — none
    // pre-exist it.
    newTables: ['account_role', 'active_role_session', 'role_migration_audit'],
    requiredColumns: [
      { table: 'account_role', column: 'userId' },
      { table: 'account_role', column: 'roleType' },
      { table: 'account_role', column: 'status' },
      { table: 'account_role', column: 'profileType' },
      { table: 'account_role', column: 'profileId' },
      { table: 'account_role', column: 'contextVersion' },
      { table: 'active_role_session', column: 'accountRoleId' },
      { table: 'active_role_session', column: 'contextVersion' },
      { table: 'active_role_session', column: 'expiresAt' },
      { table: 'active_role_session', column: 'revokedAt' },
      { table: 'role_migration_audit', column: 'severity' },
      { table: 'role_migration_audit', column: 'code' },
    ],
    requiredConstraints: ['UQ_account_role_user_role'],
    description: 'Phase A: AccountRole / ActiveRoleSession / role_migration_audit foundation',
  },
  {
    canonicalName: 'FixActiveRoleSessionUuidDefault1788258000000',
    timestamp: 1788258000000,
    knownAliases: ['FixActiveRoleSessionUuidDefault20260901102000'],
    // Creates nothing new — only ALTERs a column default on a table
    // migration 2 already created. If that table doesn't exist yet
    // either, this correctly falls out as NOT_APPLICABLE (nothing to fix
    // yet) via the requiredColumns check below, not a separate table gate.
    newTables: [],
    requiredColumns: [{ table: 'active_role_session', column: 'id' }],
    description: 'active_role_session.id DEFAULT gen_random_uuid() fix',
  },
  {
    canonicalName: 'AddCommunicationParticipantAudience1788258600000',
    timestamp: 1788258600000,
    knownAliases: [],
    // Confirmed via `grep -n "CREATE TABLE" 1788258600000-*.ts`: exactly
    // these two. `conversation`/`conversation_message`/`notification`/
    // `communication_log` are pre-existing legacy tables this migration
    // only adds columns to (via `ensureColumns`) -- they exist in every
    // real Kentexa database regardless of Stage 2 status and must NOT
    // gate the never-applied/partial distinction the way a genuinely new
    // table does. Their Stage 2 columns are still fully checked below.
    newTables: ['conversation_participant', 'conversation_participant_state'],
    requiredColumns: [
      { table: 'conversation_participant', column: 'principalType' },
      { table: 'conversation_participant', column: 'account_role_id' },
      { table: 'conversation_participant', column: 'participantKind' },
      { table: 'conversation_participant_state', column: 'unreadCount' },
      { table: 'conversation', column: 'classificationStatus' },
      { table: 'conversation_message', column: 'senderAccountRoleId' },
      { table: 'notification', column: 'audienceScope' },
      { table: 'notification', column: 'recipientAccountRoleId' },
      { table: 'communication_log', column: 'recipientAccountRoleId' },
      { table: 'communication_log', column: 'audienceScope' },
    ],
    requiredConstraints: ['CHK_conv_participant_one_principal'],
    description:
      'Stage 2: conversation_participant/state tables + audience columns on ' +
      'conversation/conversation_message/notification/communication_log — ' +
      'the FULL footprint, not just conversation_participant alone',
  },
];

export type Verdict = 'RESOLVED' | 'NOT_APPLICABLE' | 'ADOPTABLE' | 'AMBIGUOUS';

export interface EvaluationResult {
  migration: MigrationFingerprint;
  verdict: Verdict;
  detail: string;
}

export { FINGERPRINTS };
export type { MigrationFingerprint };

async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  return queryRunner.hasTable(table);
}

async function columnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  return queryRunner.hasColumn(table, column);
}

async function constraintExists(
  queryRunner: QueryRunner,
  name: string,
): Promise<boolean> {
  const rows = (await queryRunner.query(
    `SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = $1`,
    [name],
  )) as unknown[];
  return rows.length > 0;
}

/**
 * Content-based match for CHK_conv_participant_one_principal specifically.
 * The entity's @Check() decorator now names it explicitly (migration
 * readiness pass), so any NEW synchronize run creates it under this exact
 * name — but a database synced BEFORE that fix has it under an
 * auto-generated hash name instead. Matching by name alone would
 * incorrectly mark such a (fully equivalent) database as AMBIGUOUS.
 */
async function onePrincipalCheckExists(queryRunner: QueryRunner): Promise<boolean> {
  const rows = (await queryRunner.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.conversation_participant'::regclass
      AND contype = 'c'
  `)) as Array<{ definition: string }>;
  const requiredFragments = [
    `'account'`, `'account_role'`, `'workspace'`, `'external_contact'`,
    'user_id', 'account_role_id', 'external_customer_id',
  ];
  return rows.some((row) => requiredFragments.every((f) => row.definition.includes(f)));
}

async function ledgerHasAnyName(
  queryRunner: QueryRunner,
  names: string[],
): Promise<string | null> {
  if (names.length === 0) return null;
  const rows = (await queryRunner.query(
    `SELECT name FROM public.typeorm_migrations WHERE name = ANY($1::text[])`,
    [names],
  )) as Array<{ name: string }>;
  return rows[0]?.name ?? null;
}

export async function evaluateMigration(
  queryRunner: QueryRunner,
  fp: MigrationFingerprint,
): Promise<EvaluationResult> {
  const allNames = [fp.canonicalName, ...fp.knownAliases];
  const ledgerMatch = await ledgerHasAnyName(queryRunner, allNames);
  if (ledgerMatch) {
    return {
      migration: fp,
      verdict: 'RESOLVED',
      detail: `Already recorded in the ledger as "${ledgerMatch}" — no action needed.`,
    };
  }

  // Sequential, not Promise.all — a single QueryRunner holds one Postgres
  // connection, and concurrent queries on it are unsafe (pg warns and will
  // remove support for this entirely in a future major version).
  const newTablePresence: Array<{ table: string; present: boolean }> = [];
  for (const t of fp.newTables) {
    newTablePresence.push({ table: t, present: await tableExists(queryRunner, t) });
  }

  const columnPresence: Array<{ table: string; column: string; present: boolean }> = [];
  for (const col of fp.requiredColumns) {
    columnPresence.push({
      ...col,
      present: await columnExists(queryRunner, col.table, col.column),
    });
  }

  // NEVER APPLIED: every genuinely-new table this migration would create
  // is absent, AND every column/addition it would make to any table
  // (new or pre-existing) is also absent. Checking requiredColumns here
  // too (not just newTables) is what correctly classifies "one Stage 2
  // column already exists somewhere, but neither new table does" as a
  // partial state below, rather than silently calling it never-applied.
  const allNewTablesAbsent = newTablePresence.every((t) => !t.present);
  const allColumnsAbsent = columnPresence.every((c) => !c.present);
  if (allNewTablesAbsent && allColumnsAbsent) {
    return {
      migration: fp,
      verdict: 'NOT_APPLICABLE',
      detail:
        `Nothing this migration would create or add exists yet ` +
        `(new tables: ${fp.newTables.join(', ') || '(none)'}; columns: ` +
        `${fp.requiredColumns.map((c) => `${c.table}.${c.column}`).join(', ') || '(none)'}). ` +
        `This migration has genuinely never run here — run it normally via migration:run.`,
    };
  }

  // Something related exists — this must now be a COMPLETE, exact match
  // (every new table, every column, every constraint) to be ADOPTABLE.
  // Any single gap means PARTIAL or INCOMPATIBLE, both AMBIGUOUS.
  const missingNewTables = newTablePresence.filter((t) => !t.present).map((t) => t.table);
  if (missingNewTables.length > 0) {
    return {
      migration: fp,
      verdict: 'AMBIGUOUS',
      detail:
        `Some Stage-2 object(s) already exist, but expected new table(s) are ` +
        `still missing: ${missingNewTables.join(', ')}. This is a partial state — ` +
        `a human must investigate before either running the migration or adopting the ledger.`,
    };
  }

  const missingColumns = columnPresence.filter((c) => !c.present).map((c) => `${c.table}.${c.column}`);
  if (missingColumns.length > 0) {
    return {
      migration: fp,
      verdict: 'AMBIGUOUS',
      detail:
        `All required new tables exist, but expected column(s) are missing: ` +
        `${missingColumns.join(', ')}. This does not match what this ` +
        `migration would create — refusing to guess.`,
    };
  }

  for (const constraintName of fp.requiredConstraints ?? []) {
    const present =
      constraintName === 'CHK_conv_participant_one_principal'
        ? await onePrincipalCheckExists(queryRunner) // content-based, name may differ (synchronize vs. migration)
        : await constraintExists(queryRunner, constraintName); // exact-name, explicitly named in the entity
    if (!present) {
      return {
        migration: fp,
        verdict: 'AMBIGUOUS',
        detail:
          `All required tables/columns exist, but expected constraint ` +
          `"${constraintName}" is missing. Refusing to guess.`,
      };
    }
  }

  return {
    migration: fp,
    verdict: 'ADOPTABLE',
    detail:
      `All required tables/columns/constraints exist and match. Safe to record ` +
      `"${fp.canonicalName}" in the ledger WITHOUT running its up() (which would ` +
      `fail on already-existing objects).`,
  };
}

async function adoptLedgerRow(
  queryRunner: QueryRunner,
  fp: MigrationFingerprint,
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO public.typeorm_migrations(timestamp, name) VALUES ($1, $2)`,
    [fp.timestamp, fp.canonicalName],
  );
}

export async function reconcile(apply: boolean): Promise<EvaluationResult[]> {
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  const results: EvaluationResult[] = [];

  try {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.typeorm_migrations (
        id SERIAL NOT NULL,
        timestamp bigint NOT NULL,
        name character varying NOT NULL,
        CONSTRAINT "PK_typeorm_migrations_reconcile" PRIMARY KEY (id)
      )
    `);

    for (const fp of FINGERPRINTS) {
      const result = await evaluateMigration(queryRunner, fp);
      results.push(result);

      const label = `[${result.verdict}] ${fp.canonicalName}`;
      console.log(`${label} — ${result.detail}`);

      if (result.verdict === 'ADOPTABLE' && apply) {
        await queryRunner.startTransaction();
        try {
          // Advisory lock keyed on this migration's own timestamp, mirroring
          // adopt-render-baseline.ts's concurrency guard.
          await queryRunner.query(`SELECT pg_advisory_xact_lock($1)`, [fp.timestamp]);
          // Re-check under the lock in case a concurrent adoption ran first.
          const stillAdoptable = await evaluateMigration(queryRunner, fp);
          if (stillAdoptable.verdict !== 'ADOPTABLE') {
            console.log(
              `  Skipped adoption — re-check under lock returned ${stillAdoptable.verdict}, not ADOPTABLE.`,
            );
            await queryRunner.rollbackTransaction();
            continue;
          }
          await adoptLedgerRow(queryRunner, fp);
          await queryRunner.commitTransaction();
          console.log(`  Adopted "${fp.canonicalName}" into the ledger.`);
        } catch (error) {
          if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
          throw error;
        }
      }
    }

    const ambiguous = results.filter((r) => r.verdict === 'AMBIGUOUS');
    if (ambiguous.length > 0) {
      console.error(
        `\n${ambiguous.length} migration(s) are AMBIGUOUS — human investigation required. ` +
          `No further automated action should be taken until these are resolved.`,
      );
    }

    return results;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  const apply = process.argv.includes('--apply') || process.env.RECONCILE_APPLY === 'true';
  if (!apply) {
    console.log('DRY RUN — pass --apply or set RECONCILE_APPLY=true to write ledger rows.\n');
  }
  reconcile(apply)
    .then((results) => {
      const hasAmbiguous = results.some((r) => r.verdict === 'AMBIGUOUS');
      process.exitCode = hasAmbiguous ? 1 : 0;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
