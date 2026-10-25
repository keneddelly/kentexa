import { AgentsService } from './agents.service';
import { agentOnlineRequired, agentOnlineSql } from './agent-online';

// Owner 2026-10-25: "KenteXa should stop waiting for the agent to be online; the
// nearby agent should see the job." Online is not required unless switched back on.
describe('agents do not need to be online to be offered jobs', () => {
  const agents = [
    { id: 1, status: 'approved', city: 'Dar es Salaam', isOnline: false, rating: 5, baseLatitude: -6.8, baseLongitude: 39.2, user: { id: 11 } },
    { id: 2, status: 'approved', city: 'Dar es Salaam', isOnline: true, rating: 4, baseLatitude: null, baseLongitude: null, user: { id: 12 } },
    { id: 3, status: 'approved', city: 'Mwanza', isOnline: true, rating: 5, user: { id: 13 } },
    { id: 4, status: 'approved', city: 'Dar es Salaam', isOnline: false, rating: 3, maxWeightKg: 5, user: { id: 14 } },
  ];
  const service = () => {
    const svc: any = Object.create(AgentsService.prototype);
    svc.agentRepo = { find: jest.fn(async () => agents) };
    return svc as AgentsService;
  };
  afterEach(() => { delete process.env.AGENT_ONLINE_REQUIRED; });

  it('by default: every approved agent of the city who can carry it, online ones first', async () => {
    const list = await service().getAvailableAgents('Dar es Salaam', 10);
    expect(list.map((a: any) => a.id)).toEqual([2, 1]);                // agent 4 cannot carry 10 kg; Mwanza is another city
    expect(list.map((a: any) => a.isOnline)).toEqual([true, false]);   // the real state, never "true" for everyone
    expect(list.find((a: any) => a.id === 1)).toMatchObject({ hasBasePoint: true });
  });

  it('AGENT_ONLINE_REQUIRED=1 brings back "online agents only"', async () => {
    process.env.AGENT_ONLINE_REQUIRED = '1';
    expect((await service().getAvailableAgents('Dar es Salaam', 2)).map((a: any) => a.id)).toEqual([2]);
  });

  it('the SQL condition follows the same setting', () => {
    expect(agentOnlineRequired({})).toBe(false);
    expect(agentOnlineSql('a', {})).toBe('');
    expect(agentOnlineSql('a', { AGENT_ONLINE_REQUIRED: '1' })).toBe('AND a."isOnline" = true');
  });
});
