import { LogisticsServiceOfferService } from './logistics-service-offer.service';

// Owner 2026-11-09 (admin check: the customer saw only the transporter "Ar SAMATTA", the office
// "Ar SAMATTA ... SERVICES" had no "Bei zangu" row): an office whose own transporter runs the trip
// is offered, priced from that route.
describe('an office is offered through its own transporter route', () => {
  const office = { officeId: 7, businessName: 'Ar SAMATTA SERVICES', officeCity: 'Dar es Salaam', officeAddress: 'Kariakoo',
    officeLatitude: null, officeLongitude: null, rating: null, totalRatings: null };
  const build = (userMatch: boolean) => {
    const db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('JOIN public.shipping_rate')) return [];                    // no "Bei zangu" row at all
      if (sql.includes('FROM public.transport_provider')) return [{ id: 3, userId: 50 }];
      if (sql.includes('FROM public.super_agent WHERE "userId"')) return userMatch ? [{ id: 7, userId: 50 }] : [];
      if (sql.includes('sa.id = ANY')) return [office];
      return [];
    }) };
    const transport = {
      discoverServiceRoutes: jest.fn(async () => [{ providerId: 3, providerName: 'Ar SAMATTA', routeId: 1, pricePerKg: 2000, fixedFee: 5000, estimatedHours: 20, originPoints: [] }]),
      discoverSupply: jest.fn(async () => ({ trips: [] })),
    };
    const officePrices = { quoteFor: jest.fn(async (_o: any, req: any) => {
      const t = Math.max(req.kgRate.ratePerKg * req.weightKg, req.kgRate.minimumCharge);
      return { noSuggestion: false, total: t, pickup: { amount: 0 }, transport: { mode: 'kg', amount: t, ratePerKg: req.kgRate.ratePerKg }, ruleSource: 'office' };
    }), ruleFor: jest.fn(async () => ({ chargeMode: 'kg' })) };
    const svc = new LogisticsServiceOfferService({ getAvailableAgents: jest.fn(async () => []) } as any, transport as any, {} as any, db as any, undefined as any, officePrices as any);
    return { svc, officePrices };
  };
  const trip = { fromCity: 'Dar es Salaam', toCity: 'Arusha', weightKg: 4, declaredValue: 150000, pickup: 'point', delivery: 'collect' } as any;

  it('same owner: the office appears, priced from the route (4 kg x 2,000 = 8,000)', async () => {
    const { svc, officePrices } = build(true);
    const offices = (await svc.officeOffers(trip)).filter((o) => o.serviceType === 'office');
    expect(offices).toHaveLength(1);
    expect(offices[0]).toMatchObject({ name: 'Ar SAMATTA SERVICES', price: 8000 });
    expect(officePrices.quoteFor.mock.calls[0][1]).toMatchObject({ kgRate: { ratePerKg: 2000, minimumCharge: 5000 } });
  });

  it('an office that is neither the owner nor a stop of the route: not offered', async () => {
    const { svc } = build(false);
    expect(await svc.officeOffers(trip)).toEqual([]);
  });
});
