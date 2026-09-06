import { ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';

/**
 * Legacy authority security closure: admin/manager override on order
 * routes must come from the caller's CURRENTLY ACTIVE RoleContext, never
 * the legacy User.role field. A staff account that holds ADMIN but is
 * currently operating as BUYER or SELLER must not retain admin authority
 * until they switch the active role back to ADMIN.
 */
describe('OrdersService legacy authority closure', () => {
  const buildService = () => {
    const repo: any = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
    };
    const noop: any = {};
    const service = new OrdersService(
      repo, // Order repo
      noop, // User repo
      noop, // Payout repo
      noop, // Parcel repo
      noop, // Brand repo
      noop, // ParcelTracking repo
      noop, // SuperAgent repo
      noop, // Agent repo
      noop, // AgentTransaction repo
      noop, // Review repo
      noop, // TransportAssignment repo
      noop, // TransportProvider repo
      noop, // ClassifiedInvoiceRequest repo
      noop, // Classified repo
      noop, // productsService
      noop, // invoicesService
      noop, // notificationsService
      noop, // reputationService
      noop, // collectionsService
      noop, // smsService
      noop, // businessCustomerService
      noop, // conversationService
      noop, // inAppNotif
      { isAuthorizedFor: jest.fn().mockResolvedValue(false) }, // sellerScope
      noop, // walletService
      { findForUserByType: jest.fn().mockResolvedValue(null) }, // commerceProfiles
      noop, // profileScope
      { record: jest.fn() }, // activityEvents
      noop, // codCalculation
      noop, // communicationEngine
    );
    return { service, repo };
  };

  const roleContext = (roleType: AccountRoleType): RoleContext =>
    ({ roleType } as RoleContext);

  describe('getOrderDetail — staff account, multiple roles', () => {
    const buildOrder = () => ({
      id: 1,
      buyer: { id: 100 },
      seller: { id: 200 },
      createdByUserId: null,
    });

    it('active BUYER context on a staff account cannot use the admin override to view an unrelated order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.getOrderDetail(1, { id: 999 } as any, roleContext(AccountRoleType.BUYER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active SELLER context on a staff account cannot use the admin override to view an unrelated order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.getOrderDetail(1, { id: 999 } as any, roleContext(AccountRoleType.SELLER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active ADMIN context on the same staff account can view any order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.getOrderDetail(1, { id: 999 } as any, roleContext(AccountRoleType.ADMIN)),
      ).resolves.toBeDefined();
    });

    it('no roleContext at all (unmigrated caller) never grants admin access', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.getOrderDetail(1, { id: 999 } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel — staff account, multiple roles', () => {
    const buildOrder = () => ({
      id: 1,
      buyer: { id: 100 },
      seller: null,
      status: 'pending_payment',
    });

    it('active BUYER context on a staff account cannot cancel someone else\'s order via admin override', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.cancel(1, { id: 999 } as any, roleContext(AccountRoleType.BUYER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active ADMIN context on the same staff account can cancel any pending order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.cancel(1, { id: 999 } as any, roleContext(AccountRoleType.ADMIN)),
      ).resolves.toBeDefined();
    });

    it('the true order owner (buyer) can always cancel their own order regardless of role context', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.cancel(1, { id: 100 } as any, roleContext(AccountRoleType.BUYER)),
      ).resolves.toBeDefined();
    });
  });

  describe('adminChangeStatus — active role required, not legacy field', () => {
    it('active BUYER context is rejected even on a staff account', async () => {
      const { service } = buildService();
      await expect(
        service.adminChangeStatus(1, 'confirmed', roleContext(AccountRoleType.BUYER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active SELLER context is rejected even on a staff account', async () => {
      const { service } = buildService();
      await expect(
        service.adminChangeStatus(1, 'confirmed', roleContext(AccountRoleType.SELLER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active ADMIN context succeeds', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ id: 1 });
      await expect(
        service.adminChangeStatus(1, 'confirmed', roleContext(AccountRoleType.ADMIN)),
      ).resolves.toBeDefined();
    });

    it('active MANAGER context succeeds', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ id: 1 });
      await expect(
        service.adminChangeStatus(1, 'confirmed', roleContext(AccountRoleType.MANAGER)),
      ).resolves.toBeDefined();
    });

    it('missing roleContext is rejected outright', async () => {
      const { service } = buildService();
      await expect(
        service.adminChangeStatus(1, 'confirmed', undefined as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateConfirmationLink — ownership OR active admin, never legacy role', () => {
    const buildOrder = () => ({
      id: 1,
      seller: { id: 200 },
      buyer: { id: 100 },
      createdByUserId: null,
    });

    it('an unrelated staff account active as BUYER cannot generate a confirmation link for another seller\'s order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.generateConfirmationLink(1, { id: 999 } as any, roleContext(AccountRoleType.BUYER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('active ADMIN context can generate a confirmation link for any order', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.generateConfirmationLink(1, { id: 999 } as any, roleContext(AccountRoleType.ADMIN)),
      ).resolves.toBeDefined();
    });

    it('the actual seller can always generate their own confirmation link', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(buildOrder());
      await expect(
        service.generateConfirmationLink(1, { id: 200 } as any, roleContext(AccountRoleType.SELLER)),
      ).resolves.toBeDefined();
    });
  });
});
