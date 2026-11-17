/**
 * Campaign/acquisition intent (Landing Localization L1, §10-12) — carries
 * WHY a visitor arrived (?intent=service|classified|seller) independently
 * of language, from the Ad link through Landing -> Signup/Login -> the
 * first post-auth destination.
 *
 * Deliberately sessionStorage, not localStorage: this is acquisition/session
 * journey context, not identity or a permanent account preference. It must
 * never outlive the browsing session it arrived in, and is consumed (read +
 * cleared) once App.js's handleLoginSuccess uses it to pick a post-auth
 * destination — see consumeIntent(). A soft TTL on top of that guards the
 * case where a tab stays open for days without ever completing auth.
 */

// Owner 2026-11-17: ad links for every kind of work (kentexa.com/?intent=office ...).
export const ALLOWED_INTENTS = ['service', 'classified', 'seller', 'buyer', 'ship', 'office', 'agent', 'business', 'writer'];

// Where each intent lands the visitor once they're authenticated — mirrors
// the existing `kentexa_after_login` precedent (App.js), just sourced from
// acquisition intent instead of an in-app pre-login click. Only maps to
// real existing PUBLIC/ACCOUNT destinations already registered in
// navigation/destinationRegistry.js.
export const INTENT_DESTINATIONS = {
  service: 'PostService',
  classified: 'CreateClassified',
  seller: 'BecomeSeller',
  buyer: 'Discover',
  ship: 'SendShipment',
  office: 'BecomeSuperAgentInfo',
  agent: 'BecomeAgent',
  business: 'BecomeBusiness',
  // Writers programme (#417): Home, with the Makala editor opened over it (App.js).
  writer: 'Home',
};

const STORAGE_KEY = 'kentexa_intent';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — well inside one sessionStorage lifetime, guards a long-lived pinned tab

export const normalizeIntent = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return ALLOWED_INTENTS.includes(value) ? value : null;
};

export const destinationForIntent = (intent) => INTENT_DESTINATIONS[normalizeIntent(intent)] || null;

// Validates against the allowlist and persists for the rest of this browser
// session. An invalid/unknown value is ignored (never becomes a navigation
// destination) — returns null so callers can tell nothing was stored.
export const setIntent = (raw) => {
  const value = normalizeIntent(raw);
  if (!value) return null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ value, ts: Date.now() }));
  } catch { /* storage unavailable */ }
  return value;
};

// Non-destructive read — safe to call from render (e.g. Welcome.js customizing
// hero copy) without consuming the intent before the visitor actually acts on it.
export const getIntent = () => {
  let raw;
  try { raw = sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const { value, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL_MS) {
      clearIntent();
      return null;
    }
    return normalizeIntent(value);
  } catch {
    clearIntent();
    return null;
  }
};

export const clearIntent = () => {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
};

// Read once and clear — the defined consumption point (App.js's
// handleLoginSuccess, immediately after a successful auth) so a stale
// intent can never leak into a later, unrelated destination decision.
export const consumeIntent = () => {
  const value = getIntent();
  clearIntent();
  return value;
};

// Pure — parses `?intent=` out of a location.search string without touching
// storage, so the URL-reading half of "extend the cold-boot parsing" is
// unit-testable on its own.
export const intentFromSearch = (search) => normalizeIntent(new URLSearchParams(search || '').get('intent'));

// Captures ?intent= synchronously at module load — this file is imported
// (transitively, via Welcome.js) before ReactDOM ever renders anything, same
// timing i18n.js relies on for ?lang=. This is load-bearing, not
// belt-and-suspenders: Welcome.js reads getIntent() synchronously during its
// own first render to choose which hero copy to show, and sessionStorage
// isn't reactive — writing to it later (e.g. from a post-mount effect) would
// never trigger a re-render, so the intent-scoped copy would silently never
// appear on cold entry. Found via local browser acceptance testing
// (Landing Localization L1 acceptance pass) — every ?lang=X&intent=Y
// combination rendered the default (non-intent) hero on first load until
// this moved from a React effect to here.
try {
  const fromUrl = intentFromSearch(window.location.search);
  if (fromUrl) setIntent(fromUrl);
} catch { /* no window — SSR */ }

// Writers programme (#417 step B): an invitation link carries ?wref=<token> (the /waandishi/ page
// passes it on). Kept until the person signs in, then sent once so the invitation counts as joined.
const WRITER_REF_KEY = 'kentexa_writer_ref';
export const writerRefFromSearch = (search) => {
  const v = new URLSearchParams(search || '').get('wref') || '';
  return /^[a-f0-9]{20,40}$/.test(v) ? v : null;
};
export const takeWriterRef = () => {
  try {
    const v = window.localStorage.getItem(WRITER_REF_KEY);
    window.localStorage.removeItem(WRITER_REF_KEY);
    return v && /^[a-f0-9]{20,40}$/.test(v) ? v : null;
  } catch { return null; }
};
try {
  const ref = writerRefFromSearch(window.location.search);
  if (ref) window.localStorage.setItem(WRITER_REF_KEY, ref);
} catch { /* no window or storage off */ }
