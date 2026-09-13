import { ConflictException } from '@nestjs/common';
import { CommerceProfileScopeService } from './commerce-profile-scope.service';
import {
  CommerceProfileStatus,
  CommerceProfileType,
} from './entities/commerce-profile.entity';
import { OperationalWorkspaceStatus } from '../business/entities/operational-workspace.entity';
import { RoleProfileType } from '../role-context/entities/account-role.entity';

describe('CommerceProfileScopeService authoritative listing attribution', () => {
  const build = () => {
    const profileRepo: any = { find: jest.fn(), findOne: jest.fn() };
    const memberRepo: any = { findOne: jest.fn() };
    const workspaceRepo: any = { findOne: jest.fn() };
    const service = new CommerceProfileScopeService(
      profileRepo,
      memberRepo,
      workspaceRepo,
    );
    return { service, profileRepo, workspaceRepo };
  };

  const workspaceScope = (workspaceId = 10, businessId = 100) => ({
    legacySellerId: 1,
    workspaceId,
    businessId,
    mode: 'workspace' as const,
    profileType: RoleProfileType.SELLER_PROFILE,
    profileId: 5,
  });

  it('resolves the sole active BUSINESS profile through workspace business linkage', async () => {
    const { service, profileRepo, workspaceRepo } = build();
    workspaceRepo.findOne.mockResolvedValue({ id: 10, businessId: 100 });
    profileRepo.find.mockResolvedValue([{ id: 1000 }]);

    await expect(
      service.resolveForListingScope(workspaceScope()),
    ).resolves.toBe(1000);
    expect(workspaceRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 10,
        businessId: 100,
        status: OperationalWorkspaceStatus.ACTIVE,
      },
    });
    expect(profileRepo.find).toHaveBeenCalledWith({
      where: {
        businessId: 100,
        type: CommerceProfileType.BUSINESS,
        status: CommerceProfileStatus.ACTIVE,
      },
      take: 2,
    });
  });

  it('cannot select a same-owner profile from another business', async () => {
    const { service, profileRepo, workspaceRepo } = build();
    workspaceRepo.findOne.mockResolvedValue({ id: 10, businessId: 100 });
    profileRepo.find.mockResolvedValue([{ id: 1000, ownerId: 1 }]);

    await expect(
      service.resolveForListingScope(workspaceScope()),
    ).resolves.toBe(1000);
    expect(profileRepo.find).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: 200 }),
      }),
    );
  });

  it('does not consult user ownership or membership to choose a profile', async () => {
    const { service, profileRepo, workspaceRepo } = build();
    workspaceRepo.findOne.mockResolvedValue({ id: 10, businessId: 100 });
    profileRepo.find.mockResolvedValue([{ id: 1000, ownerId: 999 }]);
    await expect(
      service.resolveForListingScope(workspaceScope()),
    ).resolves.toBe(1000);
  });

  it('rejects a workspace/business mismatch', async () => {
    const { service, workspaceRepo } = build();
    workspaceRepo.findOne.mockResolvedValue(null);
    await expect(
      service.resolveForListingScope(workspaceScope()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'COMMERCE_PROFILE_WORKSPACE_UNRESOLVED',
      }),
    });
  });

  it.each([[[]], [[{ id: 1 }, { id: 2 }]]])(
    'fails closed unless profile cardinality is exactly one: %p',
    async (profiles) => {
      const { service, profileRepo, workspaceRepo } = build();
      workspaceRepo.findOne.mockResolvedValue({ id: 10, businessId: 100 });
      profileRepo.find.mockResolvedValue(profiles);
      await expect(
        service.resolveForListingScope(workspaceScope()),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('preserves deterministic legacy SellerProfile attribution', async () => {
    const { service, profileRepo } = build();
    profileRepo.find.mockResolvedValue([{ id: 77 }]);
    await expect(
      service.resolveForListingScope({
        legacySellerId: 1,
        workspaceId: null,
        businessId: null,
        mode: 'legacy',
        profileType: RoleProfileType.SELLER_PROFILE,
        profileId: 5,
      }),
    ).resolves.toBe(77);
  });

  it('keeps a personal classified context account-scoped', async () => {
    const { service, profileRepo, workspaceRepo } = build();
    await expect(
      service.resolveForListingScope({
        legacySellerId: 1,
        workspaceId: null,
        businessId: null,
        mode: 'legacy',
        profileType: RoleProfileType.USER,
        profileId: 1,
      }),
    ).resolves.toBeNull();
    expect(profileRepo.find).not.toHaveBeenCalled();
    expect(workspaceRepo.findOne).not.toHaveBeenCalled();
  });
});
