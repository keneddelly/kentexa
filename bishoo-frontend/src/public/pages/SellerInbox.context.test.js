import React from 'react';
import { render, waitFor } from '@testing-library/react';
import SellerInbox from './SellerInbox';
import api from '../../api/api';
import { __resetTokenStoreForTests, setAccessToken } from '../../api/tokenStore';

jest.mock('../../api/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock('../../context/SocketProvider', () => ({ useSocket: () => ({ socket: null, connected: false }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }) }));

beforeEach(() => {
  __resetTokenStoreForTests();
  setAccessToken('a-token');
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path.startsWith('/business/inbox')) return Promise.resolve({ data: { conversations: [{ id: 1, status: 'open' }] } });
    if (path.startsWith('/business/my-conversations')) return Promise.resolve({ data: { conversations: [{ id: 2 }] } });
    return Promise.resolve({ data: [] });
  });
});

// The active RoleContext decides which single communication surface renders
// — the old behavior fired BOTH /business/inbox and /business/my-conversations
// on every bare-inbox load and merged whatever survived Promise.allSettled,
// which is exactly the leak this component now closes: a Buyer-active
// account no longer even attempts the seller-scoped call, a Seller-active
// account no longer sees stray buyer-side threads mixed in, and a role with
// no backend communication surface (agent/super_agent/transport_provider/
// service_provider/customer_care/arbitrator) never fires either request.
test.each([
  ['seller', '/business/inbox'],
  ['admin', '/business/inbox'],
  ['manager', '/business/inbox'],
  ['buyer', '/business/my-conversations'],
])('role "%s" only calls %s, never the other side\'s endpoint', async (userRole, expectedPathPrefix) => {
  render(<SellerInbox onNavigate={jest.fn()} userRole={userRole} currentUser={{ id: 1 }} contextEpoch={1} />);
  await waitFor(() => expect(api.get).toHaveBeenCalled());

  const calledPaths = api.get.mock.calls.map(([path]) => path);
  expect(calledPaths.some(p => p.startsWith(expectedPathPrefix))).toBe(true);
  const otherPrefix = expectedPathPrefix === '/business/inbox' ? '/business/my-conversations' : '/business/inbox';
  expect(calledPaths.some(p => p.startsWith(otherPrefix))).toBe(false);
});

test.each(['agent', 'super_agent', 'transport_provider', 'service_provider', 'customer_care', 'arbitrator'])(
  'role "%s" has no backend inbox surface yet — fails closed with zero network calls',
  async (userRole) => {
    render(<SellerInbox onNavigate={jest.fn()} userRole={userRole} currentUser={{ id: 1 }} contextEpoch={1} />);
    // Give any accidental async fetch a chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.get).not.toHaveBeenCalled();
  },
);
