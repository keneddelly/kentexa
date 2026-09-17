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
import { BusinessCapabilityApplication, BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { ServiceProvider, ServiceProviderStatus } from '../service-providers/entities/service-provider.entity';
import { ServiceAd, ServiceCategory, PriceType, ServiceStatus } from '../services/entities/service-ad.entity';
import { JobRequest } from '../services/entities/job-request.entity';
import { ServicesService } from '../services/services.service';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleSessionEventsService } from '../role-context/role-session-events.service';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AuthService } from '../auth/auth.service';

/**
 * B6B — Service Business Authority Foundation. Real disposable schema
 * inside the dedicated kentexa_b5b_test database (never kentexa/postgres/
 * production), reusing the exact same shared safety harness as every
 * B5B/B5C closure spec. Proves the new Business-bound SERVICE capability/
 * ServiceProvider/SERVICE_PROVIDER AccountRole chain end to end, that the
 * B5C organizational-binding-consistency check extends correctly to
 * SERVICE_PROVIDER, and that the existing personal ServiceAd path is
 * completely unaffected.
 */
describe('B6B — Service Business Authority Foundation, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let lifecycleService: BusinessCapabilityLifecycleService;
  let roleContextService: RoleContextService;
  let authService: AuthService;
  let servicesService: ServicesService;
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
  const serviceProviderRepo = () => ds.getRepository(ServiceProvider);
  const serviceAdRepo = () => ds.getRepository(ServiceAd);
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const sessionRepo = () => ds.getRepository(ActiveRoleSession);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b6b-test.local`, phone: `+2551${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
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
    return { business, workspace, membership, assignment };
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

  const submitService = (owner: User, businessId: number) =>
    service.applyForCapability(businessId, 'service', owner, {});

  const makeApprovedService = async (owner: User, admin: User) => {
    const { business, workspace } = await makeCleanBusiness(owner);
    const submitted = await submitService(owner, business.id);
    await service.approveApplication(submitted.application.id, admin);
    const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
    const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.SERVICE } });
    const profile = await serviceProviderRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
    return { business, workspace, role, capability, profile };
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
      database: config.database, synchronize: false, entities: [...B5B_ALL_ENTITIES, Agent, JobRequest],
    });
    await ds.initialize();

    service = new BusinessCapabilityApplicationService(applicationRepo(), capabilityRepo(), ds);
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
    // createAd()'s own code path (no commerceProfileId) never meaningfully
    // uses feedService/commerceProfiles/profileScope beyond a fire-and-forget
    // .catch(()=>{}) call -- stubbed exactly like AuthService's own
    // JWT/mail/sms stubs elsewhere in this suite, since a real instance of
    // each would need far more setup than this stage's actual code path
    // exercises.
    servicesService = new ServicesService(
      serviceAdRepo(), ds.getRepository(JobRequest),
      { publish: async () => undefined } as any,
      {} as any,
      { isAuthorizedFor: async () => false } as any,
      { upsert: async () => undefined, remove: async () => undefined } as any,
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

  describe('A — PERSONAL (existing behavior must be completely unaffected)', () => {
    it('existing personal service creation still succeeds, businessId remains NULL, no SERVICE capability required', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      // Deliberately NO Business, NO ServiceProvider, NO SERVICE capability
      // application at all -- exactly today's unauthenticated-for-business
      // personal path.
      const ad = await servicesService.createAd(owner, {
        title: 'Fundi wa Umeme', description: 'Electrical repair', category: ServiceCategory.UFUNDI,
        priceType: PriceType.NEGOTIATE, coverageCity: 'Dar es Salaam', images: ['x.jpg'],
      } as any);

      expect(ad.providerId).toBe(owner.id);
      expect(ad.businessId).toBeNull();
      expect(ad.commerceProfileId).toBeNull();
      expect(ad.status).toBe(ServiceStatus.ACTIVE);

      const reloaded = await serviceAdRepo().findOneOrFail({ where: { id: ad.id } });
      expect(reloaded.businessId).toBeNull();
    });
  });

  describe('B — APPLICATION', () => {
    it('a Business SERVICE application creates PENDING BusinessCapabilityApplication + PENDING ServiceProvider(businessId set) + PENDING AccountRole', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitService(owner, business.id);

      expect(submitted.application.capabilityCode).toBe(BusinessCapabilityCode.SERVICE);
      expect(submitted.application.status).toBe(BusinessCapabilityApplicationStatus.PENDING);
      expect(submitted.workspace.id).toBe(workspace.id);
      expect(submitted.operationalProfile.type).toBe(RoleProfileType.SERVICE_PROVIDER);
      expect(submitted.accountRole.switchable).toBe(false);

      const provider = await serviceProviderRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
      expect(provider.businessId).toBe(business.id);
      expect(provider.status).toBe(ServiceProviderStatus.PENDING);
      expect(provider.userId).toBe(owner.id);

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.roleType).toBe(AccountRoleType.SERVICE_PROVIDER);
      expect(role.status).toBe(AccountRoleStatus.PENDING);
    });

    it('a duplicate pending SERVICE application for the same Business is blocked with CAPABILITY_APPLICATION_ALREADY_PENDING', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await submitService(owner, business.id);

      await expect(submitService(owner, business.id)).rejects.toMatchObject({
        response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' },
      });
      expect(await serviceProviderRepo().count({ where: { businessId: business.id } })).toBe(1);
    });

    it('the pending SERVICE_PROVIDER role is non-switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitService(owner, business.id);
      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: false, reason: 'ROLE_NOT_ACTIVE' });
    });
  });

  describe('C — APPROVAL', () => {
    it('approval activates exact SERVICE capability, exact Business-bound ServiceProvider, exact SERVICE_PROVIDER AccountRole, no auto-session, and the role becomes switchable', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitService(owner, business.id);

      const sessionCountBefore = await sessionRepo().count();
      const approved = await service.approveApplication(submitted.application.id, admin);
      const sessionCountAfter = await sessionRepo().count();
      expect(sessionCountAfter).toBe(sessionCountBefore);

      expect(approved.capability).toMatchObject({ code: BusinessCapabilityCode.SERVICE, status: BusinessCapabilityStatus.ACTIVE });
      const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.SERVICE } });
      expect(capability.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect(capability.approvedByUserId).toBe(admin.id);

      const provider = await serviceProviderRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
      expect(provider.status).toBe(ServiceProviderStatus.APPROVED);
      // Verification stays separate from entitlement -- approval must
      // never touch verifiedAt.
      expect(provider.verifiedAt).toBeNull();

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.ACTIVE);
      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });
  });

  describe('D — REJECTION', () => {
    it('rejection sets ServiceProvider REJECTED with the reason, AccountRole REJECTED, and no active capability exists', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitService(owner, business.id);

      const result = await service.rejectApplication(submitted.application.id, admin, 'Insufficient business documentation');

      expect(result.capability).toBeNull();
      const provider = await serviceProviderRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
      expect(provider.status).toBe(ServiceProviderStatus.REJECTED);
      expect(provider.rejectionReason).toBe('Insufficient business documentation');
      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.REJECTED);
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.SERVICE } })).toBe(0);
    });
  });

  describe('E — MULTI-BUSINESS ISOLATION', () => {
    it('the same user with two Businesses gets independent ServiceProvider rows, AccountRoles, and BusinessCapabilities', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { profile: profileA, role: roleA, capability: capabilityA } = await makeApprovedService(owner, admin);
      const { profile: profileB, role: roleB, capability: capabilityB } = await makeApprovedService(owner, admin);

      expect(profileA.id).not.toBe(profileB.id);
      expect(roleA.id).not.toBe(roleB.id);
      expect(capabilityA.id).not.toBe(capabilityB.id);
      expect(profileA.businessId).not.toBe(profileB.businessId);
    });
  });

  describe('F — CROSS-BUSINESS (fails closed)', () => {
    it('a Business A role pointed at Business B\'s ServiceProvider fails closed: non-switchable, and switch-role cannot create a session', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const admin = await makeUser();
      const { role: roleA } = await makeApprovedService(ownerA, admin);
      const { business: businessB } = await makeCleanBusiness(ownerB);
      // A bare, unlinked ServiceProvider for Business B (not through the
      // real apply/approve flow, so it has no AccountRole referencing it
      // yet -- UQ_account_role_operational_profile permits at most one
      // AccountRole per non-user profile cluster-wide).
      const bareProviderB = await serviceProviderRepo().save(serviceProviderRepo().create({
        user: ownerB, businessId: businessB.id, businessName: 'Business B Services', status: ServiceProviderStatus.APPROVED,
      } as any));

      await accountRoleRepo().update(roleA.id, { profileId: bareProviderB.id });
      const corrupted = await accountRoleRepo().findOneOrFail({ where: { id: roleA.id } });

      expect(await roleContextService.evaluateAccountRoleAvailability(corrupted)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });

      const buyer = await roleContextService.ensureBuyerRole(ownerA);
      const buyerSession = await makeSession(buyer);
      const sessionCountBefore = await sessionRepo().count();
      await expect(authService.switchRole(ownerA, fakeContextFor(buyer, buyerSession) as any, corrupted.id, {}))
        .rejects.toMatchObject({ response: { code: 'ROLE_NOT_SWITCHABLE' } });
      expect(await sessionRepo().count()).toBe(sessionCountBefore);
    });
  });

  describe('G — CAPABILITY suspension/reactivation', () => {
    it('suspending SERVICE denies RoleContext, revokes the affected session, keeps AccountRole ACTIVE; reactivation restores switchability without resurrecting the old session or creating a new one', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role, capability } = await makeApprovedService(owner, admin);
      const session = await makeSession(role);

      await lifecycleService.suspend(capability.id, admin, 'B6B capability suspension check');

      const roleAfterSuspend = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleAfterSuspend.status).toBe(AccountRoleStatus.ACTIVE);
      expect(await roleContextService.evaluateAccountRoleAvailability(roleAfterSuspend)).toEqual({ switchable: false, reason: 'ROLE_CONTEXT_CAPABILITY_INACTIVE' });
      const sessionAfterSuspend = await sessionRepo().findOneOrFail({ where: { id: session.id } });
      expect(sessionAfterSuspend.revokedAt).not.toBeNull();

      const sessionCountBefore = await sessionRepo().count();
      await lifecycleService.reactivate(capability.id, admin);
      expect(await sessionRepo().count()).toBe(sessionCountBefore); // no automatic new session

      const reactivatedCapability = await capabilityRepo().findOneOrFail({ where: { id: capability.id } });
      expect(reactivatedCapability.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });

      const oldSessionStillRevoked = await sessionRepo().findOneOrFail({ where: { id: session.id } });
      expect(oldSessionStillRevoked.revokedAt).not.toBeNull(); // never magically resurrected
    });
  });

  describe('H — LEGACY compatibility', () => {
    it('a legacy unbound ServiceProvider (businessId NULL) behaves exactly as before -- switchable, org/capability check skipped entirely', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyProvider = await serviceProviderRepo().save(serviceProviderRepo().create({
        user: owner, businessId: null, businessName: 'Legacy Solo Provider', status: ServiceProviderStatus.APPROVED,
      } as any));
      const role = await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SERVICE_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SERVICE_PROVIDER, profileId: legacyProvider.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      expect(await roleContextService.evaluateAccountRoleAvailability(role)).toEqual({ switchable: true, reason: null });
    });

    it('a legacy ServiceProvider whose userId does NOT match the AccountRole still fails closed', async () => {
      if (!reachable) return;
      const rightfulOwner = await makeUser();
      const impostor = await makeUser();
      const legacyProvider = await serviceProviderRepo().save(serviceProviderRepo().create({
        user: rightfulOwner, businessId: null, businessName: 'Legacy Solo Provider 2', status: ServiceProviderStatus.APPROVED,
      } as any));
      const impostorRole = await accountRoleRepo().save(accountRoleRepo().create({
        userId: impostor.id, roleType: AccountRoleType.SERVICE_PROVIDER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SERVICE_PROVIDER, profileId: legacyProvider.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
      } as any));

      expect(await roleContextService.evaluateAccountRoleAvailability(impostorRole)).toEqual({ switchable: false, reason: 'ROLE_PROFILE_INVALID' });
    });

    it('existing ServiceAd rows with businessId NULL remain valid and untouched by any B6B code path', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const legacyAd = await serviceAdRepo().save(serviceAdRepo().create({
        provider: owner, providerId: owner.id, title: 'Legacy Ad', description: 'Pre-B6B ad',
        category: ServiceCategory.USAFI, coverageCity: 'Mwanza', status: ServiceStatus.ACTIVE,
      } as any));

      const reloaded = await serviceAdRepo().findOneOrFail({ where: { id: legacyAd.id } });
      expect(reloaded.businessId).toBeNull();
    });
  });

  describe('I — BUSINESS SERVICE ATTRIBUTION (backend foundation contract)', () => {
    it('createBusinessServiceAd derives businessId server-side from the caller\'s own ACTIVE SERVICE_PROVIDER role -- a client-supplied businessId is never trusted', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, role } = await makeApprovedService(owner, admin);
      const otherOwner = await makeUser();
      const { business: otherBusiness } = await makeCleanBusiness(otherOwner);

      const ad = await servicesService.createBusinessServiceAd(role, {
        title: 'CCTV Installation', description: 'Professional CCTV setup', category: ServiceCategory.UBUNIFU,
        priceType: PriceType.PER_JOB, coverageCity: 'Dar es Salaam', images: ['cctv.jpg'],
        // Attempted spoof -- must be silently overridden, never trusted.
        businessId: otherBusiness.id,
      } as any);

      expect(ad.businessId).toBe(business.id);
      expect(ad.businessId).not.toBe(otherBusiness.id);
      expect(ad.providerId).toBe(owner.id);

      const reloaded = await serviceAdRepo().findOneOrFail({ where: { id: ad.id } });
      expect(reloaded.businessId).toBe(business.id);
    });

    it('a PENDING (not yet ACTIVE) SERVICE_PROVIDER role cannot create a Business-bound ServiceAd', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitService(owner, business.id);
      const pendingRole = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });

      await expect(servicesService.createBusinessServiceAd(pendingRole, {
        title: 'Too Early', description: 'Should not be creatable yet', category: ServiceCategory.MATENGENEZO,
        coverageCity: 'Arusha', images: ['x.jpg'],
      } as any)).rejects.toMatchObject({ response: { code: 'SERVICE_PROVIDER_ROLE_REQUIRED' } });
    });

    it('two Businesses (same user) create independently-attributed ServiceAd rows', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business: businessA, role: roleA } = await makeApprovedService(owner, admin);
      const { business: businessB, role: roleB } = await makeApprovedService(owner, admin);

      const adA = await servicesService.createBusinessServiceAd(roleA, {
        title: 'Business A Service', description: 'd', category: ServiceCategory.BIASHARA, coverageCity: 'Dodoma', images: ['a.jpg'],
      } as any);
      const adB = await servicesService.createBusinessServiceAd(roleB, {
        title: 'Business B Service', description: 'd', category: ServiceCategory.BIASHARA, coverageCity: 'Dodoma', images: ['b.jpg'],
      } as any);

      expect(adA.businessId).toBe(businessA.id);
      expect(adB.businessId).toBe(businessB.id);
      expect(adA.businessId).not.toBe(adB.businessId);
    });
  });

  describe('J — B6C controller-facing wrapper (createBusinessServiceAdForRoleContext)', () => {
    it('resolves the real AccountRole by (id, userId) and delegates correctly', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, role } = await makeApprovedService(owner, admin);

      const ad = await servicesService.createBusinessServiceAdForRoleContext(owner.id, role.id, {
        title: 'Plumbing', description: 'd', category: ServiceCategory.MATENGENEZO,
        coverageCity: 'Mwanza', images: ['p.jpg'],
      } as any);

      expect(ad.businessId).toBe(business.id);
      expect(ad.providerId).toBe(owner.id);
    });

    it('fails closed when the accountRoleId does not belong to the calling userId (spoofed role id)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { role } = await makeApprovedService(owner, admin);
      const attacker = await makeUser();

      await expect(
        servicesService.createBusinessServiceAdForRoleContext(attacker.id, role.id, {
          title: 'Spoofed', description: 'd', category: ServiceCategory.MATENGENEZO,
          coverageCity: 'Mwanza', images: ['p.jpg'],
        } as any),
      ).rejects.toMatchObject({ response: { code: 'SERVICE_PROVIDER_ROLE_REQUIRED' } });
    });

    it('getMyAds(businessId) never leaks a Business-attributed ad into a Personal-scoped query, and vice versa', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, role } = await makeApprovedService(owner, admin);

      const businessAd = await servicesService.createBusinessServiceAdForRoleContext(owner.id, role.id, {
        title: 'Business Ad', description: 'd', category: ServiceCategory.BIASHARA,
        coverageCity: 'Dodoma', images: ['b.jpg'],
      } as any);
      const personalAd = await servicesService.createAd(owner, {
        title: 'Personal Ad', description: 'd', category: ServiceCategory.UFUNDI,
        priceType: PriceType.NEGOTIATE, coverageCity: 'Dodoma', images: ['p.jpg'],
      } as any);

      const businessScoped = await servicesService.getMyAds(owner.id, undefined, business.id);
      expect(businessScoped.map(a => a.id)).toEqual([businessAd.id]);
      expect(businessScoped.map(a => a.id)).not.toContain(personalAd.id);

      // Personal-scoped (commerceProfileId undefined, matching MyServices.js's
      // real personal call, since createAd() with no commerceProfileId also
      // stores it as null) must exclude the Business ad even though both
      // share commerceProfileId: null -- distinguished by businessId.
      const personalScoped = await servicesService.getMyAds(owner.id, undefined, undefined);
      // Without any scoping param this legitimately returns everything
      // (existing pre-B6C contract) -- assert the businessId column itself
      // is what actually differs, proving the two ads are distinguishable.
      const found = personalScoped.filter(a => [businessAd.id, personalAd.id].includes(a.id));
      expect(found.find(a => a.id === businessAd.id)?.businessId).toBe(business.id);
      expect(found.find(a => a.id === personalAd.id)?.businessId).toBeNull();

      // The actual MyServices.js Personal-tab call shape: a real
      // commerceProfileId scoping the query. Must still exclude the
      // Business ad via its own commerceProfileId:null/businessId:NOT-null
      // fallback branch, not just when businessId is omitted entirely.
      const scopedByPersonalProfile = await servicesService.getMyAds(owner.id, 999999);
      expect(scopedByPersonalProfile.map(a => a.id)).not.toContain(businessAd.id);
      expect(scopedByPersonalProfile.map(a => a.id)).toContain(personalAd.id);
    });
  });
});
