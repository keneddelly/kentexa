import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  B5B_BASE_ENTITIES,
} from '../business/b5b-closure-test-db';
import { ShipmentsService } from './shipments.service';
import { Shipment, ShipmentHandoffOption, ShipmentStatus } from './entities/shipment.entity';
import { TransportService } from '../transport/transport.service';
import { ProviderAvailability, AvailabilityStatus } from '../transport/entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { User } from '../users/entities/user.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { AddShipmentHubDecision1788274800000, SHIPMENT_HUB_DECISION_COLUMNS } from '../database/migrations/1788274800000-AddShipmentHubDecision';
import { HUB_DECISION_CONFLICT, HUB_SELECTION_REQUIRED, ShipmentHubSource } from './shipment-hub-selection';
import { SHIPMENT_LOCATION_SNAPSHOT_COLUMNS } from '../database/migrations/1788271200000-AddShipmentLocationSnapshot';

/**
 * Stage 2F — REAL PostgreSQL proof of the hub decision boundary: the decision
 * is durable, made inside the Stage 2C claim+capacity transaction (FOR SHARE on
 * the candidate hubs), and Parcel creation/recovery consumes ONLY the stored
 * decision. Runs through the real ShipmentsService + real TransportService
 * against real tables and the real migration (FKs, partial indexes, CHECKs).
 *
 * Runs ONLY against the dedicated kentexa_b5b_test database behind the
 * existing safety gate; skipped (never failed) without B5B_TEST_DB_PASSWORD.
 * Only the Parcel side is an in-memory fake (not part of this stage's schema),
 * which also lets "crash after commit, before the Parcel insert" be forced.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Server-resolved places (what LocationIntelligenceService.resolve returns).
const place = (region: string, id: string, extra: Record<string, unknown> = {}) => ({
  displayLabel: region, regionId: 1, regionName: region, providerKey: 'tz_seed', providerPlaceId: id,
  resolutionMethod: 'admin_seed', latitude: -6.8, longitude: 39.2, ...extra,
});
const PLACES: Record<string, any> = {
  'region:1': place('Dar es Salaam', 'region:1'),
  'region:2': place('Mwanza', 'region:2'),
  'region:3': place('Arusha', 'region:3'),
  'region:4': place('Kilimanjaro', 'region:4'),
};
const REF = { dar: 'region:1', mwanza: 'region:2', arusha: 'region:3', kili: 'region:4' } as const;

suite('Shipment hub decision — real PostgreSQL', () => {
  jest.setTimeout(60000);
  let ds: DataSource;
  let shipmentsRepo: Repository<Shipment>;
  let slotsRepo: Repository<ProviderAvailability>;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let transport: TransportService;
  let service: ShipmentsService;
  let p1: TransportProvider;
  let parcels: any[];
  let parcelSaveFailures: number;
  let userSeq = 0;
  const hubs: Record<string, number> = {};

  const mkHub = async (key: string, city: string, status: string, name = key) => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({ email: `${key}@s2f.local`, phone: `+2557${String(++userSeq).padStart(8, '0')}`, password: 'x', name } as any));
    const h: any = await ds.getRepository(SuperAgent).save(ds.getRepository(SuperAgent).create({
      userId: (u as any).id, businessName: name, city, address: `${name} street`, phone: '0700-secret', governmentId: 'GOV-SECRET', status,
    } as any) as any);
    hubs[key] = h.id;
    return h.id as number;
  };
  const dto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', itemDescription: 'Clothes', weightKg: 2, providerId: p1.id,
    originPlace: { providerKey: 'tz_seed', providerPlaceId: REF.dar }, destinationPlace: { providerKey: 'tz_seed', providerPlaceId: REF.mwanza }, ...extra,
  });
  const mk = async (extra: Record<string, unknown> = {}) => service.createShipment(7, dto(extra) as any);
  const p = (ref: string) => ({ providerKey: 'tz_seed', providerPlaceId: ref });
  const mkSlot = async (o: Partial<ProviderAvailability> = {}) =>
    slotsRepo.save(slotsRepo.create({
      providerId: p1.id, routeId: null, date: TODAY, totalSlots: 5, usedSlots: 0, totalCapacityKg: 100,
      usedCapacityKg: 0, status: AvailabilityStatus.OPEN, fromCity: 'Dar es Salaam', toCity: 'Mwanza', ...o,
    } as any) as unknown as ProviderAvailability);
  const slotRow = async (id: number) => (await ds.query(`SELECT "usedSlots"::int AS used, "usedCapacityKg"::text AS kg FROM public.provider_availability WHERE id=$1`, [id]))[0];
  const row = async (id: number) => (await ds.query(
    `SELECT status::text AS status, "originHubId","originHubSource","destinationHubId","destinationHubSource","hubDecidedAt" FROM public.shipment WHERE id=$1`, [id],
  ))[0];
  const undecided = async (id: number) => {
    const r = await row(id);
    expect(r).toMatchObject({ originHubId: null, originHubSource: null, destinationHubId: null, destinationHubSource: null, hubDecidedAt: null });
    return r;
  };
  const errCode = (e: any) => e?.getResponse?.()?.code;
  const insertLegacy = async (o: Record<string, unknown> = {}) => {
    const base: Record<string, unknown> = {
      requestedByUserId: 7, receiverName: 'R', receiverPhone: '0', originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
      itemDescription: 'x', providerId: p1.id, status: 'confirmed', ...o,
    };
    const cols = Object.keys(base);
    const [{ id }] = await ds.query(
      `INSERT INTO public.shipment (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(base));
    return id as number;
  };
  const resolvedSnap = (side: 'origin' | 'destination', region: string) => ({
    [`${side}LocationLabel`]: region, [`${side}RegionName`]: region, [`${side}ProviderKey`]: 'tz_seed', [`${side}ResolutionMethod`]: 'admin_seed',
  });
  const settle = async <T,>(ps: Array<Promise<T>>) => Promise.allSettled(ps);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();
    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 30 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute, Shipment],
    });
    await ds.initialize();
    // Real pre-migration table + the REAL migration (FKs, partial indexes, CHECKs).
    await ds.query(`ALTER TABLE public.shipment ${SHIPMENT_HUB_DECISION_COLUMNS.map((c) => `DROP COLUMN "${c}"`).join(', ')}`);
    const r = ds.createQueryRunner();
    await new AddShipmentHubDecision1788274800000().up(r);
    await r.release();

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    slotsRepo = ds.getRepository(ProviderAvailability);
    shipmentsRepo = ds.getRepository(Shipment);
    p1 = await providers.save(providers.create({ name: 'P1', type: ProviderType.BUS, status: ProviderStatus.VERIFIED } as any) as unknown as TransportProvider);

    // Production-shaped: several ACTIVE hubs tied in one city, plus every non-eligible status.
    await mkHub('dar1', 'Dar es Salaam', 'active');
    await mkHub('dar2', 'Dar es Salaam', 'active');
    await mkHub('dar3', 'Dar es Salaam', 'active');
    await mkHub('darSusp', 'Dar es Salaam', 'suspended');
    await mkHub('darBlock', 'Dar es Salaam', 'blocked');
    await mkHub('darPend', 'Dar es Salaam', 'pending');
    await mkHub('mwanza1', 'Mwanza', 'active');
    await mkHub('mwanzaSusp', 'Mwanza', 'suspended');
    await mkHub('moshi', '  MOSHI ', 'active'); // capital-named, untrimmed, upper-case
    await mkHub('otherCity', 'Dodoma', 'active');
  });

  afterAll(async () => { if (ds) await ds.destroy().catch(() => {}); });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.shipment RESTART IDENTITY`);
    await ds.query(`DELETE FROM public.provider_availability`);
    await ds.query(`UPDATE public.super_agent SET status='active' WHERE id = ANY($1)`, [[hubs.dar1, hubs.dar2, hubs.dar3, hubs.mwanza1, hubs.moshi]]);
    parcels = []; parcelSaveFailures = 0;
    const parcelRepo: any = {
      create: (v: any) => ({ ...v }),
      findOne: async ({ where }: any) => parcels.find((x) => x.shipment?.id === where.shipment.id) ?? null,
      save: async (v: any) => {
        if (v.id) return v;
        if (parcelSaveFailures > 0) { parcelSaveFailures--; throw new Error('connection terminated unexpectedly'); }
        if (parcels.some((x) => x.shipment?.id === v.shipment?.id)) {
          const e: any = new Error('duplicate key value violates unique constraint "UQ_parcel_shipmentId"');
          e.code = '23505'; e.constraint = 'UQ_parcel_shipmentId'; throw e;
        }
        const saved = { ...v, id: parcels.length + 500 };
        parcels.push(saved);
        return saved;
      },
    };
    const args: any[] = new Array(14).fill({});
    args[0] = providers; args[1] = routes; args[2] = slotsRepo; args[9] = shipmentsRepo;
    transport = new (TransportService as any)(...args);
    service = new ShipmentsService(
      shipmentsRepo, routes, parcelRepo, ds.getRepository(SuperAgent), transport, { search: async () => [] } as any,
      { resolve: async ({ providerPlaceId }: any) => PLACES[providerPlaceId] ?? null } as any,
    );
  });

  // ── 1. default: no hub asked for => no hub, never an arbitrary pick ─────
  it('nothing requested: both sides are not_required and the Parcel has NO hub, even with 3 tied active hubs in the city', async () => {
    const s = await mk();
    const out = await service.confirmShipment(7, s.id, { providerId: p1.id });
    const r = await row(s.id);
    expect(r).toMatchObject({ status: 'confirmed', originHubId: null, originHubSource: 'not_required', destinationHubId: null, destinationHubSource: 'not_required' });
    expect(r.hubDecidedAt).toBeInstanceOf(Date);
    expect(out.parcel.superAgent ?? null).toBeNull();
    expect(out.parcel.destinationSuperAgent ?? null).toBeNull();
  });

  it('hub selection is independent of pickupOption/deliveryOption: all 9 combinations yield not_required unless a hub is explicitly asked for', async () => {
    const opts = [ShipmentHandoffOption.DOOR, ShipmentHandoffOption.AGENT, ShipmentHandoffOption.STATION];
    for (const pickupOption of opts) for (const deliveryOption of opts) {
      const s = await mk({ pickupOption, deliveryOption });
      await service.confirmShipment(7, s.id, { providerId: p1.id });
      expect(await row(s.id)).toMatchObject({ originHubSource: 'not_required', destinationHubSource: 'not_required', originHubId: null, destinationHubId: null });
    }
    // ...and an explicit request works identically for door/station as for agent
    for (const pickupOption of opts) {
      const s = await mk({ pickupOption });
      await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 });
      expect(await row(s.id)).toMatchObject({ originHubSource: 'sender_selected', originHubId: hubs.dar2 });
    }
  });

  // ── 2. the 0 / 1 / many table, end to end ───────────────────────────────
  it('requested + ZERO eligible hubs (Arusha has none) => none_available, no hub', async () => {
    const s = await mk({ originPlace: p(REF.arusha) });
    await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true });
    expect(await row(s.id)).toMatchObject({ originHubSource: 'none_available', originHubId: null, destinationHubSource: 'not_required' });
  });

  it('requested + exactly ONE eligible hub (Mwanza; its suspended sibling is ignored) => auto_single_candidate, Parcel references that hub', async () => {
    const s = await mk({ originPlace: p(REF.mwanza) });
    const out = await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true });
    expect(await row(s.id)).toMatchObject({ originHubSource: 'auto_single_candidate', originHubId: hubs.mwanza1 });
    expect(out.parcel.superAgent).toEqual({ id: hubs.mwanza1 });
  });

  it('requested + MANY (3 tied active hubs) and no choice => 409 HUB_SELECTION_REQUIRED, fully rolled back: shipment pending, undecided, slot untouched', async () => {
    const slot = await mkSlot();
    const s = await mk({ availabilityId: slot.id });
    const before = await slotRow(slot.id);
    const e: any = await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true }).catch((x) => x);
    expect(e).toBeInstanceOf(ConflictException);
    expect(errCode(e)).toBe(HUB_SELECTION_REQUIRED);
    expect(e.getResponse().candidates.map((c: any) => c.hubId)).toEqual([hubs.dar1, hubs.dar2, hubs.dar3]);
    expect((await row(s.id)).status).toBe('pending');
    await undecided(s.id);
    expect(await slotRow(slot.id)).toEqual(before);
    expect(parcels).toHaveLength(0);
    // then an explicit choice succeeds and is recorded as sender_selected
    const out = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar3 });
    expect(await row(s.id)).toMatchObject({ status: 'confirmed', originHubSource: 'sender_selected', originHubId: hubs.dar3 });
    expect(out.parcel.superAgent).toEqual({ id: hubs.dar3 });
  });

  it('both sides at once: each side follows its own row of the table', async () => {
    const s = await mk({ originPlace: p(REF.dar), destinationPlace: p(REF.mwanza) });
    const out = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1, requestDestinationHub: true });
    expect(await row(s.id)).toMatchObject({ originHubSource: 'sender_selected', originHubId: hubs.dar1, destinationHubSource: 'auto_single_candidate', destinationHubId: hubs.mwanza1 });
    expect(out.parcel.superAgent).toEqual({ id: hubs.dar1 });
    expect(out.parcel.destinationSuperAgent).toEqual({ id: hubs.mwanza1 });
  });

  it('the capital alias is honoured (Kilimanjaro -> an untrimmed, upper-case "MOSHI" hub) via the shared policy', async () => {
    const s = await mk({ originPlace: p(REF.kili) });
    await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true });
    expect(await row(s.id)).toMatchObject({ originHubSource: 'auto_single_candidate', originHubId: hubs.moshi });
  });

  // ── 3. ineligible / forged ids fail closed and change nothing ───────────
  it.each([
    ['a suspended hub', () => hubs.darSusp],
    ['a blocked hub', () => hubs.darBlock],
    ['a pending hub', () => hubs.darPend],
    ['an active hub of ANOTHER city', () => hubs.otherCity],
    ['a hub of the other side\'s city', () => hubs.mwanza1],
    ['a nonexistent hub', () => 987654],
  ])('explicit %s => 400, shipment stays pending/undecided, slot untouched', async (_n, id) => {
    const slot = await mkSlot();
    const s = await mk({ availabilityId: slot.id });
    const before = await slotRow(slot.id);
    await expect(service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: id() })).rejects.toThrow(BadRequestException);
    expect((await row(s.id)).status).toBe('pending');
    await undecided(s.id);
    expect(await slotRow(slot.id)).toEqual(before);
  });

  it('an explicit hub on a FREE-TEXT side has no authority => 400 (even though a same-named city has hubs); requesting one there => none_available', async () => {
    const s = await mk({ originPlace: undefined, originCity: 'Dar es Salaam' });
    await expect(service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 })).rejects.toThrow(BadRequestException);
    await undecided(s.id);
    await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true });
    expect(await row(s.id)).toMatchObject({ originHubSource: 'none_available', originHubId: null });
  });

  it('malformed hub input is a 400 before any write', async () => {
    const s = await mk();
    for (const bad of [{ originHubId: '2' }, { originHubId: 0 }, { requestOriginHub: 'yes' }, { destinationHubId: 1.5 }]) {
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, ...(bad as any) })).rejects.toThrow(BadRequestException);
    }
    expect((await row(s.id)).status).toBe('pending');
    await undecided(s.id);
  });

  // ── 4. crash / rollback matrix ──────────────────────────────────────────
  describe('rollback before the confirmation commit', () => {
    it('failure AFTER the claim (hub rule violated): claim rolled back', async () => {
      const s = await mk();
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.darSusp })).rejects.toThrow();
      expect((await row(s.id)).status).toBe('pending');
      await undecided(s.id);
    });

    it('failure AFTER the decision was written (slot reserve throws): decision AND claim roll back with the capacity change', async () => {
      const oldSlot = await mkSlot();
      const newSlot = await mkSlot();
      const s = await mk({ availabilityId: oldSlot.id });
      const spy = jest.spyOn(transport, 'reserveSlot').mockRejectedValueOnce(new Error('reserve failed'));
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, availabilityId: newSlot.id, originHubId: hubs.dar1 })).rejects.toThrow('reserve failed');
      spy.mockRestore();
      expect((await row(s.id)).status).toBe('pending');
      await undecided(s.id);
      expect(await slotRow(oldSlot.id)).toMatchObject({ used: 1 });
      expect(await slotRow(newSlot.id)).toMatchObject({ used: 0 });
    });

    it('failure AFTER the reserve (release of the superseded slot throws): everything rolls back, incl. the new reservation', async () => {
      const newSlot = await mkSlot(); // lower id => reserveNew runs BEFORE releaseOld
      const oldSlot = await mkSlot();
      const s = await mk({ availabilityId: oldSlot.id });
      const spy = jest.spyOn(transport, 'releaseCapacity').mockRejectedValueOnce(new Error('release failed'));
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, availabilityId: newSlot.id, originHubId: hubs.dar2 })).rejects.toThrow('release failed');
      spy.mockRestore();
      expect((await row(s.id)).status).toBe('pending');
      await undecided(s.id);
      expect(await slotRow(newSlot.id)).toMatchObject({ used: 0, kg: '0.00' });
      expect(await slotRow(oldSlot.id)).toMatchObject({ used: 1 });
      // a retry is a fresh confirm and may decide differently
      await service.confirmShipment(7, s.id, { providerId: p1.id, availabilityId: newSlot.id, originHubId: hubs.dar3 });
      expect(await row(s.id)).toMatchObject({ status: 'confirmed', originHubId: hubs.dar3 });
      expect(await slotRow(newSlot.id)).toMatchObject({ used: 1 });
      expect(await slotRow(oldSlot.id)).toMatchObject({ used: 0 });
    });
  });

  describe('crash AFTER the confirmation commit, BEFORE the Parcel insert', () => {
    it('the durable decision survives; a retry reproduces it (omitted hub), even if the hub was suspended meanwhile — no fallback to another hub', async () => {
      const slot = await mkSlot();
      const s = await mk({ availabilityId: slot.id });
      parcelSaveFailures = 1;
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 })).rejects.toThrow('connection terminated');
      expect(await row(s.id)).toMatchObject({ status: 'confirmed', originHubSource: 'sender_selected', originHubId: hubs.dar2 });
      expect(parcels).toHaveLength(0);
      expect(await slotRow(slot.id)).toMatchObject({ used: 1 }); // capacity committed exactly once

      // the world changes: dar2 is suspended, the candidate set is now {dar1,dar3}
      await ds.query(`UPDATE public.super_agent SET status='suspended' WHERE id=$1`, [hubs.dar2]);
      const out = await service.confirmShipment(7, s.id, { providerId: p1.id });
      expect(out.parcel.superAgent).toEqual({ id: hubs.dar2 }); // the stored decision, verbatim
      expect(parcels).toHaveLength(1);
      expect(await slotRow(slot.id)).toMatchObject({ used: 1 });
    });

    it('a retry naming a DIFFERENT hub (or a bare request on a not_required side) is a 409 HUB_DECISION_CONFLICT, never applied; the same hub is accepted', async () => {
      const s = await mk();
      parcelSaveFailures = 1;
      await expect(service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 })).rejects.toThrow('connection terminated');
      const e: any = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar3 }).catch((x) => x);
      expect(errCode(e)).toBe(HUB_DECISION_CONFLICT);
      const e2: any = await service.confirmShipment(7, s.id, { providerId: p1.id, requestDestinationHub: true }).catch((x) => x);
      expect(errCode(e2)).toBe(HUB_DECISION_CONFLICT); // stored destination = not_required
      expect(parcels).toHaveLength(0);
      expect(await row(s.id)).toMatchObject({ originHubId: hubs.dar1, originHubSource: 'sender_selected' });
      const ok = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
      expect(ok.parcel.superAgent).toEqual({ id: hubs.dar1 });
      expect(parcels).toHaveLength(1);
    });
  });

  it('crash AFTER the Parcel insert (client never saw the response): retry returns the same Parcel; a conflicting hub is refused; exactly one Parcel', async () => {
    const s = await mk();
    const first = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
    const again = await service.confirmShipment(7, s.id, { providerId: p1.id });
    expect(again.parcel).toBe(first.parcel);
    const e: any = await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 }).catch((x) => x);
    expect(errCode(e)).toBe(HUB_DECISION_CONFLICT);
    expect(parcels).toHaveLength(1);
  });

  // ── 5. concurrency ──────────────────────────────────────────────────────
  it('concurrent confirms with DIFFERENT hub ids: exactly one decision wins, every other caller gets a 409 conflict, one Parcel, decision = the winner\'s', async () => {
    for (let round = 0; round < 5; round++) {
      parcels = [];
      const s = await mk();
      const ids = [hubs.dar1, hubs.dar2, hubs.dar3, hubs.dar1, hubs.dar2, hubs.dar3];
      const res = await settle(ids.map((id) => service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: id })));
      const stored = (await row(s.id)).originHubId;
      expect(ids).toContain(stored);
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') expect(ids[i]).toBe(stored);
        else expect(errCode((r as PromiseRejectedResult).reason)).toBe(HUB_DECISION_CONFLICT);
      });
      expect(res.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
      expect(parcels).toHaveLength(1);
      expect(parcels[0].superAgent).toEqual({ id: stored });
      expect(await row(s.id)).toMatchObject({ status: 'confirmed', originHubSource: 'sender_selected' });
    }
  });

  it('concurrent confirms with the SAME hub id: all converge on one decision and one Parcel', async () => {
    const s = await mk();
    const res = await settle(Array.from({ length: 8 }, () => service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 })));
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(parcels).toHaveLength(1);
    expect(await row(s.id)).toMatchObject({ originHubId: hubs.dar2, originHubSource: 'sender_selected' });
  });

  it('concurrent confirms that request an auto single-candidate hub converge too (no double decision)', async () => {
    const s = await mk({ originPlace: p(REF.mwanza) });
    const res = await settle(Array.from({ length: 6 }, () => service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true })));
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(parcels).toHaveLength(1);
    expect(await row(s.id)).toMatchObject({ originHubSource: 'auto_single_candidate', originHubId: hubs.mwanza1 });
  });

  describe('hub suspension RACING the confirmation (real row locks, two connections)', () => {
    it('(a) suspension holds the hub row first: confirm waits on FOR SHARE, then the hub is no longer eligible => 400 and full rollback', async () => {
      const s = await mk();
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      await qr.query(`UPDATE public.super_agent SET status='suspended' WHERE id=$1`, [hubs.dar2]); // uncommitted
      const confirm = service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 }).then(() => 'ok', (e) => e);
      let raced: unknown;
      try {
        raced = await Promise.race([confirm, sleep(500).then(() => 'blocked')]); // it really waits on the row lock
      } finally {
        await qr.commitTransaction(); // always let go, so a failing assertion can never wedge later tests
        await qr.release();
      }
      expect(raced).toBe('blocked');
      const outcome: any = await confirm;
      expect(outcome).toBeInstanceOf(BadRequestException);
      expect((await row(s.id)).status).toBe('pending');
      await undecided(s.id);
    });

    it('(b) confirm holds FOR SHARE first: the suspension UPDATE waits until the confirmation commits; the decision names the (then-active) hub and stands afterwards', async () => {
      const slot = await mkSlot();
      const s = await mk({ availabilityId: slot.id });
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let entered!: () => void;
      const inside = new Promise<void>((r) => (entered = r));
      const orig = transport.assertHeldSlotMatches.bind(transport);
      const spy = jest.spyOn(transport, 'assertHeldSlotMatches').mockImplementationOnce(async (...a: any[]) => {
        entered(); await gate; return (orig as any)(...a); // runs INSIDE the confirm transaction, after the hub was locked + decision written
      });
      const confirm = service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 });
      await inside;
      const suspend = ds.query(`UPDATE public.super_agent SET status='suspended' WHERE id=$1`, [hubs.dar2]).then(() => 'suspended');
      let raced: unknown;
      let statusWhileHeld: string | undefined;
      try {
        raced = await Promise.race([suspend, sleep(500).then(() => 'blocked')]);
        statusWhileHeld = (await ds.query(`SELECT status::text AS s FROM public.super_agent WHERE id=$1`, [hubs.dar2]))[0].s;
      } finally {
        release(); // always let the confirmation finish
      }
      expect(raced).toBe('blocked');
      expect(statusWhileHeld).toBe('active');
      const out = await confirm;
      expect(await suspend).toBe('suspended');
      spy.mockRestore();
      expect(await row(s.id)).toMatchObject({ status: 'confirmed', originHubSource: 'sender_selected', originHubId: hubs.dar2 });
      expect(out.parcel.superAgent).toEqual({ id: hubs.dar2 }); // decided hub referenced verbatim although now suspended
    });
  });

  // ── 6. late decision for legacy / old-code CONFIRMED rows ───────────────
  describe('late decision (legacy CONFIRMED rows with NULL decision)', () => {
    it('free-text legacy row + bare confirm: not_required, Parcel without hubs; nothing is inferred from the city string even though hubs exist there', async () => {
      const id = await insertLegacy({ ...{ originCity: 'Dar es Salaam' } });
      const out = await service.confirmShipment(7, id, {});
      expect(await row(id)).toMatchObject({ originHubSource: 'not_required', destinationHubSource: 'not_required', originHubId: null });
      expect(out.parcel.superAgent ?? null).toBeNull();
    });

    it('free-text legacy row + explicit hub id => 400 (no authority) and the row stays undecided', async () => {
      const id = await insertLegacy();
      await expect(service.confirmShipment(7, id, { originHubId: hubs.dar1 })).rejects.toThrow(BadRequestException);
      await undecided(id);
      expect(parcels).toHaveLength(0);
    });

    it('a legacy row with server-resolved geography can be decided explicitly, exactly once', async () => {
      const id = await insertLegacy({ ...resolvedSnap('origin', 'Dar es Salaam') });
      const out = await service.confirmShipment(7, id, { originHubId: hubs.dar3 });
      expect(await row(id)).toMatchObject({ originHubSource: 'sender_selected', originHubId: hubs.dar3, destinationHubSource: 'not_required' });
      expect(out.parcel.superAgent).toEqual({ id: hubs.dar3 });
    });

    it('concurrent late decisions with different ids: one compare-and-set wins, the rest conflict; never overwritten', async () => {
      const id = await insertLegacy({ ...resolvedSnap('origin', 'Dar es Salaam') });
      const ids = [hubs.dar1, hubs.dar2, hubs.dar3, hubs.dar1, hubs.dar2, hubs.dar3];
      const res = await settle(ids.map((h) => service.confirmShipment(7, id, { originHubId: h })));
      const stored = (await row(id)).originHubId;
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') expect(ids[i]).toBe(stored);
        else expect(errCode((r as PromiseRejectedResult).reason)).toBe(HUB_DECISION_CONFLICT);
      });
      expect(parcels).toHaveLength(1);
    });

    it('the compare-and-set itself: a second write on a decided row changes nothing and fails closed', async () => {
      const s = await mk();
      await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
      const before = await row(s.id);
      const decision = { origin: { source: ShipmentHubSource.SENDER_SELECTED, hubId: hubs.dar2 }, destination: { source: ShipmentHubSource.NOT_REQUIRED, hubId: null } };
      await expect(ds.transaction((em) => (service as any).writeHubDecision(em, s.id, decision))).rejects.toThrow(ConflictException);
      expect(await row(s.id)).toEqual(before);
    });

    it('an undecided legacy row whose Parcel ALREADY exists (old code): returned untouched, no decision invented; a hub request is a 409', async () => {
      const id = await insertLegacy({ ...resolvedSnap('origin', 'Dar es Salaam') });
      parcels.push({ id: 900, shipment: { id }, superAgent: { id: hubs.dar1 } });
      const out = await service.confirmShipment(7, id, {});
      expect(out.parcel).toBe(parcels[0]);
      await undecided(id);
      const e: any = await service.confirmShipment(7, id, { originHubId: hubs.dar2 }).catch((x) => x);
      expect(errCode(e)).toBe(HUB_DECISION_CONFLICT);
      await undecided(id);
    });

    it('a shipment cancelled in the meantime is never given a decision or a Parcel', async () => {
      const id = await insertLegacy({ status: 'cancelled' });
      await expect(service.confirmShipment(7, id, {})).rejects.toThrow(BadRequestException);
      await undecided(id);
      expect(parcels).toHaveLength(0);
    });

    it('migration + release leave existing rows untouched: nothing decides a row until its owner explicitly confirms', async () => {
      const id = await insertLegacy();
      await undecided(id);
      expect(parcels).toHaveLength(0);
    });
  });

  // ── 7. Parcel creation consumes ONLY the stored decision ─────────────────
  it('ensureParcelForShipment fails closed when a shipment has no recorded decision (no search, no fallback)', async () => {
    const id = await insertLegacy();
    const s = await shipmentsRepo.findOne({ where: { id } });
    await expect((service as any).ensureParcelForShipment(s)).rejects.toThrow(/no recorded hub decision/);
    expect(parcels).toHaveLength(0);
  });

  // ── 8. discovery: read-only, owner-only, allow-listed ───────────────────
  describe('discovery', () => {
    it('shipment-bound: owner-only, deterministic id order, only ACTIVE hubs, exactly the allow-listed fields, nothing written', async () => {
      const s = await mk();
      const before = JSON.stringify(await ds.query(`SELECT * FROM public.shipment WHERE id=$1`, [s.id]));
      const r = await service.discoverHubsForShipment(7, s.id, 'origin');
      expect(r).toMatchObject({ side: 'origin', resolved: true, count: 3, decision: null });
      expect(r.hubs.map((h) => h.hubId)).toEqual([hubs.dar1, hubs.dar2, hubs.dar3]);
      for (const h of r.hubs) expect(Object.keys(h).sort()).toEqual(['address', 'city', 'hubId', 'name']);
      const wire = JSON.stringify(r);
      expect(wire).not.toMatch(/secret|GOV-|0700-|@s2f\.local|userId|governmentId/i);
      expect((await service.discoverHubsForShipment(7, s.id, 'origin')).hubs).toEqual(r.hubs); // same answer every time
      expect(JSON.stringify(await ds.query(`SELECT * FROM public.shipment WHERE id=$1`, [s.id]))).toBe(before);
      await expect(service.discoverHubsForShipment(999, s.id, 'origin')).rejects.toThrow(ForbiddenException);
      await expect(service.discoverHubsForShipment(7, s.id, 'sideways')).rejects.toThrow(BadRequestException);
    });

    it('shipment-bound reports the stored decision, and a free-text side has zero authority (resolved:false, no hubs)', async () => {
      const s = await mk({ originPlace: undefined, originCity: 'Dar es Salaam' });
      expect(await service.discoverHubsForShipment(7, s.id, 'origin')).toMatchObject({ resolved: false, count: 0, hubs: [], place: null });
      await service.confirmShipment(7, s.id, { providerId: p1.id, destinationHubId: hubs.mwanza1 });
      expect(await service.discoverHubsForShipment(7, s.id, 'destination')).toMatchObject({ decision: { source: 'sender_selected', hubId: hubs.mwanza1 } });
    });

    it('place preview: exact server-resolved PlaceRef; unknown place => 400; never selects', async () => {
      const r = await service.discoverHubsForPlace(p(REF.dar), 'origin');
      expect(r).toMatchObject({ resolved: true, count: 3 });
      expect((await service.discoverHubsForPlace(p(REF.kili), 'destination')).hubs.map((h) => h.hubId)).toEqual([hubs.moshi]);
      expect((await service.discoverHubsForPlace(p(REF.arusha), 'destination')).count).toBe(0);
      await expect(service.discoverHubsForPlace(p('region:999'), 'origin')).rejects.toThrow(BadRequestException);
      await expect(service.discoverHubsForPlace(p(REF.dar), 'x' as any)).rejects.toThrow(BadRequestException);
    });

    it('shipment-bound and place-preview policies cannot drift: same hubs as the confirm-time decision would see', async () => {
      const s = await mk();
      const a = (await service.discoverHubsForShipment(7, s.id, 'origin')).hubs.map((h) => h.hubId);
      const b = (await service.discoverHubsForPlace(p(REF.dar), 'origin')).hubs.map((h) => h.hubId);
      expect(a).toEqual(b);
      const e: any = await service.confirmShipment(7, s.id, { providerId: p1.id, requestOriginHub: true }).catch((x) => x);
      expect(e.getResponse().candidates.map((c: any) => c.hubId)).toEqual(a);
    });
  });

  // ── 9. regressions: Stages 2B / 2C / 2D / 2E invariants ─────────────────
  it('the Stage 2B location snapshot is byte-identical through create -> confirm -> retry -> conflicting retry', async () => {
    const snap = async (id: number) => (await ds.query(`SELECT ${SHIPMENT_LOCATION_SNAPSHOT_COLUMNS.map((c) => `"${c}"`).join(',')} FROM public.shipment WHERE id=$1`, [id]))[0];
    const s = await mk();
    const before = await snap(s.id);
    expect(before.originProviderKey).toBe('tz_seed');
    await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
    await service.confirmShipment(7, s.id, { providerId: p1.id });
    await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar2 }).catch(() => undefined);
    expect(await snap(s.id)).toEqual(before);
  });

  it('Stage 2C: capacity is reserved/committed exactly once across decision + retries; cancel of a decided shipment releases it once', async () => {
    const slot = await mkSlot();
    const s = await mk({ availabilityId: slot.id });
    await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
    await service.confirmShipment(7, s.id, { providerId: p1.id });
    expect(await slotRow(slot.id)).toMatchObject({ used: 1, kg: '2.00' });
    await service.cancelShipment(7, s.id);
    expect(await slotRow(slot.id)).toMatchObject({ used: 0, kg: '0.00' });
    expect(await row(s.id)).toMatchObject({ status: 'cancelled', originHubSource: 'sender_selected', originHubId: hubs.dar1 }); // decision is history, not rewritten
  });

  it('public tracking exposes no hub decision field', async () => {
    const s = await mk();
    await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: hubs.dar1 });
    const t = await service.trackShipment(s.trackingNumber!);
    expect(JSON.stringify(t)).not.toMatch(/HubId|HubSource|hubDecidedAt/);
  });

  it('hub deletion NULLs the id but the decision source survives; a retry still returns the existing Parcel', async () => {
    const u = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'tmp@s2f.local', phone: '+255799999999', password: 'x', name: 'tmp' } as any));
    const [{ id: tmp }] = await ds.query(`INSERT INTO public.super_agent ("userId","businessName",city,status) VALUES ($1,'Tmp','Arusha','active') RETURNING id`, [(u as any).id]);
    const s = await mk({ originPlace: p(REF.arusha) });
    await service.confirmShipment(7, s.id, { providerId: p1.id, originHubId: tmp });
    await ds.query(`DELETE FROM public.super_agent WHERE id=$1`, [tmp]);
    expect(await row(s.id)).toMatchObject({ originHubSource: 'sender_selected', originHubId: null });
    expect((await service.confirmShipment(7, s.id, { providerId: p1.id })).parcel).toBe(parcels[0]);
  });
});
