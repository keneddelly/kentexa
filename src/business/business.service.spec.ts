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

  it('binds an already-active Seller AccountRole to the new assignment at creation time', async () => {
    if (!reachable) return;
    const user = await makeUser();
    const sellerRole = await accountRoleRepo().save(accountRoleRepo().create({
      userId: user.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: user.id, capabilities: {},
    } as any));

    const business = await service.create(user, { legalName: 'Asha Fashion' });

    const workspace = await workspaceRepo().findOne({ where: { businessId: business.id, isDefault: true } });
    const membership = await membershipRepo().findOne({ where: { businessId: business.id, userId: user.id } });
    const assignment = await assignmentRepo().findOne({ where: { businessMembershipId: membership!.id, workspaceId: workspace!.id } });

    const reloadedRole = await accountRoleRepo().findOne({ where: { id: sellerRole.id } });
    expect(reloadedRole?.workspaceAssignmentId).toBe(assignment!.id);
  });

  it('leaves workspaceAssignmentId unset when the owner has no active Seller AccountRole yet', async () => {
    if (!reachable) return;
    const user = await makeUser();

    await service.create(user, { legalName: 'Asha Fashion' });

    expect(await accountRoleRepo().count()).toBe(0);
  });

  it('refuses a second Business for the same user (unchanged pre-existing behavior)', async () => {
    if (!reachable) return;
    const user = await makeUser();
    await service.create(user, { legalName: 'First Co' });

    await expect(service.create(user, { legalName: 'Second Co' })).rejects.toThrow('You already have a Business');
    expect(await workspaceRepo().count()).toBe(1);
  });
});
