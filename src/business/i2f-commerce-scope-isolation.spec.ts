import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from './b5b-closure-test-db';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { SellerScopeService, SellerScope } from './seller-scope.service';
import { RoleContextService } from '../role-context/role-context.service';
import { ProductsService } from '../products/products.service';
import { ClassifiedsService } from '../classifieds/classifieds.service';
import { OrdersService } from '../orders/orders.service';
import { CommentsController } from '../feed/engagements.controller';
import { resolveCommentActorProfileId } from '../feed/comment-actor';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { User } from '../users/entities/user.entity';

const MISMATCH = 'BUSINESS_SCOPE_MISMATCH';

/**
 * I2F. One owner, Businesses A and B, both with Selling ACTIVE, plus a legacy unbound Personal
 * Seller. Real Postgres for identities/RoleContexts/Classifieds; the products/orders/comments
 * services run their REAL authority code against stamped rows (repositories stubbed).
 */
describe('I2F — Commerce actor & Business scope authority, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let apps: BusinessCapabilityApplicationService;
  let roles: RoleContextService;
  let scopes: SellerScopeService;
  let seq = 0;

  const repo = (e: any) => ds.getRepository(e) as any;
  const personalCtx = () => ({ identityType: 'PERSONAL', businessId: null }) as any;

  const makeUser = (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({ email: `u${n}@i2f.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name }));
  };

  const makeBusiness = async (owner: User, tradingName: string) => {
    const business = await repo(Business).save(repo(Business).create({ legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({ businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({ businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {} }));
    const profile = await repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: owner.id, type: CommerceProfileType.BUSINESS, displayName: tradingName, username: `i2f${++seq}`, businessId: business.id }));
    return { business, workspace, assignment, profile };
  };

  const contextFor = async (role: AccountRole) => {
    const fresh = await repo(AccountRole).findOne({ where: { id: role.id } });
    const session = await repo(ActiveRoleSession).save(repo(ActiveRoleSession).create({
      userId: fresh.userId, accountRoleId: fresh.id, contextVersion: fresh.contextVersion, expiresAt: new Date(Date.now() + 60_000),
    }));
    return roles.resolveContext({ sub: fresh.userId, sid: session.id, rid: fresh.id, rt: fresh.roleType, cv: fresh.contextVersion } as any);
  };

  const activateSelling = async (owner: User, admin: User, b: { business: Business }) => {
    const res = await apps.connectSelling(b.business.id, owner, {}, personalCtx());
    await apps.approveApplication(res.application.id, admin);
    return contextFor(res.accountRole as any);
  };

  const scopeOf = (ctx: any, user: User) => scopes.resolveScope(user.id, user, ctx);

  // World: owner with A and B (Selling active on both) and a legacy unbound Seller
  let owner: User; let admin: User;
  let A: Awaited<ReturnType<typeof makeBusiness>>; let B: Awaited<ReturnType<typeof makeBusiness>>;
  let ctxA: any; let ctxB: any; let ctxLegacy: any; let personalProfile: CommerceProfile;
  let scopeA: SellerScope; let scopeB: SellerScope; let scopeLegacy: SellerScope;

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
    scopes = new SellerScopeService({ findOne: jest.fn().mockResolvedValue(null) } as any, roles);

    owner = await makeUser('Owner'); admin = await makeUser('Admin');
    personalProfile = await repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: owner.id, type: CommerceProfileType.PERSONAL, displayName: 'Owner', username: `p${++seq}` }));
    A = await makeBusiness(owner, 'Business A');
    B = await makeBusiness(owner, 'Business B');
    const legacySp = await repo(SellerProfile).save(repo(SellerProfile).create({ user: owner, businessId: null, businessName: 'legacy', sellerType: 'individual', status: SellerStatus.APPROVED }));
    const legacyRole = await repo(AccountRole).save(repo(AccountRole).create({
      userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE,
      profileId: legacySp.id, workspaceAssignmentId: null, capabilities: {}, contextVersion: 1,
    }));
    ctxA = await activateSelling(owner, admin, A);
    ctxB = await activateSelling(owner, admin, B);
    ctxLegacy = await contextFor(legacyRole);
    scopeA = await scopeOf(ctxA, owner); scopeB = await scopeOf(ctxB, owner); scopeLegacy = await scopeOf(ctxLegacy, owner);
  }, 90000);

  afterAll(async () => { if (ds?.isInitialized) await ds.destroy(); });

  it('§0 disposable database reachable', () => expect(reachable).toBe(true));

  // ── identity / scope derivation ───────────────────────────────────────────
  it('scope is derived from the authenticated context; switching A → B → legacy never leaks the previous identity', async () => {
    if (!reachable) return;
    expect(scopeA).toMatchObject({ workspaceId: A.workspace.id, businessId: A.business.id, commerceProfileId: A.profile.id, mode: 'workspace' });
    expect(scopeB).toMatchObject({ workspaceId: B.workspace.id, businessId: B.business.id, commerceProfileId: B.profile.id, mode: 'workspace' });
    expect(scopeLegacy).toMatchObject({ workspaceId: null, businessId: null, mode: 'legacy', commerceProfileId: personalProfile.id, identityType: 'PERSONAL' });
    // re-resolve in a different order: no stale-cache identity leakage
    const again = [await scopeOf(ctxLegacy, owner), await scopeOf(ctxB, owner), await scopeOf(ctxA, owner)];
    expect(again.map((s) => s.workspaceId)).toEqual([null, B.workspace.id, A.workspace.id]);
    expect(again.map((s) => s.commerceProfileId)).toEqual([personalProfile.id, B.profile.id, A.profile.id]);
  });

  // ── comment / reply actor spoofing ────────────────────────────────────────
  it('comment actor: Business B stamps B (A\'s id cannot be chosen); A stamps A; legacy Seller stamps Personal; unresolved Business fails explicitly', () => {
    if (!reachable) return;
    expect(resolveCommentActorProfileId(ctxB)).toBe(B.profile.id);
    expect(resolveCommentActorProfileId(ctxA)).toBe(A.profile.id);
    expect(resolveCommentActorProfileId(ctxLegacy)).toBe(personalProfile.id);
    expect(resolveCommentActorProfileId(ctxLegacy)).not.toBe(A.profile.id);
    expect(() => resolveCommentActorProfileId({ ...ctxB, commerceProfileId: null })).toThrow('ACTOR_IDENTITY_UNRESOLVED');
    expect(() => resolveCommentActorProfileId(undefined)).toThrow('ACTOR_IDENTITY_UNRESOLVED');
    // a Personal account with no Personal profile stays attributed to the user only (nothing fabricated)
    expect(resolveCommentActorProfileId({ ...ctxLegacy, commerceProfileId: null })).toBeNull();
  });

  const commentsController = (saved: any[]) => {
    const c: any = Object.create(CommentsController.prototype);
    c.commentRepo = {
      findOne: async () => ({ id: 1, entityType: 'product', entityId: 10, parentId: null, authorId: 999 }),
      create: (d: any) => d, save: async (d: any) => { saved.push(d); return d; },
    };
    c.owners = {
      resolve: async () => ({ ownerId: owner.id, title: 'Washer', commerceProfileId: A.profile.id }),
      workspaceOf: async () => A.workspace.id, // the commented product belongs to A
    };
    c.commerceProfileRepo = { findOne: async () => null };
    c.notifService = { notify: jest.fn().mockResolvedValue(undefined) };
    return c as CommentsController;
  };

  it('reply: B cannot reply on A\'s listing (same owner user), even submitting A\'s profile id; A replies stamped A regardless of a spoofed body id; legacy Seller cannot reply for A', async () => {
    if (!reachable) return;
    const saved: any[] = [];
    const c = commentsController(saved);
    const req = { user: owner };
    await expect(c.reply(req, ctxB, '1', 'hello', A.profile.id)).rejects.toMatchObject({ response: { code: MISMATCH } });
    await expect(c.reply(req, ctxLegacy, '1', 'hello', A.profile.id)).rejects.toMatchObject({ response: { code: MISMATCH } });
    expect(saved).toHaveLength(0);
    await c.reply(req, ctxA, '1', 'hello', B.profile.id); // spoof B's id while acting as A
    expect(saved).toHaveLength(1);
    expect(saved[0].commerceProfileId).toBe(A.profile.id); // stored actor = server context, spoof ignored
  });

  // ── products ──────────────────────────────────────────────────────────────
  const productsService = () => {
    const s: any = Object.create(ProductsService.prototype);
    const productA: any = { id: 1, workspaceId: A.workspace.id, seller: { id: owner.id }, category: 'general', basePrice: 1, deliveryFee: 0 };
    const legacyProduct: any = { id: 2, workspaceId: null, seller: { id: owner.id }, category: 'general', basePrice: 1, deliveryFee: 0 };
    s.findOne = async (id: number) => (id === 1 ? productA : legacyProduct);
    s.repo = {
      findOne: async ({ where }: any) => (where.id === 1 ? productA : legacyProduct),
      save: async (p: any) => p, remove: async () => undefined,
    };
    s.ownershipFlags = { isEnabled: () => false }; // default production posture: read flag OFF
    s.searchIndex = { upsert: async () => undefined, remove: async () => undefined };
    s.serialRepo = { find: async () => [], findOne: async () => ({ id: 5, productId: 1 }) };
    s.commerceProfiles = { findById: (id: number) => repo(CommerceProfile).findOne({ where: { id } }) };
    return s as ProductsService;
  };
  const ownerUser = () => ({ id: owner.id }) as User;

  it('products: B cannot update / delete / add variant / register / read / assign / report serials on A\'s product (flag off); A can; legacy Seller cannot touch Business-stamped product but can touch its own unstamped one', async () => {
    if (!reachable) return;
    const s = productsService();
    for (const denied of [
      () => s.update(1, { name: 'x' } as any, ownerUser(), false, scopeB),
      () => s.remove(1, ownerUser(), false, scopeB),
      () => s.createVariant(1, { name: 'v' } as any, ownerUser(), false, scopeB),
      () => s.registerSerials(1, ['S1'], ownerUser(), false, scopeB),
      () => s.getSerials(1, ownerUser(), false, scopeB),
      () => s.assignSerial(5, { orderId: 1 }, ownerUser(), false, scopeB),
      () => s.reportSerial(5, 'reported_lost' as any, ownerUser(), false, scopeB),
      // legacy unbound Seller never becomes a Business
      () => s.update(1, { name: 'x' } as any, ownerUser(), false, scopeLegacy),
      () => s.remove(1, ownerUser(), false, scopeLegacy),
    ]) {
      await expect(denied()).rejects.toMatchObject({ response: { code: MISMATCH } });
    }
    await expect(s.update(1, { name: 'ok' } as any, ownerUser(), false, scopeA)).resolves.toBeDefined();
    await expect(s.remove(1, ownerUser(), false, scopeA)).resolves.toBeDefined();
    // Personal legacy compatibility: unstamped rows keep working via the legacy owner check
    await expect(s.update(2, { name: 'ok' } as any, ownerUser(), false, scopeLegacy)).resolves.toBeDefined();
    await expect(s.remove(2, ownerUser(), false, scopeLegacy)).resolves.toBeDefined();
  });

  it('products: my/products list — Business scope, spoofed foreign/other-Business profile ids rejected, legacy Seller sees no Business-stamped rows', async () => {
    if (!reachable) return;
    const s: any = productsService();
    const calls: any[] = [];
    const qb: any = { where: () => qb, orderBy: () => qb, andWhere: (c: string, p: any) => { calls.push([c, p]); return qb; }, getMany: async () => [] };
    s.repo = { createQueryBuilder: () => qb };
    s.attachReservedStock = async (x: any[]) => x;

    await s.findMyProducts(ownerUser(), undefined, scopeB);
    expect(calls[0][0]).toContain('"workspaceId" = :wsid');
    expect(calls[0][1]).toEqual({ wsid: B.workspace.id });
    calls.length = 0;
    await s.findMyProducts(ownerUser(), undefined, scopeLegacy);
    expect(calls[0][0]).toBe('p."workspaceId" IS NULL');

    // B submitting A's profile id as the filter (payload spoofing)
    await expect(s.findMyProducts(ownerUser(), A.profile.id, scopeB)).rejects.toMatchObject({ response: { code: MISMATCH } });
    // someone else's profile id
    const stranger = await makeUser('Stranger');
    const strangerProfile = await repo(CommerceProfile).save(repo(CommerceProfile).create({ ownerId: stranger.id, type: CommerceProfileType.PERSONAL, displayName: 'S', username: `sx${++seq}` }));
    await expect(s.findMyProducts(ownerUser(), strangerProfile.id, scopeB)).rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_MISMATCH' } });
    // B's own profile is fine
    await expect(s.findMyProducts(ownerUser(), B.profile.id, scopeB)).resolves.toBeDefined();
  });

  // ── classifieds (real rows) ───────────────────────────────────────────────
  it('classifieds: B cannot update / delete / mark-sold / list A\'s listing; A can; legacy Seller cannot touch a Business listing but manages its own', async () => {
    if (!reachable) return;
    const mk = (workspaceId: number | null, title: string) => repo(Classified).save(repo(Classified).create({
      seller: owner, title, description: 'd', price: 10, category: 'general', workspaceId,
      commerceProfileId: workspaceId === A.workspace.id ? A.profile.id : null,
    } as any));
    const listingA = await mk(A.workspace.id, 'A listing');
    const legacyListing = await mk(null, 'legacy listing');
    const svc: any = Object.create(ClassifiedsService.prototype);
    svc.repo = repo(Classified);
    svc.findOne = (id: number) => repo(Classified).findOne({ where: { id }, relations: { seller: true } });
    svc.ownershipFlags = { isEnabled: () => false };
    svc.searchIndex = { upsert: async () => undefined, remove: async () => undefined };
    svc.commerceProfiles = { findById: (id: number) => repo(CommerceProfile).findOne({ where: { id } }) };
    svc.validateFlashSale = () => undefined;
    const me = ownerUser();

    await expect(svc.update(listingA.id, { title: 'x' }, me, false, scopeB)).rejects.toMatchObject({ response: { code: MISMATCH } });
    await expect(svc.remove(listingA.id, me, false, scopeB)).rejects.toMatchObject({ response: { code: MISMATCH } });
    await expect(svc.markAsSold(listingA.id, me, scopeB)).rejects.toMatchObject({ response: { code: MISMATCH } });
    await expect(svc.remove(listingA.id, me, false, scopeLegacy)).rejects.toMatchObject({ response: { code: MISMATCH } });
    await expect(svc.findMine(me, A.profile.id, scopeB)).rejects.toMatchObject({ response: { code: MISMATCH } });
    expect((await repo(Classified).findOne({ where: { id: listingA.id } })).status).not.toBe('sold');

    const mineB = await svc.findMine(me, undefined, scopeB);
    expect(mineB.map((l: any) => l.id)).not.toContain(undefined);
    expect(mineB.every((l: any) => l.workspaceId == null || l.workspaceId === B.workspace.id)).toBe(true);
    const mineLegacy = await svc.findMine(me, undefined, scopeLegacy);
    expect(mineLegacy.every((l: any) => l.workspaceId == null)).toBe(true);

    await expect(svc.markAsSold(listingA.id, me, scopeA)).resolves.toBeDefined();
    await expect(svc.remove(legacyListing.id, me, false, scopeLegacy)).resolves.toBeDefined();
  });

  // ── orders ────────────────────────────────────────────────────────────────
  it('orders: B / legacy Seller cannot ship, hand over, prove shipping or settle COD on A\'s order; A passes the scope gate', async () => {
    if (!reachable) return;
    const svc: any = Object.create(OrdersService.prototype);
    const order = { id: 7, seller: { id: owner.id }, buyer: null, product: { workspaceId: A.workspace.id }, status: 'delivered', paymentMethod: 'cod' };
    svc.repo = { findOne: async () => order };
    const me = ownerUser();
    const calls = (scope: SellerScope) => [
      () => svc.markShipped(7, me, scope),
      () => svc.uploadShippingProof(7, me, { trackingNumber: 't', shippingReceiptImage: 'r', shippingProductImage: 'p' }, scope),
      () => svc.sellerHandToSuperAgent(7, me, { superAgentCity: 'Dar' }, scope),
      () => svc.sellerCollectCodBalance(7, me, scope),
    ];
    for (const scope of [scopeB, scopeLegacy]) {
      for (const call of calls(scope)) await expect(call()).rejects.toMatchObject({ response: { code: MISMATCH } });
    }
    // A passes the Business-scope gate (fails later, on order state, with a domain error — not MISMATCH)
    for (const call of calls(scopeA)) {
      const err: any = await call().then(() => null, (e: any) => e);
      expect(err?.response?.code).not.toBe(MISMATCH);
      expect(err).toBeInstanceOf(BadRequestException);
    }
  });

  it('a request carrying A\'s ids cannot retarget: scope has no payload input; route ids only identify the target which must belong to the active context', async () => {
    if (!reachable) return;
    // resolveScope accepts only (legacySellerId, user, roleContext): there is no parameter through which
    // a body/query workspaceId, businessId, sellerProfileId or commerceProfileId could be supplied.
    expect(SellerScopeService.prototype.resolveScope.length).toBeLessThanOrEqual(3);
    const spoofed = await scopes.resolveScope(owner.id, owner, ctxB);
    expect(spoofed.workspaceId).toBe(B.workspace.id);
    expect(() => { throw new ForbiddenException(); }).toThrow(); // sanity
  });
});
