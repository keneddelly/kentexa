import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileSwitcherSheet from './ProfileSwitcherSheet';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

const buyer = { accountRoleId: 26, roleType: 'buyer', type: 'personal', displayName: 'Kened', status: 'active', switchable: true, businessId: null, businessName: null };
const sellerBiz = { accountRoleId: 38, roleType: 'seller', type: 'business', displayName: 'BiS', status: 'active', switchable: true, businessId: 2, businessName: 'Bishoo Intelligence Systems' };
const posBiz = { accountRoleId: 38, roleType: 'seller', type: 'business', displayName: 'BiS', status: 'active', switchable: true, businessId: 2, businessName: 'Bishoo Intelligence Systems' };
const unboundHub = { accountRoleId: 41, roleType: 'super_agent', type: 'hub', displayName: 'Hub', status: 'active', switchable: true, businessId: null, businessName: null };

test('renders Personal and My Businesses as distinct sections, grouped by server-issued businessId', () => {
  render(<ProfileSwitcherSheet profiles={[buyer, sellerBiz, unboundHub]} activeAccountRoleId={26}
    onSwitch={jest.fn()} onClose={jest.fn()} onNavigate={jest.fn()} onOpenBusiness={jest.fn()} />);
  expect(screen.getByText('profile_switcher.my_businesses_header')).toBeInTheDocument();
  expect(screen.getByText('Bishoo Intelligence Systems')).toBeInTheDocument();
  expect(screen.getByText('profile_switcher.other_roles_header')).toBeInTheDocument();
});

test('tapping a capability row switches the AccountRole, tapping the business name opens Business Home instead', () => {
  const onSwitch = jest.fn();
  const onOpenBusiness = jest.fn();
  render(<ProfileSwitcherSheet profiles={[buyer, sellerBiz]} activeAccountRoleId={26}
    onSwitch={onSwitch} onClose={jest.fn()} onNavigate={jest.fn()} onOpenBusiness={onOpenBusiness} />);

  fireEvent.click(screen.getByText('Bishoo Intelligence Systems'));
  expect(onOpenBusiness).toHaveBeenCalledWith(2);
  expect(onSwitch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('business_home.tile_commerce'));
  expect(onSwitch).toHaveBeenCalledWith(38);
});

test('the active capability row is marked active and disabled from re-switching to itself', () => {
  render(<ProfileSwitcherSheet profiles={[buyer, sellerBiz]} activeAccountRoleId={38}
    onSwitch={jest.fn()} onClose={jest.fn()} onNavigate={jest.fn()} onOpenBusiness={jest.fn()} />);
  const activeLabels = screen.getAllByText('profile_switcher.active_label');
  expect(activeLabels.length).toBe(1);
});
