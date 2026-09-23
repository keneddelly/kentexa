import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { getB5BTestConnectionConfig, resetB5BTestSchema } from '../business/b5b-closure-test-db';
import { TzRegion } from '../tz-location/entities/tz-region.entity';
import { TzDistrict } from '../tz-location/entities/tz-district.entity';
import { TzWard } from '../tz-location/entities/tz-ward.entity';
import { TzLocationService } from '../tz-location/tz-location.service';
import { seedTzLocations } from '../tz-location/tz-complete-seed';
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';
import { LocationIntelligenceService } from './location-intelligence.service';
import { LocationIntelligenceController } from './location-intelligence.controller';
import { ShipmentsService } from '../shipments/shipments.service';
import { Shipment } from '../shipments/entities/shipment.entity';

/**
 * Stage 2D — REAL PostgreSQL proof with the ACTUAL seed data
 * (tz-complete-seed.ts's seedTzLocations(), the loader that produced the
 * production data: 31 regions / 177 districts / 339 wards): discovery, exact resolution and
 * server-derived Shipment snapshots against real tables.
 *
 * Runs only against the repository's dedicated kentexa_b5b_test database via
 * its safety gate; skipped (never failed) without B5B_TEST_DB_PASSWORD.
 * Never touches production.
 */
const config = getB5BTestConnectionConfig();
const suite = config ? describe : describe.skip;

suite('Place resolution — real PostgreSQL, actual seed data', () => {
  jest.setTimeout(240000);
  let ds: DataSource;
  let tz: TzLocationService;
  let li: LocationIntelligenceService;
  let controller: LocationIntelligenceController;
  let shipments: ShipmentsService;

  const idOf = async (table: 'tz_ward' | 'tz_district' | 'tz_region', name: string, extra = '') =>
    (await ds.query(`SELECT id FROM public.${table} WHERE name = $1 ${extra} ORDER BY id LIMIT 1`, [name]))[0].id as number;
  const ref = (providerPlaceId: string) => ({ providerKey: 'tz_seed', providerPlaceId });
  const dto = (extra: Record<string, unknown> = {}) => ({
    receiverName: 'Amina', receiverPhone: '0700000000', itemDescription: 'Clothes', weightKg: 2, ...extra,
  });
  const lastRow = async () => (await ds.query(`SELECT * FROM public.shipment ORDER BY id DESC LIMIT 1`))[0];
  const shipmentCount = async () => (await ds.query(`SELECT count(*)::int AS n FROM public.shipment`))[0].n as number;

  beforeAll(async () => {
    const client = new Client(config!);
    await client.connect();
    await resetB5BTestSchema(client);
    await client.end();

    ds = new DataSource({
      type: 'postgres', host: config!.host, port: config!.port, username: config!.user, password: config!.password,
      database: config!.database, synchronize: true, entities: [TzRegion, TzDistrict, TzWard, Shipment],
    });
    await ds.initialize();
    tz = new TzLocationService(ds.getRepository(TzRegion), ds.getRepository(TzDistrict), ds.getRepository(TzWard));
    // Production parity: its 31 regions / 177 districts / 339 wards are the UNION of the two loaders
    // (the complete seed adds 166 districts / 284 wards; TzLocationService.seedAll() adds the remaining
    // 11 / 55). Both are idempotent, so running them in this order reproduces the production data.
    await seedTzLocations(ds);
    await tz.seedAll();
    li = new LocationIntelligenceService(new TzSeedLocationProvider(tz));
    controller = new LocationIntelligenceController(li);

    const transport: any = { assertEligibleProvider: async () => ({}), reserveSlot: async () => undefined };
    shipments = new ShipmentsService(
      ds.getRepository(Shipment), { findOne: async () => null } as any, { findOne: async () => null } as any, {} as any, transport, tz, li,
    );
  });

  afterAll(async () => {
    if (ds) await ds.destroy().catch(() => {});
  });

  beforeEach(async () => {
    await ds.query(`TRUNCATE TABLE public.shipment RESTART IDENTITY`);
    await ds.query(`UPDATE public.tz_ward SET "isActive" = true`);
    await ds.query(`UPDATE public.tz_district SET "isActive" = true`);
    await ds.query(`UPDATE public.tz_region SET "isActive" = true`);
  });

  it('the seed loaded through the real path has the expected shape (all levels, centroid coordinates; production parity)', async () => {
    const [c] = await ds.query(`SELECT (SELECT count(*)::int FROM public.tz_region) r, (SELECT count(*)::int FROM public.tz_district) d, (SELECT count(*)::int FROM public.tz_ward) w,
      (SELECT count(*)::int FROM public.tz_ward WHERE lat IS NULL OR lng IS NULL) w_nocoords`);
    expect([c.r, c.d, c.w]).toEqual([31, 177, 339]); // same counts as production
    expect(c.w_nocoords).toBe(0);
  });

  // ── discovery on the real seed ─────────────────────────────────────────
  describe('discovery (the mission\'s examples, against the real seed)', () => {
    it('"Mbezi" -> the two real Mbezi wards, ambiguity preserved, each with a stable reference', async () => {
      const r = await li.searchPlaces('Mbezi');
      expect(r.match).toEqual({ quality: 'full', matchedText: 'Mbezi' });
      const labels = r.candidates.map((c) => c.displayLabel);
      expect(labels).toEqual(expect.arrayContaining(['Mbezi, Ubungo, Dar es Salaam', 'Mbezi Luis, Ubungo, Dar es Salaam']));
      expect(r.candidates.every((c) => /^ward:\d+$/.test(c.providerPlaceId!))).toBe(true);
      expect(new Set(r.candidates.map((c) => c.providerPlaceId)).size).toBe(r.candidates.length);
    });

    it('"Mbezi Mwisho" -> a PARTIAL suggestion: Mbezi is matched, "Mwisho" is reported as unverified, and no candidate claims it', async () => {
      const r = await li.searchPlaces('Mbezi Mwisho');
      expect(r.match).toEqual({ quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho' });
      expect(r.candidates.map((c) => c.wardName)).toEqual(expect.arrayContaining(['Mbezi']));
      expect(JSON.stringify(r.candidates)).not.toMatch(/Mwisho/);
      // the old cascade found nothing for the same input (the gap Stage 2D closes)
      expect(await tz.search('Mbezi Mwisho')).toEqual([]);
    });

    it('"Mwisho" alone -> Kimara Mwisho (a different place), full match', async () => {
      const r = await li.searchPlaces('Mwisho');
      expect(r.match?.quality).toBe('full');
      expect(r.candidates.map((c) => c.wardName)).toContain('Kimara Mwisho');
    });

    it('"Mwanza" -> selectable as a REGION (first, exact name), with its districts/wards after; the old ward-first cascade hid the region', async () => {
      const r = await li.searchPlaces('Mwanza');
      expect(r.candidates[0]).toMatchObject({ regionName: 'Mwanza', providerPlaceId: expect.stringMatching(/^region:\d+$/) });
      expect(r.candidates[0].wardName).toBeUndefined();
      expect(r.candidates.some((c) => c.wardName)).toBe(true);
      const old = await tz.search('Mwanza');
      expect(old.every((x: any) => x.type === 'ward')).toBe(true); // regression the new path fixes
    });

    it('"Dar es Salaam" -> the region; "Kinondoni" -> both district and ward levels', async () => {
      expect((await li.searchPlaces('Dar es Salaam')).candidates[0]).toMatchObject({ providerPlaceId: expect.stringMatching(/^region:/), regionName: 'Dar es Salaam' });
      const k = (await li.searchPlaces('Kinondoni')).candidates.map((c) => c.providerPlaceId!.split(':')[0]);
      expect(k).toEqual(expect.arrayContaining(['district', 'ward']));
    });

    it('is case-insensitive and whitespace tolerant', async () => {
      const a = (await li.searchPlaces('  mbezi   LUIS ')).candidates.map((c) => c.providerPlaceId);
      const b = (await li.searchPlaces('Mbezi Luis')).candidates.map((c) => c.providerPlaceId);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
    });

    it('wildcards are literal: "%" / "_" match nothing, whereas the old search treats "%%" as match-everything', async () => {
      expect((await li.searchPlaces('%%')).candidates).toEqual([]);
      expect((await li.searchPlaces('M_ezi')).candidates).toEqual([]);
      expect((await tz.search('%%')).length).toBeGreaterThan(0);
    });

    it('unknown names return nothing (no fuzzy invention)', async () => {
      expect((await li.searchPlaces('Nonexistentplacexyz')).candidates).toEqual([]);
    });

    it('the public endpoint payload for the same searches carries no coordinates or internal ids', async () => {
      const r = await controller.searchPlaces('Mbezi Mwisho', '20');
      expect(r.candidates.length).toBeLessThanOrEqual(10);
      const json = JSON.stringify(r);
      expect(json).not.toMatch(/latitude|longitude|regionId|districtId|wardId|"lat"|"lng"/);
      expect(r.match).toEqual({ quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho' });
    });
  });

  // ── exact resolution ───────────────────────────────────────────────────
  describe('exact resolution', () => {
    it.each([
      ['ward', 'tz_ward', 'Mbezi', 'Mbezi, Ubungo, Dar es Salaam'],
      ['district', 'tz_district', 'Ubungo', 'Ubungo, Dar es Salaam'],
      ['region', 'tz_region', 'Mwanza', 'Mwanza'],
    ])('%s reference resolves to server data with centroid coordinates', async (level, table, name, label) => {
      const id = await idOf(table as any, name);
      const c = await li.resolve(ref(`${level}:${id}`));
      expect(c).toMatchObject({ displayLabel: label, providerKey: 'tz_seed', providerPlaceId: `${level}:${id}`, resolutionMethod: 'admin_seed' });
      expect(typeof c!.latitude).toBe('number');
      expect(typeof c!.longitude).toBe('number');
    });

    it('a reference returned by search resolves back to the same place (round trip)', async () => {
      const found = (await li.searchPlaces('Mbezi Luis')).candidates[0];
      const resolved = await li.resolve({ providerKey: found.providerKey, providerPlaceId: found.providerPlaceId! });
      expect(resolved).toMatchObject({ displayLabel: found.displayLabel, wardName: 'Mbezi Luis', regionName: 'Dar es Salaam' });
    });

    it('nonexistent ids, wrong provider and malformed references all -> null (no fallback, no name search)', async () => {
      for (const r of [ref('ward:99999999'), ref('district:0'), ref('region:-1'), ref('ward:abc'), ref('Mbezi'), ref('ward:5;DROP TABLE tz_ward'), { providerKey: 'google', providerPlaceId: 'ward:1' }]) {
        expect(await li.resolve(r as any)).toBeNull();
      }
    });

    it('an INACTIVE place, or a place under an inactive parent, no longer resolves (and is hidden from discovery)', async () => {
      const wardId = await idOf('tz_ward', 'Mbezi');
      await ds.query(`UPDATE public.tz_ward SET "isActive" = false WHERE id = $1`, [wardId]);
      expect(await li.resolve(ref(`ward:${wardId}`))).toBeNull();
      expect((await li.searchPlaces('Mbezi')).candidates.map((c) => c.providerPlaceId)).not.toContain(`ward:${wardId}`);
      await ds.query(`UPDATE public.tz_ward SET "isActive" = true WHERE id = $1`, [wardId]);

      const districtId = await idOf('tz_district', 'Ubungo');
      await ds.query(`UPDATE public.tz_district SET "isActive" = false WHERE id = $1`, [districtId]);
      expect(await li.resolve(ref(`ward:${wardId}`))).toBeNull(); // parent inactive => fail closed
      expect(await li.resolve(ref(`district:${districtId}`))).toBeNull();
    });
  });

  // ── Shipment create against real tables ────────────────────────────────
  describe('Shipment create (real tables)', () => {
    it('places selected from a real search are re-resolved and the row is server-derived end to end', async () => {
      const from = (await li.searchPlaces('Mbezi Mwisho')).candidates.find((c) => c.wardName === 'Mbezi')!;
      const to = (await li.searchPlaces('Mwanza')).candidates[0];
      await shipments.createShipment(7, dto({
        originPlace: { providerKey: from.providerKey, providerPlaceId: from.providerPlaceId, localityText: 'Mwisho' },
        destinationPlace: { providerKey: to.providerKey, providerPlaceId: to.providerPlaceId },
      }));
      const row = await lastRow();
      expect(row).toMatchObject({
        originCity: 'Dar es Salaam', originWard: 'Mbezi', originLocationLabel: 'Mbezi, Ubungo, Dar es Salaam (typed: Mwisho)',
        originRegionName: 'Dar es Salaam', originDistrictName: 'Ubungo', originProviderKey: 'tz_seed', originResolutionMethod: 'admin_seed',
        destinationCity: 'Mwanza', destinationLocationLabel: 'Mwanza', destinationRegionName: 'Mwanza', destinationDistrictName: null,
        destinationProviderKey: 'tz_seed', destinationResolutionMethod: 'admin_seed', status: 'pending',
      });
      // coordinates are the SEED AREA's centroids, exactly as stored in tz_ward / tz_region
      const [w] = await ds.query(`SELECT lat::float8 AS lat, lng::float8 AS lng FROM public.tz_ward WHERE id = $1`, [row.originWardId]);
      expect(row.originLatitude).toBeCloseTo(w.lat, 6);
      expect(row.originLongitude).toBeCloseTo(w.lng, 6);
      expect(row.originRegionId).toBe(await idOf('tz_region', 'Dar es Salaam'));
    });

    it('forged coordinates / names / provenance on the request never reach the row', async () => {
      const id = await idOf('tz_ward', 'Mbezi');
      await shipments.createShipment(7, dto({
        originPlace: { ...ref(`ward:${id}`), latitude: 1.11, longitude: 2.22, regionName: 'FORGED', resolutionMethod: 'gps', displayLabel: 'FORGED' },
        destinationCity: 'Mwanza',
        originLocation: { displayLabel: 'FORGED', latitude: 9, longitude: 9, providerKey: 'tz_seed', resolutionMethod: 'admin_seed' },
      }));
      const row = await lastRow();
      expect(JSON.stringify(row)).not.toContain('FORGED');
      expect(row.originLatitude).not.toBeCloseTo(1.11, 1);
      expect(row.originResolutionMethod).toBe('admin_seed');
    });

    it('an unknown / inactive / forged reference is a 400 and nothing is written', async () => {
      const id = await idOf('tz_ward', 'Mbezi');
      await ds.query(`UPDATE public.tz_ward SET "isActive" = false WHERE id = $1`, [id]);
      for (const sel of [ref('ward:99999999'), ref(`ward:${id}`), ref('Mbezi'), { providerKey: 'google', providerPlaceId: 'ChIJ...' }]) {
        await expect(shipments.createShipment(7, dto({ originPlace: sel, destinationCity: 'Mwanza' }))).rejects.toThrow(BadRequestException);
      }
      expect(await shipmentCount()).toBe(0);
    });

    it('free text: stored as server-authored user_typed with no coordinates or admin names', async () => {
      await shipments.createShipment(7, dto({ originCity: 'Songea', originWard: 'Kijiji cha Mwenge', destinationCity: 'Mwanza' }));
      const row = await lastRow();
      expect(row).toMatchObject({
        originLocationLabel: 'Kijiji cha Mwenge, Songea', originProviderKey: 'user', originResolutionMethod: 'user_typed',
        originLatitude: null, originLongitude: null, originRegionName: null, originDistrictName: null,
      });
    });

    it('public tracking still exposes none of it (allow-list unchanged)', async () => {
      const id = await idOf('tz_ward', 'Mbezi');
      const created = await shipments.createShipment(7, dto({ originPlace: ref(`ward:${id}`), destinationCity: 'Mwanza' }));
      const tracked = await shipments.trackShipment(created.trackingNumber!);
      expect(Object.keys(tracked).sort()).toEqual(
        ['trackingNumber', 'status', 'originCity', 'destinationCity', 'itemDescription', 'weightKg', 'pickupOption', 'deliveryOption', 'receiverName', 'collectedAt', 'deliveredAt', 'completedAt', 'createdAt', 'parcelTrackingNumber'].sort(),
      );
      expect(JSON.stringify(tracked)).not.toMatch(/Ubungo|admin_seed|tz_seed|-6\./);
    });
  });
});
