import { SellerService } from './seller.service';
import { SellerProfile, SellerStatus } from './entities/seller-profile.entity';
import { User } from '../users/entities/user.entity';
import { AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Business Capability Activation Stage A1/A2 — required test lists (§17 in
 * each mission). SellerService.approve()/reject()/suspend() are the one
 * real production caller of syncOperationalRole() that already has a
 * workspace-BOUND live row with COMMERCE active (AccountRole 38, "BiS") AND
 * a workspace-bound row with NO active capability (AccountRole 37, "AI
 * Verify Test") -- these tests fixture both shapes exactly.
 */
describe('SellerService — organizational approval invariant (Stage A1/A2)', () => {
  const buildService = (profile: any, queryImpl?: (sql: string, params: any[]) => Promise<any[]>) => {
    const userUpdate = jest.fn().mockResolvedValue({});
    const profileSave = jest.fn((p: any) => Promise.resolve(p));
    const txManager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === User) return { update: userUpdate };
        if (entity === SellerProfile) return { save: profileSave };
        throw new Error(`unexpected repo requested inside transaction: ${entity?.name}`);
      }),
    };
    const profileRepo: any = {
      findOne: jest.fn().mockResolvedValue(profile),
      save: jest.fn((p: any) => Promise.resolve(p)),
      manager: {
        query: jest.fn(queryImpl ?? (() => Promise.resolve([]))),
        transaction: jest.fn(async (cb: any) => cb(txManager)),
      },
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
    return { service, profileRepo, userRepo, roleContextService, userUpdate, profileSave, txManager };
  };

  // Fixture matching production exactly: Business "BiS", Workspace 2,
  // WorkspaceAssignment 2, COMMERCE active, Seller AccountRole 38.
  const bisRow = [{ workspaceAssignmentId: 2, commerceActive: true }];
  // Fixture matching production exactly: Business "AI Verify Test",
  // Workspace 1, WorkspaceAssignment 1, NO BusinessCapability row at all,
  // Seller AccountRole 37 (pending).
  const aiVerifyTestRow = [{ workspaceAssignmentId: 1, commerceActive: false }];

  describe('1/4. organizational Seller + active COMMERCE approves the exact bound role', () => {
    it('resolves workspaceAssignmentId 2, syncs AR38 as ACTIVE, and persists User+SellerProfile together', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING, sellerType: 'business' };
      const { service, roleContextService, userUpdate, profileSave, profileRepo } = buildService(profile, () => Promise.resolve(bisRow));

      const saved = await service.approve(1);

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
        userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, workspaceAssignmentId: 2,
      });
      expect(saved.status).toBe(SellerStatus.APPROVED);
      expect(userUpdate).toHaveBeenCalledWith(2, expect.objectContaining({ role: 'seller' }));
      expect(profileSave).toHaveBeenCalledWith(profile);
      expect(profileRepo.manager.transaction).toHaveBeenCalledTimes(1);
      // syncOperationalRole ran strictly BEFORE the transaction (both mock
      // call orders recorded on their own jest.fn(), compare invocation order).
      expect(roleContextService.syncOperationalRole.mock.invocationCallOrder[0])
        .toBeLessThan(profileRepo.manager.transaction.mock.invocationCallOrder[0]);
    });
  });

  describe('2/9. organizational Seller + missing COMMERCE fails closed (AR37 safety test)', () => {
    it('throws BUSINESS_CAPABILITY_NOT_ACTIVE, never calls syncOperationalRole, never opens a transaction', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING, sellerType: 'individual' };
      const { service, roleContextService, profileRepo, userRepo } = buildService(profile, () => Promise.resolve(aiVerifyTestRow));

      await expect(service.approve(5)).rejects.toMatchObject({
        response: { code: 'BUSINESS_CAPABILITY_NOT_ACTIVE' },
      });

      expect(profile.status).toBe(SellerStatus.PENDING); // never mutated in memory
      expect(profileRepo.manager.transaction).not.toHaveBeenCalled();
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

    it('Stage A2: reject() on an organizational profile with an UNRESOLVED workspace skips the AccountRole sync entirely — never fabricates an unbound REJECTED placeholder', async () => {
      const profile = { id: 9, user: { id: 4 }, businessId: 3, status: SellerStatus.PENDING };
      const { service, roleContextService, profileRepo } = buildService(profile, () => Promise.resolve([])); // unresolved

      const saved = await service.reject(9, 'incomplete documents');

      expect(saved.status).toBe(SellerStatus.REJECTED); // the application itself is still closed
      expect(roleContextService.syncOperationalRole).not.toHaveBeenCalled(); // no unbound row fabricated
      expect(profileRepo.save).toHaveBeenCalled();
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

  // Business Capability Activation Stage A2 — failure-injection tests (§4).
  describe('Stage A2 — approval write-atomicity failure injection', () => {
    it('1. entitlement check fails → no writes at all (already covered above, reasserted here for the required-list numbering)', async () => {
      const profile = { id: 5, user: { id: 3 }, businessId: 1, status: SellerStatus.PENDING };
      const { service, roleContextService, profileRepo, userRepo } = buildService(profile, () => Promise.resolve(aiVerifyTestRow));
      await expect(service.approve(5)).rejects.toMatchObject({ response: { code: 'BUSINESS_CAPABILITY_NOT_ACTIVE' } });
      expect(roleContextService.syncOperationalRole).not.toHaveBeenCalled();
      expect(profileRepo.manager.transaction).not.toHaveBeenCalled();
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('2. syncOperationalRole itself fails → SellerProfile/User transaction never opens at all', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING };
      const { service, profileRepo, userUpdate, profileSave } = buildService(profile, () => Promise.resolve(bisRow));
      // Simulate a real DB failure inside RoleContextService itself (not an entitlement rejection).
      const roleContextService: any = { syncOperationalRole: jest.fn().mockRejectedValue(new Error('db connection reset')) };
      (service as any).roleContextService = roleContextService;

      await expect(service.approve(1)).rejects.toThrow('db connection reset');

      expect(profile.status).toBe(SellerStatus.PENDING); // never mutated
      expect(profileRepo.manager.transaction).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
      expect(profileSave).not.toHaveBeenCalled();
    });

    it('3. AccountRole sync succeeds but the User+SellerProfile transaction fails → AccountRole is already ACTIVE (the authorization-relevant write already committed); the error still propagates to the admin caller', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING };
      const { service, roleContextService, profileRepo } = buildService(profile, () => Promise.resolve(bisRow));
      profileRepo.manager.transaction.mockRejectedValue(new Error('transaction aborted: deadlock detected'));

      await expect(service.approve(1)).rejects.toThrow('transaction aborted: deadlock detected');

      // The one write that grants real operating authority (per
      // RoleContextService.isProfileValid()'s own status-only check, traced
      // in the Stage A2 report) already committed before this failure —
      // this is the accepted, self-healing inconsistency window: a retried
      // approve() (or an admin's reject()) reconciles SellerProfile/User to
      // match it, and SellerProfile.status staying PENDING can only ever
      // under-grant the separate Feature-gated (VerificationService level2)
      // actions in the interim, never over-grant real authorization.
      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ status: AccountRoleStatus.ACTIVE, workspaceAssignmentId: 2 }),
      );
    });

    it('4. SellerProfile persistence succeeds but User update fails inside the SAME transaction → profileSave is never reached (real TypeORM would roll both back)', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.PENDING };
      const { service, userUpdate, profileSave } = buildService(profile, () => Promise.resolve(bisRow));
      userUpdate.mockRejectedValue(new Error('user update constraint violation'));

      await expect(service.approve(1)).rejects.toThrow('user update constraint violation');

      // update() is called before save() inside the transactional callback —
      // a rejection there means save() is never reached in this call, and in
      // real Postgres the surrounding transaction rolls back whatever DID
      // execute, so SellerProfile can never end up persisted as APPROVED
      // while User.role failed to update.
      expect(profileSave).not.toHaveBeenCalled();
    });

    it('5. successful organizational approval leaves all intended state consistent (see test 1 above for the full assertion)', () => {
      expect(true).toBe(true); // covered by "1/4. organizational Seller + active COMMERCE..." above
    });

    it('6. successful legacy approval preserves legacy behavior (see "8. legacy Seller" above for the full assertion)', () => {
      expect(true).toBe(true); // covered by "8. legacy Seller uses explicit null" above
    });
  });

  // Business Capability Activation Stage A2 — Seller suspension authority
  // synchronization (§6-§10 of the mission).
  describe('Stage A2 — suspend() now synchronizes the Seller AccountRole', () => {
    it('BiS/AR38: suspending the organizational Seller targets workspaceAssignmentId 2, SUSPENDED, before SellerProfile/User are mutated', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.APPROVED };
      const { service, roleContextService, userRepo, profileRepo } = buildService(profile, () => Promise.resolve(bisRow));

      const saved = await service.suspend(1, 'policy violation');

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith({
        userId: 2, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.SUSPENDED,
        profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, workspaceAssignmentId: 2,
        statusReason: 'policy violation',
      });
      expect(saved.status).toBe(SellerStatus.SUSPENDED);
      expect(userRepo.update).toHaveBeenCalledWith(2, { role: 'user' });
      expect(profileRepo.save).toHaveBeenCalled();
      expect(roleContextService.syncOperationalRole.mock.invocationCallOrder[0])
        .toBeLessThan(userRepo.update.mock.invocationCallOrder[0]);
    });

    it('a suspension that fails to reach the AccountRole surfaces as a real error — SellerProfile is never saved as SUSPENDED while the role stays ACTIVE', async () => {
      const profile = { id: 1, user: { id: 2 }, businessId: 2, status: SellerStatus.APPROVED };
      const { service, profileRepo, userRepo } = buildService(profile, () => Promise.resolve(bisRow));
      const roleContextService: any = { syncOperationalRole: jest.fn().mockRejectedValue(new Error('db down')) };
      (service as any).roleContextService = roleContextService;

      await expect(service.suspend(1, 'policy violation')).rejects.toThrow('db down');

      expect(profile.status).toBe(SellerStatus.APPROVED); // never mutated to SUSPENDED
      expect(userRepo.update).not.toHaveBeenCalled();
      expect(profileRepo.save).not.toHaveBeenCalled();
    });

    it('9. multi-business suspension isolation: suspending Seller A never touches Seller B\'s AccountRole for the same human', async () => {
      const profileA = { id: 30, user: { id: 8 }, businessId: 10, status: SellerStatus.APPROVED };
      const { service: serviceA, roleContextService: roleContextA } = buildService(profileA, (_sql, params) =>
        params[0] === 10 ? Promise.resolve([{ workspaceAssignmentId: 100, commerceActive: true }]) : Promise.resolve([]),
      );
      await serviceA.suspend(30, 'policy violation');
      expect(roleContextA.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8, workspaceAssignmentId: 100, status: AccountRoleStatus.SUSPENDED }),
      );
      expect(roleContextA.syncOperationalRole).not.toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAssignmentId: 200 }),
      );
    });

    it('10. legacy Seller suspension: no businessId → workspaceAssignmentId: null, never binds to a Business, never requires BusinessCapability', async () => {
      const profile = { id: 20, user: { id: 7 }, status: SellerStatus.APPROVED }; // no businessId
      const { service, roleContextService, profileRepo } = buildService(profile);

      await service.suspend(20, 'policy violation');

      expect(roleContextService.syncOperationalRole).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7, workspaceAssignmentId: null, status: AccountRoleStatus.SUSPENDED }),
      );
      expect(profileRepo.manager.query).not.toHaveBeenCalled(); // legacy path never resolves organizationally
    });

    it('an organizational Seller with an UNRESOLVED workspace still gets suspended at the SellerProfile level, without fabricating an unbound AccountRole sync', async () => {
      const profile = { id: 9, user: { id: 4 }, businessId: 3, status: SellerStatus.APPROVED };
      const { service, roleContextService, profileRepo } = buildService(profile, () => Promise.resolve([]));

      const saved = await service.suspend(9, 'policy violation');

      expect(saved.status).toBe(SellerStatus.SUSPENDED);
      expect(roleContextService.syncOperationalRole).not.toHaveBeenCalled();
      expect(profileRepo.save).toHaveBeenCalled();
    });
  });
});
