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
import { BusinessCapabilityLifecycleService } from './business-capability-lifecycle.service';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { TransportProvider, ProviderType } from '../transport/entities/transport-provider.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleSessionEventsService } from '../role-context/role-session-events.service';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AuthService } from '../auth/auth.service';
import { SellerProfile } from '../seller/entities/seller-profile.entity';

/**
 * B5B closure mission (sections 5-7) — pending/approved role availability
 * and capability-suspension regression for TRANSPORT_PROVIDER and
 * SUPER_AGENT, driven end to end through the REAL apply/approve service
 * and the REAL, unmodified B4.5 evaluator (RoleContextService.
 * evaluateAccountRoleAvailability/listRoles, AuthService.switchRole) and
 * B4 lifecycle service (BusinessCapabilityLifecycleService.suspend/
 * reactivate) -- no parallel availability mechanism is implemented here.
 */
describe('B5B closure — pending/approved role availability + suspension regression', () => {
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
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const sessionRepo = () => ds.getRepository(ActiveRoleSession);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5b-closure-ra.local`, phone: `+2555${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
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

  const makeBuyerRole = async (owner: User) => accountRoleRepo().save(accountRoleRepo().create({
    userId: owner.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
    profileType: 'user', profileId: owner.id, capabilities: {}, contextVersion: 1, workspaceAssignmentId: null,
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
      userRepo(), accountRoleRepo(), sessionRepo(), ds.getRepository(SellerProfile),
      ds.getRepository(Agent), ds.getRepository(SuperAgent), ds.getRepository(TransportProvider),
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

  describe('§5 — pending role is non-switchable (both verticals)', () => {
    it('TRANSPORT_PROVIDER: after apply, before approval, AccountRole is PENDING, evaluateAccountRoleAvailability says not switchable, listRoles agrees, switch-role is denied', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      void admin;
      const buyer = await makeBuyerRole(owner);
      const buyerSession = await makeSession(buyer);
      const { business } = await makeCleanBusiness(owner);
      const submitted = await service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.PENDING);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation.switchable).toBe(false);

      const rows = await roleContextService.listRoles(owner.id);
      const row = rows.find((r) => r.accountRoleId === role.id);
      expect(row?.switchable).toBe(false);

      await expect(authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {})).rejects.toBeDefined();
    });

    it('SUPER_AGENT: after apply, before approval, AccountRole is PENDING, evaluateAccountRoleAvailability says not switchable, listRoles agrees, switch-role is denied', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const buyerSession = await makeSession(buyer);
      const { business, membership } = await makeCleanBusiness(owner);
      const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Hub', isDefault: false } as any));
      await assignmentRepo().save(assignmentRepo().create({
        businessMembershipId: membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
      } as any));
      const submitted = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } });

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.PENDING);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation.switchable).toBe(false);

      const rows = await roleContextService.listRoles(owner.id);
      const row = rows.find((r) => r.accountRoleId === role.id);
      expect(row?.switchable).toBe(false);

      await expect(authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {})).rejects.toBeDefined();
    });
  });

  describe('§6 — approved role is switchable (both verticals), approval creates no session itself', () => {
    it('TRANSPORT_PROVIDER: after approval, BusinessCapability ACTIVE, AccountRole ACTIVE, switchable true, switch-role succeeds, no auto-session from approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const buyerSession = await makeSession(buyer);
      const { business } = await makeCleanBusiness(owner);
      const submitted = await service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });

      const sessionCountBefore = await sessionRepo().count();
      await service.approveApplication(submitted.application.id, admin);
      const sessionCountAfter = await sessionRepo().count();
      expect(sessionCountAfter).toBe(sessionCountBefore); // approval itself creates no ActiveRoleSession

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.ACTIVE);
      const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: submitted.workspace.id, capabilityCode: 'transport' as any } });
      expect(capability.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });

      const switchResult = await authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {});
      expect(switchResult).toBeTruthy();
    });

    it('SUPER_AGENT: after approval, BusinessCapability ACTIVE, AccountRole ACTIVE, switchable true, switch-role succeeds, no auto-session from approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const buyer = await makeBuyerRole(owner);
      const buyerSession = await makeSession(buyer);
      const { business, membership } = await makeCleanBusiness(owner);
      const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Hub', isDefault: false } as any));
      await assignmentRepo().save(assignmentRepo().create({
        businessMembershipId: membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
      } as any));
      const submitted = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } });

      const sessionCountBefore = await sessionRepo().count();
      await service.approveApplication(submitted.application.id, admin);
      const sessionCountAfter = await sessionRepo().count();
      expect(sessionCountAfter).toBe(sessionCountBefore);

      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      expect(role.status).toBe(AccountRoleStatus.ACTIVE);
      const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: hub.id, capabilityCode: 'super_agent' as any } });
      expect(capability.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const evaluation = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evaluation).toEqual({ switchable: true, reason: null });

      const switchResult = await authService.switchRole(owner, fakeContextFor(buyer, buyerSession) as any, role.id, {});
      expect(switchResult).toBeTruthy();
    });
  });

  describe('§7 — capability suspension regression (both verticals)', () => {
    it('TRANSPORT_PROVIDER: suspend -> not switchable via the capability gate; reactivate -> switchable again; AccountRole itself is never suspended by this', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });
      await service.approveApplication(submitted.application.id, admin);
      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: submitted.workspace.id, capabilityCode: 'transport' as any } });

      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);

      await lifecycleService.suspend(capability.id, admin, 'B5B closure regression check');
      const evalSuspended = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evalSuspended.switchable).toBe(false);
      const roleDuringSuspension = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleDuringSuspension.status).toBe(AccountRoleStatus.ACTIVE); // never suspended merely because the org capability was

      await lifecycleService.reactivate(capability.id, admin);
      const evalReactivated = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evalReactivated).toEqual({ switchable: true, reason: null });
    });

    it('SUPER_AGENT: suspend -> not switchable via the capability gate; reactivate -> switchable again; AccountRole itself is never suspended by this', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Hub', isDefault: false } as any));
      await assignmentRepo().save(assignmentRepo().create({
        businessMembershipId: membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
      } as any));
      const submitted = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } });
      await service.approveApplication(submitted.application.id, admin);
      const role = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      const capability = await capabilityRepo().findOneOrFail({ where: { workspaceId: hub.id, capabilityCode: 'super_agent' as any } });

      expect((await roleContextService.evaluateAccountRoleAvailability(role)).switchable).toBe(true);

      await lifecycleService.suspend(capability.id, admin, 'B5B closure regression check');
      const evalSuspended = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evalSuspended.switchable).toBe(false);
      const roleDuringSuspension = await accountRoleRepo().findOneOrFail({ where: { id: role.id } });
      expect(roleDuringSuspension.status).toBe(AccountRoleStatus.ACTIVE);

      await lifecycleService.reactivate(capability.id, admin);
      const evalReactivated = await roleContextService.evaluateAccountRoleAvailability(role);
      expect(evalReactivated).toEqual({ switchable: true, reason: null });
    });
  });
});
