/**
 * CreatorWork.js — "Kazi zangu" on a personal brand page (owner approved 2026-11-18, creator-mock):
 * the post the owner pinned, their Mfululizo, then their Makala with reading time and readers.
 * Only real content; a part with nothing in it is not shown.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { SeriesCard, seriesRows } from './SeriesCard';
import { readMinutes, stripArticle } from '../utils/articleText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const TEAL = '#0f766e';
const BLUE = '#1d4ed8';

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n || 0));
const ago = (iso) => {
  if (!iso) return '';
  const d = Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'leo';
  if (d < 7) return `siku ${Math.floor(d)}`;
  if (d < 30) return `wiki ${Math.floor(d / 7)}`;
  return new Date(iso).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
};
const photoOf = (p) => (Array.isArray(p.media) && p.media[0]?.url) || p.imageUrl || null;
const Pill = () => <span style={{ alignSelf: 'flex-start', background: TEAL, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, padding: '3px 8px', borderRadius: 999 }}>MAKALA</span>;

function ArticleRow({ p, onNavigate }) {
  const photo = photoOf(p);
  return (
    <button type="button" data-testid="creator-article" onClick={() => onNavigate(`PostDetail-${p.id}`)}
      style={{ display: 'flex', gap: 12, padding: '12px 0', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
      <span style={{ width: 96, height: 72, borderRadius: 12, flexShrink: 0, overflow: 'hidden', background: photo ? '#f1f5f9' : 'linear-gradient(135deg,#0f766e,#134e4a)' }}>
        {photo && <img src={photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Pill />
        <b style={{ fontSize: 15, lineHeight: '19px', color: INK }}>{p.title || stripArticle(p.body).slice(0, 80)}</b>
        <span style={{ fontSize: 13, color: MUTED }}>{[ago(p.createdAt), `dakika ${readMinutes(p.body)}`, p.views ? `wasomaji ${fmt(Number(p.views))}` : null].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );
}

export default function CreatorWork({ profileId, pinnedPostId, feed = [], onNavigate, renderPost, isOwn, onManage }) {
  const [pinned, setPinned] = useState(null);
  const [series, setSeries] = useState([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    setPinned(null);
    if (pinnedPostId) Promise.resolve().then(() => api.get(`/feed/${pinnedPostId}`)).then((r) => { if (alive && r?.data?.id) setPinned(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [pinnedPostId]);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api.get('/series', { params: { profileId } })).then((r) => { if (alive) setSeries(seriesRows(r?.data)); }).catch(() => {});
    return () => { alive = false; };
  }, [profileId]);

  const articles = feed.filter((p) => p.intent === 'article' && p.id !== pinned?.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const shown = all ? articles : articles.slice(0, 6);

  return (
    <div data-testid="creator-work" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {isOwn && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: `1px dashed ${LINE}`, borderRadius: 12, padding: '10px 12px', fontSize: 14 }}>
          <span style={{ color: MUTED }}>Mstari wa kazi yako, chapisho la juu na aina ya ukurasa</span>
          <button type="button" data-testid="creator-manage" onClick={onManage}
            style={{ height: 34, padding: '0 14px', borderRadius: 17, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Panga ukurasa</button>
        </div>
      )}
      {pinned && (
        <section data-testid="creator-pinned">
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Imebandikwa juu</div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>{renderPost(pinned)}</div>
        </section>
      )}
      {series.length > 0 && (
        <section>
          <b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: INK, marginBottom: 10 }}>Mfululizo</b>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {series.map((s) => <SeriesCard key={s.id} s={s} onNavigate={onNavigate} />)}
          </div>
        </section>
      )}
      {articles.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 18, fontWeight: 800, color: INK }}>Makala</b>
            {articles.length > 6 && (
              <button type="button" onClick={() => setAll((v) => !v)} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {all ? 'Onyesha chache' : `Zote ${articles.length}`}
              </button>
            )}
          </div>
          {shown.map((p) => <ArticleRow key={p.id} p={p} onNavigate={onNavigate} />)}
        </section>
      )}
      {!pinned && !series.length && !articles.length && (
        <div style={{ padding: 24, textAlign: 'center', color: MUTED }}>Bado hakuna kazi hapa.</div>
      )}
    </div>
  );
}
