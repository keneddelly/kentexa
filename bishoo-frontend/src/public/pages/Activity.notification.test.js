import React from 'react';
import { render, waitFor } from '@testing-library/react';
import Activity from './Activity';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ get: jest.fn(), patch: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

afterEach(() => {
  window.history.replaceState(null, '', '/');
  jest.clearAllMocks();
});

test('notification tap opens the exact BiS moment and keeps its profile identity', async () => {
  window.history.replaceState(null, '', '/?notificationId=47');
  const onNavigate = jest.fn();
  api.get.mockImplementation((path) => Promise.resolve({ data: path === '/notifications/47'
    ? { id: 47, actionPage: 'CommerceProfile', actionParam: '5-feed-93', actionCommerceProfileId: 26 }
    : { items: [] } }));
  api.patch.mockResolvedValue({});
  render(<Activity onNavigate={onNavigate} isLoggedIn contextEpoch={1} />);
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(
    'CommerceProfile-5-feed-93', { commerceProfileId: 26 }));
  expect(window.location.search).toBe('');
  expect(api.patch).toHaveBeenCalledWith('/notifications/47/read');
});

test('unavailable or wrong-role notification does not redirect to a dashboard', async () => {
  window.history.replaceState(null, '', '/?notificationId=48');
  const onNavigate = jest.fn();
  api.get.mockImplementation((path) => path === '/notifications/48'
    ? Promise.reject(new Error('not in current audience'))
    : Promise.resolve({ data: { items: [] } }));
  const { findByRole } = render(<Activity onNavigate={onNavigate} isLoggedIn contextEpoch={1} />);
  expect(await findByRole('alert')).toHaveTextContent(/another Kentexa role/i);
  expect(onNavigate).not.toHaveBeenCalled();
});
