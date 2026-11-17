/**
 * TopicPage.js — one topic ("Mada"), kentexa.com/topic/<key> (Mfululizo, issue #410 phase 2, owner
 * approved 2026-11-17). The topic's name and note, Fuata (the same topic follow as Home), its
 * series (Mfululizo) as cards, then its public posts with the same card as Home. Anyone can open
 * it; the server decides what each viewer may see.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { PostCard } from './HomeFeed';
import GetAppStrip from '../components/GetAppStrip';
import { SeriesMark } from '../components/SeriesBar';
import { formatName, formatTitle } from '../utils/kentexaText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';

export const SeriesCard = ({ s, onNavigate, width = 240 }) => (
  <button type="button" data-testid={`series-card-${s.id}`} onClick={() => onNavigate(`Series-${s.id}`)}
    style={{ flex: `0 0 ${width}px`, border: `1px solid #e1e8ed`, borderRadius: 14, overflow: 'hidden', background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', flexDirection: 'column' }}>
    <span style={{ height: 96, display: 'block', position: 'relative', background: s.coverUrl ? '#f1f5f9' : 'linear-gradient(135deg,#0b1224,#13205a 55%,#1d4ed8)' }}>
      {s.coverUrl && <img src={s.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <span style={{ position: 'absolute', left: 8, bottom: 8, background: '#fff', color: BLUE, fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <SeriesMark size={11} />SEHEMU {s.episodes}
      </span>
    </span>
    <span style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <b style={{ fontSize: 14, lineHeight: '19px', color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{formatTitle(s.title)}</b>
      <span style={{ fontSize: 12, color: MUTED }}>{formatName(s.publisher)}{s.followers ? ` · wafuasi ${s.followers}` : ''}</span>
    </span>
  </button>
);

export default function TopicPage({ topicKey, onNavigate, isLoggedIn, currentUser, activeProfileId }) {
  const key = String(topicKey || '').toLowerCase();
  const [topic, setTopic] = useState(null);
  const [all, setAll] = useState([]);
  const [series, setSeries] = useState([]);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    try { window.scrollTo(0, 0); } catch { /* not in a browser */ }
    Promise.resolve().then(() => api.get('/feed/topics')).then((r) => {
      if (!alive) return;
      const list = Array.isArray(r?.data) ? r.data : [];
      setAll(list);
      const t = list.find((x) => x.key === key) || null;
      setTopic(t);
      if (!t) setState('missing');
      try { if (t) document.title = `${t.label} · KenteXa`; } catch { /* not in a browser */ }
    }).catch(() => { if (alive) setState('error'); });
    Promise.resolve().then(() => api.get('/series', { params: { topic: key } }))
      .then((r) => { if (alive) setSeries(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { alive = false; };
  }, [key]);

  const load = useCallback((p) => Promise.resolve()
    .then(() => api.get('/feed', { params: { filter: 'for_you', topic: key, page: p } }))
    .then((r) => {
      const items = Array.isArray(r?.data?.items) ? r.data.items : (Array.isArray(r?.data) ? r.data : []);
      setPosts((prev) => (p === 1 ? items : [...prev, ...items.filter((i) => !prev.some((x) => x.id === i.id))]));
      setHasMore(items.length >= 15);
      setPage(p);
      setState((s) => (s === 'missing' ? s : 'ready'));
    })
    .catch(() => setState('error')), [key]);

  useEffect(() => { load(1); }, [load]);

  const follow = async () => {
    if (!isLoggedIn) {
      try { localStorage.setItem('kentexa_after_login', `Topic-${key}`); } catch { /* storage off */ }
      onNavigate('PublicLogin');
      return;
    }
    const mine = all.filter((t) => t.following).map((t) => t.key);
    const keys = topic?.following ? mine.filter((k) => k !== key) : [...mine, key];
    setBusy(true);
    try {
      const r = await api.post('/feed/topics/follow', { keys });
      const list = Array.isArray(r?.data) ? r.data : [];
      setAll(list);
      setTopic(list.find((x) => x.key === key) || topic);
    } catch { /* stays as it was */ } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={() => onNavigate('back')} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <b style={{ fontSize: 17, color: INK }}>Mada</b>
      </div>

      {state === 'missing' && (
        <div data-testid="topic-missing" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 12 }}>Mada hii haipatikani</div>
          <button type="button" onClick={() => onNavigate('Home')}
            style={{ height: 38, padding: '0 18px', borderRadius: 19, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Nenda Mwanzo</button>
        </div>
      )}

      {topic && (
        <section style={{ padding: '18px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${LINE}` }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <h1 data-testid="topic-title" style={{ margin: 0, fontSize: 26, fontWeight: 900, color: INK }}>{topic.label}</h1>
            {topic.note && <span style={{ fontSize: 15, color: MUTED }}>{topic.note}</span>}
          </span>
          <button type="button" data-testid="topic-follow" disabled={busy} onClick={follow}
            style={{ height: 38, padding: '0 18px', borderRadius: 19, fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: busy ? 0.6 : 1,
              border: topic.following ? '1px solid #cfd9de' : 'none', background: topic.following ? '#fff' : INK, color: topic.following ? INK : '#fff' }}>
            {topic.following ? 'Unafuata' : 'Fuata'}
          </button>
        </section>
      )}

      {topic && series.length > 0 && (
        <section data-testid="topic-series" style={{ padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
          <b style={{ display: 'block', padding: '0 16px 10px', fontSize: 17, color: INK }}>Mfululizo</b>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
            {series.map((s) => <SeriesCard key={s.id} s={s} onNavigate={onNavigate} />)}
          </div>
        </section>
      )}

      {topic && state === 'loading' && <div style={{ padding: 24, color: MUTED }}>Inapakia...</div>}
      {state === 'error' && (
        <div role="alert" style={{ padding: 24, textAlign: 'center', color: MUTED }}>
          Imeshindikana kupakia.{' '}
          <button type="button" onClick={() => { setState('loading'); load(1); }} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>Jaribu tena</button>
        </div>
      )}
      {topic && state === 'ready' && posts.length === 0 && <div data-testid="topic-empty" style={{ padding: 24, textAlign: 'center', color: MUTED }}>Bado hakuna machapisho kwenye mada hii.</div>}
      {topic && state === 'ready' && posts.map((p) => (
        <PostCard key={p.id} post={p} isLoggedIn={isLoggedIn} onNavigate={onNavigate} currentUser={currentUser} activeProfileId={activeProfileId} />
      ))}
      {topic && state === 'ready' && hasMore && (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <button type="button" onClick={() => load(page + 1)}
            style={{ height: 36, padding: '0 18px', borderRadius: 18, border: '1px solid #cfd9de', background: '#fff', color: INK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Onyesha zaidi</button>
        </div>
      )}
      {topic && <GetAppStrip text={`Fuatilia ${topic.label} kwenye app ya KenteXa`} />}
    </div>
  );
}
