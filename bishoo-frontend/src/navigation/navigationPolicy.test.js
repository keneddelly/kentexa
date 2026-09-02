import { evaluateDestination, historyEntryFor, isHistoryEntryValid } from './navigationPolicy';
const context = (roleType, extra = {}) => ({ isAuthenticated: true, roleType, capabilities: [], ...extra });
test('presentation metadata cannot grant operational authority', () => {
  expect(evaluateDestination({ ...context('transport_provider'), page: 'SellerDashboard', activeProfile: { type: 'business' } })).toMatchObject({ allowed: false, reason: 'WRONG_CONTEXT', page: 'TransportProviderDashboard' });
});
test('seller and transport operational pages are isolated', () => {
  expect(evaluateDestination({ ...context('seller'), page: 'TransportProviderDashboard' }).allowed).toBe(false);
  expect(evaluateDestination({ ...context('transport_provider'), page: 'SellerOrders' }).allowed).toBe(false);
});
test('admin navigation is centralized and context restricted', () => {
  expect(evaluateDestination({ ...context('buyer'), page: 'Dashboard' }).allowed).toBe(false);
  expect(evaluateDestination({ ...context('manager'), page: 'Dashboard' }).allowed).toBe(true);
});
test('public deep links remain functional', () => {
  expect(evaluateDestination({ ...context('seller'), page: 'ProductDetail-42' }).allowed).toBe(true);
  expect(evaluateDestination({ ...context('transport_provider'), page: 'TrackParcel-KTX-1' }).allowed).toBe(true);
});
test('unknown destinations fail closed to role home', () => expect(evaluateDestination({ ...context('seller'), page: 'MadeUpPage' })).toMatchObject({ allowed: false, reason: 'UNKNOWN_DESTINATION', page: 'SellerDashboard' }));
test('old operational history cannot cross context epoch', () => {
  const entry = historyEntryFor({ page: 'SellerOrders', contextEpoch: 4, accountRoleId: 38 });
  expect(isHistoryEntryValid(entry, { contextEpoch: 5, accountRoleId: 45 })).toBe(false);
});
