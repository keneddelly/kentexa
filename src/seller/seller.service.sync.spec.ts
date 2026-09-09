import { SellerService } from './seller.service';
import { SellerStatus } from './entities/seller-profile.entity';
import { AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Business Capability Activation Stage A — required test list items 13/15:
 * SellerService.approve()/reject() are the one real production caller of
 * syncOperationalRole() that already has a workspace-BOUND live row
 * (AccountRole 38, production Business "BiS") created by the one-time
 * Migration 8 backfill, not by SellerService itself. This proves the
 * deliberately-unchanged call (no workspaceAssignmentId passed) keeps
 * updating that exact row rather than spawning a stray unbound duplicate --
 * see RoleContextService.syncOperationalRole's own Stage A doc comment for
 * the full rationale.
 */
describe('SellerService — syncOperationalRole integration (Stage A)', () => {
  const buildService = (profile: any) => {
    const profileRepo: any = {
      findOne: jest.fn().mockResolvedValue(profile),
      save: jest.fn((p) => Promise.resolve(p)),
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
    return { service, profileRepo, roleContextService };
  };

  it('approve() calls syncOperationalRole with NO workspaceAssignmentId — preserving the exact pre-Stage-A signature so an already-migrated bound row (e.g. AccountRole 38) is updated, never orphaned', async () => {
    const profile = { id: 5, user: { id: 2 }, status: SellerStatus.PENDING, sellerType: 'business' };
    const { service, roleContextService } = buildService(profile);

    await service.approve(5);

    expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
      userId: 2,
      roleType: AccountRoleType.SELLER,
      status: AccountRoleStatus.ACTIVE,
      profileType: RoleProfileType.SELLER_PROFILE,
      profileId: 5,
    });
    // Explicitly NOT present -- confirms the call omits the key entirely
    // rather than passing workspaceAssignmentId: undefined some other way.
    const callArgs = roleContextService.syncOperationalRole.mock.calls[0][0];
    expect('workspaceAssignmentId' in callArgs).toBe(false);
  });

  it('reject() for Seller B never touches Seller A\'s AccountRole — each call is scoped to its own profile.user.id/profile.id', async () => {
    const profileA = { id: 5, user: { id: 2 }, status: SellerStatus.PENDING };
    const profileB = { id: 6, user: { id: 3 }, status: SellerStatus.PENDING };
    const { service: serviceA, roleContextService: roleContextA } = buildService(profileA);
    const { service: serviceB, roleContextService: roleContextB } = buildService(profileB);

    await serviceA.reject(5, 'incomplete documents');
    await serviceB.reject(6, 'incomplete documents');

    expect(roleContextA.syncOperationalRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, profileId: 5, status: AccountRoleStatus.REJECTED }),
    );
    expect(roleContextB.syncOperationalRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, profileId: 6, status: AccountRoleStatus.REJECTED }),
    );
    // Neither call ever references the other applicant's userId/profileId.
    expect(roleContextA.syncOperationalRole).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
    expect(roleContextB.syncOperationalRole).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 2 }));
  });
});
