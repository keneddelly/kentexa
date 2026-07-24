/**
 * usePWA.js — PWA install prompt hook
 * Place at: src/public/hooks/usePWA.js
 *
 * Usage in App.js:
 *   const { showInstallPrompt, handleInstall, handleDismiss } = usePWA();
 *   {showInstallPrompt && <InstallBanner onInstall={handleInstall} onDismiss={handleDismiss} />}
 */
import { useState, useEffect } from 'react';


// ── Push notification subscription ────────────────────────────────────────
export const subscribeToPush = async (apiBase = '') => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const res = await fetch(`${apiBase}/notifications/push/vapid-key`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('kentexa_token')}` },
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
        Authorization: `Bearer ${localStorage.getItem('kentexa_token')}`,
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

export const usePWA = () => {
  const [deferredPrompt,    setDeferredPrompt]    = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled,       setIsInstalled]       = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // Dismissed within last 7 days
    const dismissed = localStorage.getItem('kx_pwa_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 86400000) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show after 30 seconds of use or on 2nd visit
      const visits = Number(localStorage.getItem('kx_visits') || 0) + 1;
      localStorage.setItem('kx_visits', String(visits));
      if (visits >= 2) {
        setTimeout(() => setShowInstallPrompt(true), 5000);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('kx_pwa_dismissed', String(Date.now()));
    setShowInstallPrompt(false);
  };

  return { showInstallPrompt, handleInstall, handleDismiss, isInstalled };
};

// ── Install Banner Component ──────────────────────────────────────────────────
export const InstallBanner = ({ onInstall, onDismiss }) => (
  <div style={{
    position: 'fixed', bottom: 70, left: 16, right: 16, zIndex: 9000,
    backgroundColor: '#0f172a', borderRadius: 16,
    padding: '14px 16px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
    display: 'flex', alignItems: 'center', gap: 14,
    animation: 'slideUp 0.3s ease',
  }}>
    <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
    <div style={{ fontSize: 32 }}>📦</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 2 }}>
        Pakua App ya KenteXa
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
        Haraka zaidi · Inafanya kazi bila intaneti · Bila App Store
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={onInstall}
        style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
          padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        📲 Pakua
      </button>
      <button onClick={onDismiss}
        style={{ background: 'none', color: 'rgba(255,255,255,0.5)', border: 'none',
          padding: '4px 0', cursor: 'pointer', fontSize: 11 }}>
        Baadaye
      </button>
    </div>
  </div>
);

export default usePWA;