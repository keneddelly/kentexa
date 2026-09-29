import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelRunAssignment1788286200000 } from './1788286200000-AddParcelRunAssignment';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C3 parcel run assignment schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddParcelRunAssignment1788286200000();
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
  const insertAssignment = (o: Partial<{
    runId: number; parcelId: number; loadRunStopId: number; unloadRunStopId: number; status: string;
  }> = {}) => ds.query(`
    INSERT INTO public.parcel_run_assignment ("runId","parcelId","loadRunStopId","unloadRunStopId",status,"createdByUserId")
    VALUES ($1,$2,$3,$4,$5,1) RETURNING id`,
    [o.runId ?? 1, o.parcelId ?? 1, o.loadRunStopId ?? 1, o.unloadRunStopId ?? 2, o.status ?? 'scheduled']);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.transport_run (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.transport_run_stop (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.transport_run VALUES (1),(2)');
    await ds.query('INSERT INTO public.transport_run_stop VALUES (1),(2),(3)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(2)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces FK/CHECK shape', async () => {
    await apply('up');
    await apply('up'); // idempotent -- IF NOT EXISTS throughout
    expect((await ds.query('SELECT count(*)::int AS n FROM public.parcel_run_assignment'))[0].n).toBe(0);

    await expect(insertAssignment({ runId: 999 })).rejects.toThrow(); // FK: no such run
    await expect(insertAssignment({ parcelId: 999 })).rejects.toThrow(); // FK: no such parcel
    await expect(insertAssignment({ loadRunStopId: 999 })).rejects.toThrow(); // FK: no such load stop
    await expect(insertAssignment({ unloadRunStopId: 999 })).rejects.toThrow(); // FK: no such unload stop
    await expect(insertAssignment({ status: 'bogus' })).rejects.toThrow(); // CHK status
    await expect(insertAssignment({ loadRunStopId: 1, unloadRunStopId: 1 })).rejects.toThrow(); // CHK distinct stops
    await expect(insertAssignment()).resolves.toHaveLength(1); // a genuinely valid row
    await ds.query('DELETE FROM public.parcel_run_assignment');
  });

  it('enforces at most one ACTIVE (scheduled/loaded) assignment per parcel, but allows any number of terminal ones', async () => {
    await insertAssignment({ parcelId: 1, status: 'scheduled' });
    await expect(insertAssignment({ parcelId: 1, status: 'scheduled' })).rejects.toThrow(); // active + active
    await expect(insertAssignment({ parcelId: 1, status: 'loaded' })).rejects.toThrow(); // active + active (different active status)
    await expect(insertAssignment({ parcelId: 2, status: 'scheduled' })).resolves.toHaveLength(1); // a different parcel is unaffected
    await ds.query(`UPDATE public.parcel_run_assignment SET status = 'unloaded' WHERE "parcelId" = 1`);
    // now that the only row for parcel 1 is terminal, a new active one is fine
    await expect(insertAssignment({ parcelId: 1, status: 'scheduled' })).resolves.toHaveLength(1);
    // and a second terminal row for the same parcel is ALSO fine (no uniqueness constraint on terminal rows)
    await ds.query(`UPDATE public.parcel_run_assignment SET status = 'cancelled' WHERE "parcelId" = 1 AND status = 'scheduled'`);
    await expect(insertAssignment({ parcelId: 1, status: 'unloaded' })).resolves.toHaveLength(1);
    await ds.query('DELETE FROM public.parcel_run_assignment');
  });

  it('refuses populated rollback; empty down and up round-trip', async () => {
    await insertAssignment();
    await expect(apply('down')).rejects.toThrow('nonempty parcel run assignment history');
    await ds.query('DELETE FROM public.parcel_run_assignment');
    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.parcel_run_assignment') AS t`))[0].t).toBeNull();
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
