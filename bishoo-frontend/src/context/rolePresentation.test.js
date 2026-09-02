import { adaptAvailableRoles, presentationForRole } from './rolePresentation';
import { homeForRole } from '../navigation/navigationRegistry';

const profiles = [
  { id: 10, ownerId: 2, type: 'personal', displayName: 'Personal' },
  { id: 11, ownerId: 2, type: 'business', sellerProfileId: 7, displayName: 'Shop' },
  { id: 12, ownerId: 2, type: 'transport_provider', transportProviderId: 9, displayName: 'Van' },
];

test('seller presentation is matched only by the server profile mapping', () => {
  const p = presentationForRole({ accountRoleId: 3, userId: 2, roleType: 'seller', profileId: 7 }, profiles, { id: 2 });
  expect(p).toMatchObject({ accountRoleId: 3, id: 11, type: 'business', displayName: 'Shop', presentationResolved: true });
});

test('an ambiguous presentation does not invent a profile identity', () => {
  const p = presentationForRole({ accountRoleId: 4, userId: 2, roleType: 'seller', profileId: 999 }, profiles, { id: 2, name: 'User' });
  expect(p).toMatchObject({ accountRoleId: 4, id: null, roleType: 'seller', presentationResolved: false });
});

test('navigation registry, not presentation, owns role homes', () => {
  expect(homeForRole('transport_provider')).toBe('TransportProviderDashboard');
  expect(homeForRole('seller')).toBe('SellerDashboard');
});

test('pending memberships remain non-switchable after presentation enrichment', () => {
  const [role] = adaptAvailableRoles([{ accountRoleId: 8, roleType: 'seller', status: 'pending', switchable: false, profileId: 7 }], profiles, { id: 2 });
  expect(role.switchable).toBe(false);
  expect(role.status).toBe('pending');
});
