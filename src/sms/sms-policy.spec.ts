import { agentJobSmsOn } from './sms-policy';

// Owner 2026-11-08: agent job SMS off (budget); everything else unchanged.
describe('agent job SMS', () => {
  it('off by default, on with AGENT_JOB_SMS=1', () => {
    expect(agentJobSmsOn({})).toBe(false);
    expect(agentJobSmsOn({ AGENT_JOB_SMS: '1' })).toBe(true);
  });
});
