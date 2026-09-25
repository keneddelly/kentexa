import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from './1788278400000-AddParcelCustodyEvent';

// Dedicated, allow-listed local test database only. Never points at Render.
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3A1 custody migration: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddParcelCustodyEvent1788278400000();
  const up = async () => {
    const runner = ds.createQueryRunner();
    try { await migration.up(runner); } finally { await runner.release(); }
  };
  const down = async () => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try { await migration.down(runner); await runner.commitTransaction(); }
    catch (error) { await runner.rollbackTransaction(); throw error; }
    finally { await runner.release(); }
  };
  const insert = (key: string, extra = '') => ds.query(`
    INSERT INTO public.parcel_custody_event ("parcelId", "eventKind", "operationKey", "actorSource", "actorUserId", "actorAccountRoleId" ${extra ? ', ' + extra : ''})
    VALUES (1, 'hub_received', $1, 'account_role', 2, 5 ${extra ? ', 8' : ''}) RETURNING id`, [key]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY)`);
    await ds.query(`INSERT INTO public.parcel (id) VALUES (1)`);
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('UP creates an empty table with FK, operation uniqueness, and immutable trigger; rerun is safe', async () => {
    await up();
    await up();
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel_custody_event`))[0].n).toBe(0);
    const c = await ds.query(`SELECT conname, confdeltype::text AS del FROM pg_constraint
      WHERE conrelid='public.parcel_custody_event'::regclass`);
    expect(c).toEqual(expect.arrayContaining([expect.objectContaining({ conname: 'FK_parcel_custody_parcel', del: 'r' })]));
    const idx = await ds.query(`SELECT indexname FROM pg_indexes WHERE tablename='parcel_custody_event'`);
    expect(idx.map((x: any) => x.indexname)).toEqual(expect.arrayContaining([
      'UQ_parcel_custody_operation', 'IDX_parcel_custody_parcel_time',
    ]));
  });

  it('DOWN removes only the empty schema and re-UP succeeds', async () => {
    await down();
    expect((await ds.query(`SELECT to_regclass('public.parcel_custody_event') AS t`))[0].t).toBeNull();
    await up();
  });

  it('requires a real actor identity and a complete custodian pair', async () => {
    await expect(ds.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","actorSource") VALUES (1,'hub_received','bad','account_role')`)).rejects.toThrow();
    await expect(ds.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","actorSource") VALUES (1,'hub_received','web','provider_webhook')`)).rejects.toThrow();
    await expect(insert('pair', '"toCustodianType"')).rejects.toThrow();
    await expect(ds.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","actorSource","actorProviderId")
      VALUES (1,'hub_received','web-good','provider_webhook',7)`)).resolves.toHaveLength(1);
  });

  it('keeps events unique, immutable and attached to their Parcel; populated DOWN refuses', async () => {
    const row = (await insert('receipt-1'))[0];
    await expect(insert('receipt-1')).rejects.toThrow();
    await expect(ds.query(`UPDATE public.parcel_custody_event SET "eventKind"='other' WHERE id=$1`, [row.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.parcel_custody_event WHERE id=$1`, [row.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.parcel WHERE id=1`)).rejects.toThrow();
    await expect(down()).rejects.toThrow('nonempty parcel custody ledger');
    expect((await ds.query(`SELECT count(*)::int AS n FROM public.parcel_custody_event`))[0].n).toBe(2);
  });
});
