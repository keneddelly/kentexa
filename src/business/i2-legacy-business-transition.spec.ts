import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from './b5b-closure-test-db';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { RoleContextService } from '../role-context/role-context.service';
import { FeedService } from '../feed/feed.service';
import { momentActorFields } from '../commerce-profiles/moment-actor';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { User } from '../users/entities/user.entity';

/**
 * I2 legacy-Business transition, real disposable Postgres (shared harness).
 * The production shape it reproduces: Bob owns "Washing Machine Tz" (with one
 * canonical Business CommerceProfile), and separately holds a LEGACY unbound
 * Seller role whose store name is also "washing machine tz". Server truth:
 *   legacy Seller  -> PERSONAL (Bob)         -> Moments stamp Bob Personal
 *   Business + Selling capability (bound)    -> BUSINESS (Washing Machine Tz)
 */
describe('I2 legacy-Business transition, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let apps: BusinessCapabilityApplicationService;
  let roles: RoleContextService;
  let seq = 0;

  const repo = (e: any) => ds.getRepository(e) as any;
  const bizCtx = (businessId: number) => ({ identityType: 'BUSINESS', businessId }) as any;
  const personalCtx = () => ({ identityType: 'PERSONAL', businessId: null }) as any;

  const makeUser = (name: string, storeName: string | null = null) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2lt.local`, phone: `+2555${String(n).padStart(8, '0')}`, password: 'x', name, storeName }));
  };

  const makeBusiness = async (owner: User, tradingName: string, profiles = 1) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    const profileRows: CommerceProfile[] = [];
    for (let i = 0; i < profiles; i++) {
      profileRows.push(await repo(CommerceProfile).save(repo(CommerceProfile).create({
        ownerId: owner.id, type: CommerceProfileType.BUSINESS, displayName: tradingName, username: `b${++seq}`, businessId: business.id,
      })));
    }
    return { business, workspace, membership, assignment, profile: profileRows[0] };
  };

  const makePersonalProfile = (owner: User) =>
    repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: owner.id, type: CommerceProfileType.PERSONAL, displayName: owner.name, username: `p${++seq}` }));

  const makeLegacySeller = async (user: User, businessName: string) => {
    const seller = await repo(SellerProfile).save(repo(SellerProfile).create({ user, businessId: null, businessName, sellerType: 'individual', status: SellerStatus.APPROVED }));
    const role = await repo(AccountRole).save(repo(AccountRole).create({
      userId: user.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: seller.id, workspaceAssignmentId: null, capabilities: {}, contextVersion: 1,
    }));
    return { seller, role };
  };

  const contextFor = async (role: AccountRole) => {
    const fresh = await repo(AccountRole).findOne({ where: { id: role.id } });
    const session = await repo(ActiveRoleSession).save(repo(ActiveRoleSession).create({
      userId: fresh.userId, accountRoleId: fresh.id, contextVersion: fresh.contextVersion, expiresAt: new Date(Date.now() + 60_000),
    }));
    return { session, ctx: await roles.resolveContext({ sub: fresh.userId, sid: session.id, rid: fresh.id, rt: fresh.roleType, cv: fresh.contextVersion }) };
  };

  // FeedService.publish against an in-memory feed store (the same publish()
  // used in production; the store is the only stub).
  const publisher = () => {
    const saved: any[] = [];
    const svc: any = Object.create(FeedService.prototype);
    svc.feedRepo = { create: (d: any) => d, save: async (d: any) => { const row = { id: saved.length + 1, ...d }; saved.push(row); return row; } };
    svc.profileScope = { isAuthorizedFor: jest.fn().mockResolvedValue(true) };
    svc.activityEvents = { record: jest.fn() };
    svc.logger = { warn: jest.fn() };
    svc.notifyFollowers = jest.fn().mockResolvedValue(undefined);
    svc.matchNeedToSellers = jest.fn().mockResolvedValue(undefined);
    return { svc: svc as FeedService, saved };
  };

  const activate = async (owner: User, admin: User, businessId: number, ctx: any) => {
    const res = await apps.connectSelling(businessId, owner, {}, ctx);
    await apps.approveApplication(res.application.id, admin);
    return res;
  };

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

  it('PART 7. Business chain: connect Selling → Business context → publish → stored → feed → click all resolve the SAME Business profile', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob', 'washing machine tz');
    const admin = await makeUser('Admin');
    const personal = await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const legacy = await makeLegacySeller(bob, 'washing machine tz');

    // Selected Business = CTA Business = application Business.
    const res = await apps.connectSelling(wm.business.id, bob, {}, personalCtx());
    const application = await repo(BusinessCapabilityApplication).findOne({ where: { id: res.application.id } });
    expect(application).toMatchObject({ businessId: wm.business.id, workspaceId: wm.workspace.id });
    // Pending: not switchable, not a Business context yet.
    expect((await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === res.accountRole.id)).toMatchObject({ switchable: false, identityType: null });

    await apps.approveApplication(application.id, admin);
    const boundRole = await repo(AccountRole).findOne({ where: { id: res.accountRole.id } });
    expect(boundRole.workspaceAssignmentId).toBe(wm.assignment.id); // BOUND workspace Business
    expect(boundRole.id).not.toBe(legacy.role.id); // a NEW role; legacy untouched

    // Switch: BUSINESS activeContext (server truth, not UI inference).
    const row = (await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === boundRole.id);
    expect(row).toMatchObject({ switchable: true, identityType: 'BUSINESS', businessId: wm.business.id, commerceProfileId: wm.profile.id, displayName: 'Washing Machine Tz' });
    const { ctx } = await contextFor(boundRole);
    expect(ctx).toMatchObject({ identityType: 'BUSINESS', businessId: wm.business.id, commerceProfileId: wm.profile.id, displayName: 'Washing Machine Tz' });

    // Publish: server actor resolution from the authenticated RoleContext.
    const { svc, saved } = publisher();
    await svc.publish(bob.id, { type: 'moment', title: 'Hello from the Business' }, ctx);
    expect(saved[0].commerceProfileId).toBe(wm.profile.id); // stored actor
    expect(saved[0].commerceProfileId).not.toBe(personal.id);

    // Feed read: same read model production uses; click target = same profile.
    const stored = await repo(CommerceProfile).findOne({ where: { id: saved[0].commerceProfileId } });
    const actor = momentActorFields(stored);
    expect(actor).toMatchObject({ actorResolved: true, actorType: 'BUSINESS', commerceProfileId: wm.profile.id, name: 'Washing Machine Tz' });
    expect(stored.businessId).toBe(wm.business.id); // clicked profile = the Business's own profile
    // The whole invariant, one identity:
    expect(new Set([wm.business.id, ctx.businessId, row.businessId, stored.businessId])).toEqual(new Set([wm.business.id]));
    expect(new Set([wm.profile.id, ctx.commerceProfileId, row.commerceProfileId, saved[0].commerceProfileId, actor.commerceProfileId])).toEqual(new Set([wm.profile.id]));
  });

  it('PART 8. legacy unbound Seller stays PERSONAL: Bob, his Personal profile, never Washing Machine — despite storeName/businessName', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob', 'washing machine tz');
    const personal = await makePersonalProfile(bob);
    await makeBusiness(bob, 'Washing Machine Tz');
    const legacy = await makeLegacySeller(bob, 'washing machine tz');

    const row = (await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === legacy.role.id);
    expect(row).toMatchObject({ switchable: true, identityType: 'PERSONAL', businessId: null, commerceProfileId: personal.id, displayName: 'Bob' });
    const { ctx } = await contextFor(legacy.role);
    expect(ctx).toMatchObject({ identityType: 'PERSONAL', businessId: null, commerceProfileId: personal.id, displayName: 'Bob' });
    expect(ctx.displayName.toLowerCase()).not.toContain('washing');

    const { svc, saved } = publisher();
    await svc.publish(bob.id, { type: 'moment', title: 'personal selling' }, ctx);
    expect(saved[0].commerceProfileId).toBe(personal.id);
    const actor = momentActorFields(await repo(CommerceProfile).findOne({ where: { id: saved[0].commerceProfileId } }));
    expect(actor).toMatchObject({ actorType: 'PERSONAL', name: 'Bob' });
  });

  it('PART 9. multi-Business: activating Selling for B binds ONLY B; A and C inherit nothing; the legacy Seller stays Personal', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob', 'washing machine tz');
    const admin = await makeUser('Admin');
    await makePersonalProfile(bob);
    const a = await makeBusiness(bob, 'Business A');
    const b = await makeBusiness(bob, 'Business B');
    const c = await makeBusiness(bob, 'Business C');
    const legacy = await makeLegacySeller(bob, 'washing machine tz');

    const before = await apps.getSellingConnectionOptions(bob);
    expect(before.legacySeller).toEqual({ accountRoleId: legacy.role.id });
    expect(before.options.map((o: any) => [o.businessId, o.sellingState, o.eligible])).toEqual([
      [a.business.id, 'none', true], [b.business.id, 'none', true], [c.business.id, 'none', true],
    ]);

    const res = await activate(bob, admin, b.business.id, personalCtx());
    const all = await roles.listRoles(bob.id);
    const bound = all.filter((r: any) => r.roleType === AccountRoleType.SELLER && r.businessId != null);
    expect(bound.map((r: any) => r.businessId)).toEqual([b.business.id]);
    expect(await repo(BusinessCapability).count({ where: { workspaceId: a.workspace.id } })).toBe(0);
    expect(await repo(BusinessCapability).count({ where: { workspaceId: c.workspace.id } })).toBe(0);
    expect(await repo(AccountRole).count({ where: { workspaceAssignmentId: a.assignment.id } })).toBe(0);
    expect(await repo(AccountRole).count({ where: { workspaceAssignmentId: c.assignment.id } })).toBe(0);

    const after = await apps.getSellingConnectionOptions(bob);
    expect(after.options.map((o: any) => [o.businessId, o.sellingState, o.blocker])).toEqual([
      [a.business.id, 'none', null], [b.business.id, 'active', 'SELLING_ALREADY_ACTIVE'], [c.business.id, 'none', null],
    ]);

    expect((await contextFor(await repo(AccountRole).findOne({ where: { id: res.accountRole.id } }))).ctx)
      .toMatchObject({ identityType: 'BUSINESS', businessId: b.business.id, displayName: 'Business B' });
    expect((await contextFor(legacy.role)).ctx).toMatchObject({ identityType: 'PERSONAL', businessId: null, displayName: 'Bob' });

    // From Business B's context, Business A / C cannot be activated (I2C/I2E still hold).
    await expect(apps.connectSelling(a.business.id, bob, {}, bizCtx(b.business.id))).rejects.toMatchObject({ response: { code: 'ACTIVATION_CONTEXT_MISMATCH' } });
    await expect(apps.connectSelling(c.business.id, bob, {}, bizCtx(b.business.id))).rejects.toMatchObject({ response: { code: 'ACTIVATION_CONTEXT_MISMATCH' } });
  });

  it('PART 12. security: non-owner, tampered ids, cardinality, workspace, pending/rejected/suspended states', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const stranger = await makeUser('Stranger');
    const admin = await makeUser('Admin');
    await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const el = await makeBusiness(bob, 'Bob Electronics');

    // non-owner cannot connect; and never learns Business facts
    await expect(apps.connectSelling(wm.business.id, stranger, {}, personalCtx())).rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_REQUIRED' } });
    expect((await apps.getSellingConnectionOptions(stranger)).options).toEqual([]);

    // body businessId / commerceProfileId / accountRoleId are not acting authority
    await expect(apps.connectSelling(wm.business.id, bob, { businessId: el.business.id }, personalCtx())).rejects.toMatchObject({ response: { code: 'ACTIVATION_IDENTITY_MISMATCH' } });
    const tampered = await apps.connectSelling(wm.business.id, bob, { commerceProfileId: el.profile.id, accountRoleId: 999, workspaceAssignmentId: el.assignment.id } as any, personalCtx());
    const app = await repo(BusinessCapabilityApplication).findOne({ where: { id: tampered.application.id } });
    expect(app.businessId).toBe(wm.business.id);
    expect(await repo(BusinessCapabilityApplication).count({ where: { businessId: el.business.id } })).toBe(0);
    expect(await repo(AccountRole).count({ where: { workspaceAssignmentId: el.assignment.id } })).toBe(0);

    // repeated CTA: idempotent (pending), then rejected can re-apply
    await expect(apps.connectSelling(wm.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: 'SELLING_PENDING' } });
    await apps.rejectApplication(tampered.application.id, admin, 'incomplete documents');
    expect((await apps.getSellingConnectionOptions(bob)).options.find((o: any) => o.businessId === wm.business.id)).toMatchObject({ sellingState: 'rejected', eligible: true });
    const again = await apps.connectSelling(wm.business.id, bob, {}, personalCtx());
    expect(again.application.id).toBeGreaterThan(tampered.application.id);
  });

  it('PART 12. cardinality failure fails explicitly (connect refused; a bound role could not publish either)', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    await makePersonalProfile(bob);
    const zero = await makeBusiness(bob, 'No Profile Co', 0);
    const many = await makeBusiness(bob, 'Two Profile Co', 2);

    await expect(apps.connectSelling(zero.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: 'BUSINESS_PROFILE_CARDINALITY_INVALID' } });
    await expect(apps.connectSelling(many.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: 'BUSINESS_PROFILE_CARDINALITY_INVALID' } });
    const opts = (await apps.getSellingConnectionOptions(bob)).options;
    expect(opts.every((o: any) => o.eligible === false && o.blocker === 'BUSINESS_PROFILE_CARDINALITY_INVALID')).toBe(true);
    expect(await repo(BusinessCapabilityApplication).count({ where: [{ businessId: zero.business.id }, { businessId: many.business.id }] })).toBe(0);
  });

  it('PART 12. workspace/assignment invalid → explicit failure; nothing created', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    await repo(WorkspaceAssignment).update(wm.assignment.id, { status: WorkspaceAssignmentStatus.REVOKED });
    await expect(apps.connectSelling(wm.business.id, bob, {}, personalCtx())).rejects.toMatchObject({ response: { code: expect.stringMatching(/WORKSPACE/) } });
    expect(await repo(BusinessCapabilityApplication).count({ where: { businessId: wm.business.id } })).toBe(0);
  });

  it('PART 5/12. session safety: a Personal session never becomes Business; a suspended/revoked Business role cannot publish as Business', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob', 'washing machine tz');
    const admin = await makeUser('Admin');
    const personal = await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const legacy = await makeLegacySeller(bob, 'washing machine tz');

    // A Personal session on the legacy role, opened BEFORE the Business role exists.
    const stale = await contextFor(legacy.role);
    const res = await activate(bob, admin, wm.business.id, personalCtx());
    const staleAfter = await roles.resolveContext({ sub: bob.id, sid: stale.session.id, rid: legacy.role.id, rt: AccountRoleType.SELLER, cv: stale.session.contextVersion });
    expect(staleAfter).toMatchObject({ identityType: 'PERSONAL', businessId: null, commerceProfileId: personal.id }); // PERSONAL token never gains BUSINESS
    // ...and it cannot be replayed against the Business role id.
    await expect(roles.resolveContext({ sub: bob.id, sid: stale.session.id, rid: res.accountRole.id, rt: AccountRoleType.SELLER, cv: 1 }))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });

    // The only role-mutation path bumps contextVersion and revokes sessions: identity can't flip silently.
    const before = stale.session;
    await roles.syncOperationalRole({
      userId: bob.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: legacy.seller.id, workspaceAssignmentId: null,
    });
    await expect(roles.resolveContext({ sub: bob.id, sid: before.id, rid: legacy.role.id, rt: AccountRoleType.SELLER, cv: before.contextVersion }))
      .rejects.toMatchObject({ response: { code: expect.stringMatching(/ROLE_CONTEXT_(REVOKED|VERSION_MISMATCH)/) } });

    // Suspended Business capability: not switchable, no Business context, cannot publish as Business.
    await repo(BusinessCapability).update({ workspaceId: wm.workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE }, { status: BusinessCapabilityStatus.SUSPENDED });
    const row = (await roles.listRoles(bob.id)).find((r: any) => r.accountRoleId === res.accountRole.id);
    expect(row).toMatchObject({ switchable: false, identityType: null });
    await expect(contextFor(await repo(AccountRole).findOne({ where: { id: res.accountRole.id } }))).rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });
  });

  it('PART 12. a Business-bound role whose Business has no single profile cannot publish (explicit, no Personal/other fallback)', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const admin = await makeUser('Admin');
    await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const res = await activate(bob, admin, wm.business.id, personalCtx());
    await repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: bob.id, type: CommerceProfileType.BUSINESS, displayName: 'Dup', username: `d${++seq}`, businessId: wm.business.id }));
    const { ctx } = await contextFor(await repo(AccountRole).findOne({ where: { id: res.accountRole.id } }));
    expect(ctx).toMatchObject({ identityType: 'BUSINESS', businessId: wm.business.id, commerceProfileId: null });
    const { svc, saved } = publisher();
    await expect(svc.publish(bob.id, { type: 'moment', title: 'x', commerceProfileId: 1 } as any, ctx)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.publish(bob.id, { type: 'moment', title: 'x' } as any, ctx)).rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_UNRESOLVED' } });
    expect(saved).toHaveLength(0);
  });

  it('PART 12. a client-supplied commerceProfileId cannot make a Personal context publish as a Business', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const personal = await makePersonalProfile(bob);
    const wm = await makeBusiness(bob, 'Washing Machine Tz');
    const legacy = await makeLegacySeller(bob, 'washing machine tz');
    const { ctx } = await contextFor(legacy.role);
    const { svc, saved } = publisher();
    await expect(svc.publish(bob.id, { type: 'moment', title: 'x', commerceProfileId: wm.profile.id } as any, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved).toHaveLength(0);
    await svc.publish(bob.id, { type: 'moment', title: 'x' } as any, ctx);
    expect(saved[0].commerceProfileId).toBe(personal.id);
  });
});
