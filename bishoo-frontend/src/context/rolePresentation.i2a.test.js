import { adaptAvailableRoles, presentationForRole } from './rolePresentation';
import { activeBusinessNameFor, groupProfilesForSwitcher } from './businessGrouping';

const bob = { id: 1, name: 'Bob', avatarUrl: 'bob.png' };

const buyer = { accountRoleId: 1, roleType: 'buyer', status: 'active', switchable: true, userId: 1, profileId: 1, identityType: 'PERSONAL', displayName: 'Bob', photoUrl: 'bob.png', businessId: null, businessName: null, workspaceId: null };
const wmSeller = { accountRoleId: 2, roleType: 'seller', status: 'active', switchable: true, userId: 1, profileId: 5, identityType: 'BUSINESS', displayName: 'Washing Machine TZ', photoUrl: 'wm.png', businessId: 10, businessName: 'Washing Machine TZ', workspaceId: 100, commerceProfileId: 77 };
const wmService = { ...wmSeller, accountRoleId: 3, roleType: 'service_provider', profileId: 6 };

test('organizational role never falls back to the User name, even with no legacy presentation profile', () => {
  const p = presentationForRole(wmSeller, [], bob);
  expect(p.displayName).toBe('Washing Machine TZ');
  expect(p.photoUrl).toBe('wm.png');
  expect(p.identityType).toBe('BUSINESS');
  expect(p.commerceProfileId).toBe(77);
});

test('personal role presents as the user', () => {
  const p = presentationForRole(buyer, [], bob);
  expect(p).toMatchObject({ displayName: 'Bob', identityType: 'PERSONAL', businessId: null });
});

test('defensive fallback still works for a role object that predates the identity fields', () => {
  const p = presentationForRole({ accountRoleId: 9, roleType: 'buyer', userId: 1 }, [], bob);
  expect(p.displayName).toBe('Bob');
});

test('same Business Seller + Service present the same identity under one group', () => {
  const options = adaptAvailableRoles([buyer, wmSeller, wmService], [], bob);
  const groups = groupProfilesForSwitcher(options);
  expect(groups.personal.displayName).toBe('Bob');
  expect(groups.businesses).toHaveLength(1);
  expect(groups.businesses[0].businessName).toBe('Washing Machine TZ');
  expect(groups.businesses[0].capabilities.map((c) => c.displayName)).toEqual(['Washing Machine TZ', 'Washing Machine TZ']);
});

test('activeBusinessNameFor reads the canonical activeContext identity directly', () => {
  expect(activeBusinessNameFor({ accountRoleId: 2, identityType: 'BUSINESS', displayName: 'Washing Machine TZ' }, [])).toBe('Washing Machine TZ');
  expect(activeBusinessNameFor({ accountRoleId: 1, identityType: 'PERSONAL', displayName: 'Bob' }, [])).toBeNull();
});

test('a server-declared UNRESOLVED organizational row (identityType null) never presents as the User', () => {
  const broken = { accountRoleId: 4, roleType: 'seller', status: 'active', switchable: false, userId: 1, identityType: null, displayName: null, photoUrl: null, businessId: null, businessName: null, workspaceId: null, commerceProfileId: null };
  const p = presentationForRole(broken, [], bob);
  expect(p.displayName).not.toBe('Bob');
  expect(p.photoUrl).toBeNull();
  expect(p.identityType).toBeNull();
});
