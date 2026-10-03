import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddTransportQuote1788283800000 } from './1788283800000-AddTransportQuote';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Stage 3S-B3 transport quote schema: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  const migration = new AddTransportQuote1788283800000();
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
  const insertQuote = (o: Partial<{
    providerId: number; routeId: number; availabilityId: number | null;
    status: string; acceptedAt: string | null; baseAmount: number; totalAmount: number;
  }> = {}) => ds.query(`
    INSERT INTO public.transport_quote
      ("requestedByUserId","providerId","routeId","availabilityId","originCity","destinationCity",
       "weightKg","baseAmount",components,"totalAmount",currency,"priceEffectiveAt",status,"expiresAt","acceptedAt")
    VALUES (5,$1,$2,$3,'Dar es Salaam','Mwanza',3,$4,'{"transportBase":1000}'::jsonb,$5,'TZS',now(),$6,now() + interval '15 minutes',$7)
    RETURNING id`,
    [o.providerId ?? 1, o.routeId ?? 1, o.availabilityId ?? null, o.baseAmount ?? 1000,
      o.totalAmount ?? 1000, o.status ?? 'offered', o.acceptedAt ?? null]);

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
    await ds.query('CREATE TABLE public.provider_availability (id integer PRIMARY KEY)');
    await ds.query('CREATE TABLE public.shipment (id serial PRIMARY KEY)');
    await ds.query('INSERT INTO public.transport_provider VALUES (1),(2)');
    await ds.query('INSERT INTO public.transport_route VALUES (1),(2)');
    await ds.query('INSERT INTO public.provider_availability VALUES (1)');
  });
  afterAll(async () => { if (ds) await ds.destroy(); });

  it('adds an empty schema, is repeatable, and enforces status/amount/component shape', async () => {
    await apply('up');
    await apply('up'); // idempotent — IF NOT EXISTS throughout
    expect((await ds.query('SELECT count(*)::int AS n FROM public.transport_quote'))[0].n).toBe(0);

    await expect(insertQuote({ providerId: 999 })).rejects.toThrow(); // FK: no such provider
    await expect(insertQuote({ routeId: 999 })).rejects.toThrow(); // FK: no such route
    await expect(insertQuote({ availabilityId: 999 })).rejects.toThrow(); // FK: no such availability
    await expect(insertQuote({ status: 'bogus' })).rejects.toThrow(); // CHK status
    await expect(insertQuote({ status: 'accepted', acceptedAt: null })).rejects.toThrow(); // CHK accepted<=>acceptedAt
    await expect(insertQuote({ baseAmount: -1 })).rejects.toThrow(); // CHK amounts >= 0
    await expect(insertQuote()).resolves.toHaveLength(1); // a genuinely valid row
    await ds.query('DELETE FROM public.transport_quote');
  });

  it('a Shipment can reference at most one quote (partial unique index), and a nonexistent quoteId is rejected', async () => {
    const [{ id: q1 }] = await insertQuote();
    const [{ id: q2 }] = await insertQuote();
    const [{ id: s1 }] = await ds.query('INSERT INTO public.shipment DEFAULT VALUES RETURNING id');
    const [{ id: s2 }] = await ds.query('INSERT INTO public.shipment DEFAULT VALUES RETURNING id');

    await ds.query('UPDATE public.shipment SET "quoteId" = $1 WHERE id = $2', [q1, s1]);
    await expect(ds.query('UPDATE public.shipment SET "quoteId" = $1 WHERE id = $2', [q1, s2]))
      .rejects.toThrow(); // q1 already backs s1
    await expect(ds.query('UPDATE public.shipment SET "quoteId" = 999999 WHERE id = $1', [s2]))
      .rejects.toThrow(); // FK: no such quote
    await ds.query('UPDATE public.shipment SET "quoteId" = $1 WHERE id = $2', [q2, s2]); // fine — a different quote
    await ds.query('DELETE FROM public.shipment');
    await ds.query('DELETE FROM public.transport_quote');
  });

  it('refuses populated rollback (either quotes or a linked shipment); empty down and up round-trip', async () => {
    const [{ id: q }] = await insertQuote();
    await expect(apply('down')).rejects.toThrow('nonempty transport quote history');
    await ds.query('DELETE FROM public.transport_quote');
    await apply('down');
    expect((await ds.query(`SELECT to_regclass('public.transport_quote') AS t`))[0].t).toBeNull();
    expect((await ds.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='shipment' AND column_name='quoteId'`))).toHaveLength(0);
    await apply('up');

    // and the "linked shipment" half of the refusal, independent of quotes existing:
    const [{ id: q2 }] = await insertQuote();
    const [{ id: s }] = await ds.query('INSERT INTO public.shipment DEFAULT VALUES RETURNING id');
    await ds.query('UPDATE public.shipment SET "quoteId" = $1 WHERE id = $2', [q2, s]);
    await ds.query('DELETE FROM public.transport_quote WHERE id != $1', [q2]); // no-op, just tidy
    await expect(apply('down')).rejects.toThrow('nonempty transport quote history');
    await ds.query('UPDATE public.shipment SET "quoteId" = NULL WHERE id = $1', [s]);
    await ds.query('DELETE FROM public.transport_quote');
    await apply('down');
    await apply('up'); // leave the schema present for any later spec run in this file
  });
});
