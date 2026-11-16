// Viral engine A2 (owner approved 2026-11-16, issue #381): short share links, kentexa.com/s/<code>.
import api from '../../api/api';
import { API_BASE_URL } from '../../api/baseUrl';

const SHORT_PATH = /^\/s\/([A-Za-z0-9]{5,12})\/?$/;
const TARGET = /^\/(post|community)\/\d+$/;
const KEY = 'kx_share'; // the code a visitor came in with, for counting (kept 7 days)
const KEEP_MS = 7 * 24 * 3600 * 1000;

// Phones only open their share sheet straight after a tap, so a link is made a moment earlier
// (when the finger touches the button) and kept here; the tap then uses it without waiting.
const cache = new Map();
const keyOf = (t, id, ch) => `${t}:${id}:${ch}`;

/** Start making the link now (finger down on Shiriki, or a page that will be shared). */
export const prefetchShortLink = (contentType, contentId, channel = 'native') => {
  const k = keyOf(contentType, contentId, channel);
  if (!cache.has(k)) {
    cache.set(k, Promise.resolve()
      .then(() => api.post('/share-links', { contentType, contentId, channel }))
      .then((r) => { const url = r?.data?.url || null; cache.set(k, url); return url; })
      .catch(() => { cache.set(k, null); return null; }));
  }
};

/** The link if it is ready; null while it is still being made (or not shareable outside). */
export const readyShortLink = (contentType, contentId, channel = 'native') => {
  const v = cache.get(keyOf(contentType, contentId, channel));
  return typeof v === 'string' ? v : null;
};

/** Make (or reuse) a short link for a post or community. Falls back to the plain address. */
export const shortLinkFor = async (contentType, contentId, channel, fallbackUrl) => {
  try {
    const r = await api.post('/share-links', { contentType, contentId, channel });
    return r?.data?.url || fallbackUrl;
  } catch {
    return fallbackUrl; // not shareable outside (members only) or offline: the normal address
  }
};

/** The code a visitor arrived with, if still fresh. */
export const arrivalShareCode = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return v && Date.now() - Number(v.at) < KEEP_MS ? v.code : null;
  } catch { return null; }
};

const remember = (code) => {
  try { window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage off */ }
};

// A random key for this browser tab, so one open is counted once (no personal data).
const sessionKey = () => {
  try {
    let k = window.sessionStorage.getItem('kx_sk');
    if (!k) {
      const bytes = new Uint8Array(12);
      (window.crypto || {}).getRandomValues?.(bytes);
      k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || String(Date.now());
      window.sessionStorage.setItem('kx_sk', k);
    }
    return k;
  } catch { return null; }
};

/** Viral engine B8: count this open (once per tab; the sharer's own opens are left out by the server). */
const recordVisit = (code) => {
  const key = sessionKey();
  if (!key) return;
  Promise.resolve().then(() => api.post(`/share-links/${encodeURIComponent(code)}/visit`, { sessionKey: key })).catch(() => {});
};

/**
 * B8: after signing in, a new account that arrived through a short link is linked to it (the
 * server accepts only accounts created in the last 24 hours). The code is used once.
 */
export const claimArrival = () => {
  const code = arrivalShareCode();
  if (!code) return;
  try { window.localStorage.removeItem(KEY); } catch { /* storage off */ }
  Promise.resolve().then(() => api.post(`/share-links/${encodeURIComponent(code)}/claim`)).catch(() => {});
};

/**
 * Opened at /s/<code>: replace the address with the page it points to before the app starts, so
 * the app opens that discussion or community. The server already wrote the page into the HTML
 * (<meta name="kx-target">); without it, ask the server once.
 */
export const openShortLinkIfAny = async () => {
  if (typeof window === 'undefined') return;
  const m = window.location.pathname.match(SHORT_PATH);
  if (!m) return;
  const code = m[1];
  remember(code);
  recordVisit(code);
  let target = document.querySelector('meta[name="kx-target"]')?.getAttribute('content') || '';
  if (!TARGET.test(target)) {
    try {
      const res = await fetch(`${API_BASE_URL}/share-links/${encodeURIComponent(code)}`, { credentials: 'omit' });
      const data = res.ok ? await res.json() : null;
      target = data?.path || '';
    } catch { target = ''; }
  }
  try { window.history.replaceState(window.history.state, '', TARGET.test(target) ? target : '/'); } catch { /* history off */ }
};
