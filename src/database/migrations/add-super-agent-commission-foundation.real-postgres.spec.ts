import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddSuperAgentCommissionFoundation1788287400000 } from './1788287400000-AddSuperAgentCommissionFoundation';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-C5 super agent commission foundation schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddSuperAgentCommissionFoundation1788287400000();
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
  const insertRate = (o: Partial<{
    commissionType: string; scope: string; amount: number; effectiveFrom: string; effectiveTo: string | null; isActive: boolean;
  }> = {}) => ds.query(`
    INSERT INTO public.super_agent_handling_rate ("commissionType", scope, amount, "effectiveFrom", "effectiveTo", "isActive")
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [o.commissionType ?? 'handling', o.scope ?? 'global', o.amount ?? 500,
      o.effectiveFrom ?? new Date().toISOString(), o.effectiveTo ?? null, o.isActive ?? true]);
  const insertEarning = (o: Partial<{
    custodyEventId: number; parcelId: number; superAgentId: number; rateConfigId: number; amount: number;
  }> = {}) => ds.query(`
    INSERT INTO public.super_agent_handling_earning
      ("custodyEventId","parcelId","superAgentId","rateConfigId",amount,currency,source)
    VALUES ($1,$2,$3,$4,$5,'TZS','origin_hub_received') RETURNING id`,
    [o.custodyEventId ?? 1, o.parcelId ?? 1, o.superAgentId ?? 1, o.rateConfigId ?? 1, o.amount ?? 500]);
  const insertCollection = (o: Partial<{
    parcelId: number; superAgentId: number; paymentMethod: string; idempotencyKey: string;
  }> = {}) => ds.query(`
    INSERT INTO public.super_agent_cash_collection
      ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
    VALUES ($1,$2,5000,'TZS',5000,'TZS',$3,1,$4) RETURNING id`,
    [o.parcelId ?? 1, o.superAgentId ?? 1, o.paymentMethod ?? 'cash', o.idempotencyKey ?? `k-${Math.random()}`]);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    ds = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await ds.initialize();
    await ds.query('CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel_custody_event VALUES (1),(2)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds the rate table, seeds the initial pilot configuration, and enforces the no-overlap constraint', async () => {
    await apply('up');
    await apply('up'); // idempotent

    const seeded = await ds.query(
      `SELECT * FROM public.super_agent_handling_rate WHERE "commissionType"='handling' AND scope='global'`);
    expect(seeded).toHaveLength(1); // the up/up rerun above must not duplicate the seed
    expect(Number(seeded[0].amount)).toBe(500);
    expect(seeded[0].currency).toBe('TZS');
    expect(seeded[0].isActive).toBe(true);
    expect(seeded[0].createdByUserId).toBeNull(); // migration-seeded, no real acting user

    // Post-review correction: positive amount and a genuinely valid window.
    await expect(insertRate({ commissionType: 'chk1', amount: 0 })).rejects.toThrow();
    await expect(insertRate({ commissionType: 'chk2', amount: -500 })).rejects.toThrow();
    await expect(insertRate({ commissionType: 'chk3', effectiveFrom: '2026-06-01', effectiveTo: '2026-01-01' })).rejects.toThrow();

    // A second, overlapping ACTIVE configuration for the same type/scope is rejected.
    await expect(insertRate({ effectiveFrom: '2020-01-01', effectiveTo: null })).rejects.toThrow();
    // A different commissionType or scope is unaffected.
    await expect(insertRate({ commissionType: 'other', effectiveFrom: '2020-01-01', effectiveTo: null })).resolves.toHaveLength(1);
    await expect(insertRate({ scope: 'regionA', effectiveFrom: '2020-01-01', effectiveTo: null })).resolves.toHaveLength(1);
    // A non-overlapping CLOSED window in the past is fine.
    await expect(insertRate({ effectiveFrom: '2019-01-01', effectiveTo: '2019-06-01' })).resolves.toHaveLength(1);
    // An inactive row's range is NOT protected -- a retracted draft frees its own window.
    await expect(insertRate({ effectiveFrom: '2030-01-01', effectiveTo: null, isActive: false })).resolves.toHaveLength(1);
    await expect(insertRate({ effectiveFrom: '2030-06-01', effectiveTo: null, isActive: false })).resolves.toHaveLength(1); // still inactive, still unconstrained
    await ds.query(`DELETE FROM public.super_agent_handling_rate WHERE "commissionType" != 'handling' OR scope != 'global' OR "effectiveFrom" != (SELECT "effectiveFrom" FROM public.super_agent_handling_rate WHERE "commissionType"='handling' AND scope='global' ORDER BY id LIMIT 1)`);
  });

  it('enforces the earning table\'s FK/uniqueness shape and immutability', async () => {
    const [seed] = await ds.query(`SELECT id FROM public.super_agent_handling_rate WHERE "commissionType"='handling' AND scope='global'`);

    await expect(insertEarning({ custodyEventId: 999, rateConfigId: seed.id })).rejects.toThrow(); // FK: no such custody event
    await expect(insertEarning({ custodyEventId: 1, rateConfigId: 999 })).rejects.toThrow(); // FK: no such rate config

    const [row] = await insertEarning({ custodyEventId: 1, rateConfigId: seed.id });
    await expect(insertEarning({ custodyEventId: 1, rateConfigId: seed.id })).rejects.toThrow(); // UQ: one earning per custody event
    await expect(insertEarning({ custodyEventId: 2, rateConfigId: seed.id })).resolves.toHaveLength(1); // a different custody event is fine

    await expect(ds.query(`UPDATE public.super_agent_handling_earning SET amount=1 WHERE id=$1`, [row.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.super_agent_handling_earning WHERE id=$1`, [row.id])).rejects.toThrow();
  });

  it('enforces the cash collection table\'s vocab/uniqueness shape and immutability', async () => {
    await expect(insertCollection({ paymentMethod: 'mobile_money' })).rejects.toThrow(); // CHK: not yet a supported method
    // Post-review correction: positive collected amount, nonnegative price context.
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
       VALUES (1,1,5000,'TZS',0,'TZS','cash',1,'chk-amt-1')`,
    )).rejects.toThrow();
    await expect(ds.query(
      `INSERT INTO public.super_agent_cash_collection
        ("parcelId","superAgentId","priceContextAmount","priceContextCurrency","collectedAmount",currency,"paymentMethod","actorUserId","idempotencyKey")
       VALUES (1,1,-1,'TZS',5000,'TZS','cash',1,'chk-amt-2')`,
    )).rejects.toThrow();

    const [row] = await insertCollection({ idempotencyKey: 'idem-1' });
    await expect(insertCollection({ idempotencyKey: 'idem-1' })).rejects.toThrow(); // UQ: idempotency key
    await expect(insertCollection({ idempotencyKey: 'idem-2' })).resolves.toHaveLength(1);

    await expect(ds.query(`UPDATE public.super_agent_cash_collection SET "collectedAmount"=1 WHERE id=$1`, [row.id])).rejects.toThrow();
    await expect(ds.query(`DELETE FROM public.super_agent_cash_collection WHERE id=$1`, [row.id])).rejects.toThrow();
  });

  it('refuses populated rollback when the earning table is nonempty', async () => {
    await expect(apply('down')).rejects.toThrow('nonempty super agent handling earning history');
    expect((await ds.query(`SELECT to_regclass('public.super_agent_handling_rate') AS t`))[0].t).not.toBeNull();
  });

  it('refuses populated rollback when ONLY the cash collection table is nonempty (earning empty)', async () => {
    // Both ledgers are immutable, so getting to "earning empty, collection
    // populated" needs a genuinely fresh schema, not DELETE.
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    await ds.query('CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel_custody_event VALUES (1),(2)');
    await apply('up');
    await insertCollection({ idempotencyKey: 'collection-only' });

    await expect(apply('down')).rejects.toThrow('nonempty super agent cash collection history');
  });

  it('an empty rollback round-trips', async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    await ds.query('CREATE TABLE public.parcel_custody_event (id SERIAL PRIMARY KEY)');
    await ds.query('INSERT INTO public.parcel_custody_event VALUES (1),(2)');
    await apply('up');

    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.super_agent_handling_rate') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT to_regclass('public.super_agent_handling_earning') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT to_regclass('public.super_agent_cash_collection') AS t`))[0].t).toBeNull();
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
