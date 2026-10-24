// New-version check (owner, 2026-10-12): a phone keeps an open app or tab
// alive in memory for days, so it can run an old website long after a deploy.
// The running page knows its own code file (/static/js/main.<hash>.js); a
// fresh copy of the front page names the newest one. Different = new version.

const MAIN_BUNDLE = /\/static\/js\/main\.[0-9a-f]+\.js/;

/** "/static/js/main.2af576c6.js" from HTML text, or null. */
export function mainBundleIn(html) {
  const m = String(html || '').match(MAIN_BUNDLE);
  return m ? m[0] : null;
}

/** The code file this page is running, or null (e.g. local development). */
export function runningMainBundle(doc = document) {
  const scripts = Array.from(doc.querySelectorAll('script[src]'));
  for (const s of scripts) {
    const m = String(s.getAttribute('src') || '').match(MAIN_BUNDLE);
    if (m) return m[0];
  }
  return null;
}

/** Ask the site for its newest code file name. Never throws; null when unknown. */
export async function fetchLatestMainBundle(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`/?version-check=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    return mainBundleIn(await res.text());
  } catch {
    return null;
  }
}

/** True when a different, newer code file is published than the one running. */
export function isNewVersion(running, latest) {
  return Boolean(running && latest && running !== latest);
}

const TEXT_LIKE = new Set(['', 'text', 'search', 'tel', 'number', 'email', 'url', 'password', 'date', 'time', 'datetime-local']);

/**
 * Safe to reload = nothing would be lost: no visible text field has anything
 * typed in it, and no screen is marked data-keep-open (e.g. the walk-in
 * receipt while it shows the one-time claim code).
 */
export function isSafeToReload(doc = document) {
  if (doc.querySelector('[data-keep-open]')) return false;
  const fields = doc.querySelectorAll('input, textarea, select');
  for (const el of fields) {
    if (el.disabled || el.readOnly || el.closest('[data-reload-safe]')) continue;
    if (el.tagName === 'INPUT' && !TEXT_LIKE.has(String(el.type || '').toLowerCase())) continue;
    if (el.tagName === 'SELECT') continue; // a choice alone is not lost work
    // Any text field with something in it blocks — on screen or not (cautious on purpose).
    if (String(el.value || '').trim() !== '') return false;
  }
  return true;
}

// ── Automatic update without a tap (owner, 2026-10-24) ──────────────────────
// The page is reloaded by itself, so it must come back on the same screen:
// just before the reload the open page is kept for this tab only, and the
// fresh copy opens it again (within 2 minutes, same role).

const RESUME_KEY = 'kentexa_update_resume';
const TRIED_KEY = 'kentexa_update_tried';
export const RESUME_MAX_AGE_MS = 2 * 60 * 1000;

function tabStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

/** Keep the open page for the fresh copy. Never throws. */
export function rememberPageForUpdate({ page, navParams = null, roleType = null }, storage = tabStorage(), now = Date.now()) {
  if (!storage || typeof page !== 'string' || !page) return false;
  try {
    let params = null;
    try { params = navParams == null ? null : JSON.parse(JSON.stringify(navParams)); } catch { return false; }
    storage.setItem(RESUME_KEY, JSON.stringify({ page, navParams: params, roleType: roleType || null, at: now }));
    return true;
  } catch { return false; }
}

/** The page to reopen after an automatic update, once; null when none or too old. */
export function takeResumePage(storage = tabStorage(), now = Date.now()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RESUME_KEY);
    storage.removeItem(RESUME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.page !== 'string' || !saved.page) return null;
    if (!(now - Number(saved.at) >= 0 && now - Number(saved.at) <= RESUME_MAX_AGE_MS)) return null;
    return { page: saved.page, navParams: saved.navParams ?? null, roleType: saved.roleType || null };
  } catch { return null; }
}

/**
 * A reload is tried once per new version. If the site still gives the old code
 * afterwards (a cache on the way), the page does not reload again and again.
 */
export function alreadyTriedUpdate(latest, storage = tabStorage()) {
  try { return !!latest && storage?.getItem(TRIED_KEY) === latest; } catch { return false; }
}
export function markUpdateTried(latest, storage = tabStorage()) {
  try { storage?.setItem(TRIED_KEY, latest); } catch { /* private mode: still reloads */ }
}
