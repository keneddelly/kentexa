import { ForbiddenException } from '@nestjs/common';
import { BusinessController } from './business.controller';

/**
 * Regression test for the Stage 2 "current confirmed problem" fix:
 * resolveSellerActorId() used to catch ANY sellerScope.resolve() failure
 * (including Stage 1's active-role-context denial) and silently fall back
 * to req.user.id -- since Conversation/BusinessCustomer.sellerId IS the
 * seller's own User.id, that fallback reproduced full seller-inbox access
 * for an account that is a real approved seller but currently active as a
 * different role (buyer, agent, transport, whatever). This is exactly
 * "SellerInbox loads seller and buyer conversations together... operational
 * roles can observe communication belonging to another active context."
 */
describe('BusinessController — resolveSellerActorId fail-closed regression', () => {
  const build = (resolveImpl: () => Promise<number>) => {
    const customerService: any = { getMyCustomers: jest.fn().mockResolvedValue([]) };
    const conversationService: any = { getSellerInbox: jest.fn().mockResolvedValue([]) };
    const sellerScope: any = { resolve: jest.fn(resolveImpl) };
    const businessService: any = {};
    const businessBackfill: any = {};
    const flags: any = { isEnabled: jest.fn().mockReturnValue(false) };
    const controller = new BusinessController(
      customerService, conversationService, sellerScope, businessService, businessBackfill, flags,
    );
    return { controller, customerService, conversationService, sellerScope, flags };
  };

  it('propagates ForbiddenException from sellerScope.resolve() instead of silently falling back to req.user.id', async () => {
    const { controller } = build(() => {
      throw new ForbiddenException('You are not authorized to manage this business.');
    });
    const req = { user: { id: 42 } };

    await expect(controller.getCustomers(req as any)).rejects.toThrow(ForbiddenException);
  });

  it('a buyer-active account that also possesses a suspended-active seller role is denied the seller inbox', async () => {
    // Mirrors what SellerScopeService.resolve() actually does post-Stage-1:
    // throws when the caller's active role isn't seller/admin/manager and
    // they have no team membership -- regardless of what other roles the
    // account possesses.
    const { controller } = build(() => {
      throw new ForbiddenException('You are not authorized to manage this business.');
    });
    const req = { user: { id: 42 } };

    await expect(controller.getInbox(req as any)).rejects.toThrow(ForbiddenException);
  });

  it('still succeeds normally for a genuinely active seller (no behavior change for the legitimate case)', async () => {
    const { controller, customerService, sellerScope } = build(() => Promise.resolve(42));
    const req = { user: { id: 42 } };

    await controller.getCustomers(req as any);

    expect(sellerScope.resolve).toHaveBeenCalledWith(req.user, 'canViewCustomers');
    expect(customerService.getMyCustomers).toHaveBeenCalledWith(42, expect.any(Object));
  });
});
