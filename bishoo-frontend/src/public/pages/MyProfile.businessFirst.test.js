import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MyProfile from './MyProfile';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'en', changeLanguage: jest.fn() } }) }));
jest.mock('../components/VerifyIdentityModal', () => () => null);
jest.mock('../components/LanguageSwitcher', () => ({ __esModule: true, default: () => null, LANGUAGES: [] }));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(path => {
    if (path === '/business/mine/all') return Promise.resolve({ data: [
      { id: 2, tradingName: 'BiS' },
      { id: 5, tradingName: 'Second Co' },
    ] });
    if (path === '/auth/profile') return Promise.resolve({ data: { name: 'Kened', phone: '0700' } });
    return Promise.reject(new Error('not needed'));
  });
});

test('Personal identity and Businesses are primary, grouped once across capabilities', async () => {
  const onNavigate = jest.fn();
  const roleOptions = [
    { accountRoleId: 26, roleType: 'buyer', type: 'personal', displayName: 'Kened', businessId: null },
    { accountRoleId: 38, roleType: 'seller', type: 'business', businessId: 2, businessName: 'BiS' },
    { accountRoleId: 45, roleType: 'transport_provider', type: 'transport_provider', businessId: 2, businessName: 'BiS' },
    { accountRoleId: 50, roleType: 'seller', type: 'business', businessId: 5, businessName: 'Second Co' },
  ];
  render(<MyProfile isLoggedIn currentUser={{ name: 'Kened', phone: '0700' }} userRole="buyer"
    availableRoles={[{ roleType: 'buyer', status: 'active' }]} roleOptions={roleOptions}
    onNavigate={onNavigate} onLogout={jest.fn()} />);
  expect(screen.getByText('Kened')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('BiS')).toBeInTheDocument());
  expect(screen.getByText('Second Co')).toBeInTheDocument();
  expect(screen.getAllByText('BiS')).toHaveLength(1);
  expect(screen.getByText('business_home.tile_commerce · active · business_home.tile_transport · active')).toBeInTheDocument();
  expect(screen.queryByText('my_profile.role_buyer')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('my_profile.my_classifieds'));
  expect(onNavigate).toHaveBeenCalledWith('MyClassifieds');
});
