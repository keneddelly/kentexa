/**
 * AppPushCard.js — "Washa arifa" inside the KenteXa Google Play app (owner 2026-11-10: alerts come
 * through the Play app, not the web app). The tap asks Android's own permission; alerts then
 * arrive with the KenteXa name and icon. Shown on Home to signed-in people whose alerts are off;
 * "Baadaye" hides it for 3 days.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { enablePushNotifications, getPushNotificationState } from '../hooks/usePWA';

const LATER_KEY = 'kx_app_push_later';
const laterRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 3 * 86400000; } catch { return false; }
};

export default function AppPushCard() {
  const [key, setKey] = useState('');
  const [state, setState] = useState('');
  const [hidden, setHidden] = useState(laterRecently);

  useEffect(() => {
    if (hidden) return undefined;
    let live = true;
    Promise.resolve(api.get('/notifications/push/vapid-key')).then((r) => {
      const k = r?.data?.publicKey || '';
      if (!live || !k) return;
      setKey(k);
      getPushNotificationState().then((st) => { if (live) setState(st); }).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, [hidden]);

  if (hidden || !key || (state !== 'off' && state !== 'denied')) return null;
  const later = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* storage blocked */ } setHidden(true); };
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
