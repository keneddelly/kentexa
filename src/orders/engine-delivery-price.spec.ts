import { engineDeliveryFees, bestOffice } from './engine-delivery-price';
import { OrdersService } from './orders.service';

// Owner 2026-10-25: "seller should no longer set price". Checkout delivery comes from
// the shipment engine; a trip it cannot price is not offered.
const office = (id: number, price: number | null, opt: Record<string, unknown> = {}) => ({
  serviceType: 'office', name: `Ofisi ${id}`, price, fulfillment: { officeOption: { officeId: id, officeName: `Ofisi ${id}`, officeCity: 'Dar es Salaam', ...opt } },
});

// Owner 2026-11-09 chose "best office": the buyer pays one real office's exact price.
describe('bestOffice', () => {
  it('none priced: null', () => {
    expect(bestOffice([])).toBeNull();
    expect(bestOffice([office(1, null), office(2, 0), { serviceType: 'direct_delivery', price: 3000 }])).toBeNull();
  });

  it('never much dearer than the cheapest: an office 15%+ above it is not picked, however good', () => {
    const r = bestOffice([office(1, 10000), office(2, 12000, { rating: 5, totalRatings: 40, distanceKm: 1 })]);
    expect(r).toMatchObject({ officeId: 1, fee: 10000, offices: 2, cheapest: 10000 });
  });

  it('about as cheap: the better rated wins, but only with enough ratings', () => {
    expect(bestOffice([office(1, 10000, { rating: 3.9, totalRatings: 10 }), office(2, 11000, { rating: 4.8, totalRatings: 12 })]))
      .toMatchObject({ officeId: 2, fee: 11000, cheapest: 10000 });
    expect(bestOffice([office(1, 10000, { rating: 3.9, totalRatings: 10 }), office(2, 11000, { rating: 5, totalRatings: 1 })]))
      .toMatchObject({ officeId: 1, fee: 10000 });
  });

  it('then the nearest to the seller, then fewer days, then the lower price, then the engine order', () => {
    expect(bestOffice([office(1, 10000, { distanceKm: 9 }), office(2, 10500, { distanceKm: 2 })])).toMatchObject({ officeId: 2 });
    expect(bestOffice([office(1, 10000, { estimatedDays: 3 }), office(2, 10000, { estimatedDays: 1 })])).toMatchObject({ officeId: 2 });
    expect(bestOffice([office(1, 10400), office(2, 10000)])).toMatchObject({ officeId: 2 });
    expect(bestOffice([office(4, 10000), office(3, 10000)])).toMatchObject({ officeId: 4 });
  });
});

describe('engineDeliveryFees', () => {
  const engine = (offers: any[]) => ({ discover: jest.fn(async () => offers) });
  const base = { fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', origin: 'Kariakoo', destination: 'Mbezi Beach', weightKg: 2, sameCity: true };

  it('same city: the agent\'s price; an agent with no fee set falls to the KenteXa rate card, never the seller', async () => {
    const e = engine([{ serviceType: 'direct_delivery', price: 4000 }, { serviceType: 'office', price: 3500 }]);
    expect(await engineDeliveryFees(e, base)).toEqual({ sameCity: 4000, intercity: null });
    expect(e.discover).toHaveBeenCalledWith(expect.objectContaining({ pickup: 'door', delivery: 'door', origin: { text: 'Kariakoo' } }));
    const card = jest.fn(async () => 3000);
    expect(await engineDeliveryFees(engine([{ serviceType: 'direct_delivery', price: 0 }]), { ...base, rateCard: card })).toEqual({ sameCity: 3000, intercity: null });
    expect(await engineDeliveryFees(engine([{ serviceType: 'office', price: 3500 }]), base)).toEqual({ sameCity: 3500, intercity: null });
  });

  it('another city: one real office\'s exact price (never a transporter directly); unpriced ones are not a price', async () => {
    const e = engine([office(7, 12000), { serviceType: 'composed_intercity', price: 9000 }, office(8, null)]);
    const r = await engineDeliveryFees(e, { ...base, toCity: 'Mbeya', sameCity: false });
    expect(r).toMatchObject({ sameCity: null, intercity: 12000, office: { officeId: 7, fee: 12000, offices: 1, cheapest: 12000 } });
    expect(e.discover).toHaveBeenCalledWith(expect.objectContaining({ pickup: 'point', delivery: 'collect' }));
    expect(await engineDeliveryFees(engine([office(8, null)]), { ...base, toCity: 'Kigoma', sameCity: false }))
      .toEqual({ sameCity: null, intercity: null, office: null });
  });

  it('another city: the shop place, its point and the buyer\'s picked place go to the engine', async () => {
    const e = engine([office(7, 12000)]);
    await engineDeliveryFees(e, { ...base, toCity: 'Arusha', sameCity: false,
      originPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' }, originPoint: { latitude: -6.82, longitude: 39.27 },
      destinationPlace: { providerKey: 'tz_seed', providerPlaceId: 'ward:900' } });
    expect(e.discover).toHaveBeenCalledWith(expect.objectContaining({
      origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:6' } }, pickupPoint: { latitude: -6.82, longitude: 39.27 },
      destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:900' } } }));
  });

  it('no engine, or the engine fails: no price (never a guess)', async () => {
    expect(await engineDeliveryFees(undefined, base)).toEqual({ sameCity: null, intercity: null });
    expect(await engineDeliveryFees({ discover: async () => { throw new Error('down'); } }, base)).toEqual({ sameCity: null, intercity: null });
  });
});

describe('OrdersService.getDeliveryMethods priced by the engine', () => {
  const product = { id: 10, basePrice: 20000, deliveryFee: 9999, bodaFee: 8888, sellerCity: 'Dar es Salaam', weightKg: 1, seller: { businessLocation: 'Kariakoo' } };
  const build = (offers: any[]) => {
    const svc: any = Object.create(OrdersService.prototype);
    svc.productsService = { findOne: jest.fn(async () => product) };
    svc.serviceOffers = { discover: jest.fn(async () => offers) };
    return svc as OrdersService;
  };

  it('same city: the agent method at the engine price, not the seller\'s boda fee', async () => {
    const r: any = await build([{ serviceType: 'direct_delivery', price: 4000 }]).getDeliveryMethods('Sinza, Dar es Salaam', 10);
    expect(r.methods[0]).toMatchObject({ key: 'boda', fee: 4000, totalPrice: 24000 });
  });

  it('another city: the office method at the engine price', async () => {
    const r: any = await build([office(7, 12000)]).getDeliveryMethods('Sokoine, Mbeya', 10);
    expect(r).toMatchObject({ isSameCity: false, methods: [{ key: 'agent', fee: 12000, office: { officeId: 7, fee: 12000 } }] });
  });

  it('three items: one parcel of their weight, one fee; the picked place is what is asked', async () => {
    const svc: any = build([office(7, 15000)]);
    const r: any = await svc.getDeliveryMethods('Sokoine, Mbeya', 10, { quantity: 3, place: { regionId: 12, districtId: 120, wardId: 900, regionName: 'Mbeya' } });
    expect(r.methods[0]).toMatchObject({ key: 'agent', fee: 15000, totalPrice: 75000 });
    expect(svc.serviceOffers.discover).toHaveBeenCalledWith(expect.objectContaining({
      toCity: 'Mbeya', weightKg: 3, declaredValue: 60000, destination: { place: { providerKey: 'tz_seed', providerPlaceId: 'ward:900' } } }));
  });

  it('the picked region decides same town: Arusha to Arusha is not another city', async () => {
    const svc: any = Object.create(OrdersService.prototype);
    svc.productsService = { findOne: jest.fn(async () => ({ ...product, sellerCity: 'Arusha' })) };
    svc.serviceOffers = { discover: jest.fn(async () => [{ serviceType: 'direct_delivery', price: 3000 }]) };
    const r: any = await svc.getDeliveryMethods('Kaloleni, Arusha', 10, { place: { regionId: 2, regionName: 'Arusha' } });
    expect(r).toMatchObject({ isSameCity: true, methods: [{ key: 'boda', fee: 3000 }] });
  });

  it('no KenteXa transport there yet: the order can still be placed and the seller chooses how to ship', async () => {
    const far: any = await build([]).getDeliveryMethods('Kibondo, Kigoma', 10);
    // No price is shown (owner 2026-11-09): fee null, never "Bure".
    expect(far.methods).toEqual([expect.objectContaining({ key: 'direct', fee: null, noPrice: true, totalPrice: 20000 })]);
    const town: any = await build([]).getDeliveryMethods('Ilala, Dar es Salaam', 10);
    expect(town.methods.map((m: any) => m.key)).toEqual(['direct']);
  });
});
