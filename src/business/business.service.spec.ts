import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BusinessService } from './business.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate } from './entities/business-membership.entity';
import { WorkspaceAssignment } from './entities/workspace-assignment.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';

/**
 * Scope note: this file currently covers only the Business-First Stage 1
 * default-workspace bootstrap added to BusinessService.create() -- not the
 * rest of BusinessService, which has no existing test coverage to preserve
 * or extend here.
 */
describe('BusinessService.create() -- Business-First Stage 1 workspace bootstrap', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_business_service_create_test';
  const ENTITIES = [Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment, AccountRole, ActiveRoleSession, User];

  let reachable = false;
  let dataSource: DataSource;
  let adminClient: Client;
  let service: BusinessService;
  let seq = 0;

  const userRepo = () => dataSource.getRepository(User);
  const workspaceRepo = () => dataSource.getRepository(OperationalWorkspace);
  const membershipRepo = () => dataSource.getRepository(BusinessMembership);
  const assignmentRepo = () => dataSource.getRepository(WorkspaceAssignment);
  const accountRoleRepo = () => dataSource.getRepository(AccountRole);

  const makeUser = async () => { const n = ++seq; return userRepo().save(userRepo().create({ email: `u${n}@bsvc-test.local`, phone: `+2559${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any)); };

  const noopCommerceProfiles = { createProfile: jest.fn().mockRejectedValue(new Error('not exercised in this test')) } as any;
  const noopActivityEvents = { record: jest.fn() } as any;
  const noopAnalytics = {} as any;
  const noopAiInsight = {} as any;
  const unusedRepo = { findOne: jest.fn(), find: jest.fn() } as any;

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }
    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    dataSource = new DataSource({ type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: TEST_DB_NAME, synchronize: true, entities: ENTITIES });
    await dataSource.initialize();

    service = new BusinessService(
      dataSource.getRepository(Business),
      unusedRepo, // sellerProfileRepo -- not touched by create()
      unusedRepo, // invoiceRepo -- not touched by create()
      unusedRepo, // productRepo -- not touched by create()
      dataSource.getRepository(OperationalWorkspace),
      dataSource.getRepository(WorkspaceAssignment),
      unusedRepo, // capabilityRepo -- not touched by create()
      dataSource.getRepository(AccountRole),
      dataSource,
      noopCommerceProfiles,
      noopActivityEvents,
      noopAnalytics,
      noopAiInsight,
    );
  }, 60000);

  beforeEach(async () => {
    if (!reachable) return;
    await dataSource.query('delete from workspace_assignment');
    await dataSource.query('delete from business_membership');
    await dataSource.query('delete from operational_workspace');
    await dataSource.query('update account_role set "workspaceAssignmentId" = null');
    await dataSource.query('delete from account_role');
    await dataSource.query('delete from business');
    await dataSource.query('delete from "user"');
    jest.clearAllMocks();
  }, 30000);

  afterAll(async () => {
    if (!reachable) return;
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (adminClient) { await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`); await adminClient.end(); }
  }, 90000);

  it('creates a default workspace, Owner membership, and explicit assignment in the same transaction as the Business', async () => {
    if (!reachable) return;
    const user = await makeUser();

    const business = await service.create(user, { legalName: 'Asha Fashion' });

    expect(business.status).toBe(BusinessStatus.ACTIVE);
    const workspace = await workspaceRepo().findOne({ where: { businessId: business.id, isDefault: true } });
    expect(workspace?.name).toBe('Default Operations');
    const membership = await membershipRepo().findOne({ where: { businessId: business.id, userId: user.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER } });
    expect(membership).toBeTruthy();
    const assignment = await assignmentRepo().findOne({ where: { businessMembershipId: membership!.id, workspaceId: workspace!.id } });
    expect(assignment).toBeTruthy();
  });

  // Business Capability Activation Stage B1 (§2/§3/§19 of the mission):
  // BusinessService.create() previously also auto-bound an existing
  // ACTIVE, unbound Seller AccountRole to the new Business's workspace --
  // silently converting a legacy/personal Seller into that Business's
  // organizational Commerce operator with no application, no review, and
  // no BusinessCapability. Removed: under Stage A's own live enforcement
  // this had become a real regression risk (the newly-bound role would
  // immediately fail every request with ROLE_CONTEXT_CAPABILITY_INACTIVE,
  // since the new workspace never has a COMMERCE capability). Business
  // creation is now identity/bootstrap only -- see §3's own two tests
  // below.
  it('a User with an ACTIVE legacy unbound Seller role creates a Business — the legacy Seller stays unbound, untouched, and the new Business gets no Seller AccountRole, capability, or application', async () => {
    if (!reachable) return;
    const user = await makeUser();
    const sellerRole = await accountRoleRepo().save(accountRoleRepo().create({
      userId: user.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: user.id, capabilities: {},
    } as any));

    const business = await service.create(user, { legalName: 'Asha Fashion' });

    const reloadedRole = await accountRoleRepo().findOne({ where: { id: sellerRole.id } });
    expect(reloadedRole?.workspaceAssignmentId).toBeNull(); // still unbound, untouched

    const workspace = await workspaceRepo().findOne({ where: { businessId: business.id, isDefault: true } });
    const membership = await membershipRepo().findOne({ where: { businessId: business.id, userId: user.id } });
    const assignment = await assignmentRepo().findOne({ where: { businessMembershipId: membership!.id, workspaceId: workspace!.id } });
    expect(await accountRoleRepo().count({ where: { workspaceAssignmentId: assignment!.id } })).toBe(0); // no Seller role bound to the new Business at all
    expect(await accountRoleRepo().count({ where: { userId: user.id, roleType: AccountRoleType.SELLER } })).toBe(1); // no new role fabricated either
  });

  it('leaves workspaceAssignmentId unset when the owner has no active Seller AccountRole yet', async () => {
    if (!reachable) return;
    const user = await makeUser();

    await service.create(user, { legalName: 'Asha Fashion' });

    expect(await accountRoleRepo().count()).toBe(0);
  });

  // Multi-Business Authority Stage 1: the "You already have a Business"
  // guard is removed -- Business.user was never schema-constrained to one
  // row per user, and BusinessMembership/WorkspaceAssignment already
  // correctly support one user holding independent membership in many
  // Businesses. See the architecture discovery report's own findings.
  it('now ALLOWS a second Business for the same user, each with its own bootstrap rows', async () => {
    if (!reachable) return;
    const user = await makeUser();
    const first = await service.create(user, { legalName: 'First Co' });
    const second = await service.create(user, { legalName: 'Second Co' });

    expect(second.id).not.toBe(first.id);
    const all = await service.findAllMine(user.id);
    expect(all.map((b) => b.id).sort()).toEqual([first.id, second.id].sort());
    expect(await workspaceRepo().count()).toBe(2);
    expect(await membershipRepo().count()).toBe(2);
    expect(await assignmentRepo().count()).toBe(2);
  });

  it('a User whose Seller role is already bound to Business A creates Business B — Business A\'s role is untouched, and Business B gets no Seller role', async () => {
    if (!reachable) return;
    const user = await makeUser();
    const sellerRole = await accountRoleRepo().save(accountRoleRepo().create({
      userId: user.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: user.id, capabilities: {},
    } as any));

    const first = await service.create(user, { legalName: 'First Co' });
    const firstWorkspace = await workspaceRepo().findOne({ where: { businessId: first.id, isDefault: true } });
    const firstMembership = await membershipRepo().findOne({ where: { businessId: first.id, userId: user.id } });
    const firstAssignment = await assignmentRepo().findOne({ where: { businessMembershipId: firstMembership!.id, workspaceId: firstWorkspace!.id } });
    // Bind it to Business A directly -- create() no longer does this itself;
    // this simulates the outcome of a future, independently-authorized
    // approval flow having already bound it.
    await accountRoleRepo().update(sellerRole.id, { workspaceAssignmentId: firstAssignment!.id });

    const second = await service.create(user, { legalName: 'Second Co' });
    const secondWorkspace = await workspaceRepo().findOne({ where: { businessId: second.id, isDefault: true } });
    const secondMembership = await membershipRepo().findOne({ where: { businessId: second.id, userId: user.id } });
    const secondAssignment = await assignmentRepo().findOne({ where: { businessMembershipId: secondMembership!.id, workspaceId: secondWorkspace!.id } });

    const reloaded = await accountRoleRepo().findOne({ where: { id: sellerRole.id } });
    expect(reloaded?.workspaceAssignmentId).toBe(firstAssignment!.id); // unchanged, still Business A
    expect(reloaded?.workspaceAssignmentId).not.toBe(secondAssignment!.id);
    expect(await accountRoleRepo().count({ where: { userId: user.id, roleType: AccountRoleType.SELLER } })).toBe(1); // no new Seller role fabricated for Business B
  });
});
