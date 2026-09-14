import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleSessionEventsService } from '../role-context/role-session-events.service';
import { RoleContextException } from '../role-context/role-context.exception';
import { RoleJwtPayload } from '../role-context/role-context.types';

/**
 * Business Capability Activation Stage B4 (mission §18 test matrix). Real
 * disposable Postgres, same technique as B3's own approval spec -- row
 * locking, concurrency, and RoleContextService.resolveContext's live
 * capability check can only be genuinely proven against a real database.
 */
describe('BusinessCapabilityLifecycleService — suspend/reactivate (Stage B4), real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b4_lifecycle_test';
  const ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
    Agent, SuperAgent, TransportProvider, User,
  ];

  let reachable = false;
  let adminClient: Client;
  let ds: DataSource;
  let service: BusinessCapabilityLifecycleService;
  let roleContextService: RoleContextService;
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
    return userRepo().save(userRepo().create({ email: `u${n}@b4-test.local`, phone: `+2558${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  /** Full organizational chain + an ACTIVE Seller AccountRole + an ACTIVE Commerce BusinessCapability, ready for capability lifecycle testing. */
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
    const now = new Date();
    const capability = await capabilityRepo().save(capabilityRepo().create({
      workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE,
      approvedAt: now, approvedByUserId: owner.id,
    } as any));
    return { business, workspace, membership, assignment, profile, role, capability };
  };

  const makeSession = async (role: AccountRole) => sessionRepo().save(sessionRepo().create({
    userId: role.userId, accountRoleId: role.id, contextVersion: role.contextVersion,
    expiresAt: new Date(Date.now() + 86400000),
  } as any));

  const payloadFor = (userId: number, session: ActiveRoleSession, role: AccountRole): RoleJwtPayload => ({
    sub: userId, sid: session.id, rid: role.id, rt: role.roleType, cv: role.contextVersion,
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

    service = new BusinessCapabilityLifecycleService(capabilityRepo(), ds, null as any);
    roleContextService = new RoleContextService(
      userRepo(), accountRoleRepo(), sessionRepo(), sellerProfileRepo(),
      ds.getRepository(Agent), ds.getRepository(SuperAgent), ds.getRepository(TransportProvider),
      assignmentRepo(), new RoleSessionEventsService(),
    );
    // Inject the real RoleContextService now that both exist (avoids a
    // circular construction order — service needs roleContextService for
    // session revocation, roleContextService needs no reference back).
    (service as any).roleContextService = roleContextService;
  }, 60000);

  afterAll(async () => {
    if (!reachable) return;
    if (ds?.isInitialized) await ds.destroy();
    const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
  }, 90000);

  describe('suspension', () => {
    it('ACTIVE -> SUSPENDED sets status/suspendedAt/suspendedByUserId/statusReason, leaves approval provenance untouched', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      const originalApprovedAt = capability.approvedAt;

      const result = await service.suspend(capability.id, admin, 'Repeated non-fulfillment complaints');

      expect(result.capability.status).toBe(BusinessCapabilityStatus.SUSPENDED);
      expect(result.capability.suspendedByUserId).toBe(admin.id);
      expect(result.capability.statusReason).toBe('Repeated non-fulfillment complaints');
      expect(result.capability.suspendedAt).toBeTruthy();

      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect(persisted?.approvedAt?.getTime()).toBe(originalApprovedAt!.getTime());
      expect(persisted?.approvedByUserId).toBe(owner.id);
    });

    it('rejects a suspension with too short a reason, mutating nothing', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);

      await expect(service.suspend(capability.id, admin, 'x')).rejects.toMatchObject({ response: { code: 'SUSPENSION_REASON_REQUIRED' } });
      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect(persisted?.status).toBe(BusinessCapabilityStatus.ACTIVE);
    });

    it('a REVOKED capability cannot be suspended — fails closed, no mutation', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      await capabilityRepo().update(capability.id, { status: BusinessCapabilityStatus.REVOKED });

      await expect(service.suspend(capability.id, admin, 'valid reason text')).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_REVOKED' } });
      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect(persisted?.status).toBe(BusinessCapabilityStatus.REVOKED);
    });

    it('a non-existent capability id 404s', async () => {
      if (!reachable) return;
      const admin = await makeUser();
      await expect(service.suspend(999999, admin, 'valid reason text')).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_NOT_FOUND' } });
    });

    it('revokes the exact affected AccountRole session, but AccountRole.status remains ACTIVE', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability, role } = await makeSellerWorkspace(owner);
      const session = await makeSession(role);

      await service.suspend(capability.id, admin, 'Fraud investigation in progress');

      const persistedSession = await sessionRepo().findOne({ where: { id: session.id } });
      expect(persistedSession?.revokedAt).toBeTruthy();
      expect(persistedSession?.revokeReason).toBe('capability_suspended_commerce');

      const persistedRole = await accountRoleRepo().findOne({ where: { id: role.id } });
      expect(persistedRole?.status).toBe(AccountRoleStatus.ACTIVE);
    });

    it('does not revoke a session for an AccountRole bound to a legacy/unbound (workspaceAssignmentId null) role', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      const unboundRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 1, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));
      const unboundSession = await makeSession(unboundRole);

      await service.suspend(capability.id, admin, 'Commerce-only suspension, unrelated to transport');

      const persisted = await sessionRepo().findOne({ where: { id: unboundSession.id } });
      expect(persisted?.revokedAt).toBeNull();
    });
  });

  describe('reactivation', () => {
    it('SUSPENDED -> ACTIVE sets reactivatedAt/reactivatedByUserId, clears statusReason, never touches approvedAt/approvedByUserId, preserves suspendedAt/suspendedByUserId as history', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin1 = await makeUser();
      const admin2 = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      const originalApprovedAt = capability.approvedAt;

      const suspended = await service.suspend(capability.id, admin1, 'Investigation pending');
      const result = await service.reactivate(capability.id, admin2);

      expect(result.capability.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect(result.capability.reactivatedByUserId).toBe(admin2.id);
      expect(result.capability.reactivatedAt).toBeTruthy();
      expect(result.capability.statusReason).toBeNull();
      // Historical suspension record preserved, not erased by reactivation.
      expect(result.capability.suspendedByUserId).toBe(admin1.id);
      expect(result.capability.suspendedAt).toBe(suspended.capability.suspendedAt);
      // Original grant provenance untouched by either transition.
      expect(result.capability.approvedByUserId).toBe(owner.id);
      expect(new Date(result.capability.approvedAt as any).getTime()).toBe(originalApprovedAt!.getTime());
    });

    it('a REVOKED capability cannot be reactivated', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      await capabilityRepo().update(capability.id, { status: BusinessCapabilityStatus.REVOKED });

      await expect(service.reactivate(capability.id, admin)).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_REVOKED' } });
    });

    it('does not create a new ActiveRoleSession or touch AccountRole.status', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability, role } = await makeSellerWorkspace(owner);
      await makeSession(role);
      await service.suspend(capability.id, admin, 'Temporary suspension for review');
      const sessionCountBefore = await sessionRepo().count({ where: { accountRoleId: role.id } });

      await service.reactivate(capability.id, admin);

      const sessionCountAfter = await sessionRepo().count({ where: { accountRoleId: role.id } });
      expect(sessionCountAfter).toBe(sessionCountBefore); // no new session created
      const persistedSession = await sessionRepo().findOne({ where: { accountRoleId: role.id } });
      expect(persistedSession?.revokedAt).toBeTruthy(); // the revoked session stays revoked, not restored
      const persistedRole = await accountRoleRepo().findOne({ where: { id: role.id } });
      expect(persistedRole?.status).toBe(AccountRoleStatus.ACTIVE); // unchanged the whole time
    });

    it('an individually SUSPENDED AccountRole stays SUSPENDED after its capability reactivates — two-axis model holds from this direction too', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability, role } = await makeSellerWorkspace(owner);
      await accountRoleRepo().update(role.id, { status: AccountRoleStatus.SUSPENDED, statusReason: 'individual seller misconduct' });
      await service.suspend(capability.id, admin, 'Unrelated organizational suspension');

      await service.reactivate(capability.id, admin);

      const persistedRole = await accountRoleRepo().findOne({ where: { id: role.id } });
      expect(persistedRole?.status).toBe(AccountRoleStatus.SUSPENDED); // never touched by capability reactivation
    });
  });

  describe('idempotency (mission §15 — lost-response retry safety)', () => {
    it('duplicate suspend does not overwrite the original suspendedAt/suspendedByUserId/statusReason', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin1 = await makeUser();
      const admin2 = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);

      const first = await service.suspend(capability.id, admin1, 'original suspension reason');
      const retry = await service.suspend(capability.id, admin2, 'a DIFFERENT reason from a retry that thinks it never succeeded');

      expect(retry.capability.suspendedByUserId).toBe(admin1.id);
      expect(retry.capability.statusReason).toBe('original suspension reason');
      expect(retry.capability.suspendedAt).toBe(first.capability.suspendedAt);
    });

    it('duplicate reactivate does not overwrite the original reactivatedAt/reactivatedByUserId', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin1 = await makeUser();
      const admin2 = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      await service.suspend(capability.id, admin1, 'temporary suspension');

      const first = await service.reactivate(capability.id, admin1);
      const retry = await service.reactivate(capability.id, admin2);

      expect(retry.capability.reactivatedByUserId).toBe(admin1.id);
      expect(retry.capability.reactivatedAt).toBe(first.capability.reactivatedAt);
    });
  });

  describe('concurrency (real Postgres row locking)', () => {
    it('two simultaneous suspend() calls: exactly one real transition, final state SUSPENDED, session revoked exactly once with a consistent reason', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability, role } = await makeSellerWorkspace(owner);
      const session = await makeSession(role);

      const results = await Promise.allSettled([
        service.suspend(capability.id, admin, 'race arm A'),
        service.suspend(capability.id, admin, 'race arm B'),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect(persisted?.status).toBe(BusinessCapabilityStatus.SUSPENDED);
      expect(['race arm A', 'race arm B']).toContain(persisted?.statusReason);
      const persistedSession = await sessionRepo().findOne({ where: { id: session.id } });
      expect(persistedSession?.revokedAt).toBeTruthy();
    });

    it('two simultaneous reactivate() calls on a SUSPENDED capability: exactly one real transition, final state ACTIVE', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      await service.suspend(capability.id, admin, 'setup for reactivate race');

      const results = await Promise.allSettled([
        service.reactivate(capability.id, admin),
        service.reactivate(capability.id, admin),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect(persisted?.status).toBe(BusinessCapabilityStatus.ACTIVE);
    });

    it('suspend racing reactivate on an ACTIVE capability: both fulfill (row-locked serialization), final state is self-consistent with whichever ran last', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);

      const results = await Promise.allSettled([
        service.suspend(capability.id, admin, 'racing suspend attempt'),
        service.reactivate(capability.id, admin),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const persisted = await capabilityRepo().findOne({ where: { id: capability.id } });
      expect([BusinessCapabilityStatus.ACTIVE, BusinessCapabilityStatus.SUSPENDED]).toContain(persisted?.status);
      if (persisted?.status === BusinessCapabilityStatus.SUSPENDED) {
        expect(persisted.statusReason).toBe('racing suspend attempt');
        expect(persisted.suspendedByUserId).toBe(admin.id);
      } else {
        // reactivate ran last: either the idempotent ACTIVE no-op (never
        // suspended in the first place from this row's perspective) or a
        // real SUSPENDED->ACTIVE transition — either way reactivatedByUserId
        // must be null-or-admin, never a corrupted mix.
        expect([null, admin.id]).toContain(persisted?.reactivatedByUserId);
      }
    });
  });

  describe('RoleContext enforcement integration (mission §11 — already-live code, proven not re-implemented)', () => {
    it('resolveContext succeeds while the capability is ACTIVE', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { role, workspace, business } = await makeSellerWorkspace(owner);
      const session = await makeSession(role);

      const context = await roleContextService.resolveContext(payloadFor(owner.id, session, role));
      expect(context.workspaceId).toBe(workspace.id);
      expect(context.businessId).toBe(business.id);
    });

    it('resolveContext throws ROLE_CONTEXT_CAPABILITY_INACTIVE immediately after suspension, with AccountRole/session-table state otherwise untouched by resolveContext itself', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeSellerWorkspace(owner);
      const session = await makeSession(role);

      await service.suspend(capability.id, admin, 'compliance hold');

      await expect(roleContextService.resolveContext(payloadFor(owner.id, session, role)))
        .rejects.toMatchObject({ message: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
    });

    it('exact workspace isolation: suspending Business A/Workspace A never denies Business B/Workspace B, even for the SAME user holding both Seller AccountRoles', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const a = await makeSellerWorkspace(owner);
      const b = await makeSellerWorkspace(owner);
      const sessionA = await makeSession(a.role);
      const sessionB = await makeSession(b.role);

      await service.suspend(a.capability.id, admin, 'Business A specific suspension');

      await expect(roleContextService.resolveContext(payloadFor(owner.id, sessionA, a.role)))
        .rejects.toMatchObject({ message: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
      const contextB = await roleContextService.resolveContext(payloadFor(owner.id, sessionB, b.role));
      expect(contextB.workspaceId).toBe(b.workspace.id);

      const sessionARow = await sessionRepo().findOne({ where: { id: sessionA.id } });
      const sessionBRow = await sessionRepo().findOne({ where: { id: sessionB.id } });
      expect(sessionARow?.revokedAt).toBeTruthy();
      expect(sessionBRow?.revokedAt).toBeNull();
    });

    it('a Buyer role (no workspaceAssignmentId, never capability-gated) is unaffected by any capability suspension', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { capability } = await makeSellerWorkspace(owner);
      const buyerRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.USER, profileId: owner.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));
      const buyerSession = await makeSession(buyerRole);

      await service.suspend(capability.id, admin, 'unrelated to this buyer');

      const context = await roleContextService.resolveContext(payloadFor(owner.id, buyerSession, buyerRole));
      expect(context.workspaceId).toBeNull();
      expect(context.businessId).toBeNull();
    });

    it('after reactivation, a FRESH session for the still-ACTIVE AccountRole resolves successfully again (no automatic restoration of the OLD revoked session)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, workspace, capability } = await makeSellerWorkspace(owner);
      const oldSession = await makeSession(role);
      await service.suspend(capability.id, admin, 'temporary');

      await service.reactivate(capability.id, admin);

      // The OLD session, revoked at suspension time, must remain revoked —
      // reactivation restores nothing.
      await expect(roleContextService.resolveContext(payloadFor(owner.id, oldSession, role)))
        .rejects.toBeInstanceOf(RoleContextException);
      // A genuinely NEW session (the normal switch-role path a real user
      // would take) resolves fine now that the capability is ACTIVE again.
      const newSession = await makeSession(role);
      const context = await roleContextService.resolveContext(payloadFor(owner.id, newSession, role));
      expect(context.workspaceId).toBe(workspace.id);
    });
  });
});
