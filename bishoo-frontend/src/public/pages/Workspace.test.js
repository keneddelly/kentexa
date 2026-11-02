import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Workspace from './Workspace';
import { getMyBusinesses } from '../../api/business';

jest.mock('../../api/business', () => ({ getMyBusinesses: jest.fn() }));

const role = (id, roleType, extra = {}) => ({ accountRoleId: id, roleType, status: 'active', switchable: true, businessId: null, ...extra });
const roles = [
  role(1, 'buyer'),
  role(2, 'seller', { businessId: 10, businessName: 'Bishoo Electronics' }),
  role(3, 'agent', { status: 'pending' }),
];

const setup = async (activeRoleId = 1, extraRoles = []) => {
  getMyBusinesses.mockResolvedValue([{ id: 10, legalName: 'Bishoo Electronics' }]);
  const onNavigate = jest.fn();
  const onSwitchAccountRole = jest.fn().mockResolvedValue(undefined);
  await act(async () => {
    render(<Workspace isLoggedIn onNavigate={onNavigate} currentUser={{ name: 'Kened' }} activeContext={{ accountRoleId: activeRoleId }}
      roleOptions={[...roles, ...extraRoles]} onSwitchAccountRole={onSwitchAccountRole} onRefreshContext={jest.fn()} />);
  });
  return { onNavigate, onSwitchAccountRole };
};

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

test('Binafsi: personal tools open directly; a pending role shows its state, never its tools; start cards for roles not held', async () => {
  const { onNavigate, onSwitchAccountRole } = await setup(1);
  expect(screen.getByTestId('personal-workspace')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('tool-me.orders'));
  expect(onNavigate).toHaveBeenCalledWith('MyOrders');
  expect(onSwitchAccountRole).not.toHaveBeenCalled();
  expect(screen.getByTestId('role-state-3')).toHaveTextContent('Inasubiri idhini');
  expect(screen.queryByTestId('tool-agent.jobs')).toBeNull();
  expect(screen.getByTestId('start-super_agent')).toBeInTheDocument();
  expect(screen.queryByTestId('start-agent')).toBeNull();
});

test('a business tool of another role switches once, straight to that tool', async () => {
  const { onNavigate, onSwitchAccountRole } = await setup(1);
  fireEvent.click(screen.getByTestId('workspace-switcher'));
  fireEvent.click(screen.getByRole('option', { name: /Bishoo Electronics/ }));
  expect(screen.getByTestId('business-workspace')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByTestId('tool-seller.pos')); });
  expect(onSwitchAccountRole).toHaveBeenCalledWith(2, 'POS');
  expect(onNavigate).not.toHaveBeenCalledWith('POS');
});

test('the active role opens on its own business, and its tools open without a switch', async () => {
  const { onNavigate, onSwitchAccountRole } = await setup(2);
  expect(screen.getByTestId('workspace-switcher')).toHaveTextContent('Bishoo Electronics');
  fireEvent.click(screen.getByTestId('tool-seller.orders'));
  expect(onNavigate).toHaveBeenCalledWith('SellerOrders');
  expect(onSwitchAccountRole).not.toHaveBeenCalled();
});

test('a suspended business role shows its state and no tools', async () => {
  await setup(1, [role(9, 'super_agent', { businessId: 10, businessName: 'Bishoo Electronics', status: 'suspended' })]);
  fireEvent.click(screen.getByTestId('workspace-switcher'));
  fireEvent.click(screen.getByRole('option', { name: /Bishoo Electronics/ }));
  expect(screen.getByTestId('role-state-9')).toHaveTextContent('Imesimamishwa');
  expect(screen.queryByTestId('tool-office.desk')).toBeNull();
});
