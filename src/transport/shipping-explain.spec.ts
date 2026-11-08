import { LogisticsServiceOfferService } from './logistics-service-offer.service';

// "Kwa nini hakuna?" (owner 2026-11-08): every agent and office with the reason, from the records.
function build(agents: any[], offices: any[], rates: any[]) {
  const db = { query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM public.agent a')) return agents;
    if (sql.includes('FROM public.super_agent sa ORDER BY')) return offices;
    if (sql.includes('FROM public.shipping_rate') && !sql.includes('JOIN')) return rates;
    return [];
  }) };
  const svc = new LogisticsServiceOfferService({ getAvailableAgents: jest.fn(async () => []) } as any, { discoverServiceRoutes: jest.fn(async () => []),
    discoverSupply: jest.fn(async () => ({ trips: [] })) } as any, {} as any, db as any, undefined as any, { ruleFor: jest.fn(async () => ({ chargeMode: 'value' })) } as any);
  return svc;
}

describe('explain', () => {
  it('says why each agent is or is not offered', async () => {
    const svc = build([
      { id: 1, fullName: 'Amimu', city: 'Kinondoni', status: 'approved', baseLatitude: null, baseLongitude: null },
      { id: 2, fullName: 'Juma', city: 'Mwanza', status: 'approved' },
      { id: 3, fullName: 'Neema', city: 'Dar es Salaam', status: 'pending' },
    ], [], []);
    const r = await svc.explain({ fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', weightKg: 2, pickup: 'door', delivery: 'door' } as any);
    const by = (id: number) => r.agents.find((a: any) => a.id === id);
    expect(by(1)).toMatchObject({ ok: true, note: 'Atapata kazi, lakini lazima aweke kituo chake kabla ya kukubali' });
    expect(by(2).ok).toBe(false);
    expect(by(2).reasons[0]).toMatch(/Mji wake "Mwanza" si Dar es Salaam/);
    expect(by(3).reasons).toContain('Hajaidhinishwa (hali: pending)');
  });

  it('says why an office is not offered for an intercity trip', async () => {
    const svc = build([], [
      { id: 7, businessName: 'Arusha Matta', city: 'Dar es Salaam', status: 'active', isTrainingOffice: false },
      { id: 8, businessName: 'Mwanza Hub', city: 'Mwanza', status: 'active', isTrainingOffice: false },
    ], [{ superAgentId: 8, destinationCity: 'Arusha', isActive: true }]);
    const r = await svc.explain({ fromCity: 'Dar es Salaam', toCity: 'Arusha', weightKg: 2, declaredValue: 100000, pickup: 'point', delivery: 'collect' } as any);
    expect(r.offices.find((o: any) => o.id === 7).reasons).toContain('Haijaweka mkoa wowote inaotuma ("Bei zangu")');
    expect(r.offices.find((o: any) => o.id === 8).reasons[0]).toMatch(/Iko Mwanza, si Dar es Salaam/);
  });
});
