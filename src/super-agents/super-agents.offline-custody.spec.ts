import { SuperAgentsService } from './super-agents.service';
import { Order } from '../orders/entities/order.entity';
import { Parcel, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { SuperAgent, SuperAgentStatus } from './entities/super-agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('offline counter receipt boundary', () => {
  const user = { id: 7, name: 'Agent' };
  const hub = { id: 12, user: { id: 7 }, city: 'Dar', businessName: 'Origin',
    status: SuperAgentStatus.ACTIVE, freeOrdersUsed: 0, freeOrdersGranted: 10,
    totalPlatformFeesCharged: 0, totalPlatformFeesWaived: 0, totalEarnings: 0,
    totalParcelsHandled: 0, paidOrders: 0, outstandingBalance: 0, billingThreshold: 10000 };
  const context = { userId: 7, profileId: 12, accountRoleId: 23,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: 5 };
  const dto = { senderName: 'Sender', senderPhone: '255700000001', recipientName: 'Receiver',
    recipientPhone: '255700000002', destinationCity: 'Mwanza', deliveryAddress: 'Market',
    description: 'Goods', declaredValue: 50000, shippingFeeCollected: 5000 };

  function setup(failAt?: 'parcel' | 'custody' | 'invoice') {
    const writes: string[] = [];
    const sms = { sendSms: jest.fn().mockResolvedValue(true) };
    const invoice = { receiptNumber: 'KNT-RCP-2026-00001', paidAt: new Date() };
    const manager: any = {
      query: jest.fn().mockResolvedValue([{ id: hub.id }]),
      getRepository: (entity: any) => {
        if (entity === Order) return {
          save: async () => { writes.push('order'); return { id: 44 }; },
          update: async () => { writes.push('tracking-number'); },
        };
        if (entity === Parcel) return { save: async () => {
          if (failAt === 'parcel') throw new Error('parcel failed');
          writes.push('parcel'); return { id: 99, trackingNumber: 'KTX-ORD-44' };
        } };
        if (entity === SuperAgent) return {
          findOne: async () => hub, update: async () => { writes.push('hub'); },
        };
        if (entity === ParcelCustodyEvent) return { insert: async () => {
          if (failAt === 'custody') throw new Error('custody failed'); writes.push('custody');
        } };
        if (entity === ParcelTracking) return { insert: async () => { writes.push('tracking'); } };
        throw new Error('Unexpected repository');
      },
    };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.superAgentRepo = { findOne: jest.fn().mockResolvedValue(hub) };
    service.orderRepo = { create: (x: any) => x };
    service.parcelRepo = { create: (x: any) => x };
    service.routeRepo = { findOne: jest.fn().mockResolvedValue(null) };
    service.auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    service.commerceProfiles = { findForUserByType: jest.fn() };
    service.activityEvents = { record: jest.fn() };
    service.smsService = sms;
    service.dataSource = { transaction: (callback: any) => callback(manager) };
    service.invoicesService = { recordManualPayment: jest.fn(async (_o, _p, m) => {
      expect(m).toBe(manager);
      if (failAt === 'invoice') throw new Error('invoice failed');
      writes.push('invoice'); return invoice;
    }) };
    return { service, manager, writes, sms };
  }

  it('records custody, tracking, counters and paid invoice before SMS', async () => {
    const { service, manager, writes, sms } = setup();
    const result = await service.createOfflineIntercityOrder(user, dto, context);
    expect(result.trackingNumber).toBe('KTX-ORD-44');
    expect(writes).toEqual(['order', 'tracking-number', 'parcel', 'hub', 'custody', 'tracking', 'invoice']);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [hub.id]);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it.each(['parcel', 'custody', 'invoice'] as const)('does not notify if %s fails', async (failure) => {
    const { service, sms } = setup(failure);
    await expect(service.createOfflineIntercityOrder(user, dto, context)).rejects.toThrow(`${failure} failed`);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('rejects the wrong active hub before creating an order', async () => {
    const { service, writes } = setup();
    await expect(service.createOfflineIntercityOrder(user, dto, { ...context, profileId: 99 })).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
