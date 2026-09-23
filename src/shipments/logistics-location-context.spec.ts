import {
  MAX_KEY_PAIRS,
  MAX_ROUTE_KEYS_PER_SIDE,
  buildLogisticsLocationContext,
  buildTextLogisticsContext,
  parsePlaceRefParam,
} from './logistics-location-context';
import { LocationCandidate } from '../location-intelligence/location-provider.interface';

const cand = (o: Partial<LocationCandidate> = {}): LocationCandidate => ({
  displayLabel: 'Mbezi, Ubungo, Dar es Salaam', latitude: -6.72, longitude: 39.08, regionId: 1, regionName: 'Dar es Salaam',
  districtId: 3, districtName: 'Ubungo', wardId: 56, wardName: 'Mbezi', providerKey: 'tz_seed', providerPlaceId: 'ward:56',
  resolutionMethod: 'admin_seed', ...o,
});
const keys = (c: LocationCandidate) => buildLogisticsLocationContext(c)!.routeKeys.map((k) => `${k.kind}:${k.key}`);

describe('buildLogisticsLocationContext — ordered routing keys from the RESOLVED hierarchy only', () => {
  it('ward -> ward, district, region (capital == region name is de-duplicated)', () => {
    expect(keys(cand())).toEqual(['ward:Mbezi', 'district:Ubungo', 'region:Dar es Salaam']);
  });

  it('district -> district, region', () => {
    expect(keys(cand({ wardName: undefined, wardId: undefined, providerPlaceId: 'district:3', displayLabel: 'Ubungo, Dar es Salaam' }))).toEqual([
      'district:Ubungo', 'region:Dar es Salaam',
    ]);
  });

  it('region -> region; a region whose production capital differs gets the shared-policy alias AFTER the region key', () => {
    const kili = cand({ regionName: 'Kilimanjaro', wardName: undefined, districtName: undefined, providerPlaceId: 'region:5', displayLabel: 'Kilimanjaro' });
    expect(keys(kili)).toEqual(['region:Kilimanjaro', 'region_capital:Moshi']);
    expect(keys({ ...kili, regionName: 'Mara' })).toEqual(['region:Mara', 'region_capital:Musoma']);
    expect(keys({ ...kili, regionName: 'Mwanza' })).toEqual(['region:Mwanza']); // capital == region: no duplicate
  });

  it('a ward in a region with a differing capital carries the alias last (ward, district, region, capital)', () => {
    expect(keys(cand({ regionName: 'Kilimanjaro', wardName: 'Kibosho', districtName: 'Moshi Rural' }))).toEqual([
      'ward:Kibosho', 'district:Moshi Rural', 'region:Kilimanjaro', 'region_capital:Moshi',
    ]);
  });

  it('never invents aliases: an unknown region gets no capital key', () => {
    expect(keys(cand({ regionName: 'Atlantis' }))).toEqual(['ward:Mbezi', 'district:Ubungo', 'region:Atlantis']);
  });

  it('de-duplicates case-insensitively while keeping the most specific spelling/kind', () => {
    expect(keys(cand({ wardName: 'Ubungo', districtName: 'ubungo' }))).toEqual(['ward:Ubungo', 'region:Dar es Salaam']);
  });

  it('keys are bounded: at most MAX_ROUTE_KEYS_PER_SIDE per side, so at most MAX_KEY_PAIRS pairs', () => {
    expect(MAX_ROUTE_KEYS_PER_SIDE).toBe(4);
    expect(MAX_KEY_PAIRS).toBe(16);
    const worst = buildLogisticsLocationContext(cand({ regionName: 'Kilimanjaro' }))!;
    expect(worst.routeKeys).toHaveLength(4);
    expect(worst.routeKeys.length * worst.routeKeys.length).toBeLessThanOrEqual(MAX_KEY_PAIRS);
  });

  it('keys too short/long to be valid discovery input are dropped (they could never be searched)', () => {
    expect(keys(cand({ wardName: 'X', districtName: ' ' }))).toEqual(['region:Dar es Salaam']);
    expect(keys(cand({ wardName: 'y'.repeat(200) }))).toEqual(['district:Ubungo', 'region:Dar es Salaam']);
  });

  describe('trust rules', () => {
    it('fails closed: no region context or no stable reference => no context', () => {
      expect(buildLogisticsLocationContext(cand({ regionName: undefined }))).toBeNull();
      expect(buildLogisticsLocationContext(cand({ regionName: '  ' }))).toBeNull();
      expect(buildLogisticsLocationContext(cand({ providerPlaceId: undefined }))).toBeNull();
    });

    it('unverified locality text can never become a key: the builder takes ONLY the resolved candidate', () => {
      expect(buildLogisticsLocationContext.length).toBe(1);
      // even if a hostile object smuggles typed text onto the candidate, no key contains it
      const smuggled = { ...cand(), localityText: 'Mwisho', landmark: 'Mwisho stand', typedText: 'Mwisho' } as any;
      const ctx = buildLogisticsLocationContext(smuggled)!;
      expect(JSON.stringify(ctx)).not.toContain('Mwisho');
      expect(ctx.routeKeys.map((k) => k.key)).toEqual(['Mbezi', 'Ubungo', 'Dar es Salaam']);
    });

    it('carries no coordinates (an admin centroid is not an address) and does not use them', () => {
      const ctx = buildLogisticsLocationContext(cand())!;
      expect(JSON.stringify(ctx)).not.toMatch(/latitude|longitude|-6\.72|39\.08/);
    });

    it('the hub compatibility key is the region name — today\'s SuperAgent.city convention — and is explicitly a search key, not an identity', () => {
      const productionHubCities = ['Dar es Salaam', 'Dar es Salaam', 'Dar es Salaam', 'Dar es Salaam']; // 4 production hubs, all region-named
      const ctx = buildLogisticsLocationContext(cand())!;
      expect(ctx.hubCompatibilityKey).toBe('Dar es Salaam');
      expect(productionHubCities.every((c) => c === ctx.hubCompatibilityKey)).toBe(true);
      expect(new Set(productionHubCities).size).toBeLessThan(productionHubCities.length); // several hubs share the key
      expect(ctx).not.toHaveProperty('hubId');
      expect(ctx).not.toHaveProperty('hub');
    });

    it('does not add a "city" concept to the provider contract', () => {
      const iface = require('fs').readFileSync(require('path').join(__dirname, '..', 'location-intelligence', 'location-provider.interface.ts'), 'utf8');
      expect(iface).not.toMatch(/\bcity\b\??:/i);
    });
  });
});

describe('buildTextLogisticsContext — free text stays unresolved and unenriched', () => {
  it('is exactly the typed string, marked source "text"; no derived district/region/capital', () => {
    expect(buildTextLogisticsContext('Kilimanjaro')).toEqual({ source: 'text', routeKeys: [{ key: 'Kilimanjaro', kind: 'text' }] });
    expect(buildTextLogisticsContext('Mbezi').routeKeys).toHaveLength(1);
  });
});

describe('parsePlaceRefParam — unambiguous reference grammar', () => {
  it('splits ONLY at the first ":" (provider place ids contain ":")', () => {
    expect(parsePlaceRefParam('tz_seed:ward:56')).toEqual({ providerKey: 'tz_seed', providerPlaceId: 'ward:56' });
    expect(parsePlaceRefParam('tz_seed:region:9')).toEqual({ providerKey: 'tz_seed', providerPlaceId: 'region:9' });
    expect(parsePlaceRefParam('acme:abc-123_x')).toEqual({ providerKey: 'acme', providerPlaceId: 'abc-123_x' });
  });

  it('a bare place id without a provider key parses as provider "ward" — syntactically valid, and rejected downstream by exact provider dispatch (no provider named "ward")', () => {
    expect(parsePlaceRefParam('ward:56')).toEqual({ providerKey: 'ward', providerPlaceId: '56' });
  });

  it.each([
    [undefined], [null], [42], [{}], [['tz_seed:ward:56']], [''], [' '], [':ward:56'], ['tz_seed'], ['tz_seed:'], ['Tz_Seed:ward:56'],
    ['1tz:ward:56'], ['tz seed:ward:56'], [' tz_seed:ward:56'], ['tz_seed:ward:56 '], ['tz_seed:ward:56;DROP'], ['tz_seed:ward/56'],
    ['tz_seed:%'], ['tz_seed::ward'], ['x'.repeat(200) + ':a'], ['tz_seed:' + 'y'.repeat(80)], ['tz_seed:ward:56\n'],
  ])('rejects %p (never reinterpreted as text or matched by name)', (raw) => {
    expect(parsePlaceRefParam(raw as any)).toBeNull();
  });
});
