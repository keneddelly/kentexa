/**
 * SeriesPage.js — one series, kentexa.com/series/<id>-<name> (Mfululizo, issue #410 phase 2, owner
 * approved 2026-11-17). Cover, title, publisher, topics, how many episodes ("Sehemu") and
 * followers, Fuata / Unafuata, the description and the episodes in order. An episode opens its
 * post, where people reply as usual. Anyone can open it; the server shows published series and
 * public episodes only. Signing in to follow returns to this page.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import GetAppStrip from '../components/GetAppStrip';
import { SeriesMark } from '../components/SeriesBar';
import { formatName, formatTitle } from '../utils/kentexaText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';

const KIND = { question: 'Swali', discussion: 'Mjadala', poll: 'Kura', article: 'Makala', experience: 'Uzoefu' };

export default function SeriesPage({ seriesId, onNavigate, isLoggedIn }) {
  const [s, setS] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | error
  const [topics, setTopics] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    return Promise.resolve()
      .then(() => api.get(`/series/${seriesId}`))
      .then((r) => {
        if (r?.data?.id) {
          setS(r.data); setState('ready');
          try { document.title = `${r.data.title} · Mfululizo · KenteXa`; } catch { /* not in a browser */ }
        } else setState('missing');
      })
      .catch((e) => setState(e?.response?.status === 404 ? 'missing' : 'error'));
  }, [seriesId]);

  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* not in a browser */ }
    load();
    Promise.resolve().then(() => api.get('/feed/topics')).then((r) => setTopics(Array.isArray(r?.data) ? r.data : [])).catch(() => {});
  }, [load]);

  const follow = async () => {
    if (!isLoggedIn) {
      try { localStorage.setItem('kentexa_after_login', `Series-${seriesId}`); } catch { /* storage off */ }
      onNavigate('PublicLogin');
      return;
    }
    setBusy(true);
    try {
      const r = s.following ? await api.delete(`/series/${s.id}/follow`) : await api.post(`/series/${s.id}/follow`);
      setS((x) => ({ ...x, following: Boolean(r?.data?.following), followers: Number(r?.data?.followers ?? x.followers) }));
    } catch { /* the button stays as it was */ } finally { setBusy(false); }
  };

  const share = async () => {
    const url = `${window.location.origin}${s.path}`;
    try {
      if (navigator.share) { await navigator.share({ title: s.title, text: `Mfululizo: ${s.title}`, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* closed or not allowed */ }
  };

  const label = (key) => topics.find((t) => t.key === key)?.label || key;
  const back = () => onNavigate('back');

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={back} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <b style={{ fontSize: 17, color: INK }}>Mfululizo</b>
      </div>

      {state === 'loading' && <div data-testid="series-loading" style={{ padding: 24, color: MUTED }}>Inapakia...</div>}
      {state === 'error' && (
        <div role="alert" style={{ padding: 24, textAlign: 'center', color: MUTED }}>
          Imeshindikana kupakia.{' '}
          <button type="button" onClick={load} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15 }}>Jaribu tena</button>
        </div>
      )}
      {state === 'missing' && (
        <div data-testid="series-missing" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>Mfululizo haupatikani</div>
          <div style={{ fontSize: 15, color: MUTED, marginBottom: 16 }}>Huenda bado haujachapishwa au umeondolewa.</div>
          <button type="button" onClick={() => onNavigate('Home')}
            style={{ height: 38, padding: '0 18px', borderRadius: 19, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Nenda Mwanzo</button>
        </div>
      )}

      {state === 'ready' && s && (
        <>
          {s.coverUrl
            ? <img src={s.coverUrl} alt="" data-testid="series-cover" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', background: '#f1f5f9' }} />
            : <div aria-hidden="true" style={{ height: 120, background: 'linear-gradient(135deg,#0b1224,#13205a 55%,#1d4ed8)' }} />}
          <section style={{ padding: '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${LINE}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: BLUE }}>
              <SeriesMark size={13} />MFULULIZO
            </span>
            <h1 data-testid="series-title" style={{ margin: 0, fontSize: 26, lineHeight: '31px', fontWeight: 900, color: INK, overflowWrap: 'anywhere' }}>{formatTitle(s.title)}</h1>
            <span style={{ fontSize: 14, color: MUTED }}>
              {formatName(s.publisher)} · <b style={{ color: INK }}>Sehemu {s.episodes}</b> · wafuasi {Number(s.followers || 0).toLocaleString('en-US')}
            </span>
            {s.topics?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {s.topics.map((k) => (
                  <button key={k} type="button" data-testid={`series-topic-${k}`} onClick={() => onNavigate(`Topic-${k}`)}
                    style={{ border: '1px solid #cfd9de', borderRadius: 999, padding: '4px 11px', background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit' }}>{label(k)}</button>
                ))}
              </div>
            )}
            {s.description && <p style={{ margin: 0, fontSize: 16, lineHeight: '23px', color: INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.description}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" data-testid="series-follow" disabled={busy} onClick={follow}
                style={{ height: 40, padding: '0 22px', borderRadius: 20, fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
                  border: s.following ? '1px solid #cfd9de' : 'none', background: s.following ? '#fff' : INK, color: s.following ? INK : '#fff' }}>
                {s.following ? 'Unafuata' : 'Fuata'}
              </button>
              <button type="button" data-testid="series-share" onClick={share}
                style={{ height: 40, padding: '0 18px', borderRadius: 20, border: '1px solid #cfd9de', background: '#fff', color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
                {copied ? 'Kiungo kimenakiliwa' : 'Shiriki'}
              </button>
            </div>
          </section>

          <section data-testid="series-episodes">
            {s.episodeList.length === 0 && <div style={{ padding: 24, color: MUTED, textAlign: 'center' }}>Bado hakuna sehemu iliyochapishwa.</div>}
            {s.episodeList.map((e) => (
              <button key={e.postId} type="button" data-testid={`series-episode-${e.postId}`} onClick={() => onNavigate(`PostDetail-${e.postId}`)}
                style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', border: 'none', borderBottom: `1px solid ${LINE}`, background: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: '#eef2ff', color: BLUE, fontWeight: 900, fontSize: 15, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{String(e.number).padStart(2, '0')}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <b style={{ fontSize: 16, lineHeight: '21px', overflowWrap: 'anywhere' }}>{formatTitle(e.title)}</b>
                  {e.summary && e.summary !== e.title && (
                    <span style={{ fontSize: 14, lineHeight: '19px', color: MUTED, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{e.summary}</span>
                  )}
                  <span style={{ fontSize: 13, color: MUTED }}>
                    {[KIND[e.intent], e.postedAt ? new Date(e.postedAt).toLocaleDateString('en-GB') : null, e.replies ? `majibu ${e.replies}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {e.cover && <img src={e.cover} alt="" style={{ width: 72, height: 54, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#f1f5f9' }} />}
              </button>
            ))}
          </section>
          <GetAppStrip text="Fuatilia mfululizo huu kwenye app ya KenteXa" />
        </>
      )}
    </div>
  );
}
