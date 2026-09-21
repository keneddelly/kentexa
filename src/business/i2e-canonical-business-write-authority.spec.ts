import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from './b5b-closure-test-db';
import { BusinessService } from './business.service';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { User } from '../users/entities/user.entity';

/**
 * I2E — Business write authority, real disposable schema in the shared
 * kentexa_b5b_test database. ACTING BUSINESS = AUTHORIZED BUSINESS =
 * MUTATED BUSINESS, proved against the real mutation surfaces
 * (PATCH /business/:id, activate-seller, capability apply's workspaceId).
 */
describe('I2E — canonical Business write authority, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let business: BusinessService;
  let applications: BusinessCapabilityApplicationService;
  let seq = 0;

  const repo = (e: any) => ds.getRepository(e) as any;

  const makeUser = (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2e.local`, phone: `+2554${String(n).padStart(8, '0')}`, password: 'x', name }));
  };

  const makeBusiness = async (owner: User, tradingName: string) => {
    const b = await repo(Business).save(repo(Business).create({ legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: b.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: b.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    return { business: b, workspace, membership, assignment };
  };

  const bizCtx = (businessId: number) => ({ identityType: 'BUSINESS', businessId }) as any;
  const personalCtx = () => ({ identityType: 'PERSONAL', businessId: null }) as any;
  const name = async (id: number) => (await repo(Business).findOne({ where: { id } })).tradingName;

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);
    ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user,
      password: config.password, database: config.database, synchronize: false, entities: [...B5B_ALL_ENTITIES],
    });
    await ds.initialize();
    business = new BusinessService(
      repo(Business), repo(SellerProfile), {} as any, {} as any, repo(OperationalWorkspace), repo(WorkspaceAssignment),
      repo(BusinessCapability), repo(AccountRole), ds,
      { findByBusinessId: jest.fn().mockResolvedValue(null), updatePublicFields: jest.fn() } as any,
      { record: jest.fn() } as any, {} as any, {} as any,
    );
    applications = new BusinessCapabilityApplicationService(
      repo(BusinessCapabilityApplication), repo(BusinessCapability), ds,
      { requireFeature: jest.fn() } as any, { resolveAgentLocation: jest.fn() } as any,
    );
  }, 60000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));

  it('A. acting as Washing Machine TZ can update Washing Machine TZ', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    await business.update(wm.business.id, bob, { tradingName: 'Washing Machine TZ Ltd' }, bizCtx(wm.business.id));
    expect(await name(wm.business.id)).toBe('Washing Machine TZ Ltd');
  });

  it('B. acting as Washing Machine TZ cannot update Bob Electronics even though Bob owns both', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const el = await makeBusiness(bob, 'Bob Electronics');
    await expect(business.update(el.business.id, bob, { tradingName: 'HACKED' }, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_WRITE_CONTEXT_MISMATCH' } });
    expect(await name(el.business.id)).toBe('Bob Electronics');
    expect(await name(wm.business.id)).toBe('Washing Machine TZ');
  });

  it('C. a tampered body businessId cannot redirect the write; it fails explicitly and nothing changes', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const el = await makeBusiness(bob, 'Bob Electronics');
    await expect(business.update(wm.business.id, bob, { tradingName: 'X', businessId: el.business.id }, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_WRITE_IDENTITY_MISMATCH' } });
    await expect(business.update(wm.business.id, bob, { tradingName: 'X', businessId: el.business.id }, personalCtx()))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_WRITE_IDENTITY_MISMATCH' } });
    expect(await name(wm.business.id)).toBe('Washing Machine TZ');
    expect(await name(el.business.id)).toBe('Bob Electronics');
  });

  it('D. a workspace of Bob Electronics cannot be used in a Washing Machine TZ capability mutation', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const el = await makeBusiness(bob, 'Bob Electronics');
    await expect(applications.applyForCapability(
      wm.business.id, 'super_agent', bob, { workspaceId: el.workspace.id, applicationData: { city: 'Dar es Salaam' } }, bizCtx(wm.business.id),
    )).rejects.toBeDefined();
    expect(await repo(BusinessCapabilityApplication).count()).toBe(0);
    expect(await repo(SuperAgent).count()).toBe(0);
    expect(await repo(AccountRole).count({ where: { workspaceAssignmentId: el.assignment.id } })).toBe(0);
  });

  it('E+F. a Personal context writes only to the exact explicitly named owned Business — never the first/oldest', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const first = await makeBusiness(bob, 'Washing Machine TZ');
    const second = await makeBusiness(bob, 'Bob Electronics');
    await business.update(second.business.id, bob, { tradingName: 'Bob Electronics 2' }, personalCtx());
    expect(await name(second.business.id)).toBe('Bob Electronics 2');
    expect(await name(first.business.id)).toBe('Washing Machine TZ');
    // No context at all (legacy callers) behaves like Personal: exact id + owner check.
    await business.update(first.business.id, bob, { tradingName: 'WM 2' });
    expect(await name(first.business.id)).toBe('WM 2');
  });

  it('G+H. a non-owner (even holding a legacy unbound Seller role) cannot mutate a Business; role/profile ids are not authority', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const stranger = await makeUser('Stranger');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const legacy = await repo(SellerProfile).save(repo(SellerProfile).create({ user: stranger, businessId: null, businessName: 's', status: 'approved' }));
    await repo(AccountRole).save(repo(AccountRole).create({
      userId: stranger.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: legacy.id, workspaceAssignmentId: null, capabilities: {}, contextVersion: 1,
    }));
    await expect(business.update(wm.business.id, stranger, { tradingName: 'HACKED' }, personalCtx())).rejects.toBeInstanceOf(NotFoundException);
    // Own BUSINESS context for a different Business still cannot name Bob's.
    const other = await makeBusiness(stranger, 'Stranger Co');
    await expect(business.update(wm.business.id, stranger, { tradingName: 'HACKED' }, bizCtx(other.business.id)))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_WRITE_CONTEXT_MISMATCH' } });
    expect(await name(wm.business.id)).toBe('Washing Machine TZ');
  });

  it('only documented profile fields are writable: trust/identity columns in the body are never persisted', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const before = await repo(Business).findOne({ where: { id: wm.business.id } });
    await business.update(wm.business.id, bob, {
      tradingName: 'Renamed', status: 'suspended', businessVerificationStatus: 'verified', legalName: 'New Legal',
    } as any, bizCtx(wm.business.id));
    const after = await repo(Business).findOne({ where: { id: wm.business.id } });
    expect(after.tradingName).toBe('Renamed');
    expect(after.legalName).toBe('New Legal');
    expect(after.status).toBe(before.status);
    expect(after.businessVerificationStatus).toBe(before.businessVerificationStatus);
  });

  it('legacy activate-seller: a BUSINESS context can only target its own Business and nothing is created on mismatch', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const el = await makeBusiness(bob, 'Bob Electronics');
    await expect(business.activateSeller(el.business.id, bob, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_WRITE_CONTEXT_MISMATCH' } });
    expect(await repo(SellerProfile).count({ where: { businessId: el.business.id } })).toBe(0);
  });
});
