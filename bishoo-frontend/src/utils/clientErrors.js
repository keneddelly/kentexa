// Page error reports (owner approved 2026-11-15): when a page fails on someone's phone, the site
// sends a short report (which page, what error, which browser) so we see it ourselves.
// Never sends the address's query (it can hold private order links) or anything typed.
// Plain fetch, not the api client: a report must not depend on the code that may have failed.
import { API_BASE_URL } from '../api/baseUrl';
import { getAccessToken } from '../api/tokenStore';
import { runningMainBundle } from './appVersion';

const MAX_PER_VISIT = 10;
let sent = 0;
const seen = new Set();

const appMode = () => {
  try {
    if (/[?&]source=android\b/.test(window.location.search) || window.sessionStorage.getItem('kx_android_app') === '1') return 'android_app';
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  } catch { /* storage or matchMedia blocked */ }
  return 'web';
};

/** Send one report. Never throws; repeats of the same error in one visit are sent once. */
export function reportClientError({ kind, page = null, error = null, message = null }) {
  try {
    const msg = String(message || error?.message || error || 'Unknown error').slice(0, 300);
    const key = `${kind}|${page}|${msg}`;
    if (seen.has(key) || sent >= MAX_PER_VISIT) return;
    seen.add(key);
    sent += 1;
    const body = JSON.stringify({
      kind,
      page: page ? String(page).slice(0, 80) : null,
      path: window.location.pathname,
      message: msg,
      stack: error?.stack ? String(error.stack).slice(0, 1500) : null,
      appMode: appMode(),
      appVersion: runningMainBundle()?.replace(/^.*main\.|\.js$/g, '') || null,
    });
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (typeof fetch !== 'function') return;
    fetch(`${API_BASE_URL}/client-errors`, { method: 'POST', headers, body, keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch { /* reporting must never cause a second failure */ }
}

export const __resetClientErrorsForTests = () => { sent = 0; seen.clear(); };
