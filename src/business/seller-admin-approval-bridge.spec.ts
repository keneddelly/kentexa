import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from './b5b-closure-test-db';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { BusinessService } from './business.service';
import { SellerApprovalBridgeService } from '../seller/seller-approval-bridge.service';
import { RoleContextService } from '../role-context/role-context.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication, BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { User } from '../users/entities/user.entity';

const CARDINALITY = 'BUSINESS_PROFILE_CARDINALITY_INVALID';

/**
 * Admin Seller Approve/Reject compatibility bridge -> canonical BusinessCapabilityApplication engine, real disposable Postgres.
 */
describe('Seller admin approval bridge (Business Selling), real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let apps: BusinessCapabilityApplicationService;
  let roles: RoleContextService;
  let bridge: SellerApprovalBridgeService;
  const legacySeller: any = { approve: jest.fn(), reject: jest.fn() };
  let seq = 0;

  const repo = (e: any) => ds.getRepository(e) as any;
  const personalCtx = () => ({ identityType: 'PERSONAL', businessId: null }) as any;
  const bizCtx = (businessId: number) => ({ identityType: 'BUSINESS', businessId }) as any;

  const makeUser = (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@sinv.local`, phone: `+2556${String(n).padStart(8, '0')}`, password: 'x', name }));
  };

  const makeBusiness = async (owner: User, tradingName: string, profiles = 1) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    const rows: CommerceProfile[] = [];
    for (let i = 0; i < profiles; i++) rows.push(await addCanonicalProfile(owner, business.id, tradingName));
    return { business, workspace, membership, assignment, profile: rows[0] };
  };

  const addCanonicalProfile = (owner: User, businessId: number, displayName: string) =>
    repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: owner.id, type: CommerceProfileType.BUSINESS, displayName, username: `sb${++seq}`, businessId }));

  const sellerRolesFor = (userId: number) => repo(AccountRole).find({ where: { userId, roleType: AccountRoleType.SELLER } });
  const applicationCount = (businessId: number) => repo(BusinessCapabilityApplication).count({ where: { businessId } });

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
    apps = new BusinessCapabilityApplicationService(
      repo(BusinessCapabilityApplication), repo(BusinessCapability), ds,
      { requireFeature: jest.fn() } as any, { resolveAgentLocation: jest.fn() } as any,
    );
    bridge = new SellerApprovalBridgeService(repo(SellerProfile), repo(BusinessCapabilityApplication), legacySeller, apps);
    roles = new RoleContextService(
      repo(User), repo(AccountRole), repo(ActiveRoleSession), repo(SellerProfile),
      {} as any, {} as any, {} as any, repo(WorkspaceAssignment), { emitRevoked: jest.fn() } as any,
    );
  }, 60000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));
  beforeEach(() => { legacySeller.approve.mockReset(); legacySeller.reject.mockReset(); });

  const sellerOf = (businessId: number) => repo(SellerProfile).findOne({ where: { businessId } });
  const capOf = (workspaceId: number) => repo(BusinessCapability).find({ where: { workspaceId } });
  const appOf = (id: number) => repo(BusinessCapabilityApplication).findOne({ where: { id } });
  const roleOf = (id: number) => repo(AccountRole).findOne({ where: { id } });
  const pendingSelling = async (owner: User, biz: { business: Business }) => {
    const res = await apps.connectSelling(biz.business.id, owner, {}, personalCtx());
    return { app: res.application, role: res.accountRole, seller: await sellerOf(biz.business.id) };
  };

  it('A+B. pending Business Selling → Seller Approve → canonical approval; no capability needed beforehand', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const { app, role, seller } = await pendingSelling(bob, wm);
    expect(await capOf(wm.workspace.id)).toHaveLength(0);
    expect(seller.status).toBe(SellerStatus.PENDING);

    await bridge.approve(seller.id, admin);

    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.APPROVED);
    expect((await capOf(wm.workspace.id)).map((c: any) => c.status)).toEqual([BusinessCapabilityStatus.ACTIVE]);
    expect((await sellerOf(wm.business.id)).status).toBe(SellerStatus.APPROVED);
    const active = await roleOf(role.id);
    expect(active.status).toBe(AccountRoleStatus.ACTIVE);
    expect(await roles.isSwitchable(active)).toBe(true);
    expect((await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === role.id)).toMatchObject({ identityType: 'BUSINESS', businessId: wm.business.id, commerceProfileId: wm.profile.id });
    expect(legacySeller.approve).not.toHaveBeenCalled();
  });

  it('C. the Business identity invariant is enforced during delegated approval; nothing is written', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Broken Later');
    const { app, role, seller } = await pendingSelling(bob, biz);
    await addCanonicalProfile(bob, biz.business.id, 'second');
    await expect(bridge.approve(seller.id, admin, 'verified_business')).rejects.toMatchObject({ response: { code: CARDINALITY } });
    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.PENDING);
    expect(await capOf(biz.workspace.id)).toHaveLength(0);
    const after = await sellerOf(biz.business.id);
    expect(after.status).toBe(SellerStatus.PENDING);
    expect(after.verificationTier).toBe('registered'); // tier is atomic with the approval
    expect((await roleOf(role.id)).status).toBe(AccountRoleStatus.PENDING);
  });

  it('D. a genuinely legacy/unbound Personal Seller keeps the legacy lifecycle, untouched', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const personal = await repo(SellerProfile).save(repo(SellerProfile).create({ user: bob, businessId: null, businessName: 'Bob', sellerType: 'individual', status: SellerStatus.PENDING }));
    const engine = jest.spyOn(apps, 'approveApplication');
    const engineReject = jest.spyOn(apps, 'rejectApplication');
    legacySeller.approve.mockResolvedValue({ id: personal.id });
    legacySeller.reject.mockResolvedValue({ id: personal.id });
    await bridge.approve(personal.id, admin, 'verified_seller');
    await bridge.reject(personal.id, admin, 'nope');
    expect(legacySeller.approve).toHaveBeenCalledWith(personal.id, 'verified_seller');
    expect(legacySeller.reject).toHaveBeenCalledWith(personal.id, 'nope');
    expect(engine).not.toHaveBeenCalled();
    expect(engineReject).not.toHaveBeenCalled();
    engine.mockRestore(); engineReject.mockRestore();
  });

  it('E. Business-linked SellerProfile with no canonical application fails closed (approve and reject), no writes, no legacy fall-through', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Orphan');
    const orphan = await repo(SellerProfile).save(repo(SellerProfile).create({ user: bob, businessId: biz.business.id, businessName: 'Orphan', sellerType: 'business', status: SellerStatus.PENDING }));
    await expect(bridge.approve(orphan.id, admin)).rejects.toMatchObject({ response: { code: 'BUSINESS_SELLING_APPLICATION_REQUIRED' } });
    await expect(bridge.reject(orphan.id, admin, 'no application')).rejects.toMatchObject({ response: { code: 'BUSINESS_SELLING_APPLICATION_REQUIRED' } });
    expect(legacySeller.approve).not.toHaveBeenCalled();
    expect(legacySeller.reject).not.toHaveBeenCalled();
    expect((await repo(SellerProfile).findOne({ where: { id: orphan.id } })).status).toBe(SellerStatus.PENDING);
    expect(await capOf(biz.workspace.id)).toHaveLength(0);
    await expect(bridge.approve(987654, admin)).rejects.toThrow('Seller profile not found');
  });

  it('E2. more than one candidate canonical application fails explicitly instead of choosing one', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Ambiguous');
    const { app, seller } = await pendingSelling(bob, biz);
    await repo(BusinessCapabilityApplication).save(repo(BusinessCapabilityApplication).create({
      businessId: biz.business.id, workspaceId: biz.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE,
      status: BusinessCapabilityApplicationStatus.CANCELLED, operationalProfileType: RoleProfileType.SELLER_PROFILE, operationalProfileId: seller.id,
      requestedByUserId: bob.id, requestedByWorkspaceAssignmentId: biz.assignment.id,
    }));
    await expect(bridge.approve(seller.id, admin)).rejects.toMatchObject({ response: { code: 'BUSINESS_SELLING_APPLICATION_AMBIGUOUS' } });
    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.PENDING);
  });

  it('F. exact linkage: same owner, two Businesses — approving B SellerProfile never touches A application', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const a = await makeBusiness(bob, 'Biz A'); const b = await makeBusiness(bob, 'Biz B');
    const pa = await pendingSelling(bob, a); const pb = await pendingSelling(bob, b);
    await bridge.approve(pb.seller.id, admin);
    expect((await appOf(pb.app.id)).status).toBe(BusinessCapabilityApplicationStatus.APPROVED);
    expect((await appOf(pa.app.id)).status).toBe(BusinessCapabilityApplicationStatus.PENDING);
    expect(await capOf(a.workspace.id)).toHaveLength(0);
    expect((await roleOf(pa.role.id)).status).toBe(AccountRoleStatus.PENDING);
    expect((await sellerOf(a.business.id)).status).toBe(SellerStatus.PENDING);
  });

  it('G. Seller Reject on a pending Business application → canonical rejection; role never usable', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Rejected Co');
    const { app, role, seller } = await pendingSelling(bob, biz);
    await expect(bridge.reject(seller.id, admin, 'x')).rejects.toMatchObject({ response: { code: 'REJECTION_REASON_REQUIRED' } });
    await bridge.reject(seller.id, admin, 'documents unclear');
    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.REJECTED);
    expect((await sellerOf(biz.business.id)).status).toBe(SellerStatus.REJECTED);
    const rejected = await roleOf(role.id);
    expect(rejected.status).toBe(AccountRoleStatus.REJECTED);
    expect(await roles.isSwitchable(rejected)).toBe(false);
    expect(await capOf(biz.workspace.id)).toHaveLength(0);
    expect(legacySeller.reject).not.toHaveBeenCalled();
    // terminal: approve after reject gets the engine's explicit conflict, never the legacy lifecycle
    await expect(bridge.approve(seller.id, admin)).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_REJECTED' } });
    await expect(bridge.reject(seller.id, admin, 'documents unclear')).resolves.toBeDefined(); // idempotent
    expect(legacySeller.approve).not.toHaveBeenCalled();
  });

  it('H. terminal APPROVED: approve idempotent, reject refused; a pending role only becomes active through canonical approval', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Approved Co');
    const { app, role, seller } = await pendingSelling(bob, biz);
    await expect(bridge.reject(seller.id, admin, 'x')).rejects.toBeDefined(); // failed attempt
    expect((await roleOf(role.id)).status).toBe(AccountRoleStatus.PENDING);
    await bridge.approve(seller.id, admin);
    await expect(bridge.approve(seller.id, admin)).resolves.toBeDefined();
    await expect(bridge.reject(seller.id, admin, 'too late')).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_APPROVED' } });
    expect(await capOf(biz.workspace.id)).toHaveLength(1);
    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.APPROVED);
  });

  it('I. verificationTier: atomic with the canonical approval; invalid tier refused with no writes; recorded on an already-approved application', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob'); const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Tier Co');
    const { app, seller } = await pendingSelling(bob, biz);
    await expect(bridge.approve(seller.id, admin, 'platinum')).rejects.toMatchObject({ response: { code: 'INVALID_VERIFICATION_TIER' } });
    expect((await appOf(app.id)).status).toBe(BusinessCapabilityApplicationStatus.PENDING);
    await bridge.approve(seller.id, admin, 'verified_business');
    expect((await sellerOf(biz.business.id)).verificationTier).toBe('verified_business');
    await bridge.approve(seller.id, admin, 'verified_seller'); // idempotent approval, tier recorded
    const final = await sellerOf(biz.business.id);
    expect(final.verificationTier).toBe('verified_seller');
    expect(final.status).toBe(SellerStatus.APPROVED);
    const b2 = await makeBusiness(bob, 'No Tier Co');
    const p2 = await pendingSelling(bob, b2);
    await bridge.approve(p2.seller.id, admin);
    expect((await sellerOf(b2.business.id)).verificationTier).toBe('registered');
  });
});
