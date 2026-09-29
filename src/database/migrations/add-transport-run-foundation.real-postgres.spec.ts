import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddTransportRunFoundation1788285000000 } from './1788285000000-AddTransportRunFoundation';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C1 route stop / transport run foundation schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddTransportRunFoundation1788285000000();
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
  const insertRouteStop = (o: Partial<{ routeId: number; sequence: number; locationLabel: string }> = {}) =>
    ds.query(`
      INSERT INTO public.route_stop ("routeId", sequence, "locationLabel")
      VALUES ($1,$2,$3) RETURNING id`,
      [o.routeId ?? 1, o.sequence ?? 0, o.locationLabel ?? 'Kariakoo']);
  const insertRun = (o: Partial<{ providerId: number; routeId: number; createdByUserId: number }> = {}) =>
    ds.query(`
      INSERT INTO public.transport_run ("providerId","routeId","scheduledDeparture","createdByUserId")
      VALUES ($1,$2,now() + interval '1 day',$3) RETURNING id`,
      [o.providerId ?? 1, o.routeId ?? 1, o.createdByUserId ?? 1]);
  const insertRunStop = (o: Partial<{
    runId: number; sequence: number; sourceRouteStopId: number | null;
  }> = {}) => ds.query(`
      INSERT INTO public.transport_run_stop
        ("runId","sourceRouteStopId",sequence,"locationLabel","loadingAllowed","unloadingAllowed","parcelAcceptanceAllowed","customerCollectionAllowed")
      VALUES ($1,$2,$3,'Mbagala',true,true,true,false) RETURNING id`,
      [o.runId ?? 1, o.sourceRouteStopId ?? null, o.sequence ?? 0]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.transport_provider (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.transport_route (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.transport_provider VALUES (1),(2)');
    await ds.query('INSERT INTO public.transport_route VALUES (1),(2)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces FK/sequence shape on route_stop', async () => {
    await apply('up');
    await apply('up'); // idempotent -- IF NOT EXISTS throughout
    expect((await ds.query('SELECT count(*)::int AS n FROM public.route_stop'))[0].n).toBe(0);

    await expect(insertRouteStop({ routeId: 999 })).rejects.toThrow(); // FK: no such route
    await expect(ds.query(
      `INSERT INTO public.route_stop ("routeId",sequence,"locationLabel") VALUES (1,-1,'x')`,
    )).rejects.toThrow(); // CHK sequence >= 0
    await expect(insertRouteStop()).resolves.toHaveLength(1);
    // duplicate (routeId, sequence) rejected
    await expect(insertRouteStop({ routeId: 1, sequence: 0, locationLabel: 'Duplicate' })).rejects.toThrow();
    await ds.query('DELETE FROM public.route_stop');
  });

  it('enforces FK/status shape on transport_run', async () => {
    await expect(insertRun({ providerId: 999 })).rejects.toThrow(); // FK: no such provider
    await expect(insertRun({ routeId: 999 })).rejects.toThrow(); // FK: no such route
    await expect(ds.query(
      `INSERT INTO public.transport_run ("providerId","routeId","scheduledDeparture","createdByUserId",status)
       VALUES (1,1,now(),1,'bogus')`,
    )).rejects.toThrow(); // CHK status
    await expect(insertRun()).resolves.toHaveLength(1);
    await ds.query('DELETE FROM public.transport_run');
  });

  it('enforces FK/sequence shape on transport_run_stop, and sourceRouteStopId survives its source being deleted', async () => {
    const [{ id: routeStopId }] = await insertRouteStop({ routeId: 1, sequence: 0, locationLabel: 'Mbagala' });
    const [{ id: runId }] = await insertRun({ providerId: 1, routeId: 1 });

    await expect(insertRunStop({ runId: 999 })).rejects.toThrow(); // FK: no such run
    await expect(ds.query(
      `INSERT INTO public.transport_run_stop
        ("runId","sourceRouteStopId",sequence,"locationLabel","loadingAllowed","unloadingAllowed","parcelAcceptanceAllowed","customerCollectionAllowed")
       VALUES ($1,$2,-1,'x',true,true,true,false)`, [runId, routeStopId],
    )).rejects.toThrow(); // CHK sequence >= 0
    const [{ id: runStopId }] = await insertRunStop({ runId, sourceRouteStopId: routeStopId, sequence: 0 });
    // duplicate (runId, sequence) rejected
    await expect(insertRunStop({ runId, sourceRouteStopId: routeStopId, sequence: 0 })).rejects.toThrow();

    // Deleting the SOURCE RouteStop must not delete or block deleting the RunStop's own history.
    await ds.query('DELETE FROM public.route_stop WHERE id = $1', [routeStopId]);
    const survivor = await ds.query('SELECT "sourceRouteStopId" AS s FROM public.transport_run_stop WHERE id = $1', [runStopId]);
    expect(survivor[0].s).toBeNull(); // ON DELETE SET NULL -- the snapshot itself is untouched otherwise

    await ds.query('DELETE FROM public.transport_run_stop');
    await ds.query('DELETE FROM public.transport_run');
  });

  it('refuses populated rollback (either runs or route stops); empty down and up round-trip', async () => {
    const [{ id: routeStopId }] = await insertRouteStop();
    await expect(apply('down')).rejects.toThrow('nonempty route stop / transport run history');
    await ds.query('DELETE FROM public.route_stop WHERE id = $1', [routeStopId]);

    const [{ id: runId }] = await insertRun();
    await expect(apply('down')).rejects.toThrow('nonempty route stop / transport run history');
    await ds.query('DELETE FROM public.transport_run WHERE id = $1', [runId]);

    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.transport_run_stop') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT to_regclass('public.transport_run') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT to_regclass('public.route_stop') AS t`))[0].t).toBeNull();
    await apply('up'); // leave the schema present for any later spec run in this file
  });

  // Post-C1-review correction: proves TransportRunService.reorderRouteStop's
  // ACTUAL swap technique (a temporary positive sentinel derived from the
  // row's own id) against a schema created by running this migration's own
  // up(), not a synchronize:true entity-driven one -- the exact gap the
  // review flagged. The original implementation (a temporary NEGATIVE
  // sentinel) would fail this test with "violates check constraint
  // CHK_route_stop_sequence" the moment the first UPDATE executed.
  it('reorderRouteStop\'s positive-sentinel swap technique succeeds against the real migrated schema, never touching CHK_route_stop_sequence or UQ_route_stop_sequence', async () => {
    const [{ id: stopA }] = await insertRouteStop({ routeId: 1, sequence: 0, locationLabel: 'Kariakoo' });
    const [{ id: stopB }] = await insertRouteStop({ routeId: 1, sequence: 1, locationLabel: 'Bunju' });

    // Reproduces exactly what reorderRouteStop() does: swap stopA (seq 0)
    // and stopB (seq 1) via a positive, collision-free sentinel.
    const sentinel = 1_000_000_000 + stopA;
    await ds.query('UPDATE public.route_stop SET sequence = $1 WHERE id = $2', [sentinel, stopA]);
    await ds.query('UPDATE public.route_stop SET sequence = $1 WHERE id = $2', [0, stopB]);
    await ds.query('UPDATE public.route_stop SET sequence = $1 WHERE id = $2', [1, stopA]);

    const rows = await ds.query(
      `SELECT id, sequence FROM public.route_stop WHERE "routeId" = 1 ORDER BY sequence`,
    );
    expect(rows).toEqual([{ id: stopB, sequence: 0 }, { id: stopA, sequence: 1 }]); // fully swapped
    await ds.query('DELETE FROM public.route_stop WHERE "routeId" = 1');
  });
});
