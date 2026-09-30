import React from 'react';
import { render, waitFor } from '@testing-library/react';
import CustomerProfile from './CustomerProfile';
import api from '../../api/api';
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
jest.mock('../../api/tokenStore', () => ({ getAccessToken: () => 'token' }));
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
test('bio prompt opens the actual editor despite an orders summary failure', async () => {
  api.get.mockImplementation(path => path === '/auth/profile' ? Promise.resolve({ data: { id: 7, name: 'Amina' } }) :
    path === '/profiles/mine' ? Promise.resolve({ data: [{ id: 70, type: 'personal', bio: 'Designer', username: 'amina' }] }) :
    Promise.reject(new Error('orders unavailable')));
  const { container } = render(<CustomerProfile currentUser={{ id: 7 }} editField="bio" onNavigate={jest.fn()} />);
  await waitFor(() => expect(container.querySelector('#profile-bio')).toHaveValue('Designer'));
  await waitFor(() => expect(container.querySelector('#profile-bio')).toHaveFocus());
});
