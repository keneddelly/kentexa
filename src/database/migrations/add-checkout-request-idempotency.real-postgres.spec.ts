import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddCheckoutRequestIdempotency1788282600000 } from './1788282600000-AddCheckoutRequestIdempotency';

// This suite uses only the dedicated kentexa_b5b_test database and its
// restricted role. It never connects to staging or production. Run it
// separately from other suites that reset that same dedicated schema.
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('checkout request migration and transaction lock — real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let first: Client;
  let second: Client;
  const key = '00539a79-7cc1-4332-bf88-ac5f98271222';

  beforeAll(async () => {
    first = new Client(config!);
    await first.connect();
    await resetB5BTestSchema(first);
    await first.query(`CREATE TABLE public."order" (id serial PRIMARY KEY, "buyerId" integer NOT NULL)`);
    await first.query(`INSERT INTO public."order" ("buyerId") VALUES (42)`);
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false,
    });
    await ds.initialize();
    const runner = ds.createQueryRunner();
    try { await new AddCheckoutRequestIdempotency1788282600000().up(runner); }
    finally { await runner.release(); }
    second = new Client(config!);
    await second.connect();
  });

  afterAll(async () => {
    if (second) await second.end().catch(() => {});
    if (ds) await ds.destroy().catch(() => {});
    if (first) await first.end().catch(() => {});
  });

  it('preserves historical rows and allows null keys, but enforces unique non-null keys', async () => {
    const legacy = await first.query(`SELECT "checkoutRequestKey", "checkoutRequestPayloadHash" FROM public."order" WHERE id=1`);
    expect(legacy.rows[0]).toEqual({ checkoutRequestKey: null, checkoutRequestPayloadHash: null });
    await first.query(`INSERT INTO public."order" ("buyerId") VALUES (42)`);
    await first.query(`INSERT INTO public."order" ("buyerId", "checkoutRequestKey", "checkoutRequestPayloadHash") VALUES (42,$1,'hash')`, [key]);
    await expect(first.query(`INSERT INTO public."order" ("buyerId", "checkoutRequestKey") VALUES (42,$1)`, [key]))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('serializes the same buyer/key and exposes the committed row to a retry', async () => {
    const retryKey = '00539a79-7cc1-4332-bf88-ac5f98271223';
    await first.query('BEGIN');
    await first.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))', [42, retryKey]);
    await first.query(`INSERT INTO public."order" ("buyerId", "checkoutRequestKey", "checkoutRequestPayloadHash") VALUES (42,$1,'same')`, [retryKey]);
    await second.query('BEGIN');
    const busy = await second.query('SELECT pg_try_advisory_xact_lock($1::integer, hashtext($2::text)) AS acquired', [42, retryKey]);
    expect(busy.rows[0].acquired).toBe(false);
    await first.query('COMMIT');
    await second.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))', [42, retryKey]);
    const replay = await second.query(`SELECT id, "checkoutRequestPayloadHash" FROM public."order" WHERE "checkoutRequestKey"=$1`, [retryKey]);
    expect(replay.rows).toHaveLength(1);
    expect(replay.rows[0].checkoutRequestPayloadHash).toBe('same');
    await second.query('COMMIT');
  });

  it('rolls back the request key and dependent writes after a simulated failure', async () => {
    const failedKey = '00539a79-7cc1-4332-bf88-ac5f98271224';
    await first.query(`CREATE TABLE public.checkout_test_invoice ("orderId" integer NOT NULL)`);
    await first.query('BEGIN');
    try {
      await first.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))', [42, failedKey]);
      const inserted = await first.query(`INSERT INTO public."order" ("buyerId", "checkoutRequestKey") VALUES (42,$1) RETURNING id`, [failedKey]);
      await first.query(`INSERT INTO public.checkout_test_invoice ("orderId") VALUES ($1)`, [inserted.rows[0].id]);
      throw new Error('injected failure before commit');
    } catch { await first.query('ROLLBACK'); }
    const orders = await first.query(`SELECT id FROM public."order" WHERE "checkoutRequestKey"=$1`, [failedKey]);
    const invoices = await first.query('SELECT * FROM public.checkout_test_invoice');
    expect(orders.rows).toHaveLength(0);
    expect(invoices.rows).toHaveLength(0);
  });
});
