/**
 * One install entry point for Android browser prompts and iOS instructions.
 * Push subscriptions remain a separate, user-initiated action.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccessToken } from '../../api/tokenStore';


// ── Push notification subscription ────────────────────────────────────────
export const subscribeToPush = async (apiBase = '') => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const res = await fetch(`${apiBase}/notifications/push/vapid-key`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    if (!publicKey) return null;

    // Convert VAPID key
    const urlBase64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    };

    // Subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Save to server
    const subObj = subscription.toJSON();
    await fetch(`${apiBase}/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        endpoint:  subObj.endpoint,
        keys:      subObj.keys,
        userAgent: navigator.userAgent,
      }),
    });

    console.log('✅ Push subscription saved');
    return subscription;
  } catch (err) {
    console.warn('Push subscription failed:', err);
    return null;
  }
};

export const detectInstallEnvironment = (nav = navigator, win = window) => {
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const mobile = ios || /Android/i.test(ua);
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  const standalone = Boolean(nav.standalone) || Boolean(win.matchMedia?.('(display-mode: standalone)').matches);
  return { ios, mobile, safari, standalone };
};

const DISMISS_KEY = 'kx_pwa_dismissed';
const dismissedRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY)) < 7 * 86400000; }
  catch { return false; }
};

export const usePWA = () => {
  const [environment] = useState(detectInstallEnvironment);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(environment.standalone);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!environment.mobile || isInstalled) return;
    const onPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
      setShowGuide(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Show only after the user has had time to browse; App limits this
    // suggestion to Home and keeps registration, login and role flows clear.
    const timer = dismissedRecently() ? null : window.setTimeout(() => setShowInstallPrompt(true), 20000);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, [environment.mobile, isInstalled]);

  const handleInstall = async () => {
    if (isInstalled || !environment.mobile) return;
    setShowInstallPrompt(false);
    if (!deferredPrompt) {
      setShowGuide(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'dismissed') handleDismiss();
    } catch { setShowGuide(true); }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setShowInstallPrompt(false);
    setShowGuide(false);
  };

  return { showInstallPrompt, showGuide, handleInstall, handleDismiss,
    closeGuide: () => setShowGuide(false), isInstalled, canInstall: environment.mobile && !isInstalled,
    environment };
};

export const InstallBanner = ({ onInstall, onDismiss }) => {
  const { t } = useTranslation();
  return (
  <div role="complementary" aria-label={t('install_kentexa.title')} style={{
    position: 'fixed', bottom: 76, left: 16, right: 16, maxWidth: 440, margin: '0 auto', zIndex: 9000,
    background: '#0f172a', borderRadius: 16, padding: 14,
    boxShadow: '0 8px 30px rgba(0,0,0,0.24)', display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <img src="/logo192.png" alt="" width="40" height="40" style={{ borderRadius: 10 }} />
    <div style={{ flex: 1, color: '#fff', minWidth: 0 }}>
      <strong style={{ fontSize: 13 }}>{t('install_kentexa.title')}</strong>
      <div style={{ fontSize: 11, marginTop: 3, opacity: 0.8 }}>{t('install_kentexa.subtitle')}</div>
    </div>
    <button onClick={onInstall} style={{ background: '#2563eb', color: '#fff', border: 0,
      borderRadius: 8, padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }}>{t('install_kentexa.action')}</button>
    <button onClick={onDismiss} aria-label={t('install_kentexa.later')} style={{ background: 'none', color: '#fff',
      border: 0, fontSize: 20, cursor: 'pointer' }}>×</button>
  </div>
  );
};

export const InstallGuide = ({ environment, onClose }) => {
  const { t } = useTranslation();
  const instructions = environment.ios
    ? environment.safari
      ? t('install_kentexa.ios_safari')
      : t('install_kentexa.ios_other')
    : t('install_kentexa.android_other');
  return (
    <div role="dialog" aria-modal="true" aria-label={t('install_kentexa.title')} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,23,42,.65)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', padding: 24,
        borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 440 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>{t('install_kentexa.title')}</h2>
        <p style={{ lineHeight: 1.5, color: '#475569' }}>{instructions}</p>
        {environment.ios && <p style={{ color: '#475569', fontSize: 13 }}>{t('install_kentexa.ios_login_note')}</p>}
        <button onClick={onClose} style={{ width: '100%', padding: 12, border: 0, borderRadius: 9,
          background: '#2563eb', color: '#fff', fontWeight: 700 }}>{t('install_kentexa.done')}</button>
      </div>
    </div>
  );
};

export default usePWA;
