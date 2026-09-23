import { TzSeedLocationProvider } from './tz-seed-location.provider';

describe('TzSeedLocationProvider', () => {
  let tzLocation: any;
  let provider: TzSeedLocationProvider;

  beforeEach(() => {
    tzLocation = { search: jest.fn() };
    provider = new TzSeedLocationProvider(tzLocation);
  });

  it('normalizes a ward-level TzLocationService result into the canonical LocationCandidate shape', async () => {
    tzLocation.search.mockResolvedValue([
      {
        type: 'ward',
        wardId: 12,
        ward: 'Mbezi',
        districtId: 3,
        district: 'Kinondoni',
        regionId: 1,
        region: 'Dar es Salaam',
        lat: '-6.7500000',
        lng: '39.2000000',
        fullAddress: 'Mbezi, Kinondoni, Dar es Salaam',
      },
    ]);

    const [candidate] = await provider.search('Mbezi');

    expect(candidate).toEqual({
      displayLabel: 'Mbezi, Kinondoni, Dar es Salaam',
      latitude: -6.75,
      longitude: 39.2,
      regionId: 1,
      regionName: 'Dar es Salaam',
      districtId: 3,
      districtName: 'Kinondoni',
      wardId: 12,
      wardName: 'Mbezi',
      providerKey: 'tz_seed',
      resolutionMethod: 'admin_seed',
    });
    // No raw TzLocationService field names (`type`, `ward`, `district`, `region`)
    // leak through -- consumers only ever see the canonical shape.
    expect(candidate).not.toHaveProperty('type');
    expect(candidate).not.toHaveProperty('ward');
    expect(candidate).not.toHaveProperty('district');
    expect(candidate).not.toHaveProperty('region');
  });

  it('normalizes a district-level result without inventing ward fields', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'district', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.77, lng: 39.2, fullAddress: 'Kinondoni, Dar es Salaam' },
    ]);

    const [candidate] = await provider.search('Kinondoni');

    expect(candidate.wardId).toBeUndefined();
    expect(candidate.wardName).toBeUndefined();
    expect(candidate.districtId).toBe(3);
    expect(candidate.regionName).toBe('Dar es Salaam');
  });

  it('normalizes a region-level result without inventing district/ward fields', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'region', regionId: 1, region: 'Dar es Salaam', lat: -6.8, lng: 39.28, fullAddress: 'Dar es Salaam' },
    ]);

    const [candidate] = await provider.search('Dar');

    expect(candidate.districtId).toBeUndefined();
    expect(candidate.wardId).toBeUndefined();
    expect(candidate.regionId).toBe(1);
  });

  it('a label-only result (no lat/lng in the source row) stays coordinate-free rather than fabricating 0/0', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 5, ward: 'Somewhere', districtId: 2, district: 'X', regionId: 1, region: 'Y', lat: null, lng: null, fullAddress: 'Somewhere, X, Y' },
    ]);

    const [candidate] = await provider.search('Somewhere');

    expect(candidate.latitude).toBeUndefined();
    expect(candidate.longitude).toBeUndefined();
    expect(candidate.confidence).toBeUndefined();
    expect(candidate.providerPlaceId).toBeUndefined();
    expect(candidate.landmark).toBeUndefined();
  });

  it('returns [] for a blank/whitespace-only query without calling TzLocationService at all', async () => {
    const result = await provider.search('   ');
    expect(result).toEqual([]);
    expect(tzLocation.search).not.toHaveBeenCalled();
  });

  it('passes the trimmed query straight through unmodified -- proves it never re-implements or alters TzLocationService.search()\'s own matching logic', async () => {
    tzLocation.search.mockResolvedValue([]);
    await provider.search('  Mbezi mwisho  ');
    expect(tzLocation.search).toHaveBeenCalledWith('Mbezi mwisho');
  });

  it('preserves ambiguous/duplicate-name results as separate, distinguishable candidates', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'ward', wardId: 12, ward: 'Mbezi', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.75, lng: 39.2, fullAddress: 'Mbezi, Kinondoni, Dar es Salaam' },
      { type: 'ward', wardId: 13, ward: 'Mbezi Luis', districtId: 3, district: 'Kinondoni', regionId: 1, region: 'Dar es Salaam', lat: -6.76, lng: 39.21, fullAddress: 'Mbezi Luis, Kinondoni, Dar es Salaam' },
    ]);

    const results = await provider.search('Mbezi');

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.wardId)).toEqual([12, 13]);
    expect(results.map((r) => r.displayLabel)).toEqual([
      'Mbezi, Kinondoni, Dar es Salaam',
      'Mbezi Luis, Kinondoni, Dar es Salaam',
    ]);
  });

  // Coordinates must be validated as a pair, never independently -- one
  // side present without the other, or an invalid value on either side,
  // must omit BOTH rather than expose a partial/NaN GeoPoint.
  describe('coordinate-pair validation', () => {
    const row = (lat: unknown, lng: unknown) => ({
      type: 'ward', wardId: 1, ward: 'X', districtId: 1, district: 'Y', regionId: 1, region: 'Z', lat, lng, fullAddress: 'X, Y, Z',
    });

    it('preserves a valid coordinate pair', async () => {
      tzLocation.search.mockResolvedValue([row('-6.75', '39.20')]);
      const [candidate] = await provider.search('X');
      expect(candidate.latitude).toBe(-6.75);
      expect(candidate.longitude).toBe(39.2);
    });

    it('omits BOTH coordinates when one side is missing', async () => {
      tzLocation.search.mockResolvedValue([row('-6.75', null)]);
      const [candidate] = await provider.search('X');
      expect(candidate.latitude).toBeUndefined();
      expect(candidate.longitude).toBeUndefined();
    });

    it('omits BOTH coordinates when a value is non-numeric (would produce NaN)', async () => {
      tzLocation.search.mockResolvedValue([row('not-a-number', '39.20')]);
      const [candidate] = await provider.search('X');
      expect(candidate.latitude).toBeUndefined();
      expect(candidate.longitude).toBeUndefined();
      expect(candidate).not.toHaveProperty('latitude');
    });

    it('omits BOTH coordinates when a value is out of valid geographic range', async () => {
      tzLocation.search.mockResolvedValue([row('95', '39.20')]); // lat > 90
      const [candidate] = await provider.search('X');
      expect(candidate.latitude).toBeUndefined();
      expect(candidate.longitude).toBeUndefined();

      tzLocation.search.mockResolvedValue([row('-6.75', '200')]); // lng > 180
      const [second] = await provider.search('X');
      expect(second.latitude).toBeUndefined();
      expect(second.longitude).toBeUndefined();
    });
  });

  it('carries providerKey and resolutionMethod on every candidate (provenance retained)', async () => {
    tzLocation.search.mockResolvedValue([
      { type: 'region', regionId: 1, region: 'Dar es Salaam', lat: -6.8, lng: 39.28, fullAddress: 'Dar es Salaam' },
    ]);

    const [candidate] = await provider.search('Dar');

    expect(candidate.providerKey).toBe('tz_seed');
    expect(candidate.resolutionMethod).toBe('admin_seed');
  });
});
