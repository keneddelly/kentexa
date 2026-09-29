import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TransportService } from './transport.service';
import { ProviderAvailability, AvailabilityStatus } from './entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from './entities/transport-provider.entity';
import { TransportRoute, RouteType } from './entities/transport-route.entity';

/**
 * Stage 3S-B2 — Discovery Comparison, proved against REAL PostgreSQL: the
 * exact canonical public discovery path (TransportService.findAvailableForRoute
 * / findPublicAvailabilityForRoute), which every existing caller (Shipment
 * discovery, the coverage map, GET /transport/available) already shares.
 *
 * Pure read-side. No test here creates a Shipment/Parcel, reserves capacity,
 * or writes a custody event — that is the point being proved, not just an
 * assumption.
 *
 * Runs only against the dedicated kentexa_b5b_test database (resetB5BTestSchema's
 * own safety gate); skipped, never failed, when B5B_TEST_DB_PASSWORD is not
 * configured. Never touches production or the isolated Stage3KR environment.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

const TODAY = new Date().toISOString().slice(0, 10);

suite('Stage 3S-B2 — transport discovery sorting, real PostgreSQL', () => {
  jest.setTimeout(120000);
  let ds: DataSource;
  let providers: Repository<TransportProvider>;
  let routes: Repository<TransportRoute>;
  let slots: Repository<ProviderAvailability>;
  let transport: TransportService;

  const mkProvider = (name: string, status: ProviderStatus = ProviderStatus.VERIFIED) =>
    providers.save(providers.create({ name, type: ProviderType.BUS, status } as any) as unknown as TransportProvider);
  const mkRoute = (providerId: number, o: Partial<TransportRoute> = {}) =>
    routes.save(routes.create({
      providerId, routeType: RouteType.INTERCITY, originCity: 'Dar es Salaam', destinationCity: 'Mwanza',
      pricePerKg: 0, fixedFee: 0, estimatedHours: null, isActive: true, ...o,
    } as any) as unknown as TransportRoute);
  const mkSlot = (providerId: number, routeId: number | null, o: Partial<ProviderAvailability> = {}) =>
    slots.save(slots.create({
      providerId, routeId, date: TODAY, departureTime: '08:00', totalSlots: 5, usedSlots: 0,
      totalCapacityKg: 100, usedCapacityKg: 0, status: AvailabilityStatus.OPEN,
      fromCity: 'Dar es Salaam', toCity: 'Mwanza', ...o,
    } as any) as unknown as ProviderAvailability);
  const tripCount = async () => (await ds.query(`SELECT count(*)::int AS n FROM public.provider_availability`))[0].n as number;
  const shipmentCount = async () => (await ds.query(`SELECT count(*)::int AS n FROM public.shipment`))[0].n as number;
  const slotUnchanged = async (id: number) =>
    (await ds.query(`SELECT "usedSlots"::int u, "usedCapacityKg"::text k, status FROM public.provider_availability WHERE id=$1`, [id]))[0];

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, ProviderAvailability, TransportRoute],
    });
    await ds.initialize();
    // Shipment isn't in this DataSource's entity set (kept minimal, matching
    // shipment-capacity.real-postgres.spec.ts's own reasoning) -- a plain
    // table only so shipmentCount() can prove discovery never creates one.
    await ds.query(`CREATE TABLE public.shipment (id serial PRIMARY KEY)`);

    providers = ds.getRepository(TransportProvider);
    routes = ds.getRepository(TransportRoute);
    slots = ds.getRepository(ProviderAvailability);

    const args: any[] = new Array(15).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots;
    transport = new (TransportService as any)(...args);
  });

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  beforeEach(async () => {
    await ds.query(`DELETE FROM public.provider_availability`);
    await ds.query(`DELETE FROM public.transport_route`);
    await ds.query(`DELETE FROM public.transport_provider`);
  });

  it('cheapest: orders by GREATEST(pricePerKg*weight, fixedFee), route-less trips sink to the end', async () => {
    const p = await mkProvider('P');
    const cheap = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 1000 });
    const mid = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 5000 });
    const costly = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 9000 });
    const sMid = await mkSlot(p.id, mid.id);
    const sCheap = await mkSlot(p.id, cheap.id);
    const sCostly = await mkSlot(p.id, costly.id);
    const sNoRoute = await mkSlot(p.id, null);

    const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'cheapest' });
    expect(published.map((x) => x.id)).toEqual([sCheap.id, sMid.id, sCostly.id, sNoRoute.id]);
  });

  it('cheapest with a declared weight uses pricePerKg*weight when it exceeds fixedFee', async () => {
    const p = await mkProvider('P');
    const perKg = await mkRoute(p.id, { pricePerKg: 500, fixedFee: 1000 }); // 3kg -> 1500, beats fixedFee
    const flat = await mkRoute(p.id, { pricePerKg: 100, fixedFee: 2000 }); // 3kg -> 300, fixedFee wins at 2000
    const sPerKg = await mkSlot(p.id, perKg.id);
    const sFlat = await mkSlot(p.id, flat.id);

    const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 3, { sortBy: 'cheapest' });
    // sPerKg (effective 1500) must rank below sFlat (effective 2000)
    expect(published.map((x) => x.id)).toEqual([sPerKg.id, sFlat.id]);
  });

  it('fastest: orders by TransportRoute.estimatedHours, route-less trips sink to the end', async () => {
    const p = await mkProvider('P');
    const slow = await mkRoute(p.id, { estimatedHours: 20 });
    const fast = await mkRoute(p.id, { estimatedHours: 6 });
    const mid = await mkRoute(p.id, { estimatedHours: 12 });
    const sSlow = await mkSlot(p.id, slow.id);
    const sFast = await mkSlot(p.id, fast.id);
    const sMid = await mkSlot(p.id, mid.id);
    const sNoRoute = await mkSlot(p.id, null);

    const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'fastest' });
    expect(published.map((x) => x.id)).toEqual([sFast.id, sMid.id, sSlow.id, sNoRoute.id]);
  });

  it('earliest: orders by date then departureTime (unchanged default) whether sortBy is omitted, unrecognised, or explicit', async () => {
    const p = await mkProvider('P');
    const r = await mkRoute(p.id);
    const late = await mkSlot(p.id, r.id, { departureTime: '18:00' });
    const early = await mkSlot(p.id, r.id, { departureTime: '06:00' });
    const mid = await mkSlot(p.id, r.id, { departureTime: '12:00' });
    const expected = [early.id, mid.id, late.id];

    expect((await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza')).published.map((x) => x.id)).toEqual(expected);
    expect((await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, {})).published.map((x) => x.id)).toEqual(expected);
    expect((await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'earliest' })).published.map((x) => x.id)).toEqual(expected);
    expect((await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy: 'unrecognised' as any })).published.map((x) => x.id)).toEqual(expected);
  });

  it('deterministic tie-break: identical price, identical duration, and identical date+time all fall back to id ASC, stably across repeats', async () => {
    const p = await mkProvider('P');
    const rA = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 3000, estimatedHours: 10 });
    const rB = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 3000, estimatedHours: 10 });
    const sA = await mkSlot(p.id, rA.id, { departureTime: '09:00' });
    const sB = await mkSlot(p.id, rB.id, { departureTime: '09:00' });
    const expectedOrder = [sA.id, sB.id].sort((a, b) => a - b);

    for (const sortBy of ['cheapest', 'fastest', 'earliest'] as const) {
      for (let i = 0; i < 3; i++) {
        const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy });
        expect(published.map((x) => x.id)).toEqual(expectedOrder);
      }
    }
  });

  // A tiny fixture's incidental heap-scan order can already happen to agree
  // with id ASC even with NO explicit tiebreaker at all -- so the test above
  // alone would not actually catch a missing/wrong tiebreaker (confirmed: it
  // didn't, until this one was added). Forcing a real UPDATE on the
  // lower-id row rewrites its tuple to a new physical heap location
  // (ordinary Postgres MVCC behaviour), so an unordered sequential scan of
  // this small table now genuinely returns the higher-id row FIRST -- only
  // the explicit `ORDER BY a.id ASC` can put id order back.
  it('the id tiebreaker is load-bearing, not incidental: forcing physical heap reordering still returns id ASC', async () => {
    const p = await mkProvider('P');
    const r = await mkRoute(p.id, { pricePerKg: 0, fixedFee: 3000, estimatedHours: 10 });
    const sA = await mkSlot(p.id, r.id, { departureTime: '09:00' });
    const sB = await mkSlot(p.id, r.id, { departureTime: '09:00' });
    await ds.query(`UPDATE public.provider_availability SET "updatedAt" = now() WHERE id = $1`, [sA.id]);
    const heapOrder = (await ds.query(`SELECT id FROM public.provider_availability ORDER BY ctid`)).map((x: any) => x.id);
    expect(heapOrder).toEqual([sB.id, sA.id]); // confirms the forced reorder actually happened

    for (const sortBy of ['cheapest', 'fastest', 'earliest'] as const) {
      const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy });
      expect(published.map((x) => x.id)).toEqual([sA.id, sB.id]); // id ASC, despite physical order being reversed
    }
  });

  it('inactive/unverified/ineligible remain excluded under every sort mode', async () => {
    const good = await mkProvider('Good', ProviderStatus.VERIFIED);
    const pending = await mkProvider('Pending', ProviderStatus.PENDING);
    const suspended = await mkProvider('Suspended', ProviderStatus.SUSPENDED);
    const rGood = await mkRoute(good.id);
    const rPending = await mkRoute(pending.id);
    const rSuspended = await mkRoute(suspended.id);
    const sGood = await mkSlot(good.id, rGood.id);
    await mkSlot(pending.id, rPending.id);
    await mkSlot(suspended.id, rSuspended.id);
    const full = await mkSlot(good.id, rGood.id, { totalSlots: 1, usedSlots: 1, status: AvailabilityStatus.FULL });
    const cancelled = await mkSlot(good.id, rGood.id, { status: AvailabilityStatus.CANCELLED });

    for (const sortBy of ['cheapest', 'fastest', 'earliest'] as const) {
      const { published } = await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 0, { sortBy });
      const ids = published.map((x) => x.id);
      expect(ids).toEqual([sGood.id]);
      expect(ids).not.toContain(full.id);
      expect(ids).not.toContain(cancelled.id);
    }
  });

  it('discovery creates no Shipment/Parcel and never consumes capacity, for any sort mode', async () => {
    const p = await mkProvider('P');
    const r = await mkRoute(p.id, { pricePerKg: 10, fixedFee: 500, estimatedHours: 8 });
    const slot = await mkSlot(p.id, r.id);
    const before = await slotUnchanged(slot.id);

    for (const sortBy of ['cheapest', 'fastest', 'earliest'] as const) {
      await transport.findAvailableForRoute('Dar es Salaam', 'Mwanza', 5, { sortBy });
    }
    expect(await slotUnchanged(slot.id)).toEqual(before);
    expect(await tripCount()).toBe(1); // still exactly the one slot created by the fixture, none added
    expect(await shipmentCount()).toBe(0);
  });

  it('findPublicAvailabilityForRoute: existing callers with neither weightKg nor sortBy see the unchanged default shape and order, plus the new estimatedHours field', async () => {
    const p = await mkProvider('P');
    const r = await mkRoute(p.id, { pricePerKg: 200, fixedFee: 1000, estimatedHours: 9 });
    const early = await mkSlot(p.id, r.id, { departureTime: '05:00' });
    const late = await mkSlot(p.id, r.id, { departureTime: '20:00' });

    const result = await transport.findPublicAvailabilityForRoute('Dar es Salaam', 'Mwanza');
    expect(result.trips.map((t) => t.availabilityId)).toEqual([early.id, late.id]);
    expect(result.trips[0]).toMatchObject({ pricePerKg: '200.00', fixedFee: '1000.00', estimatedHours: 9 });
  });

  it('findPublicAvailabilityForRoute: sortBy=cheapest actually reorders the public trip list', async () => {
    const p = await mkProvider('P');
    const pricier = await mkRoute(p.id, { fixedFee: 9000 });
    const cheaper = await mkRoute(p.id, { fixedFee: 1000 });
    const sPricier = await mkSlot(p.id, pricier.id);
    const sCheaper = await mkSlot(p.id, cheaper.id);

    const result = await transport.findPublicAvailabilityForRoute('Dar es Salaam', 'Mwanza', 0, 'cheapest');
    expect(result.trips.map((t) => t.availabilityId)).toEqual([sCheaper.id, sPricier.id]);
  });
});
