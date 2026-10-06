import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupTask1788283200000 } from '../database/migrations/1788283200000-AddParcelPickupTask';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { PickupTasksService } from './pickup-tasks.service';
import { assertFirstMileComplete } from './first-mile-guard';

/**
 * Stage 3S-A — the physical first mile on real PostgreSQL: sender -> Agent
 * (origin_agent_collected) and Agent -> exact origin hub (origin_hub_received),
 * cancellation, idempotency, concurrency and the boarding boundary. The real
 * custody-event and pickup-task migrations are executed; the surrounding
 * tables are the minimal columns the writers touch. Skipped (not failed)
 * without the dedicated test database; never touches production.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const uuid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SENDER = 5;
const roleOf = (type: AccountRoleType, profileId: number, userId: number, workspaceId: number | null = null) => ({
  userId, profileId, roleType: type, accountRoleId: profileId * 10 + (type === AccountRoleType.AGENT ? 1 : 2),
  profileType: type === AccountRoleType.AGENT ? 'agent' : 'super_agent', capabilities: [], sessionId: 't',
  contextVersion: 1, workspaceId,
} as any);
const agentRole = (id: number) => roleOf(AccountRoleType.AGENT, id, id);
const hubRole = (id: number) => roleOf(AccountRoleType.SUPER_AGENT, id, id * 10);

suite('Stage 3S-A first-mile handoff: real PostgreSQL', () => {
  jest.setTimeout(180000);
  let db: DataSource;
  let svc: PickupTasksService;
  let seq = 100;
  const q = (sql: string, p: any[] = []) => db.query(sql, p);

  /** One confirmed independent Shipment + Parcel, hub-routed to `hub` (or direct when null). */
  const mkShipment = async (hub: number | null = 7, city = 'Dar es Salaam') => {
    const id = ++seq;
    await q(`INSERT INTO public.shipment (id,"requestedByUserId",status,"originCity","destinationCity",
      "originHubSource","destinationHubSource","originHubId","originProviderKey","originResolutionMethod",
      "originLocationLabel","originRegionName","originDistrictName")
      VALUES ($1,$2,'confirmed',$3,$4,$5,'not_required',$6,'tz_seed','admin_seed','Kariakoo','Dar es Salaam','Ilala')`,
    [id, SENDER, city, hub ? 'Mwanza' : city, hub ? 'sender_selected' : 'not_required', hub]);
    await q(`INSERT INTO public.parcel (id,"shipmentId","orderId",status,"superAgentId") VALUES ($1,$1,NULL,'pending',$2)`, [id, hub]);
    return id;
  };
  const request = (shipmentId: number, path: 'hub_routed' | 'direct_delivery' = 'hub_routed') =>
    svc.requestForShipment(SENDER, shipmentId, { requestKey: uuid(++seq), servicePath: path, pickupContactName: 'Amina', pickupContactPhone: '+255700000001' });
  const task = async (shipmentId: number) => (await q('SELECT * FROM public.parcel_pickup_task WHERE "parcelId"=$1 ORDER BY id DESC LIMIT 1', [shipmentId]))[0];
  const events = (parcelId: number) => q('SELECT * FROM public.parcel_custody_event WHERE "parcelId"=$1 ORDER BY id', [parcelId]);
  const tracking = async (parcelId: number) => (await q('SELECT count(*)::int n FROM public.parcel_tracking WHERE "parcelId"=$1', [parcelId]))[0].n as number;
  const parcelStatus = async (id: number) => (await q('SELECT status FROM public.parcel WHERE id=$1', [id]))[0].status as string;
  /** claim by `agent`, issue + return the sender's code */
  const claimed = async (shipmentId: number, agent = 9) => {
    const t = await request(shipmentId);
    await svc.claim(t.id, agent, agentRole(agent));
    const { code } = await svc.issueHandoffCode(SENDER, shipmentId);
    return { taskId: t.id as number, code };
  };
  const collected = async (shipmentId: number, agent = 9) => {
    const c = await claimed(shipmentId, agent);
    await svc.collect(c.taskId, agent, agentRole(agent), c.code);
    return c.taskId;
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port, username: config!.user,
      password: config!.password, database: config!.database, synchronize: false, entities: [], extra: { max: 20 } });
    await db.initialize();
    await q(`CREATE TABLE public.shipment (id integer PRIMARY KEY, "requestedByUserId" integer NOT NULL, status text NOT NULL,
      "originCity" text NOT NULL, "destinationCity" text NOT NULL, "originHubSource" text, "destinationHubSource" text,
      "originHubId" integer, "originProviderKey" text, "originResolutionMethod" text, "originLocationLabel" text,
      "originLatitude" double precision, "originLongitude" double precision, "originRegionName" text, "originDistrictName" text,
      "collectedAt" timestamp,
      -- Gate 3: the columns the ONE Shipment projector reads and writes.
      "orderId" integer, "deliveredAt" timestamp, "completedAt" timestamp, "updatedAt" timestamp)`);
    await q(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "shipmentId" integer, "orderId" integer, status text NOT NULL, "superAgentId" integer)`);
    await q(`CREATE TABLE public.super_agent (id integer PRIMARY KEY, "userId" integer, status text NOT NULL, "workspaceId" integer,
      city text, "businessName" text, phone text, address text)`);
    await q(`CREATE TABLE public.agent (id integer PRIMARY KEY, "userId" integer, status text, city text, "fullName" text)`);
    await q(`CREATE TABLE public.parcel_collection (id integer PRIMARY KEY, "parcelId" integer, status text)`);
    await q(`CREATE TABLE public.parcel_tracking (id SERIAL PRIMARY KEY, "parcelId" integer NOT NULL, status text NOT NULL, city text, note text,
      "updatedBy" text, "handlerPhone" text, "handlerLocation" text, "handlerType" text, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q(`INSERT INTO public.super_agent VALUES (7,70,'active',NULL,'Dar es Salaam','Hub Seven','0700','Kariakoo'),
      (8,80,'active',NULL,'Dar es Salaam','Hub Eight','0800','Ilala'),(6,60,'active',31,'Dar es Salaam','Bound Hub','0600','Posta')`);
    await q(`INSERT INTO public.agent VALUES (9,9,'approved','Dar es Salaam','Agent Nine'),(10,10,'approved','Dar es Salaam','Agent Ten'),
      (11,11,'suspended','Dar es Salaam','Agent Eleven'),(12,12,'approved','Arusha','Agent Twelve')`);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      await new AddParcelPickupTask1788283200000().up(runner);
    } finally { await runner.release(); }
    svc = new PickupTasksService(db);
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('full path: request -> claim -> sender code -> Agent collects -> Agent asks -> exact hub receives; exactly one event per handoff, all changes together', async () => {
    const s = await mkShipment(7);
    const { taskId, code } = await claimed(s);
    // claim/code alone prove nothing
    expect(await events(s)).toHaveLength(0);
    expect(await parcelStatus(s)).toBe('pending');

    await expect(svc.collect(taskId, 10, agentRole(10), code)).rejects.toThrow('not assigned to you');
    await expect(svc.collect(taskId, 9, agentRole(9), '000000')).rejects.toThrow('Incorrect');
    expect((await task(s)).handoffAttempts).toBe(1);
    expect(await events(s)).toHaveLength(0);

    expect(await svc.collect(taskId, 9, agentRole(9), code)).toMatchObject({ status: 'collected', replay: false });
    let ev = await events(s);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ eventKind: 'origin_agent_collected', operationKey: `pickup-task-collected:${taskId}`,
      fromCustodianType: null, toCustodianType: 'local_agent', toCustodianId: 9, actorUserId: 9, actorRoleType: 'agent' });
    expect(await parcelStatus(s)).toBe('collected_by_agent');
    expect((await q('SELECT status,"collectedAt" FROM public.shipment WHERE id=$1', [s]))[0]).toMatchObject({ status: 'collected' });
    expect(await tracking(s)).toBe(1);
    const t = await task(s);
    expect(t).toMatchObject({ status: 'collected', handoffCodeHash: null, handoffCodeExpiresAt: null, handoffAttempts: 0 });
    expect(t.collectedAt).toBeTruthy();

    // hub cannot receive before the Agent asks; the Agent cannot receive for the hub
    await expect(svc.hubReceive(taskId, 70, hubRole(7))).rejects.toThrow('has not asked');
    await expect(svc.hubReceive(taskId, 9, agentRole(9))).rejects.toThrow('Super Agent');
    await expect(svc.requestHubHandover(taskId, 10, agentRole(10))).rejects.toThrow('not assigned to you');
    expect(await svc.requestHubHandover(taskId, 9, agentRole(9))).toMatchObject({ status: 'awaiting_hub', replay: false });
    expect(await svc.requestHubHandover(taskId, 9, agentRole(9))).toMatchObject({ status: 'awaiting_hub', replay: true });
    expect(await events(s)).toHaveLength(1); // the request is NOT custody
    expect(await parcelStatus(s)).toBe('collected_by_agent');

    await expect(svc.hubReceive(taskId, 80, hubRole(8))).rejects.toThrow('selected origin hub');
    expect(await events(s)).toHaveLength(1);
    expect(await svc.hubReceive(taskId, 70, hubRole(7))).toMatchObject({ status: 'hub_received', replay: false });
    ev = await events(s);
    expect(ev.map((e: any) => e.eventKind)).toEqual(['origin_agent_collected', 'origin_hub_received']);
    expect(ev[1]).toMatchObject({ operationKey: `pickup-task-hub-received:${taskId}`, fromCustodianType: 'local_agent',
      fromCustodianId: 9, toCustodianType: 'super_agent', toCustodianId: 7, hubId: 7, actorRoleType: 'super_agent' });
    expect(await parcelStatus(s)).toBe('received_at_hub');
    expect((await task(s)).status).toBe('hub_received');
    expect(await tracking(s)).toBe(2);
  });

  it('idempotent: replays after commit change nothing (lost response), and another actor cannot ride the replay', async () => {
    const s = await mkShipment(7);
    const { taskId, code } = await claimed(s);
    await svc.collect(taskId, 9, agentRole(9), code);
    expect(await svc.collect(taskId, 9, agentRole(9), code)).toMatchObject({ replay: true });
    expect(await svc.collect(taskId, 9, agentRole(9), '111111')).toMatchObject({ replay: true }); // proof already committed
    await expect(svc.collect(taskId, 10, agentRole(10), code)).rejects.toThrow('another Agent');
    await svc.requestHubHandover(taskId, 9, agentRole(9));
    await svc.hubReceive(taskId, 70, hubRole(7));
    expect(await svc.hubReceive(taskId, 70, hubRole(7))).toMatchObject({ replay: true });
    await expect(svc.hubReceive(taskId, 80, hubRole(8))).rejects.toThrow(); // a different hub cannot replay it
    expect(await events(s)).toHaveLength(2);
    expect(await tracking(s)).toBe(2);
  });

  it('concurrent retries never duplicate custody: parallel collects and parallel hub receipts each write ONE event', async () => {
    const s = await mkShipment(7);
    const { taskId, code } = await claimed(s);
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => svc.collect(taskId, 9, agentRole(9), code)));
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(res.filter((r: any) => r.value.replay === false)).toHaveLength(1);
    expect(await events(s)).toHaveLength(1);
    await svc.requestHubHandover(taskId, 9, agentRole(9));
    const hub = await Promise.allSettled(Array.from({ length: 6 }, () => svc.hubReceive(taskId, 70, hubRole(7))));
    expect(hub.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await events(s)).toHaveLength(2);
    expect(await tracking(s)).toBe(2);
  });

  it('two Agents racing: only the claim winner can collect; the loser never gets custody', async () => {
    const s = await mkShipment(7);
    const t = await request(s);
    const claims = await Promise.allSettled([svc.claim(t.id, 9, agentRole(9)), svc.claim(t.id, 10, agentRole(10))]);
    expect(claims.filter((c) => c.status === 'fulfilled')).toHaveLength(1);
    const winner = (await task(s)).agentProfileId as number;
    const loser = winner === 9 ? 10 : 9;
    const { code } = await svc.issueHandoffCode(SENDER, s);
    await expect(svc.collect(t.id, loser, agentRole(loser), code)).rejects.toThrow('not assigned to you');
    expect(await events(s)).toHaveLength(0);
    await svc.collect(t.id, winner, agentRole(winner), code);
    expect((await events(s))[0].toCustodianId).toBe(winner);
  });

  it('sender handoff proof rules: needs a claimed Agent, owner-only, cooldown, expiry, attempt limit, stale Agent', async () => {
    const s = await mkShipment(7);
    const t = await request(s);
    await expect(svc.issueHandoffCode(SENDER, s)).rejects.toThrow('claimed Agent');
    await svc.claim(t.id, 9, agentRole(9));
    await expect(svc.issueHandoffCode(99, s)).rejects.toThrow('Not your shipment');
    const first = await svc.issueHandoffCode(SENDER, s);
    await expect(svc.issueHandoffCode(SENDER, s)).rejects.toThrow('Wait');
    await expect(svc.collect(t.id, 9, agentRole(9), 'abc')).rejects.toThrow('six-digit');

    // a fresh code (after the cooldown) invalidates the old one
    await q(`UPDATE public.parcel_pickup_task SET "handoffCodeIssuedAt"=now()-interval '2 minutes' WHERE id=$1`, [t.id]);
    const second = await svc.issueHandoffCode(SENDER, s);
    if (second.code !== first.code) await expect(svc.collect(t.id, 9, agentRole(9), first.code)).rejects.toThrow('Incorrect');

    // attempt limit
    await q('UPDATE public.parcel_pickup_task SET "handoffAttempts"=5 WHERE id=$1', [t.id]);
    await expect(svc.collect(t.id, 9, agentRole(9), second.code)).rejects.toThrow('expired or unavailable');
    await q('UPDATE public.parcel_pickup_task SET "handoffAttempts"=0 WHERE id=$1', [t.id]);
    // expiry
    await q(`UPDATE public.parcel_pickup_task SET "handoffCodeExpiresAt"=now()-interval '1 second' WHERE id=$1`, [t.id]);
    await expect(svc.collect(t.id, 9, agentRole(9), second.code)).rejects.toThrow('expired or unavailable');
    await q(`UPDATE public.parcel_pickup_task SET "handoffCodeExpiresAt"=now()+interval '5 minutes' WHERE id=$1`, [t.id]);
    // stale Agent role: profile suspended after claiming
    await q("UPDATE public.agent SET status='suspended' WHERE id=9");
    await expect(svc.collect(t.id, 9, agentRole(9), second.code)).rejects.toThrow('Approved active Agent');
    await q("UPDATE public.agent SET status='approved' WHERE id=9");
    // role/user mismatch and a non-Agent role
    await expect(svc.collect(t.id, 9, agentRole(10), second.code)).rejects.toThrow('Active Agent context');
    await expect(svc.collect(t.id, 9, hubRole(7), second.code)).rejects.toThrow('Active Agent context');
    expect(await events(s)).toHaveLength(0);
    await svc.collect(t.id, 9, agentRole(9), second.code);
    expect(await events(s)).toHaveLength(1);
  });

  it('an Agent that no longer covers the pickup city cannot collect', async () => {
    const s = await mkShipment(7);
    const { taskId, code } = await claimed(s);
    await q("UPDATE public.agent SET city='Arusha' WHERE id=9");
    await expect(svc.collect(taskId, 9, agentRole(9), code)).rejects.toThrow('cover');
    await q("UPDATE public.agent SET city='Dar es Salaam' WHERE id=9");
    expect(await events(s)).toHaveLength(0);
  });

  it('hub authority: only the active, exact selected hub (and its bound workspace) may receive; a suspended hub fails closed', async () => {
    const s = await mkShipment(7);
    const taskId = await collected(s);
    await svc.requestHubHandover(taskId, 9, agentRole(9));
    await expect(svc.hubReceive(taskId, 999, hubRole(7))).rejects.toThrow('Super Agent context');
    // hub 6 is bound to workspace 31: a role without that workspace fails; with it, it is still not THE selected hub
    await expect(svc.hubReceive(taskId, 60, hubRole(6))).rejects.toThrow('active receiving hub');
    await expect(svc.hubReceive(taskId, 60, roleOf(AccountRoleType.SUPER_AGENT, 6, 60, 31))).rejects.toThrow('selected origin hub');
    await q("UPDATE public.super_agent SET status='suspended' WHERE id=7");
    await expect(svc.hubReceive(taskId, 70, hubRole(7))).rejects.toThrow('active receiving hub');
    await q("UPDATE public.super_agent SET status='active' WHERE id=7");
    // the Parcel's own origin-hub link must agree with the task's hub
    await q('UPDATE public.parcel SET "superAgentId"=8 WHERE id=$1', [s]);
    await expect(svc.hubReceive(taskId, 70, hubRole(7))).rejects.toThrow('cannot be received');
    await q('UPDATE public.parcel SET "superAgentId"=7 WHERE id=$1', [s]);
    expect(await events(s)).toHaveLength(1);
    await svc.hubReceive(taskId, 70, hubRole(7));
    expect(await events(s)).toHaveLength(2);
  });

  it('the last valid custody must belong to the assigned Agent: a tampered/missing ledger blocks hub receipt', async () => {
    const s = await mkShipment(7);
    const taskId = await collected(s);
    await svc.requestHubHandover(taskId, 9, agentRole(9));
    // simulate a different, later custodian on the ledger (someone else took the Parcel)
    await q(`INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
      "actorSource") VALUES ($1,'origin_hub_received','other-op','super_agent',8,'system')`, [s]);
    await expect(svc.hubReceive(taskId, 70, hubRole(7))).rejects.toThrow('does not currently hold');
    expect((await task(s)).status).toBe('awaiting_hub');
    expect(await parcelStatus(s)).toBe('collected_by_agent');
  });

  it('cancellation: allowed before collection (history kept, claim released for a new request); refused after custody exists', async () => {
    const s = await mkShipment(7);
    const t = await request(s);
    await svc.claim(t.id, 9, agentRole(9));
    await svc.issueHandoffCode(SENDER, s);
    await expect(svc.cancel(99, s)).rejects.toThrow('Not your shipment');
    expect(await svc.cancel(SENDER, s)).toMatchObject({ status: 'cancelled', replay: false });
    expect(await svc.cancel(SENDER, s)).toMatchObject({ status: 'cancelled', replay: true });
    const row = await task(s);
    expect(row).toMatchObject({ id: t.id, status: 'cancelled', agentProfileId: 9, handoffCodeHash: null }); // audit identity kept
    expect(row.cancelledAt).toBeTruthy();
    await expect(svc.collect(t.id, 9, agentRole(9), '123456')).rejects.toThrow();
    expect(await events(s)).toHaveLength(0);
    // a fresh request is possible again (the active-task index no longer holds)
    expect(await request(s)).toMatchObject({ status: 'requested' });

    // after physical collection: cannot erase custody
    const s2 = await mkShipment(7);
    const taskId = await collected(s2);
    await expect(svc.cancel(SENDER, s2)).rejects.toThrow('Custody has already started');
    await svc.requestHubHandover(taskId, 9, agentRole(9));
    await expect(svc.cancel(SENDER, s2)).rejects.toThrow('Custody has already started');
    await svc.hubReceive(taskId, 70, hubRole(7));
    await expect(svc.cancel(SENDER, s2)).rejects.toThrow('Custody has already started');
    expect(await events(s2)).toHaveLength(2);
    expect((await task(s2)).status).toBe('hub_received');
  });

  it('direct (no-hub) pickups never end at a hub and never mint hub custody', async () => {
    const s = await mkShipment(null);
    const { taskId, code } = await (async () => {
      const t = await request(s, 'direct_delivery');
      await svc.claim(t.id, 9, agentRole(9));
      return { taskId: t.id as number, code: (await svc.issueHandoffCode(SENDER, s)).code };
    })();
    await svc.collect(taskId, 9, agentRole(9), code);
    await expect(svc.requestHubHandover(taskId, 9, agentRole(9))).rejects.toThrow('Direct pickups');
    await expect(svc.hubReceive(taskId, 70, hubRole(7))).rejects.toThrow('selected origin hub');
    expect((await events(s)).map((e: any) => e.eventKind)).toEqual(['origin_agent_collected']);
  });

  it('a Parcel that already has custody evidence or a legacy collection job cannot be collected through a task', async () => {
    const s = await mkShipment(7);
    const { taskId, code } = await claimed(s);
    await q(`INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId",
      "actorSource") VALUES ($1,'origin_hub_received','desk-1','super_agent',7,'system')`, [s]);
    await expect(svc.collect(taskId, 9, agentRole(9), code)).rejects.toThrow('already has custody');
    const s2 = await mkShipment(7);
    const c2 = await claimed(s2);
    await q("INSERT INTO public.parcel_collection VALUES ($1,$2,'requested')", [s2, s2]);
    await expect(svc.collect(c2.taskId, 9, agentRole(9), c2.code)).rejects.toThrow('collection job');
    await q('DELETE FROM public.parcel_collection WHERE id=$1', [s2]);
  });

  describe('boarding boundary: nothing moves on before physical origin-hub receipt', () => {
    it('the guard blocks every open first-mile state and releases only at hub_received / cancelled', async () => {
      const s = await mkShipment(7);
      await expect(assertFirstMileComplete(db, s)).resolves.toBeUndefined(); // no task at all (desk/legacy)
      const t = await request(s);
      await expect(assertFirstMileComplete(db, s)).rejects.toThrow('first-mile');
      await svc.claim(t.id, 9, agentRole(9));
      await expect(assertFirstMileComplete(db, s)).rejects.toThrow('first-mile');
      const { code } = await svc.issueHandoffCode(SENDER, s);
      await svc.collect(t.id, 9, agentRole(9), code);
      await expect(assertFirstMileComplete(db, [s])).rejects.toThrow('first-mile');
      await svc.requestHubHandover(t.id, 9, agentRole(9));
      await expect(assertFirstMileComplete(db, s)).rejects.toThrow('first-mile');
      await svc.hubReceive(t.id, 70, hubRole(7));
      await expect(assertFirstMileComplete(db, s)).resolves.toBeUndefined();

      const c = await mkShipment(7);
      await request(c);
      await expect(assertFirstMileComplete(db, c)).rejects.toThrow('first-mile');
      await svc.cancel(SENDER, c);
      await expect(assertFirstMileComplete(db, c)).resolves.toBeUndefined();
    });

    it('a batch check fails if ANY Parcel in it is still in first mile', async () => {
      const a = await mkShipment(7); const b = await mkShipment(7);
      await request(b);
      await expect(assertFirstMileComplete(db, [a, b])).rejects.toThrow('first-mile');
      await expect(assertFirstMileComplete(db, [a])).resolves.toBeUndefined();
      await expect(assertFirstMileComplete(db, [])).resolves.toBeUndefined();
    });

    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
    it('every path that could dispatch, bulk-link or board a Parcel calls the guard (structural)', () => {
      const sa = read('super-agents/super-agents.service.ts');
      expect(sa).toMatch(/moved beyond origin dispatch'\);\s*\}\s*await assertFirstMileComplete\(manager, parcel\.id\)/);
      expect(sa).toMatch(/hakipatikani`\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*await assertFirstMileComplete\(this\.dataSource, parcel\.id\)/);
      expect(sa).toMatch(/await assertFirstMileComplete\(manager, candidates\.map\(p => p\.id\)\)/);
      expect(sa).toMatch(/await assertFirstMileComplete\(manager, locked\.map\(p => p\.id\)\)/);
      expect(read('transport/transport.service.ts')).toMatch(/await assertFirstMileComplete\(manager, parcel\.id\)/);
    });

    it('the pickup writers never reference Runs, Vans, dispatch or transport statuses, nor the destination last-mile flow (structural)', () => {
      const src = read('shipments/pickup-tasks.service.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const forbidden of ['bulk_shipment', 'transport_assignment', "'dispatched'", "'in_transit'", 'daily_batch', 'localAgentId',
        'agentHandoff', 'agentDelivery', 'destinationSuperAgent', 'destination_hub_received']) {
        expect(src).not.toContain(forbidden);
      }
    });
  });

  it('desk intake and the legacy Order collection flow are unchanged (no diff in their files)', () => {
    const legacy = ['parcel-collections/parcel-collections.service.ts'];
    for (const f of legacy) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8');
      expect(src).not.toContain('parcel_pickup_task');
      expect(src).not.toContain('first-mile-guard');
    }
  });
});
