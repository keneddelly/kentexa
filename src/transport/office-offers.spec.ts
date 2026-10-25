import 'reflect-metadata';
import { distanceKm, officeChargeText, officeEtaLabel, officePickupFeeFor, officeServesOrigin, pickOfficeRates, rateServesDestination, readOfficePickupInput, setOfficePickupReadyForTests } from './office-offers';
import { LogisticsServiceOfferService } from './logistics-service-offer.service';

const row = (officeId: number, officeCity: string, destinationCity: string, extra: any = {}) => ({
  officeId, businessName: `Ofisi ${officeId}`, officeCity, officeAddress: null, rating: null, totalRatings: null,
  destinationCity, ratePerKg: 4000, minimumCharge: 6000, estimatedDays: 2, ...extra,
});
const DAR = { regionName: 'Dar es Salaam', districtName: 'Ilala', city: 'Dar es Salaam' };
const MBEYA = { regionName: 'Mbeya', districtName: 'Mbeya Mjini', city: 'Mbeya' };

describe('office offers: who serves the trip', () => {
  it('an office in the sender city with a rate to the destination region or district', () => {
    expect(officeServesOrigin('Dar es Salaam', DAR)).toBe(true);
    expect(officeServesOrigin('Dar', DAR)).toBe(true);
    expect(officeServesOrigin('Mwanza', DAR)).toBe(false);
    expect(rateServesDestination('Mbeya', MBEYA)).toBe(true);
    expect(rateServesDestination('mbeya mjini', MBEYA)).toBe(true);
    expect(rateServesDestination('Morogoro', MBEYA)).toBe(false);
    expect(rateServesDestination('', MBEYA)).toBe(false);
  });

  it('each office once; other cities and other destinations are left out', () => {
    const picked = pickOfficeRates([
      row(1, 'Dar es Salaam', 'Mbeya'), row(1, 'Dar es Salaam', 'Mbeya Mjini', { ratePerKg: 3500 }),
      row(2, 'Dar es Salaam', 'Bukoba'), row(3, 'Mwanza', 'Mbeya'), row(4, 'Dar es Salaam', 'Mbeya'),
    ], DAR, MBEYA);
    expect(picked.map((r) => r.officeId)).toEqual([1, 4]);
    expect(picked[0].ratePerKg).toBe(3500);              // the exact district rate wins
  });

  it('plain Swahili for arrival and charging', () => {
    expect(officeEtaLabel(2)).toBe('Inafika baada ya siku 2');
    expect(officeEtaLabel(1)).toBe('Inafika baada ya siku 1');
    expect(officeEtaLabel(null)).toBe('Ofisi itakujulisha');
    expect(officeChargeText({ mode: 'value', percent: 10, minimum: 5000 })).toBe('10% ya thamani · chini kabisa TZS 5,000');
    expect(officeChargeText({ mode: 'kg', ratePerKg: 4000, minimum: 6000 })).toBe('TZS 4,000 kwa kg · chini kabisa TZS 6,000');
  });
});

describe('LogisticsServiceOfferService.officeOffers', () => {
  const make = (rows: any[], quotes: Record<number, any>) => {
    const db: any = { query: jest.fn(async () => rows) };
    const locations: any = { resolve: jest.fn(async (p: any) => (p.providerPlaceId === 'ward:6'
      ? { regionName: 'Dar es Salaam', districtName: 'Ilala', displayLabel: 'Kariakoo, Ilala, Dar es Salaam' }
      : { regionName: 'Mbeya', districtName: 'Mbeya Mjini', displayLabel: 'Mbeya Mjini, Mbeya' })) };
    const officePrices: any = { quoteFor: jest.fn(async (office: any) => quotes[office.id]) };
    const svc = new LogisticsServiceOfferService({} as any, {} as any, {} as any, db, locations, officePrices);
    return { svc, db, officePrices };
  };
  const dto: any = {
    fromCity: 'Dar es Salaam', toCity: 'Mbeya', weightKg: 2, pickup: 'point', delivery: 'collect', declaredValue: 150000,
    origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } },
    destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'district:90' } },
  };
  const q = (total: number, extra: any = {}) => ({ pickup: { amount: 0 }, transport: { amount: total, mode: 'value', percent: 10, minimum: 5000 },
    delivery: { amount: 0 }, total, currency: 'TZS', ruleSource: 'office', noSuggestion: false, ...extra });

  it('every serving office priced by its own rule, cheapest first, training and inactive excluded by the query', async () => {
    const { svc, db } = make([row(1, 'Dar es Salaam', 'Mbeya'), row(2, 'Dar es Salaam', 'Mbeya')], { 1: q(19000), 2: q(15000) });
    const offers = await svc.officeOffers(dto);
    expect(offers.map((o) => [o.name, o.price])).toEqual([['Ofisi 2', 15000], ['Ofisi 1', 19000]]);
    expect(offers[0]).toMatchObject({ serviceType: 'office', fulfillment: { linehaul: 'office', officeOption: { officeId: 2, chargeText: '10% ya thamani · chini kabisa TZS 5,000' } } });
    const sql = (db.query.mock.calls[0] as any[])[0];
    expect(sql).toContain(`sa.status = 'active'`);
    expect(sql).toContain(`sa."isTrainingOffice" = false`);
  });

  it('no value, no office offers (the % of value cannot be priced)', async () => {
    const { svc, db } = make([row(1, 'Dar es Salaam', 'Mbeya')], { 1: q(15000) });
    expect(await svc.officeOffers({ ...dto, declaredValue: undefined })).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('a by-kg office with no rate gives no number, never a made-up one', async () => {
    const { svc } = make([row(1, 'Dar es Salaam', 'Mbeya')], { 1: q(0, { noSuggestion: true }) });
    const [offer] = await svc.officeOffers(dto);
    expect(offer).toMatchObject({ price: null, pricingMode: 'quote_required' });
  });

  it('door pickup in Dar: the boda fee is inside the total', async () => {
    const { svc, officePrices } = make([row(1, 'Dar es Salaam', 'Mbeya')], { 1: q(17000, { pickup: { amount: 2000 } }) });
    const [offer] = await svc.officeOffers({ ...dto, pickup: 'door' });
    expect(offer.fulfillmentStatus).toEqual({ pickup: 'included', delivery: 'included' });
    expect((officePrices.quoteFor.mock.calls[0] as any[])[1]).toMatchObject({ pickupAddress: 'Kariakoo, Ilala, Dar es Salaam', declaredValue: 150000 });
  });
});

describe('office pickup offer', () => {
  const OFFICE = { latitude: -6.8161, longitude: 39.2804 };           // Kariakoo
  const NEAR = { latitude: -6.8200, longitude: 39.2750 };             // under 1 km
  const FAR = { latitude: -6.7700, longitude: 39.2400 };              // about 6.7 km

  it('reads the settings: free, a price, or none; a distance is optional', () => {
    expect(readOfficePickupInput({ mode: 'free' })).toEqual({ mode: 'free', fee: null, maxKm: null });
    expect(readOfficePickupInput({ mode: 'fixed', fee: '2000', maxKm: '3' })).toEqual({ mode: 'fixed', fee: 2000, maxKm: 3 });
    expect(() => readOfficePickupInput({ mode: 'fixed', fee: 0 })).toThrow('badFee');
    expect(() => readOfficePickupInput({ mode: 'free', maxKm: 500 })).toThrow('badKm');
    expect(() => readOfficePickupInput({ mode: 'sometimes' })).toThrow('badMode');
  });

  it('the fee, or null when the office does not collect here', () => {
    expect(distanceKm(OFFICE, FAR)).toBeGreaterThan(5);
    expect(officePickupFeeFor({ mode: 'free', fee: null, maxKm: null }, OFFICE, null)).toBe(0);
    expect(officePickupFeeFor({ mode: 'fixed', fee: 2000, maxKm: 3 }, OFFICE, NEAR)).toBe(2000);
    expect(officePickupFeeFor({ mode: 'fixed', fee: 2000, maxKm: 3 }, OFFICE, FAR)).toBeNull();
    expect(officePickupFeeFor({ mode: 'free', fee: null, maxKm: 3 }, { latitude: null, longitude: null }, NEAR)).toBeNull(); // no office point
    expect(officePickupFeeFor({ mode: 'none', fee: null, maxKm: null }, OFFICE, NEAR)).toBeNull();
    expect(officePickupFeeFor(undefined, OFFICE, NEAR)).toBeNull();
  });
});

describe('LogisticsServiceOfferService.officeOffers: an office that collects', () => {
  afterEach(() => setOfficePickupReadyForTests(false));

  it('free pickup replaces the boda fee and is inside the total; the offer says the office collects', async () => {
    setOfficePickupReadyForTests(true);
    const rows = [{ ...row(1, 'Dar es Salaam', 'Mbeya'), officeLatitude: -6.8161, officeLongitude: 39.2804 }];
    const db: any = { query: jest.fn(async (sql: string) => (/office_pickup_offer/.test(sql)
      ? [{ superAgentId: 1, mode: 'free', fee: null, maxKm: null }] : rows)) };
    const locations: any = { resolve: jest.fn(async () => ({ regionName: 'Dar es Salaam', districtName: 'Ilala', displayLabel: 'Kariakoo' })) };
    const officePrices: any = { quoteFor: jest.fn(async () => ({ pickup: { amount: 0 }, transport: { amount: 15000, mode: 'value', percent: 10, minimum: 5000 },
      delivery: { amount: 0 }, total: 15000, currency: 'TZS', ruleSource: 'office', noSuggestion: false })) };
    const svc = new LogisticsServiceOfferService({} as any, {} as any, {} as any, db, locations, officePrices);
    const [offer] = await svc.officeOffers({ fromCity: 'Dar es Salaam', toCity: 'Mbeya', weightKg: 2, pickup: 'door', delivery: 'collect',
      declaredValue: 150000, origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } }, destination: { text: 'Mbeya' } } as any);
    expect(offer).toMatchObject({ price: 15000, fulfillmentStatus: { pickup: 'included' }, fulfillment: { officeOption: { pickupBy: 'office', quote: { pickup: 0 } } } });
    // No boda fee is asked for when the office collects itself.
    expect((officePrices.quoteFor.mock.calls[0] as any[])[1].pickupAddress).toBeNull();
  });
});

describe('same-city trips: no office unless it chose same-city delivery (owner 2026-10-24)', () => {
  const { isSameCityTrip, setOfficeSameCityReadyForTests } = require('./office-offers');
  afterEach(() => setOfficeSameCityReadyForTests(false));

  const KARIAKOO = { regionName: 'Dar es Salaam', districtName: 'Ilala', displayLabel: 'Kariakoo, Ilala, Dar es Salaam' };
  const MBEZI = { regionName: 'Dar es Salaam', districtName: 'Ubungo', displayLabel: 'Mbezi, Ubungo, Dar es Salaam' };
  const make = (sameCityIds: number[]) => {
    const db: any = { query: jest.fn(async (sql: string) => (sql.includes('"sameCityDelivery" = true')
      ? sameCityIds.map((id) => ({ superAgentId: id }))
      : [row(1, 'Dar es Salaam', 'Dar es Salaam'), row(2, 'Dar es Salaam', 'Ubungo')])) };
    const locations: any = { resolve: jest.fn(async (p: any) => (p.providerPlaceId === 'ward:6' ? KARIAKOO : MBEZI)) };
    const total = (n: number) => ({ pickup: { amount: 0 }, transport: { amount: n, mode: 'value', percent: 10, minimum: 5000 },
      delivery: { amount: 0 }, total: n, currency: 'TZS', ruleSource: 'office', noSuggestion: false });
    const officePrices: any = { quoteFor: jest.fn(async (office: any) => total(office.id === 1 ? 7000 : 6000)) };
    return { svc: new LogisticsServiceOfferService({} as any, {} as any, {} as any, db, locations, officePrices), db };
  };
  const kariakooToMbezi: any = {
    fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', weightKg: 2, pickup: 'point', delivery: 'collect', declaredValue: 50000,
    origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } },
    destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:9' } },
  };

  it('knows a same-city trip, however the city is written', () => {
    expect(isSameCityTrip('Dar es Salaam', 'Dar es Salaam')).toBe(true);
    expect(isSameCityTrip('Dar', 'dar es salaam')).toBe(true);
    expect(isSameCityTrip('Kariakoo', 'Mbezi', { regionName: 'Dar es Salaam' }, { regionName: 'Dar es Salaam' })).toBe(true);
    expect(isSameCityTrip('Dar es Salaam', 'Mbeya')).toBe(false);
  });

  it('Kariakoo -> Mbezi: no office when none chose same-city delivery', async () => {
    setOfficeSameCityReadyForTests(true);
    const { svc } = make([]);
    expect(await svc.officeOffers(kariakooToMbezi)).toEqual([]);
  });

  it('Kariakoo -> Mbezi: only the office that chose same-city delivery competes', async () => {
    setOfficeSameCityReadyForTests(true);
    const { svc } = make([2]);
    const offers = await svc.officeOffers(kariakooToMbezi);
    expect(offers.map((o: any) => o.fulfillment.officeOption.officeId)).toEqual([2]);
  });

  it('the same-city search itself returns that office, so the sender can book it (no agent online)', async () => {
    setOfficeSameCityReadyForTests(true);
    const { svc } = make([2]);
    const offers = await svc.discover({ ...kariakooToMbezi, weightKg: 2 });
    expect(offers.map((o: any) => [o.serviceType, o.fulfillment.officeOption?.officeId])).toEqual([['office', 2]]);
  });

  it('before the setting exists on the server: no office on same-city trips, and no query for it', async () => {
    const { svc, db } = make([1, 2]);
    expect(await svc.officeOffers(kariakooToMbezi)).toEqual([]);
    expect(db.query.mock.calls.some(([sql]: any[]) => String(sql).includes('"sameCityDelivery" = true'))).toBe(false);
  });

  it('intercity trips are unchanged: offices compete without the setting', async () => {
    const { svc } = make([]);
    const dto = { ...kariakooToMbezi, toCity: 'Mbeya', destination: undefined };
    const db: any = { query: jest.fn(async () => [row(1, 'Dar es Salaam', 'Mbeya')]) };
    const officePrices: any = { quoteFor: jest.fn(async () => ({ pickup: { amount: 0 }, transport: { amount: 9000, mode: 'value', percent: 10, minimum: 5000 },
      delivery: { amount: 0 }, total: 9000, currency: 'TZS', ruleSource: 'office', noSuggestion: false })) };
    const intercity = new LogisticsServiceOfferService({} as any, {} as any, {} as any, db,
      { resolve: jest.fn(async () => ({ regionName: 'Dar es Salaam', districtName: 'Ilala', displayLabel: 'Kariakoo' })) } as any, officePrices);
    expect(svc).toBeTruthy();
    expect((await intercity.officeOffers(dto)).length).toBe(1);
  });
});
