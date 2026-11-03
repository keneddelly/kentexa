import { evaluateDestination } from './navigationPolicy';

test('a team invitation opens for anyone and the cashier till for any signed-in account (owner 2026-11-03)', () => {
  expect(evaluateDestination({ page: 'TeamInvite-abcdefghijklmnopqrstuvwx', isAuthenticated: true, roleType: 'buyer' }))
    .toMatchObject({ allowed: true, page: 'TeamInvite-abcdefghijklmnopqrstuvwx' });
  expect(evaluateDestination({ page: 'TeamInvite-abcdefghijklmnopqrstuvwx', isAuthenticated: false, roleType: null }).allowed).toBe(true);
  expect(evaluateDestination({ page: 'TeamPOS', isAuthenticated: true, roleType: 'buyer' })).toMatchObject({ allowed: true, page: 'TeamPOS' });
  expect(evaluateDestination({ page: 'TeamInvite-bad', isAuthenticated: true, roleType: 'buyer' }).allowed).toBe(false);
});
