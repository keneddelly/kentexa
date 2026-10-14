import { AgentPickupReofferService, PICKUP_REOFFERED_EVENT, REOFFER_RADIUS_M, REOFFER_QUIET_HOURS, REOFFER_MAX_JOBS } from './agent-pickup-reoffer.service';

// D5 (owner 2026-10-14): waiting pickups near the base are offered when an agent goes online.
describe('re-offer waiting pickups when an agent goes online', () => {
  it('records the offer, then sends one in-app job alert per job to that agent', async () => {
    const queries: any[] = [];
    const db: any = { query: jest.fn(async (sql: string, params: any[]) => {
      queries.push({ sql, params });
      return /SELECT t\.id/.test(sql) ? [{ id: 1, userId: 5, originCity: 'Dar es Salaam', destinationCity: 'Mwanza', itemDescription: null, distanceM: 1408 }] : [];
    }) };
    const communication: any = { dispatch: jest.fn(async () => undefined) };
    expect(await new AgentPickupReofferService(db, communication).offerTo(9)).toEqual([1]);
    expect(queries[0].params).toEqual([9, REOFFER_RADIUS_M, PICKUP_REOFFERED_EVENT, REOFFER_QUIET_HOURS, REOFFER_MAX_JOBS]);
    expect(queries[0].sql).toContain("e.\"eventType\" = 'PICKUP_RELEASED'");          // never a job he released
    expect(queries[1].sql).toContain('INSERT INTO public.activity_events');
    expect(communication.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LOGISTICS_PICKUP_AVAILABLE', sourceId: 1,
      recipients: [expect.objectContaining({ userId: 5, role: 'agent', actionPage: 'agent-pickups' })],
    }));
  });

  it('never throws: a failure must not stop the agent going online', async () => {
    const db: any = { query: jest.fn(async () => { throw new Error('db down'); }) };
    expect(await new AgentPickupReofferService(db, { dispatch: jest.fn() } as any).offerTo(9)).toEqual([]);
  });
});
