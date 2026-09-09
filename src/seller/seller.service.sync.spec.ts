import { SellerService } from './seller.service';
import { SellerStatus } from './entities/seller-profile.entity';
import { AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Business Capability Activation Stage A1 — required test list (§17).
 * SellerService.approve()/reject() are the one real production caller of
 * syncOperationalRole() that already has a workspace-BOUND live row
 * (AccountRole 38, production Business "BiS", COMMERCE active) AND a
 * workspace-bound row with NO active capability (AccountRole 37, production
 * Business "AI Verify Test") -- these tests fixture both shapes exactly.
 */
describe('SellerService — organizational approval invariant (Stage A1)', () => {
  const buildService = (profile: any, queryImpl?: (sql: string, params: any[]) => Promise<any[]>) => {
    const profileRepo: any = {
      findOne: jest.fn().mockResolvedValue(profile),
      save: jest.fn((p: any) => Promise.resolve(p)),
      manager: { query: jest.fn(queryImpl ?? (() => Promise.resolve([]))) },
    };
    const userRepo: any = { update: jest.fn().mockResolvedValue({}) };
    const other: any = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    const commerceProfiles: any = {
      syncStatusByLink: jest.fn().mockResolvedValue(undefined),
      findForUserByType: jest.fn().mockResolvedValue(null),
    };
    const verification: any = {};
    const sellingCapability: any = { grant: jest.fn().mockResolvedValue(undefined) };
    const roleContextService: any = { syncOperationalRole: jest.fn().mockResolvedValue({ id: 38 }) };

    const service = new SellerService(
      profileRepo, userRepo, other, other, other, other,
      {} as any, commerceProfiles, verification, sellingCapability, roleContextService,
    );
    return { service, profileRepo, userRepo, roleContextService };
  };

  // Fixture matching production exactly: Business "BiS", Workspace 2,
  // WorkspaceAssignment 2, COMMERCE active, Seller AccountRole 38.
  const bisRow = [{ workspaceAssignmentId: 2, commerceActive: true }];
  // Fixture matching production exactly: Business "AI Verify Test",
  // Workspace 1, WorkspaceAssignment 1, NO BusinessCapability row at all,
  // Seller AccountRole 37 (pending).
  const aiVerifyTestRow = [{ workspaceAssignmentId: 1, commerceActive: false }];

  describe('1/4. organizational Seller + active COMMERCE approves the exact bound role', () => {
    it('resolves workspaceAssignmentId 2 and syncs AR38 as ACTIVE', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING, sellerType: 'business' };
      const { service, roleContextService, profileRepo } = buildService(profile, () => Promise.resolve(bisRow));

      const saved = await service.approve(1);

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
        userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, workspaceAssignmentId: 2,
      });
      expect(saved.status).toBe(SellerStatus.APPROVED);
      expect(profileRepo.save).toHaveBeenCalled();
    });
  });

  describe('2/9. organizational Seller + missing COMMERCE fails closed (AR37 safety test)', () => {
    it('throws BUSINESS_CAPABILITY_NOT_ACTIVE, never calls syncOperationalRole, never saves the profile, never updates the user', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING, sellerType: 'individual' };
      const { service, roleContextService, profileRepo, userRepo } = buildService(profile, () => Promise.resolve(aiVerifyTestRow));

      await expect(service.approve(5)).rejects.toMatchObject({
        response: { code: 'BUSINESS_CAPABILITY_NOT_ACTIVE' },
      });

      // 5. failure leaves SellerProfile unchanged / 6. AccountRole remains pending / 7. no unbound role created.
      expect(profile.status).toBe(SellerStatus.PENDING); // never mutated in memory
      expect(profileRepo.save).not.toHaveBeenCalled();
      expect(userRepo.update).not.toHaveBeenCalled();
      expect(roleContextService.syncOperationalRole).not.toHaveBeenCalled();
    });
  });

  describe('3. organizational Seller + suspended COMMERCE fails', () => {
    it('throws BUSINESS_CAPABILITY_NOT_ACTIVE the same way as missing', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING };
      const { service } = buildService(profile, () => Promise.resolve([{ workspaceAssignmentId: 1, commerceActive: false }]));
      await expect(service.approve(5)).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_NOT_ACTIVE' } });
    });
  });

  describe('4. organizational Seller + revoked COMMERCE fails', () => {
    it('throws BUSINESS_CAPABILITY_NOT_ACTIVE the same way (the EXISTS filter only matches status = active)', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING };
      const { service } = buildService(profile, () => Promise.resolve([{ workspaceAssignmentId: 1, commerceActive: false }]));
      await expect(service.approve(5)).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_NOT_ACTIVE' } });
    });
  });

  it('organizational Seller with NO resolvable WorkspaceAssignment fails closed with SELLER_WORKSPACE_UNRESOLVED, never falls back to an unbound role', async () => {
    const profile = { id: 9, user: { id: 4 }, businessId: 3, status: SellerStatus.PENDING };
    const { service, roleContextService } = buildService(profile, () => Promise.resolve([])); // no BusinessMembership/WorkspaceAssignment row
    await expect(service.approve(9)).rejects.toMatchObject({ response: { code: 'SELLER_WORKSPACE_UNRESOLVED' } });
    expect(roleContextService.syncOperationalRole).not.toHaveBeenCalled();
  });

  describe('8. legacy Seller uses explicit null, never omitted', () => {
    it('a SellerProfile with no businessId syncs with workspaceAssignmentId: null', async () => {
      const profile = { id: 20, user: { id: 7 }, status: SellerStatus.PENDING, sellerType: 'individual' }; // no businessId at all
      const { service, roleContextService, profileRepo } = buildService(profile);

      await service.approve(20);

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
        userId: 7, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 20, workspaceAssignmentId: null,
      });
      // Legacy path never touches the organizational-resolution query at all.
      expect(profileRepo.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('9/10. multi-business Seller isolation — Business A action never touches Business B\'s role', () => {
    it('approving Seller A resolves workspaceAssignmentId A only', async () => {
      const profileA = { id: 30, user: { id: 8 }, businessId: 10, status: SellerStatus.PENDING };
      const { service, roleContextService } = buildService(profileA, (_sql, params) =>
        params[0] === 10 ? Promise.resolve([{ workspaceAssignmentId: 100, commerceActive: true }]) : Promise.resolve([]),
      );
      await service.approve(30);
      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, workspaceAssignmentId: 100 }),
      );
    });

    it('approving Seller B (same user, different Business) resolves workspaceAssignmentId B only, independent of A', async () => {
      const profileB = { id: 31, user: { id: 8 }, businessId: 11, status: SellerStatus.PENDING };
      const { service, roleContextService } = buildService(profileB, (_sql, params) =>
        params[0] === 11 ? Promise.resolve([{ workspaceAssignmentId: 200, commerceActive: true }]) : Promise.resolve([]),
      );
      await service.approve(31);
      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, workspaceAssignmentId: 200 }),
      );
      // Never the other Business's workspaceAssignmentId.
      expect(roleContextService.syncOperationalRole).not.toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAssignmentId: 100 }),
      );
    });
  });

  describe('11. reject targets the exact organizational role', () => {
    it('reject() resolves the same deterministic workspaceAssignmentId as approve() would', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING };
      const { service, roleContextService } = buildService(profile, () => Promise.resolve(aiVerifyTestRow));

      await service.reject(5, 'incomplete documents');

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
        userId: 3, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.REJECTED,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 5, workspaceAssignmentId: 1,
      });
    });

    it('reject() for Seller B never touches Seller A\'s AccountRole', async () => {
      const profileA = { id: 5, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING };
      const profileB = { id: 6, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING };
      const { service: serviceA, roleContextService: roleContextA } = buildService(profileA, () => Promise.resolve(bisRow));
      const { service: serviceB, roleContextService: roleContextB } = buildService(profileB, () => Promise.resolve(aiVerifyTestRow));

      await serviceA.reject(5, 'incomplete documents');
      await serviceB.reject(6, 'incomplete documents');

      expect(roleContextA.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, profileId: 5, workspaceAssignmentId: 2, status: AccountRoleStatus.REJECTED }),
      );
      expect(roleContextB.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 3, profileId: 6, workspaceAssignmentId: 1, status: AccountRoleStatus.REJECTED }),
      );
      expect(roleContextA.syncOperationalRole).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
      expect(roleContextB.syncOperationalRole).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 2 }));
    });
  });

  describe('13. BiS/AR38 fixture does not spawn a duplicate role', () => {
    it('re-approving (verification-tier bump) the BiS SellerProfile resolves the exact same workspaceAssignmentId 2 every time', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.APPROVED, sellerType: 'business' };
      const { service, roleContextService } = buildService(profile, () => Promise.resolve(bisRow));

      await service.approve(1, 'verified_seller' as any);
      await service.approve(1, 'verified_business' as any);

      expect(roleContextService.syncOperationalRole).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ workspaceAssignmentId: 2 }));
      expect(roleContextService.syncOperationalRole).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ workspaceAssignmentId: 2 }));
    });
  });
});
