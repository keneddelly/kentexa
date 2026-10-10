import { evaluateDestination } from './navigationPolicy';
import { destinationForPage, DESTINATION_KIND } from './destinationRegistry';

// KNOWN_FAULTS.md #14: "Mizigo Yangu" (MyShipments) was missing from the
// destination list, so every tap was sent to the home page instead.
describe('MyShipments ("Mizigo Yangu") navigation', () => {
  it('is a registered account page', () => {
    expect(destinationForPage('MyShipments')).toEqual(expect.objectContaining({ page: 'MyShipments', kind: DESTINATION_KIND.ACCOUNT }));
  });

  it('opens for any logged-in user, whatever their active role', () => {
    for (const roleType of ['buyer', 'seller', 'super_agent', 'agent', 'transport_provider']) {
      expect(evaluateDestination({ page: 'MyShipments', isAuthenticated: true, roleType }))
        .toEqual(expect.objectContaining({ allowed: true, page: 'MyShipments' }));
    }
  });

  it('sends a logged-out visitor to login, not to the home page', () => {
    expect(evaluateDestination({ page: 'MyShipments', isAuthenticated: false, roleType: null }))
      .toEqual(expect.objectContaining({ allowed: false, reason: 'AUTHENTICATION_REQUIRED', page: 'PublicLogin' }));
  });
});
