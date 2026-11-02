/**
 * CommunitiesPanel.js — top of Home's Jumuiya tab (Social Home part 3, owner approved
 * 2026-11-02): the person's communities, then communities to join in the chosen topic
 * (or all), with a way to open one. The tab's posts follow below it (GET /feed?filter=communities).
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { topicLabel } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e6ebef';

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function CommunitiesPanel({ isLoggedIn, onNavigate, topic = '' }) {
  const [mine, setMine] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [joining, setJoining] = useState(null);

  useEffect(() => {
    let alive = true;
    if (isLoggedIn) {
      api.get('/communities', { params: { mine: '1' } }).then((r) => { if (alive) setMine(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    }
    api.get('/communities', { params: topic ? { topic } : {} })
      .then((r) => { if (alive) setDiscover(Array.isArray(r?.data) ? r.data.slice(0, 8) : []); }).catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn, topic]);

  const join = async (c) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setJoining(c.id);
    try {
      const r = await api.post(`/communities/${c.id}/join`);
      setDiscover((prev) => prev.map((x) => (x.id === c.id ? r.data : x)));
      if (r.data?.myStatus === 'active') setMine((prev) => [...prev, r.data]);
    } catch { /* stays as it was */ } finally { setJoining(null); }
  };

  return (
    <div data-testid="communities-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LINE}` }}>
      {mine.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Jumuiya zako</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {mine.map((c) => (
              <button key={c.id} type="button" data-testid={`my-community-${c.id}`} onClick={() => onNavigate(`Community-${c.id}`)}
                style={{ width: 72, flexShrink: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 52, height: 52, borderRadius: 14, background: INK, color: '#fff', fontWeight: 800, fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(c.name)}</span>
                <span style={{ fontSize: 11, color: INK, textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Jumuiya za kujiunga</span>
        <button type="button" data-testid="open-community" onClick={() => onNavigate(isLoggedIn ? 'CreateCommunity' : 'PublicLogin')}
          style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Fungua jumuiya
        </button>
      </div>
      {discover.length === 0 ? (
        <div style={{ fontSize: 14, color: MUTED }}>Bado hakuna jumuiya hapa. Fungua ya kwanza.</div>
      ) : discover.map((c) => (
        <div key={c.id} data-testid={`discover-community-${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${LINE}`, borderRadius: 12, padding: 10 }}>
          <button type="button" onClick={() => onNavigate(`Community-${c.id}`)}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{topicLabel(c.topicKey)} · Wanachama {Number(c.memberCount || 0).toLocaleString('en-US')}</div>
          </button>
          <button type="button" data-testid={`join-${c.id}`} disabled={joining === c.id || c.myStatus === 'pending'} onClick={() => join(c)}
            style={{ flexShrink: 0, height: 30, padding: '0 12px', borderRadius: 15, border: `1px solid ${INK}`, background: '#fff', color: INK,
              fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {c.myStatus === 'pending' ? 'Ombi limetumwa' : c.joinPolicy === 'request' ? 'Omba' : 'Jiunge'}
          </button>
        </div>
      ))}
    </div>
  );
}
