import { ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Legacy authority security closure: admin override on product update/
 * delete must come from the CALLER'S CURRENTLY ACTIVE RoleContext
 * (resolved in the controller, passed in as isActiveAdmin), never the
 * legacy User.role field. A staff account that holds ADMIN but is
 * currently operating as BUYER or SELLER must not retain admin authority
 * over another seller's products until they switch the active role back.
 */
describe('ProductsService legacy authority closure', () => {
  const buildService = () => {
    const repo: any = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    const serialRepo: any = {
      find: jest.fn(),
      findOne: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
    };
    const commerceProfiles: any = {
      findById: jest.fn().mockResolvedValue(null),
      findForUserByType: jest.fn().mockResolvedValue(null),
    };
    const brandAuthorizations: any = { getBadgeStatus: jest.fn() };
    const brands: any = { findOne: jest.fn() };
    const searchIndex: any = {
      remove: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    const noop: any = {};
    const service = new ProductsService(
      repo, // Product repo
      noop, // ProductReview repo
      noop, // SellerProfile repo
      noop, // Order repo
      noop, // DigitalProductAsset repo
      noop, // ProductVariantGroup repo
      serialRepo, // ProductSerial repo
      noop, // feedService
      commerceProfiles,
      noop, // profileScope
      searchIndex,
      noop, // ranking
      noop, // inventory
      { record: jest.fn() }, // activityEvents
      brandAuthorizations,
      brands,
    );
    return { service, repo };
  };

  describe('remove() — own-product-only, admin authority from active RoleContext', () => {
    const buildProduct = () => ({ id: 1, seller: { id: 200 } });

    it('a staff account active as BUYER cannot delete another seller\'s product via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.remove(1, { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can delete any seller\'s product', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.remove(1, { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });

    it('the actual owning seller can always delete their own product', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.remove(1, { id: 200 } as any, false),
      ).resolves.toBeDefined();
    });

    it('a different seller (not admin, not owner) cannot delete the product', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.remove(1, { id: 300 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update() — own-product-only, admin authority from active RoleContext', () => {
    const buildProduct = () => ({ id: 1, seller: { id: 200 }, commerceProfileId: null });

    it('a staff account active as SELLER (own products only) cannot edit another seller\'s product via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.update(1, {} as any, { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can edit any seller\'s product', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.update(1, {} as any, { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });

    it('the actual owning seller can always edit their own product', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildProduct());
      await expect(
        service.update(1, {} as any, { id: 200 } as any, false),
      ).resolves.toBeDefined();
    });
  });
});
