/**
 * Native push (Firebase Cloud Messaging) for the Android app.
 *
 * Registers this phone's FCM token with the signed-in account so the server
 * can push notifications (messages, orders, comments, likes, Moments).
 * iOS waits for the Apple Developer account. Push is optional: nothing here
 * may block sign-in or sign-out.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { api } from '../api/client';
import { VARIANT } from '../config';

// Test build only: say each step's result on screen so push problems can be seen without logs.
function report(step: string) {
  if (VARIANT !== 'test') return;
  Alert.alert('Push (test)', step);
}


let lastToken: string | null = null;

export async function registerForPush(): Promise<void> {
  if (Platform.OS !== 'android') return;
  let step = 'start';
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    step = `permission=${status}`;
    if (status !== 'granted') { report(`Ruhusa ya notification: ${status}`); return; }

    await Notifications.setNotificationChannelAsync('default', {
      name: 'Kentexa',
      importance: Notifications.AndroidImportance.HIGH,
    });

    const device = await Notifications.getDevicePushTokenAsync();
    step = `device token type=${device.type}`;
    if (typeof device.data !== 'string' || !device.data) { report(`Hakuna token ya simu (${step})`); return; }
    lastToken = device.data;
    await api.post('/notifications/device-token', { token: device.data, platform: 'android' });
    report(`Imesajiliwa kwa seva. (${step})`);
  } catch (e: any) {
    report(`Imeshindikana: ${step}. ${e?.message || e}`);
  }
}

export async function unregisterPush(): Promise<void> {
  const token = lastToken;
  lastToken = null;
  if (!token) return;
  try {
    await api.post('/notifications/device-token/remove', { token });
  } catch {
    /* signing out must still work */
  }
}
