import * as SecureStore from 'expo-secure-store';
const ACCESS = 'kx_access';
const REFRESH = 'kx_refresh';
const PUSH_TOKEN = 'kx_push_token';
let access: string | null = null;
export const tokens = {
  async load() { try { access = await SecureStore.getItemAsync(ACCESS); } catch { access = null; } return access; },
  get access() { return access; },
  async setAccess(t: string | null) {
    access = t;
    try { if (t) await SecureStore.setItemAsync(ACCESS, t); else await SecureStore.deleteItemAsync(ACCESS); } catch { /* kept in memory */ }
  },
  async refresh() { try { return await SecureStore.getItemAsync(REFRESH); } catch { return null; } },
  async setRefresh(t: string | null) {
    try { if (t) await SecureStore.setItemAsync(REFRESH, t); else await SecureStore.deleteItemAsync(REFRESH); } catch { /* next sign-in sets it */ }
  },
  async getPushToken() { try { return await SecureStore.getItemAsync(PUSH_TOKEN); } catch { return null; } },
  async setPushToken(t: string | null) {
    try { if (t) await SecureStore.setItemAsync(PUSH_TOKEN, t); else await SecureStore.deleteItemAsync(PUSH_TOKEN); } catch { /* server registration can be recovered */ }
  },
  async clear() { access = null; await Promise.all([this.setAccess(null), this.setRefresh(null)]); },
};
