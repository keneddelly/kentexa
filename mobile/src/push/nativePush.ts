/** Native Android FCM registration. Permission prompts are user-initiated only. */
import { Platform, Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';
import { tokens } from '../api/tokens';
import { VARIANT } from '../config';

const KENTEXA_NOTIFICATION_CHANNEL = 'kentexa_updates';

export type PushSetupResult = { status: 'registered' | 'permission_denied' | 'unavailable' | 'error'; message: string };
function report(message: string) { if (VARIANT === 'test') Alert.alert('Push (test)', message); }

export async function registerTokenValue(value: unknown): Promise<boolean> {
  if (Platform.OS !== 'android' || typeof value !== 'string' || !value) return false;
  await api.post('/notifications/device-token', { token: value, platform: 'android' });
  await tokens.setPushToken(value);
  return true;
}

/** requestPermission must be true only after an explicit tap by the user. */
export async function registerForPush(options: { requestPermission?: boolean } = {}): Promise<PushSetupResult> {
  if (Platform.OS !== 'android') return { status: 'unavailable', message: 'Arifa za simu hii zitasanidiwa kwenye toleo husika.' };
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' && options.requestPermission) {
      if (permission.canAskAgain === false) {
        await Linking.openSettings();
        return { status: 'permission_denied', message: 'Fungua mipangilio ya simu na uruhusu arifa za Kentexa.' };
      }
      permission = await Notifications.requestPermissionsAsync();
    }
    if (permission.status !== 'granted') return { status: 'permission_denied', message: 'Ruhusa ya arifa haijawashwa. Unaweza kuiwasha kwenye mipangilio.' };
    await Notifications.setNotificationChannelAsync(KENTEXA_NOTIFICATION_CHANNEL, {
      name: 'Kentexa updates',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'kentexa_signature_tone.wav',
      vibrationPattern: [0, 120, 70, 120],
      enableVibrate: true,
    });
    const device = await Notifications.getDevicePushTokenAsync();
    if (typeof device.data !== 'string' || !device.data) return { status: 'error', message: 'Simu haijatoa token ya arifa.' };
    await registerTokenValue(device.data);
    return { status: 'registered', message: 'Simu hii imesajiliwa kupokea arifa za Kentexa.' };
  } catch (error: any) {
    return { status: 'error', message: error?.message || 'Imeshindikana kusajili simu. Jaribu tena.' };
  }
}

export async function unregisterPush(): Promise<void> {
  const token = await tokens.getPushToken();
  if (!token) return;
  await api.post('/notifications/device-token/remove', { token });
  await tokens.setPushToken(null);
}

export async function refreshPushRegistration(): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === 'granted') await registerForPush();
}
