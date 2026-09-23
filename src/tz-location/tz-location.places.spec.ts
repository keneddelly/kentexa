import { FindOperator } from 'typeorm';
import { TzLocationService } from './tz-location.service';

/**
 * Stage 2D place discovery + exact resolution on TzLocationService, with the
 * repositories mocked. The real seed data is exercised against PostgreSQL in
 * src/location-intelligence/place-resolution.real-postgres.spec.ts.
 */
const region = (o: any = {}) => ({ id: 1, name: 'Dar es Salaam', isActive: true, lat: -6.8, lng: 39.28, ...o });
const district = (o: any = {}) => ({ id: 3, name: 'Ubungo', regionId: 1, isActive: true, lat: -6.78, lng: 39.15, region: region(), ...o });
const ward = (o: any = {}) => ({ id: 56, name: 'Mbezi', districtId: 3, regionId: 1, isActive: true, lat: -6.72, lng: 39.08, district: district(), ...o });

function build(data: { wards?: any[]; districts?: any[]; regions?: any[]; wardOne?: any; districtOne?: any; regionOne?: any } = {}) {
  const wardRepo: any = { find: jest.fn(async () => data.wards ?? []), findOne: jest.fn(async () => data.wardOne ?? null) };
  const districtRepo: any = { find: jest.fn(async () => data.districts ?? []), findOne: jest.fn(async () => data.districtOne ?? null) };
  const regionRepo: any = { find: jest.fn(async () => data.regions ?? []), findOne: jest.fn(async () => data.regionOne ?? null) };
  return { svc: new TzLocationService(regionRepo, districtRepo, wardRepo), wardRepo, districtRepo, regionRepo };
}

describe('TzLocationService.escapeLikePattern', () => {
  it.each([
    ['plain', 'Mbezi', 'Mbezi'],
    ['percent', '50%', '50\\%'],
    ['underscore', 'a_b', 'a\\_b'],
    ['backslash', 'a\\b', 'a\\\\b'],
    ['all three', '%_\\', '\\%\\_\\\\'],
  ])('%s', (_n, input, expected) => expect(TzLocationService.escapeLikePattern(input)).toBe(expected));
});

describe('TzLocationService.searchPlaces — discovery across ALL levels', () => {
  it('queries every level and escapes wildcard characters so user input cannot change the pattern', async () => {
    const { svc, wardRepo, districtRepo, regionRepo } = build();
    await svc.searchPlaces('50%_x');
    for (const repo of [wardRepo, districtRepo, regionRepo]) {
      const where = repo.find.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.name).toBeInstanceOf(FindOperator);
      expect(where.name.value).toBe('%50\\%\\_x%');
    }
  });

  it('a name that exists at several levels surfaces at every level, ranked: exact name first, region before district before ward', async () => {
    const { svc } = build({
      regions: [region({ id: 9, name: 'Mwanza' })],
      districts: [district({ id: 30, name: 'Mwanza Rural', regionId: 9, region: region({ id: 9, name: 'Mwanza' }) })],
      wards: [
        ward({ id: 126, name: 'Mwanza Mjini', regionId: 9, district: district({ id: 31, name: 'Nyamagana', regionId: 9, region: region({ id: 9, name: 'Mwanza' }) }) }),
        ward({ id: 321, name: 'Mwanza City Centre', regionId: 9, district: district({ id: 31, name: 'Nyamagana', regionId: 9, region: region({ id: 9, name: 'Mwanza' }) }) }),
      ],
    });
    const rows = await svc.searchPlaces('Mwanza');
    expect(rows.map((r) => `${r.type}:${(r as any).ward ?? (r as any).district ?? (r as any).region}`)).toEqual([
      'region:Mwanza', // exact name
      'district:Mwanza Rural', // prefix, district before ward
      'ward:Mwanza City Centre', // prefix, by name
      'ward:Mwanza Mjini',
    ]);
  });

  it('every row carries the ids needed to build a stable reference and the full hierarchy names', async () => {
    const { svc } = build({ wards: [ward()] });
    const [row] = await svc.searchPlaces('Mbezi');
    expect(row).toMatchObject({ type: 'ward', wardId: 56, ward: 'Mbezi', districtId: 3, district: 'Ubungo', regionId: 1, region: 'Dar es Salaam', fullAddress: 'Mbezi, Ubungo, Dar es Salaam' });
  });

  it('ambiguous names are all returned, never collapsed', async () => {
    const { svc } = build({ wards: [ward({ id: 56, name: 'Mbezi' }), ward({ id: 57, name: 'Mbezi Luis' })] });
    expect((await svc.searchPlaces('Mbezi')).map((r) => (r as any).wardId)).toEqual([56, 57]);
  });

  it('caps the result (1..10, default 8) and treats junk limits safely', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ward({ id: 100 + i, name: `Mbezi ${String.fromCharCode(65 + i)}` }));
    const { svc } = build({ wards: many });
    expect(await svc.searchPlaces('Mbezi')).toHaveLength(8);
    expect(await svc.searchPlaces('Mbezi', 3)).toHaveLength(3);
    expect(await svc.searchPlaces('Mbezi', 1000)).toHaveLength(10);
    expect(await svc.searchPlaces('Mbezi', -4)).toHaveLength(1);
    expect(await svc.searchPlaces('Mbezi', NaN as any)).toHaveLength(8);
  });

  it('a blank query returns [] without touching any repository', async () => {
    const { svc, wardRepo } = build();
    expect(await svc.searchPlaces('   ')).toEqual([]);
    expect(wardRepo.find).not.toHaveBeenCalled();
  });

  it('leaves the historical search() cascade untouched', async () => {
    const { svc, wardRepo } = build({ wards: [ward()] });
    const rows = await svc.search('Mbezi');
    expect(rows).toHaveLength(1);
    expect(wardRepo.find.mock.calls[0][0].take).toBe(8);
  });
});

describe('TzLocationService.findPlaceById — EXACT resolution', () => {
  it('returns the exact active place with its hierarchy, using findOne by id only (never a name search)', async () => {
    const { svc, wardRepo } = build({ wardOne: ward() });
    const row = await svc.findPlaceById('ward', 56);
    expect(row).toMatchObject({ type: 'ward', wardId: 56, region: 'Dar es Salaam', district: 'Ubungo' });
    expect(wardRepo.findOne.mock.calls[0][0].where).toEqual({ id: 56 });
    expect(wardRepo.find).not.toHaveBeenCalled();
  });

  it('resolves districts and regions too', async () => {
    const { svc } = build({ districtOne: district(), regionOne: region() });
    expect(await svc.findPlaceById('district', 3)).toMatchObject({ type: 'district', districtId: 3, region: 'Dar es Salaam' });
    expect(await svc.findPlaceById('region', 1)).toMatchObject({ type: 'region', regionId: 1, region: 'Dar es Salaam' });
  });

  it.each([
    ['ward not found', { wardOne: null }, 'ward'],
    ['ward inactive', { wardOne: ward({ isActive: false }) }, 'ward'],
    ['ward district inactive', { wardOne: ward({ district: district({ isActive: false }) }) }, 'ward'],
    ['ward region inactive', { wardOne: ward({ district: district({ region: region({ isActive: false }) }) }) }, 'ward'],
    ['ward without hierarchy', { wardOne: ward({ district: undefined }) }, 'ward'],
    ['district inactive', { districtOne: district({ isActive: false }) }, 'district'],
    ['district region inactive', { districtOne: district({ region: region({ isActive: false }) }) }, 'district'],
    ['region inactive', { regionOne: region({ isActive: false }) }, 'region'],
    ['region not found', { regionOne: null }, 'region'],
  ])('null: %s', async (_n, data: any, level: any) => {
    const { svc } = build(data);
    expect(await svc.findPlaceById(level, 1)).toBeNull();
  });

  it.each([[0], [-1], [1.5], [NaN], [Infinity], ['5' as any], [null as any]])('null for an invalid id (%p) without querying', async (id) => {
    const { svc, wardRepo } = build({ wardOne: ward() });
    expect(await svc.findPlaceById('ward', id as number)).toBeNull();
    expect(wardRepo.findOne).not.toHaveBeenCalled();
  });

  it('null for an unknown level', async () => {
    const { svc } = build({ wardOne: ward() });
    expect(await svc.findPlaceById('street' as any, 1)).toBeNull();
  });
});
