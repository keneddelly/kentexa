import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelAgentHandoffChallenge1788279600000 } from '../database/migrations/1788279600000-AddParcelAgentHandoffChallenge';
import { SuperAgentsService } from './super-agents.service';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ParcelCustodyEvent } from './entities/parcel-custody-event.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const config = getB5BTestConnectionConfig();
(config ? describe : describe.skip)('destination hub to assigned Agent custody on PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  const hub: any = { id: 6, userId: 9, city: 'Mwanza', businessName: 'Mwanza Hub',
    status: 'active', workspaceId: null };
  const hubUser: any = { id: 9 };
  const agentUser: any = { id: 7, name: 'Agent Seven' };
  const hubContext: any = { userId: 9, profileId: 6, accountRoleId: 17,
    roleType: AccountRoleType.SUPER_AGENT, workspaceId: null };
  const agentContext: any = { userId: 7, profileId: 4, accountRoleId: 18,
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
      status varchar NOT NULL, "buyerRequestedDelivery" boolean, "localAgentId" varchar,
      "destinationSuperAgentId" integer)`);
    await db.query(`CREATE TABLE public.parcel_tracking (id serial PRIMARY KEY,
      "parcelId" integer, status varchar NOT NULL)`);
    await db.query(`INSERT INTO public.parcel (id,"trackingNumber",status,"buyerRequestedDelivery",
      "localAgentId","destinationSuperAgentId") VALUES (31,'KTX-AGENT-31',$1,true,'7',6)`,
      [ParcelStatus.ARRIVED_AT_HUB]);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelAgentHandoffChallenge1788279600000().up(runner);
    } finally { await runner.release(); }
    await db.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType")
      VALUES (31,'destination_hub_received','destination-hub-received:6','super_agent',6,
        'account_role',9,17,'super_agent')`);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  function service(failTracking = false): any {
    const instance: any = Object.create(SuperAgentsService.prototype);
    instance.superAgentRepo = { findOne: async () => hub };
    instance.agentRepo = { findOne: async () => ({ id: 4, fullName: 'Agent Seven' }) };
    instance.dataSource = { transaction: (fn: any) => db.transaction(async manager => {
      const proxy: any = Object.create(manager);
      proxy.getRepository = (entity: any): any => {
        if (entity === Parcel) return {
          findOne: async () => {
            const [row] = await manager.query('SELECT * FROM public.parcel WHERE id=31');
            return { ...row, destinationSuperAgent: { ...hub, id: row.destinationSuperAgentId } };
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
             "actorRoleType","hubId","evidenceRef")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [v.parcelId,v.eventKind,v.operationKey,v.fromCustodianType,v.fromCustodianId,
              v.toCustodianType,v.toCustodianId,v.actorSource,v.actorUserId,v.actorAccountRoleId,
              v.actorRoleType,v.hubId,v.evidenceRef]),
        };
        if (entity === ParcelTracking) return { insert: (v: any) => {
          if (failTracking) throw Error('tracking unavailable');
          return manager.query('INSERT INTO public.parcel_tracking ("parcelId",status) VALUES (31,$1)', [v.status]);
        } };
        throw Error('unexpected repository');
      };
      return fn(proxy);
    }) };
    return instance;
  }

  it('rejects wrong actor/code, rolls back failed tracking, and commits one custody transition', async () => {
    const { code } = await service().issueAgentHandoffCode(hubUser, 'KTX-AGENT-31', hubContext);
    expect(code).toMatch(/^\d{6}$/);
    await expect(service().confirmAgentHandoff({ id: 8 }, 'KTX-AGENT-31', code,
      { ...agentContext, userId: 8 })).rejects.toThrow('another Agent');
    await expect(service().confirmAgentHandoff(agentUser, 'KTX-AGENT-31', '000000', agentContext))
      .rejects.toThrow('Incorrect');
    await expect(service(true).confirmAgentHandoff(agentUser, 'KTX-AGENT-31', code, agentContext))
      .rejects.toThrow('tracking unavailable');
    expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status).toBe(ParcelStatus.ARRIVED_AT_HUB);
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_custody_event'))[0].n).toBe(1);
    const results = await Promise.allSettled([
      service().confirmAgentHandoff(agentUser, 'KTX-AGENT-31', code, agentContext),
      service().confirmAgentHandoff(agentUser, 'KTX-AGENT-31', code, agentContext),
    ]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const [row] = await db.query(`SELECT status,"agentHandoffCodeHash" FROM public.parcel WHERE id=31`);
    expect(row).toMatchObject({ status: ParcelStatus.OUT_FOR_DELIVERY, agentHandoffCodeHash: null });
    const [event] = await db.query(`SELECT "fromCustodianType","fromCustodianId",
      "toCustodianType","toCustodianId" FROM public.parcel_custody_event
      WHERE "eventKind"='destination_agent_received'`);
    expect(event).toMatchObject({ fromCustodianType: 'super_agent', fromCustodianId: 6,
      toCustodianType: 'local_agent', toCustodianId: 7 });
  });

  it('rejects incomplete challenge rows and preserves historical Parcel on DOWN/re-UP', async () => {
    await expect(db.query(`UPDATE public.parcel SET "agentHandoffCodeHash"='orphan' WHERE id=31`))
      .rejects.toThrow();
    const runner = db.createQueryRunner();
    try {
      const migration = new AddParcelAgentHandoffChallenge1788279600000();
      await migration.down(runner);
      expect((await db.query('SELECT status FROM public.parcel WHERE id=31'))[0].status)
        .toBe(ParcelStatus.OUT_FOR_DELIVERY);
      await migration.up(runner);
      const [row] = await db.query(`SELECT "agentHandoffCodeHash", "agentHandoffAttempts" FROM public.parcel WHERE id=31`);
      expect(row).toMatchObject({ agentHandoffCodeHash: null, agentHandoffAttempts: 0 });
    } finally { await runner.release(); }
  });
});
