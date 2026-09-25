import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { InvoicesService } from './invoices.service';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('invoice numbers join the caller transaction on real PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let service: InvoicesService;
  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [InvoiceCounter, ReceiptCounter], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public.invoice_counter (id serial PRIMARY KEY, year integer NOT NULL, "lastSequence" integer NOT NULL DEFAULT 0)');
    await db.query('CREATE TABLE public.receipt_counter (id serial PRIMARY KEY, year integer NOT NULL, "lastSequence" integer NOT NULL DEFAULT 0)');
    service = Object.create(InvoicesService.prototype);
    (service as any).dataSource = db;
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('rolls both counter increments back with a failed counter receipt', async () => {
    await expect(db.transaction(async manager => {
      await service.generateInvoiceNumber(manager);
      await service.generateReceiptNumber(manager);
      throw new Error('parcel write failed');
    })).rejects.toThrow('parcel write failed');
    expect((await db.query('SELECT count(*)::int AS n FROM public.invoice_counter'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM public.receipt_counter'))[0].n).toBe(0);
  });

  it('serializes concurrent number creation for the same year', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => db.transaction(async manager => ({
      invoice: await service.generateInvoiceNumber(manager),
      receipt: await service.generateReceiptNumber(manager),
    }))));
    expect(new Set(results.map(x => x.invoice)).size).toBe(4);
    expect(new Set(results.map(x => x.receipt)).size).toBe(4);
    expect((await db.query('SELECT "lastSequence" AS n FROM public.invoice_counter'))[0].n).toBe(4);
  });
});
