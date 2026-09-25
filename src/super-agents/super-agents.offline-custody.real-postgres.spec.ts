import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { InvoiceCounter } from '../invoices/entities/invoice-counter.entity';
import { ReceiptCounter } from '../invoices/entities/receipt-counter.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { Order } from '../orders/entities/order.entity';
import { SuperAgentsService } from './super-agents.service';
import { SuperAgent, SuperAgentStatus } from './entities/super-agent.entity';
import { Parcel, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('offline receipt: real PostgreSQL commit and rollback', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const user = { id: 7, name: 'Agent' };
  const hub = { id: 12, user: { id: 7 }, city: 'Dar', businessName: 'Origin',
    status: SuperAgentStatus.ACTIVE, freeOrdersUsed: 0, freeOrdersGranted: 2,
    totalPlatformFeesCharged: 0, totalPlatformFeesWaived: 0, totalEarnings: 0,
    totalParcelsHandled: 0, paidOrders: 0, outstandingBalance: 0, billingThreshold: 10000 };
  const context = { userId: 7, profileId: 12, accountRoleId: 23,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: 5 };
  const dto = { senderName: 'Sender', senderPhone: '255700000001', recipientName: 'Receiver',
    recipientPhone: '255700000002', destinationCity: 'Mwanza', deliveryAddress: 'Market',
    description: 'Goods', declaredValue: 50000, shippingFeeCollected: 5000 };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [InvoiceCounter, ReceiptCounter], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public.super_agent (id integer PRIMARY KEY, "freeOrdersUsed" integer NOT NULL DEFAULT 0, "totalParcelsHandled" integer NOT NULL DEFAULT 0)');
    await db.query('INSERT INTO public.super_agent (id) VALUES (12)');
    await db.query('CREATE TABLE public."order" (id serial PRIMARY KEY, "trackingNumber" varchar)');
    await db.query('CREATE TABLE public.parcel (id serial PRIMARY KEY, "orderId" integer, "trackingNumber" varchar)');
    await db.query('CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY, "parcelId" integer, status varchar)');
    await db.query('CREATE TABLE public.invoice_counter (id serial PRIMARY KEY, year integer NOT NULL, "lastSequence" integer NOT NULL DEFAULT 0)');
    await db.query('CREATE TABLE public.receipt_counter (id serial PRIMARY KEY, year integer NOT NULL, "lastSequence" integer NOT NULL DEFAULT 0)');
    await db.query('CREATE TABLE public.invoice (id serial PRIMARY KEY, "orderId" integer, "invoiceNumber" varchar, "receiptNumber" varchar)');
    const runner = db.createQueryRunner();
    try { await new AddParcelCustodyEvent1788278400000().up(runner); } finally { await runner.release(); }
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function build(failInvoice = false) {
    const invoices: any = Object.create(InvoicesService.prototype);
    invoices.dataSource = db;
    // The adapters persist the columns needed for this boundary against a
    // minimal schema; the actual service and DataSource transaction execute.
    const adapter = (entity: any, manager: any): any => {
      if (entity === Order) return {
        save: async () => (await manager.query('INSERT INTO public."order" DEFAULT VALUES RETURNING id'))[0],
        update: async (id: number, value: any) => manager.query('UPDATE public."order" SET "trackingNumber"=$1 WHERE id=$2', [value.trackingNumber, id]),
      };
      if (entity === Parcel) return { save: async (value: any) =>
        (await manager.query('INSERT INTO public.parcel ("orderId","trackingNumber") VALUES ($1,$2) RETURNING id,"trackingNumber"', [value.order.id, value.trackingNumber]))[0] };
      if (entity === SuperAgent) return {
        findOne: async () => ({ ...hub, freeOrdersUsed: (await manager.query('SELECT "freeOrdersUsed" FROM public.super_agent WHERE id=12'))[0].freeOrdersUsed }),
        update: async (id: number, value: any) => manager.query('UPDATE public.super_agent SET "freeOrdersUsed"=$1,"totalParcelsHandled"=$2 WHERE id=$3', [value.freeOrdersUsed, value.totalParcelsHandled, id]),
      };
      if (entity === ParcelCustodyEvent) return { insert: async (value: any) => manager.query(`
        INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType","actorWorkspaceId","hubId")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [value.parcelId,value.eventKind,value.operationKey,value.toCustodianType,value.toCustodianId,value.actorSource,value.actorUserId,value.actorAccountRoleId,value.actorRoleType,value.actorWorkspaceId,value.hubId]) };
      if (entity === ParcelTracking) return { insert: async (value: any) => manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES ($1,$2)', [value.parcel.id, value.status]) };
      if (entity === Invoice) return {
        create: (value: any) => value,
        save: async (value: any) => {
          if (failInvoice) throw new Error('invoice insert failed');
          await manager.query('INSERT INTO public.invoice ("orderId","invoiceNumber","receiptNumber") VALUES ($1,$2,$3)', [value.order.id,value.invoiceNumber,value.receiptNumber]);
          return value;
        },
      };
      return manager.getRepository(entity);
    };
    const service: any = Object.create(SuperAgentsService.prototype);
    service.superAgentRepo = { findOne: async () => hub };
    service.orderRepo = { create: (value: any) => value };
    service.parcelRepo = { create: (value: any) => value };
    service.routeRepo = { findOne: async () => null };
    service.auditLog = { record: async () => undefined };
    service.commerceProfiles = {};
    service.activityEvents = { record: () => undefined };
    service.smsService = { sendSms: async () => true };
    service.invoicesService = invoices;
    service.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any) => adapter(entity, manager);
      return fn(proxy);
    }) };
    return service;
  }

  it('commits paid receipt, parcel, custody, tracking, order and counters together', async () => {
    const result = await build().createOfflineIntercityOrder(user, dto, context);
    expect(result.receiptNumber).toMatch(/^KNT-RCP-/);
    for (const table of ['order', 'parcel', 'parcel_custody_event', 'parcel_tracking', 'invoice']) {
      expect((await db.query(`SELECT count(*)::int AS n FROM public."${table}"`))[0].n).toBe(1);
    }
  });

  it('rolls every write back if the paid invoice cannot be inserted', async () => {
    await expect(build(true).createOfflineIntercityOrder(user, dto, context)).rejects.toThrow('invoice insert failed');
    for (const table of ['order', 'parcel', 'parcel_custody_event', 'parcel_tracking', 'invoice']) {
      expect((await db.query(`SELECT count(*)::int AS n FROM public."${table}"`))[0].n).toBe(1);
    }
    expect((await db.query('SELECT "lastSequence" AS n FROM public.receipt_counter'))[0].n).toBe(1);
    expect((await db.query('SELECT "totalParcelsHandled" AS n FROM public.super_agent WHERE id=12'))[0].n).toBe(1);
  });
});
