import { LogisticsServiceOfferService } from './logistics-service-offer.service';

// Pure unit tests: Agents/Transport/Journey are fakes, no database.
const route = (routeId: number, pricePerKg: number, fixedFee = 0, extra: any = {}) => ({
  providerId: 100 + routeId, providerName: `Bus ${routeId}`, providerBusinessName: null,
  providerType: 'bus', providerLogo: null, routeId, estimatedHours: 10,
  pricePerKg, fixedFee, originPoints: [], destinationPoints: [], ...extra,
});

function build(routes: any[], agents: any[] = []) {
  const agentsSvc = { getAvailableAgents: jest.fn().mockResolvedValue(agents) };
  const transport = {
    discoverServiceRoutes: jest.fn().mockResolvedValue(routes),
    discoverSupply: jest.fn().mockResolvedValue({ trips: [], providers: [] }),
  };
  return new LogisticsServiceOfferService(agentsSvc as any, transport as any, {} as any);
}

const doorToDoor = { fromCity: 'Dar es Salaam', toCity: 'Mwanza', weightKg: 10, pickup: 'door' as const, delivery: 'door' as const };

describe('LogisticsServiceOfferService.discover (intercity)', () => {
  it('card price is the transport fare only -- the same number the quote freezes', async () => {
    const agent = { id: 7, collectionFeeUrban: 3000, deliveryFee: 2500 };
    const [offer] = await build([route(1, 1000, 5000)], [agent]).discover(doorToDoor);
    // TransportQuoteService.computeTransportBase: max(pricePerKg * kg, fixedFee)
    expect(offer.price).toBe(Math.max(1000 * 10, 5000));
    expect(offer.fulfillmentStatus).toEqual({ pickup: 'separate', delivery: 'separate' });
  });

  it('door legs without an Agent are pending and still not in the price', async () => {
    const [offer] = await build([route(1, 1000)], []).discover(doorToDoor);
    expect(offer.price).toBe(10000);
    expect(offer.fulfillmentStatus).toEqual({ pickup: 'pending', delivery: 'pending' });
  });

  it('point drop-off / collection means no door leg', async () => {
    const [offer] = await build([route(1, 1000)]).discover({ ...doorToDoor, pickup: 'point', delivery: 'collect' });
    expect(offer.fulfillmentStatus).toEqual({ pickup: 'included', delivery: 'included' });
  });

  it('never names an offer "Kentexa"; uses the transporter name, then its Business, then a neutral label', async () => {
    const offers = await build([
      route(1, 1000, 0, { providerName: 'Shabiby Line' }),
      route(2, 2000, 0, { providerName: '   ', providerBusinessName: 'Kilimanjaro Express Ltd' }),
      route(3, 3000, 0, { providerName: '', providerBusinessName: null }),
    ]).discover(doorToDoor);
    expect(offers.map(o => o.name)).toEqual(['Shabiby Line', 'Kilimanjaro Express Ltd', 'Transport provider']);
    expect(offers.map(o => o.fulfillment.transportOption.providerName))
      .toEqual(['Shabiby Line', 'Kilimanjaro Express Ltd', 'Transport provider']);
    for (const o of offers) expect(o.name.toLowerCase()).not.toContain('kentexa');
  });

  it('sorts all routes by price BEFORE keeping 8, so cheap newer routes are not dropped', async () => {
    // 10 routes in id order; the two cheapest have the highest ids.
    const routes = [1, 2, 3, 4, 5, 6, 7, 8].map(id => route(id, 5000 + id * 100))
      .concat([route(9, 200), route(10, 100)]);
    const offers = await build(routes).discover(doorToDoor);
    expect(offers).toHaveLength(8);
    expect(offers[0].fulfillment.transportOption.routeId).toBe(10);
    expect(offers[1].fulfillment.transportOption.routeId).toBe(9);
    const prices = offers.map(o => o.price as number);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('quote-required routes come after priced ones', async () => {
    const offers = await build([route(1, 0, 0), route(2, 1000)]).discover(doorToDoor);
    expect(offers.map(o => o.pricingMode)).toEqual(['instant', 'quote_required']);
  });
});

// Owner approved 2026-11-02: Dar es Salaam same-city trips are priced by zone (zone price
// only; the agent's old flat 1,000-1,500 fee is no longer used in Dar).
describe('LogisticsServiceOfferService.discover (Dar es Salaam zones)', () => {
  const { OfficeBodaFeeService } = require('../super-agents/office-boda-fee.service');
  const agent = { id: 7, collectionFeeUrban: 1500, deliveryFee: 1000, hasBasePoint: true };
  const make = (city = 'Dar es Salaam') => {
    const agentsSvc = { getAvailableAgents: jest.fn().mockResolvedValue([agent]) };
    const locations = { resolve: jest.fn(async () => ({ displayLabel: 'Mwenge', wardName: 'Mwenge', districtName: 'Kinondoni' })) };
    const svc = new LogisticsServiceOfferService(agentsSvc as any, {} as any, {} as any, undefined, locations as any, undefined,
      new OfficeBodaFeeService({ find: jest.fn(async () => []) } as any));
    return { svc, city, locations };
  };
  const trip = (origin: any, destination: any, extra: any = {}) => ({
    fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', weightKg: 2, pickup: 'door' as const, delivery: 'door' as const, origin, destination, ...extra,
  });

  it('Kariakoo to Sinza is the zone price, not the agent flat fee; a picked place is read too', async () => {
    const { svc } = make();
    const [direct] = await svc.discover(trip({ text: 'Kariakoo' }, { text: 'Sinza' }));
    expect(direct).toEqual(expect.objectContaining({ serviceType: 'direct_delivery', price: 7000 }));
    expect(direct.areaUnknown).toBeUndefined();
    const [picked] = await svc.discover(trip({ text: 'Kariakoo' }, { place: { providerKey: 'tz_seed', providerPlaceId: 'w:1' } }));
    expect(picked.price).toBe(7000); // Kariakoo -> Mwenge (Bagamoyo ring 2), read from the place's ward name
  });

  it('a heavy parcel pays double', async () => {
    const { svc } = make();
    const [direct] = await svc.discover(trip({ text: 'Kariakoo' }, { text: 'Sinza' }, { weightKg: 25 }));
    expect(direct.price).toBe(14000);
  });

  it('an unknown place: no price, the form is told which place to ask for; a picked area fixes it', async () => {
    const { svc } = make();
    const [direct] = await svc.discover(trip({ text: 'Kariakoo' }, { text: 'Kwa Mtogole' }));
    expect(direct).toEqual(expect.objectContaining({ price: null, areaUnknown: true, unknownPlaces: ['destination'] }));
    await expect(svc.commit(1, { ...trip({ text: 'Kariakoo' }, { text: 'Kwa Mtogole' }), serviceType: 'direct_delivery' } as any))
      .rejects.toThrow('Chagua eneo');
    const [fixed] = await svc.discover(trip({ text: 'Kariakoo' }, { text: 'Kwa Mtogole' }, { destinationArea: 'Mwenge' }));
    expect(fixed.price).toBe(7000);
    expect(fixed.areaUnknown).toBeUndefined();
  });
});
