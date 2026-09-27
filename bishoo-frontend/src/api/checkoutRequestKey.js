import { getAccessToken } from './tokenStore';

const accountId = () => {
  try { return JSON.parse(atob(getAccessToken().split('.')[1])).sub; }
  catch { return 'guest'; }
};

const storageKey = (productId) => `kentexa_checkout_request_${accountId()}_${productId}`;
const volatileKeys = new Map();

export function getCheckoutRequestKey(productId) {
  const key = storageKey(productId);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.requestKey) return saved.requestKey;
  } catch { /* Keep the key for this page session if storage is blocked. */ }
  if (volatileKeys.has(key)) return volatileKeys.get(key);
  const requestKey = window.crypto.randomUUID();
  volatileKeys.set(key, requestKey);
  try { localStorage.setItem(key, JSON.stringify({ requestKey })); }
  catch { /* The request can still proceed; durable retry needs storage. */ }
  return requestKey;
}

export function clearCheckoutRequestKey(productId) {
  const key = storageKey(productId);
  volatileKeys.delete(key);
  try { localStorage.removeItem(key); } catch { /* no-op */ }
}
