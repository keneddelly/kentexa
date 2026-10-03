import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from './1788278400000-AddParcelCustodyEvent';
import { AddParcelCustodyAssignmentDiscriminator1788286800000 } from './1788286800000-AddParcelCustodyAssignmentDiscriminator';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

/**
 * Stage 3S-C4 — proves the assignmentType discriminator migration against a
 * REAL, already-populated parcel_custody_event table: the exact scenario
 * the review is asking about (does this schema change actually preserve
 * legacy rows, or does it silently reject/rewrite them).
 */
suite('Stage 3S-C4 parcel custody assignment discriminator: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const originalMigration = new AddParcelCustodyEvent1788278400000();
  const discriminatorMigration = new AddParcelCustodyAssignmentDiscriminator1788286800000();

  const insertEvent = (o: Partial<{
    parcelId: number; eventKind: string; operationKey: string; assignmentId: number | null;
    assignmentType: string | null;
  }> = {}) => ds.query(`
    INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","actorSource","assignmentId","assignmentType")
    VALUES ($1,$2,$3,'system',$4,$5) RETURNING id, "assignmentId", "assignmentType"`,
    [o.parcelId ?? 1, o.eventKind ?? 'origin_hub_received', o.operationKey ?? `k-${Math.random()}`,
      o.assignmentId === undefined ? null : o.assignmentId, o.assignmentType === undefined ? null : o.assignmentType]);

  // A genuinely pre-C4 row: the "assignmentType" column doesn't exist yet
  // when this runs, exactly matching every real write site's shape before
  // this migration -- insertEvent() above can't be reused here since it
  // always references that column.
  const insertLegacyEvent = (o: { parcelId: number; operationKey: string; assignmentId: number | null }) => ds.query(`
    INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","actorSource","assignmentId")
    VALUES ($1,'origin_hub_received',$2,'system',$3) RETURNING id, "assignmentId"`,
    [o.parcelId, o.operationKey, o.assignmentId]);

  const applyDown = async () => {
    const runner = ds.createQueryRunner();
    await runner.startTransaction();
    try {
      await discriminatorMigration.down(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [],
    });
    await ds.initialize();
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel VALUES (1),(2)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('legacy rows (assignmentId set, no assignmentType) survive unchanged after the discriminator migration runs', async () => {
    const runner = ds.createQueryRunner();
    await originalMigration.up(runner);
    await runner.release();

    // A "legacy" row: exactly the shape every pre-C4 write site has always
    // produced -- assignmentId set (meaning TransportAssignment.id, though
    // that table isn't modeled here), no assignmentType column at all yet.
    const [legacy] = await insertLegacyEvent({ parcelId: 1, operationKey: 'legacy-transport-collected:42', assignmentId: 42 });

    const before = (await ds.query('SELECT * FROM public.parcel_custody_event WHERE id = $1', [legacy.id]))[0];

    const runner2 = ds.createQueryRunner();
    await discriminatorMigration.up(runner2);
    await runner2.release();

    const after = (await ds.query('SELECT * FROM public.parcel_custody_event WHERE id = $1', [legacy.id]))[0];
    // Every field that existed before is byte-for-byte unchanged -- the only
    // difference is the new column itself, freshly present with NULL (never
    // backfilled, never a rewrite of anything that was already there).
    expect(after).toEqual({ ...before, assignmentType: null });
    expect(after.assignmentId).toBe(42);
  });

  it('going forward: vocabulary CHECK rejects a bogus assignmentType, accepts both real values', async () => {
    await expect(insertEvent({ parcelId: 1, assignmentId: 1, assignmentType: 'bogus' })).rejects.toThrow();
    await expect(insertEvent({ parcelId: 1, assignmentId: 1, assignmentType: 'transport_assignment' })).resolves.toHaveLength(1);
    await expect(insertEvent({ parcelId: 1, assignmentId: 2, assignmentType: 'parcel_run_assignment' })).resolves.toHaveLength(1);
  });

  it('going forward: the pairing CHECK (NOT VALID) rejects a NEW legacy-shaped row, proving it is enforced prospectively, not just cosmetically', async () => {
    // The exact shape the previous test proved survives when it ALREADY
    // existed before the constraint was added. A brand-new attempt at that
    // same shape, now that the constraint exists, must be rejected --
    // otherwise NOT VALID would mean "never enforced" rather than
    // "grandfathers history, enforced from here on".
    await expect(insertEvent({ parcelId: 1, assignmentId: 99, assignmentType: null })).rejects.toThrow();
    // The symmetric violation is rejected too.
    await expect(insertEvent({ parcelId: 1, assignmentId: null, assignmentType: 'transport_assignment' })).rejects.toThrow();
    // Both null, or both set, are fine.
    await expect(insertEvent({ parcelId: 1, assignmentId: null, assignmentType: null })).resolves.toHaveLength(1);
  });

  it('is idempotent (safe to run twice) and refuses a populated rollback', async () => {
    const runner = ds.createQueryRunner();
    await discriminatorMigration.up(runner); // already applied by an earlier test in this file -- must not throw
    await runner.release();

    await expect(applyDown()).rejects.toThrow('already carry a real assignmentType classification');
    // The refused attempt changed nothing.
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='parcel_custody_event' AND column_name='assignmentType'`);
    expect(cols).toHaveLength(1);
  });

  it('an empty rollback round-trips (table itself has no rows -- the ledger\'s own immutability trigger makes DELETE impossible once any row exists, so this needs a genuinely fresh table)', async () => {
    // DDL (DROP SCHEMA), not DML -- the BEFORE UPDATE/DELETE trigger only
    // blocks row-level mutation, never a schema-level rebuild.
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    await ds.query('CREATE TABLE public.parcel (id integer PRIMARY KEY)'); // dropped along with the rest of the schema above
    const runner = ds.createQueryRunner();
    await originalMigration.up(runner);
    await discriminatorMigration.up(runner);
    await runner.release();

    await applyDown();
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='parcel_custody_event' AND column_name='assignmentType'`);
    expect(cols).toHaveLength(0);

    const upRunner = ds.createQueryRunner();
    await discriminatorMigration.up(upRunner);
    await upRunner.release();
  });
});
