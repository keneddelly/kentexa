import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { AddParcelAgentDeliveryChallenge1788280200000 } from '../database/migrations/1788280200000-AddParcelAgentDeliveryChallenge';
import { AddAgentCodCollection1788280800000 } from '../database/migrations/1788280800000-AddAgentCodCollection';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { Order, OrderPaymentMethod, OrderSource, OrderStatus } from '../orders/entities/order.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { SuperAgentsService } from './super-agents.service';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('Agent COD recipient handover on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let sentCode = '';
  const user = { id: 7, name: 'Agent Seven' } as any;
  const context = { userId: 7, profileId: 4, accountRoleId: 18,
    roleType: AccountRoleType.AGENT, workspaceId: null } as any;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query(`CREATE TABLE public.agent (id integer PRIMARY KEY,
      "totalDeliveriesCompleted" integer DEFAULT 0, "totalEarningsDeliveries" numeric DEFAULT 0,
      "totalEarningsPayments" numeric DEFAULT 0, "totalEarnings" numeric DEFAULT 0)`);
    await db.query(`CREATE TABLE public."order" (id integer PRIMARY KEY, status varchar NOT NULL,
      "deliveredAt" timestamp, "paymentMethod" varchar, source varchar, "sellerAmount" numeric,
      "codRemainingBalance" numeric, "codBalanceCollected" boolean DEFAULT false,
      "escrowStatus" varchar, "totalAmount" numeric, "codUpfrontAmount" numeric,
      "codBalanceCollectedByAgentId" integer, "codBalanceCollectedAt" timestamp, "paymentStatus" varchar)`);
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar,
      status varchar NOT NULL, "orderId" integer, "buyerRequestedDelivery" boolean,
      "localAgentId" varchar, "buyerPhone" varchar, "destinationCity" varchar,
      "deliveredTime" timestamp, "buyerConfirmed" boolean DEFAULT false)`);
    await db.query(`CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY,
      "parcelId" integer, status varchar NOT NULL)`);
    await db.query('CREATE TABLE public.agent_cod_receipt ("orderId" integer PRIMARY KEY, amount numeric)');
    await db.query('CREATE TABLE public.agent_cod_release ("orderId" integer PRIMARY KEY, amount numeric)');
    await db.query('INSERT INTO public.agent (id) VALUES (4)');
    await db.query(`INSERT INTO public."order" (id,status,"paymentMethod",source,"sellerAmount",
      "codRemainingBalance","escrowStatus","totalAmount","codUpfrontAmount")
      VALUES (12,'in_transit','cod','online',6000,5000,'holding',10000,5000),
             (13,'in_transit','cod','seller_shipment',0,5000,'holding',10000,5000)`);
    await db.query(`INSERT INTO public.parcel
      (id,"trackingNumber",status,"orderId","buyerRequestedDelivery","localAgentId","buyerPhone","destinationCity")
      VALUES (31,'KTX-AGENT-COD-31','out_for_delivery',12,true,'7','255700000031','Mwanza'),
             (32,'KTX-AGENT-COD-32','out_for_delivery',13,true,'7','255700000032','Mwanza')`);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupChallenge1788279000000().up(runner);
      await new AddParcelAgentDeliveryChallenge1788280200000().up(runner);
      await new AddAgentCodCollection1788280800000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_agent_received','destination-agent-received:7','local_agent',7,
        'account_role',7,18,'agent'),
             (32,'destination_agent_received','destination-agent-received:7','local_agent',7,
        'account_role',7,18,'agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failure?: 'tracking' | 'receipt' | 'blocked'): any {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.agentRepo = { findOne: async () => ({ id: 4, fullName: 'Agent Seven',
      status: AgentStatus.APPROVED, deliveryCommission: 500 }) };
    instance.smsService = { sendSms: async (_phone: string, message: string) => {
      sentCode = message.match(/\b\d{6}\b/)?.[0] || '';
      return true;
    } };
    instance.paymentEvidence = { check: async () => ({ applicable: false, sufficient: true }) };
    const proxyFor = (manager: any) => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async ({ where }: any) => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=$1', [where.id]);
            if (!row) return null;
            const [order] = await manager.query('SELECT * FROM public."order" WHERE id=$1', [row.orderId]);
            return { ...row, shipment: null, order: { ...order, seller: { id: 55 }, buyer: null,
              workspaceId: null }, };
          },
          update: (id: number, values: any) => {
            const keys = Object.keys(values);
            return manager.query(`UPDATE public.parcel SET ${keys.map((key, i) => `"${key}"=$${i+2}`).join(',')}
              WHERE id=$1`, [id, ...keys.map(key => values[key])]);
          },
        };
        if (entity === ParcelCustodyEvent) return {
          findOne: async ({ where }: any) => (await manager.query(`SELECT * FROM public.parcel_custody_event
            WHERE "parcelId"=$1 ORDER BY "recordedAt" DESC,id DESC LIMIT 1`, [where.parcelId]))[0] || null,
          insert: async (v: any) => {
            const keys = Object.keys(v);
            const [row] = await manager.query(`INSERT INTO public.parcel_custody_event
              (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i+1}`).join(',')})
              RETURNING id`, keys.map(k => v[k]));
            return { identifiers: [{ id: row.id }] };
          },
        };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          if (failure === 'tracking') throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)',
            [v.parcel.id, v.status]);
        } };
        if (entity === Agent) return { increment: (_where: any, field: string, amount: number) =>
          manager.query(`UPDATE public.agent SET "${field}"="${field}"+$1 WHERE id=4`, [amount]) };
        if (entity === Order) return { update: (id: number, values: any) => {
          const keys = Object.keys(values);
          return manager.query(`UPDATE public."order" SET ${keys.map((key, i) => `"${key}"=$${i+2}`).join(',')}
            WHERE id=$1`, [id, ...keys.map(key => values[key])]);
        } };
        throw Error('unexpected repository');
      };
      return proxy;
    };
    instance.dataSource = { transaction: (fn: any) => db.transaction(manager => fn(proxyFor(manager))) };
    instance.invoicesService = { recordCodBalanceCollected: (order: any, amount: number, manager: any) => {
      if (failure === 'receipt') throw Error('receipt unavailable');
      return manager.query('INSERT INTO public.agent_cod_receipt ("orderId",amount) VALUES ($1,$2)', [order.id, amount]);
    } };
    instance.orderRelease = { releaseSellerProceeds: (input: any) => db.transaction(async manager => {
      const [order] = await manager.query('SELECT * FROM public."order" WHERE id=$1 FOR NO KEY UPDATE', [input.orderId]);
      if (order.escrowStatus === 'released') throw Error('already released');
      await input.preflightInTransaction(proxyFor(manager));
      if (failure === 'blocked') throw Error('routing blocked');
      await manager.query('INSERT INTO public.agent_cod_release ("orderId",amount) VALUES ($1,$2)',
        [input.orderId, input.amount]);
      const keys = Object.keys(input.orderUpdate);
      await manager.query(`UPDATE public."order" SET "escrowStatus"='released',
        ${keys.map((key, i) => `"${key}"=$${i+2}`).join(',')} WHERE id=$1`,
        [input.orderId, ...keys.map(key => input.orderUpdate[key])]);
      await input.completeInTransaction(proxyFor(manager));
    }) };
    return instance;
  }

  async function state(id: number) {
    const [parcel] = await db.query('SELECT * FROM public.parcel WHERE id=$1', [id]);
    const [order] = await db.query('SELECT * FROM public."order" WHERE id=$1', [parcel.orderId]);
    const [counts] = await db.query(`SELECT
      (SELECT count(*)::int FROM public.agent_cod_collection WHERE "parcelId"=$1) AS cash,
      (SELECT count(*)::int FROM public.parcel_custody_event WHERE "parcelId"=$1 AND "eventKind"='recipient_agent_delivery') AS custody,
      (SELECT count(*)::int FROM public.parcel_tracking WHERE "parcelId"=$1) AS tracking,
      (SELECT count(*)::int FROM public.agent_cod_receipt WHERE "orderId"=$2) AS receipt,
      (SELECT count(*)::int FROM public.agent_cod_release WHERE "orderId"=$2) AS releases`, [id, parcel.orderId]);
    return { parcel, order, counts };
  }

  it('rolls back on release, tracking and receipt failure; concurrent COD handover settles once', async () => {
    await service().issueAgentDeliveryCode(user, 'KTX-AGENT-COD-31', context);
    expect(sentCode).toMatch(/^\d{6}$/);
    await expect(service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', '000000', 5000, context))
      .rejects.toThrow('Incorrect');
    await db.query(`UPDATE public.parcel SET "buyerPhone"='255700000099' WHERE id=31`);
    await expect(service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 5000, context))
      .rejects.toThrow('unavailable');
    await db.query(`UPDATE public.parcel SET "buyerPhone"='255700000031' WHERE id=31`);
    await db.query(`UPDATE public.parcel SET "agentDeliveryCodeExpiresAt"=now()-interval '1 second' WHERE id=31`);
    await expect(service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 5000, context))
      .rejects.toThrow('expired or unavailable');
    await db.query(`UPDATE public.parcel SET "agentDeliveryCodeExpiresAt"=now()+interval '10 minutes' WHERE id=31`);
    await expect(service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 4000, context))
      .rejects.toThrow('Expected COD balance');
    for (const [failure, message] of [
      ['blocked', 'routing blocked'], ['tracking', 'tracking unavailable'], ['receipt', 'receipt unavailable'],
    ] as const) {
      await expect(service(failure).confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 5000, context))
        .rejects.toThrow(message);
      const unchanged = await state(31);
      expect(unchanged.counts).toEqual({ cash: 0, custody: 0, tracking: 0, receipt: 0, releases: 0 });
      expect(unchanged.parcel.status).toBe(ParcelStatus.OUT_FOR_DELIVERY);
      expect(unchanged.order.codBalanceCollected).toBe(false);
    }
    const race = await Promise.allSettled([
      service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 5000, context),
      service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-31', sentCode, 5000, context),
    ]);
    expect(race.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const done = await state(31);
    expect(done.counts).toEqual({ cash: 1, custody: 1, tracking: 1, receipt: 1, releases: 1 });
    expect(done.parcel.status).toBe(ParcelStatus.DELIVERED);
    expect(done.order).toMatchObject({ status: OrderStatus.DELIVERED, codBalanceCollected: true,
      codBalanceCollectedByAgentId: null, codBalanceCollectedByLocalAgentId: 4 });
    const [cash] = await db.query('SELECT * FROM public.agent_cod_collection WHERE "orderId"=12');
    expect(Number(cash.collectedAmount)).toBe(5000);
    expect(Number(cash.cashLiability)).toBe(5000);
    expect(Number(cash.agentShare)).toBeGreaterThan(0);
    const [agent] = await db.query('SELECT * FROM public.agent WHERE id=4');
    expect(agent.totalDeliveriesCompleted).toBe(1);
    await expect(db.query('UPDATE public.agent_cod_collection SET "cashLiability"=0 WHERE "orderId"=12'))
      .rejects.toThrow('immutable');
    const runner = db.createQueryRunner();
    try {
      await runner.startTransaction();
      await expect(new AddAgentCodCollection1788280800000().down(runner))
        .rejects.toThrow('Cannot remove recorded Agent COD collections');
      await runner.rollbackTransaction();
    } finally { await runner.release(); }
  });

  it('records only Kentexa fee share as liability on a seller-arranged shipment', async () => {
    await service().issueAgentDeliveryCode(user, 'KTX-AGENT-COD-32', context);
    await service().confirmCodAgentDelivery(user, 'KTX-AGENT-COD-32', sentCode, 5000, context);
    const done = await state(32);
    expect(done.counts).toEqual({ cash: 1, custody: 1, tracking: 1, receipt: 1, releases: 0 });
    expect(done.order).toMatchObject({ codBalanceCollected: true, codBalanceCollectedByLocalAgentId: 4 });
    const [cash] = await db.query('SELECT * FROM public.agent_cod_collection WHERE "orderId"=13');
    expect(Number(cash.cashLiability)).toBe(Number(cash.kentexaShare));
    expect(Number(cash.cashLiability)).toBeLessThan(Number(cash.collectedAmount));
  });
});
