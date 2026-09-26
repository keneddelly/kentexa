import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../../business/b5b-closure-test-db';
import { AddParcelAgentHandoffChallenge1788279600000 } from './1788279600000-AddParcelAgentHandoffChallenge';
import { AddParcelAgentDeliveryChallenge1788280200000 } from './1788280200000-AddParcelAgentDeliveryChallenge';
import { AddAgentCodCollection1788280800000 } from './1788280800000-AddAgentCodCollection';
import { AddAgentCodRemittance1788281400000 } from './1788281400000-AddAgentCodRemittance';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('schema-first custody/COD migrations on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query('CREATE TABLE public.agent (id integer PRIMARY KEY)');
    await db.query('CREATE TABLE public."order" (id integer PRIMARY KEY, "codBalanceCollectedByAgentId" integer)');
    await db.query('CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar)');
    await db.query('CREATE TABLE public.parcel_custody_event (id integer PRIMARY KEY)');
    await db.query('INSERT INTO public.agent VALUES (4)');
    await db.query('INSERT INTO public."order"(id) VALUES (12)');
    await db.query("INSERT INTO public.parcel(id,\"trackingNumber\") VALUES (31,'KTX-OLD'),(32,'KTX-NEW')");
    await db.query('INSERT INTO public.parcel_custody_event(id) VALUES (41)');
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('applies four migrations without rewriting existing Parcel or Order rows', async () => {
    const runner = db.createQueryRunner();
    try {
      await runner.startTransaction();
      await new AddParcelAgentHandoffChallenge1788279600000().up(runner);
      await new AddParcelAgentDeliveryChallenge1788280200000().up(runner);
      await new AddAgentCodCollection1788280800000().up(runner);
      await new AddAgentCodRemittance1788281400000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally { await runner.release(); }
    const [old] = await db.query(`SELECT "agentHandoffCodeHash","agentDeliveryCodeHash",
      "agentHandoffAttempts","agentDeliveryAttempts" FROM public.parcel WHERE id=31`);
    expect(old).toEqual({ agentHandoffCodeHash: null, agentDeliveryCodeHash: null,
      agentHandoffAttempts: 0, agentDeliveryAttempts: 0 });
    expect((await db.query(`SELECT "codBalanceCollectedByLocalAgentId" FROM public."order" WHERE id=12`))[0]
      .codBalanceCollectedByLocalAgentId).toBeNull();
    await expect(db.query(`UPDATE public.parcel SET "agentDeliveryCodeHash"='orphan' WHERE id=31`))
      .rejects.toThrow('CHK_parcel_agent_delivery_challenge');
    await expect(db.query(`UPDATE public.parcel SET "agentHandoffCodeHash"='orphan' WHERE id=31`))
      .rejects.toThrow('CHK_parcel_agent_handoff_challenge');
    await db.query(`INSERT INTO public.agent_cod_collection
      ("orderId","parcelId","custodyEventId","agentId","collectedAmount","cashLiability",
       "handlingFee","kentexaShare","agentShare","orderSource")
      VALUES (12,32,41,4,5000,5000,100,25,75,'online')`);
    const [collection] = await db.query('SELECT id FROM public.agent_cod_collection');
    await db.query(`INSERT INTO public.agent_cod_remittance
      ("collectionId",amount,method,reference,"operationKey","recordedByAdminUserId")
      VALUES ($1,5000,'cash','SCHEMA-RECEIPT',$2,9)`, [collection.id, randomUUID()]);
    await expect(db.query(`INSERT INTO public.agent_cod_remittance
      ("collectionId",amount,method,reference,"operationKey","recordedByAdminUserId")
      VALUES ($1,1,'cash','EXCESS',$2,9)`, [collection.id, randomUUID()]))
      .rejects.toThrow('exceeds collection liability');
    const down = db.createQueryRunner();
    try {
      await down.startTransaction();
      await expect(new AddAgentCodRemittance1788281400000().down(down))
        .rejects.toThrow('Cannot remove recorded Agent COD remittances');
      await down.rollbackTransaction();
    } finally { await down.release(); }
  });
});
