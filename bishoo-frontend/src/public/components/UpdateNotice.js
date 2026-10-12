import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchLatestMainBundle, isNewVersion, isSafeToReload, runningMainBundle,
} from '../../utils/appVersion';

// Every phone gets a new website version by itself (owner, 2026-10-12).
// Checks when the app comes back to the screen, on focus and every 15 minutes.
// Reloads by itself ONLY when nothing would be lost (no typed text, no
// data-keep-open screen) AND the person just came back or has not touched the
// screen for 5 minutes. Otherwise a banner: "Toleo jipya — gusa kusasisha".
// Never reloads in the middle of a form.
export const CHECK_EVERY_MS = 15 * 60 * 1000;
export const IDLE_MS = 5 * 60 * 1000;

export default function UpdateNotice({
  doc = typeof document !== 'undefined' ? document : null,
  fetchLatest = fetchLatestMainBundle,
  reload = () => window.location.reload(),
  now = () => Date.now(),
}) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const running = useRef(doc ? runningMainBundle(doc) : null);
  const lastActivity = useRef(now());
  const checking = useRef(false);

  const tryReload = useCallback((force = false) => {
    if (force || (doc && isSafeToReload(doc))) { reload(); return true; }
    return false;
  }, [doc, reload]);

  const check = useCallback(async (reason) => {
    if (!running.current || checking.current) return; // local development: nothing to compare
    checking.current = true;
    try {
      const latest = await fetchLatest();
      if (!isNewVersion(running.current, latest)) return;
      setAvailable(true);
      const idle = now() - lastActivity.current >= IDLE_MS;
      if (reason === 'resume' || idle) tryReload();
    } finally {
      checking.current = false;
    }
  }, [fetchLatest, now, tryReload]);

  useEffect(() => {
    if (!doc || !running.current) return undefined;
    const onVisible = () => { if (doc.visibilityState === 'visible') check('resume'); };
    const onFocus = () => check('focus');
    const onActivity = () => { lastActivity.current = now(); };
    const timer = setInterval(() => {
      if (doc.visibilityState !== 'hidden') check('timer');
    }, CHECK_EVERY_MS);
    doc.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((e) => doc.addEventListener(e, onActivity, true));
    return () => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((e) => doc.removeEventListener(e, onActivity, true));
    };
  }, [doc, check, now]);

  // While the banner shows, keep trying quietly once the person is idle and nothing is open.
  useEffect(() => {
    if (!available) return undefined;
    const timer = setInterval(() => {
      if (now() - lastActivity.current >= IDLE_MS) tryReload();
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [available, now, tryReload]);

  if (!available) return null;
  return (
    <div role="status" data-reload-safe
      style={{ position: 'fixed', left: 12, right: 12, top: 12, zIndex: 10000, maxWidth: 480, margin: '0 auto',
        background: '#1d4ed8', color: '#fff', borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)', fontSize: 14, fontWeight: 700 }}>
      <button type="button" onClick={() => { if (!tryReload()) setBlocked(true); }}
        style={{ background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
          cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}>
        🔄 {t('app_update.available', 'Toleo jipya la KenteXa — gusa kusasisha')}
      </button>
      {blocked && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>
          {t('app_update.finish_first', 'Maliza kazi uliyonayo kwanza (kuna maandishi kwenye fomu).')}{' '}
          <button type="button" onClick={() => tryReload(true)}
            style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline',
              fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}>
            {t('app_update.update_anyway', 'Sasisha hata hivyo')}
          </button>
        </div>
      )}
    </div>
  );
}
