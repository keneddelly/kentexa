import { NotFoundException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { ParcelStatus } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';

const FUTURE = new Date(Date.now() + 5 * 60_000);
const PAST = new Date(Date.now() - 5 * 60_000);
const HUB_ORIGIN = { id: 1, businessName: 'Stage3KR Kariakoo Hub', address: 'Kariakoo' };
const HUB_DEST = { id: 2, businessName: 'Stage3KR Mbagala Hub', address: 'Mbagala' };

function parcel(over: any = {}): any {
  return {
    id: 31, trackingNumber: 'KTX-ORD-3', status: ParcelStatus.RECEIVED_AT_HUB,
    buyerPhone: '+255700000031', buyerRequestedDelivery: null,
    destinationSuperAgent: HUB_DEST, localAgentName: null, agreedDeliveryFee: null,
    deliveryAddress: 'Mbagala', agentDeliveryCodeHash: null, agentDeliveryCodeExpiresAt: null,
    pickupCodeHash: null, pickupCodeExpiresAt: null,
    order: { paymentMethod: 'cod', codBalanceCollected: false, codRemainingBalance: '50000.00', buyer: null },
    ...over,
  };
}

function service(p: any, events: { latest?: any; receipt?: any } = {}) {
  const instance: any = Object.create(SuperAgentsService.prototype);
  instance.parcelRepo = { findOne: async () => p };
  instance.superAgentRepo = { findOne: async ({ where }: any) => [HUB_ORIGIN, HUB_DEST].find(h => h.id === where.id) ?? null };
  instance.agentRepo = { findOne: async ({ where }: any) => (where.id === 1 ? { id: 1, fullName: 'Stage3KR Delivery Agent' } : null) };
  instance.dataSource = {
    getRepository: (entity: any) => {
      if (entity !== ParcelCustodyEvent) throw new Error('unexpected repository');
      return { findOne: async ({ where }: any) => (where.eventKind ? events.receipt ?? null : events.latest ?? null) };
    },
  };
  return instance as SuperAgentsService;
}

const viewer: any = { id: 1, phone: '+255700000031' };
const originReceipt = { eventKind: 'origin_hub_received', toCustodianType: 'super_agent', toCustodianId: 1, recordedAt: new Date() };
const destReceipt = { eventKind: 'destination_hub_received', toCustodianType: 'super_agent', toCustodianId: 2, recordedAt: new Date() };

describe('recipient journey projection (read-only, mirrors the existing write paths)', () => {
  it('KTX-ORD-3 shape: at the origin hub shows current custody and offers NO recipient action', async () => {
    const j: any = await service(parcel(), { latest: originReceipt }).getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(j).toMatchObject({ isRecipient: true, stage: 'at_origin_hub', status: 'received_at_hub',
      custody: { kind: 'origin_hub_received', holderType: 'super_agent', holderName: 'Stage3KR Kariakoo Hub' },
      actions: { chooseMethod: false }, cod: { amountDue: 50000 } });
    expect(j.delivery).toBeNull();
    expect(j.recipientCode).toEqual({ agentDeliveryPending: false, pickupPending: false });
  });

  it('a non-recipient learns nothing beyond the tracking number', async () => {
    const j = await service(parcel(), { latest: originReceipt })
      .getRecipientJourney({ id: 99, phone: '+255711111111' } as any, 'KTX-ORD-3');
    expect(j).toEqual({ trackingNumber: 'KTX-ORD-3', isRecipient: false });
  });

  it('unknown tracking number is a 404', async () => {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.parcelRepo = { findOne: async () => null };
    await expect(instance.getRecipientJourney(viewer, 'KTX-NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recognises the recipient across 0-prefixed and +255 forms, or by order buyer', async () => {
    const a: any = await service(parcel({ buyerPhone: '0700000031' }), { latest: originReceipt })
      .getRecipientJourney({ id: 5, phone: '+255700000031' } as any, 'KTX-ORD-3');
    expect(a.isRecipient).toBe(true);
    const b: any = await service(parcel({ buyerPhone: '0799999999', order: { ...parcel().order, buyer: { id: 5 } } }), { latest: originReceipt })
      .getRecipientJourney({ id: 5, phone: null } as any, 'KTX-ORD-3');
    expect(b.isRecipient).toBe(true);
  });

  it('dispatched / in transit never offers the choice', async () => {
    for (const status of [ParcelStatus.DISPATCHED, ParcelStatus.IN_TRANSIT]) {
      const j: any = await service(parcel({ status }), { latest: originReceipt }).getRecipientJourney(viewer, 'KTX-ORD-3');
      expect(j).toMatchObject({ stage: 'in_transit', actions: { chooseMethod: false } });
    }
  });

  it('arrival without the destination hub custody receipt does not offer the choice', async () => {
    const j: any = await service(parcel({ status: ParcelStatus.ARRIVED_AT_HUB }), { latest: originReceipt })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(j).toMatchObject({ stage: 'arriving', actions: { chooseMethod: false } });
    const wrongHub: any = await service(parcel({ status: ParcelStatus.ARRIVED_AT_HUB }),
      { latest: destReceipt, receipt: { ...destReceipt, toCustodianId: 1 } }).getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(wrongHub.actions.chooseMethod).toBe(false);
  });

  it('destination hub receipt + no choice yet reveals exactly the choose-method action (both arrival statuses)', async () => {
    for (const status of [ParcelStatus.ARRIVED_AT_HUB, ParcelStatus.AWAITING_BUYER]) {
      const j: any = await service(parcel({ status }), { latest: destReceipt, receipt: destReceipt })
        .getRecipientJourney(viewer, 'KTX-ORD-3');
      expect(j).toMatchObject({ stage: 'choose_method', actions: { chooseMethod: true },
        custody: { kind: 'destination_hub_received', holderName: 'Stage3KR Mbagala Hub' },
        destinationHub: { name: 'Stage3KR Mbagala Hub' } });
    }
  });

  it('after the choice the action disappears and the chosen path is shown', async () => {
    const requested: any = await service(parcel({ status: ParcelStatus.ARRIVED_AT_HUB, buyerRequestedDelivery: true,
      localAgentName: 'Stage3KR Delivery Agent', agreedDeliveryFee: '2000.00', deliveryAddress: 'Mbagala Rangi Tatu' }),
      { latest: destReceipt, receipt: destReceipt }).getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(requested).toMatchObject({ stage: 'delivery_requested', actions: { chooseMethod: false },
      delivery: { agentName: 'Stage3KR Delivery Agent', fee: 2000, address: 'Mbagala Rangi Tatu' } });
    const pickup: any = await service(parcel({ status: ParcelStatus.ARRIVED_AT_HUB, buyerRequestedDelivery: false,
      pickupCodeHash: 'h', pickupCodeExpiresAt: FUTURE }), { latest: destReceipt, receipt: destReceipt })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(pickup).toMatchObject({ stage: 'pickup_planned', actions: { chooseMethod: false },
      recipientCode: { pickupPending: true, agentDeliveryPending: false } });
  });

  it('out for delivery: current custodian is the Agent PROFILE; the SMS-code notice needs a live challenge; no hash leaks', async () => {
    const agentCustody = { eventKind: 'destination_agent_received', toCustodianType: 'local_agent', toCustodianId: 1, recordedAt: new Date() };
    const live: any = await service(parcel({ status: ParcelStatus.OUT_FOR_DELIVERY, buyerRequestedDelivery: true,
      localAgentName: 'Stage3KR Delivery Agent', agentDeliveryCodeHash: 'SECRET-HASH', agentDeliveryCodeExpiresAt: FUTURE }),
      { latest: agentCustody }).getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(live).toMatchObject({ stage: 'out_for_delivery', actions: { chooseMethod: false },
      custody: { holderType: 'local_agent', holderName: 'Stage3KR Delivery Agent' },
      recipientCode: { agentDeliveryPending: true }, cod: { amountDue: 50000 } });
    expect(JSON.stringify(live)).not.toContain('SECRET-HASH');
    const expired: any = await service(parcel({ status: ParcelStatus.OUT_FOR_DELIVERY, buyerRequestedDelivery: true,
      agentDeliveryCodeHash: 'SECRET-HASH', agentDeliveryCodeExpiresAt: PAST }), { latest: agentCustody })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(expired.recipientCode.agentDeliveryPending).toBe(false);
  });

  it('delivered / collected are final: no actions, no outstanding COD amount', async () => {
    const done = { ...parcel().order, codBalanceCollected: true };
    const delivered: any = await service(parcel({ status: ParcelStatus.DELIVERED, buyerRequestedDelivery: true, order: done }),
      { latest: { eventKind: 'recipient_agent_delivery', toCustodianType: 'recipient_contact', toCustodianId: null, recordedAt: new Date() } })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(delivered).toMatchObject({ stage: 'delivered', actions: { chooseMethod: false }, cod: null });
    const notCollectedYet: any = await service(parcel({ status: ParcelStatus.DELIVERED }), { latest: originReceipt })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(notCollectedYet.cod).toBeNull();
    const collected: any = await service(parcel({ status: ParcelStatus.SELF_PICKUP, buyerRequestedDelivery: false }), { latest: originReceipt })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(collected).toMatchObject({ stage: 'collected', actions: { chooseMethod: false } });
  });

  it('a non-COD parcel shows no cash amount', async () => {
    const j: any = await service(parcel({ order: { ...parcel().order, paymentMethod: 'online' } }), { latest: originReceipt })
      .getRecipientJourney(viewer, 'KTX-ORD-3');
    expect(j.cod).toBeNull();
  });

  it('"my parcels" finds a counter-typed 0-prefixed number from a +255 profile phone (and vice versa)', async () => {
    const seen: any[] = [];
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.parcelRepo = { find: async (opts: any) => { seen.push(opts.where.buyerPhone); return []; } };
    for (const phone of ['+255700000031', '0700000031', '255700000031', ' 0700 000 031 ']) {
      await instance.getBuyerParcels(phone);
    }
    for (const q of seen) {
      expect([...q.value].sort()).toEqual(['+255700000031', '0700000031', '255700000031']);
    }
    expect(seen).toHaveLength(4);
  });

  it('"my parcels" never matches on an empty phone and keeps unrecognised formats exact', async () => {
    const seen: any[] = [];
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.parcelRepo = { find: async (opts: any) => { seen.push(opts.where.buyerPhone); return []; } };
    expect(await instance.getBuyerParcels('')).toEqual([]);
    expect(seen).toHaveLength(0);
    await instance.getBuyerParcels('+254712345678');
    expect([...seen[0].value]).toEqual(['+254712345678']);
  });

  it('is read-only: the service exposes no write for this projection', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'super-agents.service.ts'), 'utf8');
    const start = src.indexOf('async getRecipientJourney');
    const body = src.slice(start, src.indexOf('private async chooseDestinationMethod', start) > start
      ? src.indexOf('private async chooseDestinationMethod', start) : start + 4000);
    expect(body).not.toMatch(/\.(save|insert|update|delete|increment)\(|\.query\(/);
  });
});
