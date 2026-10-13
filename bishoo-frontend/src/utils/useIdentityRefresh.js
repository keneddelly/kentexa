import { useEffect } from 'react';
import api from '../api/api';

// Keeps a page's copy of the ID status (GET /identity/me) fresh (owner
// 2026-10-13: a verified person was still asked because the app read the
// status once at login and never again). It re-reads the status:
//   - right after "Tuma kitambulisho" succeeded (VerifyIdentityModal),
//   - when the server says an ID is needed (403 VERIFICATION_* in api.js),
//   - when the person comes back to the app (tab visible again / focus),
//     at most once every 15 seconds.
export const IDENTITY_CHANGED = 'kentexa:identity-changed';
const MIN_GAP_MS = 15_000;

/** Tell every open page that the ID status may have changed. */
export function announceIdentityChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(IDENTITY_CHANGED));
}

export default function useIdentityRefresh(setIdentityStatus, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let last = 0;
    let alive = true;
    const refresh = (force) => {
      const now = Date.now();
      if (!force && now - last < MIN_GAP_MS) return;
      last = now;
      api.get('/identity/me').then((r) => { if (alive && r?.data) setIdentityStatus(r.data); }).catch(() => {});
    };
    const onChanged = () => refresh(true);
    const onBack = () => { if (document.visibilityState === 'visible') refresh(false); };
    window.addEventListener(IDENTITY_CHANGED, onChanged);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      alive = false;
      window.removeEventListener(IDENTITY_CHANGED, onChanged);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [setIdentityStatus, enabled]);
}
