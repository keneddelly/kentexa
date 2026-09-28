import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BusinessHome from './BusinessHome';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const availableRoles = [{ accountRoleId: 38, roleType: 'seller', switchable: true }];

const mockBusiness = { id: 2, legalName: 'Bishoo Intelligence System', tradingName: 'BiS', status: 'active' };
const mockWorkspace = { id: 2, name: 'Default Operations', isDefault: true, status: 'active', capabilities: ['commerce'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [mockWorkspace] });
    if (path === '/business/2/commerce-entry') return Promise.resolve({ data: { businessId: 2, state: 'active', canApply: false, verification: 'ok', rejectionReason: null, blockedReason: null } });
    return Promise.reject(new Error('unexpected path ' + path));
  });
});

test('renders capability tiles for the given business and shows the resolved name', async () => {
  render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{ accountRoleId: 999 }} roleOptions={availableRoles} onSwitchAccountRole={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('BiS')).toBeInTheDocument());
  expect(screen.getByText('business_home.tile_commerce')).toBeInTheDocument();
  expect(screen.getByText('business_home.tile_pos')).toBeInTheDocument();
});

test('#9 tapping an actionable, not-yet-active tile calls onSwitchAccountRole(accountRoleId, destination) — never a businessId/workspaceId switch', async () => {
  const onSwitchAccountRole = jest.fn();
  render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{ accountRoleId: 999 }} roleOptions={availableRoles} onSwitchAccountRole={onSwitchAccountRole} />);
  await waitFor(() => expect(screen.getByText('business_home.tile_commerce')).toBeInTheDocument());
  fireEvent.click(screen.getByText('business_home.tile_commerce').closest('button'));
  expect(onSwitchAccountRole).toHaveBeenCalledWith(38, 'SellerDashboard');
  // never called with a business/workspace id
  expect(onSwitchAccountRole).not.toHaveBeenCalledWith(2, expect.anything());
});

test('tapping an already-ACTIVE tile navigates directly, without calling switchRole again', async () => {
  const onNavigate = jest.fn();
  const onSwitchAccountRole = jest.fn();
  render(<BusinessHome businessId={2} isLoggedIn onNavigate={onNavigate} activeContext={{ accountRoleId: 38 }} roleOptions={availableRoles} onSwitchAccountRole={onSwitchAccountRole} />);
  await waitFor(() => expect(screen.getByText('business_home.tile_commerce')).toBeInTheDocument());
  fireEvent.click(screen.getByText('business_home.tile_commerce').closest('button'));
  expect(onSwitchAccountRole).not.toHaveBeenCalled();
  expect(onNavigate).toHaveBeenCalledWith('SellerDashboard');
});

test('a capability requiring activation renders inert and disabled, never calling switchRole on tap', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [{ id: 2, name: 'Default Operations', capabilities: ['transport'], myAccountRole: null }] });
    return Promise.reject(new Error('unexpected'));
  });
  const onSwitchAccountRole = jest.fn();
  render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{}} roleOptions={availableRoles} onSwitchAccountRole={onSwitchAccountRole} />);
  await waitFor(() => expect(screen.getByText('business_home.tile_transport')).toBeInTheDocument());
  const btn = screen.getByText('business_home.tile_transport').closest('button');
  expect(btn).toBeDisabled();
  fireEvent.click(btn);
  expect(onSwitchAccountRole).not.toHaveBeenCalled();
  expect(screen.getByText('business_home.state_requires_activation')).toBeInTheDocument();
});

test('load failure shows an error state with retry, never crashes', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    return Promise.reject(new Error('network down'));
  });
  render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{}} roleOptions={[]} onSwitchAccountRole={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('business_home.load_failed')).toBeInTheDocument());
  expect(screen.getByText('common.try_again')).toBeInTheDocument();
});

// ── I2C: the simple, exact-Business "Start selling" door ────────────────────
describe('I2C — Start selling door on Business Home', () => {
  const noCommerceWorkspace = { id: 2, name: 'Default Operations', isDefault: true, status: 'active', capabilities: [], myAccountRole: null };
  const entryFor = (o) => ({ businessId: 2, state: 'available', canApply: true, verification: 'ok', rejectionReason: null, blockedReason: null, ...o });
  const mockNoCommerce = (entry) => api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness, { id: 3, legalName: 'Bob Electronics', status: 'active' }] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [noCommerceWorkspace] });
    if (path === '/business/2/commerce-entry') return Promise.resolve({ data: entry });
    return Promise.reject(new Error('unexpected path ' + path));
  });

  test('a Business without COMMERCE shows the simple door for THAT Business; tapping it uses the generic engine for businessId 2 only', async () => {
    mockNoCommerce(entryFor({}));
    api.post.mockResolvedValue({ data: {} });
    render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{}} roleOptions={[]} onSwitchAccountRole={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('commerce-entry-action-start'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/business/2/capabilities/commerce/apply', { applicationData: undefined }));
    expect(api.post.mock.calls.map((c) => c[0])).toEqual(['/business/2/capabilities/commerce/apply']); // not Bob Electronics (3), not /seller/apply
    expect(api.get).not.toHaveBeenCalledWith('/business/3/commerce-entry');
  });

  test('pending shows the simple pending state and no start button', async () => {
    mockNoCommerce(entryFor({ state: 'pending', canApply: false }));
    render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{}} roleOptions={[]} onSwitchAccountRole={jest.fn()} />);
    expect(await screen.findByText('business_commerce_entry.title_pending')).toBeInTheDocument();
    expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
  });

  test('an ACTIVE Business shows no activation door — the Commerce tile is the way in', async () => {
    render(<BusinessHome businessId={2} isLoggedIn onNavigate={jest.fn()} activeContext={{ accountRoleId: 999 }} roleOptions={availableRoles} onSwitchAccountRole={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('business_home.tile_commerce')).toBeInTheDocument());
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/business/2/commerce-entry'));
    expect(screen.queryByTestId('commerce-entry-action-start')).toBeNull();
    expect(screen.queryByTestId('commerce-entry-active')).toBeNull();
  });
});
