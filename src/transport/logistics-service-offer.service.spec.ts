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
