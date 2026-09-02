import { popValidHistoryEntry, resolveBrowserEntry, resolveNavigationRequest } from './NavigationShell';
import { historyEntryFor } from './navigationPolicy';

const ctx = (roleType, contextEpoch = 1, accountRoleId = 1) => ({
  isAuthenticated: true, roleType, capabilities: [], contextEpoch, accountRoleId,
});
test('role transitions resolve to the new authoritative home', () => {
  expect(resolveNavigationRequest('SellerOrders', ctx('transport_provider', 2, 45)))
    .toMatchObject({ allowed: false, page: 'TransportProviderDashboard' });
  expect(resolveNavigationRequest('TransportProviderDashboard', ctx('seller', 3, 38)))
    .toMatchObject({ allowed: false, page: 'SellerDashboard' });
});

test('back skips operational entries from an old context', () => {
  const history = [
    historyEntryFor({ page: 'Home', contextEpoch: 1, accountRoleId: 38 }),
    historyEntryFor({ page: 'SellerOrders', contextEpoch: 1, accountRoleId: 38 }),
  ];
  const result = popValidHistoryEntry(history, ctx('transport_provider', 2, 45));
  expect(result.entry.page).toBe('Home');
  expect(result.remaining).toEqual([]);
});

test('same-context operational history remains usable', () => {
  const history = [historyEntryFor({ page: 'SellerOrders', contextEpoch: 4, accountRoleId: 38 })];
  expect(popValidHistoryEntry(history, ctx('seller', 4, 38)).entry.page).toBe('SellerOrders');
});

test('browser Back and Forward reject stale operational entries but keep public entries', () => {
  const transport = ctx('transport_provider', 2, 45);
  expect(resolveBrowserEntry('SellerOrders', { contextEpoch: 1, accountRoleId: 38 }, transport))
    .toMatchObject({ allowed: false, reason: 'WRONG_CONTEXT', page: 'TransportProviderDashboard' });
  expect(resolveBrowserEntry('ProductDetail-42', { contextEpoch: 1, accountRoleId: 38 }, transport))
    .toMatchObject({ allowed: true, page: 'ProductDetail-42' });
});
