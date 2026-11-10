import { evaluateDestination } from './navigationPolicy';

// Buying without signing up first (owner 2026-11-10).
test('signed out at the checkout opens the phone checkout, not the login page', () => {
  expect(evaluateDestination({ page: 'Checkout', isAuthenticated: false }))
    .toMatchObject({ allowed: false, reason: 'AUTHENTICATION_REQUIRED', page: 'GuestCheckout' });
  expect(evaluateDestination({ page: 'GuestCheckout', isAuthenticated: false })).toMatchObject({ allowed: true, page: 'GuestCheckout' });
  expect(evaluateDestination({ page: 'MyOrders', isAuthenticated: false })).toMatchObject({ page: 'PublicLogin' });
});
