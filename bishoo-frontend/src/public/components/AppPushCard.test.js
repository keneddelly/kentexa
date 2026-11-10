import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import api from '../../api/api';
import AppPushCard from './AppPushCard';
import { enablePushNotifications, getPushNotificationState } from '../hooks/usePWA';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../hooks/usePWA', () => ({ enablePushNotifications: jest.fn(), getPushNotificationState: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
  api.get.mockResolvedValue({ data: { publicKey: 'KEY' } });
});

test('alerts off inside the app: one tap asks the phone, then the card goes', async () => {
  getPushNotificationState.mockResolvedValue('off');
  enablePushNotifications.mockResolvedValue('enabled');
  await act(async () => { render(<AppPushCard />); });
  await act(async () => { fireEvent.click(screen.getByTestId('app-push-on')); });
  expect(enablePushNotifications).toHaveBeenCalledWith('KEY');
  expect(screen.queryByTestId('app-push-card')).toBeNull();
});

test('"Baadaye" hides it for a few days; already on shows nothing', async () => {
  getPushNotificationState.mockResolvedValue('off');
  const first = render(<AppPushCard />);
  await act(async () => {});
  fireEvent.click(screen.getByTestId('app-push-later'));
  expect(screen.queryByTestId('app-push-card')).toBeNull();
  first.unmount();
  await act(async () => { render(<AppPushCard />); });
  expect(screen.queryByTestId('app-push-card')).toBeNull();
  localStorage.clear();
  getPushNotificationState.mockResolvedValue('enabled');
  await act(async () => { render(<AppPushCard />); });
  expect(screen.queryByTestId('app-push-card')).toBeNull();
});
