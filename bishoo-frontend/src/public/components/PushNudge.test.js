import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PushNudge from './PushNudge';
import api from '../../api/api';
import { enablePushNotifications, getPushNotificationState } from '../hooks/usePWA';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../hooks/usePWA', () => ({ enablePushNotifications: jest.fn(), getPushNotificationState: jest.fn() }));

test('agents and offices are asked to switch alerts on while SMS is paused (owner 2026-11-08)', async () => {
  api.get.mockResolvedValue({ data: { publicKey: 'k' } });
  getPushNotificationState.mockResolvedValue('off');
  enablePushNotifications.mockResolvedValue('enabled');
  render(<PushNudge who="kazi mpya" />);
  fireEvent.click(await screen.findByTestId('push-nudge-on'));
  await waitFor(() => expect(enablePushNotifications).toHaveBeenCalledWith('k'));
  await waitFor(() => expect(screen.queryByTestId('push-nudge')).toBeNull());
});

test('nothing when alerts are already on', async () => {
  api.get.mockResolvedValue({ data: { publicKey: 'k' } });
  getPushNotificationState.mockResolvedValue('enabled');
  const { container } = render(<PushNudge />);
  await waitFor(() => expect(getPushNotificationState).toHaveBeenCalled());
  expect(container.firstChild).toBeNull();
});
