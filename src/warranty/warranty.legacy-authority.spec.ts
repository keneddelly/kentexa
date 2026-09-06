import { ForbiddenException } from '@nestjs/common';
import { WarrantyService } from './warranty.service';
import { WarrantyClaimStatus } from './entities/warranty-claim.entity';

/**
 * Legacy authority security closure: admin override on warranty
 * registration view / claim review must come from the caller's
 * CURRENTLY ACTIVE RoleContext (passed in as isActiveAdmin), never the
 * legacy User.role field.
 */
describe('WarrantyService legacy authority closure', () => {
  const buildService = () => {
    const repo: any = { findOne: jest.fn() };
    const claimRepo: any = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };
    const auditRepo: any = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const notifications: any = { notify: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const service = new WarrantyService(
      repo,
      claimRepo,
      auditRepo,
      noop, // Order repo
      noop, // Product repo
      noop, // brands
      notifications,
      { record: jest.fn() }, // activityEvents
    );
    return { service, repo, claimRepo };
  };

  describe('findOne() — party-only, admin authority from active RoleContext', () => {
    const buildRegistration = () => ({ id: 1, buyerId: 100, sellerId: 200 });

    it('a staff account active as BUYER cannot view an unrelated warranty registration via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.findOne(1, { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can view any warranty registration', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.findOne(1, { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });

    it('the actual buyer or seller can always view their own registration', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.findOne(1, { id: 100 } as any, false),
      ).resolves.toBeDefined();
    });
  });

  describe('reviewClaim() — owning-seller-only, admin authority from active RoleContext', () => {
    const buildClaim = () => ({ id: 5, registrationId: 1, status: WarrantyClaimStatus.SUBMITTED });
    const buildRegistration = () => ({ id: 1, buyerId: 100, sellerId: 200 });

    it('a staff account active as BUYER cannot review another seller\'s claim via admin override', async () => {
      const { service, claimRepo, repo } = buildService();
      claimRepo.findOne.mockResolvedValue(buildClaim());
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.reviewClaim(5, { id: 999 }, { status: WarrantyClaimStatus.APPROVED }, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can review any claim', async () => {
      const { service, claimRepo, repo } = buildService();
      claimRepo.findOne.mockResolvedValue(buildClaim());
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.reviewClaim(5, { id: 999 }, { status: WarrantyClaimStatus.APPROVED }, true),
      ).resolves.toBeDefined();
    });

    it('the actual owning seller can always review their own claim', async () => {
      const { service, claimRepo, repo } = buildService();
      claimRepo.findOne.mockResolvedValue(buildClaim());
      repo.findOne.mockResolvedValue(buildRegistration());
      await expect(
        service.reviewClaim(5, { id: 200 }, { status: WarrantyClaimStatus.APPROVED }, false),
      ).resolves.toBeDefined();
    });
  });
});
