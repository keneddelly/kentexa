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
    await expect(insertVersion({ routeId: 1, effectiveTo: null })).rejects.toThrow(); // range-exclude: two [x,infinity) windows always overlap
    await insertVersion({ routeId: 2, effectiveTo: null }); // a different route's own open row is fine
    // a route MAY have any number of CLOSED versions alongside its one open one, as long as none overlap
    await insertVersion({ routeId: 1, effectiveFrom: '2020-01-01', effectiveTo: '2020-06-01' });
    await ds.query('DELETE FROM public.transport_route_price_history');
  });

  // Post-review correction: the ORIGINAL migration only ever protected the
  // single open-ended row -- it never stopped two CLOSED windows for the
  // same route from overlapping. Proves the replacement range-EXCLUDE
  // constraint (route-price-history-schema.ts) rejects that case directly,
  // at the DB level, independent of any service-layer discipline.
  it('rejects overlapping CLOSED windows for the same route -- the gap the original migration left open', async () => {
    await insertVersion({ routeId: 1, effectiveFrom: '2020-01-01', effectiveTo: '2020-06-01' });
    // Fully contained inside the first window.
    await expect(insertVersion({ routeId: 1, effectiveFrom: '2020-02-01', effectiveTo: '2020-03-01' })).rejects.toThrow();
    // Partial overlap on each side.
    await expect(insertVersion({ routeId: 1, effectiveFrom: '2019-12-01', effectiveTo: '2020-02-01' })).rejects.toThrow();
    await expect(insertVersion({ routeId: 1, effectiveFrom: '2020-05-01', effectiveTo: '2020-08-01' })).rejects.toThrow();
    // Exactly adjacent (touching, not overlapping) is fine -- windows are half-open [from, to).
    await expect(insertVersion({ routeId: 1, effectiveFrom: '2020-06-01', effectiveTo: '2020-09-01' })).resolves.toHaveLength(1);
    // The identical overlap on a DIFFERENT route is unaffected.
    await expect(insertVersion({ routeId: 2, effectiveFrom: '2020-02-01', effectiveTo: '2020-03-01' })).resolves.toHaveLength(1);
    await ds.query('DELETE FROM public.transport_route_price_history');
  });

  // Concurrency proof, not just sequential: two transactions each attempt to
  // insert an overlapping window for the SAME route at (as close to) the
  // same instant as this test can force. The range-EXCLUDE constraint must
  // let exactly one through and fail the other, never both, regardless of
  // interleaving -- the whole point being this holds even if some future
  // caller bypasses TransportService.setRoutePrice's own serializing lock.
  it('rejects a genuinely concurrent overlapping insert -- the DB itself serializes it, not just the service', async () => {
    const runnerA = ds.createQueryRunner();
    const runnerB = ds.createQueryRunner();
    await runnerA.connect();
    await runnerB.connect();
    await runnerA.startTransaction();
    await runnerB.startTransaction();
    try {
      const insertA = runnerA.query(
        `INSERT INTO public.transport_route_price_history ("routeId","pricePerKg","fixedFee","effectiveFrom","effectiveTo")
         VALUES (1,100,50,'2021-01-01','2021-06-01') RETURNING id`,
      );
      const insertB = runnerB.query(
        `INSERT INTO public.transport_route_price_history ("routeId","pricePerKg","fixedFee","effectiveFrom","effectiveTo")
         VALUES (1,200,60,'2021-03-01','2021-09-01') RETURNING id`,
      );
      const results = await Promise.allSettled([
        insertA.then(async (r) => { await runnerA.commitTransaction(); return r; }),
        insertB.then(async (r) => { await runnerB.commitTransaction(); return r; }),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1); // exactly one of the two genuinely overlapping writes wins
      expect(rejected).toHaveLength(1);
      expect((await ds.query(`SELECT count(*)::int n FROM public.transport_route_price_history WHERE "routeId"=1`))[0].n).toBe(1);
    } finally {
      await runnerA.rollbackTransaction().catch(() => {});
      await runnerB.rollbackTransaction().catch(() => {});
      await runnerA.release();
      await runnerB.release();
      await ds.query('DELETE FROM public.transport_route_price_history');
    }
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
