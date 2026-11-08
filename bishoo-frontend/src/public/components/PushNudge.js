/**
 * PushNudge.js — "Washa arifa" for the people whose work arrives as a message (owner 2026-11-08:
 * "kill SMS for now, only push notifications and phone calling"): agents and offices learn about a
 * new job or parcel only by the app's alert now. Shown only when this phone can take alerts and
 * they are off; one tap asks the phone (the tap itself, as iPhone requires).
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { enablePushNotifications, getPushNotificationState } from '../hooks/usePWA';

export default function PushNudge({ who = 'kazi mpya' }) {
  const [key, setKey] = useState(null);
  const [state, setState] = useState('');

  useEffect(() => {
    let live = true;
    Promise.resolve(api.get('/notifications/push/vapid-key')).then((r) => {
      const k = r?.data?.publicKey || '';
      if (!live) return;
      setKey(k);
      if (k) getPushNotificationState().then((st) => { if (live) setState(st); }).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!key || (state !== 'off' && state !== 'denied')) return null;
  return (
    <div data-testid="push-nudge" role="status" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, color: '#0f1419' }}>
      <b style={{ fontSize: 15 }}>Washa arifa za KenteXa</b>
      <span style={{ fontSize: 14, color: '#536471' }}>
        {state === 'denied'
          ? 'Arifa zimezuiwa kwenye simu hii. Fungua mipangilio ya kivinjari, ruhusu arifa za kentexa.com.'
          : `SMS zimesimamishwa kwa sasa: ${who} inakufikia kwa arifa ya KenteXa tu.`}
      </span>
      {state === 'off' && (
        <button type="button" data-testid="push-nudge-on" onClick={async () => setState(await enablePushNotifications(key))}
          style={{ alignSelf: 'flex-start', height: 38, padding: '0 16px', borderRadius: 19, border: 'none', background: '#0f1419', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Washa arifa
        </button>
      )}
    </div>
  );
}
