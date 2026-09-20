import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
} from '../business/b5b-closure-test-db';
import { RoleContextService } from './role-context.service';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { Business, BusinessStatus } from '../business/entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from '../business/entities/business-capability.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { ServiceProvider, ServiceProviderStatus } from '../service-providers/entities/service-provider.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { User } from '../users/entities/user.entity';

/**
 * I2A — canonical active-context identity. Real disposable schema in the
 * dedicated kentexa_b5b_test database (shared B5B harness). Proves WHO is
 * acting (identityType/businessId/displayName/commerceProfileId) is resolved
 * server-side from the validated authority chain, separately from WHAT
 * authority is active (roleType/capabilities).
 */
describe('I2A — canonical active-context identity, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: RoleContextService;
  let seq = 0;

  const repo = <T>(e: new () => T) => ds.getRepository(e as any) as any;

  const makeUser = async (name: string) => {
    const n = ++seq;
    return repo(User).save(repo(User).create({
      email: `u${n}@i2a.local`, phone: `+2552${String(n).padStart(8, '0')}`, password: 'x', name, avatarUrl: `https://img/${name}.png`,
    }));
  };

  const makeBusiness = async (owner: User, tradingName: string, logo: string | null = null) => {
    const business = await repo(Business).save(repo(Business).create({
      legalName: `${tradingName} Ltd`, tradingName, user: owner, status: BusinessStatus.ACTIVE, logo,
    }));
    const workspace = await repo(OperationalWorkspace).save(repo(OperationalWorkspace).create({
      businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE,
    }));
    const membership = await repo(BusinessMembership).save(repo(BusinessMembership).create({
      businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
    }));
    const assignment = await repo(WorkspaceAssignment).save(repo(WorkspaceAssignment).create({
      businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    }));
    return { business, workspace, membership, assignment };
  };

  const grantCommerce = (workspaceId: number, status = BusinessCapabilityStatus.ACTIVE) =>
    repo(BusinessCapability).save(repo(BusinessCapability).create({
      workspaceId, capabilityCode: BusinessCapabilityCode.COMMERCE, status,
    }));

  const makeRole = (userId: number, roleType: AccountRoleType, profileType: RoleProfileType, profileId: number, workspaceAssignmentId: number | null) =>
    repo(AccountRole).save(repo(AccountRole).create({
      userId, roleType, status: AccountRoleStatus.ACTIVE, profileType, profileId, workspaceAssignmentId, capabilities: {}, contextVersion: 1,
    }));

  const makeSeller = (user: User, businessId: number | null) =>
    repo(SellerProfile).save(repo(SellerProfile).create({
      user, businessId, businessName: 'x', status: SellerStatus.APPROVED,
    }));

  const makeServiceProvider = (user: User, businessId: number) =>
    repo(ServiceProvider).save(repo(ServiceProvider).create({
      user, userId: user.id, businessId, businessName: 'svc', status: ServiceProviderStatus.APPROVED,
    }));

  const makeCommerceProfile = (ownerId: number, type: CommerceProfileType, displayName: string, businessId: number | null = null) => {
    const n = ++seq;
    return repo(CommerceProfile).save(repo(CommerceProfile).create({
      ownerId, type, displayName, username: `h${n}`, businessId,
    }));
  };

  const contextFor = async (role: AccountRole) => {
    const session = await repo(ActiveRoleSession).save(repo(ActiveRoleSession).create({
      userId: role.userId, accountRoleId: role.id, contextVersion: role.contextVersion,
      expiresAt: new Date(Date.now() + 60_000),
    }));
    return service.resolveContext({ sub: role.userId, sid: session.id, rid: role.id, rt: role.roleType, cv: role.contextVersion });
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
    service = new RoleContextService(
      repo(User), repo(AccountRole), repo(ActiveRoleSession), repo(SellerProfile),
      {} as any, {} as any, {} as any, repo(WorkspaceAssignment), { emitRevoked: jest.fn() } as any,
    );
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('§0 disposable database reachable', () => {
    expect(reachable).toBe(true);
  });

  it('Bob Personal (buyer) → Bob / PERSONAL, no Business inferred even though Bob owns one', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    await makeBusiness(bob, 'Washing Machine TZ');
    const buyer = await makeRole(bob.id, AccountRoleType.BUYER, RoleProfileType.USER, bob.id, null);
    const ctx = await contextFor(buyer);
    expect(ctx).toMatchObject({ identityType: 'PERSONAL', displayName: 'Bob', businessId: null, workspaceId: null });
    expect(ctx.photoUrl).toBe('https://img/Bob.png');
  });

  it('Bob legacy unbound Seller stays Personal — never attached to Washing Machine TZ', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    await makeBusiness(bob, 'Washing Machine TZ');
    const seller = await makeSeller(bob, null);
    const role = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, seller.id, null);
    const ctx = await contextFor(role);
    expect(ctx.identityType).toBe('PERSONAL');
    expect(ctx.displayName).toBe('Bob');
    expect(ctx.businessId).toBeNull();
    expect(ctx.roleType).toBe(AccountRoleType.SELLER);
  });

  it('canonical Washing Machine TZ Seller → Washing Machine TZ / BUSINESS, never user.name', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ', 'https://img/wm.png');
    await grantCommerce(wm.workspace.id);
    const seller = await makeSeller(bob, wm.business.id);
    const role = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, seller.id, wm.assignment.id);
    const ctx = await contextFor(role);
    expect(ctx).toMatchObject({
      identityType: 'BUSINESS', displayName: 'Washing Machine TZ', photoUrl: 'https://img/wm.png',
      businessId: wm.business.id, workspaceId: wm.workspace.id,
    });
    expect(ctx.displayName).not.toBe('Bob');
  });

  it('same Business Seller + Service → identical identity, distinct authority; Bob Electronics stays isolated', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    const be = await makeBusiness(bob, 'Bob Electronics');
    await grantCommerce(wm.workspace.id);
    await grantCommerce(be.workspace.id);
    await repo(BusinessCapability).save(repo(BusinessCapability).create({
      workspaceId: wm.workspace.id, capabilityCode: BusinessCapabilityCode.SERVICE, status: BusinessCapabilityStatus.ACTIVE,
    }));
    const wmSeller = await makeSeller(bob, wm.business.id);
    const wmService = await makeServiceProvider(bob, wm.business.id);
    const beSeller = await makeSeller(bob, be.business.id);
    const wmSellerRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, wmSeller.id, wm.assignment.id);
    const wmServiceRole = await makeRole(bob.id, AccountRoleType.SERVICE_PROVIDER, RoleProfileType.SERVICE_PROVIDER, wmService.id, wm.assignment.id);
    const beSellerRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, beSeller.id, be.assignment.id);

    const a = await contextFor(wmSellerRole);
    const b = await contextFor(wmServiceRole);
    const c = await contextFor(beSellerRole);

    expect(a.businessId).toBe(b.businessId);
    expect(a.displayName).toBe(b.displayName);
    expect(a.identityType).toBe(b.identityType);
    expect(a.roleType).not.toBe(b.roleType);
    expect(c).toMatchObject({ identityType: 'BUSINESS', displayName: 'Bob Electronics', businessId: be.business.id });
    expect(c.businessId).not.toBe(a.businessId);

    const roles = await service.listRoles(bob.id);
    const byId = new Map(roles.map((r: any) => [r.accountRoleId, r]));
    expect(byId.get(wmSellerRole.id)).toMatchObject({ identityType: 'BUSINESS', displayName: 'Washing Machine TZ' });
    expect(byId.get(wmServiceRole.id)).toMatchObject({ identityType: 'BUSINESS', displayName: 'Washing Machine TZ' });
    expect(byId.get(beSellerRole.id)).toMatchObject({ identityType: 'BUSINESS', displayName: 'Bob Electronics' });
  });

  it('switching Business → Personal fully changes identity (same user, coherent /auth/roles rows)', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const wm = await makeBusiness(bob, 'Washing Machine TZ');
    await grantCommerce(wm.workspace.id);
    const seller = await makeSeller(bob, wm.business.id);
    const buyer = await makeRole(bob.id, AccountRoleType.BUYER, RoleProfileType.USER, bob.id, null);
    const bizRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, seller.id, wm.assignment.id);
    const biz = await contextFor(bizRole);
    const personal = await contextFor(buyer);
    expect(biz.identityType).toBe('BUSINESS');
    expect(personal.identityType).toBe('PERSONAL');
    expect(personal.businessId).toBeNull();
    expect(personal.displayName).toBe('Bob');
    expect(biz.displayName).toBe('Washing Machine TZ');
  });

  it('broken organizational authority fails closed — no Personal/other fallback identity', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const suspended = await makeBusiness(bob, 'Suspended Cap Co');
    await grantCommerce(suspended.workspace.id, BusinessCapabilityStatus.SUSPENDED);
    const s1 = await makeSeller(bob, suspended.business.id);
    const r1 = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s1.id, suspended.assignment.id);
    await expect(contextFor(r1)).rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });

    const revoked = await makeBusiness(bob, 'Revoked Assignment Co');
    await grantCommerce(revoked.workspace.id);
    const s2 = await makeSeller(bob, revoked.business.id);
    const r2 = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s2.id, revoked.assignment.id);
    await repo(WorkspaceAssignment).update(revoked.assignment.id, { status: WorkspaceAssignmentStatus.REVOKED });
    await expect(contextFor(r2)).rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED' } });

    const revokedMembership = await makeBusiness(bob, 'Revoked Membership Co');
    await grantCommerce(revokedMembership.workspace.id);
    const s3 = await makeSeller(bob, revokedMembership.business.id);
    const r3 = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s3.id, revokedMembership.assignment.id);
    await repo(BusinessMembership).update(revokedMembership.membership.id, { status: BusinessMembershipStatus.REVOKED });
    await expect(contextFor(r3)).rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED' } });
  });

  it('commerceProfileId: exact Business profile only when unambiguous; never guessed by ownerId', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const one = await makeBusiness(bob, 'Single Profile Co');
    const two = await makeBusiness(bob, 'Ambiguous Profile Co');
    const none = await makeBusiness(bob, 'No Profile Co');
    for (const b of [one, two, none]) await grantCommerce(b.workspace.id);
    const p1 = await makeCommerceProfile(bob.id, CommerceProfileType.BUSINESS, 'Single Profile Co', one.business.id);
    await makeCommerceProfile(bob.id, CommerceProfileType.BUSINESS, 'Amb A', two.business.id);
    await makeCommerceProfile(bob.id, CommerceProfileType.BUSINESS, 'Amb B', two.business.id);
    // An unrelated BUSINESS profile of the same owner must never be adopted by ownerId lookup.
    await makeCommerceProfile(bob.id, CommerceProfileType.BUSINESS, 'Unlinked Bob Biz', null);

    const ctxs: any[] = [];
    for (const b of [one, two, none]) {
      const s = await makeSeller(bob, b.business.id);
      const role = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s.id, b.assignment.id);
      ctxs.push(await contextFor(role));
    }
    expect(ctxs[0].commerceProfileId).toBe(p1.id);
    expect(ctxs[1].commerceProfileId).toBeNull();
    expect(ctxs[2].commerceProfileId).toBeNull();
  });

  it('commerceProfileId for Personal: own PERSONAL profile only when exactly one exists', async () => {
    if (!reachable) return;
    const single = await makeUser('Solo');
    const personal = await makeCommerceProfile(single.id, CommerceProfileType.PERSONAL, 'Solo');
    await makeCommerceProfile(single.id, CommerceProfileType.BUSINESS, 'Solo Biz');
    const dup = await makeUser('Dup');
    await makeCommerceProfile(dup.id, CommerceProfileType.PERSONAL, 'Dup1');
    await makeCommerceProfile(dup.id, CommerceProfileType.PERSONAL, 'Dup2');
    const r1 = await makeRole(single.id, AccountRoleType.BUYER, RoleProfileType.USER, single.id, null);
    const r2 = await makeRole(dup.id, AccountRoleType.BUYER, RoleProfileType.USER, dup.id, null);
    expect((await contextFor(r1)).commerceProfileId).toBe(personal.id);
    expect((await contextFor(r2)).commerceProfileId).toBeNull();
  });

  it('/auth/roles: a broken organizational role is UNRESOLVED (never Bob/Personal) and non-switchable, while Bob\'s legacy unbound Seller stays Personal', async () => {
    if (!reachable) return;
    const bob = await makeUser('Bob');
    const legacySeller = await makeSeller(bob, null);
    const legacyRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, legacySeller.id, null);

    const suspended = await makeBusiness(bob, 'Suspended Cap Co');
    await grantCommerce(suspended.workspace.id, BusinessCapabilityStatus.SUSPENDED);
    const s1 = await makeSeller(bob, suspended.business.id);
    const suspendedRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s1.id, suspended.assignment.id);

    const revoked = await makeBusiness(bob, 'Revoked Assignment Co');
    await grantCommerce(revoked.workspace.id);
    const s2 = await makeSeller(bob, revoked.business.id);
    const revokedRole = await makeRole(bob.id, AccountRoleType.SELLER, RoleProfileType.SELLER_PROFILE, s2.id, revoked.assignment.id);
    await repo(WorkspaceAssignment).update(revoked.assignment.id, { status: WorkspaceAssignmentStatus.REVOKED });

    const rows = new Map((await service.listRoles(bob.id)).map((r: any) => [r.accountRoleId, r]));

    for (const broken of [rows.get(suspendedRole.id), rows.get(revokedRole.id)] as any[]) {
      expect(broken.switchable).toBe(false);
      expect(broken.identityType).toBeNull();
      expect(broken.displayName).toBeNull();
      expect(broken.photoUrl).toBeNull();
      expect(broken.commerceProfileId).toBeNull();
      expect(broken.displayName).not.toBe('Bob');
      expect(broken.displayName).not.toBe('User');
    }
    expect(rows.get(suspendedRole.id)).toMatchObject({ reason: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
    expect(rows.get(revokedRole.id)).toMatchObject({ reason: 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED' });

    expect(rows.get(legacyRole.id)).toMatchObject({ switchable: true, identityType: 'PERSONAL', displayName: 'Bob', businessId: null });
  });
});
