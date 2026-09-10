import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityCode } from './entities/business-capability.entity';
import {
  BusinessCapabilityApplication,
  BusinessCapabilityApplicationStatus,
} from './entities/business-capability-application.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Business Capability Activation Stage B3, mission §32. Mocked-transaction
 * failure injection for approve()/reject() -- proves each individual write
 * (BusinessCapability / SellerProfile / AccountRole / Application) rolling
 * back stops every LATER write in the same call, mirroring the exact
 * pattern established in seller.service.sync.spec.ts (Stage A2) and
 * business-capability-application.rollback.spec.ts (Stage B2). The real
 * disposable-DB suite (business-capability-application.approval.service.spec.ts)
 * already proves the true commit-or-nothing guarantee via real transactions
 * and row locking; this file supplements it, per the mission's own "may
 * supplement, not replace" instruction.
 */
describe('BusinessCapabilityApplicationService.approve/rejectApplication() — transaction rollback (Stage B3 mission §32)', () => {
  const PENDING_APPLICATION = {
    id: 1, businessId: 1, workspaceId: 10, capabilityCode: BusinessCapabilityCode.COMMERCE,
    status: BusinessCapabilityApplicationStatus.PENDING, requestedByUserId: 2,
    requestedByWorkspaceAssignmentId: 1000, operationalProfileType: RoleProfileType.SELLER_PROFILE,
    operationalProfileId: 501, applicationData: null, submittedAt: new Date(),
    reviewedAt: null, reviewedByUserId: null, rejectionReason: null,
  };

  const PENDING_PROFILE = {
    id: 501, businessId: 1, userId: 2, status: SellerStatus.PENDING, businessName: 'Co',
  };

  const PENDING_ROLE = {
    id: 601, userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.PENDING,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 501, workspaceAssignmentId: 1000, contextVersion: 1,
  };

  const ACTIVE_BUSINESS = { id: 1, status: BusinessStatus.ACTIVE };
  const ACTIVE_WORKSPACE = { id: 10, businessId: 1, status: OperationalWorkspaceStatus.ACTIVE };
  const ACTIVE_ASSIGNMENT = { id: 1000, workspaceId: 10, businessMembershipId: 100, status: WorkspaceAssignmentStatus.ACTIVE };
  const ACTIVE_MEMBERSHIP = { id: 100, businessId: 1, userId: 2, status: BusinessMembershipStatus.ACTIVE, roleTemplate: BusinessMembershipRoleTemplate.OWNER };

  const admin: any = { id: 999 };

  const buildService = (opts: {
    failAt?: 'capability' | 'profile' | 'role' | 'application';
    startStatus?: BusinessCapabilityApplicationStatus;
  } = {}) => {
    const capabilitySave = jest.fn((d: any) =>
      opts.failAt === 'capability' ? Promise.reject(new Error('capability save failed')) : Promise.resolve({ ...d, id: 701 }),
    );
    const profileSave = jest.fn((d: any) =>
      opts.failAt === 'profile' ? Promise.reject(new Error('profile save failed')) : Promise.resolve(d),
    );
    const roleSave = jest.fn((d: any) =>
      opts.failAt === 'role' ? Promise.reject(new Error('role save failed')) : Promise.resolve(d),
    );
    const applicationSave = jest.fn((d: any) =>
      opts.failAt === 'application' ? Promise.reject(new Error('application save failed')) : Promise.resolve(d),
    );

    const startApplication = { ...PENDING_APPLICATION, status: opts.startStatus ?? BusinessCapabilityApplicationStatus.PENDING };
    const txApplicationRepo = { findOne: jest.fn().mockResolvedValue(startApplication), save: applicationSave };
    const txBusinessRepo = { findOne: jest.fn().mockResolvedValue(ACTIVE_BUSINESS) };
    const txWorkspaceRepo = { findOne: jest.fn().mockResolvedValue(ACTIVE_WORKSPACE) };
    const txAssignmentRepo = { findOne: jest.fn().mockResolvedValue(ACTIVE_ASSIGNMENT) };
    const txMembershipRepo = { findOne: jest.fn().mockResolvedValue(ACTIVE_MEMBERSHIP) };
    const txProfileRepo = { findOne: jest.fn().mockResolvedValue({ ...PENDING_PROFILE }), save: profileSave };
    const txRoleRepo = { findOne: jest.fn().mockResolvedValue({ ...PENDING_ROLE }), save: roleSave };
    const txCapabilityRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d: any) => d), save: capabilitySave };

    const getRepository = jest.fn((entity: any) => {
      if (entity === BusinessCapabilityApplication) return txApplicationRepo;
      if (entity === Business) return txBusinessRepo;
      if (entity === OperationalWorkspace) return txWorkspaceRepo;
      if (entity === WorkspaceAssignment) return txAssignmentRepo;
      if (entity === BusinessMembership) return txMembershipRepo;
      if (entity === SellerProfile) return txProfileRepo;
      if (entity === AccountRole) return txRoleRepo;
      if (entity === BusinessCapability) return txCapabilityRepo;
      throw new Error(`unexpected repo requested inside transaction: ${entity?.name}`);
    });

    const dataSource: any = {
      manager: { query: jest.fn().mockResolvedValue([]), getRepository },
      transaction: jest.fn(async (cb: any) => cb({ getRepository })),
    };

    const outerCapabilityRepo: any = { findOne: jest.fn().mockResolvedValue(null) };
    const outerApplicationRepo: any = { findOne: jest.fn() };
    const service = new BusinessCapabilityApplicationService(outerApplicationRepo, outerCapabilityRepo, dataSource);

    return { service, capabilitySave, profileSave, roleSave, applicationSave };
  };

  describe('approve()', () => {
    it('a BusinessCapability-save failure stops before SellerProfile/AccountRole/Application are ever attempted', async () => {
      const { service, profileSave, roleSave, applicationSave } = buildService({ failAt: 'capability' });
      await expect(service.approveApplication(1, admin)).rejects.toThrow('capability save failed');
      expect(profileSave).not.toHaveBeenCalled();
      expect(roleSave).not.toHaveBeenCalled();
      expect(applicationSave).not.toHaveBeenCalled();
    });

    it('a SellerProfile-save failure leaves AccountRole/Application unattempted', async () => {
      const { service, capabilitySave, roleSave, applicationSave } = buildService({ failAt: 'profile' });
      await expect(service.approveApplication(1, admin)).rejects.toThrow('profile save failed');
      expect(capabilitySave).toHaveBeenCalledTimes(1);
      expect(roleSave).not.toHaveBeenCalled();
      expect(applicationSave).not.toHaveBeenCalled();
    });

    it('an AccountRole-save failure leaves Application unattempted', async () => {
      const { service, capabilitySave, profileSave, applicationSave } = buildService({ failAt: 'role' });
      await expect(service.approveApplication(1, admin)).rejects.toThrow('role save failed');
      expect(capabilitySave).toHaveBeenCalledTimes(1);
      expect(profileSave).toHaveBeenCalledTimes(1);
      expect(applicationSave).not.toHaveBeenCalled();
    });

    it('an Application-save failure still means the whole callback throws -- real Postgres rolls back capability/profile/role too', async () => {
      const { service, capabilitySave, profileSave, roleSave } = buildService({ failAt: 'application' });
      await expect(service.approveApplication(1, admin)).rejects.toThrow('application save failed');
      expect(capabilitySave).toHaveBeenCalledTimes(1);
      expect(profileSave).toHaveBeenCalledTimes(1);
      expect(roleSave).toHaveBeenCalledTimes(1);
    });

    it('the success path writes capability -> profile -> role -> application in that exact order', async () => {
      const { service, capabilitySave, profileSave, roleSave, applicationSave } = buildService();
      const result = await service.approveApplication(1, admin);
      expect(capabilitySave.mock.invocationCallOrder[0]).toBeLessThan(profileSave.mock.invocationCallOrder[0]);
      expect(profileSave.mock.invocationCallOrder[0]).toBeLessThan(roleSave.mock.invocationCallOrder[0]);
      expect(roleSave.mock.invocationCallOrder[0]).toBeLessThan(applicationSave.mock.invocationCallOrder[0]);
      expect(result.capability?.status).toBe('active');
    });
  });

  describe('reject()', () => {
    it('a SellerProfile-save failure leaves AccountRole/Application unattempted', async () => {
      const { service, profileSave, roleSave, applicationSave } = buildService({ failAt: 'profile' });
      await expect(service.rejectApplication(1, admin, 'a valid rejection reason')).rejects.toThrow('profile save failed');
      expect(profileSave).toHaveBeenCalledTimes(1);
      expect(roleSave).not.toHaveBeenCalled();
      expect(applicationSave).not.toHaveBeenCalled();
    });

    it('an AccountRole-save failure leaves Application unattempted', async () => {
      const { service, profileSave, roleSave, applicationSave } = buildService({ failAt: 'role' });
      await expect(service.rejectApplication(1, admin, 'a valid rejection reason')).rejects.toThrow('role save failed');
      expect(profileSave).toHaveBeenCalledTimes(1);
      expect(roleSave).toHaveBeenCalledTimes(1);
      expect(applicationSave).not.toHaveBeenCalled();
    });

    it('an Application-save failure still means the whole callback throws', async () => {
      const { service, profileSave, roleSave } = buildService({ failAt: 'application' });
      await expect(service.rejectApplication(1, admin, 'a valid rejection reason')).rejects.toThrow('application save failed');
      expect(profileSave).toHaveBeenCalledTimes(1);
      expect(roleSave).toHaveBeenCalledTimes(1);
    });

    it('rejection never touches BusinessCapability at all', async () => {
      const { service, capabilitySave } = buildService();
      await service.rejectApplication(1, admin, 'a valid rejection reason');
      expect(capabilitySave).not.toHaveBeenCalled();
    });
  });
});
