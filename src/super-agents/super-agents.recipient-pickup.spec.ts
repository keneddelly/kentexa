import { scryptSync } from 'crypto';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Shipment } from '../shipments/entities/shipment.entity';
import { Order, OrderStatus, OrderPaymentMethod, OrderSource } from '../orders/entities/order.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { SuperAgent } from './entities/super-agent.entity';

describe('recipient-held pickup code', () => {
  const user: any = { id: 9, phone: '255700000009' };
  const context: any = { userId: 9, profileId: 6, accountRoleId: 17,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const salt = 'a'.repeat(32);
  const hash = `${salt}:${scryptSync('123456:255700000007', salt, 32).toString('hex')}`;

  function setup(changes: any = {}, failTracking = false) {
    const parcel: any = { id: 31, trackingNumber: 'KTX-31', status: ParcelStatus.AWAITING_BUYER,
      buyerRequestedDelivery: false, buyerPhone: '255700000007', destinationCity: 'Mwanza',
      destinationSuperAgent: { id: 6 }, shipment: { id: 3 }, order: null,
      pickupCodeHash: hash, pickupCodeExpiresAt: new Date(Date.now() + 60_000),
      pickupCodeAttempts: 0, ...changes };
    const writes: string[] = [];
    const repos = new Map<any, any>([
      [Parcel, { findOne: jest.fn(async () => parcel), increment: jest.fn(async () => { writes.push('agent-share'); }),
        update: jest.fn(async (_: any, value: any) => {
        writes.push('parcel'); Object.assign(parcel, value);
      }) }],
      [ParcelCustodyEvent, { findOne: jest.fn(async () => ({ eventKind: 'destination_hub_received',
        toCustodianType: 'super_agent', toCustodianId: 6 })),
        insert: jest.fn(async () => { writes.push('custody'); }) }],
      [Shipment, { update: jest.fn(async () => { writes.push('shipment'); }) }],
      [Order, { update: jest.fn(async () => { writes.push('order'); }) }],
      [SuperAgent, { increment: jest.fn(async () => { writes.push('cash-held'); }) }],
      [ParcelTracking, { insert: jest.fn(async () => {
        if (failTracking) throw Error('tracking unavailable'); writes.push('tracking');
      }) }],
    ]);
    const manager: any = { query: jest.fn(async (sql: string) => sql.includes('pickupCodeHash')
      ? [{ pickupCodeHash: parcel.pickupCodeHash, pickupCodeExpiresAt: parcel.pickupCodeExpiresAt,
        pickupCodeIssuedAt: parcel.pickupCodeIssuedAt, pickupCodeAttempts: parcel.pickupCodeAttempts }]
      : sql.includes('"codBalanceCollected"') ? [{ codBalanceCollected: false }] : []),
    getRepository: (entity: any) => repos.get(entity) };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.superAgentRepo = { findOne: jest.fn(async () => ({ id: 6, userId: 9, city: 'Mwanza', status: 'active' })) };
    service.parcelRepo = { findOne: jest.fn(async () => parcel) };
    service.paymentEvidence = { check: jest.fn(async () => ({ applicable: false, sufficient: true })) };
    service.smsService = { sendSms: jest.fn(async () => true) };
    service.invoicesService = { recordCodBalanceCollected: jest.fn(async () => ({})) };
    service.orderRelease = { releaseSellerProceeds: jest.fn(async (input: any) => {
      await input.completeInTransaction(manager);
      writes.push('release');
    }) };
    service.dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
    return { service, writes, repos, manager, parcel };
  }

  it('records external recipient contact, with no Order status or seller release write', async () => {
    const { service, writes, repos } = setup();
    await service.confirmRecipientPickup(user, 'KTX-31', '123456', context);
    expect(repos.get(ParcelCustodyEvent).insert).toHaveBeenCalledWith(expect.objectContaining({
      toCustodianType: 'recipient_contact', toCustodianId: null, actorAccountRoleId: 17,
    }));
    expect(writes).toEqual(['custody', 'parcel', 'shipment', 'tracking']);
  });

  it('lets an external recipient choose pickup by presenting their code at the hub', async () => {
    const { service, parcel, writes } = setup({ buyerRequestedDelivery: null });
    await service.confirmRecipientPickup(user, 'KTX-31', '123456', context);
    expect(parcel.buyerRequestedDelivery).toBe(false);
    expect(writes).toEqual(['custody', 'parcel', 'shipment', 'tracking']);
  });

  it('records physical Order delivery only after payment evidence and leaves seller release alone', async () => {
    const order = { id: 12, status: OrderStatus.READY_PICKUP,
      paymentMethod: OrderPaymentMethod.ONLINE, source: OrderSource.ONLINE, totalAmount: 100,
      codUpfrontAmount: null, escrowStatus: 'holding' };
    const { service, writes, repos } = setup({ order });
    service.paymentEvidence.check.mockResolvedValue({ applicable: true, sufficient: true });
    service.paymentEvidence.check.mockResolvedValueOnce({ applicable: true, sufficient: false });
    await expect(service.confirmRecipientPickup(user, 'KTX-31', '123456', context))
      .rejects.toThrow('payment evidence');
    expect(writes).toEqual([]);
    await service.confirmRecipientPickup(user, 'KTX-31', '123456', context);
    expect(repos.get(Order).update).toHaveBeenCalledWith(12,
      expect.objectContaining({ status: OrderStatus.DELIVERED, deliveredAt: expect.any(Date) }));
    expect(writes).toEqual(['custody', 'parcel', 'order', 'shipment', 'tracking']);
  });

  it('counts wrong codes without custody, and rejects expired codes', async () => {
    const wrong = setup();
    await expect(wrong.service.confirmRecipientPickup(user, 'KTX-31', '000000', context))
      .rejects.toThrow('Incorrect pickup code');
    expect(wrong.parcel.pickupCodeAttempts).toBe(1);
    expect(wrong.writes).toEqual(['parcel']);
    await expect(setup({ pickupCodeExpiresAt: new Date(0) }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('expired');
  });

  it('rejects a code if the recipient phone changed after issue', async () => {
    const changed = setup({ buyerPhone: '255700000008' });
    await expect(changed.service.confirmRecipientPickup(user, 'KTX-31', '123456', context))
      .rejects.toThrow('Incorrect pickup code');
    expect(changed.writes).toEqual(['parcel']);
  });

  it('rejects COD, another hub, and tracking failure', async () => {
    await expect(setup({ order: { id: 12, status: OrderStatus.READY_PICKUP, paymentMethod: 'cod' } }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('COD pickup');
    await expect(setup({ destinationSuperAgent: { id: 8 } }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('receiving hub');
    await expect(setup({}, true).service.confirmRecipientPickup(user, 'KTX-31', '123456', context))
      .rejects.toThrow('tracking unavailable');
  });

  it('joins COD cash, custody, and seller routing through the canonical release callback', async () => {
    const order = { id: 12, status: OrderStatus.READY_PICKUP, paymentMethod: OrderPaymentMethod.COD,
      source: OrderSource.ONLINE, sellerAmount: 6000, codRemainingBalance: 5000,
      codBalanceCollected: false, escrowStatus: 'holding', totalAmount: 10000, codUpfrontAmount: 5000 };
    const { service, writes, repos } = setup({ order });
    await service.confirmCodRecipientPickup(user, 'KTX-31', '123456', 5000, context);
    expect(service.orderRelease.releaseSellerProceeds).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 12, source: 'COD_DELIVERY', amount: expect.any(Number),
      orderUpdate: expect.objectContaining({ codBalanceCollected: true, status: OrderStatus.DELIVERED }),
      completeInTransaction: expect.any(Function),
    }));
    expect(repos.get(SuperAgent).increment).toHaveBeenCalledWith({ id: 6 }, 'codCashHeld', 5000);
    expect(service.invoicesService.recordCodBalanceCollected).toHaveBeenCalledWith(order, 10000, expect.anything());
    expect(writes).toEqual(['custody', 'parcel', 'order', 'shipment', 'agent-share', 'cash-held', 'tracking', 'release']);
  });

  it('never writes custody or cash if the canonical COD release is blocked', async () => {
    const order = { id: 12, status: OrderStatus.READY_PICKUP, paymentMethod: OrderPaymentMethod.COD,
      source: OrderSource.ONLINE, sellerAmount: 6000, codRemainingBalance: 5000,
      codBalanceCollected: false, escrowStatus: 'holding' };
    const { service, writes } = setup({ order });
    service.orderRelease.releaseSellerProceeds.mockRejectedValueOnce(Error('routing blocked'));
    await expect(service.confirmCodRecipientPickup(user, 'KTX-31', '123456', 5000, context))
      .rejects.toThrow('routing blocked');
    expect(writes).toEqual([]);
  });

  it('propagates receipt failure from the COD transaction instead of reporting a completed pickup', async () => {
    const order = { id: 12, status: OrderStatus.READY_PICKUP, paymentMethod: OrderPaymentMethod.COD,
      source: OrderSource.ONLINE, sellerAmount: 6000, codRemainingBalance: 5000,
      codBalanceCollected: false, escrowStatus: 'holding', totalAmount: 10000 };
    const { service } = setup({ order });
    service.invoicesService.recordCodBalanceCollected.mockRejectedValueOnce(Error('receipt unavailable'));
    await expect(service.confirmCodRecipientPickup(user, 'KTX-31', '123456', 5000, context))
      .rejects.toThrow('receipt unavailable');
  });

  it('does not let the generic status endpoint bypass an undecided recipient handover', async () => {
    const { service } = setup({ buyerRequestedDelivery: null });
    await expect(service.updateParcelStatus(user, 'KTX-31', {
      status: ParcelStatus.DELIVERED, city: 'Mwanza',
    }, context)).rejects.toThrow('Recipient choice or verified hub pickup');
  });

  it('sends the code only to the parcel recipient phone', async () => {
    const { service } = setup({ pickupCodeIssuedAt: null });
    const result = await service.issueRecipientPickupCode(user, 'KTX-31', context);
    expect(result).not.toHaveProperty('code');
    expect(service.smsService.sendSms).toHaveBeenCalledWith('255700000007',
      expect.stringContaining('KTX-31'), true);
  });

  it('invalidates the challenge if SMS delivery fails', async () => {
    const { service } = setup({ pickupCodeIssuedAt: null });
    const execute = jest.fn(async () => ({}));
    const where = jest.fn(() => ({ execute }));
    const set = jest.fn(() => ({ where }));
    service.parcelRepo.createQueryBuilder = () => ({ update: () => ({ set }) });
    service.smsService.sendSms.mockResolvedValue(false);
    await expect(service.issueRecipientPickupCode(user, 'KTX-31', context))
      .rejects.toThrow('could not be sent');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ pickupCodeHash: null,
      pickupCodeExpiresAt: null, pickupCodeIssuedAt: null }));
    expect(execute).toHaveBeenCalled();
  });
});
