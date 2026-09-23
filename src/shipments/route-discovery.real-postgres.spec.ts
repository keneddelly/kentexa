import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema, B5B_BASE_ENTITIES } from '../business/b5b-closure-test-db';
import { TzRegion } from '../tz-location/entities/tz-region.entity';
import { TzDistrict } from '../tz-location/entities/tz-district.entity';
import { TzWard } from '../tz-location/entities/tz-ward.entity';
import { TzLocationService } from '../tz-location/tz-location.service';
import { seedTzLocations } from '../tz-location/tz-complete-seed';
import { TzSeedLocationProvider } from '../location-intelligence/providers/tz-seed-location.provider';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { ShipmentsService } from './shipments.service';
import { Shipment } from './entities/shipment.entity';
import { TransportService } from '../transport/transport.service';
import { ProviderAvailability, AvailabilityStatus } from '../transport/entities/provider-availability.entity';
import { TransportProvider, ProviderStatus, ProviderType } from '../transport/entities/transport-provider.entity';
import { TransportRoute, RouteType } from '../transport/entities/transport-route.entity';
import { User } from '../users/entities/user.entity';

/**
 * Stage 2E — REAL PostgreSQL proof of place-aware route discovery and the
 * hardened string path, against PRODUCTION-SHAPED route/availability strings
 * (copied from the live rows: "Dar es salaam " with a lower-case s and trailing
 * space, "Dar" as a short form, a coverageWards blob "Kariakoo,mbagala,Ubungo
 * and bunju", a capital-keyed route) and production-parity tz data
 * (31 regions / 177 districts / 339 wards).
 *
 * Runs only against the repository's dedicated kentexa_b5b_test database via
 * its safety gate; skipped (never failed) without B5B_TEST_DB_PASSWORD.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;
const TODAY = new Date().toISOString().slice(0, 10);

suite('Route discovery — real PostgreSQL, production-shaped data', () => {
  jest.setTimeout(300000);
  let ds: DataSource;
  let shipments: ShipmentsService;
  let transport: TransportService;
  const ids: Record<string, number> = {};

  const placeId = async (level: 'ward' | 'district' | 'region', name: string) => {
    const table = { ward: 'tz_ward', district: 'tz_district', region: 'tz_region' }[level];
    const [row] = await ds.query(`SELECT id FROM public.${table} WHERE name = $1 ORDER BY id LIMIT 1`, [name]);
    return `${level}:${row.id}`;
  };
  const place = async (level: 'ward' | 'district' | 'region', name: string, extra: object = {}) => ({
    place: { providerKey: 'tz_seed', providerPlaceId: await placeId(level, name), ...extra },
  });
  const tripIds = (r: any) => r.availableTrips.map((t: any) => t.availabilityId);
  const providerIds = (r: any) => r.providers.map((p: any) => p.id);

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, extra: { max: 20 },
      entities: [...B5B_BASE_ENTITIES, TzRegion, TzDistrict, TzWard, ProviderAvailability, TransportRoute, Shipment],
    });
    await ds.initialize();

    const tz = new TzLocationService(ds.getRepository(TzRegion), ds.getRepository(TzDistrict), ds.getRepository(TzWard));
    await seedTzLocations(ds); // production parity: union of both idempotent loaders
    await tz.seedAll();
    const li = new LocationIntelligenceService(new TzSeedLocationProvider(tz));

    const users = ds.getRepository(User);
    const mkUser = async (n: number) => (await users.save(users.create({ email: `p${n}@e2e.local`, phone: `+2557000000${n}`, password: 'x', name: `P${n}` } as any) as unknown as User)).id;
    const providers = ds.getRepository(TransportProvider);
    const mkProvider = async (key: string, n: number, status: ProviderStatus) => {
      const p = await providers.save(providers.create({ userId: await mkUser(n), name: key, type: ProviderType.BUS, status } as any) as unknown as TransportProvider);
      ids[key] = p.id;
      return p.id;
    };
    const routes = ds.getRepository(TransportRoute);
    const mkRoute = (providerId: number, o: Partial<TransportRoute>) =>
      routes.save(routes.create({ providerId, isActive: true, ...o } as any) as unknown as TransportRoute);
    const slots = ds.getRepository(ProviderAvailability);
    const mkSlot = (providerId: number, o: Partial<ProviderAvailability>) =>
      slots.save(slots.create({ providerId, date: TODAY, totalSlots: 5, usedSlots: 0, totalCapacityKg: 100, usedCapacityKg: 0, status: AvailabilityStatus.OPEN, ...o } as any) as unknown as ProviderAvailability);

    // pA: the two REAL production routes (intercity with sloppy origin; last-mile with a CSV-ish blob)
    const pA = await mkProvider('pA', 1, ProviderStatus.VERIFIED);
    await mkRoute(pA, { routeType: RouteType.INTERCITY, originCity: 'Dar es salaam ', destinationCity: 'Iringa' });
    await mkRoute(pA, { routeType: RouteType.LAST_MILE, coverageCity: 'Dar es Salaam', coverageWards: 'Kariakoo,mbagala,Ubungo and bunju' } as any);
    // pB: a route keyed by the REGION CAPITAL (Kilimanjaro -> Moshi), as 13 of the 110 pricing routes are
    const pB = await mkProvider('pB', 2, ProviderStatus.VERIFIED);
    await mkRoute(pB, { routeType: RouteType.INTERCITY, originCity: 'Moshi', destinationCity: 'Dar es Salaam' });
    // pC: SUSPENDED provider with a route and a slot: must never be discoverable
    const pC = await mkProvider('pC', 3, ProviderStatus.SUSPENDED);
    await mkRoute(pC, { routeType: RouteType.INTERCITY, originCity: 'Dar es Salaam', destinationCity: 'Mwanza' });
    ids.slotSuspended = (await mkSlot(pC, { fromCity: 'Dar', toCity: 'Mwanza' })).id;
    // pD: availability only (no routes): the short form "Dar", plus junk stored values
    const pD = await mkProvider('pD', 4, ProviderStatus.VERIFIED);
    ids.slotDarMwanza = (await mkSlot(pD, { fromCity: 'Dar', toCity: 'Mwanza' })).id;
    ids.slotSloppy = (await mkSlot(pD, { fromCity: 'Dar es salaam ', toCity: 'Arusha' })).id;
    ids.slotEmptyFrom = (await mkSlot(pD, { fromCity: '', toCity: 'Mbeya' })).id;
    ids.slotOneChar = (await mkSlot(pD, { fromCity: 'a', toCity: 'Mbeya' })).id;
    ids.slotUnderscore = (await mkSlot(pD, { fromCity: 'Dar_es', toCity: 'Tanga' })).id;

    const args: any[] = new Array(14).fill({});
    args[0] = providers; args[1] = routes; args[2] = slots;
    transport = new (TransportService as any)(...args);
    shipments = new ShipmentsService({} as any, {} as any, {} as any, {} as any, transport, tz, li);
  });

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  it('fixtures reflect the production shapes (trailing space, lower-case s, short form, blob, capital key)', async () => {
    const rows = await ds.query(`SELECT "originCity", "coverageWards" FROM public.transport_route WHERE "originCity" = 'Dar es salaam ' OR "coverageWards" LIKE '%Ubungo and bunju%'`);
    expect(rows).toHaveLength(2);
    const [c] = await ds.query(`SELECT (SELECT count(*)::int FROM public.tz_region) r, (SELECT count(*)::int FROM public.tz_district) d, (SELECT count(*)::int FROM public.tz_ward) w`);
    expect([c.r, c.d, c.w]).toEqual([31, 177, 339]);
  });

  describe('place-aware discovery on real data', () => {
    it('ward -> region (Mbezi -> Mwanza): found via the REGION key although no stored string mentions "Mbezi"; the suspended provider stays hidden', async () => {
      const r = await shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi'), await place('region', 'Mwanza'));
      expect(tripIds(r)).toEqual([ids.slotDarMwanza]);
      expect(providerIds(r)).not.toContain(ids.pC);
      expect(r.availableTrips[0].matchedOn.map((m) => `${m.originKind}:${m.originKey}>${m.destinationKind}:${m.destinationKey}`)).toEqual(['region:Dar es Salaam>region:Mwanza']);
      // the old string search for the SAME words finds nothing
      const legacy = await shipments.findAvailableRoutes('Mbezi', 'Mwanza');
      expect(tripIds(legacy)).toEqual([]);
    });

    it('ward -> district (Mbezi -> Ubungo): the last-mile blob matches through the DISTRICT key; region keys add the region-level candidates', async () => {
      const r = await shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi'), await place('district', 'Ubungo'));
      expect(providerIds(r)).toContain(ids.pA);
      const pa = r.providers.find((p) => p.id === ids.pA)!;
      expect(pa.matchedOn.some((m) => m.originKind === 'district' && m.destinationKind === 'district')).toBe(true);
      expect(r.providers.every((p) => p.matchedOn.length >= 1)).toBe(true);
    });

    it('region with a differing capital (Kilimanjaro -> Dar es Salaam): the capital-keyed route is found ONLY through the shared alias', async () => {
      const r = await shipments.findAvailableRoutesForSides(await place('region', 'Kilimanjaro'), await place('region', 'Dar es Salaam'));
      expect(providerIds(r)).toContain(ids.pB);
      expect(r.providers.find((p) => p.id === ids.pB)!.matchedOn.map((m) => `${m.originKind}:${m.originKey}`)).toContain('region_capital:Moshi');
      expect(r.origin).toMatchObject({ source: 'place', level: 'region', keys: [{ key: 'Kilimanjaro', kind: 'region' }, { key: 'Moshi', kind: 'region_capital' }] });
    });

    it('free text does NOT get the alias: "Kilimanjaro" -> "Dar es Salaam" as typed text misses the capital-keyed route', async () => {
      const r = await shipments.findAvailableRoutesForSides({ text: 'Kilimanjaro' }, { text: 'Dar es Salaam' });
      expect(providerIds(r)).not.toContain(ids.pB);
      expect(r.origin).toEqual({ source: 'text', resolved: false, keys: [{ key: 'Kilimanjaro', kind: 'text' }] });
    });

    it('partial selection (Mbezi + unverified "Mwisho") returns exactly what the resolved ward alone returns; "Mwisho" is never a key', async () => {
      const plain = await shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi'), await place('region', 'Mwanza'));
      const partial = await shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi', { localityText: 'Mwisho' }), await place('region', 'Mwanza'));
      expect(JSON.stringify(partial)).toBe(JSON.stringify(plain));
      expect(JSON.stringify(partial)).not.toContain('Mwisho');
    });

    it('results are candidate LISTS and deterministic across repeated runs', async () => {
      const run = async () => shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi'), await place('district', 'Ubungo'));
      const a = await run();
      const b = await run();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(Object.keys(a).sort()).toEqual(['availableTrips', 'destination', 'origin', 'providers']);
    });

    it('unresolvable / unknown / wrong-provider references are 400 with no fuzzy fallback', async () => {
      for (const ref of [{ providerKey: 'tz_seed', providerPlaceId: 'ward:99999999' }, { providerKey: 'google', providerPlaceId: 'ward:1' }, { providerKey: 'tz_seed', providerPlaceId: 'Mbezi' }]) {
        await expect(shipments.findAvailableRoutesForSides({ place: ref }, { text: 'Mwanza' })).rejects.toThrow(BadRequestException);
      }
    });

    it('the public payload carries no coordinates or internal ids', async () => {
      const r = await shipments.findAvailableRoutesForSides(await place('ward', 'Mbezi'), await place('region', 'Mwanza'));
      expect(JSON.stringify(r)).not.toMatch(/latitude|longitude|regionId|districtId|wardId|hubCompatibilityKey/);
    });
  });

  describe('legitimate legacy strings stay compatible (production-shaped stored data)', () => {
    it.each([['Dar'], ['Dar es Salaam'], ['dar es salaam'], ['DAR ES SALAAM '], ['  Dar es salaam ']])('%p -> "Iringa" still finds the intercity provider', async (from) => {
      const r = await shipments.findAvailableRoutes(from, 'Iringa');
      expect(providerIds(r)).toContain(ids.pA);
    });

    it('slots stored as "Dar" and "Dar es salaam " are still found from "Dar es Salaam"', async () => {
      const r = await shipments.findAvailableRoutes('Dar es Salaam', 'Mwanza');
      expect(tripIds(r)).toContain(ids.slotDarMwanza);
      const r2 = await shipments.findAvailableRoutes('Dar es Salaam', 'Arusha');
      expect(tripIds(r2)).toContain(ids.slotSloppy);
    });

    it('the last-mile blob still matches by a ward word it contains', async () => {
      const r = await shipments.findAvailableRoutes('Kariakoo', 'Ubungo');
      expect(providerIds(r)).toContain(ids.pA);
    });
  });

  describe('hardening: wildcard / one-character / whitespace input cannot broaden discovery', () => {
    it.each([['%', '%'], ['_', '_'], ['a', 'a'], ['  ', 'Mwanza'], ['Dar', ' '], ['%', 'Mwanza'], ['Dar', '_']])('(%p, %p) -> 400', async (f, t) => {
      await expect(shipments.findAvailableRoutes(f, t)).rejects.toThrow(BadRequestException);
    });

    it('"%%" is literal text now: it matches NOTHING (previously it matched every row)', async () => {
      const r = await shipments.findAvailableRoutes('%%', '%%');
      expect(r.availableTrips).toHaveLength(0);
      expect(r.providers).toHaveLength(0);
      const some = await shipments.findAvailableRoutes('Dar es Salaam', 'Mwanza');
      expect(some.availableTrips.length).toBeGreaterThan(0); // sanity: data is there
    });

    it('wildcard characters inside otherwise-valid text are literal: "Dar%", "D_r es Salaam", "I_inga" find nothing', async () => {
      for (const [f, t] of [['Dar%', 'Iringa'], ['D_r es Salaam', 'Iringa'], ['Dar', 'I_inga'], ['Dar', 'Ir%']]) {
        const r = await shipments.findAvailableRoutes(f, t);
        expect(providerIds(r)).not.toContain(ids.pA);
      }
    });

    it('a stored value that contains "_" no longer acts as a pattern: slot "Dar_es" -> Tanga is only found by the literal text', async () => {
      const literal = await shipments.findAvailableRoutes('Dar_es', 'Tanga');
      expect(tripIds(literal)).toContain(ids.slotUnderscore);
      const lookalike = await shipments.findAvailableRoutes('Dar es', 'Tanga'); // "_" must not match the space
      expect(tripIds(lookalike)).not.toContain(ids.slotUnderscore);
    });

    it('stored values shorter than 2 characters (empty string, "a") never match by containment', async () => {
      const r = await shipments.findAvailableRoutes('Mwanza', 'Mbeya');
      expect(tripIds(r)).not.toContain(ids.slotEmptyFrom);
      expect(tripIds(r)).not.toContain(ids.slotOneChar);
      const r2 = await shipments.findAvailableRoutes('Banana', 'Mbeya');
      expect(tripIds(r2)).not.toContain(ids.slotOneChar); // "banana" contains "a", must not match a stored "a"
    });

    it('GET /transport/available semantics: "to=" (empty) still means "from X to anywhere"; whitespace-only and one-character do not', async () => {
      const any = await transport.findPublicAvailabilityForRoute('Dar es Salaam', '');
      expect(any.trips.map((t) => t.availabilityId)).toEqual(expect.arrayContaining([ids.slotDarMwanza, ids.slotSloppy]));
      expect(any.trips.map((t) => t.availabilityId)).not.toContain(ids.slotSuspended);
      await expect(transport.findPublicAvailabilityForRoute('Dar es Salaam', '   ')).rejects.toThrow(BadRequestException);
      await expect(transport.findPublicAvailabilityForRoute('%', 'Mwanza')).rejects.toThrow(BadRequestException);
      await expect(transport.findPublicAvailabilityForRoute('', '')).rejects.toThrow(BadRequestException);
    });

    it('the search-public providers path is hardened by the same shared function', async () => {
      await expect(transport.findPublicProvidersForRoute('%', 'Mwanza')).rejects.toThrow(BadRequestException);
      const ok = await transport.findPublicProvidersForRoute('Dar es Salaam', 'Iringa');
      expect(ok.length).toBeGreaterThan(0);
    });
  });
});
