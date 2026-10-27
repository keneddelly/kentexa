import { AgentsService, AGENT_VEHICLE_TYPES } from './agents.service';

const make = (agent: any, rows: any[][]) => {
  const svc: any = Object.create(AgentsService.prototype);
  const query = jest.fn(async () => rows.shift() ?? [null]);
  svc.agentRepo = { findOne: jest.fn(async () => agent), update: jest.fn(async () => undefined), manager: { query } };
  return { svc: svc as AgentsService, query, repo: svc.agentRepo };
};

describe('AgentsService — the agent dashboard (owner 2026-10-27)', () => {
  it('Mapato: only recorded fees and cash, and no rating until there are ratings', async () => {
    const { svc, query } = make({ id: 7, totalDeliveriesCompleted: 30, totalRatings: 0, rating: '5.00' }, [
      [{ todayCount: 2, todayFees: '6000.00', weekCount: 9, weekFees: '41000', allCount: 38 }],
      [{ codToday: '45000.00', owedToKentexa: '900.00' }],
    ]);
    const res: any = await svc.getMySummary({ id: 70 } as any);
    expect(res).toEqual({ today: { deliveries: 2, fees: 6000, codCollected: 45000 }, week: { deliveries: 9, fees: 41000 },
      totalDeliveries: 38, owedToKentexa: 900, rating: null, totalRatings: 0 });
    expect(query.mock.calls[0][1]).toEqual([7, '70']);      // the agent's jobs and the office handoffs
  });

  it('any vehicle is an agent (not only boda), and only those are accepted', async () => {
    expect(AGENT_VEHICLE_TYPES).toEqual(['boda', 'bajaji', 'bicycle', 'car', 'van', 'truck', 'foot']);
    const { svc, repo } = make({ id: 7 }, []);
    await svc.updateProfile({ id: 70 } as any, { agentType: 'bajaji', maxWeightKg: 80 });
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ agentType: 'bajaji', maxWeightKg: 80 }));
    await expect(svc.updateProfile({ id: 70 } as any, { agentType: 'helicopter' })).rejects.toThrow();
    await expect(svc.updateProfile({ id: 70 } as any, { maxWeightKg: 0.2 })).rejects.toThrow();
  });
});
