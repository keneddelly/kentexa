import { ForbiddenException } from '@nestjs/common';
import { ShippingService } from './shipping.service';

/**
 * Legacy authority security closure: admin override on order tracking
 * lookup must come from the caller's CURRENTLY ACTIVE RoleContext, never
 * the legacy User.role field.
 */
describe('ShippingService legacy authority closure', () => {
  const buildService = () => {
    const orderRepo: any = { findOne: jest.fn(), save: jest.fn() };
    const sellerScope: any = { isAuthorizedFor: jest.fn().mockResolvedValue(false) };
    const noop: any = {};
    const service = new ShippingService(orderRepo, noop, sellerScope);
    return { service, orderRepo };
  };

  const buildOrder = () => ({
    id: 1,
    buyer: { id: 100 },
    seller: { id: 200 },
    status: 'shipped',
  });

  it('a staff account active as BUYER cannot view an unrelated order\'s tracking via admin override', async () => {
    const { service, orderRepo } = buildService();
    orderRepo.findOne.mockResolvedValue(buildOrder());
    await expect(
      service.getOrderTracking(1, { id: 999 } as any, { roleType: 'buyer' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('a staff account active as ADMIN can view any order\'s tracking', async () => {
    const { service, orderRepo } = buildService();
    orderRepo.findOne.mockResolvedValue(buildOrder());
    await expect(
      service.getOrderTracking(1, { id: 999 } as any, { roleType: 'admin' } as any),
    ).resolves.toBeDefined();
  });

  it('the true buyer can always view their own order\'s tracking', async () => {
    const { service, orderRepo } = buildService();
    orderRepo.findOne.mockResolvedValue(buildOrder());
    await expect(
      service.getOrderTracking(1, { id: 100 } as any, { roleType: 'buyer' } as any),
    ).resolves.toBeDefined();
  });

  it('an unrelated non-staff caller with no roleContext at all is still rejected', async () => {
    const { service, orderRepo } = buildService();
    orderRepo.findOne.mockResolvedValue(buildOrder());
    await expect(
      service.getOrderTracking(1, { id: 999 } as any, undefined),
    ).rejects.toThrow(ForbiddenException);
  });
});
