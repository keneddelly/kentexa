import Constants from 'expo-constants';
import * as Application from 'expo-application';

const extra = (Constants.expoConfig?.extra || {}) as { apiUrl?: string; webUrl?: string; variant?: string };

export const API_URL = (extra.apiUrl || 'https://bishoo-backend.onrender.com').replace(/\/$/, '');
export const WEB_URL = (extra.webUrl || 'https://kentexa.com').replace(/\/$/, '');
export const VARIANT = extra.variant || 'test';
export const VERSION_CODE = parseInt(String(Application.nativeBuildVersion || '0'), 10) || 0;

/** A server path for an image ("/uploads/x.jpg") becomes a full address. */
export const mediaUrl = (u?: string | null) => {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`;
};
