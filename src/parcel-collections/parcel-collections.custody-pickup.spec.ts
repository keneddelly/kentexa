import { ParcelCollectionsService } from './parcel-collections.service';
import { ParcelCollection, CollectionStatus } from './entities/parcel-collection.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('seller to local agent pickup custody', () => {
  const user = { id: 7, name: 'Agent' };
  const context = { userId: 7, profileId: 15, accountRoleId: 47,
    roleType: AccountRoleType.AGENT, workspaceId: null };
  const job = { id: 25, status: CollectionStatus.CLAIMED, agent: user,
    parcel: null, order: { id: 61, buyer: { phone: '255700000001' } }, city: 'Dar', pickupAddress: 'Market' };
  const parcel = { id: 88, status: ParcelStatus.COLLECTION_REQUESTED };

  function setup(override: { parcelRows?: { id: number; orderId: number }[]; status?: CollectionStatus; failTracking?: boolean } = {}) {
    const writes: string[] = [];
    const sms = { sendSms: jest.fn().mockResolvedValue(true) };
    const manager: any = {
      query: jest.fn().mockImplementation(async (sql: string) => sql.includes('"orderId"')
        ? (override.parcelRows ?? [{ id: parcel.id, orderId: job.order.id }]) : [{ id: 25 }]),
      getRepository: (entity: any) => {
        if (entity === ParcelCollection) return {
          findOne: async () => ({ ...job, status: override.status ?? job.status }),
          update: async () => { writes.push('collection'); },
        };
        if (entity === Parcel) return {
          findOne: async () => parcel,
          update: async () => { writes.push('parcel'); },
        };
        if (entity === ParcelCustodyEvent) return { insert: async () => { writes.push('custody'); } };
        if (entity === ParcelTracking) return { insert: async () => {
          if (override.failTracking) throw new Error('tracking write failed');
          writes.push('tracking');
        } };
        throw new Error('Unexpected repository');
      },
    };
    const service: any = Object.create(ParcelCollectionsService.prototype);
    service.collectionRepo = { findOne: jest.fn().mockResolvedValue(job) };
    service.agentRepo = { findOne: jest.fn().mockResolvedValue({ id: 15, status: AgentStatus.APPROVED, fullName: 'Agent' }) };
    service.smsService = sms;
    service.dataSource = { transaction: (fn: any) => fn(manager) };
    return { service, writes, sms, manager };
  }

  it('resolves a single parcel by order, then writes pickup and custody before notifying', async () => {
    const { service, writes, sms, manager } = setup();
    await service.confirmCollected(job.id, user, undefined, context);
    expect(writes).toEqual(['collection', 'parcel', 'custody', 'tracking']);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('"orderId"'), [job.order.id]);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it.each([{ rows: [] }, { rows: [{ id: 88, orderId: 61 }, { id: 89, orderId: 61 }] }])('rejects ambiguous or missing parcel rows', async ({ rows }) => {
    const { service, writes, sms } = setup({ parcelRows: rows });
    await expect(service.confirmCollected(job.id, user, undefined, context)).rejects.toThrow('exactly one linked parcel');
    expect(writes).toEqual([]);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('rejects a repeat under lock without changing custody', async () => {
    const { service, writes } = setup({ status: CollectionStatus.COLLECTED });
    await expect(service.confirmCollected(job.id, user, undefined, context)).rejects.toThrow('already picked up');
    expect(writes).toEqual([]);
  });

  it('refuses a parcel belonging to another order', async () => {
    const { service, writes } = setup({ parcelRows: [{ id: 88, orderId: 99 }] });
    await expect(service.confirmCollected(job.id, user, undefined, context)).rejects.toThrow('for its order');
    expect(writes).toEqual([]);
  });

  it('does not notify on a tracking write failure', async () => {
    const { service, sms } = setup({ failTracking: true });
    await expect(service.confirmCollected(job.id, user, undefined, context)).rejects.toThrow('tracking write failed');
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('requires the agent role to match its profile', async () => {
    const { service, writes } = setup();
    await expect(service.confirmCollected(job.id, user, undefined, { ...context, profileId: 19 })).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});

describe('collection request creates a pending parcel', () => {
  const order: any = { id: 61, trackingNumber: 'KTX-ORD-61', seller: { id: 3 },
    buyer: { id: 5 }, deliveryAddress: 'Mwanza, Tanzania', phone: '255700000001' };

  it('links the pending parcel and request in the same transaction', async () => {
    const writes: string[] = [];
    const manager: any = {
      query: jest.fn().mockImplementation(async (sql: string) => sql.includes('public.parcel') ? [] : [{ id: order.id }]),
      getRepository: (entity: any) => entity === Parcel ? {
        create: (x: any) => x,
        save: async (value: any) => { writes.push('parcel'); return { ...value, id: 88 }; },
      } : entity === ParcelCollection ? {
        create: (x: any) => x,
        save: async (value: any) => { writes.push('collection'); return { ...value, id: 25 }; },
      } : null,
    };
    const service: any = Object.create(ParcelCollectionsService.prototype);
    service.dataSource = { transaction: (fn: any) => fn(manager) };
    service.smsService = { sendSms: jest.fn() };
    const result = await service.createCollectionRequest(order, 'Market', 'Dar', false, 1500);
    expect(writes).toEqual(['parcel', 'collection']);
    expect(result.parcel.id).toBe(88);
    expect(result.parcel.status).toBe(ParcelStatus.COLLECTION_REQUESTED);
    expect(result.parcel.trackingNumber).toBe(order.trackingNumber);
  });
});
