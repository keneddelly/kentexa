import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoleContextProvider, useRoleContext } from './RoleContext';
import api from '../api/api';
import { __resetTokenStoreForTests, getAccessToken, setAccessToken } from '../api/tokenStore';

jest.mock('../api/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  cancelContextRequests: jest.fn(),
  configureAuthLifecycle: jest.fn(),
}));

const buyer = { userId: 2, accountRoleId: 26, roleType: 'buyer', profileType: 'user', profileId: 2, contextVersion: 1, capabilities: [] };
const seller = { userId: 2, accountRoleId: 38, roleType: 'seller', profileType: 'seller_profile', profileId: 1, contextVersion: 1, capabilities: ['sell'] };
const transport = { userId: 2, accountRoleId: 45, roleType: 'transport_provider', profileType: 'transport_provider', profileId: 3, contextVersion: 1, capabilities: ['transport'] };
const roles = [
  { accountRoleId: 26, roleType: 'buyer', status: 'active', switchable: true, profileType: 'user', profileId: 2 },
  { accountRoleId: 38, roleType: 'seller', status: 'active', switchable: true, profileType: 'seller_profile', profileId: 1 },
  { accountRoleId: 45, roleType: 'transport_provider', status: 'active', switchable: true, profileType: 'transport_provider', profileId: 3 },
  { accountRoleId: 99, roleType: 'agent', status: 'pending', switchable: false, profileType: 'agent', profileId: 8 },
];
const profiles = [
  { id: 20, ownerId: 2, type: 'personal', displayName: 'User' },
  { id: 21, ownerId: 2, type: 'business', sellerProfileId: 1, displayName: 'Shop' },
  { id: 22, ownerId: 2, type: 'transport_provider', transportProviderId: 3, displayName: 'Van' },
];
const response = (context, token) => ({ accessToken: token, access_token: token, user: { id: 2, role: 'transport_provider', activeRoles: ['seller'] }, activeContext: context, availableRoles: roles });

const Probe = () => {
  const ctx = useRoleContext();
  const run = (id) => ctx.switchRole(id).catch(e => e.message);
  return <div>
    <span data-testid="status">{ctx.status}</span><span data-testid="role">{ctx.activeRoleType || '-'}</span>
    <span data-testid="epoch">{ctx.contextEpoch}</span><span data-testid="profile">{ctx.activeProfile?.id ?? '-'}</span>
    <span data-testid="legacy">{ctx.user?.role || '-'}</span>
    <span data-testid="caps">{ctx.capabilities.join(',')}</span>
    <button onClick={() => ctx.acceptAuthResponse(response(buyer, 'buyer-token'))}>login</button>
    <button onClick={() => run(38)}>seller</button><button onClick={() => run(45)}>transport</button>
    <button onClick={() => run(99)}>pending</button><button onClick={() => ctx.logout()}>logout</button>
  </div>;
};

const mount = () => render(<RoleContextProvider><Probe /></RoleContextProvider>);

beforeEach(() => {
  __resetTokenStoreForTests();
  jest.clearAllMocks();
  api.get.mockImplementation(path => {
    if (path === '/profiles/mine') return Promise.resolve({ data: profiles });
    if (path === '/auth/me') return Promise.resolve({ data: { user: { id: 2 }, activeContext: buyer } });
    if (path === '/auth/roles') return Promise.resolve({ data: { availableRoles: roles } });
    return Promise.resolve({ data: {} });
  });
  api.post.mockImplementation((path, body) => {
    if (path === '/auth/logout') return Promise.resolve({ data: { success: true } });
    const context = body.accountRoleId === 38 ? seller : body.accountRoleId === 45 ? transport : buyer;
    return Promise.resolve({ data: response(context, `${context.roleType}-token`) });
  });
});

test('login initializes server context and ignores legacy User.role authority', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  expect(screen.getByTestId('legacy')).toHaveTextContent('transport_provider');
  expect(getAccessToken()).toBe('buyer-token');
});

test('reload restores /auth/me context then /auth/roles memberships', async () => {
  setAccessToken('stored'); mount();
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  expect(api.get.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['/auth/me', '/auth/roles']));
  expect(screen.getByTestId('role')).toHaveTextContent('buyer');
});

test('buyer to seller atomically rotates token, epoch, and server-mapped profile', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  const before = Number(screen.getByTestId('epoch').textContent);
  fireEvent.click(screen.getByText('seller'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('seller'));
  expect(getAccessToken()).toBe('seller-token');
  expect(Number(screen.getByTestId('epoch').textContent)).toBe(before + 1);
  expect(screen.getByTestId('profile')).toHaveTextContent('21');
  expect(screen.getByTestId('caps')).toHaveTextContent('sell');
  expect(api.post).toHaveBeenCalledWith('/auth/switch-role', { accountRoleId: 38 });
});

test('transport to seller and seller to transport isolate authority symmetrically', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  fireEvent.click(screen.getByText('transport'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('transport_provider'));
  expect(getAccessToken()).toBe('transport_provider-token');
  fireEvent.click(screen.getByText('seller'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('seller'));
  expect(getAccessToken()).toBe('seller-token');
});

test('failed switch preserves the old token, context, and epoch', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  const before = screen.getByTestId('epoch').textContent;
  api.post.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(screen.getByText('seller'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect(screen.getByTestId('role')).toHaveTextContent('buyer');
  expect(screen.getByTestId('epoch')).toHaveTextContent(before);
  expect(getAccessToken()).toBe('buyer-token');
});

test('pending membership is rejected before any switch request', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  api.post.mockClear(); fireEvent.click(screen.getByText('pending'));
  await act(() => Promise.resolve());
  expect(api.post).not.toHaveBeenCalled();
});

test('rapid double switch is serialized by the provider lock', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  let resolveSwitch;
  api.post.mockImplementationOnce(() => new Promise(resolve => { resolveSwitch = resolve; }));
  fireEvent.click(screen.getByText('seller')); fireEvent.click(screen.getByText('transport'));
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => resolveSwitch({ data: response(seller, 'seller-token') }));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('seller'));
});

test('logout calls backend before clearing local authority', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  fireEvent.click(screen.getByText('logout'));
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  expect(api.post).toHaveBeenCalledWith('/auth/logout');
  expect(getAccessToken()).toBeNull();
});

test('account-wide browser preferences survive a role switch', async () => {
  localStorage.setItem('kentexa_lang', 'sw');
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  fireEvent.click(screen.getByText('seller'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('seller'));
  expect(localStorage.getItem('kentexa_lang')).toBe('sw');
});

test('revoked current context clears authority safely', async () => {
  mount(); fireEvent.click(screen.getByText('login'));
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('buyer'));
  const lifecycle = require('../api/api').configureAuthLifecycle.mock.calls.at(-1)[0];
  act(() => lifecycle.onCurrentContextRevoked());
  expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  expect(getAccessToken()).toBeNull();
});
