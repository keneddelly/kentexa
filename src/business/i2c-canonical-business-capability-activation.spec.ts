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
import { RoleContextService } from '../role-context/role-context.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';

/**
 * I2C — canonical Business capability activation. Real disposable schema in
 * the shared kentexa_b5b_test database. VISIBLE = CTA = APPLICATION =
 * ACTIVATED BUSINESS = RESULTING ROLE CONTEXT.
 */
describe('I2C — canonical Business capability activation, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let roleContext: RoleContextService;
  let seq = 0;

  const repo = (e: any) => ds.getRepository(e) as any;
  const denyUserIds = new Set<number>();
  const verificationStub = {
    requireFeature: jest.fn(async (userId: number) => {
      if (denyUserIds.has(userId)) {
        const err: any = new Error('VERIFICATION_REQUIRED');
        err.response = { code: 'VERIFICATION_REQUIRED' };
        throw err;
      }
    }),
  };

  const makeUser = (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2c.local`, phone: `+2553${String(n).padStart(8, '0')}`, password: 'x', name }));
  };

  const makeBusiness = async (owner: User, tradingName: string) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    return { business, workspace, membership, assignment };
  };

  const bizCtx = (businessId: number) => ({ identityType: 'BUSINESS', businessId }) as any;
  const personalCtx = () => ({ identityType: 'PERSONAL', businessId: null }) as any;
  const apply = (businessId: number, code: string, user: User, ctx: any, dto: any = {}) =>
    service.applyForCapability(businessId, code, user, dto, ctx);

  const rolesOf = async (userId: number) => new Map<number, any>((await roleContext.listRoles(userId)).map((r: any) => [r.accountRoleId, r]));

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
    service = new BusinessCapabilityApplicationService(
      repo(BusinessCapabilityApplication), repo(BusinessCapability), ds, verificationStub as any, { resolveAgentLocation: jest.fn() } as any,
    );
    roleContext = new RoleContextService(
      repo(User), repo(AccountRole), repo(ActiveRoleSession), repo(SellerProfile),
      {} as any, {} as any, {} as any, repo(WorkspaceAssignment), { emitRevoked: jest.fn() } as any,
    );
  }, 60000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));

  it('A+I. Washing Machine TZ Start Selling → application belongs to it → activation yields Washing Machine TZ · Selling via /auth/roles and context', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const res = await apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id));
    const app = await repo(BusinessCapabilityApplication).findOne({ where: { id: res.application.id } });
    expect(app).toMatchObject({ businessId: wm.business.id, workspaceId: wm.workspace.id, status: 'pending' });

    await service.approveApplication(app.id, admin);
    const row = (await rolesOf(bob.id)).get(res.accountRole.id);
    expect(row).toMatchObject({ roleType: AccountRoleType.SELLER, switchable: true, identityType: 'BUSINESS', displayName: 'Washing Machine TZ', businessId: wm.business.id });

    const session = await repo(ActiveRoleSession).save(repo(ActiveRoleSession).create({
      userId: bob.id, accountRoleId: res.accountRole.id, contextVersion: (await repo(AccountRole).findOne({ where: { id: res.accountRole.id } })).contextVersion,
      expiresAt: new Date(Date.now() + 60_000),
    }));
    const ctx = await roleContext.resolveContext({ sub: bob.id, sid: session.id, rid: res.accountRole.id, rt: AccountRoleType.SELLER, cv: session.contextVersion });
    expect(ctx).toMatchObject({ identityType: 'BUSINESS', displayName: 'Washing Machine TZ', businessId: wm.business.id });
  });

  it('B. Selling then Services on the same Business → same identity, distinct authority', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const s = await apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id));
    await service.approveApplication(s.application.id, admin);
    const v = await apply(wm.business.id, 'service', bob, bizCtx(wm.business.id));
    await service.approveApplication(v.application.id, admin);
    const rows = await rolesOf(bob.id);
    const seller = rows.get(s.accountRole.id);
    const svc = rows.get(v.accountRole.id);
    expect(seller.businessId).toBe(svc.businessId);
    expect(seller.displayName).toBe(svc.displayName);
    expect(seller.identityType).toBe('BUSINESS');
    expect(seller.roleType).not.toBe(svc.roleType);
    expect(await repo(Business).count()).toBeGreaterThan(0);
  });

  it('C+D. acting as Washing Machine TZ can never activate Bob Electronics; tampered identity hints do not retarget', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const el = await makeBusiness(bob, 'Bob Electronics');
    const before = await repo(BusinessCapabilityApplication).count();

    await expect(apply(el.business.id, 'commerce', bob, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'ACTIVATION_CONTEXT_MISMATCH' } });
    await expect(apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id), { businessId: el.business.id }))
      .rejects.toMatchObject({ response: { code: 'ACTIVATION_IDENTITY_MISMATCH' } });
    expect(await repo(BusinessCapabilityApplication).count()).toBe(before);

    const res = await apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id), {
      workspaceAssignmentId: el.assignment.id, accountRoleId: 999, profileId: 999, commerceProfileId: 999, userId: 999,
      applicationData: { businessId: el.business.id, workspaceId: el.workspace.id },
    } as any);
    const app = await repo(BusinessCapabilityApplication).findOne({ where: { id: res.application.id } });
    expect(app.businessId).toBe(wm.business.id);
    expect(app.workspaceId).toBe(wm.workspace.id);
    expect(await repo(BusinessCapabilityApplication).count({ where: { businessId: el.business.id } })).toBe(0);
    expect(await repo(AccountRole).count({ where: { workspaceAssignmentId: el.assignment.id } })).toBe(0);
  });

  it('E. Personal context never falls back to the first/owned Business — only the exactly named, owned Business is targeted', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const stranger = await makeUser('Stranger');
    const first = await makeBusiness(bob, 'Washing Machine TZ');
    const second = await makeBusiness(bob, 'Bob Electronics');
    const res = await apply(second.business.id, 'commerce', bob, personalCtx());
    const app = await repo(BusinessCapabilityApplication).findOne({ where: { id: res.application.id } });
    expect(app.businessId).toBe(second.business.id);
    expect(await repo(BusinessCapabilityApplication).count({ where: { businessId: first.business.id } })).toBe(0);
    await expect(apply(first.business.id, 'commerce', stranger, personalCtx()))
      .rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_REQUIRED' } });
  });

  it('F. a legacy unbound Seller stays unbound/Personal and is never auto-attached to a Business', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const legacy = await repo(SellerProfile).save(repo(SellerProfile).create({ user: bob, businessId: null, businessName: 'Bob store', status: SellerStatus.APPROVED }));
    const legacyRole = await repo(AccountRole).save(repo(AccountRole).create({
      userId: bob.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: legacy.id, workspaceAssignmentId: null, capabilities: {}, contextVersion: 1,
    }));
    const res = await apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id)).catch((e) => e);
    if (res?.application) await service.approveApplication(res.application.id, admin);
    const after = await repo(AccountRole).findOne({ where: { id: legacyRole.id } });
    expect(after.workspaceAssignmentId).toBeNull();
    expect((await repo(SellerProfile).findOne({ where: { id: legacy.id } })).businessId).toBeNull();
    expect((await rolesOf(bob.id)).get(legacyRole.id)).toMatchObject({ identityType: 'PERSONAL', displayName: 'Bob', businessId: null, switchable: true });
  });

  it('G+K. repeated Start Selling is idempotent; an already-active capability creates no new application/role/profile', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const first = await apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id));
    const counts = async () => ({
      apps: await repo(BusinessCapabilityApplication).count({ where: { businessId: wm.business.id } }),
      roles: await repo(AccountRole).count({ where: { userId: bob.id, roleType: AccountRoleType.SELLER } }),
      sellers: await repo(SellerProfile).count({ where: { businessId: wm.business.id } }),
      caps: await repo(BusinessCapability).count({ where: { workspaceId: wm.workspace.id } }),
    });
    const base = await counts();
    await expect(apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
    expect(await counts()).toEqual(base);

    await service.approveApplication(first.application.id, admin);
    const approved = await counts();
    await expect(apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id))).rejects.toBeDefined();
    expect(await counts()).toEqual(approved);
  });

  it('H. pending / rejected / suspended / revoked capability is never a valid switchable context', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');

    const pendingBiz = await makeBusiness(bob, 'Pending Co');
    const p = await apply(pendingBiz.business.id, 'commerce', bob, bizCtx(pendingBiz.business.id));

    const rejectedBiz = await makeBusiness(bob, 'Rejected Co');
    const r = await apply(rejectedBiz.business.id, 'commerce', bob, bizCtx(rejectedBiz.business.id));
    await service.rejectApplication(r.application.id, admin, 'incomplete documents');

    const suspendedBiz = await makeBusiness(bob, 'Suspended Co');
    const s = await apply(suspendedBiz.business.id, 'commerce', bob, bizCtx(suspendedBiz.business.id));
    await service.approveApplication(s.application.id, admin);
    await repo(BusinessCapability).update({ workspaceId: suspendedBiz.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE }, { status: BusinessCapabilityStatus.SUSPENDED });

    const revokedBiz = await makeBusiness(bob, 'Revoked Co');
    const v = await apply(revokedBiz.business.id, 'commerce', bob, bizCtx(revokedBiz.business.id));
    await service.approveApplication(v.application.id, admin);
    await repo(BusinessCapability).update({ workspaceId: revokedBiz.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE }, { status: BusinessCapabilityStatus.REVOKED });

    const rows = await rolesOf(bob.id);
    for (const id of [p.accountRole.id, r.accountRole.id, s.accountRole.id, v.accountRole.id]) {
      expect(rows.get(id).switchable).toBe(false);
    }
    expect(rows.get(s.accountRole.id).reason).toBe('ROLE_CONTEXT_CAPABILITY_INACTIVE');
    expect(rows.get(v.accountRole.id).reason).toBe('ROLE_CONTEXT_CAPABILITY_INACTIVE');
    // Non-active organizational rows are UNRESOLVED identity, never Bob.
    expect(rows.get(s.accountRole.id).displayName).toBeNull();
  });

  it('J. verification is enforced before any privileged activation — nothing is created when it fails', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    denyUserIds.add(bob.id);
    await expect(apply(wm.business.id, 'commerce', bob, bizCtx(wm.business.id)))
      .rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
    expect(await repo(BusinessCapabilityApplication).count({ where: { businessId: wm.business.id } })).toBe(0);
    expect(await repo(AccountRole).count({ where: { userId: bob.id } })).toBe(0);
    denyUserIds.delete(bob.id);
  });
});
