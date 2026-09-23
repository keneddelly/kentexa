import { LocationIntelligenceService } from './location-intelligence.service';

/**
 * No network/external-provider dependency exists anywhere in this file:
 * the only provider constructed below wraps a fully in-memory jest mock of
 * TzLocationService (see tz-seed-location.provider.spec.ts for the
 * adapter's own unit tests) -- there is no real database connection, no
 * HTTP client, and no external geocoding vendor involved in any test here.
 */
import { TzSeedLocationProvider } from './providers/tz-seed-location.provider';

describe('LocationIntelligenceService', () => {
  let tzLocation: any;
  let provider: TzSeedLocationProvider;
  let service: LocationIntelligenceService;

  beforeEach(() => {
    tzLocation = { search: jest.fn() };
    provider = new TzSeedLocationProvider(tzLocation);
    service = new LocationIntelligenceService(provider);
  });

  it('resolves a region-name search through the service', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'region', regionId: 1, region: 'Dar es Salaam', lat: -6.8, lng: 39.28, fullAddress: 'Dar es Salaam' },
    ]);

    const results = await service.search('Dar es Salaam');

    expect(results).toEqual([
      expect.objectContaining({ displayLabel: 'Dar es Salaam', regionName: 'Dar es Salaam', providerKey: 'tz_seed' }),
    ]);
  });

  it('resolves a district-name search through the service', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'district', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.77, lng: 39.2, fullAddress: 'Kinondoni, Dar es Salaam' },
    ]);

    const results = await service.search('Kinondoni');

    expect(results).toEqual([expect.objectContaining({ districtName: 'Kinondoni' })]);
  });

  it('resolves a ward-name search through the service', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 12, ward: 'Bunju', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.65, lng: 39.15, fullAddress: 'Bunju, Kinondoni, Dar es Salaam' },
    ]);

    const results = await service.search('Bunju');

    expect(results).toEqual([expect.objectContaining({ wardName: 'Bunju' })]);
  });

  it('keeps ambiguous duplicate-name matches (the two real "Mbezi" wards) distinguishable, never collapsed into one', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 12, ward: 'Mbezi', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.75, lng: 39.2, fullAddress: 'Mbezi, Kinondoni, Dar es Salaam' },
      { type: 'ward', wardId: 13, ward: 'Mbezi Luis', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.76, lng: 39.21, fullAddress: 'Mbezi Luis, Kinondoni, Dar es Salaam' },
    ]);

    const results = await service.search('Mbezi');

    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.displayLabel)).size).toBe(2); // genuinely distinguishable, not duplicated
  });

  it('no-match input returns [] explicitly -- never null/undefined, never throws', async () => {
    tzLocation.search.mockResolvedValue([]);

    const results = await service.search('Nonexistentplacexyz123');

    expect(results).toEqual([]);
  });

  it('a blank query returns [] without ever calling the underlying provider', async () => {
    const results = await service.search('   ');

    expect(results).toEqual([]);
    expect(tzLocation.search).not.toHaveBeenCalled();
  });

  it('label-only results (no coordinates in the source) are returned as valid candidates without fabricated coordinates', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 9, ward: 'Kijiji', districtId: 4, district: 'X', regionId: 2, region: 'Y', lat: null, lng: null, fullAddress: 'Kijiji, X, Y' },
    ]);

    const [candidate] = await service.search('Kijiji');

    expect(candidate.displayLabel).toBe('Kijiji, X, Y');
    expect(candidate.latitude).toBeUndefined();
    expect(candidate.longitude).toBeUndefined();
  });

  it('every returned candidate retains provider provenance (providerKey + resolutionMethod)', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'region', regionId: 1, region: 'Dar es Salaam', lat: -6.8, lng: 39.28, fullAddress: 'Dar es Salaam' },
    ]);

    const [candidate] = await service.search('Dar');

    expect(candidate.providerKey).toBe('tz_seed');
    expect(candidate.resolutionMethod).toBe('admin_seed');
  });

  it('consumers never receive the raw TzLocationService DTO shape -- only the canonical LocationCandidate fields', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 12, ward: 'Bunju', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.65, lng: 39.15, fullAddress: 'Bunju, Kinondoni, Dar es Salaam' },
    ]);

    const [candidate] = await service.search('Bunju');

    expect(Object.keys(candidate).sort()).toEqual(
      ['displayLabel', 'latitude', 'longitude', 'regionId', 'regionName', 'districtId', 'districtName', 'wardId', 'wardName', 'providerKey', 'resolutionMethod'].sort(),
    );
  });
});
