import { ParcelCollectionsService } from './parcel-collections.service';
import { CollectionStatus, ParcelCollection } from './entities/parcel-collection.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

describe('collection hub handover', () => {
  const agent: any = { id: 7, name: 'Local agent' };
  const hubUser: any = { id: 9, phone: '255700000009' };
  const context: any = { userId: 9, profileId: 2, accountRoleId: 13,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const hub: any = { id: 2, userId: 9, status: SuperAgentStatus.ACTIVE,
    workspaceId: null, city: 'Dar', businessName: 'Dar Hub' };
  const order: any = { id: 31, buyer: null, seller: null };
  const collection: any = { id: 5, status: CollectionStatus.COLLECTED,
    handedOverAt: null, agent, parcel: { id: 8 }, order, city: 'Dar', collectionFee: 1500 };
  const parcel: any = { id: 8, status: ParcelStatus.COLLECTED_BY_AGENT, order,
    superAgent: null };
  let changes: string[];
  let service: ParcelCollectionsService;

  beforeEach(() => {
    changes = [];
    collection.handedOverAt = null;
    collection.status = CollectionStatus.COLLECTED;
    parcel.status = ParcelStatus.COLLECTED_BY_AGENT;
    const repositories = new Map<any, any>([
      [ParcelCollection, { findOne: jest.fn(async () => collection),
        update: jest.fn(async (_id, value) => { changes.push('collection'); Object.assign(collection, value); }) }],
      [Parcel, { findOne: jest.fn(async () => parcel),
        update: jest.fn(async (_id, value) => { changes.push('parcel'); Object.assign(parcel, value); }) }],
      [ParcelCustodyEvent, { findOne: jest.fn(async () => ({ toCustodianType: 'local_agent', toCustodianId: 4 })),
        insert: jest.fn(async () => { changes.push('custody'); }) }],
      [Agent, { findOne: jest.fn(async () => ({ id: 4 })),
        increment: jest.fn(async () => { changes.push('earnings'); }) }],
      [ParcelTracking, { insert: jest.fn(async () => { changes.push('tracking'); }) }],
      [SuperAgent, { findOne: jest.fn(async () => hub) }],
    ]);
    const manager: any = { query: jest.fn(async () => [{ id: 1 }]),
      getRepository: (entity: any) => repositories.get(entity) };
    service = Object.create(ParcelCollectionsService.prototype);
    (service as any).collectionRepo = repositories.get(ParcelCollection);
    (service as any).smsService = { sendSms: jest.fn(async () => true) };
    (service as any).dataSource = { transaction: async (fn: any) => fn(manager),
      getRepository: manager.getRepository };
  });

  it('agent request leaves custody, status and earnings untouched', async () => {
    await service.confirmHandedOver(5, agent);
    expect(collection.handedOverAt).toBeInstanceOf(Date);
    expect(collection.status).toBe(CollectionStatus.COLLECTED);
    expect(parcel.status).toBe(ParcelStatus.COLLECTED_BY_AGENT);
    expect(changes).toEqual(['collection']);
  });

  it('receiving hub records custody and credits the agent only on acceptance', async () => {
    collection.handedOverAt = new Date();
    await service.acceptHubHandover(5, hubUser, context);
    expect(changes).toEqual(['custody', 'parcel', 'collection', 'earnings', 'earnings', 'earnings', 'earnings', 'tracking']);
    expect(parcel.status).toBe(ParcelStatus.RECEIVED_AT_HUB);
    expect(parcel.superAgent).toBe(hub);
    expect(collection.status).toBe(CollectionStatus.HANDED_OVER);
    await expect(service.acceptHubHandover(5, hubUser, context)).rejects.toThrow('No pending handover');
  });

  it('rejects a hub in a different city before writing evidence or earnings', async () => {
    collection.handedOverAt = new Date();
    collection.city = 'Mwanza';
    await expect(service.acceptHubHandover(5, hubUser, context)).rejects.toThrow('different city');
    expect(changes).toEqual([]);
    collection.city = 'Dar';
  });
});
