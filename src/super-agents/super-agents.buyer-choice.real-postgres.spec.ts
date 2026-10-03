import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('buyer choice PostgreSQL transaction', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const buyer: any = { id: 7, phone: '255700000007', name: 'Recipient' };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, status varchar NOT NULL,
      "buyerPhone" varchar, "buyerRequestedDelivery" boolean, "destinationCity" varchar,
      "destinationSuperAgentId" integer, "localAgentId" varchar,
      "localAgentName" varchar, "claimedAt" timestamptz)`);
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar)');
    await db.query(`INSERT INTO public.parcel (id,status,"buyerPhone","destinationCity","destinationSuperAgentId",
      "localAgentId","localAgentName","claimedAt")
      VALUES (31,$1,$2,'Mwanza',6,'15','Previous claim',now())`, [ParcelStatus.AWAITING_BUYER, buyer.phone]);
    const runner = db.createQueryRunner();
    try { await new AddParcelCustodyEvent1788278400000().up(runner); } finally { await runner.release(); }
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_hub_received','destination-hub-received:6','super_agent',6,
        'account_role',9,17,'super_agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failTracking = false): any {
    const result: any = Object.create(SuperAgentsService.prototype);
    result.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any) => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            return { ...row, order: null, destinationSuperAgent: { id: row.destinationSuperAgentId } };
          },
          update: (_id: number, value: any) => manager.query(
            `UPDATE public.parcel SET "buyerRequestedDelivery"=$1,"localAgentId"=$2,
             "localAgentName"=$3,"claimedAt"=$4 WHERE id=31`,
            [value.buyerRequestedDelivery, value.localAgentId, value.localAgentName, value.claimedAt]),
        };
        if (entity === ParcelCustodyEvent) return { findOne: async () =>
          (await manager.query(`SELECT "toCustodianType","toCustodianId" FROM public.parcel_custody_event
            WHERE "parcelId"=31 AND "eventKind"='destination_hub_received'`))[0] || null };
        if (entity === ParcelTracking) return { insert: (value: any) => {
          if (failTracking) throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES (31,$1)', [value.status]);
        } };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return result;
  }

  it('rolls back choice if tracking fails, then serializes duplicate pickup choices', async () => {
    await expect(service(true).buyerSelfPickup(buyer, 'KTX-31')).rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT "buyerRequestedDelivery" FROM public.parcel WHERE id=31'))[0].buyerRequestedDelivery).toBeNull();
    expect((await db.query('SELECT "localAgentId" FROM public.parcel WHERE id=31'))[0].localAgentId).toBe('15');
    const attempts = await Promise.allSettled([
      service().buyerSelfPickup(buyer, 'KTX-31'),
      service().buyerSelfPickup(buyer, 'KTX-31'),
    ]);
    expect(attempts.map(a => a.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await db.query('SELECT status,"buyerRequestedDelivery" FROM public.parcel WHERE id=31'))[0])
      .toMatchObject({ status: ParcelStatus.AWAITING_BUYER, buyerRequestedDelivery: false });
    expect((await db.query('SELECT "localAgentId","localAgentName","claimedAt" FROM public.parcel WHERE id=31'))[0])
      .toMatchObject({ localAgentId: null, localAgentName: null, claimedAt: null });
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(1);
  });
});
