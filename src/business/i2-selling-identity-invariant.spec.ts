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
import { SellerService } from '../seller/seller.service';
import { RoleContextService } from '../role-context/role-context.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication, BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { User } from '../users/entities/user.entity';

const CARDINALITY = 'BUSINESS_PROFILE_CARDINALITY_INVALID';

/**
 * ONE Selling-identity invariant for EVERY Business Selling entry point
 * (connect-selling, generic apply, approval, legacy activate-seller, legacy
 * SellerService.approve), real disposable Postgres.
 */
describe('Business Selling identity invariant (shared validator), real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let apps: BusinessCapabilityApplicationService;
  let roles: RoleContextService;
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
    roles = new RoleContextService(
      repo(User), repo(AccountRole), repo(ActiveRoleSession), repo(SellerProfile),
      {} as any, {} as any, {} as any, repo(WorkspaceAssignment), { emitRevoked: jest.fn() } as any,
    );
  }, 60000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));

  it('A. connect-selling: one canonical profile allowed; zero or two → BUSINESS_PROFILE_CARDINALITY_INVALID', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const one = await makeBusiness(bob, 'One', 1);
    const zero = await makeBusiness(bob, 'Zero', 0);
    const two = await makeBusiness(bob, 'Two', 2);

    await expect(apps.connectSelling(one.business.id, bob, {}, personalCtx())).resolves.toBeDefined();
    for (const b of [zero, two]) {
      await expect(apps.connectSelling(b.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: CARDINALITY } });
      expect(await applicationCount(b.business.id)).toBe(0);
    }
  });

  it('B. generic Selling apply (not connect-selling): the SAME three outcomes', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const one = await makeBusiness(bob, 'One', 1);
    const zero = await makeBusiness(bob, 'Zero', 0);
    const two = await makeBusiness(bob, 'Two', 2);

    await expect(apps.applyForCapability(one.business.id, 'commerce', bob, {}, bizCtx(one.business.id))).resolves.toBeDefined();
    for (const b of [zero, two]) {
      await expect(apps.applyForCapability(b.business.id, 'commerce', bob, {}, bizCtx(b.business.id))).rejects.toMatchObject({ response: { code: CARDINALITY } });
      expect(await applicationCount(b.business.id)).toBe(0);
      expect(await repo(AccountRole).count({ where: { userId: bob.id, workspaceAssignmentId: b.assignment.id } })).toBe(0);
      expect(await repo(SellerProfile).count({ where: { businessId: b.business.id } })).toBe(0);
    }
  });

  it('C. approval revalidates: valid at apply, invalid at approval → explicit failure, no partial activation', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const res = await apps.connectSelling(wm.business.id, bob, {}, personalCtx());

    for (const breakIt of [
      async () => { await repo(CommerceProfile).delete({ businessId: wm.business.id }); }, // 0
      async () => { await addCanonicalProfile(bob, wm.business.id, 'a'); await addCanonicalProfile(bob, wm.business.id, 'b'); }, // 2
    ]) {
      await breakIt();
      await expect(apps.approveApplication(res.application.id, admin)).rejects.toMatchObject({ response: { code: CARDINALITY } });
      expect((await repo(BusinessCapabilityApplication).findOne({ where: { id: res.application.id } })).status).toBe(BusinessCapabilityApplicationStatus.PENDING);
      expect(await repo(BusinessCapability).count({ where: { workspaceId: wm.workspace.id } })).toBe(0);
      expect((await repo(SellerProfile).findOne({ where: { businessId: wm.business.id } })).status).toBe(SellerStatus.PENDING);
      const bound = await repo(AccountRole).find({ where: { userId: bob.id, workspaceAssignmentId: wm.assignment.id } });
      expect(bound.every((r: AccountRole) => r.status !== AccountRoleStatus.ACTIVE)).toBe(true);
      await repo(CommerceProfile).delete({ businessId: wm.business.id }); // reset for the next variant
    }

    // Restored to exactly one canonical profile → the same application now approves.
    const canonical = await addCanonicalProfile(bob, wm.business.id, 'Washing Machine Tz');
    await apps.approveApplication(res.application.id, admin);
    const role = await repo(AccountRole).findOne({ where: { id: res.accountRole.id } });
    expect(role.status).toBe(AccountRoleStatus.ACTIVE);
    const row = (await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === role.id);
    expect(row).toMatchObject({ identityType: 'BUSINESS', businessId: wm.business.id, commerceProfileId: canonical.id });
  });

  it('D. multi-Business: A valid succeeds, B invalid fails, B never borrows A\'s profile', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const a = await makeBusiness(bob, 'Biz A', 1);
    const b = await makeBusiness(bob, 'Biz B', 2);

    const resA = await apps.connectSelling(a.business.id, bob, {}, personalCtx());
    await apps.approveApplication(resA.application.id, admin);
    await expect(apps.connectSelling(b.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: CARDINALITY } });
    await expect(apps.applyForCapability(b.business.id, 'commerce', bob, {}, bizCtx(b.business.id))).rejects.toMatchObject({ response: { code: CARDINALITY } });

    const listed = await roles.listRoles(bob.id);
    const sellerRows = listed.filter((r: any) => r.roleType === 'seller' && r.businessId != null);
    expect(sellerRows.map((r: any) => [r.businessId, r.commerceProfileId])).toEqual([[a.business.id, a.profile.id]]);
    expect(await applicationCount(b.business.id)).toBe(0);
  });

  it('E. a legacy/unlinked business profile owned by the same user is never counted or chosen (Bishoo 6 / 26 shape)', async () => {
    if (!reachable) return;
    const bishoo = await makeUser('Bishoo');
    const admin = await makeUser('Admin');
    const legacyOlder = await repo(CommerceProfile).save(repo(CommerceProfile).create({
      ownerId: bishoo.id, type: CommerceProfileType.BUSINESS, displayName: 'Bishoo (legacy)', username: `lg${++seq}`, businessId: null,
    }));
    const biz = await makeBusiness(bishoo, 'Bishoo', 1); // canonical, created AFTER the legacy one

    const res = await apps.connectSelling(biz.business.id, bishoo, {}, personalCtx());
    await apps.approveApplication(res.application.id, admin);
    const row = (await roles.listRoles(bishoo.id)).find((r: any) => r.accountRoleId === res.accountRole.id);
    expect(row.commerceProfileId).toBe(biz.profile.id);
    expect(row.commerceProfileId).not.toBe(legacyOlder.id);

    // ...and a Business whose ONLY owner-owned business profile is the legacy one is refused (0 linked), never "helped".
    const bare = await makeBusiness(bishoo, 'Bare', 0);
    await expect(apps.connectSelling(bare.business.id, bishoo, {}, personalCtx())).rejects.toMatchObject({ response: { code: CARDINALITY } });
  });

  it('relationship mismatch: a linked profile that is not a BUSINESS profile of the owner is refused explicitly', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const other = await makeUser('Other');
    const biz = await makeBusiness(bob, 'Mismatch', 1);
    await repo(CommerceProfile).update(biz.profile.id, { ownerId: other.id });
    await expect(apps.connectSelling(biz.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: 'BUSINESS_PROFILE_RELATIONSHIP_INVALID' } });
  });

  it('legacy activate-seller uses the same validator (and creates nothing when it fails)', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const bad = await makeBusiness(bob, 'Two', 2);
    const svc: any = Object.create(BusinessService.prototype);
    svc.dataSource = ds;
    svc.sellerProfileRepo = repo(SellerProfile);
    svc.findById = async (id: number) => repo(Business).findOne({ where: { id }, relations: { user: true } });
    await expect(svc.activateSeller(bad.business.id, bob, personalCtx())).rejects.toMatchObject({ response: { code: CARDINALITY } });
    expect(await repo(SellerProfile).count({ where: { businessId: bad.business.id } })).toBe(0);
  });

  it('legacy SellerService.approve (Business-linked SellerProfile) revalidates and activates no role when invalid', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const biz = await makeBusiness(bob, 'Legacy Path', 1);
    await repo(BusinessCapability).save(repo(BusinessCapability).create({ workspaceId: biz.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE, approvedAt: new Date() }));
    const sp = await repo(SellerProfile).save(repo(SellerProfile).create({ user: bob, businessId: biz.business.id, businessName: 'Legacy Path', sellerType: 'business', status: SellerStatus.PENDING }));
    await repo(CommerceProfile).delete({ businessId: biz.business.id }); // capability active, but zero canonical profiles
    const sync = jest.fn();
    const svc: any = Object.create(SellerService.prototype);
    svc.profileRepo = { findOne: async () => repo(SellerProfile).findOne({ where: { id: sp.id }, relations: { user: true } }), manager: ds.manager };
    svc.roleContextService = { syncOperationalRole: sync };
    await expect(svc.approve(sp.id)).rejects.toMatchObject({ response: { code: CARDINALITY } });
    expect(sync).not.toHaveBeenCalled();
    expect((await repo(SellerProfile).findOne({ where: { id: sp.id } })).status).toBe(SellerStatus.PENDING);
  });

  it('pending lifecycle: a pending Business Seller role is inert; rejection and suspension leave no usable authority', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const biz = await makeBusiness(bob, 'Pending Co');
    const res = await apps.connectSelling(biz.business.id, bob, {}, personalCtx());
    const role = await repo(AccountRole).findOne({ where: { id: res.accountRole.id } });

    // Created with the application, bound, but PENDING: nothing usable.
    expect(role.status).toBe(AccountRoleStatus.PENDING);
    expect(role.workspaceAssignmentId).toBe(biz.assignment.id);
    expect(await roles.isSwitchable(role)).toBe(false);
    expect((await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === role.id)).toMatchObject({ switchable: false, identityType: null, commerceProfileId: null });
    // Even a session forged against the pending role cannot establish a context (=> nothing can publish as the Business).
    const session = await repo(ActiveRoleSession).save(repo(ActiveRoleSession).create({ userId: bob.id, accountRoleId: role.id, contextVersion: role.contextVersion, expiresAt: new Date(Date.now() + 60_000) }));
    await expect(roles.resolveContext({ sub: bob.id, sid: session.id, rid: role.id, rt: role.roleType, cv: role.contextVersion } as any)).rejects.toThrow('ROLE_NOT_ACTIVE');
    // The pending role carries no Business Selling capability.
    expect(await repo(BusinessCapability).count({ where: { workspaceId: biz.workspace.id } })).toBe(0);

    // Rejection: role never becomes active.
    await apps.rejectApplication(res.application.id, admin, 'not now');
    const rejected = await repo(AccountRole).findOne({ where: { id: role.id } });
    expect(rejected.status).not.toBe(AccountRoleStatus.ACTIVE);
    expect(await roles.isSwitchable(rejected)).toBe(false);

    // Suspension after approval: an approved-then-suspended capability is not switchable either.
    const biz2 = await makeBusiness(bob, 'Suspended Co');
    const r2 = await apps.connectSelling(biz2.business.id, bob, {}, personalCtx());
    await apps.approveApplication(r2.application.id, admin);
    const active = await repo(AccountRole).findOne({ where: { id: r2.accountRole.id } });
    expect(await roles.isSwitchable(active)).toBe(true);
    await repo(BusinessCapability).update({ workspaceId: biz2.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE }, { status: BusinessCapabilityStatus.SUSPENDED });
    expect(await roles.isSwitchable(active)).toBe(false);
    expect((await sellerRolesFor(bob.id)).length).toBeGreaterThanOrEqual(2);
  });
});
