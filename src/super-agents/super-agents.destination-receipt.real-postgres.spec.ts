import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { TransportAssignment, AssignmentStatus } from '../transport/entities/transport-assignment.entity';
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
    await db.query('CREATE TABLE public.transport_assignment (id integer PRIMARY KEY, "parcelRefId" integer, "providerId" integer, status varchar, "toCity" varchar)');
    await db.query('INSERT INTO public."order" (id,status) VALUES (12,$1)', [OrderStatus.PAID]);
    await db.query('INSERT INTO public.parcel (id,status,"destinationCity","orderId") VALUES (31,$1,$2,12)',
      [ParcelStatus.IN_TRANSIT, 'Mwanza']);
    const runner = db.createQueryRunner();
    try { await new AddParcelCustodyEvent1788278400000().up(runner); } finally { await runner.release(); }
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failTracking = false, parcelId = 31): any {
    let trackingCount = 0;
    const fixtureParcel = { ...parcel, id: parcelId };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT status,"destinationSuperAgentId","arrivedAtHubTime" FROM public.parcel WHERE id=$1', [parcelId]);
            return { ...fixtureParcel, ...row, destinationSuperAgent: row.destinationSuperAgentId ? hub : null };
          },
          update: (_id: number, value: any) => manager.query('UPDATE public.parcel SET status=$1,"arrivedAtHubTime"=$2,"destinationSuperAgentId"=COALESCE($3,"destinationSuperAgentId") WHERE id=$4',
            [value.status,value.arrivedAtHubTime,value.destinationSuperAgent?.id || null,parcelId]),
        };
        if (entity === ParcelCustodyEvent) return {
          findOne: async ({ where }: any) => (await manager.query(
            `SELECT * FROM public.parcel_custody_event WHERE "parcelId"=$1
             ${where.eventKind ? 'AND "eventKind"=$2' : ''}
             ORDER BY "recordedAt" DESC,id DESC LIMIT 1`,
            where.eventKind ? [parcelId,where.eventKind] : [parcelId],
          ))[0] || null,
          insert: (v: any) => manager.query(`INSERT INTO public.parcel_custody_event
            ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId","toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType","hubId","assignmentId")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [v.parcelId,v.eventKind,v.operationKey,v.fromCustodianType,v.fromCustodianId,v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,v.actorRoleType,v.hubId,v.assignmentId]),
        };
        if (entity === TransportAssignment) return { findOne: async ({ where }: any) =>
          (await manager.query('SELECT * FROM public.transport_assignment WHERE id=$1', [where.id]))[0] || null };
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
    expect((await db.query('SELECT "fromCustodianType","assignmentId" FROM public.parcel_custody_event'))[0])
      .toMatchObject({ fromCustodianType: null, assignmentId: null });
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

  it('links only a verified carrier collection for this parcel and receiving city', async () => {
    await db.query('INSERT INTO public.parcel (id,status,"destinationCity","orderId") VALUES (32,$1,$2,12)',
      [ParcelStatus.IN_TRANSIT, 'Mwanza']);
    await db.query('INSERT INTO public.transport_assignment (id,"parcelRefId","providerId",status,"toCity") VALUES (21,32,43,$1,$2)',
      [AssignmentStatus.DEPARTED, 'Mwanza']);
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId","actorSource","assignmentId")
      VALUES (32,'transport_provider_collected','transport-collected:21','transport_provider',42,'account_role',21)`);
    const carrierParcel = { ...parcel, id: 32 };
    await expect(build(false, 32).recordDestinationHubReceipt(carrierParcel, hub, user, context,
      ParcelStatus.ARRIVED_AT_HUB, 'Arrived')).rejects.toThrow('does not match');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=32'))[0].status).toBe(ParcelStatus.IN_TRANSIT);
    await db.query('UPDATE public.transport_assignment SET "providerId"=42 WHERE id=21');
    await build(false, 32).recordDestinationHubReceipt(carrierParcel, hub, user, context, ParcelStatus.ARRIVED_AT_HUB, 'Arrived');
    const [receipt] = await db.query(`SELECT "fromCustodianType","fromCustodianId","assignmentId"
      FROM public.parcel_custody_event WHERE "parcelId"=32 AND "eventKind"='destination_hub_received'`);
    expect(receipt).toMatchObject({ fromCustodianType: 'transport_provider', fromCustodianId: 42, assignmentId: 21 });
  });
});
