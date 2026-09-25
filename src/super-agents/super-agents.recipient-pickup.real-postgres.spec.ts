import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('recipient pickup PostgreSQL custody boundary', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let issuedCode = '';
  const hub: any = { id: 6, userId: 9, city: 'Mwanza', businessName: 'Mwanza Hub',
    status: 'active', workspaceId: null, phone: '255700000009' };
  const user: any = { id: 9, phone: hub.phone };
  const context: any = { userId: 9, profileId: 6, accountRoleId: 17,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public."order" (id integer PRIMARY KEY, status varchar NOT NULL, "deliveredAt" timestamp)');
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar,
      status varchar NOT NULL, "buyerRequestedDelivery" boolean, "buyerPhone" varchar,
      "destinationSuperAgentId" integer, "destinationCity" varchar, "orderId" integer,
      "deliveredTime" timestamp)`);
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar NOT NULL)');
    await db.query('INSERT INTO public."order" (id,status) VALUES (12,$1)', [OrderStatus.READY_PICKUP]);
    await db.query(`INSERT INTO public.parcel
      (id,"trackingNumber",status,"buyerRequestedDelivery","buyerPhone","destinationSuperAgentId","destinationCity","orderId")
      VALUES (31,'KTX-31',$1,false,'255700000007',6,'Mwanza',12)`, [ParcelStatus.AWAITING_BUYER]);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupChallenge1788279000000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_hub_received','destination-hub-received:6','super_agent',6,
        'account_role',9,17,'super_agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failTracking = false): any {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.superAgentRepo = { findOne: async () => hub };
    instance.parcelRepo = { findOne: async () => ({ id: 31, buyerPhone: '255700000007', order: { id: 12 } }) };
    instance.paymentEvidence = { check: async () => ({ applicable: false, sufficient: true }) };
    instance.smsService = { sendSms: async (_phone: string, message: string) => {
      issuedCode = message.match(/\b\d{6}\b/)?.[0] || '';
      return true;
    } };
    instance.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            return { ...row, order: { id: 12, status: OrderStatus.READY_PICKUP,
              paymentMethod: 'online', source: 'offline_intercity', totalAmount: 0, codUpfrontAmount: null },
              shipment: null, destinationSuperAgent: { id: row.destinationSuperAgentId } };
          },
          update: (_id: number, value: any) => {
            const keys = Object.keys(value);
            return manager.query(`UPDATE public.parcel SET ${keys.map((key, i) => `"${key}"=$${i+1}`).join(',')} WHERE id=31`,
              keys.map(key => value[key]));
          },
        };
        if (entity === ParcelCustodyEvent) return {
          findOne: async () => (await manager.query(`SELECT * FROM public.parcel_custody_event
            WHERE "parcelId"=31 ORDER BY "recordedAt" DESC,id DESC LIMIT 1`))[0] || null,
          insert: (v: any) => manager.query(`INSERT INTO public.parcel_custody_event
            ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId",
             "toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType","hubId")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [v.parcelId,v.eventKind,v.operationKey,v.fromCustodianType,v.fromCustodianId,
              v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,v.actorRoleType,v.hubId]),
        };
        if (entity === User) return { findOne: async () => ({ id: 7 }) };
        if (entity === Order) return { update: (_id: number, value: any) =>
          manager.query('UPDATE public."order" SET status=$1,"deliveredAt"=$2 WHERE id=12',
            [value.status, value.deliveredAt]) };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          if (failTracking) throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES (31,$1)', [v.status]);
        } };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return instance;
  }

  it('rolls back a failed handover and commits one verified recipient transfer', async () => {
    await service().issueRecipientPickupCode(user, 'KTX-31', context);
    expect(issuedCode).toMatch(/^\d{6}$/);
    await expect(service(true).confirmRecipientPickup(user, 'KTX-31', issuedCode, context)).rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.AWAITING_BUYER);
    expect((await db.query('SELECT status FROM public."order" WHERE id=12'))[0].status).toBe(OrderStatus.READY_PICKUP);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    const race = await Promise.allSettled([
      service().confirmRecipientPickup(user, 'KTX-31', issuedCode, context),
      service().confirmRecipientPickup(user, 'KTX-31', issuedCode, context),
    ]);
    expect(race.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.SELF_PICKUP);
    expect((await db.query('SELECT status FROM public."order" WHERE id=12'))[0].status).toBe(OrderStatus.DELIVERED);
    const [event] = await db.query(`SELECT "fromCustodianType","fromCustodianId","toCustodianType","toCustodianId"
      FROM public.parcel_custody_event WHERE "eventKind"='recipient_self_pickup'`);
    expect(event).toMatchObject({ fromCustodianType: 'super_agent', fromCustodianId: 6,
      toCustodianType: 'recipient_contact', toCustodianId: null });
    await expect(service().confirmRecipientPickup(user, 'KTX-31', issuedCode, context)).rejects.toThrow('awaiting recipient pickup');
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(2);
  });
});
