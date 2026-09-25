import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { ParcelCollectionsService } from './parcel-collections.service';
import { ParcelCollection, CollectionStatus } from './entities/parcel-collection.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('local agent pickup: PostgreSQL custody boundary', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const user = { id: 7, name: 'Agent' };
  const context = { userId: 7, profileId: 15, accountRoleId: 47,
    roleType: AccountRoleType.AGENT, workspaceId: null };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public."order" (id integer PRIMARY KEY)');
    await db.query('INSERT INTO public."order" (id) VALUES (61),(62)');
    await db.query('CREATE TABLE public.parcel (id serial PRIMARY KEY, "orderId" integer, status varchar NOT NULL, "trackingNumber" varchar, "originCity" varchar, "destinationCity" varchar)');
    await db.query('CREATE TABLE public.parcel_collection (id serial PRIMARY KEY, "orderId" integer NOT NULL, "agentId" integer, "parcelId" integer, status varchar NOT NULL, "collectedAt" timestamp, notes text)');
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar)');
    await db.query('INSERT INTO public.parcel (id,"orderId",status) VALUES (88,61,$1)', [ParcelStatus.COLLECTION_REQUESTED]);
    await db.query("SELECT setval('public.parcel_id_seq', 88)");
    await db.query('INSERT INTO public.parcel_collection (id,"orderId","agentId",status) VALUES (25,61,7,$1)', [CollectionStatus.CLAIMED]);
    await db.query("SELECT setval('public.parcel_collection_id_seq', 25)");
    const runner = db.createQueryRunner();
    try { await new AddParcelCustodyEvent1788278400000().up(runner); } finally { await runner.release(); }
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failTracking = false) {
    const job = { id: 25, status: CollectionStatus.CLAIMED,
      agent: user, parcel: null, order: { id: 61, buyer: { phone: '255700000001' } },
      city: 'Dar', pickupAddress: 'Market' };
    const service: any = Object.create(ParcelCollectionsService.prototype);
    service.collectionRepo = { findOne: async () => job };
    service.agentRepo = { findOne: async () => ({ id: 15, status: AgentStatus.APPROVED, fullName: 'Agent' }) };
    service.smsService = { sendSms: async () => true };
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === ParcelCollection) return {
          create: (v: any) => v,
          save: async (v: any) => (await manager.query('INSERT INTO public.parcel_collection ("orderId","parcelId",status) VALUES ($1,$2,$3) RETURNING id', [v.order.id,v.parcel.id,v.status]))[0],
          findOne: async () => {
            const [current] = await manager.query('SELECT status,"parcelId" FROM public.parcel_collection WHERE id=25');
            return current ? { ...job, status: current.status, parcel: current.parcelId ? { id: current.parcelId } : null } : null;
          },
          update: async (_id: number, value: any) => manager.query('UPDATE public.parcel_collection SET status=$1,"parcelId"=$2,"collectedAt"=$3 WHERE id=25',
            [value.status,value.parcel.id,value.collectedAt]),
        };
        if (entity === Parcel) return {
          create: (v: any) => v,
          save: async (v: any) => (await manager.query('INSERT INTO public.parcel ("orderId",status,"trackingNumber","originCity","destinationCity") VALUES ($1,$2,$3,$4,$5) RETURNING id,status,"trackingNumber"', [v.order.id,v.status,v.trackingNumber,v.originCity,v.destinationCity]))[0],
          findOne: async () => {
            const [row] = await manager.query('SELECT id,status FROM public.parcel WHERE id=88');
            return row ?? null;
          },
          update: async (_id: number, value: any) => manager.query('UPDATE public.parcel SET status=$1 WHERE id=88', [value.status]),
        };
        if (entity === ParcelCustodyEvent) return { insert: async (v: any) => manager.query(`
          INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType","evidenceRef")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [v.parcelId,v.eventKind,v.operationKey,v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,v.actorRoleType,v.evidenceRef]) };
        if (entity === ParcelTracking) return { insert: async (v: any) => {
          if (failTracking) throw new Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)', [v.parcel.id,v.status]);
        } };
        throw new Error('Unexpected repository');
      };
      return fn(proxy);
    }) };
    return service;
  }

  it('rolls collection, parcel and custody back if tracking insert fails', async () => {
    await expect(build(true).confirmCollected(25, user, undefined, context)).rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status FROM public.parcel_collection WHERE id=25'))[0].status).toBe(CollectionStatus.CLAIMED);
    expect((await db.query('SELECT status FROM public.parcel WHERE id=88'))[0].status).toBe(ParcelStatus.COLLECTION_REQUESTED);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(0);
  });

  it('commits a pickup once and rejects a repeated call', async () => {
    await build().confirmCollected(25, user, undefined, context);
    expect((await db.query('SELECT status FROM public.parcel_collection WHERE id=25'))[0].status).toBe(CollectionStatus.COLLECTED);
    expect((await db.query('SELECT status FROM public.parcel WHERE id=88'))[0].status).toBe(ParcelStatus.COLLECTED_BY_AGENT);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(1);
    await expect(build().confirmCollected(25, user, undefined, context)).rejects.toThrow('already picked up');
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
  });

  it('creates a pending parcel with its new collection request in one commit', async () => {
    const order: any = { id: 62, seller: { id: 3 }, buyer: { id: 5 },
      trackingNumber: 'KTX-ORD-62', deliveryAddress: 'Mwanza, Tanzania' };
    await build().createCollectionRequest(order, 'Market', 'Dar', false, 1500);
    const parcels = await db.query('SELECT id,status FROM public.parcel WHERE "orderId"=62');
    const jobs = await db.query('SELECT "parcelId" FROM public.parcel_collection WHERE "orderId"=62');
    expect(parcels).toHaveLength(1);
    expect(parcels[0].status).toBe(ParcelStatus.COLLECTION_REQUESTED);
    expect(jobs[0].parcelId).toBe(parcels[0].id);
  });
});
