import { ForbiddenException } from '@nestjs/common';
import { ClassifiedsService } from './classifieds.service';

/**
 * Legacy authority security closure: admin override on classified update/
 * delete/invoice-lookup must come from the caller's CURRENTLY ACTIVE
 * RoleContext (passed in as isActiveAdmin), never the legacy User.role
 * field.
 */
describe('ClassifiedsService legacy authority closure', () => {
  const buildService = () => {
    const repo: any = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((l) => Promise.resolve(l)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const invoiceRequestRepo: any = { findOne: jest.fn() };
    const invoiceRepo: any = { findOne: jest.fn() };
    const commerceProfiles: any = {
      findById: jest.fn().mockResolvedValue(null),
      findForUserByType: jest.fn().mockResolvedValue(null),
    };
    const searchIndex: any = { upsert: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const service = new ClassifiedsService(
      repo,
      invoiceRequestRepo,
      invoiceRepo,
      noop, // Order repo
      noop, // invoicesService
      noop, // dataSource
      noop, // feedService
      commerceProfiles,
      noop, // profileScope
      searchIndex,
      noop, // superAgents
      noop, // codCalculation
    );
    return { service, repo, invoiceRequestRepo, invoiceRepo };
  };

  describe('update()/remove() — own-listing-only, admin authority from active RoleContext', () => {
    const buildListing = () => ({ id: 1, seller: { id: 200 }, commerceProfileId: null });

    it('a staff account active as BUYER cannot edit another seller\'s listing via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildListing());
      await expect(
        service.update(1, {} as any, { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can edit any seller\'s listing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildListing());
      await expect(
        service.update(1, {} as any, { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });

    it('a staff account active as BUYER cannot delete another seller\'s listing via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildListing());
      await expect(
        service.remove(1, { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can delete any seller\'s listing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildListing());
      await expect(
        service.remove(1, { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });

    it('the actual owning seller can always edit/delete their own listing', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildListing());
      await expect(
        service.update(1, {} as any, { id: 200 } as any, false),
      ).resolves.toBeDefined();
    });
  });

  describe('getInvoiceByNumber() — party-only, admin authority from active RoleContext', () => {
    it('a staff account active as BUYER cannot read an unrelated invoice via admin override', async () => {
      const { service, invoiceRequestRepo } = buildService();
      invoiceRequestRepo.findOne.mockResolvedValue({
        invoiceNumber: 'INV-1',
        buyer: { id: 100 },
        seller: { id: 200 },
        status: 'pending',
      });
      await expect(
        service.getInvoiceByNumber('INV-1', { id: 999 } as any, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can read any invoice', async () => {
      const { service, invoiceRequestRepo } = buildService();
      invoiceRequestRepo.findOne.mockResolvedValue({
        invoiceNumber: 'INV-1',
        buyer: { id: 100 },
        seller: { id: 200 },
        status: 'pending',
      });
      await expect(
        service.getInvoiceByNumber('INV-1', { id: 999 } as any, true),
      ).resolves.toBeDefined();
    });
  });
});
