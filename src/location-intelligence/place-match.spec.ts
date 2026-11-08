import { agentCovers, agentCoversSql, geoPoint, kmBetween, placeKey, placeKeySql, samePlace } from './place-match';
import { officeServesOrigin, rateServesDestination } from '../transport/office-offers';

// Owner 2026-11-08: "shipment is dead ... it uses the location name instead of coordinates".
describe('one rule for the same place', () => {
  it('Dar es Salaam however written, and its districts, are one place', () => {
    for (const n of ['Dar es Salaam', 'dar-es-salaam', 'DSM', 'Dar', 'Kinondoni', 'Ilala Manispaa', 'Temeke', 'Ubungo', 'Kigamboni']) {
      expect(placeKey(n)).toBe('daressalaam');
    }
    expect(samePlace('Arusha Mjini', 'Arusha')).toBe(true);
    expect(samePlace('Arusha', 'Mwanza')).toBe(false);
    expect(samePlace('', '')).toBe(false);
  });

  it('points: never 0,0 or half a point; distance in km', () => {
    expect(geoPoint(0, 0)).toBeNull();
    expect(geoPoint(-6.8, null)).toBeNull();
    expect(Math.round(kmBetween({ latitude: -6.8161, longitude: 39.2803 }, { latitude: -6.7735, longitude: 39.2083 }))).toBe(9);
  });
});

describe('an agent covers a pickup by name OR by his base within the radius', () => {
  const pickup = { latitude: -6.8161, longitude: 39.2803 }; // Kariakoo
  it('an agent saved as "Kinondoni" gets a Dar es Salaam job (was missed before)', () => {
    expect(agentCovers({ city: 'Kinondoni' }, { names: ['Dar es Salaam'] }).covers).toBe(true);
  });
  it('an agent with no base still covers by name (he sets the base before accepting)', () => {
    expect(agentCovers({ city: 'Dar es Salaam' }, { names: ['Dar es Salaam'], point: pickup })).toMatchObject({ covers: true, hasBase: false });
  });
  it('a base near the pickup covers it even when his town is written differently', () => {
    const r = agentCovers({ city: 'Bagamoyo Road', baseLatitude: -6.80, baseLongitude: 39.27 }, { names: ['Dar es Salaam'], point: pickup });
    expect(r.covers).toBe(true);
    expect(r.byDistance).toBe(true);
  });
  it('another town and a far base: not covered', () => {
    expect(agentCovers({ city: 'Mwanza', baseLatitude: -2.5, baseLongitude: 32.9 }, { names: ['Dar es Salaam'], point: pickup }).covers).toBe(false);
  });
  it('the SQL rule reads the same columns', () => {
    const sql = agentCoversSql('s."originCity"', 'p.lat', 'p.lng');
    expect(sql).toMatch(/a\."city"/); expect(sql).toMatch(/a\."district"/); expect(sql).toMatch(/a\."region"/);
    expect(sql).toMatch(/a\."baseLatitude"/);
    expect(placeKeySql('x')).toMatch(/'daressalaam'/);
  });
});

describe('offices: in the sender town by name or by their map point', () => {
  it('an office written "DSM" serves a sender in Kinondoni', () => {
    expect(officeServesOrigin('DSM', { regionName: 'Dar es Salaam', districtName: 'Kinondoni' })).toBe(true);
  });
  it('an office whose town text differs but whose point is near the sender serves him', () => {
    expect(officeServesOrigin('Mbezi', { city: 'Dar es Salaam', latitude: -6.72, longitude: 39.10 }, { latitude: -6.73, longitude: 39.12 })).toBe(true);
  });
  it('an office in another town and far away does not', () => {
    expect(officeServesOrigin('Mwanza', { city: 'Dar es Salaam', latitude: -6.8, longitude: 39.28 }, { latitude: -2.5, longitude: 32.9 })).toBe(false);
  });
  it('a route to "Arusha" serves a destination in Arusha Mjini', () => {
    expect(rateServesDestination('Arusha', { regionName: null, districtName: 'Arusha Mjini', city: null })).toBe(true);
  });
});
