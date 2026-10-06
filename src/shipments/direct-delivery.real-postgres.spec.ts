import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { AddParcelCustodyEvent1788278400000 } from '../database/migrations/1788278400000-AddParcelCustodyEvent';
import { AddParcelPickupChallenge1788279000000 } from '../database/migrations/1788279000000-AddParcelPickupChallenge';
import { AddParcelPickupTask1788283200000 } from '../database/migrations/1788283200000-AddParcelPickupTask';
import { AddPickupTaskDirectDelivery1788292800000 } from '../database/migrations/1788292800000-AddPickupTaskDirectDelivery';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { PickupTasksService } from './pickup-tasks.service';

/**
 * Logistics repair Gate 4 — first mile and DIRECT Agent delivery, on real
 * PostgreSQL with the real custody, pickup-task and Gate 4 migrations.
 *
 * The journey the audit found missing end to end:
 *
 *   sender requests pickup -> an eligible Agent sees the job -> claims it ->
 *   verified sender -> Agent handover -> the Agent carries the parcel ->
 *   verified Agent -> recipient handover -> delivered
 *
 * and the tracking it must leave behind: Sender -> Agent -> Recipient, with
 * no hub, vehicle or transporter invented along the way.
 *
 * The surrounding tables carry the minimal columns the writers touch; SMS is
 * a recorder. Skipped (not failed) without the dedicated test database.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const uuid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SENDER = 5;
const RECIPIENT_PHONE = '+255712000001';
const agentRole = (id: number) => ({
  userId: id, profileId: id, roleType: AccountRoleType.AGENT, accountRoleId: id * 10 + 1,
  profileType: 'agent', capabilities: [], sessionId: 't', contextVersion: 1, workspaceId: null,
} as any);
const hubRole = (id: number) => ({ ...agentRole(id), userId: id * 10, roleType: AccountRoleType.SUPER_AGENT, profileType: 'super_agent' });

suite('Gate 4 — first mile and direct Agent delivery, real PostgreSQL', () => {
  jest.setTimeout(180000);
  let db: DataSource;
  let svc: PickupTasksService;
  let seq = 100;
  let smsWorks = true;
  const sent: Array<{ phone: string; message: string; sensitive: boolean }> = [];
  const sms: any = {
    sendSms: async (phone: string, message: string, sensitive = false) => {
      if (!smsWorks) return false;
      sent.push({ phone, message, sensitive });
      return true;
    },
  };
  const q = (sql: string, p: any[] = []) => db.query(sql, p);
  const lastCode = () => /ni (\d{6})\./.exec(sent[sent.length - 1].message)![1];

  /** One confirmed self-service Shipment + Parcel: direct (no hub) unless `hub` is given. */
  const mkShipment = async (hub: number | null = null, city = 'Dar es Salaam') => {
    const id = ++seq;
    await q(`INSERT INTO public.shipment (id,"requestedByUserId",status,"originCity","destinationCity",
      "originHubSource","destinationHubSource","originHubId","originProviderKey","originResolutionMethod",
      "originLocationLabel","originRegionName","originDistrictName","destinationLocationLabel",
      "receiverName","receiverPhone","itemDescription","weightKg","trackingNumber")
      VALUES ($1,$2,'confirmed',$3,$4,$5,'not_required',$6,'tz_seed','admin_seed','Kariakoo, Ilala','Dar es Salaam','Ilala',
              'Mbagala, Temeke','Amina Juma',$7,'Nguo za watoto',2,$8)`,
    [id, SENDER, city, hub ? 'Mwanza' : city, hub ? 'sender_selected' : 'not_required', hub, RECIPIENT_PHONE, `KTX-SHP-${id}`]);
    await q(`INSERT INTO public.parcel (id,"shipmentId","orderId",status,"superAgentId","trackingNumber")
      VALUES ($1,$1,NULL,'pending',$2,$3)`, [id, hub, `KTX-SHP-${id}`]);
    return id;
  };
  const request = (shipmentId: number, path: 'hub_routed' | 'direct_delivery' = 'direct_delivery') =>
    svc.requestForShipment(SENDER, shipmentId, {
      requestKey: uuid(++seq), servicePath: path, pickupContactName: 'Baraka', pickupContactPhone: '+255713000002',
    });
  const task = async (shipmentId: number) => (await q('SELECT * FROM public.parcel_pickup_task WHERE "parcelId"=$1 ORDER BY id DESC LIMIT 1', [shipmentId]))[0];
  const events = (parcelId: number) => q('SELECT * FROM public.parcel_custody_event WHERE "parcelId"=$1 ORDER BY id', [parcelId]);
  const trackingRows = (parcelId: number) => q('SELECT status,"handlerType",note FROM public.parcel_tracking WHERE "parcelId"=$1 ORDER BY id', [parcelId]);
  const parcel = async (id: number) => (await q('SELECT * FROM public.parcel WHERE id=$1', [id]))[0];
  const shipment = async (id: number) => (await q('SELECT * FROM public.shipment WHERE id=$1', [id]))[0];
  /** request -> claim by `agent` -> sender's code -> the Agent collects. Returns the task id. */
  const collected = async (shipmentId: number, agent = 9, path: 'hub_routed' | 'direct_delivery' = 'direct_delivery') => {
    const t = await request(shipmentId, path);
    await svc.claim(t.id, agent, agentRole(agent));
    const { code } = await svc.issueHandoffCode(SENDER, shipmentId);
    await svc.collect(t.id, agent, agentRole(agent), code);
    return t.id as number;
  };

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    try { await resetB5BTestSchema(client); } finally { await client.end(); }
    db = new DataSource({ type: 'postgres', host: config!.host, port: config!.port, username: config!.user,
      password: config!.password, database: config!.database, synchronize: false, entities: [], extra: { max: 20 } });
    await db.initialize();
    await q(`DROP TABLE IF EXISTS public.parcel_pickup_task, public.parcel_tracking, public.parcel_custody_event,
      public.parcel_collection, public.parcel, public.shipment, public.agent, public.super_agent,
      public.journey_leg, public.transport_run, public.transport_provider CASCADE`);
    await q(`CREATE TABLE public.shipment (id integer PRIMARY KEY, "requestedByUserId" integer NOT NULL, status text NOT NULL,
      "originCity" text NOT NULL, "destinationCity" text NOT NULL, "originHubSource" text, "destinationHubSource" text,
      "originHubId" integer, "originProviderKey" text, "originResolutionMethod" text, "originLocationLabel" text,
      "originLatitude" double precision, "originLongitude" double precision, "originRegionName" text, "originDistrictName" text,
      "destinationLocationLabel" text, "receiverName" text, "receiverPhone" text, "itemDescription" text, "weightKg" numeric,
      "trackingNumber" text, "orderId" integer, "collectedAt" timestamp, "deliveredAt" timestamp, "completedAt" timestamp,
      "updatedAt" timestamp, "journeySelectionId" integer, "senderName" text, "senderPhone" text)`);
    // Gate 5: the columns the hub's "expected" list reads about a booked trip.
    await q(`CREATE TABLE public.transport_provider (id integer PRIMARY KEY, name text)`);
    await q(`CREATE TABLE public.transport_run (id integer PRIMARY KEY, "providerId" integer, "scheduledDeparture" timestamp)`);
    await q(`CREATE TABLE public.journey_leg (id SERIAL PRIMARY KEY, "journeySelectionId" integer, sequence integer, type text, "runId" integer)`);
    await q(`INSERT INTO public.transport_provider VALUES (3, 'Kentexa Van')`);
    await q(`INSERT INTO public.transport_run VALUES (30, 3, '2026-10-08 03:00:00')`);
    await q(`INSERT INTO public.journey_leg ("journeySelectionId", sequence, type, "runId") VALUES (800, 1, 'transport', 30)`);
    await q(`CREATE TABLE public.parcel (id integer PRIMARY KEY, "shipmentId" integer, "orderId" integer, status text NOT NULL,
      "superAgentId" integer, "trackingNumber" text, "deliveredTime" timestamp, "buyerConfirmed" boolean NOT NULL DEFAULT false)`);
    await q(`CREATE TABLE public.super_agent (id integer PRIMARY KEY, "userId" integer, status text NOT NULL, "workspaceId" integer,
      city text, "businessName" text, phone text, address text)`);
    await q(`CREATE TABLE public.agent (id integer PRIMARY KEY, "userId" integer, status text, city text, "fullName" text, phone text)`);
    await q(`CREATE TABLE public.parcel_collection (id integer PRIMARY KEY, "parcelId" integer, status text)`);
    await q(`CREATE TABLE public.parcel_tracking (id SERIAL PRIMARY KEY, "parcelId" integer NOT NULL, status text NOT NULL, city text, note text,
      "updatedBy" text, "handlerPhone" text, "handlerLocation" text, "handlerType" text, "createdAt" timestamp NOT NULL DEFAULT now())`);
    await q(`INSERT INTO public.super_agent VALUES (7,70,'active',NULL,'Dar es Salaam','Hub Seven','0700','Kariakoo')`);
    await q(`INSERT INTO public.agent VALUES (9,9,'approved','Dar es Salaam','Agent Nine','0709'),(10,10,'approved','Dar es salaam ','Agent Ten','0710'),
      (11,11,'suspended','Dar es Salaam','Agent Eleven','0711'),(12,12,'approved','Arusha','Agent Twelve','0712')`);
    const runner = db.createQueryRunner();
    try {
      await new AddParcelCustodyEvent1788278400000().up(runner);
      // The production ledger shape: this later migration is what allows a
      // custody event to name "the recipient" (a contact, not an account).
      await new AddParcelPickupChallenge1788279000000().up(runner);
      await new AddParcelPickupTask1788283200000().up(runner);
      await new AddPickupTaskDirectDelivery1788292800000().up(runner);
      await new AddPickupTaskDirectDelivery1788292800000().up(runner); // idempotent
    } finally { await runner.release(); }
    svc = new PickupTasksService(db, sms);
  });
  afterAll(async () => { if (db) await db.destroy(); });
  beforeEach(() => { smsWorks = true; sent.length = 0; });

  it('sender -> Agent -> recipient, end to end: one custody event per verified handover, delivered, and nothing invented', async () => {
    const s = await mkShipment();
    const requested = await request(s);

    // An eligible Agent sees the job -- area only, no contact details yet.
    const available = await svc.listAvailable(9, agentRole(9));
    const job = available.find((j) => j.id === requested.id)!;
    expect(job).toEqual({
      id: requested.id, servicePath: 'direct_delivery', requestedAt: expect.any(Date), pickupArea: 'Kariakoo, Ilala',
      destinationArea: 'Mbagala, Temeke', deliverTo: 'recipient', originHubName: null, itemDescription: 'Nguo za watoto', weightKg: 2,
    });
    expect(JSON.stringify(available)).not.toMatch(/Baraka|255713000002|Amina|255712000001/);
    // The same city spelled with different case/spacing is the same city; another city, or a suspended Agent, sees nothing.
    expect((await svc.listAvailable(10, agentRole(10))).map((j) => j.id)).toContain(requested.id);
    expect(await svc.listAvailable(12, agentRole(12))).toEqual([]);
    await expect(svc.listAvailable(11, agentRole(11))).rejects.toThrow('Approved active Agent');
    expect((await svc.getForShipment(SENDER, s)).task).toMatchObject({ status: 'requested', agent: null, nextAction: 'wait_for_agent' });

    // Claim: the job leaves the queue, the Agent gets the pickup contact, the sender sees who is coming.
    await svc.claim(requested.id, 9, agentRole(9));
    expect((await svc.listAvailable(10, agentRole(10))).map((j) => j.id)).not.toContain(requested.id);
    let mine = await svc.listMine(9, agentRole(9));
    expect(mine.find((j) => j.id === requested.id)).toMatchObject({
      status: 'claimed', nextAction: 'collect_from_sender', trackingNumber: `KTX-SHP-${s}`,
      pickupContact: { name: 'Baraka', phone: '+255713000002' }, recipient: null, deliverTo: 'recipient', originHub: null,
    });
    expect(await svc.listMine(10, agentRole(10))).toEqual([]);
    expect((await svc.getForShipment(SENDER, s)).task).toMatchObject({
      status: 'claimed', nextAction: 'give_code_to_agent', agent: { name: 'Agent Nine', phone: '0709' },
    });

    // Nothing can be delivered before it has been collected.
    await expect(svc.issueDeliveryCode(requested.id, 9, agentRole(9))).rejects.toThrow('Collect the Parcel from the sender first');
    await expect(svc.deliver(requested.id, 9, agentRole(9), '123456')).rejects.toThrow('Collect the Parcel from the sender first');

    // Verified sender -> Agent handover.
    const { code } = await svc.issueHandoffCode(SENDER, s);
    await svc.collect(requested.id, 9, agentRole(9), code);
    expect((await parcel(s)).status).toBe('out_for_delivery');
    expect(await shipment(s)).toMatchObject({ status: 'in_transit' });
    expect((await shipment(s)).collectedAt).toBeTruthy();
    mine = await svc.listMine(9, agentRole(9));
    expect(mine[0]).toMatchObject({
      id: requested.id, status: 'collected', nextAction: 'deliver_to_recipient',
      recipient: { name: 'Amina Juma', phone: RECIPIENT_PHONE, area: 'Mbagala, Temeke' },
    });

    // The recipient's code goes to the recipient's phone only; the Agent is never shown it.
    const issued = await svc.issueDeliveryCode(requested.id, 9, agentRole(9));
    expect(issued).toEqual({ id: requested.id, sent: true, expiresInSeconds: 600 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ phone: RECIPIENT_PHONE, sensitive: true });
    expect(sent[0].message).toContain(`KTX-SHP-${s}`);
    expect(JSON.stringify(issued)).not.toContain(lastCode());
    expect(JSON.stringify(await svc.listMine(9, agentRole(9)))).not.toContain(lastCode());

    // Only the Agent holding the parcel, with the right code.
    await expect(svc.deliver(requested.id, 10, agentRole(10), lastCode())).rejects.toThrow('not assigned to you');
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    await expect(svc.deliver(requested.id, 9, agentRole(9), wrong)).rejects.toThrow('Incorrect recipient delivery code');
    expect((await task(s)).deliveryAttempts).toBe(1);
    expect(await events(s)).toHaveLength(1);
    expect((await parcel(s)).status).toBe('out_for_delivery');

    // Verified Agent -> recipient handover.
    expect(await svc.deliver(requested.id, 9, agentRole(9), lastCode())).toMatchObject({ status: 'delivered', replay: false });
    const ev = await events(s);
    expect(ev.map((e: any) => e.eventKind)).toEqual(['origin_agent_collected', 'recipient_agent_delivery']);
    expect(ev[1]).toMatchObject({
      operationKey: `pickup-task-delivered:${requested.id}`, fromCustodianType: 'local_agent', fromCustodianId: 9,
      toCustodianType: 'recipient_contact', toCustodianId: null, actorUserId: 9, actorRoleType: 'agent', hubId: null,
    });
    expect(ev[1].evidenceRef).toMatch(/^recipient-code:[0-9a-f]{64}$/);
    expect(await parcel(s)).toMatchObject({ status: 'delivered', buyerConfirmed: true });
    expect((await parcel(s)).deliveredTime).toBeTruthy();
    expect(await task(s)).toMatchObject({
      status: 'delivered', deliveryCodeHash: null, deliveryCodeIssuedAt: null, deliveryCodeExpiresAt: null, deliveryAttempts: 0,
    });
    expect((await task(s)).deliveredAt).toBeTruthy();

    // The Shipment follows through the ONE projector: delivered and completed, timestamped.
    const done = await shipment(s);
    expect(done.status).toBe('completed');
    expect(done.deliveredAt).toBeTruthy();
    expect(done.completedAt).toBeTruthy();

    // Tracking: Sender -> Agent -> Recipient. No hub, no vehicle, no transporter.
    const rows = await trackingRows(s);
    expect(rows.map((r: any) => r.status)).toEqual(['collected_by_agent', 'out_for_delivery', 'delivered']);
    expect(new Set(rows.map((r: any) => r.handlerType))).toEqual(new Set(['local_agent']));
    expect(ev.some((e: any) => ['super_agent', 'transport_provider'].includes(e.toCustodianType) || e.hubId != null)).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/hub|van|run|carrier/i);
    expect((await svc.getForShipment(SENDER, s)).task).toMatchObject({ status: 'delivered', agent: null, nextAction: null });

    // A lost response replays without a second event; nobody else can claim the result.
    expect(await svc.deliver(requested.id, 9, agentRole(9), '999999')).toMatchObject({ status: 'delivered', replay: true });
    await expect(svc.deliver(requested.id, 10, agentRole(10), '999999')).rejects.toThrow('another Agent');
    expect(await events(s)).toHaveLength(2);
  });

  it('the recipient code: one per minute, ten minutes, five attempts, and an unsent code is not left behind', async () => {
    const s = await mkShipment();
    const taskId = await collected(s);

    smsWorks = false;
    await expect(svc.issueDeliveryCode(taskId, 9, agentRole(9))).rejects.toThrow('could not be sent');
    expect(await task(s)).toMatchObject({ deliveryCodeHash: null, deliveryCodeIssuedAt: null });
    smsWorks = true;
    await svc.issueDeliveryCode(taskId, 9, agentRole(9)); // not blocked by the failed attempt's cooldown
    await expect(svc.issueDeliveryCode(taskId, 9, agentRole(9))).rejects.toThrow('Wait before sending another');
    expect(sent).toHaveLength(1);

    // Expired.
    await q(`UPDATE public.parcel_pickup_task SET "deliveryCodeExpiresAt" = now() - interval '1 second' WHERE id=$1`, [taskId]);
    await expect(svc.deliver(taskId, 9, agentRole(9), lastCode())).rejects.toThrow('expired or unavailable');

    // Five wrong tries lock the code, even for the right one.
    await q(`UPDATE public.parcel_pickup_task SET "deliveryCodeIssuedAt" = now() - interval '2 minutes' WHERE id=$1`, [taskId]);
    await svc.issueDeliveryCode(taskId, 9, agentRole(9));
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(svc.deliver(taskId, 9, agentRole(9), wrong)).rejects.toThrow('Incorrect');
    }
    await expect(svc.deliver(taskId, 9, agentRole(9), right)).rejects.toThrow('expired or unavailable');
    await expect(svc.deliver(taskId, 9, agentRole(9), 'abc')).rejects.toThrow('six-digit');
    expect(await events(s)).toHaveLength(1);
    expect((await shipment(s)).status).toBe('in_transit');

    // A fresh code after the cooldown works.
    await q(`UPDATE public.parcel_pickup_task SET "deliveryCodeIssuedAt" = now() - interval '2 minutes' WHERE id=$1`, [taskId]);
    await svc.issueDeliveryCode(taskId, 9, agentRole(9));
    expect(await svc.deliver(taskId, 9, agentRole(9), lastCode())).toMatchObject({ status: 'delivered' });
  });

  it('two taps on "deliver" record one delivery', async () => {
    const s = await mkShipment();
    const taskId = await collected(s);
    await svc.issueDeliveryCode(taskId, 9, agentRole(9));
    const results = await Promise.all([
      svc.deliver(taskId, 9, agentRole(9), lastCode()), svc.deliver(taskId, 9, agentRole(9), lastCode()),
    ]);
    expect(results.map((r: any) => r.replay).sort()).toEqual([false, true]);
    expect((await events(s)).map((e: any) => e.eventKind)).toEqual(['origin_agent_collected', 'recipient_agent_delivery']);
  });

  it('only the Agent who holds the parcel, on a direct task, can ask for the code or deliver', async () => {
    const s = await mkShipment();
    const taskId = await collected(s);
    await expect(svc.issueDeliveryCode(taskId, 10, agentRole(10))).rejects.toThrow('not assigned to you');
    await expect(svc.issueDeliveryCode(taskId, 70, hubRole(7))).rejects.toThrow('Active Agent context required');
    // The ledger says someone else now holds it (e.g. a desk took it in): the Agent cannot deliver.
    await q(`INSERT INTO public.parcel_custody_event ("parcelId","eventKind","operationKey","toCustodianType","toCustodianId","actorSource")
      VALUES ($1,'origin_hub_received','desk-x','super_agent',7,'system')`, [s]);
    await expect(svc.issueDeliveryCode(taskId, 9, agentRole(9))).rejects.toThrow('does not currently hold');
    expect(sent).toHaveLength(0);

    // A hub-routed pickup ends at its hub, never at the recipient.
    const h = await mkShipment(7);
    const hubTask = await collected(h, 9, 'hub_routed');
    expect((await parcel(h)).status).toBe('collected_by_agent'); // not "out for delivery"
    await expect(svc.issueDeliveryCode(hubTask, 9, agentRole(9))).rejects.toThrow('ends at a hub');
    await expect(svc.deliver(hubTask, 9, agentRole(9), '123456')).rejects.toThrow('ends at a hub');
    expect((await svc.listMine(9, agentRole(9))).find((j) => j.id === hubTask)).toMatchObject({
      nextAction: 'take_to_hub', deliverTo: 'hub', recipient: null, originHub: { name: 'Hub Seven', address: 'Kariakoo' },
    });
  });

  it('the sender\'s view is the sender\'s only', async () => {
    const s = await mkShipment();
    await request(s);
    await expect(svc.getForShipment(SENDER + 1, s)).rejects.toThrow('Not your shipment');
    await expect(svc.getForShipment(SENDER, 999999)).rejects.toThrow('Shipment not found');
    expect(await svc.getForShipment(SENDER, await mkShipment())).toEqual({ task: null });
  });

  it('the database itself refuses a recipient code outside a collected direct task', async () => {
    const s = await mkShipment();
    const t = await request(s);
    await expect(q(`UPDATE public.parcel_pickup_task SET "deliveryCodeHash"='x',"deliveryCodeIssuedAt"=now(),
      "deliveryCodeExpiresAt"=now() WHERE id=$1`, [t.id])).rejects.toThrow('CHK_pickup_task_delivery_code');
    await expect(q(`UPDATE public.parcel_pickup_task SET "deliveryAttempts"=-1 WHERE id=$1`, [t.id]))
      .rejects.toThrow('CHK_pickup_task_delivery_attempts');
  });

  // ── Gate 5: what the hub desk is waiting for ─────────────────────────────
  describe('the hub\'s expected shipments (Gate 5)', () => {
    const expectedFor = async (parcelId: number) =>
      (await svc.listHubExpected(70, hubRole(7))).find((r) => r.parcelId === parcelId);

    it('a booked parcel is expected at its hub; the desk is told how it is arriving', async () => {
      const s = await mkShipment(7);
      await q(`UPDATE public.shipment SET "journeySelectionId" = 800, "senderName" = 'Baraka', "senderPhone" = '+255713000002' WHERE id = $1`, [s]);

      // Nobody is bringing it: the sender drops it off, the desk receives it by its number.
      expect(await expectedFor(s)).toEqual({
        parcelId: s, trackingNumber: `KTX-SHP-${s}`, itemDescription: 'Nguo za watoto', weightKg: 2, destinationCity: 'Mwanza',
        sender: { name: 'Baraka', phone: '+255713000002' },
        bookedTrip: { departureAt: expect.any(Date), providerName: 'Kentexa Van' },
        pickupTask: null, nextAction: 'receive_from_sender',
      });

      // An Agent pickup is requested and claimed: the desk must wait for that Agent.
      const t = await request(s, 'hub_routed');
      expect(await expectedFor(s)).toMatchObject({ nextAction: 'agent_on_the_way', pickupTask: { id: t.id, status: 'requested', agentName: null } });
      await svc.claim(t.id, 9, agentRole(9));
      const { code } = await svc.issueHandoffCode(SENDER, s);
      await svc.collect(t.id, 9, agentRole(9), code);
      expect(await expectedFor(s)).toMatchObject({ nextAction: 'agent_on_the_way', pickupTask: { status: 'collected', agentName: 'Agent Nine' } });

      // The Agent arrives and asks: now the desk confirms that Agent's handover.
      await svc.requestHubHandover(t.id, 9, agentRole(9));
      expect(await expectedFor(s)).toMatchObject({ nextAction: 'confirm_agent_handover', pickupTask: { id: t.id, status: 'awaiting_hub' } });
      await svc.hubReceive(t.id, 70, hubRole(7));
      // Received: it is no longer expected.
      expect(await expectedFor(s)).toBeUndefined();
      expect((await parcel(s)).status).toBe('received_at_hub');
      expect((await shipment(s)).status).toBe('collected');
    });

    it('lists only this hub\'s parcels, to this hub\'s own operator', async () => {
      const mine = await mkShipment(7);
      const direct = await mkShipment(); // no hub at all
      const ids = (await svc.listHubExpected(70, hubRole(7))).map((r) => r.parcelId);
      expect(ids).toContain(mine);
      expect(ids).not.toContain(direct);
      await expect(svc.listHubExpected(9, agentRole(9))).rejects.toThrow('Active Super Agent context required');
      await expect(svc.listHubExpected(71, { ...hubRole(7), userId: 71 })).rejects.toThrow('active receiving hub');
      await q(`UPDATE public.super_agent SET status = 'suspended' WHERE id = 7`);
      await expect(svc.listHubExpected(70, hubRole(7))).rejects.toThrow('active receiving hub');
      await q(`UPDATE public.super_agent SET status = 'active' WHERE id = 7`);
    });
  });
});
