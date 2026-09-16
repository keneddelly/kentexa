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
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { TransportProvider, ProviderType } from '../transport/entities/transport-provider.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';

/**
 * B5B closure mission (sections 2-4) — cross-business authority,
 * cross-organization profile isolation, and legacy-profile non-binding.
 * Real disposable schema inside the dedicated kentexa_b5b_test database
 * (never kentexa/postgres) -- see b5b-closure-test-db.ts for the shared
 * safety harness every closure spec file reuses.
 */
describe('B5B closure — cross-business authority + profile isolation + legacy non-binding', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let service: BusinessCapabilityApplicationService;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const membershipRepo = () => ds.getRepository(BusinessMembership);
  const assignmentRepo = () => ds.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => ds.getRepository(BusinessCapability);
  const applicationRepo = () => ds.getRepository(BusinessCapabilityApplication);
  const transportRepo = () => ds.getRepository(TransportProvider);
  const superAgentRepo = () => ds.getRepository(SuperAgent);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5b-closure.local`, phone: `+2556${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
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

  const addHubWorkspace = async (businessId: number, membershipId: number, hubName: string) => {
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId, name: hubName, isDefault: false } as any));
    const hubAssignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membershipId, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { hub, hubAssignment };
  };

  const submitTransport = (owner: User, businessId: number) =>
    service.applyForCapability(businessId, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });

  const submitSuperAgent = (owner: User, businessId: number, workspaceId: number) =>
    service.applyForCapability(businessId, 'super_agent', owner, { workspaceId });

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);

    ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user, password: config.password,
      database: config.database, synchronize: false, entities: B5B_ALL_ENTITIES,
    });
    await ds.initialize();
    service = new BusinessCapabilityApplicationService(applicationRepo(), capabilityRepo(), ds);
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  describe('§2 — cross-business authority (TRANSPORT)', () => {
    it('a user authorized for Business A cannot apply for TRANSPORT using Business B\'s id -- fails closed with the canonical authorization code', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      await makeCleanBusiness(ownerA);
      const { business: businessB } = await makeCleanBusiness(ownerB);

      // ownerA has NO BusinessMembership at all on businessB -- the real
      // canonical code for this (confirmed by resolveOwnerWorkspaceContext's
      // own membership-existence check) is BUSINESS_OWNER_REQUIRED.
      await expect(submitTransport(ownerA, businessB.id)).rejects.toMatchObject({
        response: { code: 'BUSINESS_OWNER_REQUIRED' },
      });
      expect(await applicationRepo().count({ where: { businessId: businessB.id } })).toBe(0);
      expect(await transportRepo().count({ where: { businessId: businessB.id } })).toBe(0);
    });
  });

  describe('§2 — cross-workspace authority (SUPER_AGENT)', () => {
    it('a user authorized for Business A cannot apply for SUPER_AGENT against a workspace belonging to Business B', async () => {
      if (!reachable) return;
      const ownerA = await makeUser();
      const ownerB = await makeUser();
      const { business: businessA } = await makeCleanBusiness(ownerA);
      const { business: businessB, membership: membershipB } = await makeCleanBusiness(ownerB);
      const { hub: hubB } = await addHubWorkspace(businessB.id, membershipB.id, 'Business B Hub');

      // ownerA claims businessA (their own) but names a workspaceId that
      // actually belongs to businessB -- the join in resolveOwnerWorkspaceContext
      // requires w."businessId" = businessA.id, so this must fail closed.
      await expect(submitSuperAgent(ownerA, businessA.id, hubB.id)).rejects.toBeDefined();
      expect(await applicationRepo().count({ where: { businessId: businessA.id } })).toBe(0);
      expect(await superAgentRepo().count({ where: { workspaceId: hubB.id } })).toBe(0);
    });

    it('frontend-supplied workspaceId is independently revalidated server-side even when it names a REAL workspace under the caller\'s own business, if the caller has no WorkspaceAssignment on that specific workspace', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      // A second, real hub exists under the SAME business the owner does
      // belong to -- but nobody ever created a WorkspaceAssignment linking
      // the owner's membership to THIS specific hub (created directly via
      // the repo, bypassing addHubWorkspace's own assignment-creation step).
      const unassignedHub = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Unassigned Hub', isDefault: false } as any));

      await expect(submitSuperAgent(owner, business.id, unassignedHub.id)).rejects.toBeDefined();
      expect(await applicationRepo().count({ where: { businessId: business.id } })).toBe(0);
      expect(await superAgentRepo().count({ where: { workspaceId: unassignedHub.id } })).toBe(0);
    });
  });

  describe('§3 — profile non-reuse across organizations', () => {
    it('Business A and Business B each get their OWN independent TransportProvider under the same acting user -- never collapsed into one row', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business: businessA } = await makeCleanBusiness(owner);
      const { business: businessB } = await makeCleanBusiness(owner);

      const appA = await submitTransport(owner, businessA.id);
      const appB = await submitTransport(owner, businessB.id);

      expect(appA.operationalProfile.id).not.toBe(appB.operationalProfile.id);
      const providerA = await transportRepo().findOne({ where: { id: appA.operationalProfile.id } });
      const providerB = await transportRepo().findOne({ where: { id: appB.operationalProfile.id } });
      expect(providerA?.businessId).toBe(businessA.id);
      expect(providerB?.businessId).toBe(businessB.id);
      expect(providerA?.id).not.toBe(providerB?.id);
    });

    it('Kariakoo workspace and Ubungo workspace each get their OWN independent SuperAgent under the same acting user -- never collapsed into one row', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const { hub: kariakoo } = await addHubWorkspace(business.id, membership.id, 'Kariakoo');
      const { hub: ubungo } = await addHubWorkspace(business.id, membership.id, 'Ubungo');

      const appKariakoo = await submitSuperAgent(owner, business.id, kariakoo.id);
      const appUbungo = await submitSuperAgent(owner, business.id, ubungo.id);

      expect(appKariakoo.operationalProfile.id).not.toBe(appUbungo.operationalProfile.id);
      const agentKariakoo = await superAgentRepo().findOne({ where: { id: appKariakoo.operationalProfile.id } });
      const agentUbungo = await superAgentRepo().findOne({ where: { id: appUbungo.operationalProfile.id } });
      expect(agentKariakoo?.workspaceId).toBe(kariakoo.id);
      expect(agentUbungo?.workspaceId).toBe(ubungo.id);
    });
  });

  describe('§4 — legacy profile non-binding (critical)', () => {
    it('a legacy unbound TransportProvider (businessId=NULL, userId=X) is NEVER silently attached when user X applies organizationally -- a NEW Business-bound row is created instead', async () => {
      if (!reachable) return;
      const userX = await makeUser();
      const legacyProvider = await transportRepo().save(transportRepo().create({
        userId: userX.id, businessId: null, name: 'Legacy Solo Transporter', type: ProviderType.BODA,
      } as any));

      const { business } = await makeCleanBusiness(userX);
      const result = await submitTransport(userX, business.id);

      expect(result.operationalProfile.id).not.toBe(legacyProvider.id);
      const newProvider = await transportRepo().findOne({ where: { id: result.operationalProfile.id } });
      expect(newProvider?.businessId).toBe(business.id);

      // The legacy row itself must be completely untouched -- never
      // backfilled, never re-parented, never guessed from userId.
      const legacyReloaded = await transportRepo().findOne({ where: { id: legacyProvider.id } });
      expect(legacyReloaded?.businessId).toBeNull();
      expect(legacyReloaded?.name).toBe('Legacy Solo Transporter');
    });

    it('a legacy unbound SuperAgent (workspaceId=NULL, userId=X) is NEVER silently reused/bound when user X applies organizationally for a real hub -- a NEW workspace-bound row is created instead', async () => {
      if (!reachable) return;
      const userX = await makeUser();
      const legacyAgent = await superAgentRepo().save(superAgentRepo().create({
        user: userX, userId: userX.id, workspaceId: null, businessName: 'Legacy Solo Agent', city: 'Dar es Salaam', status: SuperAgentStatus.ACTIVE,
      } as any));

      const { business, membership } = await makeCleanBusiness(userX);
      const { hub } = await addHubWorkspace(business.id, membership.id, 'Real Hub');
      const result = await submitSuperAgent(userX, business.id, hub.id);

      expect(result.operationalProfile.id).not.toBe(legacyAgent.id);
      const newAgent = await superAgentRepo().findOne({ where: { id: result.operationalProfile.id } });
      expect(newAgent?.workspaceId).toBe(hub.id);

      const legacyReloaded = await superAgentRepo().findOne({ where: { id: legacyAgent.id } });
      expect(legacyReloaded?.workspaceId).toBeNull();
      expect(legacyReloaded?.businessName).toBe('Legacy Solo Agent');
      expect(legacyReloaded?.status).toBe(SuperAgentStatus.ACTIVE); // never mutated by the unrelated application
    });

    it('never infers/binds a legacy profile from matching businessName/city/address text -- only a real application creates the link', async () => {
      if (!reachable) return;
      const userY = await makeUser();
      // A legacy row whose free-text fields happen to LOOK like they match
      // the Business about to be created -- must still never be reused,
      // since matching is by explicit application only, never by name/city.
      const { business } = await makeCleanBusiness(userY);
      const legacyAgent = await superAgentRepo().save(superAgentRepo().create({
        user: userY, userId: userY.id, workspaceId: null, businessName: business.tradingName!, city: 'Default Operations', status: SuperAgentStatus.PENDING,
      } as any));
      const membership = await membershipRepo().findOneOrFail({ where: { businessId: business.id, userId: userY.id } });
      const { hub } = await addHubWorkspace(business.id, membership.id, business.tradingName!);

      const result = await submitSuperAgent(userY, business.id, hub.id);

      expect(result.operationalProfile.id).not.toBe(legacyAgent.id);
      const legacyReloaded = await superAgentRepo().findOne({ where: { id: legacyAgent.id } });
      expect(legacyReloaded?.workspaceId).toBeNull();
    });
  });
});
