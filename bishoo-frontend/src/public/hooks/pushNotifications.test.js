import api from '../../api/api';
import { enablePushNotifications, disablePushNotifications } from './usePWA';

jest.mock('../../api/api', () => ({ get: jest.fn(), delete: jest.fn() }));

test('does not ask for permission when push is not configured on the server', async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalPushManager = window.PushManager;
  const originalNotification = window.Notification;
  const requestPermission = jest.fn();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  window.PushManager = function PushManager() {};
  window.Notification = { permission: 'default', requestPermission };
  api.get.mockResolvedValueOnce({ data: { publicKey: '' } });
  try {
    expect(await enablePushNotifications()).toBe('unavailable');
    expect(requestPermission).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(navigator, 'serviceWorker', previous);
    else delete navigator.serviceWorker;
    window.PushManager = originalPushManager;
    window.Notification = originalNotification;
  }
});

test('logout removes this account endpoint before unsubscribing on device', async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const unsubscribe = jest.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () =>
      ({ endpoint: 'https://push.example/device', unsubscribe }) } }) } });
  api.delete.mockResolvedValueOnce({});
  try {
    await disablePushNotifications();
    expect(api.delete).toHaveBeenCalledWith('/notifications/push/unsubscribe', {
      data: { endpoint: 'https://push.example/device' },
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) Object.defineProperty(navigator, 'serviceWorker', previous);
    else delete navigator.serviceWorker;
  }
});
