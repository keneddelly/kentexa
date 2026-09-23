import { BadRequestException } from '@nestjs/common';
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';
import { LocationIntelligenceService } from './location-intelligence.service';
import {
  LocationIntelligenceController,
  PLACE_SEARCH_DEFAULT_LIMIT,
  PLACE_SEARCH_MAX_LIMIT,
} from './location-intelligence.controller';
import { LocationCandidate, LocationProvider } from './location-provider.interface';

const wardRow = (o: any = {}) => ({
  type: 'ward', wardId: 56, ward: 'Mbezi', districtId: 3, district: 'Ubungo', regionId: 1, region: 'Dar es Salaam',
  lat: '-6.7200000', lng: '39.0800000', fullAddress: 'Mbezi, Ubungo, Dar es Salaam', ...o,
});
const regionRow = (o: any = {}) => ({ type: 'region', regionId: 9, region: 'Mwanza', lat: -2.52, lng: 32.9, fullAddress: 'Mwanza', ...o });

describe('TzSeedLocationProvider.searchPlaces — discovery', () => {
  let tz: any;
  let provider: TzSeedLocationProvider;
  beforeEach(() => {
    tz = { search: jest.fn(), searchPlaces: jest.fn(), findPlaceById: jest.fn() };
    provider = new TzSeedLocationProvider(tz);
  });

  it('a full match returns candidates carrying stable providerPlaceIds and quality "full"', async () => {
    tz.searchPlaces.mockResolvedValue([wardRow(), wardRow({ wardId: 57, ward: 'Mbezi Luis', fullAddress: 'Mbezi Luis, Ubungo, Dar es Salaam' })]);
    const r = await provider.searchPlaces('Mbezi');
    expect(r.match).toEqual({ quality: 'full', matchedText: 'Mbezi' });
    expect(r.candidates.map((c) => c.providerPlaceId)).toEqual(['ward:56', 'ward:57']); // ambiguity preserved
    expect(r.candidates[0]).toMatchObject({ providerKey: 'tz_seed', resolutionMethod: 'admin_seed', latitude: -6.72, longitude: 39.08 });
  });

  it('"Mbezi Mwisho": no full match -> the LEADING words match, and the remainder is reported as unmatched', async () => {
    tz.searchPlaces.mockImplementation(async (text: string) => (text === 'Mbezi' ? [wardRow()] : []));
    const r = await provider.searchPlaces('Mbezi Mwisho');
    expect(tz.searchPlaces.mock.calls.map((c: any[]) => c[0])).toEqual(['Mbezi Mwisho', 'Mbezi']);
    expect(r.match).toEqual({ quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho' });
    expect(r.candidates).toHaveLength(1);
    // the unmatched text is NOT geography: no candidate mentions it
    expect(JSON.stringify(r.candidates)).not.toContain('Mwisho');
  });

  it('drops trailing words one at a time and keeps the rest of the phrase as the unverified remainder', async () => {
    tz.searchPlaces.mockImplementation(async (text: string) => (text === 'Mbezi' ? [wardRow()] : []));
    const r = await provider.searchPlaces('Mbezi  Mwisho   kwa Msuguri');
    expect(r.match).toEqual({ quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho kwa Msuguri' });
  });

  it('a full multi-word match wins over splitting it (Kimara Mwisho stays one place)', async () => {
    tz.searchPlaces.mockImplementation(async (text: string) => (text === 'Kimara Mwisho' ? [wardRow({ wardId: 42, ward: 'Kimara Mwisho', fullAddress: 'Kimara Mwisho, Temeke, Dar es Salaam' })] : []));
    const r = await provider.searchPlaces('Kimara Mwisho');
    expect(r.match).toEqual({ quality: 'full', matchedText: 'Kimara Mwisho' });
    expect(tz.searchPlaces).toHaveBeenCalledTimes(1);
  });

  it('nothing matches -> empty, no match object, and it does not search single characters', async () => {
    tz.searchPlaces.mockResolvedValue([]);
    const r = await provider.searchPlaces('Zzz Q');
    expect(r).toEqual({ candidates: [] });
    expect(tz.searchPlaces.mock.calls.map((c: any[]) => c[0])).toEqual(['Zzz Q', 'Zzz']);
  });

  it('region-level candidates are selectable (Mwanza as a region, not only as wards)', async () => {
    tz.searchPlaces.mockResolvedValue([regionRow()]);
    const r = await provider.searchPlaces('Mwanza');
    expect(r.candidates[0]).toMatchObject({ providerPlaceId: 'region:9', regionName: 'Mwanza' });
    expect(r.candidates[0].wardId).toBeUndefined();
  });

  it('passes the limit through and returns [] for blank input without searching', async () => {
    tz.searchPlaces.mockResolvedValue([]);
    await provider.searchPlaces('Mbezi', { limit: 3 });
    expect(tz.searchPlaces).toHaveBeenCalledWith('Mbezi', 3);
    expect(await provider.searchPlaces('   ')).toEqual({ candidates: [] });
  });
});

describe('TzSeedLocationProvider.resolve — EXACT, fail closed', () => {
  let tz: any;
  let provider: TzSeedLocationProvider;
  beforeEach(() => {
    tz = { search: jest.fn(), searchPlaces: jest.fn(), findPlaceById: jest.fn() };
    provider = new TzSeedLocationProvider(tz);
  });

  it.each([
    ['ward:56', 'ward', 56, wardRow()],
    ['district:3', 'district', 3, { type: 'district', districtId: 3, district: 'Ubungo', regionId: 1, region: 'Dar es Salaam', lat: 1, lng: 2, fullAddress: 'Ubungo, Dar es Salaam' }],
    ['region:9', 'region', 9, regionRow()],
  ])('%s resolves through an exact id lookup and every value is server data', async (ref, level, id, row) => {
    tz.findPlaceById.mockResolvedValue(row);
    const c = await provider.resolve(ref);
    expect(tz.findPlaceById).toHaveBeenCalledWith(level, id);
    expect(c).toMatchObject({ providerKey: 'tz_seed', providerPlaceId: ref, resolutionMethod: 'admin_seed' });
    expect(tz.search).not.toHaveBeenCalled();
    expect(tz.searchPlaces).not.toHaveBeenCalled();
  });

  it.each([
    [''], ['ward'], ['ward:'], ['ward:0'], ['ward:-5'], ['ward:007'], ['ward:1.5'], ['ward:1e3'], ['ward: 5'], ['ward:5 '],
    ['Ward:5'], ['street:5'], ['ward:5;DROP'], ['ward:5:6'], ['ward:1234567890'], ['ward:５'], ['Mbezi'], ['ward:%'],
  ])('malformed reference %p -> null WITHOUT any lookup or name-search fallback', async (ref) => {
    expect(await provider.resolve(ref)).toBeNull();
    expect(tz.findPlaceById).not.toHaveBeenCalled();
    expect(tz.search).not.toHaveBeenCalled();
    expect(tz.searchPlaces).not.toHaveBeenCalled();
  });

  it('non-string references -> null', async () => {
    for (const v of [undefined, null, 56, {}, ['ward:56']]) expect(await provider.resolve(v as any)).toBeNull();
    expect(tz.findPlaceById).not.toHaveBeenCalled();
  });

  it('a well-formed but nonexistent / inactive place (lookup says null) -> null, never a name-search fallback', async () => {
    tz.findPlaceById.mockResolvedValue(null);
    expect(await provider.resolve('ward:999999')).toBeNull();
    expect(tz.search).not.toHaveBeenCalled();
    expect(tz.searchPlaces).not.toHaveBeenCalled();
  });
});

describe('LocationIntelligenceService — searchPlaces / resolve dispatch', () => {
  const candidate: LocationCandidate = { displayLabel: 'X', providerKey: 'tz_seed', providerPlaceId: 'ward:1', resolutionMethod: 'admin_seed' };
  const fake = (key: string, extra: Partial<LocationProvider> = {}): LocationProvider => ({ key, search: async () => [], ...extra });
  const svcWith = (...providers: LocationProvider[]) => {
    const s = new LocationIntelligenceService({} as any);
    (s as any).providers = providers;
    return s;
  };

  it('resolve() chooses the provider strictly by providerKey and never falls back to another provider', async () => {
    const tzResolve = jest.fn(async () => candidate);
    const otherResolve = jest.fn(async () => ({ ...candidate, providerKey: 'other' }));
    const s = svcWith(fake('tz_seed', { resolve: tzResolve }), fake('other', { resolve: otherResolve }));
    expect(await s.resolve({ providerKey: 'tz_seed', providerPlaceId: 'ward:1' })).toBe(candidate);
    expect(tzResolve).toHaveBeenCalledWith('ward:1');
    expect(otherResolve).not.toHaveBeenCalled();
  });

  it('a provider that cannot resolve the reference yields null even if another provider could', async () => {
    const otherResolve = jest.fn(async () => candidate);
    const s = svcWith(fake('tz_seed', { resolve: async () => null }), fake('other', { resolve: otherResolve }));
    expect(await s.resolve({ providerKey: 'tz_seed', providerPlaceId: 'ward:1' })).toBeNull();
    expect(otherResolve).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown provider key', { providerKey: 'google', providerPlaceId: 'ward:1' }],
    ['provider without resolve()', { providerKey: 'noresolve', providerPlaceId: 'x' }],
    ['non-string key', { providerKey: 5, providerPlaceId: 'ward:1' }],
    ['non-string id', { providerKey: 'tz_seed', providerPlaceId: 5 }],
    ['undefined ref', undefined],
    ['null ref', null],
  ])('resolve() -> null for %s', async (_n, ref: any) => {
    const s = svcWith(fake('tz_seed', { resolve: async () => candidate }), fake('noresolve'));
    expect(await s.resolve(ref)).toBeNull();
  });

  it('searchPlaces() returns the first provider with results and skips providers without support', async () => {
    const s = svcWith(fake('a'), fake('b', { searchPlaces: async () => ({ candidates: [] }) }), fake('c', { searchPlaces: async () => ({ candidates: [candidate], match: { quality: 'full', matchedText: 'x' } }) }));
    expect((await s.searchPlaces('x')).candidates).toEqual([candidate]);
    expect(await s.searchPlaces('  ')).toEqual({ candidates: [] });
  });
});

describe('LocationIntelligenceController — public place discovery', () => {
  const ward: LocationCandidate = {
    displayLabel: 'Mbezi, Ubungo, Dar es Salaam', latitude: -6.72, longitude: 39.08, regionId: 1, regionName: 'Dar es Salaam',
    districtId: 3, districtName: 'Ubungo', wardId: 56, wardName: 'Mbezi', providerKey: 'tz_seed', providerPlaceId: 'ward:56', resolutionMethod: 'admin_seed',
  };
  const region: LocationCandidate = { displayLabel: 'Mwanza', latitude: -2.5, longitude: 32.9, regionId: 9, regionName: 'Mwanza', providerKey: 'tz_seed', providerPlaceId: 'region:9', resolutionMethod: 'admin_seed' };
  let search: jest.Mock;
  let controller: LocationIntelligenceController;
  beforeEach(() => {
    search = jest.fn(async () => ({ candidates: [ward, region], match: { quality: 'full', matchedText: 'x' } }));
    controller = new LocationIntelligenceController({ searchPlaces: search } as any);
  });

  it('returns only what a person needs to tell candidates apart plus the stable placeRef: NO coordinates, NO internal ids', async () => {
    const r = await controller.searchPlaces('Mbezi');
    expect(r.candidates).toEqual([
      { placeRef: { providerKey: 'tz_seed', providerPlaceId: 'ward:56' }, displayLabel: 'Mbezi, Ubungo, Dar es Salaam', level: 'ward', regionName: 'Dar es Salaam', districtName: 'Ubungo', wardName: 'Mbezi' },
      { placeRef: { providerKey: 'tz_seed', providerPlaceId: 'region:9' }, displayLabel: 'Mwanza', level: 'region', regionName: 'Mwanza', districtName: undefined, wardName: undefined },
    ]);
    const json = JSON.stringify(r);
    for (const leak of ['latitude', 'longitude', 'regionId', 'districtId', 'wardId', 'resolutionMethod', '-6.72', '39.08', 'confidence']) {
      expect(json).not.toContain(leak);
    }
  });

  it('a partial match surfaces the unmatched remainder as explicit unverified text', async () => {
    search.mockResolvedValue({ candidates: [ward], match: { quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho' } });
    const r = await controller.searchPlaces('Mbezi Mwisho');
    expect(r.match).toEqual({ quality: 'partial', matchedText: 'Mbezi', unmatchedText: 'Mwisho' });
  });

  it('candidates without a stable reference are not offered (they could not be selected later)', async () => {
    search.mockResolvedValue({ candidates: [{ ...ward, providerPlaceId: undefined }], match: { quality: 'full', matchedText: 'x' } });
    expect((await controller.searchPlaces('Mbezi')).candidates).toEqual([]);
  });

  it('no candidates -> { query, candidates: [] } with no match object', async () => {
    search.mockResolvedValue({ candidates: [] });
    expect(await controller.searchPlaces('Zzz')).toEqual({ query: 'Zzz', candidates: [] });
  });

  it.each([[undefined], [''], [' '], ['a'], [' a '], ['x'.repeat(81)], [['Mbezi'] as any], [{ a: 1 } as any]])('rejects q=%p with 400 and never searches', async (q) => {
    await expect(controller.searchPlaces(q as any)).rejects.toThrow(BadRequestException);
    expect(search).not.toHaveBeenCalled();
  });

  it('normalises whitespace in q and accepts the 2..80 boundaries', async () => {
    await controller.searchPlaces('  Mbezi   Mwisho ');
    expect(search).toHaveBeenLastCalledWith('Mbezi Mwisho', { limit: PLACE_SEARCH_DEFAULT_LIMIT });
    await controller.searchPlaces('ab');
    await controller.searchPlaces('x'.repeat(80));
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('limit defaults to 8, is CAPPED at 10, and junk is rejected', async () => {
    await controller.searchPlaces('Mbezi', '3');
    expect(search).toHaveBeenLastCalledWith('Mbezi', { limit: 3 });
    await controller.searchPlaces('Mbezi', '500');
    expect(search).toHaveBeenLastCalledWith('Mbezi', { limit: PLACE_SEARCH_MAX_LIMIT });
    for (const bad of ['0', '-1', '1.5', 'abc', '', '1e2', '5 ', '0005000']) {
      await expect(controller.searchPlaces('Mbezi', bad)).rejects.toThrow(BadRequestException);
    }
  });

  it('is public (no auth guard) and rate-limited more tightly than the global default', () => {
    const handler = LocationIntelligenceController.prototype.searchPlaces;
    expect(Reflect.getMetadata('__guards__', handler)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', LocationIntelligenceController)).toBeUndefined();
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', handler);
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThan(100);
  });
});
