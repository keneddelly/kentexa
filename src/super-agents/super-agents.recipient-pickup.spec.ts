import { scryptSync } from 'crypto';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Shipment } from '../shipments/entities/shipment.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

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
      [Parcel, { findOne: jest.fn(async () => parcel), update: jest.fn(async (_: any, value: any) => {
        writes.push('parcel'); Object.assign(parcel, value);
      }) }],
      [ParcelCustodyEvent, { findOne: jest.fn(async () => ({ eventKind: 'destination_hub_received',
        toCustodianType: 'super_agent', toCustodianId: 6 })),
        insert: jest.fn(async () => { writes.push('custody'); }) }],
      [Shipment, { update: jest.fn(async () => { writes.push('shipment'); }) }],
      [ParcelTracking, { insert: jest.fn(async () => {
        if (failTracking) throw Error('tracking unavailable'); writes.push('tracking');
      }) }],
    ]);
    const manager: any = { query: jest.fn(async (sql: string) => sql.includes('pickupCodeHash')
      ? [{ pickupCodeHash: parcel.pickupCodeHash, pickupCodeExpiresAt: parcel.pickupCodeExpiresAt,
        pickupCodeIssuedAt: parcel.pickupCodeIssuedAt, pickupCodeAttempts: parcel.pickupCodeAttempts }] : []),
    getRepository: (entity: any) => repos.get(entity) };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.superAgentRepo = { findOne: jest.fn(async () => ({ id: 6, userId: 9, city: 'Mwanza', status: 'active' })) };
    service.parcelRepo = { findOne: jest.fn(async () => parcel) };
    service.paymentEvidence = { check: jest.fn(async () => ({ applicable: false, sufficient: true })) };
    service.smsService = { sendSms: jest.fn(async () => true) };
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

  it('counts wrong codes without custody, and rejects expired codes', async () => {
    const wrong = setup();
    await expect(wrong.service.confirmRecipientPickup(user, 'KTX-31', '000000', context))
      .rejects.toThrow('Incorrect pickup code');
    expect(wrong.parcel.pickupCodeAttempts).toBe(1);
    expect(wrong.writes).toEqual(['parcel']);
    await expect(setup({ pickupCodeExpiresAt: new Date(0) }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('expired');
  });

  it('rejects COD, another hub, and tracking failure', async () => {
    await expect(setup({ order: { id: 12, paymentMethod: 'cod' } }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('COD pickup');
    await expect(setup({ destinationSuperAgent: { id: 8 } }).service
      .confirmRecipientPickup(user, 'KTX-31', '123456', context)).rejects.toThrow('receiving hub');
    await expect(setup({}, true).service.confirmRecipientPickup(user, 'KTX-31', '123456', context))
      .rejects.toThrow('tracking unavailable');
  });

  it('sends the code only to the parcel recipient phone', async () => {
    const { service } = setup({ pickupCodeIssuedAt: null });
    const result = await service.issueRecipientPickupCode(user, 'KTX-31', context);
    expect(result).not.toHaveProperty('code');
    expect(service.smsService.sendSms).toHaveBeenCalledWith('255700000007',
      expect.stringContaining('KTX-31'), true);
  });
});
