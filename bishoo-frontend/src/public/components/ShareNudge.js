/**
 * ShareNudge.js — a gentle invitation to share at the right moment (viral engine C11, issue
 * #381, mockup "3 · The sharer sees the result" approved 2026-11-16). One per moment, never
 * repeated once dismissed: after posting a question or poll, when a discussion reaches 10
 * replies, after "Jibu bora" is chosen.
 */
import React from 'react';

const DISMISS_KEY = 'kx_nudges';

/** Was this nudge (e.g. "hot-88") already dismissed or used on this phone? */
export const nudgeSeen = (key) => {
  try { return (JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]') || []).includes(key); } catch { return false; }
};
export const markNudge = (key) => {
  try {
    const list = (JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]') || []).filter((k) => k !== key);
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...list, key].slice(-200)));
  } catch { /* storage off */ }
};

export default function ShareNudge({ title, text, action = 'Shiriki', status = false, onShare, onDismiss, floating = false, testid = 'share-nudge' }) {
  return (
    <div data-testid={testid} role="status"
      style={{ border: '1px solid #cfe5f7', background: '#f3f9fe', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
        ...(floating ? { position: 'fixed', left: 12, right: 12, bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', zIndex: 1500, maxWidth: 520, margin: '0 auto', boxShadow: '0 8px 28px rgba(15,20,25,0.18)' } : { margin: '8px 0' }) }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1419' }}>{title}</div>
      {text && <div style={{ fontSize: 14, color: '#536471', lineHeight: '20px' }}>{text}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid={`${testid}-share`} onClick={onShare}
          style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: status ? '#25d366' : '#1d9bf0', color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {action}
        </button>
        <button type="button" data-testid={`${testid}-later`} onClick={onDismiss}
          style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid #cfd9de', background: '#fff', color: '#0f1419', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Si sasa
        </button>
      </div>
    </div>
  );
}
