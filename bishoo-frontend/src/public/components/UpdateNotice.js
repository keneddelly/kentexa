import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  alreadyTriedUpdate, fetchLatestMainBundle, isNewVersion, isSafeToReload, markUpdateTried, runningMainBundle,
} from '../../utils/appVersion';

// A new KenteXa version is put on every phone by itself, no tap needed
// (owner, 2026-10-12; automatic since 2026-10-24).
// Looks for a new version every 2 minutes, when the app comes back to the screen
// and on focus. When there is one, the page reloads by itself at the first safe
// moment and opens the same screen again (App keeps it through `beforeReload`):
//   - the app comes back to the screen, or
//   - the person opens another screen, or
//   - nobody has touched the screen for 20 seconds.
// Safe = nothing typed in a form and no data-keep-open screen (the one-time claim
// code). Never reloads in the middle of a form: only then a small note shows,
// and it updates by itself once the form is done.
export const CHECK_EVERY_MS = 2 * 60 * 1000;
export const QUIET_MS = 20 * 1000;
export const RETRY_EVERY_MS = 10 * 1000;

export default function UpdateNotice({
  page = null,
  beforeReload = () => {},
  doc = typeof document !== 'undefined' ? document : null,
  fetchLatest = fetchLatestMainBundle,
  reload = () => window.location.reload(),
  now = () => Date.now(),
}) {
  const { t } = useTranslation();
  const [latest, setLatest] = useState(null); // the new code file, once found
  const [waitingForForm, setWaitingForForm] = useState(false);
  const running = useRef(doc ? runningMainBundle(doc) : null);
  const lastActivity = useRef(now());
  const checking = useRef(false);
  const reloading = useRef(false);
  const firstPage = useRef(true);
  // Latest values without restarting the timers on every App render.
  const beforeReloadRef = useRef(beforeReload);
  beforeReloadRef.current = beforeReload;
  const nowRef = useRef(now);
  nowRef.current = now;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const doReload = useCallback((version) => {
    if (reloading.current) return;
    reloading.current = true;
    markUpdateTried(version);
    try { beforeReloadRef.current(); } catch { /* the update matters more than the page */ }
    reloadRef.current();
  }, []);

  /** Reloads when nothing would be lost; true when it did. */
  const tryReload = useCallback((version) => {
    if (!version || !doc) return false;
    if (!isSafeToReload(doc)) { setWaitingForForm(true); return false; }
    doReload(version);
    return true;
  }, [doc, doReload]);

  const check = useCallback(async (reason) => {
    if (!running.current || checking.current || reloading.current) return; // local development: nothing to compare
    checking.current = true;
    try {
      const found = await fetchLatest();
      if (!isNewVersion(running.current, found) || alreadyTriedUpdate(found)) return;
      setLatest(found);
      const quiet = nowRef.current() - lastActivity.current >= QUIET_MS;
      if (reason === 'resume' || quiet) tryReload(found);
    } finally {
      checking.current = false;
    }
  }, [fetchLatest, tryReload]);

  useEffect(() => {
    if (!doc || !running.current) return undefined;
    const onVisible = () => { if (doc.visibilityState === 'visible') check('resume'); };
    const onFocus = () => check('focus');
    const onActivity = () => { lastActivity.current = nowRef.current(); };
    const timer = setInterval(() => {
      if (doc.visibilityState !== 'hidden') check('timer');
    }, CHECK_EVERY_MS);
    doc.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    ['pointerdown', 'keydown', 'input', 'touchstart', 'scroll'].forEach((e) => doc.addEventListener(e, onActivity, true));
    return () => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      ['pointerdown', 'keydown', 'input', 'touchstart', 'scroll'].forEach((e) => doc.removeEventListener(e, onActivity, true));
    };
  }, [doc, check]);

  // Opening another screen is the best moment: the new screen comes back fresh.
  useEffect(() => {
    if (firstPage.current) { firstPage.current = false; return; }
    if (latest) tryReload(latest);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Found but not yet done: keep trying quietly, and stop waiting once the form is empty.
  useEffect(() => {
    if (!latest) return undefined;
    const timer = setInterval(() => {
      if (doc?.visibilityState === 'hidden') return;
      if (nowRef.current() - lastActivity.current >= QUIET_MS) tryReload(latest);
      else if (doc && isSafeToReload(doc)) setWaitingForForm(false);
    }, RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [latest, doc, tryReload]);

  if (!latest || !waitingForForm) return null;
  return (
    <div role="status" data-reload-safe
      style={{ position: 'fixed', left: 12, right: 12, top: 12, zIndex: 10000, maxWidth: 480, margin: '0 auto',
        background: '#1d4ed8', color: '#fff', borderRadius: 12, padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
      🔄 {t('app_update.after_form', 'Toleo jipya la KenteXa litawekwa lenyewe ukimaliza fomu hii.')}{' '}
      <button type="button" onClick={() => doReload(latest)}
        style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline',
          fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        {t('app_update.update_now', 'Sasisha sasa')}
      </button>
    </div>
  );
}
