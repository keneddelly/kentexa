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
