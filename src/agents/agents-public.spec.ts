import { AgentsService } from './agents.service';
import { AgentStatus } from './entities/agent.entity';

const make = (agent: any) => {
  const svc: any = Object.create(AgentsService.prototype);
  svc.agentRepo = { findOne: jest.fn(async () => agent) };
  return svc as AgentsService;
};

describe('AgentsService.findPublicByUserId — the public agent page', () => {
  it('shows an approved agent\'s name, area and record, never private data', async () => {
    const res: any = await make({
      fullName: 'Juma Boda', agentCode: 'KTX-AGT-7', city: 'Mwanza', district: 'Ilemela', region: 'Mwanza',
      coverageAreas: ['Ilemela'], agentType: 'boda', totalDeliveriesCompleted: 12, rating: '4.60', totalRatings: 5,
      status: AgentStatus.APPROVED, phone: '0712', idNumber: 'X', address: 'Y', totalEarnings: 9000, commissionRate: 3,
    }).findPublicByUserId(7);
    expect(res).toMatchObject({ fullName: 'Juma Boda', city: 'Mwanza', totalDeliveriesCompleted: 12, rating: 4.6 });
    for (const k of ['phone', 'idNumber', 'address', 'totalEarnings', 'commissionRate']) expect(res).not.toHaveProperty(k);
  });

  it('an agent not approved (or none) has no public page', async () => {
    expect(await make({ status: AgentStatus.PENDING }).findPublicByUserId(7)).toBeNull();
    expect(await make(null).findPublicByUserId(7)).toBeNull();
  });
});
