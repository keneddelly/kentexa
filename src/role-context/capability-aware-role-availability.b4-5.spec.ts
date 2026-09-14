import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { RoleContextService } from './role-context.service';
import { RoleSessionEventsService } from './role-session-events.service';
import { RoleContextException } from './role-context.exception';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { AuthService } from '../auth/auth.service';
import { Business } from '../business/entities/business.entity';
import { OperationalWorkspace } from '../business/entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from '../business/entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from '../business/entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from '../business/entities/business-capability.entity';
import { BusinessCapabilityLifecycleService } from '../business/business-capability-lifecycle.service';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { User } from '../users/entities/user.entity';

/**
 * Business Capability Activation Stage B4.5 (mission §15 test matrix). Real
 * disposable Postgres, same technique as B4's own spec -- the whole point of
 * this stage is that evaluateAccountRoleAvailability's live capability check
 * can only be genuinely proven against a real database.
 */
describe('Capability-aware role availability (Stage B4.5), real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b4_5_availability_test';
  const ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
    Agent, SuperAgent, TransportProvider, User,
  ];

  let reachable = false;
  let adminClient: Client;
  let ds: DataSource;
  let roleContextService: RoleContextService;
  let lifecycleService: BusinessCapabilityLifecycleService;
  let authService: AuthService;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const membershipRepo = () => ds.getRepository(BusinessMembership);
  const assignmentRepo = () => ds.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => ds.getRepository(BusinessCapability);
  const sellerProfileRepo = () => ds.getRepository(SellerProfile);
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const sessionRepo = () => ds.getRepository(ActiveRoleSession);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b45-test.local`, phone: `+2559${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  const makeSellerWorkspace = async (owner: any) => {
    const n = ++seq;
    const business = await businessRepo().save(businessRepo().create({ legalName: `Co ${n}`, tradingName: `Co ${n}`, user: owner } as any));
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await membershipRepo().save(membershipRepo().create({
      businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
    } as any));
    const assignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    const profile = await sellerProfileRepo().save(sellerProfileRepo().create({
      user: owner, userId: owner.id, businessId: business.id, businessName: business.tradingName, status: SellerStatus.APPROVED,
    } as any));
    const role = await accountRoleRepo().save(accountRoleRepo().create({
      userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: profile.id, capabilities: {},
      contextVersion: 1, workspaceAssignmentId: assignment.id,
    } as any));
    const capability = await capabilityRepo().save(capabilityRepo().create({
      workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE,
      approvedAt: new Date(), approvedByUserId: owner.id,
    } as any));
    return { business, workspace, membership, assignment, profile, role, capability };
  };

  const makeBuyerRole = async (owner: any) => accountRoleRepo().save(accountRoleRepo().create({
    userId: owner.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.USER, profileId: owner.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
  } as any));

  const makeSession = async (role: AccountRole) => sessionRepo().save(sessionRepo().create({
    userId: role.userId, accountRoleId: role.id, contextVersion: role.contextVersion,
    expiresAt: new Date(Date.now() + 86400000),
  } as any));

  const fakeContextFor = (role: AccountRole, session: ActiveRoleSession) => ({
    userId: role.userId, accountRoleId: role.id, roleType: role.roleType,
    profileType: role.profileType!, profileId: role.profileId!, capabilities: [],
    sessionId: session.id, contextVersion: role.contextVersion,
  });

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }

    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminClient.end();

    ds = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: true, entities: ENTITIES,
    });
    await ds.initialize();

    roleContextService = new RoleContextService(
      userRepo(), accountRoleRepo(), sessionRepo(), sellerProfileRepo(),
      ds.getRepository(Agent), ds.getRepository(SuperAgent), ds.getRepository(TransportProvider),
      assignmentRepo(), new RoleSessionEventsService(),
    );
    lifecycleService = new BusinessCapabilityLifecycleService(capabilityRepo(), ds, roleContextService);
    // switchRole/login never touch userRepo/smsService/mailService/
    // commerceProfiles/policyVersions/verification -- stubbed since real
    // instances would need far more setup than this stage's actual code
    // path exercises.
    authService = new AuthService(
      null as any, { sign: () => 'stub-token' } as any, null as any, null as any,
      null as any, null as any, null as any, roleContextService,
    );
  }, 60000);

  afterAll(async () => {
    if (!reachable) return;
    if (ds?.isInitialized) await ds.destroy();
    const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
  }, 90000);

  describe('evaluateAccountRoleAvailability — truth table (mission §4)', () => {
    it('AccountRole ACTIVE + Commerce ACTIVE => switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { role } = await makeSellerWorkspace(owner);
      const result = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(result).toEqual({ switchable: true, reason: null });
    });

    it('AccountRole ACTIVE + Commerce SUSPENDED => not switchable, reason distinguishes organizational entitlement', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(capability.id, admin, 'organizational suspension');

      const result = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(result.switchable).toBe(false);
      expect(result.reason).toBe('ROLE_CONTEXT_CAPABILITY_INACTIVE');
      const persistedRole = await accountRoleRepo().findOne({ where: { id: role.id } });
      expect(persistedRole?.status).toBe(AccountRoleStatus.ACTIVE); // human authority untouched
    });

    it('AccountRole SUSPENDED + Commerce ACTIVE => not switchable because of human authority, not organizational reason', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { role } = await makeSellerWorkspace(owner);
      await accountRoleRepo().update(role.id, { status: AccountRoleStatus.SUSPENDED });
      const suspendedRole = await accountRoleRepo().findOne({ where: { id: role.id } });

      const result = await roleContextService.evaluateAccountRoleAvailability(suspendedRole!);
      expect(result).toEqual({ switchable: false, reason: 'ROLE_NOT_ACTIVE' });
    });

    it('AccountRole SUSPENDED + Commerce SUSPENDED => not switchable, reason stays ROLE_NOT_ACTIVE (human-authority check runs first, stays distinguishable)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(capability.id, admin, 'organizational suspension too');
      await accountRoleRepo().update(role.id, { status: AccountRoleStatus.SUSPENDED });
      const bothSuspendedRole = await accountRoleRepo().findOne({ where: { id: role.id } });

      const result = await roleContextService.evaluateAccountRoleAvailability(bothSuspendedRole!);
      expect(result).toEqual({ switchable: false, reason: 'ROLE_NOT_ACTIVE' });
    });

    it('reactivated Commerce + still-ACTIVE AccountRole => switchable again', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(capability.id, admin, 'temporary');
      await lifecycleService.reactivate(capability.id, admin);

      const result = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(result).toEqual({ switchable: true, reason: null });
    });

    it('reactivated Commerce + individually-SUSPENDED AccountRole => remains not switchable (ROLE_NOT_ACTIVE)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      await accountRoleRepo().update(role.id, { status: AccountRoleStatus.SUSPENDED });
      await lifecycleService.suspend(capability.id, admin, 'temporary');
      await lifecycleService.reactivate(capability.id, admin);
      const persistedRole = await accountRoleRepo().findOne({ where: { id: role.id } });

      const result = await roleContextService.evaluateAccountRoleAvailability(persistedRole!);
      expect(result).toEqual({ switchable: false, reason: 'ROLE_NOT_ACTIVE' });
    });

    it('legacy unbound mapped role (no workspaceAssignmentId) is unaffected by any capability state — skips the org/capability check entirely', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const unboundRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE,
        profileId: (await sellerProfileRepo().save(sellerProfileRepo().create({ user: owner, userId: owner.id, businessName: 'Legacy Co' } as any))).id,
        capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const result = await roleContextService.evaluateAccountRoleAvailability(unboundRole);
      expect(result).toEqual({ switchable: true, reason: null });
    });

    it('Buyer role behavior is unaffected by any capability suspension', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      const buyerRole = await makeBuyerRole(owner);
      await lifecycleService.suspend(capability.id, admin, 'unrelated to buyer');

      const result = await roleContextService.evaluateAccountRoleAvailability(buyerRole);
      expect(result).toEqual({ switchable: true, reason: null });
    });
  });

  describe('GET /auth/roles (listRoles) — mission §5, §11, §12', () => {
    it('shows an ACTIVE Seller with SUSPENDED Commerce as visible, switchable:false, with a stable reason — membership is never hidden', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(capability.id, admin, 'compliance hold');

      const rows = await roleContextService.listRoles(owner.id);
      const row = rows.find((r) => r.accountRoleId === role.id);
      expect(row).toBeDefined();
      expect(row!.status).toBe(AccountRoleStatus.ACTIVE);
      expect(row!.switchable).toBe(false);
      expect(row!.reason).toBe('ROLE_CONTEXT_CAPABILITY_INACTIVE');
      // Business/workspace identity is still surfaced -- a suspended
      // capability must not collapse this into looking like an unbound row.
      expect(row!.businessId).not.toBeNull();
      expect(row!.workspaceId).not.toBeNull();
    });

    it('same user, two Businesses: A suspended is not switchable with an organizational reason, B stays switchable — never scoped by userId+roleType alone', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const a = await makeSellerWorkspace(owner);
      const b = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(a.capability.id, admin, 'Business A specific');

      const rows = await roleContextService.listRoles(owner.id);
      const rowA = rows.find((r) => r.accountRoleId === a.role.id)!;
      const rowB = rows.find((r) => r.accountRoleId === b.role.id)!;
      expect(rowA.switchable).toBe(false);
      expect(rowA.reason).toBe('ROLE_CONTEXT_CAPABILITY_INACTIVE');
      expect(rowB.switchable).toBe(true);
      expect(rowB.reason).toBeNull();
    });
  });

  describe('POST /auth/switch-role — mission §6, §14', () => {
    it('active Seller + active Commerce succeeds', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role } = await makeSellerWorkspace(owner);
      const buyerSession = await makeSession(buyer);

      const result = await authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {});
      expect(result).toBeTruthy();
      const newSession = await sessionRepo().findOne({ where: { accountRoleId: role.id }, order: { createdAt: 'DESC' } });
      expect(newSession?.revokedAt).toBeNull();
    });

    it('active Seller + suspended Commerce is rejected with ORGANIZATIONAL_CAPABILITY_INACTIVE (not the generic/misleading ROLE_NOT_SWITCHABLE), creates no session, issues no token', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role, capability } = await makeSellerWorkspace(owner);
      const buyerSession = await makeSession(buyer);
      await lifecycleService.suspend(capability.id, admin, 'compliance hold');

      const sessionCountBefore = await sessionRepo().count({ where: { accountRoleId: role.id } });

      await expect(authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {}))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });

      const sessionCountAfter = await sessionRepo().count({ where: { accountRoleId: role.id } });
      expect(sessionCountAfter).toBe(sessionCountBefore); // no session created for the rejected target
      const buyerSessionRow = await sessionRepo().findOne({ where: { id: buyerSession.id } });
      expect(buyerSessionRow?.revokedAt).toBeNull(); // the CALLER's own current session is untouched by a rejected switch
    });

    it('a stale /auth/roles read of switchable:true cannot bypass fresh switch-role validation (mission §7 race)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role, capability } = await makeSellerWorkspace(owner);
      const buyerSession = await makeSession(buyer);

      // T0: discover availability.
      const rowsBefore = await roleContextService.listRoles(owner.id);
      expect(rowsBefore.find((r) => r.accountRoleId === role.id)!.switchable).toBe(true);

      // T1: admin suspends Commerce, entirely independent of the client.
      await lifecycleService.suspend(capability.id, admin, 'suspended right after discovery');

      // T2: the switch must fail despite the stale switchable:true above.
      await expect(authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {}))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('another Business remains switchable while the first is rejected', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const a = await makeSellerWorkspace(owner);
      const b = await makeSellerWorkspace(owner);
      const buyerSession1 = await makeSession(buyer);
      await lifecycleService.suspend(a.capability.id, admin, 'A only');

      await expect(authService.switchRole(owner, fakeContextFor(buyer, buyerSession1) as any, a.role.id, {}))
        .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' } });

      const buyerSession2 = await makeSession(buyer);
      const result = await authService.switchRole(owner, fakeContextFor(buyer, buyerSession2) as any, b.role.id, {});
      expect(result).toBeTruthy();
    });

    it('a session created moments before suspension becomes unusable immediately after (B4 revocation still holds under B4.5)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role, capability } = await makeSellerWorkspace(owner);
      const buyerSession = await makeSession(buyer);

      await authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {});
      const freshSession = await sessionRepo().findOne({ where: { accountRoleId: role.id }, order: { createdAt: 'DESC' } });

      await lifecycleService.suspend(capability.id, admin, 'suspended moments after switch');

      await expect(roleContextService.resolveContext({
        sub: owner.id, sid: freshSession!.id, rid: role.id, rt: role.roleType, cv: role.contextVersion,
      })).rejects.toMatchObject({ message: 'ROLE_CONTEXT_REVOKED' });
    });
  });

  describe('login role selection — mission §8', () => {
    it('a capability-suspended last-device Seller role is not selected at login; falls back to Buyer', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role, capability } = await makeSellerWorkspace(owner);
      await sessionRepo().save(sessionRepo().create({
        userId: owner.id, accountRoleId: role.id, contextVersion: role.contextVersion,
        deviceId: 'device-1', expiresAt: new Date(Date.now() + 86400000),
      } as any));
      await lifecycleService.suspend(capability.id, admin, 'suspended before next login');

      const selected = await roleContextService.selectRoleForLogin(owner, 'device-1');
      expect(selected.id).toBe(buyer.id);
    });

    it('an ACTIVE Commerce Seller role is still selected normally at login (unchanged behavior)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { role } = await makeSellerWorkspace(owner);
      await sessionRepo().save(sessionRepo().create({
        userId: owner.id, accountRoleId: role.id, contextVersion: role.contextVersion,
        deviceId: 'device-2', expiresAt: new Date(Date.now() + 86400000),
      } as any));

      const selected = await roleContextService.selectRoleForLogin(owner, 'device-2');
      expect(selected.id).toBe(role.id);
    });
  });

  describe('reactivation does not restore sessions/context — mission §10', () => {
    it('after reactivation the role is switchable again in listRoles, but no session/JWT was created automatically and the OLD revoked session stays revoked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const { role, capability } = await makeSellerWorkspace(owner);
      const buyerSession = await makeSession(buyer);
      await authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {});
      const oldSellerSession = await sessionRepo().findOne({ where: { accountRoleId: role.id }, order: { createdAt: 'DESC' } });

      await lifecycleService.suspend(capability.id, admin, 'temporary');
      const sessionCountAtSuspend = await sessionRepo().count({ where: { accountRoleId: role.id } });
      await lifecycleService.reactivate(capability.id, admin);

      const rows = await roleContextService.listRoles(owner.id);
      expect(rows.find((r) => r.accountRoleId === role.id)!.switchable).toBe(true);

      const sessionCountAfterReactivate = await sessionRepo().count({ where: { accountRoleId: role.id } });
      expect(sessionCountAfterReactivate).toBe(sessionCountAtSuspend); // no new session created by reactivation itself
      const persistedOldSession = await sessionRepo().findOne({ where: { id: oldSellerSession!.id } });
      expect(persistedOldSession?.revokedAt).toBeTruthy(); // never un-revoked
    });
  });

  describe('regression — B4 revocation, RoleContext enforcement, legacy/Buyer, multiple same-roleType AccountRoles', () => {
    it('RoleContextGuard-equivalent resolveContext still denies a suspended-capability session live (unchanged B4 behavior)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      const session = await makeSession(role);
      await lifecycleService.suspend(capability.id, admin, 'regression check');

      await expect(roleContextService.resolveContext({
        sub: owner.id, sid: session.id, rid: role.id, rt: role.roleType, cv: role.contextVersion,
      })).rejects.toMatchObject({ message: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
    });

    it('two AccountRoles of the same roleType (SELLER) for two different Businesses are never collapsed into one — each independently evaluable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const a = await makeSellerWorkspace(owner);
      const b = await makeSellerWorkspace(owner);
      await lifecycleService.suspend(a.capability.id, admin, 'A suspended');

      const rows = await roleContextService.listRoles(owner.id);
      const sellerRows = rows.filter((r) => r.roleType === AccountRoleType.SELLER);
      expect(sellerRows.length).toBe(2);
      expect(sellerRows.find((r) => r.accountRoleId === a.role.id)!.switchable).toBe(false);
      expect(sellerRows.find((r) => r.accountRoleId === b.role.id)!.switchable).toBe(true);
    });
  });
});
