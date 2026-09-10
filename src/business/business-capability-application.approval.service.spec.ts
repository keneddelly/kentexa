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
 * Business Capability Activation Stage B3, missions §29/§33/§40. Real
 * disposable Postgres (same technique as the B2 suite and the Migration 9
 * spec) -- approve/reject involve row locking and race serialization that
 * can only be genuinely proven against a real database, not mocks.
 */
describe('BusinessCapabilityApplicationService — approve/reject (Stage B3), real disposable-DB', () => {
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
  const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const TEST_DB_NAME = 'kentexa_b3_approval_test';
  const BASE_ENTITIES = [
    Business, OperationalWorkspace, BusinessMembership, WorkspaceAssignment,
    BusinessCapability, AccountRole, ActiveRoleSession, SellerProfile, User,
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
  const sellerProfileRepo = () => ds.getRepository(SellerProfile);
  const accountRoleRepo = () => ds.getRepository(AccountRole);
  const applicationRepo = () => ds.getRepository(BusinessCapabilityApplication);

  const makeUser = async () => {
    const n = ++seq;
    return userRepo().save(userRepo().create({ email: `u${n}@b3-test.local`, phone: `+2557${String(n).padStart(8, '0')}`, password: 'x', name: `U${n}` } as any));
  };

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

  /** Submits a real B2 application through the real service -- the exact PENDING chain B3 must operate on. */
  const submitApplication = async (owner: any, businessId: number) => service.applyForCapability(businessId, 'commerce', owner, {});

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

  describe('approval happy path', () => {
    it('activates BusinessCapability, approves SellerProfile, activates AccountRole, approves Application -- atomically', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace, assignment } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const result = await service.approveApplication(submitted.application.id, admin);

      expect(result.application.status).toBe(BusinessCapabilityApplicationStatus.APPROVED);
      expect(result.capability).toMatchObject({ code: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE });
      expect(result.accountRole.switchable).toBe(true);

      const capability = await capabilityRepo().findOne({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } });
      expect(capability?.status).toBe(BusinessCapabilityStatus.ACTIVE);
      expect(capability?.approvedByUserId).toBe(admin.id);

      const profile = await sellerProfileRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(profile?.status).toBe(SellerStatus.APPROVED);

      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.ACTIVE);
      expect(role?.approvedByUserId).toBe(admin.id);
      expect(role?.workspaceAssignmentId).toBe(assignment.id);

      const application = await applicationRepo().findOne({ where: { id: submitted.application.id } });
      expect(application).toMatchObject({ status: BusinessCapabilityApplicationStatus.APPROVED, reviewedByUserId: admin.id });
      expect(application?.rejectionReason).toBeNull();

      // Only ever exactly one BusinessCapability row for this workspace+code.
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } })).toBe(1);
    });

    it('approval never creates ActiveRoleSession or mutates User.role', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      const beforeUser = await userRepo().findOne({ where: { id: owner.id } });

      await service.approveApplication(submitted.application.id, admin);

      expect(await ds.getRepository(ActiveRoleSession).count({ where: { accountRoleId: submitted.accountRole.id } })).toBe(0);
      const afterUser = await userRepo().findOne({ where: { id: owner.id } });
      expect(afterUser?.role).toBe(beforeUser?.role);
      expect(afterUser?.activeRoles).toEqual(beforeUser?.activeRoles);
    });
  });

  describe('rejection happy path', () => {
    it('rejects SellerProfile + AccountRole + Application, creates zero BusinessCapability', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const result = await service.rejectApplication(submitted.application.id, admin, 'Missing business registration documents');

      expect(result.application.status).toBe(BusinessCapabilityApplicationStatus.REJECTED);
      expect(result.application.rejectionReason).toBe('Missing business registration documents');
      expect(result.capability).toBeNull();
      expect(result.accountRole.switchable).toBe(false);

      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id } })).toBe(0);
      const profile = await sellerProfileRepo().findOne({ where: { id: submitted.operationalProfile.id } });
      expect(profile?.status).toBe(SellerStatus.REJECTED);
      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      expect(role?.status).toBe(AccountRoleStatus.REJECTED);
    });

    it('rejects a short/empty rejectionReason with a 400 before touching the transaction', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      await expect(service.rejectApplication(submitted.application.id, admin, 'no')).rejects.toBeDefined();
      const application = await applicationRepo().findOne({ where: { id: submitted.application.id } });
      expect(application?.status).toBe(BusinessCapabilityApplicationStatus.PENDING); // untouched
    });
  });

  describe('idempotency', () => {
    it('a second approve() call on an already-APPROVED application returns the same consistent state, creates no duplicate capability', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      const first = await service.approveApplication(submitted.application.id, admin);

      const second = await service.approveApplication(submitted.application.id, admin);

      expect(second.capability).toEqual(first.capability);
      expect(second.accountRole.id).toBe(first.accountRole.id);
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } })).toBe(1);
    });

    it('a second reject() call on an already-REJECTED application returns the same consistent state, never rewrites reviewedAt', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      const first = await service.rejectApplication(submitted.application.id, admin, 'Incomplete application');

      const second = await service.rejectApplication(submitted.application.id, admin, 'A different reason this time');

      expect(second.application.reviewedAt).toEqual(first.application.reviewedAt);
      expect(second.application.rejectionReason).toBe(first.application.rejectionReason); // first reason wins, not overwritten
    });
  });

  describe('terminal-state conflicts', () => {
    it('reject() on an already-APPROVED application refuses with CAPABILITY_APPLICATION_ALREADY_APPROVED, never mutates anything', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await service.approveApplication(submitted.application.id, admin);

      await expect(service.rejectApplication(submitted.application.id, admin, 'too late now'))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_APPROVED' } });

      const capability = await capabilityRepo().findOne({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } });
      expect(capability?.status).toBe(BusinessCapabilityStatus.ACTIVE); // untouched, never suspended/revoked by reject()
    });

    it('approve() on an already-REJECTED application refuses with CAPABILITY_APPLICATION_ALREADY_REJECTED, never mutates anything', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await service.rejectApplication(submitted.application.id, admin, 'Incomplete application');

      await expect(service.approveApplication(submitted.application.id, admin))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_ALREADY_REJECTED' } });

      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id } })).toBe(0);
    });

    it('a non-existent application id fails closed with CAPABILITY_APPLICATION_NOT_FOUND for both approve and reject', async () => {
      if (!reachable) return;
      const admin = await makeUser();
      await expect(service.approveApplication(999999, admin)).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_NOT_FOUND' } });
      await expect(service.rejectApplication(999999, admin, 'valid reason text')).rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_NOT_FOUND' } });
    });
  });

  describe('live revalidation (Stage B3 mission §8) -- stale organizational chain fails closed at approval time', () => {
    it('Business suspended after submission blocks approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await businessRepo().update(business.id, { status: 'suspended' as any });

      await expect(service.approveApplication(submitted.application.id, admin))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_WORKSPACE_INACTIVE' } });
    });

    it('Workspace suspended after submission blocks approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await workspaceRepo().update(workspace.id, { status: 'suspended' as any });

      await expect(service.approveApplication(submitted.application.id, admin))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_WORKSPACE_INACTIVE' } });
    });

    it('the owner\'s BusinessMembership revoked after submission blocks approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, membership } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await membershipRepo().update(membership.id, { status: BusinessMembershipStatus.REVOKED });

      await expect(service.approveApplication(submitted.application.id, admin))
        .rejects.toMatchObject({ response: { code: 'BUSINESS_OWNER_NO_LONGER_ACTIVE' } });
    });

    it('the WorkspaceAssignment revoked after submission blocks approval', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, assignment } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await assignmentRepo().update(assignment.id, { status: WorkspaceAssignmentStatus.REVOKED });

      await expect(service.approveApplication(submitted.application.id, admin))
        .rejects.toMatchObject({ response: { code: 'CAPABILITY_APPLICATION_LINKAGE_INVALID' } });
    });
  });

  describe('reapplication (Stage B3 mission §24)', () => {
    it('B3 approves/rejects only the NEW application; the old REJECTED application is never touched', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);

      const firstSubmission = await submitApplication(owner, business.id);
      const firstRejection = await service.rejectApplication(firstSubmission.application.id, admin, 'incomplete documents');
      const secondSubmission = await submitApplication(owner, business.id); // reuses profile/role per B2, new application row

      expect(secondSubmission.operationalProfile.id).toBe(firstSubmission.operationalProfile.id);
      expect(secondSubmission.accountRole.id).toBe(firstSubmission.accountRole.id);
      expect(secondSubmission.application.id).not.toBe(firstSubmission.application.id);

      const secondApproval = await service.approveApplication(secondSubmission.application.id, admin);
      expect(secondApproval.application.status).toBe(BusinessCapabilityApplicationStatus.APPROVED);

      const reloadedFirst = await applicationRepo().findOne({ where: { id: firstSubmission.application.id } });
      expect(reloadedFirst).toMatchObject({ status: BusinessCapabilityApplicationStatus.REJECTED, rejectionReason: 'incomplete documents' });
      expect(reloadedFirst?.reviewedAt).toEqual(firstRejection.application.reviewedAt); // never touched again
    });
  });

  describe('multi-business isolation (Stage B3 mission §25)', () => {
    it('approving Business A never activates/mutates Business B\'s capability, profile, role, or application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const a = await makeCleanBusiness(owner);
      const b = await makeCleanBusiness(owner);
      const appA = await submitApplication(owner, a.business.id);
      const appB = await submitApplication(owner, b.business.id);

      await service.approveApplication(appA.application.id, admin);

      expect(await capabilityRepo().count({ where: { workspaceId: a.workspace.id } })).toBe(1);
      expect(await capabilityRepo().count({ where: { workspaceId: b.workspace.id } })).toBe(0);
      const profileB = await sellerProfileRepo().findOne({ where: { id: appB.operationalProfile.id } });
      expect(profileB?.status).toBe(SellerStatus.PENDING);
      const roleB = await accountRoleRepo().findOne({ where: { id: appB.accountRole.id } });
      expect(roleB?.status).toBe(AccountRoleStatus.PENDING);
      const applicationB = await applicationRepo().findOne({ where: { id: appB.application.id } });
      expect(applicationB?.status).toBe(BusinessCapabilityApplicationStatus.PENDING);
    });

    it('the reverse direction: approving Business B never touches Business A', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const a = await makeCleanBusiness(owner);
      const b = await makeCleanBusiness(owner);
      const appA = await submitApplication(owner, a.business.id);
      const appB = await submitApplication(owner, b.business.id);

      await service.approveApplication(appB.application.id, admin);

      expect(await capabilityRepo().count({ where: { workspaceId: a.workspace.id } })).toBe(0);
      const profileA = await sellerProfileRepo().findOne({ where: { id: appA.operationalProfile.id } });
      expect(profileA?.status).toBe(SellerStatus.PENDING);
    });
  });

  describe('concurrency (Stage B3 mission §33, real Postgres row locking)', () => {
    it('two simultaneous approve() calls on the same application produce exactly one ACTIVE capability, never two', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, admin),
        service.approveApplication(submitted.application.id, admin),
      ]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true); // both succeed: first is real, second is a consistent idempotent read
      expect(await capabilityRepo().count({ where: { workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE } })).toBe(1);
      const application = await applicationRepo().findOne({ where: { id: submitted.application.id } });
      expect(application?.status).toBe(BusinessCapabilityApplicationStatus.APPROVED);
    });

    it('approve() and reject() racing on the same application: exactly one terminal transition wins, the loser gets a clean conflict, no partial state', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const results = await Promise.allSettled([
        service.approveApplication(submitted.application.id, admin),
        service.rejectApplication(submitted.application.id, admin, 'racing rejection attempt'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        response: { code: expect.stringMatching(/CAPABILITY_APPLICATION_ALREADY_(APPROVED|REJECTED)/) },
      });

      const application = await applicationRepo().findOne({ where: { id: submitted.application.id } });
      expect([BusinessCapabilityApplicationStatus.APPROVED, BusinessCapabilityApplicationStatus.REJECTED]).toContain(application?.status);
      const capabilityCount = await capabilityRepo().count({ where: { workspaceId: workspace.id } });
      // Exactly 1 if approval won, 0 if rejection won -- never partial/duplicate.
      expect(capabilityCount).toBe(application?.status === BusinessCapabilityApplicationStatus.APPROVED ? 1 : 0);
    });

    it('two simultaneous reject() calls on the same application: one real rejection, one consistent idempotent read, never two conflicting writes', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const results = await Promise.allSettled([
        service.rejectApplication(submitted.application.id, admin, 'first race arm'),
        service.rejectApplication(submitted.application.id, admin, 'second race arm'),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const application = await applicationRepo().findOne({ where: { id: submitted.application.id } });
      expect(application?.status).toBe(BusinessCapabilityApplicationStatus.REJECTED);
      // Only one of the two reasons actually persisted -- whichever committed first.
      expect(['first race arm', 'second race arm']).toContain(application?.rejectionReason);
    });
  });

  describe('listing (Stage B3 mission §26/§27/§28) -- never fabricates AR37/AR38-style historical entries', () => {
    it('listForAdmin(PENDING) shows a real submitted application with sanitized business/applicant/profile summary', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      const list = await service.listForAdmin('pending');
      const entry = list.find((r: any) => r.application.id === submitted.application.id);
      expect(entry).toBeDefined();
      expect(entry.business.id).toBe(business.id);
      expect(entry.workspace.id).toBe(workspace.id);
      expect(entry.applicant.userId).toBe(owner.id);
      expect(entry.operationalProfile.id).toBe(submitted.operationalProfile.id);
      // No password/session/internal metadata leaked.
      expect(entry.applicant.password).toBeUndefined();
    });

    it('an approved application no longer appears in the PENDING list', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await service.approveApplication(submitted.application.id, admin);

      const pendingList = await service.listForAdmin('pending');
      expect(pendingList.find((r: any) => r.application.id === submitted.application.id)).toBeUndefined();
      const approvedList = await service.listForAdmin('approved');
      expect(approvedList.find((r: any) => r.application.id === submitted.application.id)).toBeDefined();
    });

    it('listForBusiness requires ACTIVE membership -- a stranger is refused, an active member sees the history', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const stranger = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);

      await expect(service.listForBusiness(business.id, stranger)).rejects.toMatchObject({ response: { code: 'BUSINESS_MEMBERSHIP_REQUIRED' } });

      const list = await service.listForBusiness(business.id, owner);
      expect(list.find((r: any) => r.application.id === submitted.application.id)).toBeDefined();
    });

    it('Business A member cannot read Business B applications via listForBusiness', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const a = await makeCleanBusiness(owner);
      const b = await makeCleanBusiness(owner);
      await submitApplication(owner, a.business.id);
      const appB = await submitApplication(owner, b.business.id);

      const listA = await service.listForBusiness(a.business.id, owner);
      expect(listA.find((r: any) => r.application.id === appB.application.id)).toBeUndefined();
    });
  });

  describe('AR37/AR38 -- Stage B3 mission §36/§37', () => {
    it('a legacy pending SellerProfile/AccountRole with NO application row (AR37\'s exact shape) never appears in admin or business listings', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, assignment } = await makeCleanBusiness(owner);
      // Seed the legacy shape directly -- never through B2/B3 code.
      const legacyProfile = await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'Legacy', status: SellerStatus.PENDING,
      } as any));
      await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.PENDING,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: legacyProfile.id, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: assignment.id,
      } as any));

      const adminList = await service.listForAdmin('pending');
      expect(adminList.find((r: any) => r.business.id === business.id)).toBeUndefined();
      const businessList = await service.listForBusiness(business.id, owner);
      expect(businessList.length).toBe(0);
    });

    it('a legacy APPROVED SellerProfile/ACTIVE AccountRole/ACTIVE capability (AR38\'s exact shape) never appears as a fabricated application', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const { business, workspace, assignment } = await makeCleanBusiness(owner);
      const legacyProfile = await sellerProfileRepo().save(sellerProfileRepo().create({
        user: owner, businessId: business.id, businessName: 'BiS-shaped', status: SellerStatus.APPROVED,
      } as any));
      await accountRoleRepo().save(accountRoleRepo().create({
        userId: owner.id, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: legacyProfile.id, capabilities: {}, contextVersion: 1,
        workspaceAssignmentId: assignment.id,
      } as any));
      await capabilityRepo().save(capabilityRepo().create({ workspaceId: workspace.id, capabilityCode: BusinessCapabilityCode.COMMERCE, status: BusinessCapabilityStatus.ACTIVE } as any));

      const businessList = await service.listForBusiness(business.id, owner);
      expect(businessList.length).toBe(0); // no application row exists for this legacy grant -- none fabricated
    });
  });

  describe('RoleContext after approval/rejection (Stage B3 mission §35)', () => {
    it('after approval, RoleContext resolves the exact organizational Seller context and isSwitchable() is true', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business, workspace } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await service.approveApplication(submitted.application.id, admin);

      const unused: any = { findOne: jest.fn() };
      const roleContextService = new RoleContextService(
        userRepo(), accountRoleRepo(), unused, sellerProfileRepo(), unused, unused, unused, assignmentRepo(), { emitRevoked: jest.fn() } as any,
      );
      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      await expect(roleContextService.isSwitchable(role as any)).resolves.toBe(true);
    });

    it('after rejection, isSwitchable() is false', async () => {
      if (!reachable) return;
      const owner = await makeUser();
      const admin = await makeUser();
      const { business } = await makeCleanBusiness(owner);
      const submitted = await submitApplication(owner, business.id);
      await service.rejectApplication(submitted.application.id, admin, 'incomplete documents');

      const unused: any = { findOne: jest.fn() };
      const roleContextService = new RoleContextService(
        userRepo(), accountRoleRepo(), unused, sellerProfileRepo(), unused, unused, unused, assignmentRepo(), { emitRevoked: jest.fn() } as any,
      );
      const role = await accountRoleRepo().findOne({ where: { id: submitted.accountRole.id } });
      await expect(roleContextService.isSwitchable(role as any)).resolves.toBe(false);
    });
  });
});
