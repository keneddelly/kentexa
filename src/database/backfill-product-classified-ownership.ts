import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { AccountRole, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { WorkspaceAssignment } from '../business/entities/workspace-assignment.entity';
import { BusinessMembership } from '../business/entities/business-membership.entity';
import { OperationalWorkspace } from '../business/entities/operational-workspace.entity';
import { Business } from '../business/entities/business.entity';
import { BusinessFirstMigrationAudit } from '../business/entities/business-first-migration-audit.entity';
import { User } from '../users/entities/user.entity';

config();

/**
 * Business-First Stage 2A: standalone, manually-invoked historical backfill
 * for Product/Classified workspace ownership. Mirrors the exact rollout
 * discipline already proven by backfill-business-first-foundation.ts and
 * the Stage 2 communication tools: dry-run default, --execute + a
 * purpose-specific confirmation token required to write, a read-only
 * classification pass that ALWAYS runs first (so --expect-* guards are
 * checked BEFORE any write, never after), RESOLVED/AMBIGUOUS/UNRESOLVED
 * reporting -- with Product and Classified counts reported and guarded
 * INDEPENDENTLY, never merged -- idempotent, one transaction per row.
 *
 * This tool is HISTORICAL-ONLY. It resolves workspaceId for a pre-existing
 * row via:
 *   row.seller (User) -> AccountRole (roleType='seller') ->
 *   AccountRole.workspaceAssignmentId -> WorkspaceAssignment.workspaceId
 *
 * This is a DIFFERENT resolution path than any live/new write, which
 * stamps workspaceId directly from the acting request's own authoritative
 * RoleContext.workspaceId (see ProductsService.create() /
 * ClassifiedsService.create()) and never performs this kind of lookup at
 * all. Conflating the two would let a live write's authority silently
 * drift as an account's organizational bindings change over time; this
 * tool exists ONLY to give already-existing rows a one-time, deterministic,
 * point-in-time resolution.
 *
 * Never touches SellerProfile, CommerceProfile, AccountRole, Business,
 * OperationalWorkspace, BusinessMembership, or WorkspaceAssignment --
 * read-only against all of them. Never fabricates a Business/workspace
 * relationship. Never uses name/email/phone/business-name matching. A row
 * whose seller has no deterministic organizational binding is UNRESOLVED
 * and stays workspaceId = null, exactly as it is today.
 */

const ENTITIES = [
  Product, Classified, AccountRole, ActiveRoleSession, WorkspaceAssignment, BusinessMembership,
  OperationalWorkspace, Business, BusinessFirstMigrationAudit, User,
];

export function buildDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kentexa',
    synchronize: false,
    entities: ENTITIES,
  });
}

export const REQUIRED_CONFIRMATION_TOKEN = 'KENTEXA-PRODUCT-CLASSIFIED-OWNERSHIP-BACKFILL';
const RECOGNIZED_FLAGS = new Set([
  'execute', 'confirm-production-product-classified-backfill',
  'expect-product-resolved', 'expect-product-ambiguous', 'expect-product-unresolved',
  'expect-classified-resolved', 'expect-classified-ambiguous', 'expect-classified-unresolved',
]);

function flagNameOf(token: string): string | null {
  if (!token.startsWith('--')) return null;
  const body = token.slice(2);
  const eqIdx = body.indexOf('=');
  return eqIdx === -1 ? body : body.slice(0, eqIdx);
}

function parseStrictNonNegativeInt(raw: string, flagLabel: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`--${flagLabel} must be a non-negative integer, got "${raw}"`);
  }
  return parseInt(raw, 10);
}

export interface CliOptions {
  execute: boolean;
  confirmToken?: string;
  expectProductResolved?: number;
  expectProductAmbiguous?: number;
  expectProductUnresolved?: number;
  expectClassifiedResolved?: number;
  expectClassifiedAmbiguous?: number;
  expectClassifiedUnresolved?: number;
}

export function parseArgs(argv: string[]): CliOptions {
  const seenCounts = new Map<string, number>();
  for (const token of argv) {
    const name = flagNameOf(token);
    if (name === null) continue;
    if (!RECOGNIZED_FLAGS.has(name)) throw new Error(`Unknown argument: --${name}`);
    seenCounts.set(name, (seenCounts.get(name) ?? 0) + 1);
  }
  for (const [name, count] of seenCounts) {
    if (count > 1) throw new Error(`Duplicate argument: --${name} was supplied ${count} times -- pass it exactly once.`);
  }

  const flag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const eq = argv.find((a) => a.startsWith(prefix));
    if (eq) return eq.slice(prefix.length);
    const idx = argv.indexOf(`--${name}`);
    if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    return undefined;
  };

  const execute = argv.includes('--execute');
  const confirmToken = flag('confirm-production-product-classified-backfill');
  if (execute && confirmToken !== REQUIRED_CONFIRMATION_TOKEN) {
    throw new Error(`--execute requires --confirm-production-product-classified-backfill ${REQUIRED_CONFIRMATION_TOKEN} -- missing or incorrect confirmation.`);
  }

  const parseOpt = (name: string) => {
    const raw = flag(name);
    return raw !== undefined ? parseStrictNonNegativeInt(raw, name) : undefined;
  };

  return {
    execute,
    confirmToken,
    expectProductResolved: parseOpt('expect-product-resolved'),
    expectProductAmbiguous: parseOpt('expect-product-ambiguous'),
    expectProductUnresolved: parseOpt('expect-product-unresolved'),
    expectClassifiedResolved: parseOpt('expect-classified-resolved'),
    expectClassifiedAmbiguous: parseOpt('expect-classified-ambiguous'),
    expectClassifiedUnresolved: parseOpt('expect-classified-unresolved'),
  };
}

export interface RowResult {
  category: 'product' | 'classified';
  sourceId: number;
  outcome: 'resolved' | 'already-resolved' | 'ambiguous' | 'unresolved';
  detail: string;
  workspaceId?: number;
}

async function auditRow(
  manager: import('typeorm').EntityManager,
  code: string,
  sourceType: string,
  sourceId: number,
  userId: number | null,
  details: Record<string, unknown>,
): Promise<void> {
  await manager.getRepository(BusinessFirstMigrationAudit).save(
    manager.getRepository(BusinessFirstMigrationAudit).create({
      severity: 'warning', code, sourceType, sourceId, userId, details,
    }),
  );
}

type SellerResolution =
  | { kind: 'resolved'; workspaceId: number }
  | { kind: 'unresolved'; reason: string }
  | { kind: 'ambiguous'; reason: string };

/**
 * Resolves the deterministic workspaceId for a seller's User.id, via
 * AccountRole(roleType='seller').workspaceAssignmentId -> WorkspaceAssignment.
 * Never guesses, never falls back to name/email/phone matching.
 *
 * - UNRESOLVED: no seller at all, no Seller AccountRole, or the AccountRole
 *   is genuinely not organizationally bound (workspaceAssignmentId is
 *   null) -- the expected, common case for a not-yet-migrated seller.
 * - AMBIGUOUS: the AccountRole DOES claim a workspaceAssignmentId, but the
 *   WorkspaceAssignment it points to is missing or not active -- a data-
 *   integrity inconsistency (should not happen given Stage 1's own
 *   constraints, but this tool never assumes that), flagged for human
 *   review rather than silently treated as "never bound."
 */
async function resolveWorkspaceIdForSeller(dataSource: DataSource, sellerId: number | null): Promise<SellerResolution> {
  if (!sellerId) return { kind: 'unresolved', reason: 'row has no seller at all' };
  const accountRole = await dataSource.getRepository(AccountRole).findOne({
    where: { userId: sellerId, roleType: AccountRoleType.SELLER },
  });
  if (!accountRole) return { kind: 'unresolved', reason: `no Seller AccountRole exists for userId ${sellerId}` };
  if (accountRole.workspaceAssignmentId == null) {
    return { kind: 'unresolved', reason: `Seller AccountRole ${accountRole.id} has no organizational binding` };
  }
  const assignment = await dataSource.getRepository(WorkspaceAssignment).findOne({
    where: { id: accountRole.workspaceAssignmentId },
  });
  if (!assignment || assignment.status !== 'active') {
    return { kind: 'ambiguous', reason: `AccountRole ${accountRole.id} claims workspaceAssignmentId ${accountRole.workspaceAssignmentId} but it is missing or not active` };
  }
  return { kind: 'resolved', workspaceId: assignment.workspaceId };
}

async function runCategory(
  dataSource: DataSource,
  apply: boolean,
  category: 'product' | 'classified',
): Promise<RowResult[]> {
  const results: RowResult[] = [];
  const repo = category === 'product' ? dataSource.getRepository(Product) : dataSource.getRepository(Classified);
  const rows = await repo.find({ relations: { seller: true } });

  for (const row of rows as Array<Product | Classified>) {
    const sellerId = (row as any).seller?.id ?? null;
    if ((row as any).workspaceId != null) {
      results.push({ category, sourceId: row.id, outcome: 'already-resolved', detail: 'workspaceId already set (likely a post-Stage-2A dual write)', workspaceId: (row as any).workspaceId });
      continue;
    }

    const resolution = await resolveWorkspaceIdForSeller(dataSource, sellerId);

    if (resolution.kind === 'unresolved') {
      if (apply) {
        await dataSource.transaction((m) => auditRow(m, `${category}_seller_without_workspace`, category, row.id, sellerId, { reason: resolution.reason }));
      }
      results.push({ category, sourceId: row.id, outcome: 'unresolved', detail: resolution.reason });
      continue;
    }

    if (resolution.kind === 'ambiguous') {
      if (apply) {
        await dataSource.transaction((m) => auditRow(m, `${category}_workspace_assignment_inconsistent`, category, row.id, sellerId, { reason: resolution.reason }));
      }
      results.push({ category, sourceId: row.id, outcome: 'ambiguous', detail: resolution.reason });
      continue;
    }

    const { workspaceId } = resolution;
    if (!apply) {
      results.push({ category, sourceId: row.id, outcome: 'resolved', detail: `would set workspaceId=${workspaceId}`, workspaceId });
      continue;
    }

    await repo.update(row.id, { workspaceId } as any);
    results.push({ category, sourceId: row.id, outcome: 'resolved', detail: `workspaceId set to ${workspaceId}`, workspaceId });
  }

  return results;
}

function summarize(results: RowResult[], category: 'product' | 'classified') {
  const inCategory = results.filter((r) => r.category === category);
  return {
    resolvedCount: inCategory.filter((r) => r.outcome === 'resolved' || r.outcome === 'already-resolved').length,
    ambiguousCount: inCategory.filter((r) => r.outcome === 'ambiguous').length,
    unresolvedCount: inCategory.filter((r) => r.outcome === 'unresolved').length,
  };
}

export async function main(argvOverride?: string[], dataSourceOverride?: DataSource): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argvOverride ?? process.argv.slice(2));
  } catch (err: any) {
    console.error('[product-classified-backfill] FAILED:', err.message);
    process.exitCode = 1;
    return 1;
  }

  const dataSource = dataSourceOverride ?? buildDataSource();
  let exitCode = 0;

  try {
    if (!dataSource.isInitialized) await dataSource.initialize();
    console.log(`[product-classified-backfill] connected. mode=${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);

    const identity = await dataSource.query('select current_database() as db');
    console.log(`[product-classified-backfill] database identity: ${identity[0].db}`);

    // Classification ALWAYS runs first, read-only, regardless of --execute.
    const productClassification = await runCategory(dataSource, false, 'product');
    const classifiedClassification = await runCategory(dataSource, false, 'classified');
    const productCounts = summarize(productClassification, 'product');
    const classifiedCounts = summarize(classifiedClassification, 'classified');

    console.log('[product-classified-backfill] product classification:', JSON.stringify(productClassification, null, 2));
    console.log(`[product-classified-backfill] product summary: resolved=${productCounts.resolvedCount} ambiguous=${productCounts.ambiguousCount} unresolved=${productCounts.unresolvedCount}`);
    console.log('[product-classified-backfill] classified classification:', JSON.stringify(classifiedClassification, null, 2));
    console.log(`[product-classified-backfill] classified summary: resolved=${classifiedCounts.resolvedCount} ambiguous=${classifiedCounts.ambiguousCount} unresolved=${classifiedCounts.unresolvedCount}`);

    let guardFailed = false;
    const checkGuard = (label: string, expected: number | undefined, actual: number) => {
      if (expected !== undefined && expected !== actual) {
        console.error(`[product-classified-backfill] FAILED: --${label} ${expected} does not match actual count ${actual} -- refusing to write on drifted data.`);
        guardFailed = true;
      }
    };
    checkGuard('expect-product-resolved', opts.expectProductResolved, productCounts.resolvedCount);
    checkGuard('expect-product-ambiguous', opts.expectProductAmbiguous, productCounts.ambiguousCount);
    checkGuard('expect-product-unresolved', opts.expectProductUnresolved, productCounts.unresolvedCount);
    checkGuard('expect-classified-resolved', opts.expectClassifiedResolved, classifiedCounts.resolvedCount);
    checkGuard('expect-classified-ambiguous', opts.expectClassifiedAmbiguous, classifiedCounts.ambiguousCount);
    checkGuard('expect-classified-unresolved', opts.expectClassifiedUnresolved, classifiedCounts.unresolvedCount);

    if (guardFailed) {
      exitCode = 1;
      console.error('[product-classified-backfill] Guard check failed -- no writes performed, even though --execute was requested.');
      return exitCode;
    }

    if (!opts.execute) {
      console.log('[product-classified-backfill] DRY RUN complete. No writes performed.');
      return exitCode;
    }

    console.log('[product-classified-backfill] guard check passed -- applying writes.');
    const appliedProduct = await runCategory(dataSource, true, 'product');
    const appliedClassified = await runCategory(dataSource, true, 'classified');
    console.log('[product-classified-backfill] applied product results:', JSON.stringify(appliedProduct, null, 2));
    console.log('[product-classified-backfill] applied classified results:', JSON.stringify(appliedClassified, null, 2));
    console.log('[product-classified-backfill] EXECUTE complete.');
    return exitCode;
  } catch (err: any) {
    exitCode = 1;
    console.error('[product-classified-backfill] FAILED:', err.message);
    return exitCode;
  } finally {
    if (!dataSourceOverride && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('[product-classified-backfill] DataSource closed.');
    }
    process.exitCode = exitCode;
  }
}

/* istanbul ignore next -- real CLI entrypoint; exercised via the built dist/ file, not unit tests */
if (require.main === module) {
  main();
}
