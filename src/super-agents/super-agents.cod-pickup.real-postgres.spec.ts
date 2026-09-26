import 'reflect-metadata';
import { scryptSync } from 'crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { SuperAgent } from './entities/super-agent.entity';
import { Order, OrderPaymentMethod, OrderSource, OrderStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('COD recipient pickup PostgreSQL completion', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const code = '123456';
  const salt = 'a'.repeat(32);
  const hash = `${salt}:${scryptSync(`${code}:255700000007`, salt, 32).toString('hex')}`;
  const hub: any = { id: 6, userId: 9, city: 'Mwanza', businessName: 'Mwanza Hub', status: 'active', phone: '255700000009' };
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
    await db.query(`CREATE TABLE public."order" (id integer PRIMARY KEY, status varchar NOT NULL,
      "deliveredAt" timestamp, "paymentMethod" varchar, source varchar, "sellerAmount" numeric,
      "codRemainingBalance" numeric, "codBalanceCollected" boolean DEFAULT false,
      "escrowStatus" varchar, "totalAmount" numeric, "codUpfrontAmount" numeric,
      "codBalanceCollectedByAgentId" integer, "codBalanceCollectedAt" timestamp, "paymentStatus" varchar)`);
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar,
      status varchar NOT NULL, "buyerRequestedDelivery" boolean, "buyerPhone" varchar,
      "destinationSuperAgentId" integer, "destinationCity" varchar, "orderId" integer,
      "deliveredTime" timestamp, "superAgentEarnings" numeric DEFAULT 0)`);
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar NOT NULL)');
    await db.query('CREATE TABLE public.pickup_hub (id integer PRIMARY KEY, "codCashHeld" numeric DEFAULT 0)');
    await db.query('CREATE TABLE public.pickup_receipt ("orderId" integer PRIMARY KEY, amount numeric)');
    await db.query('CREATE TABLE public.pickup_release ("orderId" integer PRIMARY KEY, amount numeric)');
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupChallenge1788279000000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public."order" (id,status,"paymentMethod",source,"sellerAmount",
      "codRemainingBalance","escrowStatus","totalAmount","codUpfrontAmount")
      VALUES (12,$1,'cod','online',6000,5000,'holding',10000,5000)`, [OrderStatus.READY_PICKUP]);
    await db.query(`INSERT INTO public.parcel (id,"trackingNumber",status,"buyerRequestedDelivery",
      "buyerPhone","destinationSuperAgentId","destinationCity","orderId","pickupCodeHash",
      "pickupCodeExpiresAt","pickupCodeIssuedAt")
      VALUES (31,'KTX-COD-31',$1,false,'255700000007',6,'Mwanza',12,$2,now()+interval '10 minutes',now())`,
      [ParcelStatus.AWAITING_BUYER, hash]);
    await db.query('INSERT INTO public.pickup_hub (id) VALUES (6)');
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_hub_received','destination-hub-received:6','super_agent',6,
        'account_role',9,17,'super_agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failure?: 'tracking' | 'receipt' | 'blocked'): any {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.superAgentRepo = { findOne: async () => hub };
    instance.parcelRepo = { findOne: async () => ({ id: 31, order: { id: 12, paymentMethod: OrderPaymentMethod.COD } }) };
    instance.paymentEvidence = { check: async () => ({ applicable: false, sufficient: true }) };
    const withProxy = (manager: any) => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            const [order] = await manager.query('SELECT * FROM public."order" WHERE id=12');
            return { ...row, order, shipment: null, destinationSuperAgent: { id: row.destinationSuperAgentId } };
          },
          update: (_id: number, value: any) => {
            const keys = Object.keys(value);
            return manager.query(`UPDATE public.parcel SET ${keys.map((key, i) => `"${key}"=$${i + 1}`).join(',')} WHERE id=31`,
              keys.map(key => value[key]));
          },
          increment: (_where: any, _field: string, amount: number) =>
            manager.query('UPDATE public.parcel SET "superAgentEarnings"="superAgentEarnings"+$1 WHERE id=31', [amount]),
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
        if (entity === Order) return { update: () => { throw Error('unexpected second Order update'); } };
        if (entity === SuperAgent) return { increment: (_where: any, _field: string, amount: number) =>
          manager.query('UPDATE public.pickup_hub SET "codCashHeld"="codCashHeld"+$1 WHERE id=6', [amount]) };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          if (failure === 'tracking') throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES (31,$1)', [v.status]);
        } };
        throw Error('unexpected repository');
      };
      return proxy;
    };
    instance.dataSource = { transaction: (fn: any) => db.transaction(manager => fn(withProxy(manager))) };
    instance.invoicesService = { recordCodBalanceCollected: (_order: any, amount: number, manager: any) => {
      if (failure === 'receipt') throw Error('receipt unavailable');
      return manager.query('INSERT INTO public.pickup_receipt ("orderId",amount) VALUES (12,$1)', [amount]);
    } };
    instance.orderRelease = { releaseSellerProceeds: (input: any) => db.transaction(async manager => {
      const [order] = await manager.query('SELECT * FROM public."order" WHERE id=12 FOR NO KEY UPDATE');
      if (order.escrowStatus === 'released') throw Error('already released');
      if (failure === 'blocked') throw Error('routing blocked');
      await manager.query('INSERT INTO public.pickup_release ("orderId",amount) VALUES (12,$1)', [input.amount]);
      await manager.query(`UPDATE public."order" SET "escrowStatus"='released',"codBalanceCollected"=true,
        "codBalanceCollectedByAgentId"=6,"codBalanceCollectedAt"=now(),"paymentStatus"='paid',
        status=$1,"deliveredAt"=now() WHERE id=12`, [OrderStatus.DELIVERED]);
      await input.completeInTransaction(withProxy(manager));
    }) };
    return instance;
  }

  async function state() {
    const [order] = await db.query('SELECT status,"escrowStatus","codBalanceCollected" FROM public."order" WHERE id=12');
    const [parcel] = await db.query('SELECT status,"pickupCodeHash","superAgentEarnings" FROM public.parcel WHERE id=31');
    const [hubRow] = await db.query('SELECT "codCashHeld" FROM public.pickup_hub WHERE id=6');
    const [counts] = await db.query(`SELECT
      (SELECT count(*)::int FROM public.pickup_release) AS releases,
      (SELECT count(*)::int FROM public.pickup_receipt) AS receipts,
      (SELECT count(*)::int FROM public.parcel_tracking) AS tracking,
      (SELECT count(*)::int FROM public.parcel_custody_event WHERE "eventKind"='recipient_self_pickup') AS custody`);
    return { order, parcel, hubRow, counts };
  }

  it('rolls back cash, release, custody, and receipt on failure; concurrent retry commits exactly once', async () => {
    await expect(service('blocked').confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context))
      .rejects.toThrow('routing blocked');
    await expect(service('tracking').confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context))
      .rejects.toThrow('tracking unavailable');
    await expect(service('receipt').confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context))
      .rejects.toThrow('receipt unavailable');
    expect((await state()).counts).toEqual({ releases: 0, receipts: 0, tracking: 0, custody: 0 });
    expect((await state()).order).toMatchObject({ escrowStatus: 'holding', codBalanceCollected: false });
    expect((await state()).parcel.status).toBe(ParcelStatus.AWAITING_BUYER);
    expect(Number((await state()).hubRow.codCashHeld)).toBe(0);
    const race = await Promise.allSettled([
      service().confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context),
      service().confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context),
    ]);
    expect(race.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const finished = await state();
    expect(finished.counts).toEqual({ releases: 1, receipts: 1, tracking: 1, custody: 1 });
    expect(finished.order).toMatchObject({ status: OrderStatus.DELIVERED, escrowStatus: 'released', codBalanceCollected: true });
    expect(finished.parcel.status).toBe(ParcelStatus.SELF_PICKUP);
    expect(finished.parcel.pickupCodeHash).toBeNull();
    expect(Number(finished.hubRow.codCashHeld)).toBe(5000);
    await expect(service().confirmCodRecipientPickup(user, 'KTX-COD-31', code, 5000, context))
      .rejects.toThrow('awaiting recipient pickup');
  });
});
