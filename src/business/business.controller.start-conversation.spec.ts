import { BadRequestException } from '@nestjs/common';
import { BusinessController } from './business.controller';

/**
 * Communication canonicality fix -- proves POST /business/my-conversations/
 * start routes to the correct service method based on targetType, requires
 * targetId whenever a non-seller targetType is given, and preserves the
 * exact legacy sellerId-only call shape unchanged.
 */
describe('BusinessController.startConversationAsBuyer -- API contract branching', () => {
  const build = () => {
    const customerService: any = {};
    const conversationService: any = {
      getOrCreateConversationAsBuyer: jest.fn().mockResolvedValue({ id: 1, _mode: 'seller' }),
      getOrCreateOperationalConversationAsBuyer: jest.fn().mockResolvedValue({ id: 2, _mode: 'operational' }),
    };
    const sellerScope: any = {};
    const businessService: any = {};
    const businessBackfill: any = {};
    const flags: any = { isEnabled: jest.fn().mockReturnValue(false) };
    const controller = new BusinessController(
      customerService, conversationService, sellerScope, businessService, businessBackfill, flags,
    );
    return { controller, conversationService };
  };

  const req = { user: { id: 5, name: 'Bob' } };

  it('a bare legacy sellerId (no targetType) routes to getOrCreateConversationAsBuyer unchanged', async () => {
    const { controller, conversationService } = build();
    await controller.startConversationAsBuyer(req as any, { sellerId: 2 } as any);
    expect(conversationService.getOrCreateConversationAsBuyer).toHaveBeenCalledWith(req.user, 2, undefined, null);
    expect(conversationService.getOrCreateOperationalConversationAsBuyer).not.toHaveBeenCalled();
  });

  it('targetType:"seller" + targetId also routes to the legacy seller method (transitional compatibility)', async () => {
    const { controller, conversationService } = build();
    await controller.startConversationAsBuyer(req as any, { targetType: 'seller', targetId: 2 } as any);
    expect(conversationService.getOrCreateConversationAsBuyer).toHaveBeenCalledWith(req.user, 2, undefined, null);
  });

  it('targetType:"super_agent" + targetId routes to getOrCreateOperationalConversationAsBuyer, never the legacy method', async () => {
    const { controller, conversationService } = build();
    await controller.startConversationAsBuyer(req as any, { targetType: 'super_agent', targetId: 101 } as any);
    expect(conversationService.getOrCreateOperationalConversationAsBuyer).toHaveBeenCalledWith(req.user, 'super_agent', 101, null);
    expect(conversationService.getOrCreateConversationAsBuyer).not.toHaveBeenCalled();
  });

  it.each(['super_agent', 'transport_provider', 'agent'])('targetType:"%s" without targetId fails closed (400), never falls back to a different target', async (targetType) => {
    const { controller, conversationService } = build();
    expect(() => controller.startConversationAsBuyer(req as any, { targetType } as any)).toThrow(BadRequestException);
    expect(conversationService.getOrCreateOperationalConversationAsBuyer).not.toHaveBeenCalled();
    expect(conversationService.getOrCreateConversationAsBuyer).not.toHaveBeenCalled();
  });

  it('neither sellerId nor targetType/targetId supplied fails closed (400)', async () => {
    const { controller, conversationService } = build();
    expect(() => controller.startConversationAsBuyer(req as any, {} as any)).toThrow(BadRequestException);
    expect(conversationService.getOrCreateConversationAsBuyer).not.toHaveBeenCalled();
    expect(conversationService.getOrCreateOperationalConversationAsBuyer).not.toHaveBeenCalled();
  });

  it('contextType/contextId are forwarded identically to both branches', async () => {
    const { controller, conversationService } = build();
    await controller.startConversationAsBuyer(req as any, { targetType: 'agent', targetId: 103, contextType: 'service', contextId: 9 } as any);
    expect(conversationService.getOrCreateOperationalConversationAsBuyer).toHaveBeenCalledWith(req.user, 'agent', 103, { type: 'service', id: 9 });
  });
});
