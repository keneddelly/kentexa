import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddAgentCodCollection1788280800000 } from '../database/migrations/1788280800000-AddAgentCodCollection';
import { AddAgentCodRemittance1788281400000 } from '../database/migrations/1788281400000-AddAgentCodRemittance';
import { AgentCodRemittanceService } from './agent-cod-remittance.service';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('local Agent COD remittance journal on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let service: AgentCodRemittanceService;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    service = new AgentCodRemittanceService(db);
    await db.query('CREATE TABLE public.agent (id integer PRIMARY KEY)');
    await db.query('CREATE TABLE public."order" (id integer PRIMARY KEY, "codBalanceCollectedByAgentId" integer)');
    await db.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar)');
    await db.query('CREATE TABLE public.parcel_custody_event (id integer PRIMARY KEY)');
    await db.query('INSERT INTO public.agent(id) VALUES (4)');
    await db.query('INSERT INTO public."order"(id) VALUES (12),(13)');
    await db.query(`INSERT INTO public.parcel(id,"trackingNumber") VALUES (31,'KTX-COD-31'),(32,'KTX-COD-32')`);
    await db.query('INSERT INTO public.parcel_custody_event(id) VALUES (41),(42)');
    const runner = db.createQueryRunner();
    try {
      await new AddAgentCodCollection1788280800000().up(runner);
      await new AddAgentCodRemittance1788281400000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public.agent_cod_collection
      ("orderId","parcelId","custodyEventId","agentId","collectedAmount","cashLiability",
       "handlingFee","kentexaShare","agentShare","orderSource")
      VALUES (12,31,41,4,5000,5000,100,25,75,'online'),
             (13,32,42,4,5000,25,100,25,75,'seller_shipment')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('records partial payment, idempotent retry and exact remaining liability', async () => {
    const [collection] = (await service.listCollections(4)).filter((c: any) => Number(c.cashLiability) === 5000);
    const key = randomUUID();
    const input = { collectionId: Number(collection.id), amount: 1500, method: 'cash',
      reference: 'KTX-CASH-001', operationKey: key, adminUserId: 9 };
    const first = await service.record(input);
    expect(first).toMatchObject({ remainingAmount: 3500, alreadyRecorded: false });
    const repeated = await service.record(input);
    expect(repeated).toMatchObject({ id: first.id, remainingAmount: 3500, alreadyRecorded: true });
    await expect(service.record({ ...input, amount: 1400 })).rejects.toThrow('different remittance');
    expect((await service.listCollections(4)).find((c: any) => c.id === collection.id))
      .toMatchObject({ remainingAmount: 3500 });
    await expect(db.query('UPDATE public.agent_cod_remittance SET amount=1 WHERE id=$1', [first.id]))
      .rejects.toThrow('immutable');
  });

  it('locks the liability against concurrent over-remittance and direct SQL bypass', async () => {
    const [collection] = (await service.listCollections(4)).filter((c: any) => Number(c.cashLiability) === 5000);
    const id = Number(collection.id);
    const race = await Promise.allSettled([
      service.record({ collectionId: id, amount: 3000, method: 'bank_transfer',
        reference: 'BANK-A', operationKey: randomUUID(), adminUserId: 9 }),
      service.record({ collectionId: id, amount: 3000, method: 'bank_transfer',
        reference: 'BANK-B', operationKey: randomUUID(), adminUserId: 9 }),
    ]);
    expect(race.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const [current] = (await service.listCollections(4)).filter((c: any) => Number(c.id) === id);
    expect(current.remainingAmount).toBe(500);
    await expect(db.query(`INSERT INTO public.agent_cod_remittance
      ("collectionId",amount,method,reference,"operationKey","recordedByAdminUserId")
      VALUES ($1,501,'cash','FAKE',$2,9)`, [id, randomUUID()]))
      .rejects.toThrow('exceeds collection liability');
  });

  it('keeps manual sale liability separate and refuses destructive rollback', async () => {
    const [manual] = (await service.listCollections(4)).filter((c: any) => Number(c.cashLiability) === 25);
    await expect(service.record({ collectionId: Number(manual.id), amount: 26, method: 'cash',
      reference: 'TOO-MUCH', operationKey: randomUUID(), adminUserId: 9 }))
      .rejects.toThrow('exceeds outstanding cash liability');
    const settled = await service.record({ collectionId: Number(manual.id), amount: 25, method: 'mobile_money',
      reference: 'MNO-001', operationKey: randomUUID(), adminUserId: 9 });
    expect(settled.remainingAmount).toBe(0);
    const runner = db.createQueryRunner();
    try {
      await runner.startTransaction();
      await expect(new AddAgentCodRemittance1788281400000().down(runner))
        .rejects.toThrow('Cannot remove recorded Agent COD remittances');
      await runner.rollbackTransaction();
    } finally { await runner.release(); }
  });
});
