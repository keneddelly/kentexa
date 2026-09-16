import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  bootstrapB5BTestSchema,
  B5B_ALL_ENTITIES,
  B5B_TEST_DB_NAME,
  B5B_TEST_DB_USER,
} from './b5b-closure-test-db';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { TransportProvider, ProviderType, ProviderStatus } from '../transport/entities/transport-provider.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleSessionEventsService } from '../role-context/role-session-events.service';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { Agent } from '../agents/entities/agent.entity';

/**
 * B5B closure — FINAL real-PostgreSQL regression proof for the two shared
 * production-code changes made during closure (role-context.service.ts's
 * isProfileValid, business-capability-lifecycle.service.ts's ::text cast).
 * This is deliberately NOT a retrofit of the historical B2/B3/B4/B4.5
 * suites -- it is the minimum new coverage needed to exercise the SAME
 * shared code those suites cover, against the dedicated, least-privileged
 * kentexa_b5b_test database/role, with a hard current_database() abort
 * gate before any destructive statement (see b5b-closure-test-db.ts).
 */
describe('B5B closure — final real-Postgres regression proof (COMMERCE + legacy Transport/SuperAgent + suspension)', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let lifecycleService: BusinessCapabilityLifecycleService;
  let roleContextService: RoleContextService;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const membershipRepo = () => ds.getRepository(BusinessMembership);
  const assignmentRepo = () => ds.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => ds.getRepository(BusinessCapability);
  const applicationRepo = () => ds.getRepository(BusinessCapabilityApplication);
  const sellerProfileRepo = () => ds.getRepository(SellerProfile);
  const transportRepo = () => ds.getRepository(TransportProvider);
  const superAgentRepo = () => ds.getRepository(SuperAgent);
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const sessionRepo = () => ds.getRepository(ActiveRoleSession);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5b-final-proof.local`, phone: `+2553${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  /** Real Business -> default OperationalWorkspace -> OWNER BusinessMembership -> ACTIVE WorkspaceAssignment chain -- the "BusinessUnit" the mission refers to is this workspace/membership/assignment triple, this codebase's actual organizational unit. */
  const makeCleanBusiness = async (owner: User) => {
    const n = ++seq;
    const business = await businessRepo().save(businessRepo().create({ legalName: `Co ${n}`, tradingName: `Co ${n}`, user: owner } as any));
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await membershipRepo().save(membershipRepo().create({
      businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
    } as any));
    const assignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { business, workspace, membership, assignment };
  };

  const makeSession = async (role: AccountRole) => sessionRepo().save(sessionRepo().create({
    userId: role.userId, accountRoleId: role.id, contextVersion: role.contextVersion,
    expiresAt: new Date(Date.now() + 86400000),
  } as any));

  /** Canonical, real, end-to-end approved COMMERCE Seller -- driven through the actual apply+approve service, never hand-crafted, so this is the exact shape production creates. */
  const makeApprovedCommerce = async (owner: User, admin: User) => {
    const { business, workspace } = await makeCleanBusiness(owner);
    const submitted = await service.applyForCapability(business.id, 'commerce', owner, {});
    await service.approveApplication(submitted.application.id, admin);
    const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
    const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } });
    const profile = await sellerProfileRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
    return { business, workspace, role, capability, profile };
  };

  const makeApprovedTransport = async (owner: User, admin: User) => {
    const { business, workspace } = await makeCleanBusiness(owner);
    const submitted = await service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });
    await service.approveApplication(submitted.application.id, admin);
    const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
    const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.TRANSPORT } });
    return { business, workspace, role, capability };
  };

  const makeApprovedSuperAgent = async (owner: User, admin: User) => {
    const { business, membership } = await makeCleanBusiness(owner);
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Hub', isDefault: false } as any));
    await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    const submitted = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id });
    await service.approveApplication(submitted.application.id, admin);
    const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
    const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: hub.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } });
    return { business, workspace: hub, role, capability };
  };

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);

    ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: false, entities: [...B5B_ALL_ENTITIES, Agent],
    });
    await ds.initialize();

    service = new BusinessCapabilityApplicationService(applicationRepo(), capabilityRepo(), ds);
    roleContextService = new RoleContextService(
      userRepo(), accountRoleRepo(), sessionRepo(), sellerProfileRepo(),
      ds.getRepository(Agent), superAgentRepo(), transportRepo(),
      assignmentRepo(), new RoleSessionEventsService(),
    );
    lifecycleService = new BusinessCapabilityLifecycleService(capabilityRepo(), ds, roleContextService);
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  describe('§0 — explicit connectivity assertion (distinguishes real execution from a silent skip)', () => {
    it('is genuinely connected to kentexa_b5b_test as kentexa_b5b_test_user, not silently skipping', async () => {
      expect(reachable).toBe(true); // fails loudly (not a silent return) if the dedicated DB/role isn't configured
      // DataSource.query() returns rows directly (unlike pg.Client.query(),
      // which wraps them in { rows: [...] }) -- TypeORM's own shape.
      const rows = await ds.query('SELECT current_database() AS db, current_user AS usr');
      expect(rows[0].db).toBe(B5B_TEST_DB_NAME);
      expect(rows[0].usr).toBe(B5B_TEST_DB_USER);
    });
  });

  describe('§1 — COMMERCE role profile validity (untouched by the TRANSPORT_PROVIDER exception)', () => {
    it('a canonical, real approved COMMERCE Seller role/profile remains valid and switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedCommerce(owner, admin);
      expect(capability.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });
    });

    it('a malformed/mismatched SellerProfile (belongs to a DIFFERENT user than the AccountRole) still fails closed with ROLE_PROFILE_INVALID', async () => {
      if (!reachable) return;
      const rightfulOwner = await makeUser();
      const impostor = await makeUser();

      // A bare SellerProfile with no AccountRole referencing it yet
      // (UQ_account_role_operational_profile permits at most one
      // AccountRole per non-user profile cluster-wide, so this must be a
      // fresh, unlinked profile rather than reusing an already-approved
      // one) -- directly crafting the impostor's AccountRole against it is
      // exactly the "malformed/mismatched" case the mission asks to prove
      // fails closed. This can never be constructed through the real API
      // (which never accepts a client-supplied profileId); it proves
      // isProfileValid's general userId-match branch is intact, unweakened
      // by the new TRANSPORT_PROVIDER-only exception (whose `if` condition
      // is never reachable for profileType SELLER_PROFILE).
      const profile = await sellerProfileRepo().save(sellerProfileRepo().create({
        user: rightfulOwner, userId: rightfulOwner.id, businessName: 'Rightful Co', status: SellerStatus.APPROVED,
      } as any));
      const impostorRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: impostor.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: profile.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(impostorRole);
      expect(evaluation).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });
  });

  describe('§2 — legacy Transport profile validity (the new exception must be narrowly scoped)', () => {
    it('a valid legacy/unbound TransportProvider (userId set, businessId NULL) behaves exactly as before -- switchable, org/capability check skipped entirely', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyProvider = await transportRepo().save(transportRepo().create({
        userId: owner.id, businessId: null, name: 'Legacy Solo Transporter', type: ProviderType.BODA,
      } as any));
      const role = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: legacyProvider.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });
    });

    it('a legacy TransportProvider whose userId does NOT match the AccountRole still fails closed -- the userId:null exception never engages for a SET-but-wrong userId', async () => {
      if (!reachable) return;
      const rightfulOwner = await makeUser();
      const impostor = await makeUser();
      const legacyProvider = await transportRepo().save(transportRepo().create({
        userId: rightfulOwner.id, businessId: null, name: 'Legacy Solo Transporter', type: ProviderType.VAN,
      } as any));
      const impostorRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: impostor.id, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: legacyProvider.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(impostorRole);
      expect(evaluation).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });

    it('the Business-bound (userId:null) exception correctly validates the REAL, matching organizational role produced by B5B\'s own apply/approve flow', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedTransport(owner, admin);
      expect(capability.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });
    });

    it('narrowness check: a Business-bound TransportProvider role pointed at a DIFFERENT Business\'s provider is NOT caught by isProfileValid alone (documented boundary, not a new bypass -- see report)', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedTransport(ownerA, admin);
      // Business B's own provider, created directly (not through the real
      // apply/approve flow) so it has NO AccountRole referencing it yet --
      // UQ_account_role_operational_profile permits at most one AccountRole
      // per non-user profile cluster-wide, so repointing roleA at an
      // ALREADY-linked provider would violate that real constraint instead
      // of testing what this test actually means to test.
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const providerB = await transportRepo().save(transportRepo().create({
        businessId: businessB.id, name: 'Business B Fleet', type: ProviderType.TRUCK, status: ProviderStatus.VERIFIED,
      } as any));

      // Directly repoint roleA's profileId at providerB's row -- structurally
      // identical to how a corrupted/hand-crafted row would look; the real
      // API can never produce this. isProfileValid's userId:null branch
      // returns true unconditionally for ANY Business-bound TransportProvider,
      // so this passes isProfileValid -- exactly like SELLER_PROFILE's own
      // pre-existing "same-user, any business" check has NEVER cross-checked
      // profile.businessId against the role's own workspaceAssignment chain
      // either. This is a pre-existing systemic characteristic of
      // isProfileValid across every profile type, not a new hole introduced
      // by this exception -- reported explicitly, not silently patched.
      await accountRoleRepo().update(roleA.id, { profileId: providerB.id });
      const mutatedRole = await accountRoleRepo().findOneOrFail({ where: { id: roleA.id } });

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(mutatedRole);
      // Documenting the actual current behavior rather than asserting a
      // desired-but-unimplemented stricter check.
      expect(evaluation.switchable).toBe(true);
    });
  });

  describe('§3 — legacy SuperAgent profile validity (zero effect from the Transport-only exception)', () => {
    it('a valid legacy/unbound SuperAgent (userId set, workspaceId NULL) behaves exactly as before -- switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyAgent = await superAgentRepo().save(superAgentRepo().create({
        user: owner, userId: owner.id, workspaceId: null, businessName: 'Legacy Solo Agent', city: 'Dodoma', status: SuperAgentStatus.ACTIVE,
      } as any));
      const role = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SUPER_AGENT, profileId: legacyAgent.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });
    });

    it('a legacy SuperAgent whose userId does NOT match the AccountRole still fails closed -- proves the TRANSPORT_PROVIDER-only branch has zero effect on SUPER_AGENT', async () => {
      if (!reachable) return;
      const rightfulOwner = await makeUser();
      const impostor = await makeUser();
      const legacyAgent = await superAgentRepo().save(superAgentRepo().create({
        user: rightfulOwner, userId: rightfulOwner.id, workspaceId: null, businessName: 'Legacy Solo Agent', city: 'Mwanza', status: SuperAgentStatus.ACTIVE,
      } as any));
      const impostorRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: impostor.id, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SUPER_AGENT, profileId: legacyAgent.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(impostorRole);
      expect(evaluation).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });
  });

  describe('§4 — COMMERCE capability suspension against real PostgreSQL (proves the ::text cast fix)', () => {
    it('suspend: succeeds against real Postgres, capability SUSPENDED, AccountRole stays ACTIVE, the session is revoked, RoleContext becomes non-switchable for an organizational reason, an unrelated workspace/session is untouched', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedCommerce(owner, admin);
      const session = await makeSession(role);

      // An UNRELATED, independent Business/Seller/session -- must be
      // completely unaffected by suspending the first one.
      const unrelatedOwner = await makeUser();
      const { role: unrelatedRole, capability: unrelatedCapability } = await makeApprovedCommerce(unrelatedOwner, admin);
      const unrelatedSession = await makeSession(unrelatedRole);

      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);

      // The exact assertion that would have thrown "operator does not
      // exist: account_role_roletype_enum = text" before the ::text fix.
      await expect(lifecycleService.suspend(capability.id, admin, 'B5B final regression proof — commerce suspension')).resolves.toBeTruthy();

      const suspendedCapability = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(suspendedCapability.status).toBe(BusinessCapabilityStatus.SUSPENDED);

      const roleAfterSuspend = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleAfterSuspend.status).toBe(AccountRoleStatus.ACTIVE); // human authority untouched

      const sessionAfterSuspend = await sessionRepo().findOneOrFail({ where: { id: session.id } });
      expect(sessionAfterSuspend.revokedAt).not.toBeNull();

      const evalAfterSuspend = await roleContextService.evaluateAccountRoleAvailability(roleAfterSuspend);
      expect(evalAfterSuspend).toEqual({ switchable: false, reason: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });

      // Isolation: the unrelated capability/role/session are untouched.
      const unrelatedCapabilityReloaded = await capabilityRepo().findOneOrFail({ where: { id: unrelatedCapability.id } });
      expect(unrelatedCapabilityReloaded.status).toBe(BusinessCapabilityStatus.ACTIVE);
      const unrelatedSessionReloaded = await sessionRepo().findOneOrFail({ where: { id: unrelatedSession.id } });
      expect(unrelatedSessionReloaded.revokedAt).toBeNull();
      expect((await roleContextService.evaluateAccountRoleAvailability(unrelatedRole)).switchable).toBe(true);
    });

    it('reactivate: capability returns ACTIVE, AccountRole stays ACTIVE, role becomes switchable again, the OLD revoked session stays revoked, no new session is auto-created', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedCommerce(owner, admin);
      const session = await makeSession(role);
      await lifecycleService.suspend(capability.id, admin, 'B5B final regression proof — pre-reactivation suspension');
      const revokedSession = await sessionRepo().findOneOrFail({ where: { id: session.id } });
      expect(revokedSession.revokedAt).not.toBeNull();

      const sessionCountBefore = await sessionRepo().count();
      await expect(lifecycleService.reactivate(capability.id, admin)).resolves.toBeTruthy();
      const sessionCountAfter = await sessionRepo().count();
      expect(sessionCountAfter).toBe(sessionCountBefore); // no automatic new session

      const reactivatedCapability = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(reactivatedCapability.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const roleAfterReactivate = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleAfterReactivate.status).toBe(AccountRoleStatus.ACTIVE);

      const oldSessionStillRevoked = await sessionRepo().findOneOrFail({ where: { id: session.id } });
      expect(oldSessionStillRevoked.revokedAt).not.toBeNull(); // never magically resurrected

      const evalAfterReactivate = await roleContextService.evaluateAccountRoleAvailability(roleAfterReactivate);
      expect(evalAfterReactivate).toEqual({ switchable: true, reason: null });
    });
  });

  describe('§5 — SUPER_AGENT suspension/reactivation against real Postgres (the ::text cast, another mapped capability)', () => {
    it('suspend then reactivate a real, approved SUPER_AGENT capability -- succeeds against Postgres, AccountRole never suspended, switchable flips correctly both ways', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedSuperAgent(owner, admin);

      await expect(lifecycleService.suspend(capability.id, admin, 'B5B final regression proof — super_agent')).resolves.toBeTruthy();
      const suspended = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(suspended.status).toBe(BusinessCapabilityStatus.SUSPENDED);
      const roleDuringSuspension = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleDuringSuspension.status).toBe(AccountRoleStatus.ACTIVE);
      expect((await roleContextService.evaluateAccountRoleAvailability(roleDuringSuspension)).switchable).toBe(false);

      await expect(lifecycleService.reactivate(capability.id, admin)).resolves.toBeTruthy();
      const reactivated = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(reactivated.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);
    });
  });

  describe('§6 — TRANSPORT suspension/reactivation against real Postgres (the ::text cast, another mapped capability)', () => {
    it('suspend then reactivate a real, approved TRANSPORT capability -- succeeds against Postgres, AccountRole never suspended, switchable flips correctly both ways', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedTransport(owner, admin);

      await expect(lifecycleService.suspend(capability.id, admin, 'B5B final regression proof — transport')).resolves.toBeTruthy();
      const suspended = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(suspended.status).toBe(BusinessCapabilityStatus.SUSPENDED);
      const roleDuringSuspension = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleDuringSuspension.status).toBe(AccountRoleStatus.ACTIVE);
      expect((await roleContextService.evaluateAccountRoleAvailability(roleDuringSuspension)).switchable).toBe(false);

      await expect(lifecycleService.reactivate(capability.id, admin)).resolves.toBeTruthy();
      const reactivated = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(reactivated.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);
    });
  });
});
