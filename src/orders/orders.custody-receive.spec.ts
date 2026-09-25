import { OrdersService } from './orders.service';
import { Order, OrderStatus, OrderSource, OrderPaymentMethod } from './entities/order.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('OrdersService.superAgentReceiveOrder custody boundary', () => {
  const user = { id: 7 };
  const hub = { id: 12, businessName: 'Origin Hub', city: 'Dar', commissionRate: 0 };
  const context = { userId: 7, accountRoleId: 23, roleType: AccountRoleType.SUPER_AGENT, profileId: 12, workspaceId: 5 };
  const order = { id: 41, status: OrderStatus.PAID, source: OrderSource.ONLINE,
    paymentMethod: OrderPaymentMethod.ONLINE, trackingNumber: 'KTX-ORD-41',
    seller: null, buyer: null, product: null, baseAmount: 50000, totalAmount: 52000,
    deliveryFeeAmount: 2000, sellerAmount: 48000, deliveryAddress: 'Mwanza' };

  function setup(failAt?: 'parcel' | 'custody' | 'tracking') {
    const writes: string[] = [];
    const notifications = { parcelDispatched: jest.fn().mockResolvedValue(undefined) };
    const manager: any = {
      query: jest.fn().mockImplementation(async (sql: string) => sql.includes('public."order"') ? [{ status: OrderStatus.PAID }] : []),
      getRepository: jest.fn((entity: any) => {
        if (entity === Order) return { update: async () => { writes.push('order'); } };
        if (entity === Parcel) return {
          findOne: async () => null,
          create: (x: any) => x,
          save: async () => { if (failAt === 'parcel') throw new Error('parcel failed'); writes.push('parcel'); return { id: 55 }; },
        };
        if (entity === ParcelCustodyEvent) return { insert: async () => {
          if (failAt === 'custody') throw new Error('custody failed'); writes.push('custody');
        } };
        if (entity === ParcelTracking) return { insert: async () => {
          if (failAt === 'tracking') throw new Error('tracking failed'); writes.push('tracking');
        } };
        if (entity === SuperAgent) return { increment: jest.fn() };
        throw new Error('Unexpected repository');
      }),
    };
    const service: any = Object.create(OrdersService.prototype);
    service.repo = { findOne: jest.fn().mockResolvedValue(order), manager: {
      transaction: async (callback: any) => callback(manager),
    } };
    service.superAgentRepo = { findOne: jest.fn().mockResolvedValue(hub) };
    service.paymentEvidence = { check: jest.fn().mockResolvedValue({ applicable: true, sufficient: true }) };
    service.notificationsService = notifications;
    service.communicationEngine = { dispatch: jest.fn() };
    service.smsService = { sendSms: jest.fn() };
    return { service, writes, notifications, manager };
  }

  it('writes order, parcel, custody, and tracking before notifying', async () => {
    const { service, writes, notifications } = setup();
    await service.superAgentReceiveOrder(order.id, user, {}, context);
    expect(writes).toEqual(['order', 'parcel', 'custody', 'tracking']);
    expect(notifications.parcelDispatched).toHaveBeenCalledTimes(1);
  });

  it.each(['parcel', 'custody', 'tracking'] as const)('does not notify after %s write fails', async (failure) => {
    const { service, notifications } = setup(failure);
    await expect(service.superAgentReceiveOrder(order.id, user, {}, context)).rejects.toThrow(`${failure} failed`);
    expect(notifications.parcelDispatched).not.toHaveBeenCalled();
  });

  it('returns a committed receipt even if post-commit email delivery fails', async () => {
    const { service, writes, notifications } = setup();
    notifications.parcelDispatched.mockRejectedValueOnce(new Error('email offline'));
    await expect(service.superAgentReceiveOrder(order.id, user, {}, context)).resolves.toMatchObject({ orderId: order.id });
    expect(writes).toEqual(['order', 'parcel', 'custody', 'tracking']);
  });

  it('fails closed when the active role does not identify the receiving hub', async () => {
    const { service, writes } = setup();
    await expect(service.superAgentReceiveOrder(order.id, user, {}, { ...context, profileId: 99 })).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
