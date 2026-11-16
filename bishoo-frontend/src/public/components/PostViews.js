/**
 * PostViews.js — readers of a post, like Reels views (owner approved 2026-11-16).
 *  - ViewsCount: the eye and the number on every post (signed-in readers and guest browsers,
 *    each counted once). The writer taps it for their own numbers.
 *  - ViewsSheet: the writer's last 7 days, readers with and without an account, and how many
 *    guests came through shared links.
 *  - countGuestView: a guest's read of a public post, once per post per browser (a random key
 *    kept on this browser, no personal data).
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { arrivalShareCode } from '../utils/shortLinks';

const INK = '#0f1419';
const MUTED = '#536471';

/** 1,240 -> "1.2K"; 15,000 -> "15K"; 2,300,000 -> "2.3M". */
export const compactCount = (n) => {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
};

const KEY = 'kx_vk';
const browserKey = () => {
  try {
    let k = window.localStorage.getItem(KEY);
    if (!k) {
      const bytes = new Uint8Array(12);
      (window.crypto || {}).getRandomValues?.(bytes);
      k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || `k${Date.now()}`;
      window.localStorage.setItem(KEY, k);
    }
    return k;
  } catch { return null; }
};

/** A guest read this public post (counted once per post per browser). Never throws. */
export const countGuestView = (postId) => {
  if (!/^\d+$/.test(String(postId ?? ''))) return;
  const sessionKey = browserKey();
  if (!sessionKey) return;
  let fromShare = false;
  try { fromShare = !!arrivalShareCode(); } catch { /* none */ }
  Promise.resolve().then(() => api.post(`/feed-views/${postId}/guest`, { sessionKey, fromShare })).catch(() => {});
};

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

export const ViewsSheet = ({ postId, onClose }) => {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api.get(`/feed-views/${postId}`))
      .then((r) => { if (alive) setS(r?.data || null); })
      .catch((e) => { if (alive) setError(e?.response?.data?.message || 'Imeshindikana kupakia.'); });
    return () => { alive = false; };
  }, [postId]);
  const max = Math.max(1, ...((s?.days || []).map((d) => d.views)));
  const dayName = (iso) => ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Iju', 'Jms'][new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return (
    <div data-testid="views-sheet" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <button type="button" aria-label="Funga" onClick={onClose} style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(15,20,25,0.4)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label="Waliotazama"
        style={{ position: 'relative', width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', padding: '14px 16px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <b style={{ fontSize: 18, color: INK }}>Waliotazama chapisho hili</b>
        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>}
        {!s && !error && <div style={{ color: MUTED }}>Inapakia...</div>}
        {s && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[['Wote', s.total], ['Wenye akaunti', s.members], ['Wageni', s.guests]].map(([l, n]) => (
                <div key={l} style={{ background: '#f7f9f9', borderRadius: 12, padding: '10px 12px' }}>
                  <div data-testid={`views-${l}`} style={{ fontSize: 22, fontWeight: 800, color: INK }}>{Number(n).toLocaleString('en-US')}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: MUTED }}>Wageni <b style={{ color: INK }}>{s.fromShares}</b> walifika kupitia viungo vilivyoshirikiwa.</div>
            <div aria-label="Siku 7 zilizopita" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {(s.days || []).map((d) => (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: INK, fontWeight: 700 }}>{d.views || ''}</span>
                  <span style={{ width: '100%', height: `${Math.round((d.views / max) * 80) + 2}px`, background: '#1d9bf0', borderRadius: 6 }} />
                  <span style={{ fontSize: 11, color: MUTED }}>{dayName(d.day)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>Kila mtu au kivinjari kinahesabiwa mara moja tu.</div>
          </>
        )}
      </div>
    </div>
  );
};

/** The eye and the number; the writer can open their numbers. */
export default function ViewsCount({ post, isOwner, style }) {
  const [open, setOpen] = useState(false);
  const n = Number(post?.views || 0);
  const real = /^\d+$/.test(String(post?.id ?? ''));
  if (!real) return null;
  return (
    <>
      <button type="button" data-testid="post-views" aria-label={`Waliotazama ${n}`} onClick={() => isOwner && setOpen(true)}
        style={{ ...style, cursor: isOwner ? 'pointer' : 'default' }}>
        <EyeIcon />{n > 0 && compactCount(n)}
      </button>
      {open && <ViewsSheet postId={post.id} onClose={() => setOpen(false)} />}
    </>
  );
}
