import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  getB5BTestConnectionConfig,
  resetB5BTestSchema,
  B5B_BASE_ENTITIES,
} from '../business/b5b-closure-test-db';
import { ShipmentsService } from './shipments.service';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';
import { TransportService } from '../transport/transport.service';
import { ProviderAvailability, AvailabilityStatus } from '../transport/entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { TransportRoute, RouteType } from '../transport/entities/transport-route.entity';
import { reserveSlotAtomic } from '../transport/slot-capacity';

/**
 * Stage 2C — REAL PostgreSQL proof of the capacity-attachment boundary:
 * atomic conditional UPDATE, exact numeric kg arithmetic, true transaction
 * rollback, row locks and genuine concurrency, exercised through the real
 * ShipmentsService + real TransportService against real tables.
 *
 * Runs ONLY against the repository's dedicated kentexa_b5b_test database via
 * the existing safety gate (resetB5BTestSchema refuses anything else); skipped
 * (never failed) when B5B_TEST_DB_PASSWORD is not configured, like the other
 * closure specs. Never touches production.
 *
 * Only the Parcel side is an in-memory fake: it is not part of what this stage
 * changes, and it lets the "Parcel creation fails after commit" case be forced.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

suite('Shipment capacity attachment — real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let slotsRepo: Repository<ProviderAvailability>;
  let shipmentsRepo: Repository<Shipment>;
  let transport: TransportService;
  let service: ShipmentsService;
  let p1: TransportProvider; // VERIFIED
  let p2: TransportProvider; // VERIFIED
  let p3: TransportProvider; // SUSPENDED
  let r1: TransportRoute; // p1's
  let r2: TransportRoute; // p1's
  let parcels: any[];
  let parcelSaveFailures: number;

  const dto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', originCity: 'Dar es Salaam',
    destinationCity: 'Mwanza', itemDescription: 'Clothes', weightKg: 2, providerId: p1.id, ...extra,
  });
  const mkSlot = async (o: Partial<ProviderAvailability> = {}) =>
    slotsRepo.save(slotsRepo.create({
      providerId: p1.id, routeId: null, date: TODAY, totalSlots: 5, usedSlots: 0, totalCapacityKg: 100,
      usedCapacityKg: 0, status: AvailabilityStatus.OPEN, fromCity: 'Dar es Salaam', toCity: 'Mwanza', ...o,
    } as any) as unknown as ProviderAvailability);
  const slotRow = async (id: number) => {
    const [r] = await ds.query(
      `SELECT "usedSlots"::int AS used, "usedCapacityKg"::text AS kg, status FROM public.provider_availability WHERE id = $1`, [id]);
    return r as { used: number; kg: string; status: string };
  };
  const shipmentCount = async () => (await ds.query(`SELECT count(*)::int AS n FROM public.shipment`))[0].n as number;
  const settle = async <T,>(ps: Array<Promise<T>>) => {
    const r = await Promise.allSettled(ps);
    return { ok: r.filter((x) => x.status === 'fulfilled').length, bad: r.filter((x) => x.status === 'rejected') as PromiseRejectedResult[] };
  };

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
    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    slotsRepo = ds.getRepository(ProviderAvailability);
    shipmentsRepo = ds.getRepository(Shipment);

    const mkProvider = (name: string, status: ProviderStatus) =>
      providers.save(providers.create({ name, type: ProviderType.BUS, status } as any) as unknown as TransportProvider);
    p1 = await mkProvider('P1', ProviderStatus.VERIFIED);
    p2 = await mkProvider('P2', ProviderStatus.VERIFIED);
    p3 = await mkProvider('P3', ProviderStatus.SUSPENDED);
    r1 = await routes.save(routes.create({ providerId: p1.id, routeType: RouteType.INTERCITY, originCity: 'Dar es Salaam', destinationCity: 'Mwanza' } as any) as unknown as TransportRoute);
    r2 = await routes.save(routes.create({ providerId: p1.id, routeType: RouteType.INTERCITY, originCity: 'Dar es Salaam', destinationCity: 'Arusha' } as any) as unknown as TransportRoute);
  });

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.shipment RESTART IDENTITY`);
    await ds.query(`DELETE FROM public.provider_availability`);
    parcels = []; parcelSaveFailures = 0;
    const parcelRepo: any = {
      create: (v: any) => ({ ...v }),
      findOne: async ({ where }: any) => parcels.find((p) => p.shipment?.id === where.shipment.id) ?? null,
      save: async (v: any) => {
        if (v.id) return v;
        if (parcelSaveFailures > 0) { parcelSaveFailures--; throw new Error('connection terminated unexpectedly'); }
        if (parcels.some((p) => p.shipment?.id === v.shipment?.id)) {
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
      shipmentsRepo, routes, parcelRepo, { findOne: async () => null } as any, transport, { search: async () => [] } as any, { resolve: async () => null } as any,
    );
  });

  // ── 1. concurrency on the last slot ─────────────────────────────────────
  it('N concurrent reservations of ONE remaining slot: exactly one succeeds, no orphan shipments, exact counters', async () => {
    const slot = await mkSlot({ totalSlots: 1 });
    const { ok, bad } = await settle(
      Array.from({ length: 10 }, () => service.createShipment(7, dto({ availabilityId: slot.id }))),
    );
    expect(ok).toBe(1);
    expect(bad).toHaveLength(9);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '2.00', status: 'full' });
    expect(await shipmentCount()).toBe(1); // the 9 losers rolled back completely
  });

  it('the kg bound cannot be oversubscribed under concurrency', async () => {
    const slot = await mkSlot({ totalSlots: 100, totalCapacityKg: 10 });
    const { ok } = await settle(
      Array.from({ length: 8 }, () => service.createShipment(7, dto({ availabilityId: slot.id, weightKg: 3 }))),
    );
    expect(ok).toBe(3); // 3 x 3kg = 9kg fits, a 4th (12kg) never does
    expect(await slotRow(slot.id)).toEqual({ used: 3, kg: '9.00', status: 'open' });
    expect(await shipmentCount()).toBe(3);
  });

  // ── 2. exact numeric arithmetic ─────────────────────────────────────────
  it('numeric kg reserve/release is exact (the old string-concatenation bug is gone)', async () => {
    const slot = await mkSlot({ totalCapacityKg: 0 });
    const m = ds.manager;
    await transport.reserveSlot(slot.id, 2.5, {}, m);
    await transport.reserveSlot(slot.id, 3.25, {}, m);
    await transport.reserveSlot(slot.id, 12, {}, m);
    expect(await slotRow(slot.id)).toEqual({ used: 3, kg: '17.75', status: 'open' });
    await transport.releaseCapacity(slot.id, 3.25, m);
    expect(await slotRow(slot.id)).toEqual({ used: 2, kg: '14.50', status: 'open' });
  });

  it('the legacy createAssignment primitive reserveCapacity now does correct numeric kg arithmetic too', async () => {
    const slot = await mkSlot();
    await transport.reserveCapacity(slot.id, 2.5);
    await transport.reserveCapacity(slot.id, 2.5);
    expect(await slotRow(slot.id)).toEqual({ used: 2, kg: '5.00', status: 'open' });
  });

  it('release never underflows', async () => {
    const slot = await mkSlot();
    await transport.releaseCapacity(slot.id, 5);
    await transport.releaseCapacity(slot.id, 5);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
  });

  // ── 2b. the conditional UPDATE is the final authority (no TOCTOU hole) ──
  // Called DIRECTLY, bypassing the service's read-side pre-checks: each guard
  // in the UPDATE's own WHERE must refuse on its own, because between a
  // pre-check and the UPDATE the row can change under a concurrent writer.
  describe('the atomic UPDATE re-asserts every condition itself', () => {
    const strict = (o: Partial<{ providerId: number; routeId: number; today: string }> = {}) => ({
      today: TODAY, providerId: p1.id, ...o,
    });
    const cases: Array<[string, () => Partial<ProviderAvailability>, () => any, number]> = [
      ['no free slot although status still says OPEN', () => ({ totalSlots: 2, usedSlots: 2 }), () => strict(), 1],
      ['not OPEN (DEPARTED)', () => ({ status: AvailabilityStatus.DEPARTED }), () => strict(), 1],
      ['not OPEN (CANCELLED)', () => ({ status: AvailabilityStatus.CANCELLED }), () => strict(), 1],
      ['a date in the past', () => ({ date: YESTERDAY }), () => strict(), 1],
      ['a different provider than the one validated', () => ({}), () => strict({ providerId: p2.id }), 1],
      ['a different route than the one validated', () => ({ routeId: r1.id }), () => strict({ routeId: r2.id }), 1],
      ['a ROUTE-LESS slot when a route was expected', () => ({}), () => strict({ routeId: r1.id }), 1],
      ['insufficient kg', () => ({ totalCapacityKg: 10, usedCapacityKg: 9 }), () => strict(), 3],
    ];
    it.each(cases)('refuses %s and changes nothing', async (_n, overrideOf, guardOf, weight) => {
      const slot = await mkSlot(overrideOf() as any);
      const before = await slotRow(slot.id);
      expect(await reserveSlotAtomic(ds.manager, slot.id, weight, guardOf())).toBe(false);
      expect(await slotRow(slot.id)).toEqual(before);
    });

    it('and accepts when every condition holds (route-less slot, matching identity)', async () => {
      const slot = await mkSlot();
      expect(await reserveSlotAtomic(ds.manager, slot.id, 2.5, strict())).toBe(true);
      expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '2.50', status: 'open' });
    });

    it('with NO expected route there is no route requirement (route-less and routed slots both accepted)', async () => {
      const routeless = await mkSlot();
      const routed = await mkSlot({ routeId: r1.id });
      expect(await reserveSlotAtomic(ds.manager, routeless.id, 1, strict())).toBe(true);
      expect(await reserveSlotAtomic(ds.manager, routed.id, 1, strict())).toBe(true);
    });

    it('with the expected route present on the slot it accepts', async () => {
      const routed = await mkSlot({ routeId: r1.id });
      expect(await reserveSlotAtomic(ds.manager, routed.id, 1, strict({ routeId: r1.id }))).toBe(true);
    });

    it('a kg bound of 0 ("not declared") does not block', async () => {
      const slot = await mkSlot({ totalCapacityKg: 0 });
      expect(await reserveSlotAtomic(ds.manager, slot.id, 500, strict())).toBe(true);
    });
  });

  // ── 3. invalid attach leaves everything unchanged ───────────────────────
  describe('invalid attach leaves ALL state unchanged', () => {
    const cases: Array<[string, () => Promise<Record<string, unknown>>]> = [
      ['a slot of another provider', async () => ({ providerId: p2.id, availabilityId: (await mkSlot()).id })],
      ['a slot of another route', async () => ({ routeId: r2.id, availabilityId: (await mkSlot({ routeId: r1.id })).id })],
      ['a ROUTE-LESS slot when the shipment selected a route', async () => ({ routeId: r1.id, availabilityId: (await mkSlot({ routeId: null })).id })],
      ['a CANCELLED slot', async () => ({ availabilityId: (await mkSlot({ status: AvailabilityStatus.CANCELLED })).id })],
      ['a DEPARTED slot', async () => ({ availabilityId: (await mkSlot({ status: AvailabilityStatus.DEPARTED })).id })],
      ['a past-dated slot', async () => ({ availabilityId: (await mkSlot({ date: YESTERDAY })).id })],
      ['a FULL slot', async () => ({ availabilityId: (await mkSlot({ status: AvailabilityStatus.FULL, usedSlots: 5 })).id })],
      ['a slot without room for the weight', async () => ({ weightKg: 50, availabilityId: (await mkSlot({ totalCapacityKg: 40 })).id })],
      ['a slot of a SUSPENDED provider', async () => ({ providerId: p3.id, availabilityId: (await mkSlot({ providerId: p3.id })).id })],
      ['a nonexistent slot', async () => ({ availabilityId: 999999 })],
    ];
    it.each(cases)('rejects %s', async (_n, make) => {
      const extra = await make();
      const id = extra.availabilityId as number;
      const before = id < 999999 ? await slotRow(id) : null;
      await expect(service.createShipment(7, dto(extra))).rejects.toThrow();
      expect(await shipmentCount()).toBe(0);
      if (before) expect(await slotRow(id)).toEqual(before);
    });

    it('rejects a non-finite / negative weight before any write', async () => {
      const slot = await mkSlot();
      for (const weightKg of [NaN, -1, 'abc', Infinity]) {
        await expect(service.createShipment(7, dto({ availabilityId: slot.id, weightKg }))).rejects.toThrow(BadRequestException);
      }
      expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
      expect(await shipmentCount()).toBe(0);
    });
  });

  // ── 4. create failure rolls the reservation back ────────────────────────
  it('a failure AFTER the reservation (tracking-number unique violation) rolls the reservation and the row back', async () => {
    const a = await service.createShipment(7, dto()); // id 1, no slot
    await ds.query(`UPDATE public.shipment SET "trackingNumber" = 'KTX-SHP-2' WHERE id = $1`, [a.id]);
    const slot = await mkSlot();
    await expect(service.createShipment(7, dto({ availabilityId: slot.id }))).rejects.toThrow(); // gets id 2 -> KTX-SHP-2 collides
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
    expect(await shipmentCount()).toBe(1);
  });

  // ── 5. confirm: slot switch, races, rollback ────────────────────────────
  it('confirm slot-switch reserves the new slot and releases the old one, exactly', async () => {
    const a = await mkSlot(); const b = await mkSlot();
    const s = await service.createShipment(7, dto({ availabilityId: a.id }));
    await service.confirmShipment(7, s.id, { availabilityId: b.id });
    expect(await slotRow(a.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
    expect(await slotRow(b.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
    expect((await shipmentsRepo.findOneByOrFail({ id: s.id })).status).toBe(ShipmentStatus.CONFIRMED);
  });

  it('concurrent confirms (same switch) yield ONE committed outcome, exact counters and one Parcel', async () => {
    const a = await mkSlot(); const b = await mkSlot();
    const s = await service.createShipment(7, dto({ availabilityId: a.id }));
    await Promise.all(Array.from({ length: 6 }, () => service.confirmShipment(7, s.id, { availabilityId: b.id })));
    expect(await slotRow(a.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
    expect(await slotRow(b.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
    expect(parcels).toHaveLength(1);
  });

  it('concurrent confirms toward DIFFERENT slots: one wins; the losers leave no capacity change behind', async () => {
    const a = await mkSlot(); const b = await mkSlot(); const c = await mkSlot();
    const s = await service.createShipment(7, dto({ availabilityId: a.id }));
    await Promise.allSettled([
      service.confirmShipment(7, s.id, { availabilityId: b.id }),
      service.confirmShipment(7, s.id, { availabilityId: c.id }),
    ]);
    const final = await shipmentsRepo.findOneByOrFail({ id: s.id });
    const used = { a: (await slotRow(a.id)).used, b: (await slotRow(b.id)).used, c: (await slotRow(c.id)).used };
    expect(final.status).toBe(ShipmentStatus.CONFIRMED);
    expect([b.id, c.id]).toContain(final.availabilityId);
    expect(used.a).toBe(0);
    expect(used.b + used.c).toBe(1);
    expect(used[final.availabilityId === b.id ? 'b' : 'c']).toBe(1);
    expect(parcels).toHaveLength(1);
  });

  it('a confirm whose new slot cannot be reserved rolls the claim and the release back (all-or-nothing)', async () => {
    const a = await mkSlot(); const full = await mkSlot({ totalSlots: 1, usedSlots: 1, status: AvailabilityStatus.FULL });
    const s = await service.createShipment(7, dto({ availabilityId: a.id }));
    await expect(service.confirmShipment(7, s.id, { availabilityId: full.id })).rejects.toThrow();
    const row = await shipmentsRepo.findOneByOrFail({ id: s.id });
    expect(row).toMatchObject({ status: ShipmentStatus.PENDING, availabilityId: a.id });
    expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
    expect(await slotRow(full.id)).toEqual({ used: 1, kg: '0.00', status: 'full' });
    expect(parcels).toHaveLength(0);
  });

  describe('route contract (real database)', () => {
    it('shipment route X + slot route X => attaches and confirms', async () => {
      const a = await mkSlot({ routeId: r1.id });
      const s = await service.createShipment(7, dto({ routeId: r1.id, availabilityId: a.id }));
      await service.confirmShipment(7, s.id, {});
      expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
      expect((await shipmentsRepo.findOneByOrFail({ id: s.id })).status).toBe(ShipmentStatus.CONFIRMED);
    });

    it('no shipment route: route-less slot attaches (no route requirement invented)', async () => {
      const a = await mkSlot({ routeId: null });
      await service.createShipment(7, dto({ availabilityId: a.id }));
      expect((await slotRow(a.id)).used).toBe(1);
    });

    it('held ROUTE-LESS slot + confirm selecting route X => rejected, claim rolled back, slot still held once', async () => {
      const a = await mkSlot({ routeId: null });
      const s = await service.createShipment(7, dto({ availabilityId: a.id }));
      await expect(service.confirmShipment(7, s.id, { routeId: r1.id })).rejects.toThrow(BadRequestException);
      const row = await shipmentsRepo.findOneByOrFail({ id: s.id });
      expect(row).toMatchObject({ status: ShipmentStatus.PENDING, routeId: null, availabilityId: a.id });
      expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
      expect(parcels).toHaveLength(0);
    });

    it('confirm switching a routed shipment to a ROUTE-LESS slot is rejected and everything rolls back', async () => {
      const a = await mkSlot({ routeId: r1.id }); const b = await mkSlot({ routeId: null });
      const s = await service.createShipment(7, dto({ routeId: r1.id, availabilityId: a.id }));
      await expect(service.confirmShipment(7, s.id, { availabilityId: b.id })).rejects.toThrow(BadRequestException);
      expect(await shipmentsRepo.findOneByOrFail({ id: s.id })).toMatchObject({ status: ShipmentStatus.PENDING, availabilityId: a.id });
      expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
      expect(await slotRow(b.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
    });
  });

  it('two shipments switching slots in opposite directions at once do not deadlock and end consistent', async () => {
    const a = await mkSlot(); const b = await mkSlot();
    const s1 = await service.createShipment(7, dto({ availabilityId: a.id }));
    const s2 = await service.createShipment(7, dto({ availabilityId: b.id }));
    await Promise.all([
      service.confirmShipment(7, s1.id, { availabilityId: b.id }),
      service.confirmShipment(7, s2.id, { availabilityId: a.id }),
    ]);
    expect((await slotRow(a.id)).used).toBe(1);
    expect((await slotRow(b.id)).used).toBe(1);
  });

  it('confirming with a provider different from the held slot\'s provider is rejected and rolled back', async () => {
    const a = await mkSlot();
    const s = await service.createShipment(7, dto({ availabilityId: a.id }));
    await expect(service.confirmShipment(7, s.id, { providerId: p2.id })).rejects.toThrow(BadRequestException);
    expect((await shipmentsRepo.findOneByOrFail({ id: s.id })).status).toBe(ShipmentStatus.PENDING);
    expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
  });

  it('Parcel failure after commit + retry: exactly one Parcel, capacity never reserved a second time', async () => {
    const a = await mkSlot();
    const s = await service.createShipment(7, dto());
    parcelSaveFailures = 1;
    await expect(service.confirmShipment(7, s.id, { availabilityId: a.id })).rejects.toThrow('connection terminated unexpectedly');
    expect((await shipmentsRepo.findOneByOrFail({ id: s.id })).status).toBe(ShipmentStatus.CONFIRMED);
    expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });

    await service.confirmShipment(7, s.id, { availabilityId: a.id });
    await service.confirmShipment(7, s.id, {});
    expect(parcels).toHaveLength(1);
    expect(await slotRow(a.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
  });

  // ── 6. cancel ───────────────────────────────────────────────────────────
  it('concurrent + retried cancels release exactly once (a double release would show on a shared slot)', async () => {
    const slot = await mkSlot();
    const s1 = await service.createShipment(7, dto({ availabilityId: slot.id }));
    await service.createShipment(7, dto({ availabilityId: slot.id })); // second holder keeps the slot at used=2
    const { ok } = await settle(Array.from({ length: 6 }, () => service.cancelShipment(7, s1.id)));
    expect(ok).toBe(1);
    await expect(service.cancelShipment(7, s1.id)).rejects.toThrow(BadRequestException);
    expect(await slotRow(slot.id)).toEqual({ used: 1, kg: '2.00', status: 'open' });
    expect((await shipmentsRepo.findOneByOrFail({ id: s1.id })).status).toBe(ShipmentStatus.CANCELLED);
  });

  it('release turns a FULL slot back to OPEN', async () => {
    const slot = await mkSlot({ totalSlots: 1 });
    const s = await service.createShipment(7, dto({ availabilityId: slot.id }));
    expect((await slotRow(slot.id)).status).toBe('full');
    await service.cancelShipment(7, s.id);
    expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status: 'open' });
  });

  it.each([[AvailabilityStatus.DEPARTED], [AvailabilityStatus.CANCELLED]])(
    'release never reopens a %s slot',
    async (status) => {
      const slot = await mkSlot();
      const s = await service.createShipment(7, dto({ availabilityId: slot.id }));
      await ds.query(`UPDATE public.provider_availability SET status = $1 WHERE id = $2`, [status, slot.id]);
      await service.cancelShipment(7, s.id);
      expect(await slotRow(slot.id)).toEqual({ used: 0, kg: '0.00', status });
    },
  );

  it('cancel racing confirm ends consistent: CANCELLED => slot released once; CONFIRMED => slot still held once', async () => {
    const slot = await mkSlot();
    const s = await service.createShipment(7, dto({ availabilityId: slot.id }));
    await Promise.allSettled([service.cancelShipment(7, s.id), service.confirmShipment(7, s.id, {})]);
    const final = await shipmentsRepo.findOneByOrFail({ id: s.id });
    expect((await slotRow(slot.id)).used).toBe(final.status === ShipmentStatus.CANCELLED ? 0 : 1);
  });

  // ── 7. published listing only shows VERIFIED/ACTIVE providers ───────────
  it('findAvailableForRoute publishes slots of VERIFIED providers and hides a SUSPENDED provider\'s', async () => {
    const good = await mkSlot({ providerId: p1.id });
    const bad = await mkSlot({ providerId: p3.id });
    const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza');
    const ids = published.map((x) => x.id);
    expect(ids).toContain(good.id);
    expect(ids).not.toContain(bad.id);
  });
});
