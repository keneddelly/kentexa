/**
 * SuggestedCommunities.js — "Jumuiya za kujiunga" inside For You (owner 2026-11-02:
 * "few jumuiya should be recommended at For You / Zote so that new users can join").
 *
 * A short sideways row of real communities the viewer is not in yet, biggest first
 * (GET /communities, the server's own order and visibility; with a topic chip on, only
 * that topic). Joining happens right on the card. Nothing to suggest = nothing shown.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { topicLabel } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';
export const SUGGEST_COUNT = 6;

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function SuggestedCommunities({ isLoggedIn, onNavigate, onSeeAll, topic = '' }) {
  const [items, setItems] = useState([]);
  const [joining, setJoining] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get('/communities', { params: topic ? { topic } : {} })
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r?.data) ? r.data : [];
        setItems(list.filter((c) => !c.myStatus).slice(0, SUGGEST_COUNT));
      })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [isLoggedIn, topic]);

  const join = async (c) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setJoining(c.id);
    try {
      const r = await api.post(`/communities/${c.id}/join`);
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...r.data } : x)));
    } catch { /* stays as it was */ } finally { setJoining(null); }
  };

  if (items.length === 0) return null;
  return (
    <section data-testid="suggested-communities" aria-label="Jumuiya za kujiunga"
      style={{ padding: '12px 0 14px', borderBottom: `1px solid ${LINE}`, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Jumuiya za kujiunga</span>
        <button type="button" data-testid="suggested-see-all" onClick={() => onSeeAll?.()}
          style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Ona zote
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
        {items.map((c) => {
          const joined = c.myStatus === 'active';
          const pending = c.myStatus === 'pending';
          return (
            <div key={c.id} data-testid={`suggested-community-${c.id}`}
              style={{ width: 168, flexShrink: 0, border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button type="button" onClick={() => onNavigate(`Community-${c.id}`)}
                style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: INK, color: '#fff', fontWeight: 800, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(c.name)}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{topicLabel(c.topicKey)} · Wanachama {Number(c.memberCount || 0).toLocaleString('en-US')}</span>
              </button>
              <button type="button" data-testid={`suggested-join-${c.id}`} disabled={joined || pending || joining === c.id} onClick={() => join(c)}
                style={{ height: 30, borderRadius: 15, cursor: joined || pending ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                  border: `1px solid ${INK}`, background: joined || pending ? '#fff' : INK, color: joined || pending ? INK : '#fff' }}>
                {joined ? 'Umejiunga' : pending ? 'Ombi limetumwa' : c.joinPolicy === 'request' ? 'Omba kujiunga' : 'Jiunge'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
