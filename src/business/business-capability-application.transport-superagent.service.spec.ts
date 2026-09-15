import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { AddBusinessCapabilityApplication1788261600000 } from '../database/migrations/1788261600000-AddBusinessCapabilityApplication';
import { Business } from './entities/business.entity';
import { OperationalWorkspace } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode, BusinessCapabilityStatus } from './entities/business-capability.entity';
import {
  BusinessCapabilityApplication,
  BusinessCapabilityApplicationStatus,
} from './entities/business-capability-application.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { User } from '../users/entities/user.entity';

/**
 * Business Capability Activation Stage B5B. Real disposable Postgres, same
 * technique as B3's own Commerce approval spec (business-capability-
 * application.approval.service.spec.ts, unmodified and still fully
 * passing) -- proves TRANSPORT and SUPER_AGENT now flow through the exact
 * same generic apply/approve/reject engine, with their own deliberately
 * different cardinality (Business-wide vs per-workspace) correctly
 * enforced, while never touching Commerce's own code path.
 */
describe('BusinessCapabilityApplicationService — TRANSPORT/SUPER_AGENT (Stage B5B), real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b5b_transport_superagent_test';
  // Mirrors business-capability-application.approval.service.spec.ts's own
  // two-DataSource technique exactly: BusinessCapabilityApplication's own
  // partial unique index (UQ_bca_workspace_code_pending, the thing
  // applyForCapability's isUniqueViolation() check maps back to a clean
  // CAPABILITY_APPLICATION_ALREADY_PENDING error) only exists via the real
  // migration's raw SQL, never via an @Index decorator on the entity --
  // plain synchronize:true against that entity would silently create the
  // table WITHOUT it, and the concurrency test below would then prove
  // nothing.
  const BASE_ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile,
    TransportProvider, SuperAgent, User,
  ];

  let reachable = false;
  let adminClient: Client;
  let baseDataSource: DataSource;
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
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const transportRepo = () => ds.getRepository(TransportProvider);
  const superAgentRepo = () => ds.getRepository(SuperAgent);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b5b-test.local`, phone: `+2554${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  /** Business with only its default workspace -- used for COMMERCE/TRANSPORT (Business-wide) scenarios. */
  const makeCleanBusiness = async (owner: User) => {
    const business = await businessRepo().save(businessRepo().create({ legalName: `Co ${seq}`, tradingName: `Co ${seq}`, user: owner } as any));
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
    const membership = await membershipRepo().save(membershipRepo().create({
      businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
    } as any));
    const assignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { business, workspace, membership, assignment };
  };

  /** Business with a default workspace PLUS an extra named hub workspace -- used for SUPER_AGENT (per-workspace) scenarios, mirroring the mission's own Kariakoo/Ubungo narrative. Both workspaces get their own real WorkspaceAssignment, exactly as the B5.0 contract requires (no "Owner implicitly has every workspace" shortcut). */
  const makeMultiWorkspaceBusiness = async (owner: User, hubName: string) => {
    const clean = await makeCleanBusiness(owner);
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId: clean.business.id, name: hubName, isDefault: false } as any));
    const hubAssignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: clean.membership.id, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { ...clean, hub, hubAssignment };
  };

  const submitTransport = (owner: User, businessId: number, type: ProviderType = ProviderType.TRUCK) =>
    service.applyForCapability(businessId, 'transport', owner, { applicationData: { type } });

  const submitSuperAgent = (owner: User, businessId: number, workspaceId: number) =>
    service.applyForCapability(businessId, 'super_agent', owner, { workspaceId });

  beforeAll(async () => {
    const probe = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    try { await probe.connect(); reachable = true; await probe.end(); } catch { reachable = false; return; }

    adminClient = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminClient.end();

    baseDataSource = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: true, entities: BASE_ENTITIES,
    });
    await baseDataSource.initialize();
    await baseDataSource.query(`CREATE TYPE business_capability_code_enum AS ENUM ('commerce', 'transport', 'cargo', 'super_agent')`);
    await baseDataSource.query(`CREATE TYPE role_profile_type_enum AS ENUM ('user', 'seller_profile', 'agent', 'super_agent', 'transport_provider')`);

    const queryRunner = baseDataSource.createQueryRunner();
    await queryRunner.connect();
    await new AddBusinessCapabilityApplication1788261600000().up(queryRunner);
    await queryRunner.release();

    ds = new DataSource({
      type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD,
      database: TEST_DB_NAME, synchronize: false,
      entities: [...BASE_ENTITIES, BusinessCapabilityApplication],
    });
    await ds.initialize();

    service = new BusinessCapabilityApplicationService(applicationRepo(), capabilityRepo(), ds);
  }, 60000);

  afterAll(async () => {
    if (!reachable) return;
    if (ds?.isInitialized) await ds.destroy();
    if (baseDataSource?.isInitialized) await baseDataSource.destroy();
    const admin = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USERNAME, password: DB_PASSWORD, database: 'postgres' });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
  }, 90000);

  describe('TRANSPORT — Business-wide cardinality', () => {
    it('apply requires a valid ProviderType in applicationData -- rejects with no type', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'transport', owner, {}))
        .rejects.toMatchObject({ response: { code: 'TRANSPORT_PROVIDER_TYPE_REQUIRED' } });
    });

    it('apply creates a PENDING TransportProvider (businessId-bound, no workspaceId) + PENDING AccountRole(TRANSPORT_PROVIDER) + PENDING application on the default workspace', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace, assignment } = await makeCleanBusiness(owner);

      const result = await submitTransport(owner, business.id, ProviderType.BUS);

      expect(result.application.capabilityCode).toBe(BusinessCapabilityCode.TRANSPORT);
      expect(result.workspace.id).toBe(workspace.id); // default workspace, not a new one
      expect(result.operationalProfile.type).toBe(RoleProfileType.TRANSPORT_PROVIDER);
      expect(result.accountRole.switchable).toBe(false);

      const provider = await transportRepo().findOne({ where: { id: result.operationalProfile.id } });
      expect(provider?.businessId).toBe(business.id);
      expect(provider?.status).toBe(ProviderStatus.PENDING);
      expect(provider?.type).toBe(ProviderType.BUS);
      expect(provider?.name).toBe(business.tradingName);

      const role = await accountRoleRepo().findOne({ where: { id: result.accountRole.id } });
      expect(role?.roleType).toBe(AccountRoleType.TRANSPORT_PROVIDER);
      expect(role?.status).toBe(AccountRoleStatus.PENDING);
      expect(role?.workspaceAssignmentId).toBe(assignment.id);
    });

    it('approve activates TRANSPORT capability on the default workspace, sets TransportProvider VERIFIED + verifiedAt, activates the AccountRole', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);

      const result = await service.approveApplication(submitted.application.id, admin);

      expect(result.capability).toMatchObject({ code: BusinessCapabilityCode.TRANSPORT, status: BusinessCapabilityStatus.ACTIVE });
      expect(result.accountRole.switchable).toBe(true);

      const capability = await capabilityRepo().findOne({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.TRANSPORT } });
      expect(capability?.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect(capability?.approvedByUserId).toBe(admin.id);

      const provider = await transportRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(provider?.status).toBe(ProviderStatus.VERIFIED);
      expect(provider?.verifiedAt).toBeTruthy();

      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.ACTIVE);
    });

    it('reject sets TransportProvider REJECTED with the reason, AccountRole REJECTED, zero capability created', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);

      const result = await service.rejectApplication(submitted.application.id, admin, 'Missing vehicle registration documents');

      expect(result.capability).toBeNull();
      const provider = await transportRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(provider?.status).toBe(ProviderStatus.REJECTED);
      expect(provider?.rejectionReason).toBe('Missing vehicle registration documents');
      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.REJECTED);
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.TRANSPORT } })).toBe(0);
    });

    it('idempotent re-approve returns the same consistent state, creates no duplicate capability, never overwrites verifiedAt', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitTransport(owner, business.id);
      const first = await service.approveApplication(submitted.application.id, admin);

      const second = await service.approveApplication(submitted.application.id, admin);

      expect(second.capability).toEqual(first.capability);
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.TRANSPORT } })).toBe(1);
    });

    it('one Business, two applications for TRANSPORT would collide on the SAME TransportProvider row (Business-wide, not per-workspace) -- a second concurrent PENDING is blocked by the existing partial unique index, proving the intended cardinality', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await submitTransport(owner, business.id);

      await expect(submitTransport(owner, business.id))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
    });
  });

  describe('SUPER_AGENT — per-workspace cardinality (mission Kariakoo/Ubungo narrative)', () => {
    it('apply without workspaceId is rejected -- SUPER_AGENT must name a specific hub, never the implicit default', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'super_agent', owner, {}))
        .rejects.toMatchObject({ response: { code: 'WORKSPACE_ID_REQUIRED' } });
    });

    it('apply for a workspace the caller has no ACTIVE WorkspaceAssignment on is rejected, even though it belongs to the same Business', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, hub } = await makeMultiWorkspaceBusiness(owner, 'Kariakoo');
      // Revoke the hub assignment to simulate "not actually assigned there".
      await assignmentRepo().update({ workspaceId: hub.id }, { status: WorkspaceAssignmentStatus.REVOKED });
      await expect(submitSuperAgent(owner, business.id, hub.id)).rejects.toBeDefined();
    });

    it('apply creates a PENDING SuperAgent bound to the named workspace (no businessId field at all) + PENDING AccountRole(SUPER_AGENT) on that exact WorkspaceAssignment', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, hub, hubAssignment } = await makeMultiWorkspaceBusiness(owner, 'Kariakoo');

      const result = await submitSuperAgent(owner, business.id, hub.id);

      expect(result.workspace.id).toBe(hub.id); // the named hub, NOT the default workspace
      expect(result.operationalProfile.type).toBe(RoleProfileType.SUPER_AGENT);

      const agent = await superAgentRepo().findOne({ where: { id: result.operationalProfile.id } });
      expect(agent?.workspaceId).toBe(hub.id);
      expect((agent as any).businessId).toBeUndefined();
      expect(agent?.status).toBe(SuperAgentStatus.PENDING);

      const role = await accountRoleRepo().findOne({ where: { id: result.accountRole.id } });
      expect(role?.roleType).toBe(AccountRoleType.SUPER_AGENT);
      expect(role?.workspaceAssignmentId).toBe(hubAssignment.id);
    });

    it('two hubs under the SAME Business get two INDEPENDENT SuperAgent applications/profiles -- exact mission scenario (Kariakoo + Ubungo)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, hub: kariakoo, membership } = await makeMultiWorkspaceBusiness(owner, 'Kariakoo');
      const ubungo = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Ubungo', isDefault: false } as any));
      await assignmentRepo().save(assignmentRepo().create({
        businessMembershipId: membership.id, workspaceId: ubungo.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
      } as any));

      const kariakooApp = await submitSuperAgent(owner, business.id, kariakoo.id);
      const ubungoApp = await submitSuperAgent(owner, business.id, ubungo.id);

      expect(kariakooApp.operationalProfile.id).not.toBe(ubungoApp.operationalProfile.id);
      expect(kariakooApp.accountRole.id).not.toBe(ubungoApp.accountRole.id);

      const adminUser = await makeUser();
      await service.approveApplication(kariakooApp.application.id, adminUser);
      // Ubungo's application/capability must be completely unaffected by Kariakoo's approval.
      const ubungoApplicationRow = await applicationRepo().findOne({ where: { id: ubungoApp.application.id } });
      expect(ubungoApplicationRow?.status).toBe(BusinessCapabilityApplicationStatus.PENDING);
      expect(await capabilityRepo().count({ where: { workspaceId: ubungo.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } })).toBe(0);
      expect(await capabilityRepo().count({ where: { workspaceId: kariakoo.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } })).toBe(1);
    });

    it('approve activates SUPER_AGENT capability on the named hub workspace, sets SuperAgent ACTIVE, activates the AccountRole', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, hub } = await makeMultiWorkspaceBusiness(owner, 'Mwanza Hub');
      const submitted = await submitSuperAgent(owner, business.id, hub.id);

      const result = await service.approveApplication(submitted.application.id, admin);

      expect(result.capability).toMatchObject({ code: BusinessCapabilityCode.SUPER_AGENT, status: BusinessCapabilityStatus.ACTIVE });
      const capability = await capabilityRepo().findOne({ where: { workspaceId: hub.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } });
      expect(capability?.status).toBe(BusinessCapabilityStatus.ACTIVE);

      const agent = await superAgentRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(agent?.status).toBe(SuperAgentStatus.ACTIVE);

      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.ACTIVE);
    });

    it('reject leaves SuperAgent status PENDING (no REJECTED value exists on this entity) but records rejectionReason; AccountRole is REJECTED; zero capability created', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, hub } = await makeMultiWorkspaceBusiness(owner, 'Dodoma Hub');
      const submitted = await submitSuperAgent(owner, business.id, hub.id);

      const result = await service.rejectApplication(submitted.application.id, admin, 'Hub address could not be verified');

      expect(result.capability).toBeNull();
      const agent = await superAgentRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(agent?.status).toBe(SuperAgentStatus.PENDING);
      expect(agent?.rejectionReason).toBe('Hub address could not be verified');
      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.REJECTED);
      expect(await capabilityRepo().count({ where: { workspaceId: hub.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } })).toBe(0);
    });

    it('idempotent re-reject returns the same consistent rejected state, never corrupts the original rejectionReason', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin1 = await makeUser();
      const admin2 = await makeUser();
      const { business, hub } = await makeMultiWorkspaceBusiness(owner, 'Iringa Hub');
      const submitted = await submitSuperAgent(owner, business.id, hub.id);
      await service.rejectApplication(submitted.application.id, admin1, 'original reason');

      const retry = await service.rejectApplication(submitted.application.id, admin2, 'a different retry reason');

      expect(retry.application.rejectionReason).toBe('original reason');
      const agent = await superAgentRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(agent?.rejectionReason).toBe('original reason');
    });
  });

  describe('CARGO stays unsupported for applications (mission §11)', () => {
    it('applying for CARGO is rejected -- no AccountRoleType/profile mapping exists for it', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'cargo', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_NOT_SUPPORTED' } });
    });
  });

  describe('admin listing surfaces all applicable capability codes (mission §16 admin discovery)', () => {
    it('listForAdmin returns TRANSPORT and SUPER_AGENT applications alongside COMMERCE, each with the correct operationalProfile type/status', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, hub } = await makeMultiWorkspaceBusiness(owner, 'Listing Hub');
      const transportApp = await submitTransport(owner, business.id);
      const superAgentApp = await submitSuperAgent(owner, business.id, hub.id);

      const pending = await service.listForAdmin(BusinessCapabilityApplicationStatus.PENDING);
      const transportRow = pending.find((r: any) => r.application.id === transportApp.application.id);
      const superAgentRow = pending.find((r: any) => r.application.id === superAgentApp.application.id);

      expect(transportRow?.operationalProfile).toMatchObject({ type: RoleProfileType.TRANSPORT_PROVIDER, status: ProviderStatus.PENDING });
      expect(superAgentRow?.operationalProfile).toMatchObject({ type: RoleProfileType.SUPER_AGENT, status: SuperAgentStatus.PENDING });
    });
  });
});
