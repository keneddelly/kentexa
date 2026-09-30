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

  const insertEarning = (o: Partial<{ custodyEventId: number; parcelId: number; superAgentId: number; physicalHandoffRef: string | null }> = {}) => ds.query(`
    INSERT INTO public.super_agent_handling_earning
      ("custodyEventId","parcelId","superAgentId","physicalHandoffRef","rateConfigId",amount,currency,source)
    VALUES ($1,$2,$3,$4,1,500,'TZS','origin_hub_received') RETURNING id`,
    [o.custodyEventId ?? 1, o.parcelId ?? 1, o.superAgentId ?? 1, o.physicalHandoffRef === undefined ? null : o.physicalHandoffRef]);

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
    await ds.query('CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY, "fromCustodianType" varchar, "evidenceRef" varchar)');
    await ds.query(`INSERT INTO public.parcel_custody_event (id, "fromCustodianType", "evidenceRef") VALUES
      (1,'transport_provider','parcel_run_assignment:1'),(2,'local_agent','collection:2'),
      (3,'local_agent',NULL),(4,'local_agent',NULL)`);

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

  it('adds physicalHandoffRef as a nullable column (backfilled from evidenceRef where present)', async () => {
    const cols = await ds.query(`SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='super_agent_handling_earning' AND column_name='physicalHandoffRef'`);
    expect(cols).toHaveLength(1);
    expect(cols[0].is_nullable).toBe('YES'); // NOT enforced NOT NULL -- an un-provable handoff is an accepted state
  });

  it('enforces uniqueness on physicalHandoffRef ALONE (a proven concrete-operation identity), while leaving NULL rows unconstrained and custodyEventId uniqueness untouched', async () => {
    await insertEarning({ custodyEventId: 1, parcelId: 1, superAgentId: 1, physicalHandoffRef: 'parcel_run_assignment:1' });
    // The SAME physicalHandoffRef, a DIFFERENT custody event -- rejected:
    // this is a PROVEN duplicate recording of one real physical handoff.
    await expect(insertEarning({ custodyEventId: 2, parcelId: 1, superAgentId: 1, physicalHandoffRef: 'parcel_run_assignment:1' })).rejects.toThrow();
    // The SAME custodyEventId again -- still rejected by the EXISTING (untouched) constraint.
    await expect(insertEarning({ custodyEventId: 1, parcelId: 2, superAgentId: 9, physicalHandoffRef: 'collection:9' })).rejects.toThrow();
    // A genuinely different concrete operation -- always allowed, even for
    // the exact same parcel/Super Agent pair (Stage 3S-C6's own
    // local-loop-origin-then-destination scenario).
    await expect(insertEarning({ custodyEventId: 2, parcelId: 1, superAgentId: 1, physicalHandoffRef: 'collection:2' })).resolves.toHaveLength(1);
    // No provable physical-handoff identity at all (NULL) -- the partial
    // index does not constrain these rows AT ALL, so two of them can share
    // the same parcel/Super Agent pair without any DB-level conflict; the
    // application layer (SuperAgentHandlingEarningService) is what flags
    // this specific case for review, not a DB constraint.
    await expect(insertEarning({ custodyEventId: 3, parcelId: 1, superAgentId: 1, physicalHandoffRef: null })).resolves.toHaveLength(1);
    await expect(insertEarning({ custodyEventId: 4, parcelId: 1, superAgentId: 1, physicalHandoffRef: null })).resolves.toHaveLength(1);
    // TRUNCATE, not DELETE -- the earning table's own immutability trigger
    // (applied for real by commissionMigration.up() above) makes a plain
    // DELETE impossible once any row exists; test-harness-only technique.
    // CASCADE clears the obligation table's own FK dependents (resultingEarningId).
    await ds.query(`TRUNCATE TABLE public.super_agent_handling_earning RESTART IDENTITY CASCADE`);
  });

  it('creates the super_agent_handling_earning_obligation transactional-outbox table with its own constraints', async () => {
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='super_agent_handling_earning_obligation'
      ORDER BY column_name`);
    expect(cols.map((c: any) => c.column_name).sort()).toEqual(
      ['attempts', 'createdAt', 'custodyEventId', 'id', 'lastAttemptedAt', 'lastError',
       'parcelId', 'resultingEarningId', 'status', 'superAgentId', 'updatedAt'].sort(),
    );

    const insertObligation = (o: Partial<{ custodyEventId: number; status: string }> = {}) => ds.query(
      `INSERT INTO public.super_agent_handling_earning_obligation ("custodyEventId","parcelId","superAgentId",status)
       VALUES ($1,1,1,$2) RETURNING id`,
      [o.custodyEventId ?? 1, o.status ?? 'pending'],
    );

    const [{ id }] = await insertObligation({ custodyEventId: 1 });
    // Unique per custodyEventId.
    await expect(insertObligation({ custodyEventId: 1 })).rejects.toThrow();
    // Status vocabulary is enforced by a real CHECK constraint.
    await expect(insertObligation({ custodyEventId: 2, status: 'bogus' })).rejects.toThrow();
    // FK to a real custody event -- a nonexistent one is refused.
    await expect(insertObligation({ custodyEventId: 999999 })).rejects.toThrow();

    // Mutable: unlike the earning/cash-collection ledgers, ordinary UPDATE
    // and DELETE both work here -- no immutability trigger applies.
    await expect(ds.query(`UPDATE public.super_agent_handling_earning_obligation SET status = 'completed' WHERE id = $1`, [id])).resolves.toBeDefined();
    await expect(ds.query(`DELETE FROM public.super_agent_handling_earning_obligation WHERE id = $1`, [id])).resolves.toBeDefined();
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
      WHERE table_schema='public' AND table_name='super_agent_handling_earning' AND column_name='physicalHandoffRef'`);
    expect(earningCols).toHaveLength(0);
    await expect(insertEarning({ custodyEventId: 99, parcelId: 1, superAgentId: 1 })).rejects.toThrow(); // column reverted too

    const obligationTable = await ds.query(`SELECT to_regclass('public.super_agent_handling_earning_obligation') AS t`);
    expect(obligationTable[0].t).toBeNull(); // obligation table dropped too

    await apply(migration, 'up'); // leave the schema present for any later run of this file
  });
});
