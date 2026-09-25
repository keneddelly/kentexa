import axios from 'axios';
import { getTokenSnapshot, setAccessToken } from './tokenStore';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://api.kentexa.com',
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
export const renewAccessTokenIfNeeded = async () => {
  const token = getTokenSnapshot().token;
  if (!token || !expiringSoon(token)) return;
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
  return config;
});

api.interceptors.response.use(
  (response) => {
    finishRequest(response.config);
    if (isStale(response.config)) return Promise.reject(new StaleContextResponseError());
    return response;
  },
  (error) => {
    const config = error.config;
    finishRequest(config);
    // A revoked response from an old token/epoch is stale evidence and must
    // never clear a newer context established while the request was in flight.
    if (isStale(config)) return Promise.reject(new StaleContextResponseError());
    if (error?.response?.status === 401 && config?.__authenticatedRequest) {
      onCurrentContextRevoked(responseCode(error) || 'AUTHENTICATION_FAILED');
    }
    return Promise.reject(error);
  }
);

export default api;
