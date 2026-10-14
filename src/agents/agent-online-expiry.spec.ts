import { AgentOnlineExpiryService, agentOnlineExpiryMinutes } from './agent-online-expiry.service';

// D1 (owner 2026-10-14): online expires after a period with no activity.
describe('agent online expiry', () => {
  it('setting: default 60 minutes, limited to 15..1440', () => {
    expect(agentOnlineExpiryMinutes({})).toBe(60);
    expect(agentOnlineExpiryMinutes({ AGENT_ONLINE_EXPIRY_MINUTES: '90' })).toBe(90);
    expect(agentOnlineExpiryMinutes({ AGENT_ONLINE_EXPIRY_MINUTES: '5' })).toBe(15);
    expect(agentOnlineExpiryMinutes({ AGENT_ONLINE_EXPIRY_MINUTES: '99999' })).toBe(1440);
    expect(agentOnlineExpiryMinutes({ AGENT_ONLINE_EXPIRY_MINUTES: 'x' })).toBe(60);
  });

  it('another tick already running: nothing is switched off', async () => {
    const em: any = { query: jest.fn(async () => [{ ok: false }]) };
    const db: any = { transaction: jest.fn(async (cb: any) => cb(em)) };
    expect(await new AgentOnlineExpiryService(db).expire(new Date(), 60)).toEqual([]);
    expect(em.query).toHaveBeenCalledTimes(1);
  });

  it('an online agent is never reported as "switched off automatically"', async () => {
    const db: any = { query: jest.fn() };
    expect(await new AgentOnlineExpiryService(db).offlineReason(9, true, new Date())).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});
