/**
 * AppPushCard.js — "Washa arifa" card.
 * - variant "float" (default): the small card inside the KenteXa Google Play app (owner 2026-11-10).
 * - variant "banner": a large card at the top of Home for signed-in web users (owner choice 2026-11-27),
 *   so people can see it. Not shown inside the Android app, which uses the float card.
 * The tap asks the browser or phone's own permission. "Baadaye" hides it for 3 days (both variants).
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { enablePushNotifications, getPushNotificationState, detectInstallEnvironment } from '../hooks/usePWA';

const LATER_KEY = 'kx_app_push_later';
const laterRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 3 * 86400000; } catch { return false; }
};
const signedIn = () => {
  try { return !!localStorage.getItem('kentexa_user'); } catch { return false; }
};
const onAndroidApp = () => {
  try { return !!detectInstallEnvironment().androidApp; } catch { return false; }
};

// allowDenied: the Android app can send people to its own settings; on the web a blocked browser cannot be fixed here.
export default function AppPushCard({ allowDenied = true, variant = 'float' } = {}) {
  const [key, setKey] = useState('');
  const [state, setState] = useState('');
  const [hidden, setHidden] = useState(laterRecently);
  const banner = variant === 'banner';

  useEffect(() => {
    if (hidden) return undefined;
    if (banner && (!signedIn() || onAndroidApp())) return undefined;
    let live = true;
    Promise.resolve(api.get('/notifications/push/vapid-key')).then((r) => {
      const k = r?.data?.publicKey || '';
      if (!live || !k) return;
      setKey(k);
      getPushNotificationState().then((st) => { if (live) setState(st); }).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, [hidden, banner]);

  if (hidden || !key || (state !== 'off' && !(state === 'denied' && allowDenied))) return null;
  if (banner && onAndroidApp()) return null;
  const later = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* storage blocked */ } setHidden(true); };

  if (banner) {
    return (
      <div data-testid="app-push-card" data-variant="banner" role="status" style={{
        margin: '12px 16px 4px', padding: 18, borderRadius: 18, background: '#1d4ed8', color: '#fff',
        boxShadow: '0 6px 20px rgba(29,78,216,0.25)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: 30 }}>🔔</span>
          <strong style={{ fontSize: 18, lineHeight: 1.3 }}>Washa arifa za KenteXa</strong>
        </div>
        <span style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.95 }}>
          {state === 'denied'
            ? 'Arifa zimezuiwa kwenye kivinjari hiki. Ruhusu KenteXa kwenye mipangilio ya kivinjari.'
            : 'Pata habari za oda, ujumbe, kazi na faida za Uza tena papo hapo.'}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          {state === 'off' && (
            <button type="button" data-testid="app-push-on" onClick={async () => setState(await enablePushNotifications(key))}
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 22, border: 'none', background: '#fff', color: '#1d4ed8', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              Washa arifa
            </button>
          )}
          <button type="button" data-testid="app-push-later" onClick={later}
            style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, border: '1px solid rgba(255,255,255,0.6)', background: 'transparent', color: '#fff', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            Baadaye
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="app-push-card" role="status" style={{
      position: 'fixed', bottom: 76, left: 16, right: 16, maxWidth: 440, margin: '0 auto', zIndex: 9000,
      background: '#0f172a', color: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.24)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <strong style={{ fontSize: 14 }}>Washa arifa za KenteXa</strong>
      <span style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.45 }}>
        {state === 'denied'
          ? 'Arifa zimezuiwa. Fungua Mipangilio ya simu, Programu, KenteXa, Arifa, kisha ruhusu.'
          : 'Pata habari za oda, ujumbe, kazi na faida za Uza tena papo hapo.'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {state === 'off' && (
          <button type="button" data-testid="app-push-on" onClick={async () => setState(await enablePushNotifications(key))}
            style={{ height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Washa arifa
          </button>
        )}
        <button type="button" data-testid="app-push-later" onClick={later}
          style={{ height: 36, padding: '0 14px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Baadaye
        </button>
      </div>
    </div>
  );
}
