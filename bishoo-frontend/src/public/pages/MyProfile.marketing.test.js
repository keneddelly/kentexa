import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MyProfile from './MyProfile';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'sw', changeLanguage: jest.fn() } }) }));
jest.mock('../components/VerifyIdentityModal', () => () => null);
jest.mock('../components/LanguageSwitcher', () => ({ __esModule: true, default: () => null, LANGUAGES: [] }));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/auth/profile') return Promise.resolve({ data: { name: 'Asha', phone: '0700', marketingOptOut: false } });
    return Promise.reject(new Error('not needed'));
  });
});

test('issue #365: "Taarifa za KenteXa" can be turned off by the person, and says what still arrives', async () => {
  api.patch.mockResolvedValue({ data: { marketingOptOut: true } });
  render(<MyProfile isLoggedIn currentUser={{ name: 'Asha', phone: '0700' }} userRole="buyer"
    availableRoles={[]} roleOptions={[]} onNavigate={jest.fn()} onLogout={jest.fn()} />);
  await act(async () => {});
  fireEvent.click(screen.getByText('my_profile.nav_settings'));
  const row = screen.getByTestId('marketing-toggle');
  expect(row).toHaveTextContent('my_profile.marketing_on');
  await act(async () => { fireEvent.click(screen.getByText('my_profile.marketing_label')); });
  expect(api.patch).toHaveBeenCalledWith('/users/me/marketing', { optOut: true });
  expect(row).toHaveTextContent('my_profile.marketing_off');
  expect(row).toHaveTextContent('my_profile.marketing_value_off');
});
