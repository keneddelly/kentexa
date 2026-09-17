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
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode } from './entities/business-capability.entity';
import { BusinessCapabilityApplication } from './entities/business-capability-application.entity';
import { ProviderType } from '../transport/entities/transport-provider.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { User } from '../users/entities/user.entity';
import { AccountRole } from '../role-context/entities/account-role.entity';

/**
 * B7C — Generic Business Capability operational foundation. Real
 * disposable schema inside the dedicated kentexa_b5b_test database,
 * reusing the exact same shared safety harness as every prior B5B/B5C/
 * B6B/B6D-P0 spec.
 *
 * Proves, against genuinely real Postgres:
 *   1. Identity verification is enforced BEFORE any organizational row is
 *      created, for COMMERCE/TRANSPORT/SUPER_AGENT, and is NOT enforced
 *      for SERVICE (unchanged from B6B, per this stage's own explicit
 *      instruction not to touch Service's verification policy).
 *   2. SUPER_AGENT's city is now a real, validated Tanzania location,
 *      never workspace.name, and the resolver fails closed on a missing
 *      or unresolvable city.
 *   3. SUPER_AGENT's workspace authority check (an unauthorized/foreign
 *      workspaceId) fails closed exactly as it always has.
 *   4. SUPER_AGENT reapply-after-rejection is now deterministic (same row
 *      reused, never a duplicate), without any schema change.
 *   5. Multi-business/multi-workspace isolation holds for all three newly
 *      gated capabilities.
 */
describe('B7C — capability verification + SuperAgent real-city + reapply, real disposable-DB', () => {
  const config = getB5BTestConnectionConfig();
  const reachable = !!config;
  let ds: DataSource;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const membershipRepo = () => ds.getRepository(BusinessMembership);
  const assignmentRepo = () => ds.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => ds.getRepository(BusinessCapability);
  const applicationRepo = () => ds.getRepository(BusinessCapabilityApplication);
  const superAgentRepo = () => ds.getRepository(SuperAgent);
  const accountRoleRepo = () => ds.getRepository(AccountRole);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({
      email: `u${n}@b7c-test.local`, phone: `+2551${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}`,
    } as any));
  };

  const makeCleanBusiness = async (owner: User) => {
    const n = ++seq;
    const business = await businessRepo().save(businessRepo().create({ legalName: `Co ${n}`, tradingName: `Co ${n}`, user: owner, status: BusinessStatus.ACTIVE } as any));
    const workspace = await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true, status: OperationalWorkspaceStatus.ACTIVE } as any));
    const membership = await membershipRepo().save(membershipRepo().create({
      businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
    } as any));
    const assignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membership.id, workspaceId: workspace.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { business, workspace, membership, assignment };
  };

  const addHubWorkspace = async (businessId: number, membershipId: number, name: string) => {
    const hub = await workspaceRepo().save(workspaceRepo().create({ businessId, name, isDefault: false, status: OperationalWorkspaceStatus.ACTIVE } as any));
    const hubAssignment = await assignmentRepo().save(assignmentRepo().create({
      businessMembershipId: membershipId, workspaceId: hub.id, status: WorkspaceAssignmentStatus.ACTIVE, permissions: {},
    } as any));
    return { hub, hubAssignment };
  };

  // A configurable verification stub: throws for any userId in `denyUserIds`,
  // otherwise resolves silently -- proves the real applyForCapability() call
  // site genuinely invokes VerificationService.requireFeature(userId, feature)
  // and genuinely aborts (creates nothing) when it rejects.
  const denyUserIds = new Set<number>();
  const verificationStub = {
    requireFeature: jest.fn(async (userId: number, _feature: string) => {
      if (denyUserIds.has(userId)) {
        const err: any = new Error('VERIFICATION_REQUIRED');
        err.response = { code: 'VERIFICATION_REQUIRED', message: 'VERIFICATION_REQUIRED' };
        throw err;
      }
    }),
  };

  // A configurable tz-location stub: resolves a known set of city strings,
  // returns null for anything else -- proves the resolver's own fail-closed
  // behavior on an unresolvable city, without needing the real seeded
  // location tables in this disposable test database.
  const KNOWN_CITIES: Record<string, { district: string; region: string }> = {
    'Dar es Salaam': { district: 'Ilala', region: 'Dar es Salaam' },
    'Arusha': { district: 'Arusha', region: 'Arusha' },
  };
  const tzLocationStub = {
    resolveAgentLocation: jest.fn(async (query: string) => {
      const hit = KNOWN_CITIES[query];
      return hit ? { wardId: null, ward: null, districtId: 1, district: hit.district, regionId: 1, region: hit.region, lat: null, lng: null } : null;
    }),
  };

  let service: BusinessCapabilityApplicationService;

  beforeAll(async () => {
    if (!config) return;
    const client = new Client(config);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    await bootstrapB5BTestSchema(config);

    ds = new DataSource({
      type: 'postgres', host: config.host, port: config.port, username: config.user,
      password: config.password, database: config.database, synchronize: false,
      entities: [...B5B_ALL_ENTITIES],
    });
    await ds.initialize();

    service = new BusinessCapabilityApplicationService(
      applicationRepo(), capabilityRepo(), ds,
      verificationStub as any,
      tzLocationStub as any,
    );
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy().catch(() => {});
  });

  beforeEach(() => {
    denyUserIds.clear();
    verificationStub.requireFeature.mockClear();
    tzLocationStub.resolveAgentLocation.mockClear();
  });

  it('§0 explicit connectivity assertion', async () => {
    expect(reachable).toBe(true);
    const rows = await ds.query('SELECT current_database() AS db, current_user AS usr');
    expect(rows[0].db).toBe(B5B_TEST_DB_NAME);
    expect(rows[0].usr).toBe(B5B_TEST_DB_USER);
  });

  describe('A — COMMERCE verification', () => {
    it('unverified/ineligible applicant fails, creates nothing', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      denyUserIds.add(owner.id);

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });

      expect(verificationStub.requireFeature).toHaveBeenCalledWith(owner.id, 'CREATE_STORE');
      const apps = await applicationRepo().find({ where: { businessId: business.id } });
      expect(apps.length).toBe(0);
    });

    it('eligible applicant succeeds', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      const result = await service.applyForCapability(business.id, 'commerce', owner, {});
      expect(result.application.capabilityCode).toBe('commerce');
      expect(verificationStub.requireFeature).toHaveBeenCalledWith(owner.id, 'CREATE_STORE');
    });

    it('Business A cannot grant Business B COMMERCE', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business: businessA } = await makeCleanBusiness(owner);
      const { business: businessB } = await makeCleanBusiness(owner);

      await service.applyForCapability(businessA.id, 'commerce', owner, {});
      const bCapability = await capabilityRepo().findOne({ where: { workspaceId: (await workspaceRepo().findOneOrFail({ where: { businessId: businessB.id } })).id, capabilityCode: BusinessCapabilityCode.COMMERCE } });
      expect(bCapability).toBeNull();
    });
  });

  describe('B — TRANSPORT verification', () => {
    it('unverified/ineligible applicant fails, creates nothing', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      denyUserIds.add(owner.id);

      await expect(service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } }))
        .rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
      expect(verificationStub.requireFeature).toHaveBeenCalledWith(owner.id, 'BECOME_TRANSPORTER');
      const apps = await applicationRepo().find({ where: { businessId: business.id } });
      expect(apps.length).toBe(0);
    });

    it('eligible applicant succeeds, type required, exact Business binding', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      await expect(service.applyForCapability(business.id, 'transport', owner, {}))
        .rejects.toMatchObject({ response: { code: 'TRANSPORT_PROVIDER_TYPE_REQUIRED' } });

      const result = await service.applyForCapability(business.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });
      expect(result.application.capabilityCode).toBe('transport');
    });

    it('Business A cannot grant Business B TRANSPORT', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business: businessA } = await makeCleanBusiness(owner);
      const { business: businessB } = await makeCleanBusiness(owner);

      await service.applyForCapability(businessA.id, 'transport', owner, { applicationData: { type: ProviderType.VAN } });
      const bWorkspace = await workspaceRepo().findOneOrFail({ where: { businessId: businessB.id } });
      const bCapability = await capabilityRepo().findOne({ where: { workspaceId: bWorkspace.id, capabilityCode: BusinessCapabilityCode.TRANSPORT } });
      expect(bCapability).toBeNull();
    });
  });

  describe('C — SUPER_AGENT verification, real city, workspace authority, reapply', () => {
    it('unverified/ineligible applicant fails, creates nothing', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      denyUserIds.add(owner.id);

      await expect(service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id, applicationData: { city: 'Dar es Salaam' } }))
        .rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
      expect(verificationStub.requireFeature).toHaveBeenCalledWith(owner.id, 'BECOME_SUPER_AGENT');
    });

    it('workspace required', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'super_agent', owner, { applicationData: { city: 'Dar es Salaam' } }))
        .rejects.toMatchObject({ response: { code: 'WORKSPACE_ID_REQUIRED' } });
    });

    it('real city required -- missing city fails closed, never falls back to workspace.name', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id }))
        .rejects.toMatchObject({ response: { code: 'SUPER_AGENT_CITY_REQUIRED' } });
    });

    it('unresolvable city fails closed with SUPER_AGENT_CITY_INVALID', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await expect(service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id, applicationData: { city: 'Nowhereville' } }))
        .rejects.toMatchObject({ response: { code: 'SUPER_AGENT_CITY_INVALID' } });
    });

    it('workspace.name never becomes city -- eligible application resolves a REAL district, not the workspace display name', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      expect(workspace.name).toBe('Default Operations');

      const result = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id, applicationData: { city: 'Dar es Salaam' } });
      const saved = await superAgentRepo().findOneOrFail({ where: { id: result.operationalProfile.id } });
      expect(saved.city).toBe('Ilala');
      expect(saved.city).not.toBe(workspace.name);
      expect(saved.city).not.toBe('Default Operations');
    });

    it('unauthorized workspace fails -- a workspaceId the caller has no ACTIVE assignment on is rejected even if it belongs to a Business they otherwise own', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const { hub } = await addHubWorkspace(business.id, membership.id, 'Kariakoo');
      await assignmentRepo().update({ workspaceId: hub.id }, { status: WorkspaceAssignmentStatus.REVOKED });

      await expect(service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } }))
        .rejects.toBeDefined();
    });

    it('exact workspace binding -- Workspace A application never creates/binds authority for Workspace B', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const { hub: kariakoo } = await addHubWorkspace(business.id, membership.id, 'Kariakoo');
      const { hub: ubungo } = await addHubWorkspace(business.id, membership.id, 'Ubungo');

      const result = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: kariakoo.id, applicationData: { city: 'Dar es Salaam' } });
      const saved = await superAgentRepo().findOneOrFail({ where: { id: result.operationalProfile.id } });
      expect(saved.workspaceId).toBe(kariakoo.id);
      expect(saved.workspaceId).not.toBe(ubungo.id);

      const ubungoCapability = await capabilityRepo().findOne({ where: { workspaceId: ubungo.id, capabilityCode: BusinessCapabilityCode.SUPER_AGENT } });
      expect(ubungoCapability).toBeNull();
    });

    it('reapply behavior is deterministic: rejected application, owner corrects info, reapplies -- same SuperAgent row reused, never a duplicate', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);

      const first = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id, applicationData: { city: 'Dar es Salaam' } });
      await service.rejectApplication(first.application.id, admin, 'Missing government ID');

      const firstProfileId = first.operationalProfile.id;
      const rejected = await superAgentRepo().findOneOrFail({ where: { id: firstProfileId } });
      expect(rejected.rejectionReason).toBe('Missing government ID');

      // Owner corrects and reapplies with a different (still real) city.
      const second = await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: workspace.id, applicationData: { city: 'Arusha' } });

      expect(second.operationalProfile.id).toBe(firstProfileId); // same row reused, never a duplicate
      const reused = await superAgentRepo().findOneOrFail({ where: { id: firstProfileId } });
      expect(reused.rejectionReason).toBeNull();
      expect(reused.city).toBe('Arusha');

      const allSuperAgentRows = await superAgentRepo().find({ where: { workspaceId: workspace.id } });
      expect(allSuperAgentRows.length).toBe(1);

      // The new application is a genuinely new BusinessCapabilityApplication
      // row (append-only history), not a mutation of the rejected one.
      expect(second.application.id).not.toBe(first.application.id);

      // And it can now be approved normally.
      const approved = await service.approveApplication(second.application.id, admin);
      expect(approved.capability.status).toBe('active');
    });

    it('a genuinely still-pending row (never rejected) cannot be silently reused by a second application attempt', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const { hub } = await addHubWorkspace(business.id, membership.id, 'Fresh Hub');

      await service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Dar es Salaam' } });
      // A second attempt while the first is still PENDING (never rejected)
      // must fail via the outer validateNoPending check, before ever
      // reaching resolveSuperAgentProfile()'s own reapply logic.
      await expect(service.applyForCapability(business.id, 'super_agent', owner, { workspaceId: hub.id, applicationData: { city: 'Arusha' } }))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
    });
  });

  describe('D — SERVICE regression (verification policy unchanged)', () => {
    it('SERVICE application succeeds with no verification call', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      verificationStub.requireFeature.mockClear();

      const result = await service.applyForCapability(business.id, 'service', owner, {});
      expect(result.application.capabilityCode).toBe('service');
      expect(verificationStub.requireFeature).not.toHaveBeenCalled();
    });
  });

  describe('E — admin read-model, sentinel privacy check', () => {
    it('admin list surfaces TRANSPORT applicationData.type and SUPER_AGENT applicationData.city + target workspace, with no sensitive User fields', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business: transportBiz } = await makeCleanBusiness(owner);
      await service.applyForCapability(transportBiz.id, 'transport', owner, { applicationData: { type: ProviderType.BODA } });

      const { business: hubBiz, workspace: hubWorkspace } = await makeCleanBusiness(owner);
      await service.applyForCapability(hubBiz.id, 'super_agent', owner, { workspaceId: hubWorkspace.id, applicationData: { city: 'Arusha' } });

      const pending = await service.listForAdmin('pending');
      const json = JSON.stringify(pending);

      const transportRow = pending.find((r: any) => r.application.capabilityCode === 'transport' && r.business.id === transportBiz.id);
      expect(transportRow.application.applicationData).toMatchObject({ type: ProviderType.BODA });

      const superAgentRow = pending.find((r: any) => r.application.capabilityCode === 'super_agent' && r.business.id === hubBiz.id);
      expect(superAgentRow.application.applicationData).toMatchObject({ city: 'Arusha' });
      expect(superAgentRow.workspace.id).toBe(hubWorkspace.id);

      // No raw User/financial fields ever appear in this admin response.
      expect(json).not.toContain('password');
      expect(json).not.toContain('payoutAccountNumber');
      expect(json).not.toContain('payoutBankName');
      expect(json).not.toMatch(/"email"/);
    });

    it('Business owner read model (listForBusiness) is not applicant-only, and correctly reports PENDING/APPROVED/REJECTED', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const teammate = await makeUser();
      const admin = await makeUser();
      const { business, workspace, membership } = await makeCleanBusiness(owner);
      // A second active member of the same Business (not the applicant) --
      // MANAGER, not OWNER: UQ_business_membership_one_owner allows only
      // one owner-template membership per Business.
      await membershipRepo().save(membershipRepo().create({
        businessId: business.id, userId: teammate.id, roleTemplate: BusinessMembershipRoleTemplate.MANAGER, status: BusinessMembershipStatus.ACTIVE,
      } as any));

      const commerceApp = await service.applyForCapability(business.id, 'commerce', owner, {});
      await service.approveApplication(commerceApp.application.id, admin);

      const { business: business2 } = await makeCleanBusiness(owner);
      const transportApp = await service.applyForCapability(business2.id, 'transport', owner, { applicationData: { type: ProviderType.TRUCK } });
      await service.rejectApplication(transportApp.application.id, admin, 'Incomplete documents');

      // Non-applicant teammate can read business's own history (membership-scoped, not applicant-only).
      const list = await service.listForBusiness(business.id, teammate);
      const found = list.find((r: any) => r.application.id === commerceApp.application.id);
      expect(found.application.status).toBe('approved');

      const rejectedList = await service.listForBusiness(business2.id, owner);
      const rejectedFound = rejectedList.find((r: any) => r.application.id === transportApp.application.id);
      expect(rejectedFound.application.status).toBe('rejected');
      expect(rejectedFound.application.rejectionReason).toBe('Incomplete documents');
    });
  });
});
