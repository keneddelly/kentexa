/**
 * SeriesBar.js — Mfululizo on a post (issue #410 phase 2, owner approved 2026-11-17): when the post
 * is an episode of a published series, a slim bar above it says which series and which part
 * ("Sehemu 2 kati ya 5"), opens the series, and steps to the previous / next episode.
 * The numbers come from GET /series/for-post/:id (public episodes only); nothing shows otherwise.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#1d4ed8';

export const SeriesMark = ({ size = 14, color = BLUE }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

const Step = ({ dir, ep, onNavigate }) => {
  if (!ep) return <span style={{ flex: 1 }} />;
  const label = dir === 'prev' ? 'Iliyopita' : 'Inayofuata';
  return (
    <button type="button" data-testid={`series-${dir}`} onClick={() => onNavigate(`PostDetail-${ep.postId}`)}
      style={{ flex: 1, minWidth: 0, border: '1px solid #dbe4f3', background: '#fff', borderRadius: 12, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
        textAlign: dir === 'prev' ? 'left' : 'right', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 12, color: MUTED }}>{dir === 'prev' ? '← ' : ''}{label} · Sehemu {ep.number}{dir === 'next' ? ' →' : ''}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title}</span>
    </button>
  );
};

export default function SeriesBar({ postId, onNavigate }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    setList([]);
    Promise.resolve()
      .then(() => api.get(`/series/for-post/${postId}`))
      .then((r) => { if (alive) setList(Array.isArray(r?.data) ? r.data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [postId]);
  if (!list.length) return null;
  return (
    <div data-testid="series-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px', borderBottom: '1px solid #eff3f4', background: '#f6f9ff' }}>
      {list.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" data-testid={`series-open-${s.id}`} onClick={() => onNavigate(`Series-${s.id}`)}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <SeriesMark />
            <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>MFULULIZO</span>
            <b style={{ fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.title}</b>
            <span style={{ fontSize: 13, color: BLUE, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 'auto' }}>Sehemu {s.number} kati ya {s.total}</span>
          </button>
          {(s.prev || s.next) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Step dir="prev" ep={s.prev} onNavigate={onNavigate} />
              <Step dir="next" ep={s.next} onNavigate={onNavigate} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
