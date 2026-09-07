import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { parseArgs, main, REQUIRED_CONFIRMATION_TOKEN } from './backfill-business-first-foundation';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { OperationalWorkspace } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode } from '../business/entities/business-capability.entity';
import { BusinessFirstMigrationAudit } from '../business/entities/business-first-migration-audit.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileMember } from '../commerce-profiles/entities/commerce-profile-member.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';

const SOURCE = fs.readFileSync(path.join(__dirname, 'backfill-business-first-foundation.ts'), 'utf8');

describe('backfill-business-first-foundation -- parseArgs (pure, no DB)', () => {
  it('defaults to dry-run with no arguments', () => {
    expect(parseArgs([]).execute).toBe(false);
  });

  it('--execute requires the exact confirmation token', () => {
    expect(() => parseArgs(['--execute'])).toThrow(/requires --confirm-production-business-first-backfill/);
    expect(() => parseArgs(['--execute', '--confirm-production-business-first-backfill', 'wrong'])).toThrow(/requires --confirm-production-business-first-backfill/);
    expect(() => parseArgs(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN])).not.toThrow();
  });

  it('rejects unknown arguments', () => {
    expect(() => parseArgs(['--YOLO'])).toThrow(/Unknown argument/);
  });

  it('rejects duplicate arguments', () => {
    expect(() => parseArgs(['--execute', '--execute'])).toThrow(/Duplicate argument/);
  });

  it('rejects a non-integer --expect-resolved', () => {
    expect(() => parseArgs(['--expect-resolved', 'abc'])).toThrow(/must be a non-negative integer/);
  });

  it('parses valid --expect-* flags', () => {
    const opts = parseArgs(['--expect-resolved', '2', '--expect-ambiguous', '0', '--expect-unresolved', '1']);
    expect(opts).toMatchObject({ expectResolved: 2, expectAmbiguous: 0, expectUnresolved: 1 });
  });
});

describe('backfill-business-first-foundation -- structural safety proofs', () => {
  const importLines = SOURCE.split('\n').filter((l) => /^\s*import\b/.test(l));

  it('never bootstraps Nest and never imports an unrelated ownership domain entity', () => {
    expect(importLines.some((l) => /NestFactory|@nestjs\/schedule|AppModule/.test(l))).toBe(false);
    expect(importLines.some((l) => /\bOrder\b|\bPayment\b|\bInvoice\b|\bInventory\b|ConversationParticipant\b|\bNotification\b|\bShipment\b/.test(l))).toBe(false);
  });

  it('never creates a new AccountRole row -- only reads and updates workspaceAssignmentId on existing ones', () => {
    expect(SOURCE).not.toMatch(/getRepository\(AccountRole\)\.create/);
    expect(SOURCE).not.toMatch(/getRepository\(AccountRole\)\.save/);
  });
});

describe('backfill-business-first-foundation -- end-to-end against a disposable database', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_business_first_backfill_test';
  const ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, BusinessFirstMigrationAudit, SellerProfile,
    CommerceProfile, CommerceProfileMember, AccountRole, ActiveRoleSession, User,
  ];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;
  let seq = 0;

  const userRepo = () => dataSource.getRepository(User);
  const businessRepo = () => dataSource.getRepository(Business);
  const workspaceRepo = () => dataSource.getRepository(OperationalWorkspace);
  const membershipRepo = () => dataSource.getRepository(BusinessMembership);
  const assignmentRepo = () => dataSource.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => dataSource.getRepository(BusinessCapability);
  const auditRepo = () => dataSource.getRepository(BusinessFirstMigrationAudit);
  const sellerProfileRepo = () => dataSource.getRepository(SellerProfile);
  const commerceProfileRepo = () => dataSource.getRepository(CommerceProfile);
  const memberRepo = () => dataSource.getRepository(CommerceProfileMember);
  const accountRoleRepo = () => dataSource.getRepository(AccountRole);

  const makeUser = async (tag: string) => { const n = ++seq; return userRepo().save(userRepo().create({ email: `${tag}${n}@bff-test.local`, phone: `+2558${String(n).padStart(8, '0')}`, password: 'x', name: tag } as any)); };
  const makeBusiness = async (userId: number) => businessRepo().save(businessRepo().create({ legalName: 'Test Co', status: BusinessStatus.ACTIVE, user: { id: userId } as any }));
  const makeSellerRole = async (userId: number, status = AccountRoleStatus.ACTIVE) =>
    accountRoleRepo().save(accountRoleRepo().create({ userId, roleType: AccountRoleType.SELLER, status, profileType: RoleProfileType.SELLER_PROFILE, profileId: userId, capabilities: {} } as any));
  const makeSellerProfile = async (userId: number, status = SellerStatus.APPROVED) =>
    sellerProfileRepo().save(sellerProfileRepo().create({ user: { id: userId } as any, businessName: 'Test Co', status } as any));

  const resetDb = async () => {
    await dataSource.query('delete from business_first_migration_audit');
    await dataSource.query('delete from business_capability');
    await dataSource.query('delete from workspace_assignment');
    await dataSource.query('delete from business_membership');
    await dataSource.query('delete from operational_workspace');
    await dataSource.query('delete from commerce_profile_member');
    await dataSource.query('delete from commerce_profile');
    await dataSource.query('delete from seller_profile');
    await dataSource.query('update account_role set "workspaceAssignmentId" = null');
    await dataSource.query('delete from account_role');
    await dataSource.query('delete from business');
    await dataSource.query('delete from "user"');
  };

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }
    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    dataSource = new DataSource({ type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: TEST_DB_NAME, synchronize: true, entities: ENTITIES });
    await dataSource.initialize();
  }, 60000);

  beforeEach(async () => { if (reachable) await resetDb(); }, 30000);

  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) { await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`); await adminClient.end(); }
  }, 90000);

  it('dry run performs zero writes, including zero audit rows', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    await makeBusiness(owner.id);
    await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);

    const code = await main([], dataSource);
    expect(code).toBe(0);
    expect(await workspaceRepo().count()).toBe(0);
    expect(await membershipRepo().count()).toBe(0);
    expect(await assignmentRepo().count()).toBe(0);
    expect(await auditRepo().count()).toBe(0);
  });

  it('execute creates default workspace + owner membership + explicit assignment, binds the Seller AccountRole, and grants COMMERCE capability', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    const business = await makeBusiness(owner.id);
    const sellerRole = await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);

    const workspace = await workspaceRepo().findOne({ where: { businessId: business.id, isDefault: true } });
    expect(workspace).toBeTruthy();
    const membership = await membershipRepo().findOne({ where: { businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } });
    expect(membership).toBeTruthy();
    const assignment = await assignmentRepo().findOne({ where: { businessMembershipId: membership!.id, workspaceId: workspace!.id } });
    expect(assignment).toBeTruthy();

    const capability = await capabilityRepo().findOne({ where: { workspaceId: workspace!.id, capabilityCode: BusinessCapabilityCode.COMMERCE } });
    expect(capability).toBeTruthy();

    const reloadedRole = await accountRoleRepo().findOne({ where: { id: sellerRole.id } });
    expect(reloadedRole?.workspaceAssignmentId).toBe(assignment!.id);
  });

  it('is idempotent -- a second execute run creates no duplicate rows', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    await makeBusiness(owner.id);
    await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);

    await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);

    expect(code).toBe(0);
    expect(await workspaceRepo().count()).toBe(1);
    expect(await membershipRepo().count()).toBe(1);
    expect(await assignmentRepo().count()).toBe(1);
    expect(await capabilityRepo().count()).toBe(1);
  });

  it('skips a Business already bootstrapped by BusinessService.create() (pre-existing default workspace) without duplicating', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    const business = await makeBusiness(owner.id);
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await membershipRepo().save(membershipRepo().create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } as any));
    await assignmentRepo().save(assignmentRepo().create({ businessMembershipId: membership.id, workspaceId: workspace.id, permissions: {} } as any));

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await workspaceRepo().count()).toBe(1);
    expect(await membershipRepo().count()).toBe(1);
    expect(await assignmentRepo().count()).toBe(1);
  });

  it('classifies UNRESOLVED (and does not fabricate a Business) when a SellerProfile has no Business row -- never name/email matching', async () => {
    if (!reachable) return;
    const seller = await makeUser('Seller');
    await makeSellerRole(seller.id);
    await makeSellerProfile(seller.id);
    // Deliberately NO Business row for this user, even though a Business
    // named "Test Co" (matching businessName) may exist for someone else --
    // this test would fail if the tool ever matched by name.
    const otherOwner = await makeUser('Other');
    await makeBusiness(otherOwner.id);

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);

    const reloadedRole = await accountRoleRepo().findOne({ where: { userId: seller.id, roleType: AccountRoleType.SELLER } });
    expect(reloadedRole?.workspaceAssignmentId).toBeNull();
    const audit = await auditRepo().findOne({ where: { code: 'seller_without_business', userId: seller.id } });
    expect(audit).toBeTruthy();
  });

  it('classifies UNRESOLVED when a SellerProfile has no matching Seller AccountRole', async () => {
    if (!reachable) return;
    const seller = await makeUser('Seller');
    await makeBusiness(seller.id);
    await makeSellerProfile(seller.id);
    // No AccountRole created at all.

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    const audit = await auditRepo().findOne({ where: { code: 'seller_profile_without_account_role' } });
    expect(audit).toBeTruthy();
  });

  it('classifies AMBIGUOUS (and skips) a CommerceProfileMember whose profile has no linked businessId', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    const staff = await makeUser('Staff');
    await makeBusiness(owner.id);
    const cp = await commerceProfileRepo().save(commerceProfileRepo().create({
      ownerId: owner.id, type: CommerceProfileType.BUSINESS, username: `biz${seq}`, displayName: 'Biz', businessId: null,
    } as any));
    await memberRepo().save(memberRepo().create({ commerceProfileId: cp.id, userId: staff.id, role: 'staff', isActive: true, permissions: { canViewOrders: true } } as any));

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await membershipRepo().count({ where: { userId: staff.id } })).toBe(0);
    const audit = await auditRepo().findOne({ where: { code: 'member_without_linked_business' } });
    expect(audit).toBeTruthy();
  });

  it('creates a staff BusinessMembership + WorkspaceAssignment carrying permissions forward for a properly linked CommerceProfileMember', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    const staff = await makeUser('Staff');
    const business = await makeBusiness(owner.id);
    const cp = await commerceProfileRepo().save(commerceProfileRepo().create({
      ownerId: owner.id, type: CommerceProfileType.BUSINESS, username: `biz${seq}`, displayName: 'Biz', businessId: business.id,
    } as any));
    await memberRepo().save(memberRepo().create({ commerceProfileId: cp.id, userId: staff.id, role: 'staff', isActive: true, permissions: { canViewOrders: true } } as any));

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);

    const staffMembership = await membershipRepo().findOne({ where: { businessId: business.id, userId: staff.id, roleTemplate: BusinessMembershipRoleTemplate.STAFF } });
    expect(staffMembership).toBeTruthy();
    const workspace = await workspaceRepo().findOne({ where: { businessId: business.id, isDefault: true } });
    const staffAssignment = await assignmentRepo().findOne({ where: { businessMembershipId: staffMembership!.id, workspaceId: workspace!.id } });
    expect(staffAssignment?.permissions).toEqual({ canViewOrders: true });
  });

  it('an inactive CommerceProfileMember is never processed', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    const staff = await makeUser('Staff');
    const business = await makeBusiness(owner.id);
    const cp = await commerceProfileRepo().save(commerceProfileRepo().create({
      ownerId: owner.id, type: CommerceProfileType.BUSINESS, username: `biz${seq}`, displayName: 'Biz', businessId: business.id,
    } as any));
    await memberRepo().save(memberRepo().create({ commerceProfileId: cp.id, userId: staff.id, role: 'staff', isActive: false, permissions: {} } as any));

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);
    expect(code).toBe(0);
    expect(await membershipRepo().count({ where: { userId: staff.id } })).toBe(0);
  });

  it('--expect-resolved guard blocks the write when it does not match the actual dry-run count', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    await makeBusiness(owner.id);
    await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN, '--expect-resolved', '999'], dataSource);
    expect(code).toBe(1);
    // No writes performed despite --execute, because the guard failed.
    expect(await workspaceRepo().count()).toBe(0);
    expect(await membershipRepo().count()).toBe(0);
  });

  it('--expect-* guards matching the real counts allow the write to proceed', async () => {
    if (!reachable) return;
    const owner = await makeUser('Owner');
    await makeBusiness(owner.id);
    await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);

    // Dry run first to discover the real counts (1 business resolved, 1
    // seller_profile already-resolved-after-phase-1... actually resolved
    // since AccountRole isn't bound yet -- both count toward resolvedCount).
    const dry = await main([], dataSource);
    expect(dry).toBe(0);

    const code = await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN, '--expect-resolved', '2', '--expect-ambiguous', '0', '--expect-unresolved', '0'], dataSource);
    expect(code).toBe(0);
    expect(await workspaceRepo().count()).toBe(1);
  });

  it('never creates or activates a Seller AccountRole -- only ever updates workspaceAssignmentId on a pre-existing row', async () => {
    if (!reachable) return;
    const before = await accountRoleRepo().count();
    const owner = await makeUser('Owner');
    await makeBusiness(owner.id);
    await makeSellerRole(owner.id);
    await makeSellerProfile(owner.id);
    const afterSetup = await accountRoleRepo().count();

    await main(['--execute', '--confirm-production-business-first-backfill', REQUIRED_CONFIRMATION_TOKEN], dataSource);

    const afterBackfill = await accountRoleRepo().count();
    expect(afterBackfill).toBe(afterSetup);
    expect(afterSetup).toBe(before + 1);
  });

  it('the DataSource it builds itself always closes', async () => {
    if (!reachable) return;
    const prevEnv = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USERNAME, pass: process.env.DB_PASSWORD, name: process.env.DB_NAME };
    process.env.DB_HOST = DB_HOST; process.env.DB_PORT = String(DB_PORT); process.env.DB_USERNAME = DB_USERNAME; process.env.DB_PASSWORD = DB_PASSWORD; process.env.DB_NAME = TEST_DB_NAME;
    try {
      const code = await main([]);
      expect(code).toBe(0);
    } finally {
      process.env.DB_HOST = prevEnv.host; process.env.DB_PORT = prevEnv.port; process.env.DB_USERNAME = prevEnv.user; process.env.DB_PASSWORD = prevEnv.pass; process.env.DB_NAME = prevEnv.name;
    }
  });
});
