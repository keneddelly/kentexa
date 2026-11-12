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
  expect(screen.getByTestId('business-capability-choices')).toBeInTheDocument();
  expect(screen.getByTestId('business-capability-service')).toBeInTheDocument();
  expect(screen.getByTestId('business-capability-transport')).toBeInTheDocument();
  expect(screen.getByTestId('business-capability-super_agent')).toBeInTheDocument();
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

test('business onboarding uses the exact Business profile and opens its profile editor', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [mockWorkspace] });
    if (path === '/profiles/for-user/7') return Promise.resolve({ data: [
      { id: 90, type: 'business', businessId: 99, displayName: 'Other Business' },
      { id: 22, type: 'business', businessId: 2, displayName: 'BiS', username: null, photoUrl: null, bio: '', location: '' },
    ] });
    if (path === '/feed/business/7') return Promise.resolve({ data: [] });
    return Promise.reject(new Error('unexpected path ' + path));
  });
  const onNavigate = jest.fn();
  render(<BusinessHome businessId={2} isLoggedIn currentUser={{ id: 7 }} onNavigate={onNavigate}
    activeContext={{}} roleOptions={[]} onSwitchAccountRole={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Kamilisha wasifu wa biashara')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Hariri wasifu'));
  expect(onNavigate).toHaveBeenCalledWith('EditPublicProfile', { commerceProfileId: 22 });
});

test('first Moment is only offered when the exact Business profile is the active identity', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [mockBusiness] });
    if (path === '/business/2/workspaces') return Promise.resolve({ data: [mockWorkspace] });
    if (path === '/profiles/for-user/7') return Promise.resolve({ data: [
      { id: 22, type: 'business', businessId: 2, displayName: 'BiS', username: 'bis', photoUrl: 'logo.jpg', bio: 'About BiS', location: 'Dar es Salaam' },
    ] });
    if (path === '/feed/business/7') return Promise.resolve({ data: [] });
    return Promise.reject(new Error('unexpected path ' + path));
  });
  const onOpenMoment = jest.fn();
  render(<BusinessHome businessId={2} isLoggedIn currentUser={{ id: 7 }} activeProfileId={22}
    activeContext={{ businessId: 2 }} onOpenMoment={onOpenMoment} onNavigate={jest.fn()}
    roleOptions={[]} onSwitchAccountRole={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Tengeneza Moment ya kwanza')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Tengeneza Moment ya kwanza'));
  expect(onOpenMoment).toHaveBeenCalledWith('selling', { kind: 'moment' });
});
