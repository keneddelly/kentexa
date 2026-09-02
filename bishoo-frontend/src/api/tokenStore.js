const TOKEN_KEY = 'token';

let generation = 0;
const listeners = new Set();

const notify = () => {
  const snapshot = getTokenSnapshot();
  listeners.forEach((listener) => listener(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kentexa-auth-changed', { detail: snapshot }));
  }
};

export const getAccessToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const getTokenSnapshot = () => ({ token: getAccessToken(), generation });

export const setAccessToken = (token) => {
  if (!token || typeof token !== 'string') throw new Error('INVALID_ACCESS_TOKEN');
  localStorage.setItem(TOKEN_KEY, token);
  // Remove the abandoned second token authority. Push now reads this store.
  localStorage.removeItem('kentexa_token');
  generation += 1;
  notify();
  return getTokenSnapshot();
};

export const clearAccessToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('kentexa_token');
  generation += 1;
  notify();
  return getTokenSnapshot();
};

export const subscribeToken = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const __resetTokenStoreForTests = () => {
  generation = 0;
  listeners.clear();
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('kentexa_token');
  } catch { /* test environment without storage */ }
};
