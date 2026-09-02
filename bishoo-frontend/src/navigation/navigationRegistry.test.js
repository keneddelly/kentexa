import { ACCOUNT_ROLE_TYPES, ADMIN_NAVIGATION, homeForRole, ROLE_NAVIGATION } from './navigationRegistry';
import { destinationForPage } from './destinationRegistry';

test('every AccountRole has exactly one registered home', () => {
  expect(Object.keys(ROLE_NAVIGATION).sort()).toEqual([...ACCOUNT_ROLE_TYPES].sort());
  ACCOUNT_ROLE_TYPES.forEach((role) => expect(destinationForPage(homeForRole(role))).not.toBeNull());
});
test('every nav item references a registered destination', () => {
  Object.values(ROLE_NAVIGATION).flatMap((config) => config.items).forEach((entry) => expect(entry.destination === '__POST__' || destinationForPage(entry.destination)).toBeTruthy());
  ADMIN_NAVIGATION.forEach((entry) => expect(destinationForPage(entry.destination)).toBeTruthy());
});
test('navigation IDs are unique per placement', () => {
  Object.values(ROLE_NAVIGATION).forEach((config) => expect(new Set(config.items.map((entry) => entry.id)).size).toBe(config.items.length));
  expect(new Set(ADMIN_NAVIGATION.map((entry) => entry.id)).size).toBe(ADMIN_NAVIGATION.length);
});
test('role homes match intended contexts', () => {
  expect(homeForRole('buyer')).toBe('Home'); expect(homeForRole('seller')).toBe('SellerDashboard');
  expect(homeForRole('transport_provider')).toBe('TransportProviderDashboard'); expect(homeForRole('service_provider')).toBe('MyServices');
  expect(homeForRole('manager')).toBe('Dashboard');
});
