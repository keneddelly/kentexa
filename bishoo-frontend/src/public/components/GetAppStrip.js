/**
 * GetAppStrip.js — owner 2026-11-16: every feature invites people on an Android phone who do not
 * have the KenteXa app to get it from Google Play. Shown only on Android outside the Play app
 * (also inside WhatsApp or Instagram's browser, where most shared links open); never in the app,
 * never on iPhone (no iPhone app yet) or a computer. "Baadaye" hides it for this visit.
 */
import React, { useState } from 'react';
import { detectInstallEnvironment, PLAY_STORE_URL } from '../hooks/usePWA';

const KEY = 'kx_getapp_hidden';
export const showGetApp = () => {
  try {
    const env = detectInstallEnvironment();
    return env.android && !env.androidApp;
  } catch { return false; }
};

export const PlayMark = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 9-14 9z" fill="#01875f" /></svg>
);

/** A Google Play button (for cards that already have their own layout). */
export const PlayButton = ({ label = 'Pakua app', testid = 'get-app' }) => (
  <a href={PLAY_STORE_URL} data-testid={testid} target="_blank" rel="noopener noreferrer"
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 999, background: '#0f1419', color: '#fff',
      fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
    <PlayMark />{label}
  </a>
);

export default function GetAppStrip({ text = 'Soma kwa urahisi zaidi kwenye app ya KenteXa', style }) {
  const [hidden, setHidden] = useState(() => {
    try { return window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  if (hidden || !showGetApp()) return null;
  const hide = () => {
    try { window.sessionStorage.setItem(KEY, '1'); } catch { /* storage off */ }
    setHidden(true);
  };
  return (
    <div data-testid="get-app-strip" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', ...style }}>
      <PlayMark size={18} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#0f1419', lineHeight: '18px' }}>
        {text} <span style={{ color: '#536471' }}>· Google Play</span>
      </span>
      <PlayButton />
      <button type="button" onClick={hide} aria-label="Baadaye"
        style={{ border: 'none', background: 'none', color: '#536471', fontSize: 13, cursor: 'pointer', padding: '4px', fontFamily: 'inherit' }}>Baadaye</button>
    </div>
  );
}
