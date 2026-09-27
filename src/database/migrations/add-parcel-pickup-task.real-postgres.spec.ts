import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelPickupTask1788282600000 } from './1788282600000-AddParcelPickupTask';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S pickup task schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddParcelPickupTask1788282600000();
  const apply = async (direction: 'up' | 'down') => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      await migration[direction](runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  };
  const insert = (key: string, path = 'direct_delivery', hub: number | null = null,
    parcel = 1, status = 'requested', agent: number | null = null) => ds.query(`
      INSERT INTO public.parcel_pickup_task
        ("parcelId","requestKey","requestPayloadHash","requestedByUserId",
         "servicePath","originSnapshot","pickupContactName","pickupContactPhone",
         "originHubId",status,"agentProfileId")
      VALUES ($1,$2,repeat('a',64),5,$3,'{"display":"Kariakoo"}'::jsonb,
              'Sender','+255700000001',$4,$5,$6) RETURNING id`,
    [parcel, key, path, hub, status, agent]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.super_agent (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.agent (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(2)');
    await ds.query('INSERT INTO public.super_agent VALUES (7)');
    await ds.query('INSERT INTO public.agent VALUES (9)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces service and status shape', async () => {
    await apply('up');
    await apply('up');
    expect((await ds.query('SELECT count(*)::int AS n FROM public.parcel_pickup_task'))[0].n).toBe(0);
    await expect(insert('10000000-0000-4000-8000-000000000001', 'hub_routed'))
      .rejects.toThrow();
    await expect(insert('10000000-0000-4000-8000-000000000002', 'direct_delivery', 7))
      .rejects.toThrow();
    await expect(insert('10000000-0000-4000-8000-000000000003', 'direct_delivery', null, 1, 'delivered', 9))
      .resolves.toHaveLength(1);
    await expect(insert('10000000-0000-4000-8000-000000000004', 'hub_routed', 7, 2, 'delivered', 9))
      .rejects.toThrow();
    await ds.query('DELETE FROM public.parcel_pickup_task');
  });

  it('allows one active pickup per Parcel and a later historical task after completion', async () => {
    await insert('10000000-0000-4000-8000-000000000005');
    await expect(insert('10000000-0000-4000-8000-000000000006')).rejects.toThrow();
    await expect(insert('10000000-0000-4000-8000-000000000005', 'hub_routed', 7, 2))
      .rejects.toThrow();
    await ds.query(`UPDATE public.parcel_pickup_task SET status='cancelled' WHERE "parcelId"=1`);
    await expect(insert('10000000-0000-4000-8000-000000000007', 'hub_routed', 7))
      .resolves.toHaveLength(1);
    await expect(ds.query('DELETE FROM public.parcel WHERE id=1')).rejects.toThrow();
  });

  it('serializes two concurrent active inserts; exactly one wins', async () => {
    const a = ds.createQueryRunner();
    const b = ds.createQueryRunner();
    await a.connect(); await b.connect();
    try {
      await a.startTransaction();
      await a.query(`INSERT INTO public.parcel_pickup_task
        ("parcelId","requestKey","requestPayloadHash","requestedByUserId",
         "servicePath","originSnapshot","pickupContactName","pickupContactPhone")
        VALUES (2,'10000000-0000-4000-8000-000000000008',repeat('a',64),5,
                'direct_delivery','{}'::jsonb,'S','+255700000001')`);
      const contender = b.query(`INSERT INTO public.parcel_pickup_task
        ("parcelId","requestKey","requestPayloadHash","requestedByUserId",
         "servicePath","originSnapshot","pickupContactName","pickupContactPhone")
        VALUES (2,'10000000-0000-4000-8000-000000000009',repeat('a',64),5,
                'direct_delivery','{}'::jsonb,'S','+255700000001')`);
      await a.commitTransaction();
      await expect(contender).rejects.toThrow();
      expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel_pickup_task WHERE "parcelId"=2`))[0].n).toBe(1);
    } finally {
      if (a.isTransactionActive) await a.rollbackTransaction();
      await a.release(); await b.release();
    }
  });

  it('refuses populated rollback; empty down and up round-trip', async () => {
    await expect(apply('down')).rejects.toThrow('nonempty parcel pickup task history');
    await ds.query('DELETE FROM public.parcel_pickup_task');
    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.parcel_pickup_task') AS t`))[0].t).toBeNull();
    await apply('up');
  });
});
