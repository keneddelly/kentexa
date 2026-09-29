import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddVehicleFoundation1788285600000 } from './1788285600000-AddVehicleFoundation';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C2 vehicle foundation schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddVehicleFoundation1788285600000();
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
  const insertVehicle = (o: Partial<{
    providerId: number; identifier: string; type: string;
    parcelCapacity: number | null; operationalStatus: string;
  }> = {}) => ds.query(`
    INSERT INTO public.vehicle ("providerId", identifier, type, "parcelCapacity", "operationalStatus")
    VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [o.providerId ?? 1, o.identifier ?? 'Van #1', o.type ?? 'van', o.parcelCapacity ?? 50, o.operationalStatus ?? 'available']);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.transport_provider (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.transport_provider VALUES (1),(2)');
    await ds.query(`CREATE TABLE public.transport_run (id SERIAL PRIMARY KEY)`);
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces FK/CHECK shape on vehicle', async () => {
    await apply('up');
    await apply('up'); // idempotent -- IF NOT EXISTS throughout
    expect((await ds.query('SELECT count(*)::int AS n FROM public.vehicle'))[0].n).toBe(0);

    await expect(insertVehicle({ providerId: 999 })).rejects.toThrow(); // FK: no such provider
    await expect(insertVehicle({ type: 'bogus' })).rejects.toThrow(); // CHK type
    await expect(insertVehicle({ operationalStatus: 'bogus' })).rejects.toThrow(); // CHK operationalStatus
    await expect(insertVehicle({ parcelCapacity: -1 })).rejects.toThrow(); // CHK capacity >= 0
    await expect(insertVehicle()).resolves.toHaveLength(1); // a genuinely valid row
    await ds.query('DELETE FROM public.vehicle');
  });

  it('adds transport_run.vehicleId additively, FK-checked, without disturbing existing rows', async () => {
    const [{ id: runId }] = await ds.query('INSERT INTO public.transport_run DEFAULT VALUES RETURNING id');
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='transport_run' AND column_name='vehicleId'`,
    );
    expect(cols).toHaveLength(1);
    await expect(ds.query('UPDATE public.transport_run SET "vehicleId" = 999999 WHERE id = $1', [runId]))
      .rejects.toThrow(); // FK: no such vehicle
    const [{ id: vehicleId }] = await insertVehicle();
    await ds.query('UPDATE public.transport_run SET "vehicleId" = $1 WHERE id = $2', [vehicleId, runId]);
    const row = await ds.query('SELECT "vehicleId" FROM public.transport_run WHERE id = $1', [runId]);
    expect(row[0].vehicleId).toBe(vehicleId);
    await ds.query('UPDATE public.transport_run SET "vehicleId" = NULL WHERE id = $1', [runId]);
    await ds.query('DELETE FROM public.vehicle');
    await ds.query('DELETE FROM public.transport_run');
  });

  it('refuses populated rollback (either vehicles or an assigned run); empty down and up round-trip', async () => {
    const [{ id: vehicleId }] = await insertVehicle();
    await expect(apply('down')).rejects.toThrow('nonempty vehicle history');
    await ds.query('DELETE FROM public.vehicle WHERE id = $1', [vehicleId]);

    const [{ id: vehicleId2 }] = await insertVehicle();
    const [{ id: runId }] = await ds.query('INSERT INTO public.transport_run DEFAULT VALUES RETURNING id');
    await ds.query('UPDATE public.transport_run SET "vehicleId" = $1 WHERE id = $2', [vehicleId2, runId]);
    await ds.query('DELETE FROM public.vehicle WHERE id != $1', [vehicleId2]); // no-op, just tidy
    await expect(apply('down')).rejects.toThrow('nonempty vehicle history');
    await ds.query('UPDATE public.transport_run SET "vehicleId" = NULL WHERE id = $1', [runId]);
    await ds.query('DELETE FROM public.vehicle');

    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.vehicle') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transport_run' AND column_name='vehicleId'`))).toHaveLength(0);
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
