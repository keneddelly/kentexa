import { GOALS, goalsToFinish } from './goals';

// Owner 2026-11-09: Kazi shows what the person said they want to do and has not finished.
test('only goals that still need a form, judged by real roles and businesses', () => {
  expect(GOALS.map((g) => g.key)).toEqual(['buy', 'sell', 'service', 'business', 'office', 'agent', 'transport', 'send']);
  const left = goalsToFinish(['buy', 'sell', 'office', 'business', 'nonsense'], { roles: [{ roleType: 'seller', status: 'pending' }], businesses: [] });
  expect(left.map((g) => g.key)).toEqual(['office', 'business']);
  expect(goalsToFinish(['office'], { roles: [{ roleType: 'super_agent', status: 'rejected' }] }).map((g) => g.key)).toEqual(['office']);
  expect(goalsToFinish(null, {})).toEqual([]);
});
