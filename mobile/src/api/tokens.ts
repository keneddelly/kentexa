import * as SecureStore from 'expo-secure-store';

/**
 * Sign-in kept on the phone (#422 N0). The access token is short-lived; the refresh credential is
 * kept in the phone's secure storage (Android Keystore / iOS Keychain), never in plain storage.
 */
const ACCESS = 'kx_access';
const REFRESH = 'kx_refresh';

let access: string | null = null;

export const tokens = {
  async load() {
    try { access = await SecureStore.getItemAsync(ACCESS); } catch { access = null; }
    return access;
  },
  get access() { return access; },
  async setAccess(t: string | null) {
    access = t;
    try { if (t) await SecureStore.setItemAsync(ACCESS, t); else await SecureStore.deleteItemAsync(ACCESS); } catch { /* kept in memory */ }
  },
  async refresh() {
    try { return await SecureStore.getItemAsync(REFRESH); } catch { return null; }
  },
  async setRefresh(t: string | null) {
    try { if (t) await SecureStore.setItemAsync(REFRESH, t); else await SecureStore.deleteItemAsync(REFRESH); } catch { /* next sign-in sets it */ }
  },
  async clear() {
    access = null;
    await Promise.all([this.setAccess(null), this.setRefresh(null)]);
  },
};
