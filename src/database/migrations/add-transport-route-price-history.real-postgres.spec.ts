import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddTransportRoutePriceHistory1788284400000 } from './1788284400000-AddTransportRoutePriceHistory';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-B4 transport route price history schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddTransportRoutePriceHistory1788284400000();
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
  const insertVersion = (o: Partial<{
    routeId: number; pricePerKg: number; fixedFee: number;
    effectiveFrom: string; effectiveTo: string | null;
  }> = {}) => ds.query(`
    INSERT INTO public.transport_route_price_history
      ("routeId","pricePerKg","fixedFee","effectiveFrom","effectiveTo")
    VALUES ($1,$2,$3,$4,$5)
    RETURNING id`,
    [o.routeId ?? 1, o.pricePerKg ?? 100, o.fixedFee ?? 50,
      o.effectiveFrom ?? new Date().toISOString(), o.effectiveTo ?? null]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.transport_route (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.transport_route VALUES (1),(2)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces FK/amount/window shape', async () => {
    await apply('up');
    await apply('up'); // idempotent — IF NOT EXISTS throughout
    expect((await ds.query('SELECT count(*)::int AS n FROM public.transport_route_price_history'))[0].n).toBe(0);

    await expect(insertVersion({ routeId: 999 })).rejects.toThrow(); // FK: no such route
    await expect(insertVersion({ pricePerKg: -1 })).rejects.toThrow(); // CHK amounts >= 0
    await expect(insertVersion({ fixedFee: -1 })).rejects.toThrow(); // CHK amounts >= 0
    await expect(insertVersion({
      effectiveFrom: '2026-01-02T00:00:00Z', effectiveTo: '2026-01-01T00:00:00Z',
    })).rejects.toThrow(); // CHK window: effectiveTo must be AFTER effectiveFrom
    await expect(insertVersion()).resolves.toHaveLength(1); // a genuinely valid row
    await ds.query('DELETE FROM public.transport_route_price_history');
  });

  it('enforces at most one OPEN (effectiveTo IS NULL) version per route', async () => {
    await insertVersion({ routeId: 1, effectiveTo: null });
    await expect(insertVersion({ routeId: 1, effectiveTo: null })).rejects.toThrow(); // partial unique index
    await insertVersion({ routeId: 2, effectiveTo: null }); // a different route's own open row is fine
    // a route MAY have any number of CLOSED versions alongside its one open one
    await insertVersion({ routeId: 1, effectiveFrom: '2020-01-01', effectiveTo: '2020-06-01' });
    await ds.query('DELETE FROM public.transport_route_price_history');
  });

  it('refuses populated rollback; empty down and up round-trip', async () => {
    await insertVersion();
    await expect(apply('down')).rejects.toThrow('nonempty route price history');
    await ds.query('DELETE FROM public.transport_route_price_history');
    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.transport_route_price_history') AS t`))[0].t).toBeNull();
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
