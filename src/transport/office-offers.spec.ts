import 'reflect-metadata';
import { officeChargeText, officeEtaLabel, officeServesOrigin, pickOfficeRates, rateServesDestination } from './office-offers';
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
