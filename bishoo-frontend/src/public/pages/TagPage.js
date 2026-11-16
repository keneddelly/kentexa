/**
 * TagPage.js — one hashtag's page, kentexa.com/tag/<key> (owner approved 2026-11-15).
 * Header: #Tag and how many posts use it. Tabs "Juu" (what people talk about most) and "Mpya"
 * (newest first). Posts use the same card as Home. Anyone can open it, signed in or not; what
 * each viewer may see is decided by the server. A tag blocked by the admin shows nothing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { PostCard } from './HomeFeed';
import { hashtagKey } from '../utils/hashtags';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d9bf0';
const PAGE_SIZE = 15;

const TABS = [
  { key: 'top', label: 'Juu' },
  { key: 'latest', label: 'Mpya' },
];

const countLabel = (n) => (n === 1 ? 'Chapisho 1' : `Machapisho ${Number(n || 0).toLocaleString('en-US')}`);

export default function TagPage({ tagKey, onNavigate, isLoggedIn, currentUser, activeProfileId }) {
  const key = hashtagKey(tagKey);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState('top');
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!key) return;
    try { window.scrollTo(0, 0); } catch { /* not in a browser */ }
    try { document.title = `#${key} · KenteXa`; } catch { /* not in a browser */ }
    let alive = true;
    api.get(`/hashtags/${encodeURIComponent(key)}`)
      .then((r) => { if (alive) setInfo(r.data || null); })
      .catch(() => { if (alive) setInfo(null); });
    return () => { alive = false; };
  }, [key]);

  const load = useCallback((sort, p) => {
    if (!key) return Promise.resolve();
    return api.get(`/hashtags/${encodeURIComponent(key)}/posts`, { params: { sort, page: p } })
      .then((r) => {
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setPosts((prev) => (p === 1 ? items : [...prev, ...items.filter((i) => !prev.some((x) => x.id === i.id))]));
        setTotal(Number(r.data?.total || 0));
        setPage(p);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [key]);

  useEffect(() => {
    setState('loading');
    setPosts([]);
    load(tab, 1);
  }, [tab, load]);

  // One navigation (#374): back returns to exactly where the person came from (a community,
  // a profile, a tag, Home...), at the same place; opened from a link, it goes Home.
  const back = () => onNavigate('back');

  const loadMore = () => {
    setMore(true);
    load(tab, page + 1).finally(() => setMore(false));
  };

  const display = info?.display || key;
  const blocked = !!info?.blocked;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)' }}>
        <button type="button" onClick={back} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 data-testid="tag-title" style={{ margin: 0, fontSize: 19, fontWeight: 800, color: INK, overflowWrap: 'anywhere' }}>#{display}</h1>
          {info && !blocked && <div data-testid="tag-count" style={{ fontSize: 13, color: MUTED }}>{countLabel(info.postCount)}</div>}
        </div>
      </div>

      {!key || blocked ? (
        <div data-testid="tag-unavailable" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>Tagi hii haipatikani</div>
          <button type="button" onClick={() => onNavigate('Home')}
            style={{ marginTop: 12, height: 38, padding: '0 18px', borderRadius: 19, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            Nenda Mwanzo
          </button>
        </div>
      ) : (
        <>
          <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, position: 'relative', height: 48, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? INK : MUTED }}>
                {t.label}
                <span aria-hidden="true" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 56, height: 4, borderRadius: 2, background: tab === t.key ? BLUE : 'transparent' }} />
              </button>
            ))}
          </div>

          {state === 'loading' && <div data-testid="tag-loading" style={{ padding: 24, color: MUTED, fontSize: 15 }}>Inapakia...</div>}
          {state === 'error' && (
            <div role="alert" style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 15 }}>
              Imeshindikana kupakia.{' '}
              <button type="button" onClick={() => { setState('loading'); load(tab, 1); }}
                style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>Jaribu tena</button>
            </div>
          )}
          {state === 'ready' && posts.length === 0 && (
            <div data-testid="tag-empty" style={{ padding: '32px 24px', textAlign: 'center', color: MUTED, fontSize: 15 }}>
              Bado hakuna chapisho lenye #{display}.
            </div>
          )}
          {state === 'ready' && posts.map((p) => (
            <PostCard key={p.id} post={p} isLoggedIn={isLoggedIn} onNavigate={onNavigate} currentUser={currentUser} activeProfileId={activeProfileId} />
          ))}
          {state === 'ready' && posts.length > 0 && posts.length < total && page * PAGE_SIZE < total && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button type="button" data-testid="tag-more" disabled={more} onClick={loadMore}
                style={{ height: 36, padding: '0 18px', borderRadius: 18, border: `1px solid #cfd9de`, background: '#fff', color: INK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {more ? 'Inapakia...' : 'Onyesha zaidi'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
