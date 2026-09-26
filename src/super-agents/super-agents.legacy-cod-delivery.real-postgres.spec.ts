import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { SuperAgent } from './entities/super-agent.entity';
import { Order, OrderPaymentMethod, OrderSource, OrderStatus } from '../orders/entities/order.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('legacy hub COD delivery transaction on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const hub: any = { id: 6, city: 'Mwanza', businessName: 'Mwanza Hub', phone: '255700000009' };
  const user: any = { id: 9, phone: hub.phone };
  const context: any = { userId: 9, profileId: 6, roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const snapshot: any = { id: 31, trackingNumber: 'KTX-COD-31', status: ParcelStatus.OUT_FOR_DELIVERY,
    order: { id: 12, source: OrderSource.ONLINE, paymentMethod: OrderPaymentMethod.COD,
      codBalanceCollected: false, codRemainingBalance: 5000, sellerAmount: 6000,
      totalAmount: 10000, workspaceId: null, seller: { id: 7 } } };
  const dto = { status: ParcelStatus.DELIVERED, city: 'Mwanza', codBalanceCollected: 5000 };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query(`CREATE TABLE public."order" (id integer PRIMARY KEY, status varchar NOT NULL,
      "deliveredAt" timestamp, "codBalanceCollected" boolean DEFAULT false, "escrowStatus" varchar,
      "codBalanceCollectedByAgentId" integer, "codBalanceCollectedAt" timestamp, "paymentStatus" varchar)`);
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, status varchar NOT NULL,
      "deliveredTime" timestamp, "buyerConfirmed" boolean DEFAULT false,
      "superAgentEarnings" numeric DEFAULT 0)`);
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, status varchar NOT NULL)');
    await db.query('CREATE TABLE public.hub_cash (id integer PRIMARY KEY, held numeric DEFAULT 0)');
    await db.query('CREATE TABLE public.cod_receipt ("orderId" integer PRIMARY KEY)');
    await db.query('CREATE TABLE public.seller_release ("orderId" integer PRIMARY KEY, amount numeric)');
    await db.query(`INSERT INTO public."order" (id,status,"escrowStatus") VALUES (12,'ready_pickup','holding')`);
    await db.query(`INSERT INTO public.parcel (id,status) VALUES (31,$1)`, [ParcelStatus.OUT_FOR_DELIVERY]);
    await db.query('INSERT INTO public.hub_cash (id) VALUES (6)');
  });
  afterAll(async () => { if (db) await db.destroy(); });

  const service = (failure?: 'tracking' | 'receipt' | 'blocked', manual = false): any => {
    const instance: any = Object.create(SuperAgentsService.prototype);
    const wrapped = (manager: any) => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            return { ...snapshot, order: manual ? { ...snapshot.order, source: OrderSource.SELLER_SHIPMENT,
              sellerAmount: 0 } : snapshot.order, status: row.status, buyerRequestedDelivery: true,
              destinationSuperAgent: hub, shipment: null };
          },
          update: (_id: number, value: any) => {
            const keys = Object.keys(value);
            return manager.query(`UPDATE public.parcel SET ${keys.map((k, i) => `"${k}"=$${i + 1}`).join(',')} WHERE id=31`,
              keys.map(k => value[k]));
          },
          increment: (_where: any, _field: string, amount: number) =>
            manager.query('UPDATE public.parcel SET "superAgentEarnings"="superAgentEarnings"+$1 WHERE id=31', [amount]),
        };
        if (entity === SuperAgent) return { increment: (_where: any, _field: string, amount: number) =>
          manager.query('UPDATE public.hub_cash SET held=held+$1 WHERE id=6', [amount]) };
        if (entity === ParcelTracking) return { insert: (value: any) => {
          if (failure === 'tracking') throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking (status) VALUES ($1)', [value.status]);
        } };
        if (entity === Order) return { update: (_id: number, value: any) => {
          const keys = Object.keys(value);
          return manager.query(`UPDATE public."order" SET ${keys.map((k, i) => `"${k}"=$${i + 1}`).join(',')} WHERE id=12`,
            keys.map(k => value[k]));
        } };
        throw Error('unexpected repository');
      };
      return proxy;
    };
    instance.dataSource = { transaction: (fn: any) => db.transaction(manager => fn(wrapped(manager))) };
    instance.invoicesService = { recordCodBalanceCollected: (_order: any, _amount: any, manager: any) => {
      if (failure === 'receipt') throw Error('receipt unavailable');
      return manager.query('INSERT INTO public.cod_receipt ("orderId") VALUES (12)');
    } };
    instance.orderRelease = { releaseSellerProceeds: (input: any) => db.transaction(async manager => {
      const [row] = await manager.query('SELECT "escrowStatus" FROM public."order" WHERE id=12 FOR NO KEY UPDATE');
      if (row.escrowStatus === 'released') throw Error('already released');
      if (failure === 'blocked') throw Error('routing blocked');
      await manager.query('INSERT INTO public.seller_release ("orderId",amount) VALUES (12,$1)', [input.amount]);
      await manager.query(`UPDATE public."order" SET "escrowStatus"='released',"codBalanceCollected"=true,
        status=$1,"deliveredAt"=now() WHERE id=12`, [OrderStatus.DELIVERED]);
      await input.completeInTransaction(wrapped(manager));
    }) };
    instance.activityEvents = { record: jest.fn() };
    instance.statusLabel = () => 'Delivered';
    return instance;
  };

  const state = async () => {
    const [row] = await db.query(`SELECT (SELECT count(*)::int FROM public.seller_release) AS releases,
      (SELECT count(*)::int FROM public.cod_receipt) AS receipts,
      (SELECT count(*)::int FROM public.parcel_tracking) AS tracking,
      (SELECT status FROM public.parcel WHERE id=31) AS parcel_status,
      (SELECT "codBalanceCollected" FROM public."order" WHERE id=12) AS collected,
      (SELECT held FROM public.hub_cash WHERE id=6) AS held`);
    return row;
  };

  it('rolls back every companion write and allows only one concurrent delivery', async () => {
    for (const failure of ['blocked', 'tracking', 'receipt'] as const) {
      await expect(service(failure).completeLegacyCodDelivery(user, snapshot, hub, dto, context)).rejects.toThrow();
      expect(await state()).toMatchObject({ releases: 0, receipts: 0, tracking: 0,
        parcel_status: ParcelStatus.OUT_FOR_DELIVERY, collected: false });
      expect(Number((await state()).held)).toBe(0);
    }
    const results = await Promise.allSettled([
      service().completeLegacyCodDelivery(user, snapshot, hub, dto, context),
      service().completeLegacyCodDelivery(user, snapshot, hub, dto, context),
    ]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const done = await state();
    expect(done).toMatchObject({ releases: 1, receipts: 1, tracking: 1,
      parcel_status: ParcelStatus.DELIVERED, collected: true });
    expect(Number(done.held)).toBe(5000);
  });

  it('keeps seller-arranged COD out of seller routing while committing cash and receipt together', async () => {
    await db.query('TRUNCATE public.seller_release, public.cod_receipt, public.parcel_tracking');
    await db.query(`UPDATE public."order" SET "escrowStatus"='holding',"codBalanceCollected"=false,
      status='ready_pickup',"deliveredAt"=NULL`);
    await db.query(`UPDATE public.parcel SET status=$1,"deliveredTime"=NULL,"superAgentEarnings"=0`,
      [ParcelStatus.OUT_FOR_DELIVERY]);
    await db.query('UPDATE public.hub_cash SET held=0');
    const manualSnapshot = { ...snapshot, order: { ...snapshot.order,
      source: OrderSource.SELLER_SHIPMENT, sellerAmount: 0 } };
    await expect(service('receipt', true).completeLegacyCodDelivery(user, manualSnapshot, hub, dto, context))
      .rejects.toThrow('receipt unavailable');
    expect(await state()).toMatchObject({ releases: 0, receipts: 0, tracking: 0,
      parcel_status: ParcelStatus.OUT_FOR_DELIVERY, collected: false });
    await service(undefined, true).completeLegacyCodDelivery(user, manualSnapshot, hub, dto, context);
    const done = await state();
    expect(done).toMatchObject({ releases: 0, receipts: 1, tracking: 1,
      parcel_status: ParcelStatus.DELIVERED, collected: true });
    expect(Number(done.held)).toBe(40); // Kentexa's 40% of the TZS 100 handling fee
  });
});
