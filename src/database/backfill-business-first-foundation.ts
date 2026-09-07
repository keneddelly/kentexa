import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, EntityManager } from 'typeorm';
import { Business } from '../business/entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from '../business/entities/business-capability.entity';
import { BusinessFirstMigrationAudit } from '../business/entities/business-first-migration-audit.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileMember } from '../commerce-profiles/entities/commerce-profile-member.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';

config();

/**
 * Business-First Stage 1 foundation: standalone, manually-invoked backfill
 * tool. Deliberately NOT embedded in the schema migration
 * (1788259200000-AddBusinessFirstFoundationSchema.ts creates the tables
 * empty and does nothing else) -- per the explicitly corrected Stage 1
 * plan, this uses the same rollout discipline already proven for the Stage
 * 2 communication-classification/participant-completion tools: dry-run
 * default, --execute + a purpose-specific confirmation token required to
 * write, expected-count guards CHECKED BEFORE ANY WRITE (a compute-only
 * classification pass always runs first, regardless of --execute; writes
 * only happen in a second pass, and only if no --expect-* guard was
 * violated), deterministic FK-only resolution (NEVER name/email/phone
 * heuristic matching), RESOLVED/AMBIGUOUS/UNRESOLVED reporting, idempotent,
 * one transaction per top-level row.
 *
 * What this tool does, for every existing Business (backfilling what
 * pre-dates BusinessService.create()'s own inline bootstrap, and skipping
 * anything that bootstrap already created):
 *   1. ensure an Owner BusinessMembership for Business.userId
 *   2. ensure a default OperationalWorkspace
 *   3. ensure the Owner's explicit WorkspaceAssignment for that workspace
 *      (Owner access is NEVER implicit -- see workspace-assignment.entity.ts)
 *   4. if that owner has an ACTIVE Seller AccountRole, grant a COMMERCE
 *      BusinessCapability on the workspace and bind
 *      AccountRole.workspaceAssignmentId to the assignment from step 3
 *
 * Then, for every SellerProfile (any status), resolves its owning Business
 * ONLY via Business.userId = SellerProfile.userId (never
 * SellerProfile.businessId, which is unpopulated in production, and never
 * name matching) and binds that Seller's AccountRole.workspaceAssignmentId
 * the same way -- logging UNRESOLVED and skipping, never guessing, when no
 * Business or no AccountRole exists for that user.
 *
 * Then, for every active CommerceProfileMember, resolves the backing
 * Business ONLY via CommerceProfile.businessId (skips + logs AMBIGUOUS if
 * unset) and creates a staff BusinessMembership + WorkspaceAssignment
 * carrying that member's existing permissions forward.
 *
 * Never touches Product/Order/Payment/Invoice/Inventory/Conversation/
 * ConversationParticipant/Notification/Shipment ownership. Never creates or
 * activates a Seller/Transport/SuperAgent AccountRole (Seller AccountRole
 * rows are only ever READ here, to bind their existing
 * workspaceAssignmentId -- never inserted). Never fabricates a Business or
 * workspace relationship that doesn't already exist in the data.
 */

const ENTITIES = [
  Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
  BusinessCapability, BusinessFirstMigrationAudit, SellerProfile,
  CommerceProfile, CommerceProfileMember, AccountRole, ActiveRoleSession, User,
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

export const REQUIRED_CONFIRMATION_TOKEN = 'KENTEXA-BUSINESS-FIRST-FOUNDATION-BACKFILL';
const RECOGNIZED_FLAGS = new Set([
  'execute', 'confirm-production-business-first-backfill',
  'expect-resolved', 'expect-ambiguous', 'expect-unresolved',
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
  expectResolved?: number;
  expectAmbiguous?: number;
  expectUnresolved?: number;
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
  const confirmToken = flag('confirm-production-business-first-backfill');
  if (execute && confirmToken !== REQUIRED_CONFIRMATION_TOKEN) {
    throw new Error(`--execute requires --confirm-production-business-first-backfill ${REQUIRED_CONFIRMATION_TOKEN} -- missing or incorrect confirmation.`);
  }

  const expectResolvedRaw = flag('expect-resolved');
  const expectAmbiguousRaw = flag('expect-ambiguous');
  const expectUnresolvedRaw = flag('expect-unresolved');

  return {
    execute,
    confirmToken,
    expectResolved: expectResolvedRaw !== undefined ? parseStrictNonNegativeInt(expectResolvedRaw, 'expect-resolved') : undefined,
    expectAmbiguous: expectAmbiguousRaw !== undefined ? parseStrictNonNegativeInt(expectAmbiguousRaw, 'expect-ambiguous') : undefined,
    expectUnresolved: expectUnresolvedRaw !== undefined ? parseStrictNonNegativeInt(expectUnresolvedRaw, 'expect-unresolved') : undefined,
  };
}

export interface RowResult {
  category: 'business' | 'seller_profile' | 'commerce_profile_member';
  sourceId: number;
  outcome: 'resolved' | 'already-resolved' | 'ambiguous' | 'unresolved';
  detail: string;
}

async function auditRow(
  manager: EntityManager,
  severity: 'warning' | 'error',
  code: string,
  sourceType: string,
  sourceId: number | null,
  userId: number | null,
  details: Record<string, unknown>,
): Promise<void> {
  await manager.getRepository(BusinessFirstMigrationAudit).save(
    manager.getRepository(BusinessFirstMigrationAudit).create({
      severity, code, sourceType, sourceId, userId, details,
    }),
  );
}

/**
 * Runs all three phases exactly once. When `apply` is false, this is a pure
 * read-only classification pass -- no row is ever written, including no
 * audit rows. When `apply` is true, every "would create"/"would bind"
 * outcome from the classification logic instead performs the real write
 * (still idempotent -- an already-existing row is always detected and
 * left alone, never duplicated).
 */
async function runPhases(dataSource: DataSource, apply: boolean): Promise<RowResult[]> {
  const results: RowResult[] = [];

  const businessRepo = dataSource.getRepository(Business);
  const workspaceRepo = dataSource.getRepository(OperationalWorkspace);
  const membershipRepo = dataSource.getRepository(BusinessMembership);
  const assignmentRepo = dataSource.getRepository(WorkspaceAssignment);
  const accountRoleRepo = dataSource.getRepository(AccountRole);
  const sellerProfileRepo = dataSource.getRepository(SellerProfile);
  const commerceProfileRepo = dataSource.getRepository(CommerceProfile);
  const commerceProfileMemberRepo = dataSource.getRepository(CommerceProfileMember);

  // ── Phase 1: every Business gets its default workspace / owner
  // membership / owner assignment, idempotently. ───────────────────────────
  const defaultAssignmentByBusinessId = new Map<number, { assignmentId: number; workspaceId: number; membershipId: number }>();

  const businesses = await businessRepo.find();
  for (const business of businesses) {
    const businessId = business.id;
    const ownerUserId = (business as any).userId ?? (business as any).user?.id;
    if (!ownerUserId) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'error', 'business_without_user', 'business', businessId, null, {}));
      results.push({ category: 'business', sourceId: businessId, outcome: 'unresolved', detail: 'Business has no owning userId -- should be impossible (FK NOT NULL)' });
      continue;
    }

    let membership = await membershipRepo.findOne({ where: { businessId, userId: ownerUserId, roleTemplate: BusinessMembershipRoleTemplate.OWNER } });
    let workspace = await workspaceRepo.findOne({ where: { businessId, isDefault: true } });
    let assignment = membership && workspace
      ? await assignmentRepo.findOne({ where: { businessMembershipId: membership.id, workspaceId: workspace.id } })
      : null;

    if (membership && workspace && assignment) {
      defaultAssignmentByBusinessId.set(businessId, { assignmentId: assignment.id, workspaceId: workspace.id, membershipId: membership.id });
      results.push({ category: 'business', sourceId: businessId, outcome: 'already-resolved', detail: 'default workspace/membership/assignment already exist' });
      continue;
    }

    if (!apply) {
      // Simulated future state for phase 2/3's own classification below --
      // sentinel ids, never written, never compared for equality against
      // anything real.
      defaultAssignmentByBusinessId.set(businessId, { assignmentId: -1, workspaceId: -1, membershipId: -1 });
      results.push({ category: 'business', sourceId: businessId, outcome: 'resolved', detail: 'would create missing default workspace/membership/assignment rows' });
      continue;
    }

    await dataSource.transaction(async (manager) => {
      if (!membership) {
        membership = await manager.getRepository(BusinessMembership).save(
          manager.getRepository(BusinessMembership).create({ businessId, userId: ownerUserId, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }),
        );
      }
      if (!workspace) {
        workspace = await manager.getRepository(OperationalWorkspace).save(
          manager.getRepository(OperationalWorkspace).create({ businessId, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }),
        );
      }
      if (!assignment) {
        assignment = await manager.getRepository(WorkspaceAssignment).save(
          manager.getRepository(WorkspaceAssignment).create({ businessMembershipId: membership!.id, workspaceId: workspace!.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }),
        );
      }

      const activeSellerRole = await manager.getRepository(AccountRole).findOne({
        where: { userId: ownerUserId, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE },
      });
      if (activeSellerRole) {
        const existingCapability = await manager.getRepository(BusinessCapability).findOne({
          where: { workspaceId: workspace!.id, capabilityCode: BusinessCapabilityCode.COMMERCE },
        });
        if (!existingCapability) {
          await manager.getRepository(BusinessCapability).save(
            manager.getRepository(BusinessCapability).create({
              workspaceId: workspace!.id, capabilityCode: BusinessCapabilityCode.COMMERCE,
              status: BusinessCapabilityStatus.ACTIVE, approvedAt: new Date(),
            }),
          );
        }
        if (activeSellerRole.workspaceAssignmentId !== assignment!.id) {
          await manager.getRepository(AccountRole).update(activeSellerRole.id, { workspaceAssignmentId: assignment!.id });
        }
      }
    });
    defaultAssignmentByBusinessId.set(businessId, { assignmentId: assignment!.id, workspaceId: workspace!.id, membershipId: membership!.id });
    results.push({ category: 'business', sourceId: businessId, outcome: 'resolved', detail: 'default workspace/membership/assignment created' });
  }

  // ── Phase 2: every SellerProfile -- bind its AccountRole to its
  // Business's default assignment, via Business.userId ONLY. ───────────────
  const sellerProfiles = await sellerProfileRepo.find();
  for (const sp of sellerProfiles) {
    const spUserId = (sp as any).userId ?? (sp as any).user?.id;
    if (!spUserId) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'error', 'seller_profile_without_user', 'seller_profile', sp.id, null, {}));
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'unresolved', detail: 'SellerProfile has no owning userId' });
      continue;
    }

    const business = await businessRepo.findOne({ where: { user: { id: spUserId } } });
    if (!business) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'warning', 'seller_without_business', 'seller_profile', sp.id, spUserId, { sellerStatus: sp.status }));
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'unresolved', detail: `no Business row exists for userId ${spUserId} -- refusing to fabricate one` });
      continue;
    }

    const accountRole = await accountRoleRepo.findOne({ where: { userId: spUserId, roleType: AccountRoleType.SELLER } });
    if (!accountRole) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'error', 'seller_profile_without_account_role', 'seller_profile', sp.id, spUserId, {}));
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'unresolved', detail: 'no Seller AccountRole exists for this SellerProfile\'s user -- refusing to guess' });
      continue;
    }

    const target = defaultAssignmentByBusinessId.get(business.id);
    if (!target) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'error', 'business_assignment_missing_after_phase_1', 'seller_profile', sp.id, spUserId, { businessId: business.id }));
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'unresolved', detail: 'this SellerProfile\'s Business has no resolved default assignment from phase 1' });
      continue;
    }

    if (accountRole.workspaceAssignmentId === target.assignmentId) {
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'already-resolved', detail: 'AccountRole.workspaceAssignmentId already correctly bound' });
      continue;
    }

    if (!apply) {
      results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'resolved', detail: `would bind AccountRole ${accountRole.id} to WorkspaceAssignment ${target.assignmentId}` });
      continue;
    }

    await accountRoleRepo.update(accountRole.id, { workspaceAssignmentId: target.assignmentId });
    results.push({ category: 'seller_profile', sourceId: sp.id, outcome: 'resolved', detail: `AccountRole ${accountRole.id} bound to WorkspaceAssignment ${target.assignmentId}` });
  }

  // ── Phase 3: every active CommerceProfileMember -- staff membership +
  // assignment, via CommerceProfile.businessId ONLY. ───────────────────────
  const members = await commerceProfileMemberRepo.find({ where: { isActive: true } });
  for (const member of members) {
    const cp = await commerceProfileRepo.findOne({ where: { id: member.commerceProfileId } });
    if (!cp || !cp.businessId) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'warning', 'member_without_linked_business', 'commerce_profile_member', member.id, member.userId, { commerceProfileId: member.commerceProfileId }));
      results.push({ category: 'commerce_profile_member', sourceId: member.id, outcome: 'ambiguous', detail: 'this CommerceProfileMember\'s profile has no linked businessId -- refusing to guess which Business they belong to' });
      continue;
    }

    const target = defaultAssignmentByBusinessId.get(cp.businessId);
    if (!target) {
      if (apply) await dataSource.transaction((m) => auditRow(m, 'error', 'business_assignment_missing_after_phase_1', 'commerce_profile_member', member.id, member.userId, { businessId: cp.businessId }));
      results.push({ category: 'commerce_profile_member', sourceId: member.id, outcome: 'unresolved', detail: 'linked Business has no resolved default assignment from phase 1' });
      continue;
    }

    const existingMembership = await membershipRepo.findOne({ where: { businessId: cp.businessId, userId: member.userId } });
    const existingAssignment = existingMembership
      ? await assignmentRepo.findOne({ where: { businessMembershipId: existingMembership.id, workspaceId: target.workspaceId } })
      : null;

    if (existingMembership && existingAssignment) {
      results.push({ category: 'commerce_profile_member', sourceId: member.id, outcome: 'already-resolved', detail: 'staff membership/assignment already exist' });
      continue;
    }

    if (!apply) {
      results.push({ category: 'commerce_profile_member', sourceId: member.id, outcome: 'resolved', detail: 'would create staff membership/assignment' });
      continue;
    }

    await dataSource.transaction(async (manager) => {
      const staffMembership = existingMembership ?? await manager.getRepository(BusinessMembership).save(
        manager.getRepository(BusinessMembership).create({
          businessId: cp.businessId!, userId: member.userId, roleTemplate: BusinessMembershipRoleTemplate.STAFF, status: BusinessMembershipStatus.ACTIVE,
        }),
      );
      if (!existingAssignment) {
        await manager.getRepository(WorkspaceAssignment).save(
          manager.getRepository(WorkspaceAssignment).create({
            businessMembershipId: staffMembership.id, workspaceId: target.workspaceId, status: WorkspaceAssignmentStatus.ACTIVE, permissions: member.permissions || {},
          }),
        );
      }
    });
    results.push({ category: 'commerce_profile_member', sourceId: member.id, outcome: 'resolved', detail: 'staff membership/assignment created' });
  }

  return results;
}

function summarize(results: RowResult[]) {
  return {
    resolvedCount: results.filter((r) => r.outcome === 'resolved' || r.outcome === 'already-resolved').length,
    ambiguousCount: results.filter((r) => r.outcome === 'ambiguous').length,
    unresolvedCount: results.filter((r) => r.outcome === 'unresolved').length,
  };
}

export async function main(argvOverride?: string[], dataSourceOverride?: DataSource): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argvOverride ?? process.argv.slice(2));
  } catch (err: any) {
    console.error('[business-first-backfill] FAILED:', err.message);
    process.exitCode = 1;
    return 1;
  }

  const dataSource = dataSourceOverride ?? buildDataSource();
  let exitCode = 0;

  try {
    if (!dataSource.isInitialized) await dataSource.initialize();
    console.log(`[business-first-backfill] connected. mode=${opts.execute ? 'EXECUTE' : 'DRY-RUN'}`);

    const identity = await dataSource.query('select current_database() as db');
    console.log(`[business-first-backfill] database identity: ${identity[0].db}`);

    // Classification ALWAYS runs first, read-only, regardless of --execute
    // -- this is what makes --expect-* a real pre-write guard rather than a
    // post-hoc check on data that's already been mutated.
    const classification = await runPhases(dataSource, false);
    const counts = summarize(classification);

    console.log('[business-first-backfill] classification:', JSON.stringify(classification, null, 2));
    console.log(`[business-first-backfill] classification summary: resolved=${counts.resolvedCount} ambiguous=${counts.ambiguousCount} unresolved=${counts.unresolvedCount}`);

    let guardFailed = false;
    if (opts.expectResolved !== undefined && opts.expectResolved !== counts.resolvedCount) {
      console.error(`[business-first-backfill] FAILED: --expect-resolved ${opts.expectResolved} does not match actual resolved count ${counts.resolvedCount} -- refusing to write on drifted data.`);
      guardFailed = true;
    }
    if (opts.expectAmbiguous !== undefined && opts.expectAmbiguous !== counts.ambiguousCount) {
      console.error(`[business-first-backfill] FAILED: --expect-ambiguous ${opts.expectAmbiguous} does not match actual ambiguous count ${counts.ambiguousCount}.`);
      guardFailed = true;
    }
    if (opts.expectUnresolved !== undefined && opts.expectUnresolved !== counts.unresolvedCount) {
      console.error(`[business-first-backfill] FAILED: --expect-unresolved ${opts.expectUnresolved} does not match actual unresolved count ${counts.unresolvedCount}.`);
      guardFailed = true;
    }

    if (guardFailed) {
      exitCode = 1;
      console.error('[business-first-backfill] Guard check failed -- no writes performed, even though --execute was requested.');
      return exitCode;
    }

    if (!opts.execute) {
      console.log('[business-first-backfill] DRY RUN complete. No writes performed.');
      return exitCode;
    }

    console.log('[business-first-backfill] guard check passed -- applying writes.');
    const applied = await runPhases(dataSource, true);
    const appliedCounts = summarize(applied);
    console.log('[business-first-backfill] applied results:', JSON.stringify(applied, null, 2));
    console.log(`[business-first-backfill] applied summary: resolved=${appliedCounts.resolvedCount} ambiguous=${appliedCounts.ambiguousCount} unresolved=${appliedCounts.unresolvedCount}`);
    console.log('[business-first-backfill] EXECUTE complete.');
    return exitCode;
  } catch (err: any) {
    exitCode = 1;
    console.error('[business-first-backfill] FAILED:', err.message);
    return exitCode;
  } finally {
    if (!dataSourceOverride && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('[business-first-backfill] DataSource closed.');
    }
    process.exitCode = exitCode;
  }
}

/* istanbul ignore next -- real CLI entrypoint; exercised via the built dist/ file, not unit tests */
if (require.main === module) {
  main();
}
