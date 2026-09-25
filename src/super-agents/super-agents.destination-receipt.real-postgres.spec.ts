import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('destination hub receipt: PostgreSQL custody boundary', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const user: any = { id: 9, phone: '255700000009' };
  const hub: any = { id: 6, city: 'Mwanza', businessName: 'Mwanza Hub', phone: user.phone };
  const context: any = { userId: 9, profileId: 6, accountRoleId: 17,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const parcel: any = { id: 31, destinationCity: 'Mwanza',
    order: { id: 12 }, destinationSuperAgent: null, superAgent: { id: 3 } };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public."order" (id integer PRIMARY KEY, status varchar NOT NULL)');
    await db.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, status varchar NOT NULL, "destinationSuperAgentId" integer, "destinationCity" varchar NOT NULL, "orderId" integer, "arrivedAtHubTime" timestamp)');
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer NOT NULL, status varchar NOT NULL)');
    await db.query('INSERT INTO public."order" (id,status) VALUES (12,$1)', [OrderStatus.PAID]);
    await db.query('INSERT INTO public.parcel (id,status,"destinationCity","orderId") VALUES (31,$1,$2,12)',
      [ParcelStatus.IN_TRANSIT, 'Mwanza']);
    const runner = db.createQueryRunner();
    try { await new AddParcelCustodyEvent1788278400000().up(runner); } finally { await runner.release(); }
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failTracking = false): any {
    let trackingCount = 0;
    const service: any = Object.create(SuperAgentsService.prototype);
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await db.query('SELECT status,"destinationSuperAgentId","arrivedAtHubTime" FROM public.parcel WHERE id=31');
            return { ...parcel, ...row, destinationSuperAgent: row.destinationSuperAgentId ? hub : null };
          },
          update: (_id: number, value: any) => manager.query('UPDATE public.parcel SET status=$1,"arrivedAtHubTime"=$2,"destinationSuperAgentId"=COALESCE($3,"destinationSuperAgentId") WHERE id=31',
            [value.status,value.arrivedAtHubTime,value.destinationSuperAgent?.id || null]),
        };
        if (entity === ParcelCustodyEvent) return {
          findOne: async () => (await db.query('SELECT "toCustodianId" FROM public.parcel_custody_event WHERE "parcelId"=31 AND "eventKind"=$1 LIMIT 1', ['destination_hub_received']))[0] || null,
          insert: (v: any) => manager.query(`INSERT INTO public.parcel_custody_event
            ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId","toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType","hubId")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [v.parcelId,v.eventKind,v.operationKey,v.fromCustodianType,v.fromCustodianId,v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,v.actorRoleType,v.hubId]),
        };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          trackingCount += 1;
          if (failTracking && trackingCount === 1) throw new Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)', [v.parcel.id,v.status]);
        } };
        if (entity === Order) return { update: (_id: number, value: any) =>
          manager.query('UPDATE public."order" SET status=$1 WHERE id=12', [value.status]) };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return service;
  }

  it('rolls back status, hub binding and custody when tracking fails', async () => {
    await expect(build(true).recordDestinationHubReceipt(parcel, hub, user, context,
      ParcelStatus.ARRIVED_AT_HUB, 'Arrived')).rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status,"destinationSuperAgentId" FROM public.parcel WHERE id=31'))[0])
      .toMatchObject({ status: ParcelStatus.IN_TRANSIT, destinationSuperAgentId: null });
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(0);
  });

  it('records one receiving-hub event, then lets the buyer decision open once', async () => {
    await build().recordDestinationHubReceipt(parcel, hub, user, context, ParcelStatus.ARRIVED_AT_HUB, 'Arrived');
    expect((await db.query('SELECT status,"destinationSuperAgentId" FROM public.parcel WHERE id=31'))[0])
      .toMatchObject({ status: ParcelStatus.ARRIVED_AT_HUB, destinationSuperAgentId: 6 });
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    await expect(build().recordDestinationHubReceipt(parcel, hub, user, context,
      ParcelStatus.ARRIVED_AT_HUB, 'Again')).rejects.toThrow('already received');
    await expect(build(true).recordDestinationHubReceipt(parcel, hub, user, context,
      ParcelStatus.AWAITING_BUYER, 'Choose pickup or delivery')).rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.ARRIVED_AT_HUB);
    expect((await db.query('SELECT status FROM public."order" WHERE id=12'))[0].status).toBe(OrderStatus.PAID);
    await build().recordDestinationHubReceipt(parcel, hub, user, context,
      ParcelStatus.AWAITING_BUYER, 'Choose pickup or delivery');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.AWAITING_BUYER);
    expect((await db.query('SELECT status FROM public."order" WHERE id=12'))[0].status).toBe(OrderStatus.READY_PICKUP);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_tracking'))[0].n).toBe(2);
  });
});
