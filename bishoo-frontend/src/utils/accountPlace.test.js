import { pickAccountPlace } from './accountPlace';

const ref = (id) => ({ providerKey: 'tz-admin', providerPlaceId: id });
const region = { displayLabel: 'Arusha', regionName: 'Arusha', placeRef: ref('r-arusha') };
const district = { displayLabel: 'Arusha Urban, Arusha', regionName: 'Arusha', districtName: 'Arusha Urban', placeRef: ref('d-arusha') };

describe('pre-filling the place from the account city', () => {
  it('picks the exact label first, then the region itself', () => {
    expect(pickAccountPlace([district, region], 'arusha ')).toBe(region);
    expect(pickAccountPlace([district, { ...region, displayLabel: 'Mkoa wa Arusha' }], 'Arusha').placeRef.providerPlaceId).toBe('r-arusha');
  });
  it('never guesses: no exact match, no city or no list means nothing is picked', () => {
    expect(pickAccountPlace([district], 'Arusha')).toBeNull();
    expect(pickAccountPlace([region], 'Moshi')).toBeNull();
    expect(pickAccountPlace([region], '')).toBeNull();
    expect(pickAccountPlace(null, 'Arusha')).toBeNull();
    expect(pickAccountPlace([{ displayLabel: 'Arusha' }], 'Arusha')).toBeNull(); // no place reference
  });
});
