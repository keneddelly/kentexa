import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
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
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AuthService } from '../auth/auth.service';

/**
 * B5C — profile ↔ Business ↔ workspace authority integrity. Real
 * disposable schema inside the dedicated kentexa_b5b_test database (never
 * kentexa/postgres/production), reusing the exact same safety harness as
 * every B5B closure spec. Proves the new organizational-binding-
 * consistency check added to RoleContextService.isProfileValid: a
 * workspace-bound AccountRole's profile must belong to the SAME
 * Business/workspace as the role's own resolved WorkspaceAssignment
 * chain, for SELLER, TRANSPORT_PROVIDER, and SUPER_AGENT alike, while
 * leaving every legacy unbound role and the B5B TransportProvider
 * userId:null exception completely intact.
 */
describe('B5C — profile/Business/workspace authority integrity, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let lifecycleService: BusinessCapabilityLifecycleService;
  let roleContextService: RoleContextService;
  let authService: AuthService;
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
    return userRepo().save(userRepo().create({ email: `u${n}@b5c-test.local`, phone: `+2552${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

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
    // The one canonical BUSINESS CommerceProfile every Business Selling path requires (shared invariant).
    await ds.getRepository(CommerceProfile).save(ds.getRepository(CommerceProfile).create({ ownerId: owner.id, type: CommerceProfileType.BUSINESS, displayName: `Co ${business.id}`, username: `cb${business.id}x${Date.now() % 100000}`, businessId: business.id } as any));
    return { business, workspace, membership, assignment };
  };

  const addHubWorkspace = async (businessId: number, membershipId: number, hubName: string) => {
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId, name: hubName, isDefault: false } as any));
    const hubAssignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membershipId, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { hub, hubAssignment };
  };

  const makeSession = async (role: AccountRole) => sessionRepo().save(sessionRepo().create({
    userId: role.userId, accountRoleId: role.id, contextVersion: role.contextVersion,
    expiresAt: new Date(Date.now() + 86400000),
  } as any));

  const fakeContextFor = (role: AccountRole, session: ActiveRoleSession) => ({
    userId: role.userId, accountRoleId: role.id, roleType: role.roleType,
    profileType: role.profileType!, profileId: role.profileId!, capabilities: [],
    sessionId: session.id, contextVersion: role.contextVersion,
  });

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
    const profile = await transportRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
    return { business, workspace, role, capability, profile };
  };

  /**
   * Bare, unlinked profiles -- created directly via repo, never through the
   * real apply/approve flow, so they have NO AccountRole referencing them
   * yet. UQ_account_role_operational_profile permits at most one
   * AccountRole per non-user profile cluster-wide, so the "wrong Business's
   * profile" a corruption test repoints an existing role at must be one of
   * these, never an already-approved profile that already owns its own
   * role (repointing at one of those would violate that real constraint
   * instead of testing what the test actually means to test).
   */
  const makeBareSellerProfile = async (owner: User, businessId: number) => sellerProfileRepo().save(sellerProfileRepo().create({
    user: owner, userId: owner.id, businessId, businessName: 'Bare Co', status: SellerStatus.APPROVED,
  } as any));

  const makeBareTransportProvider = async (businessId: number) => transportRepo().save(transportRepo().create({
    businessId, name: 'Bare Fleet', type: ProviderType.TRUCK, status: ProviderStatus.VERIFIED,
  } as any));

  const makeBareSuperAgent = async (user: User, workspaceId: number) => superAgentRepo().save(superAgentRepo().create({
    user, userId: user.id, workspaceId, businessName: 'Bare Hub', city: 'Bare City', status: SuperAgentStatus.ACTIVE,
  } as any));

  const makeApprovedSuperAgent = async (owner: User, admin: User, hubName = 'Hub') => {
    const { business, membership } = await makeCleanBusiness(owner);
    const { hub } = await addHubWorkspace(business.id, membership.id, hubName);
    const submitted = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } });
    await service.approveApplication(submitted.application.id, admin);
    const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
    const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: hub.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } });
    const profile = await superAgentRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
    return { business, workspace: hub, membership, role, capability, profile };
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

    service = new BusinessCapabilityApplicationService(
      applicationRepo(), capabilityRepo(), ds,
      { requireFeature: async () => undefined } as any,
      { resolveAgentLocation: async () => ({ district: 'Dar es Salaam' } as any) } as any,
    );
    roleContextService = new RoleContextService(
      userRepo(), accountRoleRepo(), sessionRepo(), sellerProfileRepo(),
      ds.getRepository(Agent), superAgentRepo(), transportRepo(),
      assignmentRepo(), new RoleSessionEventsService(),
    );
    lifecycleService = new BusinessCapabilityLifecycleService(capabilityRepo(), ds, roleContextService);
    authService = new AuthService(
      null as any, { sign: () => 'stub-token' } as any, null as any, null as any,
      null as any, null as any, null as any, roleContextService,
    );
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  describe('§0 — explicit connectivity assertion', () => {
    it('is genuinely connected to kentexa_b5b_test as kentexa_b5b_test_user, not silently skipping', async () => {
      expect(reachable).toBe(true);
      const rows = await ds.query('SELECT current_database() AS db, current_user AS usr');
      expect(rows[0].db).toBe(B5B_TEST_DB_NAME);
      expect(rows[0].usr).toBe(B5B_TEST_DB_USER);
    });
  });

  describe('SELLER', () => {
    it('correct Business/profile/workspace → allowed', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role } = await makeApprovedCommerce(owner, admin);
      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });

    it('cross-Business SellerProfile → fail closed with ROLE_PROFILE_INVALID', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedCommerce(ownerA, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const bareProfileB = await makeBareSellerProfile(ownerB, businessB.id);

      // Directly repoint roleA's profileId at Business B's own SellerProfile
      // -- structurally identical to a corrupted row; the real API can
      // never produce this (profileId is always server-derived).
      await accountRoleRepo().update(roleA.id, { profileId: bareProfileB.id });
      const corrupted = await accountRoleRepo().findOneOrFail({ where: { id: roleA.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(corrupted)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });
  });

  describe('TRANSPORT', () => {
    it('correct Business-bound TransportProvider (userId:null) → allowed', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role } = await makeApprovedTransport(owner, admin);
      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });

    it('cross-Business TransportProvider → fail closed with ROLE_PROFILE_INVALID (closes the B5B-documented boundary)', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedTransport(ownerA, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const bareProviderB = await makeBareTransportProvider(businessB.id);

      await accountRoleRepo().update(roleA.id, { profileId: bareProviderB.id });
      const corrupted = await accountRoleRepo().findOneOrFail({ where: { id: roleA.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(corrupted)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });

    it('legacy valid Transport behavior preserved: unbound (userId set, businessId NULL, workspaceAssignmentId NULL) still switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyProvider = await transportRepo().save(transportRepo().create({
        userId: owner.id, businessId: null, name: 'Legacy Solo Transporter', type: ProviderType.BODA,
      } as any));
      const role = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: 'transport_provider' as any, profileId: legacyProvider.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });
  });

  describe('SUPER_AGENT', () => {
    it('canonical hub/workspace/profile → allowed', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role } = await makeApprovedSuperAgent(owner, admin, 'Kariakoo');
      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });

    it('cross-Business mismatch → fail closed with ROLE_PROFILE_INVALID', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedSuperAgent(ownerA, admin, 'Hub A');
      const { business: businessB, membership: membershipB } = await makeCleanBusiness(ownerB);
      const { hub: hubB } = await addHubWorkspace(businessB.id, membershipB.id, 'Hub B (different business)');
      const bareAgentB = await makeBareSuperAgent(ownerB, hubB.id);

      await accountRoleRepo().update(roleA.id, { profileId: bareAgentB.id });
      const corrupted = await accountRoleRepo().findOneOrFail({ where: { id: roleA.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(corrupted)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });

    it('same-Business, WRONG workspace/hub mismatch → fail closed with ROLE_PROFILE_INVALID (workspace-level invariant, not just Business-level)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const { hub: kariakoo } = await addHubWorkspace(business.id, membership.id, 'Kariakoo');
      const { hub: ubungo } = await addHubWorkspace(business.id, membership.id, 'Ubungo');
      const kariakooApp = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: kariakoo.id, applicationData: { city: 'Dar es Salaam' } });
      await service.approveApplication(kariakooApp.application.id, admin);
      const bareUbungoAgent = await makeBareSuperAgent(owner, ubungo.id);

      const kariakooRole = await accountRoleRepo().findOneOrFail({ where: { id: kariakooApp.accountRole.id } });
      // Repoint the Kariakoo role at the Ubungo SuperAgent profile -- SAME
      // Business, but the WRONG hub/workspace. A Business-level-only check
      // would incorrectly allow this; the workspace-level check must not.
      await accountRoleRepo().update(kariakooRole.id, { profileId: bareUbungoAgent.id });
      const corrupted = await accountRoleRepo().findOneOrFail({ where: { id: kariakooRole.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(corrupted)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });

    it('legacy valid SuperAgent behavior preserved: unbound (userId set, workspaceId NULL, workspaceAssignmentId NULL) still switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyAgent = await superAgentRepo().save(superAgentRepo().create({
        user: owner, userId: owner.id, workspaceId: null, businessName: 'Legacy Solo Agent', city: 'Dodoma', status: SuperAgentStatus.ACTIVE,
      } as any));
      const role = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE,
        profileType: 'super_agent' as any, profileId: legacyAgent.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });
  });

  describe('ROLE AVAILABILITY / SWITCH / LOGIN / CAPABILITY', () => {
    it('a corrupted Business-bound role is non-switchable in listRoles too, not just evaluateAccountRoleAvailability', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedTransport(ownerA, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const bareProviderB = await makeBareTransportProvider(businessB.id);
      await accountRoleRepo().update(roleA.id, { profileId: bareProviderB.id });

      const rows = await roleContextService.listRoles(ownerA.id);
      const row = rows.find((r) => r.accountRoleId === roleA.id);
      expect(row?.switchable).toBe(false);
    });

    it('switch-role: a corrupted role cannot create a new ActiveRoleSession, is rejected with ROLE_NOT_SWITCHABLE', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const buyer = await accountRoleRepo().save(accountRoleRepo().create({
        userId: ownerA.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
        profileType: 'user' as any, profileId: ownerA.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));
      const buyerSession = await makeSession(buyer);
      const { role: roleA } = await makeApprovedTransport(ownerA, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const bareProviderB = await makeBareTransportProvider(businessB.id);
      await accountRoleRepo().update(roleA.id, { profileId: bareProviderB.id });

      const sessionCountBefore = await sessionRepo().count();
      await expect(authService.switchRole(ownerA, fakeContextFor(buyer, buyerSession) as any, roleA.id, {}))
        .rejects.toMatchObject({ response: { code: 'ROLE_NOT_SWITCHABLE' } });
      const sessionCountAfter = await sessionRepo().count();
      expect(sessionCountAfter).toBe(sessionCountBefore);
    });

    it('login: a corrupted preferred role is skipped, falls back to the next switchable ACTIVE role (Buyer)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const ownerB = await makeUser();
      const buyer = await roleContextService.ensureBuyerRole(owner);
      const { role: transportRole } = await makeApprovedTransport(owner, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      const bareProviderB = await makeBareTransportProvider(businessB.id);
      await accountRoleRepo().update(transportRole.id, { profileId: bareProviderB.id });

      const selected = await roleContextService.selectRoleForLogin(owner);
      expect(selected.id).toBe(buyer.id); // never the corrupted transport role
    });

    it('capability: correct profile binding but SUSPENDED organizational capability still denies (profile/business consistency is additive, not a replacement)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedSuperAgent(owner, admin, 'Suspended Hub');
      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);

      await lifecycleService.suspend(capability.id, admin, 'B5C capability-consistency check');
      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: false, reason: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
    });
  });
});
