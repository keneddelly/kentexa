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
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';

/**
 * Business Capability Activation Stage B2, mission §31. Real disposable
 * Postgres (same technique as business.service.spec.ts and the Migration 9
 * spec) so uniqueness/concurrency/transaction behavior is proven against a
 * genuine schema with Migration 9's real constraints applied via the actual
 * migration class, not synchronize guesswork.
 */
describe('BusinessCapabilityApplicationService.applyForCapability() — real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b2_apply_test';
  const BASE_ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile, User,
  ];

  let reachable = false;
  let adminClient: Client;
  let baseDataSource: DataSource; // synchronize:true, bootstraps the schema + runs Migration 9
  let ds: DataSource; // synchronize:false, the real repos the service uses
  let service: BusinessCapabilityApplicationService;
  let seq = 0;

  const userRepo = () => ds.getRepository(User);
  const businessRepo = () => ds.getRepository(Business);
  const workspaceRepo = () => ds.getRepository(OperationalWorkspace);
  const membershipRepo = () => ds.getRepository(BusinessMembership);
  const assignmentRepo = () => ds.getRepository(WorkspaceAssignment);
  const capabilityRepo = () => ds.getRepository(BusinessCapability);
  const sellerProfileRepo = () => ds.getRepository(SellerProfile);
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const applicationRepo = () => ds.getRepository(BusinessCapabilityApplication);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b2-test.local`, phone: `+2558${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

  /** Full Business + default Workspace + OWNER Membership + Assignment chain -- the "Business 3" shape. */
  const makeCleanBusiness = async (owner: any) => {
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

    // Same rationale as the Migration 9 spec: these two enum types are
    // real production types created explicitly by earlier migrations, not
    // by TypeORM's own synchronize naming (which produces different names
    // -- confirmed empirically in Stage B1).
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

    service = new BusinessCapabilityApplicationService(
      applicationRepo(), capabilityRepo(), ds,
    );
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

  describe('1-6. clean application', () => {
    it('creates exactly 3 PENDING rows, zero BusinessCapability, non-switchable role', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace, assignment } = await makeCleanBusiness(owner);

      const response = await service.applyForCapability(business.id, 'commerce', owner, {});

      expect(response.application.status).toBe(BusinessCapabilityApplicationStatus.PENDING);
      expect(response.application.capabilityCode).toBe(BusinessCapabilityCode.COMMERCE);
      expect(response.accountRole.switchable).toBe(false);

      const profile = await sellerProfileRepo().findOne({ where: { businessId: business.id } });
      expect(profile?.status).toBe(SellerStatus.PENDING);

      const role = await accountRoleRepo().findOne({ where: { userId: owner.id, roleType: AccountRoleType.SELLER, workspaceAssignmentId: assignment.id } });
      expect(role?.status).toBe(AccountRoleStatus.PENDING);
      expect(role?.profileId).toBe(profile!.id);

      const app = await applicationRepo().findOne({ where: { id: response.application.id } });
      expect(app).toMatchObject({
        businessId: business.id, workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE,
        status: BusinessCapabilityApplicationStatus.PENDING, requestedByUserId: owner.id, requestedByWorkspaceAssignmentId: assignment.id,
        operationalProfileType: RoleProfileType.SELLER_PROFILE, operationalProfileId: profile!.id,
      });

      // 16. BusinessCapability zero-write proof.
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id } })).toBe(0);
    });
  });

  describe('7-8. duplicate application', () => {
    it('7. a second sequential application for the same workspace is blocked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await service.applyForCapability(business.id, 'commerce', owner, {});

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });
    });

    it('8. two concurrent applications for the same workspace never produce two applications/profiles/roles', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);

      const results = await Promise.allSettled([
        service.applyForCapability(business.id, 'commerce', owner, {}),
        service.applyForCapability(business.id, 'commerce', owner, {}),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_PENDING' } });

      expect(await applicationRepo().count({ where: { workspaceId: workspace.id } })).toBe(1);
      expect(await sellerProfileRepo().count({ where: { businessId: business.id } })).toBe(1);
      expect(await accountRoleRepo().count({ where: { userId: owner.id, roleType: AccountRoleType.SELLER } })).toBe(1);
    });
  });

  it('9. same human, Business A + Business B — fully isolated applications', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const a = await makeCleanBusiness(owner);
    const b = await makeCleanBusiness(owner);

    const respA = await service.applyForCapability(a.business.id, 'commerce', owner, {});
    const respB = await service.applyForCapability(b.business.id, 'commerce', owner, {});

    expect(respA.accountRole.id).not.toBe(respB.accountRole.id);
    expect(respA.operationalProfile.id).not.toBe(respB.operationalProfile.id);
    expect(respA.application.id).not.toBe(respB.application.id);

    const roleA = await accountRoleRepo().findOne({ where: { id: respA.accountRole.id } });
    const roleB = await accountRoleRepo().findOne({ where: { id: respB.accountRole.id } });
    expect(roleA?.workspaceAssignmentId).toBe(a.assignment.id);
    expect(roleB?.workspaceAssignmentId).toBe(b.assignment.id);
  });

  describe('10-11. capability blocks application', () => {
    it('10. ACTIVE capability blocks application (AR38/BiS shape)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await capabilityRepo().save(capabilityRepo().create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_ALREADY_ACTIVE' } });
      expect(await applicationRepo().count({ where: { workspaceId: workspace.id } })).toBe(0);
      expect(await sellerProfileRepo().count({ where: { businessId: business.id } })).toBe(0);
    });

    it('11. SUSPENDED capability blocks application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await capabilityRepo().save(capabilityRepo().create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.SUSPENDED } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_SUSPENDED' } });
    });

    it('REVOKED capability fails closed with a reconciliation code, never silently allows reapplication', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await capabilityRepo().save(capabilityRepo().create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.REVOKED } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION' } });
    });
  });

  describe('12-15. authority failures', () => {
    it('12. a non-owner (no BusinessMembership at all) is blocked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const stranger = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      await expect(service.applyForCapability(business.id, 'commerce', stranger, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_REQUIRED' } });
    });

    it('12b. an active but non-OWNER membership (e.g. future manager) is blocked in B2 (owner-only MVP)', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const manager = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await membershipRepo().save(membershipRepo().create({
        businessId: business.id, userId: manager.id, roleTemplate: BusinessMembershipRoleTemplate.MANAGER, status: BusinessMembershipStatus.ACTIVE,
      } as any));

      await expect(service.applyForCapability(business.id, 'commerce', manager, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_REQUIRED' } });
    });

    it('13. an inactive (revoked) OWNER membership is blocked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      await membershipRepo().update(membership.id, { status: BusinessMembershipStatus.REVOKED });

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_REQUIRED' } });
    });

    it('14. an inactive (suspended) default workspace is blocked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      await workspaceRepo().update(workspace.id, { status: 'suspended' as any });

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'WORKSPACE_NOT_ACTIVE' } });
    });

    it('15. a missing WorkspaceAssignment (membership exists, no assignment row) is blocked', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const business = await businessRepo().save(businessRepo().create({ legalName: 'No Assignment Co', user: owner } as any));
      await workspaceRepo().save(workspaceRepo().create({ businessId: business.id, name: 'Default Operations', isDefault: true } as any));
      await membershipRepo().save(membershipRepo().create({
        businessId: business.id, userId: owner.id, roleTemplate: BusinessMembershipRoleTemplate.OWNER, status: BusinessMembershipStatus.ACTIVE,
      } as any));
      // Deliberately no WorkspaceAssignment row.

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_WORKSPACE_UNRESOLVED' } });
    });

    it('also blocks a suspended Business outright', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await businessRepo().update(business.id, { status: 'suspended' as any });

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_NOT_ACTIVE' } });
    });

    it('a non-existent Business fails closed with BUSINESS_NOT_FOUND', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      await expect(service.applyForCapability(999999, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_NOT_FOUND' } });
    });
  });

  describe('16-17. historical/legacy shapes', () => {
    it('16. AR37\'s exact historical shape (PENDING SellerProfile + PENDING AccountRole, no live application) fails closed for reconciliation', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, assignment } = await makeCleanBusiness(owner);
      // Simulate the pre-Stage-B migration-8-backfilled state directly (never through this service).
      const profile = await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'Legacy', status: SellerStatus.PENDING,
      } as any));
      await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.PENDING,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: profile.id, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: assignment.id,
      } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION' } });

      // Never mutated, never duplicated.
      expect(await sellerProfileRepo().count({ where: { businessId: business.id } })).toBe(1);
      expect(await accountRoleRepo().count({ where: { userId: owner.id, roleType: AccountRoleType.SELLER } })).toBe(1);
    });

    it('17. AR38\'s exact historical shape (APPROVED profile + ACTIVE capability) is blocked as already active, not reprocessed', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace, assignment } = await makeCleanBusiness(owner);
      const profile = await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'BiS', status: SellerStatus.APPROVED,
      } as any));
      await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: profile.id, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: assignment.id,
      } as any));
      await capabilityRepo().save(capabilityRepo().create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_ALREADY_ACTIVE' } });
      expect(await sellerProfileRepo().count({ where: { businessId: business.id } })).toBe(1);
    });

    it('an APPROVED profile with NO capability at all (genuine inconsistency) fails closed distinctly', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'Orphaned Approval', status: SellerStatus.APPROVED,
      } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'SELLER_APPLICATION_STATE_INCONSISTENT' } });
    });

    it('a SUSPENDED individual-Seller profile fails closed distinctly from a fresh application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'Suspended Seller', status: SellerStatus.SUSPENDED,
      } as any));

      await expect(service.applyForCapability(business.id, 'commerce', owner, {}))
        .rejects.toMatchObject({ response: { code: 'SELLER_APPLICATION_STATE_INCONSISTENT' } });
    });
  });

  describe('18-20. reapplication after rejection', () => {
    it('reuses the same SellerProfile id, same AccountRole id, and creates a new Application row', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      const first = await service.applyForCapability(business.id, 'commerce', owner, {});
      // Simulate B3's future rejection outcome directly (B2 doesn't implement approval/rejection).
      await applicationRepo().update(first.application.id, { status: BusinessCapabilityApplicationStatus.REJECTED, rejectionReason: 'incomplete documents' });
      await sellerProfileRepo().update(first.operationalProfile.id, { status: SellerStatus.REJECTED, rejectionReason: 'incomplete documents' });
      await accountRoleRepo().update(first.accountRole.id, { status: AccountRoleStatus.REJECTED, statusReason: 'incomplete documents' });

      const second = await service.applyForCapability(business.id, 'commerce', owner, {});

      expect(second.operationalProfile.id).toBe(first.operationalProfile.id); // 18
      expect(second.accountRole.id).toBe(first.accountRole.id); // 19
      expect(second.application.id).not.toBe(first.application.id); // 20
      expect(second.application.status).toBe(BusinessCapabilityApplicationStatus.PENDING);
      expect(second.operationalProfile.status).toBe(SellerStatus.PENDING);
      expect(second.accountRole.status).toBe(AccountRoleStatus.PENDING);

      const reloadedFirst = await applicationRepo().findOne({ where: { id: first.application.id } });
      expect(reloadedFirst?.status).toBe(BusinessCapabilityApplicationStatus.REJECTED); // old application untouched/not overwritten
    });
  });

  describe('cancelled-history tolerance (Stage B2 mission narrative §23 "CANCELLED HISTORY" -- distinct from test-matrix §31 item 23)', () => {
    it('a CANCELLED application + REJECTED profile/role still allows a new application, reusing the same identities', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      const first = await service.applyForCapability(business.id, 'commerce', owner, {});
      // Simulate a future cancel endpoint's outcome directly.
      await applicationRepo().update(first.application.id, { status: BusinessCapabilityApplicationStatus.CANCELLED });
      await sellerProfileRepo().update(first.operationalProfile.id, { status: SellerStatus.REJECTED });
      await accountRoleRepo().update(first.accountRole.id, { status: AccountRoleStatus.REJECTED });

      const second = await service.applyForCapability(business.id, 'commerce', owner, {});
      expect(second.operationalProfile.id).toBe(first.operationalProfile.id);
      expect(second.accountRole.id).toBe(first.accountRole.id);
      expect(second.application.id).not.toBe(first.application.id);
    });
  });

  it('21. legacy unbound SellerProfile/AccountRole for the SAME acting user are never touched by an unrelated Business application', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const legacyProfile = await sellerProfileRepo().save(sellerProfileRepo().create({
      user: owner, businessId: null, businessName: 'Legacy Personal Seller', status: SellerStatus.APPROVED,
    } as any));
    const legacyRole = await accountRoleRepo().save(accountRoleRepo().create({
      userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE, profileId: legacyProfile.id, capabilities: {}, contextVersion: 1,
      workspaceAssignmentId: null,
    } as any));

    const { business } = await makeCleanBusiness(owner);
    await service.applyForCapability(business.id, 'commerce', owner, {});

    const reloadedProfile = await sellerProfileRepo().findOne({ where: { id: legacyProfile.id } });
    const reloadedRole = await accountRoleRepo().findOne({ where: { id: legacyRole.id } });
    expect(reloadedProfile).toMatchObject({ businessId: null, status: SellerStatus.APPROVED });
    expect(reloadedRole).toMatchObject({ workspaceAssignmentId: null, status: AccountRoleStatus.ACTIVE });
  });

  it('22. never mutates User.role or User.activeRoles', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const before = await userRepo().findOne({ where: { id: owner.id } });
    const { business } = await makeCleanBusiness(owner);

    await service.applyForCapability(business.id, 'commerce', owner, {});

    const after = await userRepo().findOne({ where: { id: owner.id } });
    expect(after?.role).toBe(before?.role);
    expect(after?.activeRoles).toEqual(before?.activeRoles);
  });

  it('rejects a structurally invalid capability code with CAPABILITY_NOT_SUPPORTED (400)', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const { business } = await makeCleanBusiness(owner);
    await expect(service.applyForCapability(business.id, 'banana', owner, {}))
      .rejects.toMatchObject({ response: { code: 'CAPABILITY_NOT_SUPPORTED' } });
  });

  it('rejects a valid-but-unimplemented capability code (transport) with CAPABILITY_NOT_SUPPORTED, never silently treated as Commerce', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const { business } = await makeCleanBusiness(owner);
    await expect(service.applyForCapability(business.id, 'transport', owner, {}))
      .rejects.toMatchObject({ response: { code: 'CAPABILITY_NOT_SUPPORTED' } });
    expect(await applicationRepo().count({ where: { businessId: business.id } })).toBe(0);
  });

  it('strips authority-bearing keys from applicationData before persisting it', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const { business } = await makeCleanBusiness(owner);
    const response = await service.applyForCapability(business.id, 'commerce', owner, {
      applicationData: { businessId: 999, workspaceId: 999, accountRoleId: 999, notes: 'legit note' } as any,
    });
    const app = await applicationRepo().findOne({ where: { id: response.application.id } });
    expect(app?.applicationData).toEqual({ notes: 'legit note' });
  });

  it('15. the freshly-created PENDING role is genuinely non-switchable per the real RoleContextService.isSwitchable() -- not just the response DTO\'s own literal', async () => {
    if (!reachable) return;
    const owner = await makeUser();
    const { business } = await makeCleanBusiness(owner);
    const response = await service.applyForCapability(business.id, 'commerce', owner, {});

    const unused: any = { findOne: jest.fn() };
    const roleContextService = new RoleContextService(
      userRepo(), accountRoleRepo(), unused, sellerProfileRepo(), unused, unused, unused, assignmentRepo(), { emitRevoked: jest.fn() } as any,
    );
    const role = await accountRoleRepo().findOne({ where: { id: response.accountRole.id } });
    await expect(roleContextService.isSwitchable(role as any)).resolves.toBe(false);
  });
});
