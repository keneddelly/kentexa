import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Workspace from './Workspace';
import { getMyBusinesses } from '../../api/business';
import api from '../../api/api';

jest.mock('../../api/business', () => ({ getMyBusinesses: jest.fn() }));
jest.mock('../../api/api', () => ({ get: jest.fn() }));

const role = (id, roleType, extra = {}) => ({ accountRoleId: id, roleType, status: 'active', switchable: true, businessId: null, ...extra });
const roles = [
  role(1, 'buyer'),
  role(2, 'seller', { businessId: 10, businessName: 'Bishoo Electronics' }),
  role(3, 'agent', { status: 'pending' }),
];

const setup = async (activeRoleId = 1, extraRoles = [], { roleType = 'buyer', answers = {}, inboxUnread = 0 } = {}) => {
  getMyBusinesses.mockResolvedValue([{ id: 10, legalName: 'Bishoo Electronics' }]);
  api.get.mockImplementation(async (url) => ({ data: answers[url] ?? [] }));
  const onNavigate = jest.fn();
  const onSwitchAccountRole = jest.fn().mockResolvedValue(undefined);
  await act(async () => {
    render(<Workspace isLoggedIn onNavigate={onNavigate} currentUser={{ name: 'Kened' }} activeContext={{ accountRoleId: activeRoleId, roleType }} inboxUnread={inboxUnread}
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

test('Kinachohitaji wewe: the active seller\'s orders to send and Lipa to confirm, from the seller dashboard numbers', async () => {
  const answers = { '/seller/dashboard': { stats: { needsShipping: 3 }, recentOrders: [
    { paymentMethod: 'lipa_namba', paymentStatus: 'pending', status: 'preparing' },
    { paymentMethod: 'lipa_namba', paymentStatus: 'paid', status: 'preparing' },
  ] } };
  const { onNavigate } = await setup(2, [], { roleType: 'seller', answers });
  expect(await screen.findByTestId('attention-seller.toSend')).toHaveTextContent('3');
  expect(screen.getByTestId('attention-seller.lipa')).toHaveTextContent('1');
  fireEvent.click(screen.getByTestId('attention-seller.toSend'));
  expect(onNavigate).toHaveBeenCalledWith('SellerOrders');
});

test('personal items: unread messages and deliveries to confirm; nothing shown when there is nothing', async () => {
  await setup(1, [], { inboxUnread: 2, answers: { '/orders/my-orders': [{ status: 'delivered' }, { status: 'preparing' }] } });
  expect(await screen.findByTestId('attention-me.inbox')).toHaveTextContent('2');
  expect(await screen.findByTestId('attention-me.confirm')).toHaveTextContent('1');
});

test('no items, no section: nothing is invented', async () => {
  await setup(1);
  expect(screen.queryByTestId('attention')).toBeNull();
});

test('each business keeps its daily summary ("Leo") as a tool', async () => {
  const { onNavigate } = await setup(2, [], { roleType: 'seller' });
  fireEvent.click(screen.getByTestId('business-today'));
  expect(onNavigate).toHaveBeenCalledWith('BusinessDashboard-10');
});

test('a food business shows its kitchen and menu; any other business can switch its menu on', async () => {
  getMyBusinesses.mockResolvedValue([{ id: 10, legalName: 'Bishoo Electronics', category: 'Hoteli' }]);
  api.get.mockImplementation(async () => ({ data: [] }));
  const onNavigate = jest.fn();
  await act(async () => {
    render(<Workspace isLoggedIn onNavigate={onNavigate} currentUser={{ name: 'Kened' }} activeContext={{ accountRoleId: 2, roleType: 'seller' }}
      roleOptions={roles} onSwitchAccountRole={jest.fn()} onRefreshContext={jest.fn()} />);
  });
  fireEvent.click(screen.getByTestId('tool-hotel.kitchen.10'));
  expect(onNavigate).toHaveBeenCalledWith('HotelKitchen', { businessId: 10 });
  expect(screen.queryByTestId('hotel-start')).toBeNull();
});

test('a business that is not food can still open the menu set-up', async () => {
  const { onNavigate } = await setup(2, [], { roleType: 'seller' });
  fireEvent.click(screen.getByTestId('hotel-start'));
  expect(onNavigate).toHaveBeenCalledWith('HotelMenuManager', { businessId: 10 });
});
