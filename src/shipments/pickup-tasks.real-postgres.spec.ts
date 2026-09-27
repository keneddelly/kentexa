import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelPickupTask1788282600000 } from '../database/migrations/1788282600000-AddParcelPickupTask';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { PickupTasksService } from './pickup-tasks.service';

const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const body = (n: number, servicePath: 'direct_delivery' | 'hub_routed' = 'direct_delivery') => ({
  requestKey: uuid(n), servicePath, pickupContactName: 'Amina', pickupContactPhone: '+255700000001',
});

suite('Stage 3S pickup request and claim: real PostgreSQL', () => {
  jest.setTimeout(120000);
  let db: DataSource;
  let service: PickupTasksService;
  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port,
      username: config!.user, password: config!.password, database: config!.database,
      synchronize: false, entities: [] });
    await db.initialize();
    await db.query(`CREATE TABLE public.shipment (
      id integer PRIMARY KEY, "requestedByUserId" integer NOT NULL, status text NOT NULL,
      "originCity" text NOT NULL, "destinationCity" text NOT NULL,
      "originHubSource" text, "destinationHubSource" text, "originHubId" integer,
      "originProviderKey" text, "originResolutionMethod" text,
      "originLocationLabel" text, "originLatitude" double precision,
      "originLongitude" double precision, "originRegionName" text, "originDistrictName" text)`);
    await db.query(`CREATE TABLE public.parcel (
      id integer PRIMARY KEY, "shipmentId" integer, "orderId" integer, status text NOT NULL)`);
    await db.query('CREATE TABLE public.super_agent (id integer PRIMARY KEY, status text NOT NULL)');
    await db.query('CREATE TABLE public.agent (id integer PRIMARY KEY, "userId" integer, status text, city text)');
    await db.query('CREATE TABLE public.parcel_collection (id integer PRIMARY KEY, "parcelId" integer, status text)');
    await db.query(`INSERT INTO public.shipment VALUES
      (1,5,'confirmed','Dar es Salaam','Dar es Salaam','not_required','not_required',NULL,'tz_seed','admin_seed','Kariakoo',NULL,NULL,'Dar es Salaam','Ilala'),
      (2,5,'confirmed','Dar es Salaam','Mwanza','sender_selected','not_required',7,'tz_seed','admin_seed','Kariakoo',NULL,NULL,'Dar es Salaam','Ilala'),
      (3,5,'confirmed','Dar es Salaam','Dar es Salaam','not_required','not_required',NULL,'user','user_typed','Kariakoo',NULL,NULL,NULL,NULL),
      (4,5,'confirmed','Dar es Salaam','Dar es Salaam','not_required','not_required',NULL,'tz_seed','admin_seed','Kariakoo',NULL,NULL,'Dar es Salaam','Ilala')`);
    await db.query(`INSERT INTO public.parcel VALUES
      (1,1,NULL,'pending'),(2,2,NULL,'pending'),(3,3,NULL,'pending'),(4,4,NULL,'pending')`);
    await db.query("INSERT INTO public.super_agent VALUES (7,'active')");
    await db.query("INSERT INTO public.agent VALUES (9,9,'approved','Dar es Salaam'),(10,10,'approved','Dar es Salaam'),(11,11,'suspended','Dar es Salaam')");
    const runner = db.createQueryRunner();
    try { await new AddParcelPickupTask1788282600000().up(runner); } finally { await runner.release(); }
    service = new PickupTasksService(db);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('creates one personal direct task and replays only matching details', async () => {
    const first = await service.requestForShipment(5, 1, body(1));
    expect(first).toMatchObject({ parcelId: 1, status: 'requested', replay: false });
    expect(await service.requestForShipment(5, 1, body(1))).toMatchObject({ id: first.id, replay: true });
    await expect(service.requestForShipment(5, 1, { ...body(1), pickupContactName: 'Other' })).rejects.toThrow();
    await expect(service.requestForShipment(6, 1, body(2))).rejects.toThrow();
    await expect(service.requestForShipment(5, 1, body(2))).rejects.toThrow();
    expect((await db.query('SELECT count(*)::int AS n FROM public.parcel_pickup_task'))[0].n).toBe(1);
  });

  it('requires server-resolved origin and a compatible explicit hub decision', async () => {
    await expect(service.requestForShipment(5, 3, body(3))).rejects.toThrow('resolved origin');
    await expect(service.requestForShipment(5, 2, body(4))).rejects.toThrow('no-hub intracity');
    expect(await service.requestForShipment(5, 2, body(5, 'hub_routed'))).toMatchObject({ parcelId: 2 });
    await db.query("UPDATE public.super_agent SET status='suspended' WHERE id=7");
    await expect(service.requestForShipment(5, 2, body(6, 'hub_routed'))).rejects.toThrow('unavailable');
  });

  it('does not create a competing job against legacy collection', async () => {
    await db.query("INSERT INTO public.parcel_collection VALUES (1,4,'requested')");
    await expect(service.requestForShipment(5, 4, body(7))).rejects.toThrow('collection job');
    await db.query('DELETE FROM public.parcel_collection WHERE id=1');
  });

  it('requires an approved active Agent in the exact city and resolves claim races once', async () => {
    const task = (await service.requestForShipment(5, 4, body(8))).id;
    const role = (profileId: number, userId: number) => ({
      userId, profileId, roleType: AccountRoleType.AGENT, accountRoleId: profileId,
      profileType: 'agent', capabilities: [], sessionId: 'test', contextVersion: 1,
    } as any);
    await expect(service.claim(task, 11, role(11, 11))).rejects.toThrow('Approved');
    const outcomes = await Promise.allSettled([
      service.claim(task, 9, role(9, 9)), service.claim(task, 10, role(10, 10)),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const row = (await db.query('SELECT status,"agentProfileId" FROM public.parcel_pickup_task WHERE id=$1', [task]))[0];
    expect(row.status).toBe('claimed');
    expect([9,10]).toContain(row.agentProfileId);
    expect(await service.claim(task, row.agentProfileId, role(row.agentProfileId, row.agentProfileId)))
      .toMatchObject({ replay: true });
    expect((await db.query('SELECT status FROM public.parcel WHERE id=4'))[0].status).toBe('pending');
  });

  it('replays the original request after physical progress but refuses a new task', async () => {
    await db.query("UPDATE public.shipment SET status='collected' WHERE id=4");
    await db.query("UPDATE public.parcel SET status='collected_by_agent' WHERE id=4");
    expect(await service.requestForShipment(5, 4, body(8)))
      .toMatchObject({ parcelId: 4, status: 'claimed', replay: true });
    await expect(service.requestForShipment(5, 4, body(9))).rejects.toThrow('not ready');
  });
});
