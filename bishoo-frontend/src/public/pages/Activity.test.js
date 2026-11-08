
test('a pickup job notice opens the agent dashboard, not Home (owner 2026-11-08)', () => {
  const { SERVER_PAGES } = require('./Activity');
  expect(SERVER_PAGES['agent-pickups']).toBe('AgentDashboard');
});
