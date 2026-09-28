import 'reflect-metadata';
import { readdirSync } from 'fs';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddWalkInRequestIdempotency1788282000000 } from './1788282000000-AddWalkInRequestIdempotency';

/**
 * Walk-in request idempotency migration on a CLEAN native PostgreSQL schema:
 * additive UP, repeatable UP, uniqueness, DOWN that REFUSES over populated
 * history (and changes nothing), DOWN on an empty schema, re-UP, and ordering.
 * Uses the dedicated kentexa_b5b_test database behind the shared safety gate;
 * skipped (not failed) when it is not configured. Never touches production.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const KEY = '10000000-0000-4000-8000-000000000001';
const KEY2 = '10000000-0000-4000-8000-000000000002';

suite('AddWalkInRequestIdempotency1788282000000 — real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddWalkInRequestIdempotency1788282000000();
  const run = async (dir: 'up' | 'down') => {
    const r = ds.createQueryRunner();
    await r.startTransaction();
    try { await migration[dir](r); await r.commitTransaction(); }
    catch (e) { await r.rollbackTransaction(); throw e; }
    finally { await r.release(); }
  };
  const cols = async () => (await ds.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order' ORDER BY column_name`)) as any[];
  const indexes = async () => (await ds.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='order' ORDER BY 1`)) as any[];
  const snapshot = async () => JSON.stringify([await cols(), await indexes(),
    await ds.query('SELECT * FROM public."order" ORDER BY id')]);

  beforeAll(async () => {
    const c = new Client(config!);
    await c.connect();
    try { await resetB5BTestSchema(c); } finally { await c.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port, username: config!.user,
      password: config!.password, database: config!.database, synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public."order" (id serial PRIMARY KEY, note text)');
    await ds.query(`INSERT INTO public."order" (note) VALUES ('legacy-1'),('legacy-2')`);
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('UP is purely additive: 3 nullable, default-less columns + one partial unique index; legacy rows untouched (no backfill)', async () => {
    const before = await cols();
    await run('up');
    const after = await cols();
    const added = after.filter((c) => !before.some((b) => b.column_name === c.column_name));
    expect(added.map((c) => c.column_name)).toEqual(['offlineReceiptSnapshot', 'offlineRequestKey', 'offlineRequestPayloadHash']);
    expect(added.map((c) => c.data_type)).toEqual(['jsonb', 'uuid', 'character varying']);
    for (const c of added) { expect(c.is_nullable).toBe('YES'); expect(c.column_default).toBeNull(); }
    for (const b of before) expect(after.find((a) => a.column_name === b.column_name)).toEqual(b);
    const idx = (await indexes()).find((i) => i.indexname === 'IDX_order_offline_request_key')!;
    expect(idx.indexdef).toMatch(/UNIQUE/);
    expect(idx.indexdef).toMatch(/WHERE .*offlineRequestKey.* IS NOT NULL/);
    const rows = await ds.query('SELECT "offlineRequestKey","offlineRequestPayloadHash","offlineReceiptSnapshot" FROM public."order"');
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toEqual({ offlineRequestKey: null, offlineRequestPayloadHash: null, offlineReceiptSnapshot: null });
  });

  it('UP is repeatable: running it again changes nothing and does not fail', async () => {
    const before = await snapshot();
    await run('up');
    await run('up');
    expect(await snapshot()).toBe(before);
  });

  it('one request key -> one Order (duplicate rejected), many NULL keys allowed', async () => {
    await ds.query(`INSERT INTO public."order" (note,"offlineRequestKey","offlineRequestPayloadHash") VALUES ('k1',$1,repeat('a',64))`, [KEY]);
    await expect(ds.query(`INSERT INTO public."order" (note,"offlineRequestKey") VALUES ('dup',$1)`, [KEY]))
      .rejects.toThrow(/IDX_order_offline_request_key/);
    await ds.query(`INSERT INTO public."order" (note) VALUES ('n1'),('n2')`);
    await ds.query(`DELETE FROM public."order" WHERE note IN ('k1','n1','n2')`);
  });

  it.each([
    ['a request key', `"offlineRequestKey"='${KEY2}'`],
    ['a payload hash', `"offlineRequestPayloadHash"=repeat('c',64)`],
    ['a receipt snapshot', `"offlineReceiptSnapshot"='{"receiptNumber":"R-1"}'::jsonb`],
  ])('DOWN REFUSES while %s exists, and changes NOTHING (schema and row intact)', async (_name, setClause) => {
    await ds.query(`INSERT INTO public."order" (note) VALUES ('history')`);
    await ds.query(`UPDATE public."order" SET ${setClause} WHERE note='history'`);
    const before = await snapshot();
    await expect(run('down')).rejects.toThrow('Cannot remove walk-in request idempotency history');
    expect(await snapshot()).toBe(before);
    expect((await cols()).map((c) => c.column_name)).toContain('offlineReceiptSnapshot');
    await ds.query(`DELETE FROM public."order" WHERE note='history'`);
  });

  it('DOWN succeeds on a never-used schema, removes exactly what UP added, keeps legacy rows, and is repeatable', async () => {
    await run('down');
    expect((await cols()).map((c) => c.column_name)).toEqual(['id', 'note']);
    expect((await indexes()).some((i) => i.indexname === 'IDX_order_offline_request_key')).toBe(false);
    expect((await ds.query('SELECT count(*)::int n FROM public."order"'))[0].n).toBe(2);
    await run('down'); // nothing left to remove: must not fail
  });

  it('re-UP after DOWN reproduces the original schema', async () => {
    await run('up');
    expect((await cols()).map((c) => c.column_name)).toEqual(['id', 'note', 'offlineReceiptSnapshot', 'offlineRequestKey', 'offlineRequestPayloadHash']);
    expect((await indexes()).some((i) => i.indexname === 'IDX_order_offline_request_key')).toBe(true);
  });

  it('ordering: unique timestamps; this is the last migration on the branch, directly after production\'s current maximum (1788281400000)', () => {
    const stamps = readdirSync(__dirname).filter((n) => /^\d{13}-.+\.ts$/.test(n) && !/\.spec\.ts$/.test(n))
      .map((n) => Number(n.slice(0, 13))).sort();
    expect(new Set(stamps).size).toBe(stamps.length);
    expect(stamps[stamps.length - 1]).toBe(1788282000000);
    expect(stamps[stamps.length - 2]).toBe(1788281400000);
  });
});
