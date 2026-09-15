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

export const ALLOWED_INTENTS = ['service', 'classified', 'seller'];

// Where each intent lands the visitor once they're authenticated — mirrors
// the existing `kentexa_after_login` precedent (App.js), just sourced from
// acquisition intent instead of an in-app pre-login click. Only maps to
// real existing PUBLIC/ACCOUNT destinations already registered in
// navigation/destinationRegistry.js.
export const INTENT_DESTINATIONS = {
  service: 'PostService',
  classified: 'CreateClassified',
  seller: 'BecomeSeller',
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
