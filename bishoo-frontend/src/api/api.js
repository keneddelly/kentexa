import axios from 'axios';
import { reportClientError } from '../utils/clientErrors';
import { getTokenSnapshot, setAccessToken } from './tokenStore';
import { API_BASE_URL } from './baseUrl';
import { startRequest as startSlowWatch, finishRequest as finishSlowWatch } from './slowNetwork';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let getContextEpoch = () => 0;
let onCurrentContextRevoked = () => {};
let refreshInFlight = null;
const pendingControllers = new Set();

export class StaleContextResponseError extends Error {
  constructor() {
    super('STALE_CONTEXT_RESPONSE');
    this.code = 'STALE_CONTEXT_RESPONSE';
  }
}

export const configureAuthLifecycle = (options = {}) => {
  if (options.getContextEpoch) getContextEpoch = options.getContextEpoch;
  if (options.onCurrentContextRevoked) onCurrentContextRevoked = options.onCurrentContextRevoked;
};

export const cancelContextRequests = () => {
  pendingControllers.forEach((controller) => controller.abort());
  pendingControllers.clear();
};

const responseCode = (error) => {
  const data = error?.response?.data;
  return data?.code || data?.message?.code || (typeof data?.message === 'string' ? data.message : null);
};

const finishRequest = (config) => {
  if (config?.__contextController) pendingControllers.delete(config.__contextController);
  finishSlowWatch(config?.__slowWatchId);
};

const isStale = (config) => {
  if (!config?.__authenticatedRequest) return false;
  const snapshot = getTokenSnapshot();
  return snapshot.generation !== config.__tokenGeneration
    || snapshot.token !== config.__authToken
    || getContextEpoch() !== config.__contextEpoch;
};

const expiringSoon = (token) => {
  try {
    const expiry = JSON.parse(atob(token.split('.')[1])).exp;
    return Number.isFinite(expiry) && expiry * 1000 <= Date.now() + 120000;
  } catch { return false; }
};

// A single refresh per device wake-up. The cookie is HttpOnly and scoped to
// /auth; the signed, short-lived access token remains the only API authority.
export const renewAccessTokenIfNeeded = async (force = false) => {
  const token = getTokenSnapshot().token;
  if (!token || (!force && !expiringSoon(token))) return;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {},
        { withCredentials: true });
      if (getTokenSnapshot().token === token && data?.accessToken) {
        setAccessToken(data.accessToken);
      }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
};

/** Sign out on the server's word, and send a short note (reason and page) so we can see why. */
const signedOut = (reason, config) => {
  try {
    reportClientError({ kind: 'app', page: 'signed-out', message: `Signed out: ${reason} (${String(config?.method || '').toUpperCase()} ${String(config?.url || '').split('?')[0]})` });
  } catch { /* reporting never blocks */ }
  onCurrentContextRevoked(reason);
};

// Attach the canonical token and capture its authority generation/epoch.
api.interceptors.request.use(async (config) => {
  if (getTokenSnapshot().token) {
    try { await renewAccessTokenIfNeeded(); }
    catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403)
        onCurrentContextRevoked('REFRESH_REJECTED');
      throw error;
    }
  }
  const { token, generation } = getTokenSnapshot();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.__authenticatedRequest = true;
    config.__authToken = token;
    config.__tokenGeneration = generation;
    config.__contextEpoch = getContextEpoch();
    if (!config.signal) {
      const controller = new AbortController();
      config.signal = controller.signal;
      config.__contextController = controller;
      pendingControllers.add(controller);
    }
  }
  config.__slowWatchId = startSlowWatch(config.method);
  return config;
});

api.interceptors.response.use(
  (response) => {
    finishRequest(response.config);
    if (isStale(response.config)) return Promise.reject(new StaleContextResponseError());
    // Training office (ofisi ya mafunzo): the server sent no real SMS; show the
    // text on screen instead (TrainingSmsNotice).
    const preview = response?.data?.trainingSmsPreview;
    if (Array.isArray(preview) && preview.length && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kentexa:training-sms', { detail: preview }));
    }
    return response;
  },
  (error) => {
    const config = error.config;
    finishRequest(config);
    // A revoked response from an old token/epoch is stale evidence and must
    // never clear a newer context established while the request was in flight.
    if (isStale(config)) return Promise.reject(new StaleContextResponseError());
    // The server says an ID is needed: let every open page re-read the ID status
    // (utils/useIdentityRefresh). Raw event name: no import, no cycle.
    if (error?.response?.status === 403 && /^VERIFICATION_/.test(error?.response?.data?.code || '') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kentexa:identity-changed'));
    }
    if (error?.response?.status === 401 && config?.__authenticatedRequest) {
      // Owner 2026-11-16 ("the login page comes by itself while I am logged in"): a 401 used to
      // sign the person out at once, even when only this access token had run out (a phone clock
      // a few minutes off, a request sent just as the 30 minutes ended). Now the token is renewed
      // once and the request sent again; only when renewing fails is the person signed out.
      const isAuthCall = /\/auth\//.test(String(config?.url || ''));
      // The server's own word that the session is over (revoked, expired, role changed) still
      // signs out at once; only a plain "token not accepted" is renewed and tried again.
      const definitive = /^ROLE_/.test(responseCode(error) || '');
      if (!config.__retriedAfterRenew && !isAuthCall && !definitive) {
        return renewAccessTokenIfNeeded(true)
          .then(() => {
            const { token } = getTokenSnapshot();
            if (!token || token === config.__authToken) throw error;
            const again = { ...config, __retriedAfterRenew: true, signal: undefined };
            again.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
            return api.request(again);
          })
          .catch((renewError) => {
            if (renewError === error || renewError?.response?.status === 401 || renewError?.response?.status === 403) {
              signedOut(responseCode(error) || 'AUTHENTICATION_FAILED', config);
            }
            return Promise.reject(error);
          });
      }
      signedOut(responseCode(error) || 'AUTHENTICATION_FAILED', config);
    }
    return Promise.reject(error);
  }
);

export default api;
