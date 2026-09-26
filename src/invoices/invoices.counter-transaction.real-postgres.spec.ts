import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { Invoice } from './entities/invoice.entity';
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
    await db.query(`CREATE TABLE public.invoice (id serial PRIMARY KEY, "invoiceNumber" varchar NOT NULL,
      "orderId" integer UNIQUE, amount numeric, status varchar, "receiptNumber" varchar, "paidAt" timestamp,
      "paymentMethod" varchar, "buyerId" integer, "payerName" text, "payerPhone" text, "agentId" integer)`);
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

  // The production Invoice entity has many relations; this minimal SQL
  // repository keeps the test focused on transaction propagation and the
  // real PostgreSQL receipt-number generator without bootstrapping commerce.
  function invoiceManager(manager: any): any {
    const proxy: any = Object.create(manager);
    proxy.getRepository = (entity: any) => {
      if (entity !== Invoice) return manager.getRepository(entity);
      return {
        findOne: async (opts: any) => (await manager.query('SELECT * FROM public.invoice WHERE "orderId"=$1',
          [opts.where.order.id]))[0] || null,
        create: (value: any) => value,
        save: async (value: any) => {
          if (value.id) {
            await manager.query(`UPDATE public.invoice SET amount=$1,status=$2,"paidAt"=$3,
              "receiptNumber"=$4 WHERE id=$5`,
              [value.amount, value.status, value.paidAt, value.receiptNumber, value.id]);
          } else {
            await manager.query(`INSERT INTO public.invoice ("invoiceNumber","orderId",amount,status,
              "receiptNumber","paidAt","paymentMethod","buyerId","payerName","payerPhone","agentId")
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [value.invoiceNumber, value.order.id, value.amount, value.status, value.receiptNumber,
                value.paidAt, value.paymentMethod, value.buyer?.id ?? null, value.payerName,
                value.payerPhone, value.agentId]);
          }
          return value;
        },
      };
    };
    return proxy;
  }

  it('rolls the COD invoice and receipt number back with the physical handover', async () => {
    const order: any = { id: 12, buyer: null, recipientName: 'External recipient', phone: '255700000007' };
    await db.query(`INSERT INTO public.invoice ("invoiceNumber","orderId",amount,status)
      VALUES ('KNT-UPFRONT-12',12,5000,'paid')`);
    const before = (await db.query('SELECT "lastSequence" FROM public.receipt_counter'))[0].lastSequence;
    await expect(db.transaction(async manager => {
      await service.recordCodBalanceCollected(order, 10000, invoiceManager(manager));
      throw Error('custody write failed');
    })).rejects.toThrow('custody write failed');
    expect((await db.query('SELECT amount,"receiptNumber" FROM public.invoice WHERE "orderId"=12'))[0])
      .toMatchObject({ amount: '5000.00', receiptNumber: null });
    expect((await db.query('SELECT "lastSequence" FROM public.receipt_counter'))[0].lastSequence).toBe(before);

    await db.transaction(manager => service.recordCodBalanceCollected(order, 10000, invoiceManager(manager)));
    const [paid] = await db.query('SELECT amount,"receiptNumber" FROM public.invoice WHERE "orderId"=12');
    expect(paid.amount).toBe('10000.00');
    expect(paid.receiptNumber).toMatch(/^KNT-RCP-/);
  });

  it('creates a single paid COD invoice inside the same transaction when no upfront invoice exists', async () => {
    const order: any = { id: 13, buyer: null, recipientName: 'External recipient', phone: '255700000008' };
    await db.transaction(manager => service.recordCodBalanceCollected(order, 7500, invoiceManager(manager)));
    const [invoice] = await db.query('SELECT * FROM public.invoice WHERE "orderId"=13');
    expect(invoice).toMatchObject({ amount: '7500.00', status: 'paid', "payerPhone": '255700000008' });
    expect(invoice.invoiceNumber).toMatch(/^KNT-INV-/);
    expect(invoice.receiptNumber).toMatch(/^KNT-RCP-/);
  });
});
