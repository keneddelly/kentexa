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
import { BusinessCapability, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { BusinessCapabilityApplication, BusinessCapabilityApplicationStatus } from './entities/business-capability-application.entity';
import { TransportProvider, ProviderType, ProviderStatus } from '../transport/entities/transport-provider.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { AccountRole, AccountRoleStatus } from '../role-context/entities/account-role.entity';

/**
 * B5B closure mission (sections 8-11) — real concurrent-transaction races
 * for TRANSPORT and SUPER_AGENT, against the dedicated kentexa_b5b_test
 * database, proving actual Postgres row-locking/uniqueness (never
 * Promise timing alone) the exact same way the B3 approval spec already
 * proved this for COMMERCE.
 */
describe('B5B closure — concurrent application, concurrent approval, approve-vs-reject race, idempotency', () => {
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
  const accountRoleRepo = () => ds.getRepository(AccountRole);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5b-closure-cc.local`, phone: `+2554${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
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

  const makeHubBusiness = async (owner: User) => {
    const clean = await makeCleanBusiness(owner);
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: clean.business.id, name: 'Hub', isDefault: false } as any));
    await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: clean.membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { ...clean, hub };
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

  describe('§8 — concurrent application (no duplicate pending application/profile/role)', () => {
    it('TRANSPORT: two simultaneous applications for the same Business -- exactly one canonical application/profile/role chain', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      const results = await Promise.allSettled([submitTransport(owner, business.id), submitTransport(owner, business.id)]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });

      expect(await applicationRepo().count({ where: { businessId: business.id } })).toBe(1);
      expect(await transportRepo().count({ where: { businessId: business.id } })).toBe(1);
      const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(await accountRoleRepo().count({ where: { id: winner.accountRole.id } })).toBe(1);
    });

    it('SUPER_AGENT: two simultaneous applications for the same workspace -- exactly one canonical application/profile/role chain', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, hub } = await makeHubBusiness(owner);

      const results = await Promise.allSettled([submitSuperAgent(owner, business.id, hub.id), submitSuperAgent(owner, business.id, hub.id)]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });

      expect(await applicationRepo().count({ where: { workspaceId: hub.id } })).toBe(1);
      expect(await superAgentRepo().count({ where: { workspaceId: hub.id } })).toBe(1);
    });
  });

  describe('§9 — concurrent approval (two admins, same application)', () => {
    it('TRANSPORT: Admin A approve || Admin B approve on the same application -- exactly one ACTIVE capability/profile/role, one APPROVED application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const adminA = await makeUser();
      const adminB = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, adminA),
        service.approveApplication(submitted.application.id, adminB),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true); // second call is an idempotent verified re-read, not an error

      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: 'transport' as any } })).toBe(1);
      expect(await applicationRepo().count({ where: { id: submitted.application.id, status: BusinessCapabilityApplicationStatus.APPROVED } })).toBe(1);
      expect(await transportRepo().count({ where: { id: submitted.operationalProfile.id, status: ProviderStatus.VERIFIED } })).toBe(1);
      expect(await accountRoleRepo().count({ where: { id: submitted.accountRole.id, status: AccountRoleStatus.ACTIVE } })).toBe(1);
    });

    it('SUPER_AGENT: Admin A approve || Admin B approve on the same application -- exactly one ACTIVE capability/profile/role, one APPROVED application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const adminA = await makeUser();
      const adminB = await makeUser();
      const { business, hub } = await makeHubBusiness(owner);
      const submitted = await submitSuperAgent(owner, business.id, hub.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, adminA),
        service.approveApplication(submitted.application.id, adminB),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      expect(await capabilityRepo().count({ where: { workspaceId: hub.id, capabilityCode: 'super_agent' as any } })).toBe(1);
      expect(await applicationRepo().count({ where: { id: submitted.application.id, status: BusinessCapabilityApplicationStatus.APPROVED } })).toBe(1);
      expect(await superAgentRepo().count({ where: { id: submitted.operationalProfile.id, status: SuperAgentStatus.ACTIVE } })).toBe(1);
      expect(await accountRoleRepo().count({ where: { id: submitted.accountRole.id, status: AccountRoleStatus.ACTIVE } })).toBe(1);
    });
  });

  describe('§10 — approve-vs-reject race (one valid terminal result, never a mixed state)', () => {
    it('TRANSPORT: approve || reject on the same application -- exactly one terminal outcome, the loser gets a clean conflict, never a mixed application/role/capability state', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, admin),
        service.rejectApplication(submitted.application.id, admin, 'racing rejection'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        response: { code: expect.stringMatching(/CAPABILITY_APPLICATION_ALREADY_(APPROVED|REJECTED)/) },
      });

      const finalApplication = await applicationRepo().findOneOrFail({ where: { id: submitted.application.id } });
      const finalProvider = await transportRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
      const finalRole = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      const capabilityCount = await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: 'transport' as any } });

      if (finalApplication.status === BusinessCapabilityApplicationStatus.APPROVED) {
        expect(finalProvider.status).toBe(ProviderStatus.VERIFIED);
        expect(finalRole.status).toBe(AccountRoleStatus.ACTIVE);
        expect(capabilityCount).toBe(1);
      } else {
        expect(finalApplication.status).toBe(BusinessCapabilityApplicationStatus.REJECTED);
        expect(finalProvider.status).toBe(ProviderStatus.REJECTED);
        expect(finalRole.status).toBe(AccountRoleStatus.REJECTED);
        expect(capabilityCount).toBe(0);
      }
    });

    it('SUPER_AGENT: approve || reject on the same application -- exactly one terminal outcome, the loser gets a clean conflict, never a mixed application/role/capability state', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, hub } = await makeHubBusiness(owner);
      const submitted = await submitSuperAgent(owner, business.id, hub.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, admin),
        service.rejectApplication(submitted.application.id, admin, 'racing rejection'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        response: { code: expect.stringMatching(/CAPABILITY_APPLICATION_ALREADY_(APPROVED|REJECTED)/) },
      });

      const finalApplication = await applicationRepo().findOneOrFail({ where: { id: submitted.application.id } });
      const finalAgent = await superAgentRepo().findOneOrFail({ where: { id: submitted.operationalProfile.id } });
      const finalRole = await accountRoleRepo().findOneOrFail({ where: { id: submitted.accountRole.id } });
      const capabilityCount = await capabilityRepo().count({ where: { workspaceId: hub.id, capabilityCode: 'super_agent' as any } });

      if (finalApplication.status === BusinessCapabilityApplicationStatus.APPROVED) {
        expect(finalAgent.status).toBe(SuperAgentStatus.ACTIVE);
        expect(finalRole.status).toBe(AccountRoleStatus.ACTIVE);
        expect(capabilityCount).toBe(1);
      } else {
        expect(finalApplication.status).toBe(BusinessCapabilityApplicationStatus.REJECTED);
        // SuperAgent has no REJECTED status value -- stays PENDING with a rejectionReason (documented B5B exception).
        expect(finalAgent.status).toBe(SuperAgentStatus.PENDING);
        expect(finalAgent.rejectionReason).toBe('racing rejection');
        expect(finalRole.status).toBe(AccountRoleStatus.REJECTED);
        expect(capabilityCount).toBe(0);
      }
    });
  });

  describe('§11 — idempotency (sequential retries, both verticals)', () => {
    it('TRANSPORT: repeat apply is blocked, repeat approve returns the same consistent snapshot, repeat reject (on a fresh application) returns the same consistent snapshot', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);

      await expect(submitTransport(owner, business.id)).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });

      const firstApproval = await service.approveApplication(submitted.application.id, admin);
      const secondApproval = await service.approveApplication(submitted.application.id, admin);
      expect(secondApproval.capability).toEqual(firstApproval.capability);
      expect(secondApproval.accountRole).toEqual(firstApproval.accountRole);
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: 'transport' as any } })).toBe(1);

      // A fresh application for a DIFFERENT business, rejected twice.
      const { business: business2 } = await makeCleanBusiness(owner);
      const submitted2 = await submitTransport(owner, business2.id);
      const firstRejection = await service.rejectApplication(submitted2.application.id, admin, 'first reason');
      const secondRejection = await service.rejectApplication(submitted2.application.id, admin, 'a different retry reason');
      expect(secondRejection.application.rejectionReason).toBe('first reason'); // never overwritten by the retry's own text
      expect(firstRejection.application.rejectionReason).toBe('first reason');
    });

    it('SUPER_AGENT: repeat apply is blocked, repeat approve returns the same consistent snapshot, repeat reject (on a fresh application) returns the same consistent snapshot', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, hub } = await makeHubBusiness(owner);
      const submitted = await submitSuperAgent(owner, business.id, hub.id);

      await expect(submitSuperAgent(owner, business.id, hub.id)).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });

      const firstApproval = await service.approveApplication(submitted.application.id, admin);
      const secondApproval = await service.approveApplication(submitted.application.id, admin);
      expect(secondApproval.capability).toEqual(firstApproval.capability);
      expect(secondApproval.accountRole).toEqual(firstApproval.accountRole);
      expect(await capabilityRepo().count({ where: { workspaceId: hub.id, capabilityCode: 'super_agent' as any } })).toBe(1);

      // A fresh application on a DIFFERENT hub, rejected twice.
      const { hub: hub2 } = await (async () => {
        const membership = await membershipRepo().findOneOrFail({ where: { businessId: business.id, userId: owner.id } });
        const hub2 = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Hub 2', isDefault: false } as any));
        await assignmentRepo().save(assignmentRepo().create({
          businessMembershipId: membership.id, workspaceId: hub2.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
        } as any));
        return { hub: hub2 };
      })();
      const submitted2 = await submitSuperAgent(owner, business.id, hub2.id);
      const firstRejection = await service.rejectApplication(submitted2.application.id, admin, 'first reason');
      const secondRejection = await service.rejectApplication(submitted2.application.id, admin, 'a different retry reason');
      expect(secondRejection.application.rejectionReason).toBe('first reason');
      expect(firstRejection.application.rejectionReason).toBe('first reason');
    });
  });
});
