import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { AddParcelAgentDeliveryChallenge1788280200000 } from '../database/migrations/1788280200000-AddParcelAgentDeliveryChallenge';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('recipient-held Agent delivery proof on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let sentCode = '';
  const user: any = { id: 7, name: 'Agent Seven' };
  const context: any = { userId: 7, profileId: 4, accountRoleId: 18,
    roleType: AccountRoleType.AGENT, workspaceId: null };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      entities: [], synchronize: false });
    await db.initialize();
    await db.query(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "trackingNumber" varchar,
      status varchar NOT NULL, "orderId" integer, "buyerRequestedDelivery" boolean,
      "localAgentId" varchar, "buyerPhone" varchar, "destinationCity" varchar, "buyerConfirmed" boolean DEFAULT false)`);
    await db.query(`CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY,
      "parcelId" integer, status varchar NOT NULL)`);
    await db.query(`CREATE TABLE public.agent (id integer PRIMARY KEY,
      "totalDeliveriesCompleted" integer NOT NULL DEFAULT 0,
      "totalEarningsDeliveries" integer NOT NULL DEFAULT 0,
      "totalEarnings" integer NOT NULL DEFAULT 0)`);
    await db.query('INSERT INTO public.agent (id) VALUES (4)');
    await db.query(`INSERT INTO public.parcel
      (id,"trackingNumber",status,"buyerRequestedDelivery","localAgentId","buyerPhone","destinationCity")
      VALUES (31,'KTX-DELIVERY-31',$1,true,'7','255700000031','Mwanza')`, [ParcelStatus.OUT_FOR_DELIVERY]);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupChallenge1788279000000().up(runner);
      await new AddParcelAgentDeliveryChallenge1788280200000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId",
       "toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_agent_received','destination-agent-received:7','super_agent',6,
        'local_agent',7,'account_role',7,18,'agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failTracking = false): any {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.agentRepo = { findOne: async () => ({ id: 4, fullName: 'Agent Seven', deliveryCommission: 1500 }) };
    instance.smsService = { sendSms: async (_phone: string, message: string) => {
      sentCode = message.match(/\b\d{6}\b/)?.[0] || '';
      return true;
    } };
    instance.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            return { ...row, order: null, shipment: null };
          },
          update: (_id: number, value: any) => {
            const keys = Object.keys(value);
            return manager.query(`UPDATE public.parcel SET ${keys.map((k, i) => `"${k}"=$${i+1}`).join(',')} WHERE id=31`,
              keys.map(k => value[k]));
          },
        };
        if (entity === ParcelCustodyEvent) return {
          findOne: async () => (await manager.query(`SELECT * FROM public.parcel_custody_event
            WHERE "parcelId"=31 ORDER BY "recordedAt" DESC,id DESC LIMIT 1`))[0] || null,
          insert: (v: any) => manager.query(`INSERT INTO public.parcel_custody_event
            ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId",
             "toCustodianType","toCustodianId","actorSource","actorUserId","actorAccountRoleId",
             "actorRoleType","evidenceRef") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [v.parcelId,v.eventKind,v.operationKey,v.fromCustodianType,v.fromCustodianId,
              v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,
              v.actorRoleType,v.evidenceRef]),
        };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          if (failTracking) throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES (31,$1)', [v.status]);
        } };
        if (entity === Agent) return { increment: (_where: any, field: string, amount: number) =>
          manager.query(`UPDATE public.agent SET "${field}"="${field}"+$1 WHERE id=4`, [amount]) };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return instance;
  }

  it('requires recipient code and commits custody, status, tracking, earnings once', async () => {
    await service().issueAgentDeliveryCode(user, 'KTX-DELIVERY-31', context);
    expect(sentCode).toMatch(/^\d{6}$/);
    const pendingRunner = db.createQueryRunner();
    try {
      await pendingRunner.startTransaction();
      await expect(new AddParcelAgentDeliveryChallenge1788280200000().down(pendingRunner))
        .rejects.toThrow('pending Agent delivery challenges');
      await pendingRunner.rollbackTransaction();
    } finally { await pendingRunner.release(); }
    await expect(service().confirmAgentDelivery({ id: 8 }, 'KTX-DELIVERY-31', sentCode,
      { ...context, userId: 8 })).rejects.toThrow('this Agent');
    await expect(service().confirmAgentDelivery(user, 'KTX-DELIVERY-31', '000000', context))
      .rejects.toThrow('Incorrect');
    await db.query(`UPDATE public.parcel SET "buyerPhone"='255700000099' WHERE id=31`);
    await expect(service().confirmAgentDelivery(user, 'KTX-DELIVERY-31', sentCode, context))
      .rejects.toThrow('unavailable');
    await db.query(`UPDATE public.parcel SET "buyerPhone"='255700000031' WHERE id=31`);
    await expect(service(true).confirmAgentDelivery(user, 'KTX-DELIVERY-31', sentCode, context))
      .rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status)
      .toBe(ParcelStatus.OUT_FOR_DELIVERY);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    await expect(service().updateMyDeliveryStatus(user, 'KTX-DELIVERY-31', ParcelStatus.DELIVERED))
      .rejects.toThrow('recipient delivery confirmation');
    const results = await Promise.allSettled([
      service().confirmAgentDelivery(user, 'KTX-DELIVERY-31', sentCode, context),
      service().confirmAgentDelivery(user, 'KTX-DELIVERY-31', sentCode, context),
    ]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const [row] = await db.query(`SELECT status,"agentDeliveryCodeHash","buyerConfirmed" FROM public.parcel WHERE id=31`);
    expect(row).toMatchObject({ status: ParcelStatus.DELIVERED, agentDeliveryCodeHash: null, buyerConfirmed: true });
    const [event] = await db.query(`SELECT "fromCustodianType","fromCustodianId","toCustodianType"
      FROM public.parcel_custody_event WHERE "eventKind"='recipient_agent_delivery'`);
    expect(event).toMatchObject({ fromCustodianType: 'local_agent', fromCustodianId: 7,
      toCustodianType: 'recipient_contact' });
    expect((await db.query('SELECT "totalDeliveriesCompleted" FROM public.agent WHERE id=4'))[0].totalDeliveriesCompleted).toBe(1);
  });

  it('rejects incomplete challenge and refuses rollback while challenge is pending', async () => {
    await expect(db.query(`UPDATE public.parcel SET "agentDeliveryCodeHash"='orphan' WHERE id=31`))
      .rejects.toThrow();
    const runner = db.createQueryRunner();
    try {
      await runner.startTransaction();
      const migration = new AddParcelAgentDeliveryChallenge1788280200000();
      await migration.down(runner);
      await migration.up(runner);
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally { await runner.release(); }
  });
});
