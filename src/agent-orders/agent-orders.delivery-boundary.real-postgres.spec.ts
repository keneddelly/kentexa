import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { AgentOrdersService } from './agent-orders.service';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('legacy Agent Order delivery boundary on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const sms = { sendSms: jest.fn(async () => true) };
  const user = { id: 7, name: 'Agent Seven' } as any;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query(`CREATE TABLE public."order" (id integer PRIMARY KEY, "agentId" varchar,
      status varchar NOT NULL, "shippingMethod" varchar, "deliveredAt" timestamp,
      "agentNote" varchar, "autoReleaseAt" timestamp)`);
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY,
      "orderId" integer REFERENCES public."order"(id))`);
    await db.query(`INSERT INTO public."order" (id,"agentId",status,"shippingMethod")
      VALUES (31,'7','in_transit','agent'),(32,'7','in_transit','boda')`);
    await db.query('INSERT INTO public.parcel (id,"orderId") VALUES (41,31)');
  });
  afterAll(async () => { if (db) await db.destroy(); });
  beforeEach(() => { sms.sendSms.mockClear(); });

  function service(): AgentOrdersService {
    const instance: any = Object.create(AgentOrdersService.prototype);
    instance.smsService = sms;
    instance.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity !== Order) throw Error('unexpected repository');
        return {
          findOne: async ({ where }: any) => {
            const [row] = await manager.query('SELECT * FROM public."order" WHERE id=$1', [where.id]);
            return row ? { ...row, buyer: { phone: '255700000001' }, seller: { phone: '255700000002' } } : null;
          },
          update: (id: number, values: any) => manager.query(`UPDATE public."order"
            SET status=$2,"deliveredAt"=$3,"agentNote"=$4,"autoReleaseAt"=$5 WHERE id=$1`,
            [id, values.status, values.deliveredAt, values.agentNote, values.autoReleaseAt]),
        };
      };
      return fn(proxy);
    }) };
    return instance;
  }

  it('rejects linked Parcel delivery and leaves Order and messages untouched', async () => {
    await expect(service().confirmDelivery(31, user, 'delivered'))
      .rejects.toThrow('Linked parcel requires verified recipient handover');
    const [order] = await db.query('SELECT status,"deliveredAt","autoReleaseAt" FROM public."order" WHERE id=31');
    expect(order).toMatchObject({ status: OrderStatus.IN_TRANSIT, deliveredAt: null, autoReleaseAt: null });
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('preserves legacy order-only completion after commit', async () => {
    await service().confirmDelivery(32, user, 'delivered');
    const [order] = await db.query('SELECT status,"deliveredAt","autoReleaseAt" FROM public."order" WHERE id=32');
    expect(order.status).toBe(OrderStatus.DELIVERED);
    expect(order.deliveredAt).toBeTruthy();
    expect(order.autoReleaseAt).toBeTruthy();
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
  });

  it('cannot double-complete the same Order under competing requests', async () => {
    await db.query(`UPDATE public."order" SET status='in_transit',"deliveredAt"=NULL,"autoReleaseAt"=NULL WHERE id=32`);
    const results = await Promise.allSettled([
      service().confirmDelivery(32, user), service().confirmDelivery(32, user),
    ]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
  });
});
