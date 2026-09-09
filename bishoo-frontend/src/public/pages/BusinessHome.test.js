import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BusinessHome from './BusinessHome';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const availableRoles = [{ accountRoleId: 38, roleType: 'seller', switchable: true }];

const mockBusiness = { id: 2, legalName: 'Bishoo Intelligence System', tradingName: 'BiS', status: 'active' };
const mockWorkspace = { id: 2, name: 'Default Operations', isDefault: true, status: 'active', capabilities: ['commerce'], myAccountRole: { accountRoleId: 38, roleType: 'seller' } };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [mockWorkspace] });
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
