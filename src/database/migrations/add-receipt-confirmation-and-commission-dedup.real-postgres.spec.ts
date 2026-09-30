import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelRunAssignment1788286200000 } from './1788286200000-AddParcelRunAssignment';
import { AddSuperAgentCommissionFoundation1788287400000 } from './1788287400000-AddSuperAgentCommissionFoundation';
import { AddReceiptConfirmationAndCommissionDedup1788288000000 } from './1788288000000-AddReceiptConfirmationAndCommissionDedup';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C6 receipt confirmation + commission dedup schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const assignmentMigration = new AddParcelRunAssignment1788286200000();
  const commissionMigration = new AddSuperAgentCommissionFoundation1788287400000();
  const migration = new AddReceiptConfirmationAndCommissionDedup1788288000000();

  const apply = (target: { up: (r: any) => Promise<void>; down: (r: any) => Promise<void> }, direction: 'up' | 'down') => {
    return (async () => {
      const runner = ds.createQueryRunner();
      await runner.startTransaction();
      try {
        await target[direction](runner);
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }
    })();
  };

  const insertAssignment = (status: string) => ds.query(`
    INSERT INTO public.parcel_run_assignment ("runId","parcelId","loadRunStopId","unloadRunStopId",status,"createdByUserId")
    VALUES (1,1,1,2,$1,1) RETURNING id`, [status]);

  const insertEarning = (o: Partial<{ custodyEventId: number; parcelId: number; superAgentId: number; sourceCustodianType: string }> = {}) => ds.query(`
    INSERT INTO public.super_agent_handling_earning
      ("custodyEventId","parcelId","superAgentId","sourceCustodianType","rateConfigId",amount,currency,source)
    VALUES ($1,$2,$3,$4,1,500,'TZS','origin_hub_received') RETURNING id`,
    [o.custodyEventId ?? 1, o.parcelId ?? 1, o.superAgentId ?? 1, o.sourceCustodianType ?? 'transport_provider']);

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
    await ds.query('INSERT INTO public.transport_run VALUES (1)');
    await ds.query('INSERT INTO public.transport_run_stop VALUES (1),(2)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(2)');
    await ds.query('CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY, "fromCustodianType" varchar)');
    await ds.query(`INSERT INTO public.parcel_custody_event (id, "fromCustodianType") VALUES (1,'transport_provider'),(2,'local_agent'),(3,'local_agent')`);

    await apply(assignmentMigration, 'up');
    await apply(commissionMigration, 'up');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds the received status and receivedAt column, is repeatable', async () => {
    await apply(migration, 'up');
    await apply(migration, 'up'); // idempotent

    await expect(insertAssignment('received')).resolves.toHaveLength(1);
    await expect(insertAssignment('bogus')).rejects.toThrow(); // vocab unchanged otherwise
    await ds.query(`DELETE FROM public.parcel_run_assignment`);

    const cols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='parcel_run_assignment' AND column_name='receivedAt'`);
    expect(cols).toHaveLength(1);
  });

  it('adds the sourceCustodianType column as NOT NULL', async () => {
    const cols = await ds.query(`SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='super_agent_handling_earning' AND column_name='sourceCustodianType'`);
    expect(cols).toHaveLength(1);
    expect(cols[0].is_nullable).toBe('NO');
    await expect(ds.query(`INSERT INTO public.super_agent_handling_earning
      ("custodyEventId","parcelId","superAgentId","sourceCustodianType","rateConfigId",amount,currency,source)
      VALUES (1,1,1,NULL,1,500,'TZS','origin_hub_received')`)).rejects.toThrow();
  });

  it('enforces the new (parcelId, superAgentId, sourceCustodianType) uniqueness on the earning table without disturbing the existing custodyEventId uniqueness', async () => {
    await insertEarning({ custodyEventId: 1, parcelId: 1, superAgentId: 1, sourceCustodianType: 'transport_provider' });
    // Same (parcelId, superAgentId, sourceCustodianType), a DIFFERENT custody event -- rejected by the NEW constraint.
    await expect(insertEarning({ custodyEventId: 2, parcelId: 1, superAgentId: 1, sourceCustodianType: 'transport_provider' })).rejects.toThrow();
    // The SAME custodyEventId again -- still rejected by the EXISTING (untouched) constraint.
    await expect(insertEarning({ custodyEventId: 1, parcelId: 2, superAgentId: 9, sourceCustodianType: 'local_agent' })).rejects.toThrow();
    // A genuinely different parcel/agent pair with a different event is fine.
    await expect(insertEarning({ custodyEventId: 2, parcelId: 2, superAgentId: 1, sourceCustodianType: 'transport_provider' })).resolves.toHaveLength(1);
    // Stage 3S-C6 correction: the SAME parcel/agent pair, but a genuinely
    // DIFFERENT prior-custodian type (a separate real handling operation --
    // e.g. an earlier local-loop origin receipt followed by a later
    // destination receipt at the same hub) must now be allowed.
    await expect(insertEarning({ custodyEventId: 3, parcelId: 1, superAgentId: 1, sourceCustodianType: 'local_agent' })).resolves.toHaveLength(1);
    // TRUNCATE, not DELETE -- the earning table's own immutability trigger
    // (applied for real by commissionMigration.up() above) makes a plain
    // DELETE impossible once any row exists; test-harness-only technique.
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY`);
  });

  it('refuses populated rollback while received assignments or the dedup constraint\'s own history exist; empty down and up round-trip', async () => {
    const [{ id }] = await insertAssignment('received');
    await expect(apply(migration, 'down')).rejects.toThrow('refusing to remove the received status');
    await ds.query(`DELETE FROM public.parcel_run_assignment WHERE id = $1`, [id]);

    await apply(migration, 'down');
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='parcel_run_assignment' AND column_name='receivedAt'`);
    expect(cols).toHaveLength(0);
    await expect(insertAssignment('received')).rejects.toThrow(); // vocab reverted too

    const earningCols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='super_agent_handling_earning' AND column_name='sourceCustodianType'`);
    expect(earningCols).toHaveLength(0);
    await expect(insertEarning({ custodyEventId: 99, parcelId: 1, superAgentId: 1 })).rejects.toThrow(); // column reverted too

    await apply(migration, 'up'); // leave the schema present for any later run of this file
  });
});
