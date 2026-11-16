/**
 * WriterOfWeek.js — Mwandishi wa Wiki on Home (owner approved 2026-11-16). Recognition, no money.
 * A gold card all week: the writer of the week's photo and name, what they wrote, Fuata and Soma;
 * under it the next 3 writers with Fuata. The winner sees "Shiriki kadi yako" (the gold Status
 * card with their link). Android visitors without the app get the Google Play button.
 * Nothing picked (a quiet week), nothing shown.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { API_BASE_URL } from '../../api/baseUrl';
import { formatName, formatTitle } from '../utils/kentexaText';
import { PlayButton, showGetApp } from './GetAppStrip';

const INK = '#0f1419';
const MUTED = '#536471';
export const GOLD = '#b45309';

export const Star = ({ size = 14, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" /></svg>
);

/** The gold label next to the writer of the week's name on their posts. */
export const WriterBadge = () => (
  <span data-testid="writer-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff',
    fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 }}>
    <Star size={10} />MWANDISHI WA WIKI
  </span>
);

const Face = ({ name, photo, size, ring }) => (
  <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: '#fde2c8', flexShrink: 0, overflow: 'hidden',
    border: ring ? `3px solid #f59e0b` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: INK, fontSize: size * 0.4, boxSizing: 'border-box' }}>
    {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (formatName(name) || 'M').charAt(0)}
  </span>
);

const KIND_COUNT = { article: 'Makala', discussion: 'Mjadala', question: 'Swali', experience: 'Uzoefu' };

export default function WriterOfWeek({ onNavigate, isLoggedIn, currentUser }) {
  const [data, setData] = useState(null);
  const [following, setFollowing] = useState({});
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api.get('/writer-of-week'))
      .then((r) => { if (alive) setData(r?.data || null); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const w = data?.winner;
  if (!w) return null;

  const openProfile = (p) => onNavigate?.(`CommerceProfile-${p.ownerUserId}`, p.commerceProfileId ? { commerceProfileId: p.commerceProfileId } : undefined);
  const follow = async (p) => {
    if (!isLoggedIn) { onNavigate?.('PublicLogin'); return; }
    try {
      const r = await api.post(p.commerceProfileId ? `/profiles/${p.commerceProfileId}/follow` : `/stores/${p.ownerUserId}/follow`);
      setFollowing((f) => ({ ...f, [p.ownerUserId]: r?.data?.following ?? !f[p.ownerUserId] }));
    } catch { /* try again later */ }
  };
  const mine = isLoggedIn && Number(currentUser?.id) === Number(w.ownerUserId);
  const shareCard = async () => {
    const link = w.username ? `https://kentexa.com/@${w.username}` : 'https://kentexa.com';
    const text = `Nimekuwa Mwandishi wa Wiki kwenye KenteXa (${data.weekLabel}). Soma ninachoandika: ${link}`;
    try {
      const res = await fetch(`${API_BASE_URL}/share/card/writer/${w.ownerUserId}.png?f=status`);
      const file = res.ok ? new File([await res.blob()], 'kentexa-mwandishi-wa-wiki.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setNote('Ujumbe umenakiliwa. Ubandike popote.');
    } catch { /* closed */ }
  };

  const followBtn = (p, dark) => (
    <button type="button" data-testid={`writer-follow-${p.ownerUserId}`} onClick={() => follow(p)}
      style={{ height: dark ? 36 : 30, padding: dark ? '0 16px' : '0 12px', borderRadius: 999, border: dark ? 'none' : '1px solid #cfd9de',
        background: dark ? INK : '#fff', color: dark ? '#fff' : INK, fontFamily: 'inherit', fontSize: dark ? 14 : 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
      {following[p.ownerUserId] ? 'Unamfuata' : 'Fuata'}
    </button>
  );

  return (
    <section data-testid="writer-of-week" aria-label="Mwandishi wa Wiki" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid #eff3f4' }}>
      <div style={{ borderRadius: 18, background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #f5d38a', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: GOLD, letterSpacing: '0.04em' }}>
          <Star size={14} color={GOLD} />MWANDISHI WA WIKI · {String(data.weekLabel || '').toUpperCase()}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => openProfile(w)} aria-label={formatName(w.name)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
            <Face name={w.name} photo={w.photo} size={64} ring />
          </button>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <b data-testid="writer-name" style={{ fontSize: 18, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(w.name)}</b>
            <span style={{ fontSize: 13, color: MUTED }}>
              {w.posts > 1 ? `machapisho ${w.posts}` : 'chapisho 1'} · majibu {w.replies} kutoka kwa watu {w.repliers}
            </span>
          </span>
          {!mine && followBtn(w, true)}
        </span>
        {w.topPost && (
          <button type="button" data-testid="writer-top-post" onClick={() => onNavigate?.(`PostDetail-${w.topPost.id}`)}
            style={{ background: '#fff', border: 'none', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 12, color: MUTED }}>Alichoandika zaidi wiki hii{KIND_COUNT[w.topPost.intent] ? ` · ${KIND_COUNT[w.topPost.intent]}` : ''}</span>
            <b style={{ fontSize: 15, lineHeight: '20px', color: INK, overflowWrap: 'anywhere' }}>{formatTitle(w.topPost.title)}</b>
            <span style={{ fontSize: 13, color: '#1a6fb0', fontWeight: 700 }}>Soma →</span>
          </button>
        )}
        {mine && (
          <button type="button" data-testid="writer-share" onClick={shareCard}
            style={{ height: 40, borderRadius: 999, border: 'none', background: GOLD, color: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Hongera! Shiriki kadi yako
          </button>
        )}
        {note && <span role="status" style={{ fontSize: 13, color: '#1d6b39' }}>{note}</span>}
        {showGetApp() && (
          <span data-testid="writer-get-app" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MUTED }}>
            <span style={{ flex: 1 }}>Fuata waandishi bora kwenye app ya KenteXa</span><PlayButton testid="writer-play" />
          </span>
        )}
      </div>
      {data.next?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 16, color: INK }}>Waandishi bora wa wiki</b>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.next.length}, minmax(0, 1fr))`, gap: 10 }}>
            {data.next.map((p) => (
              <div key={p.ownerUserId} data-testid={`writer-next-${p.ownerUserId}`}
                style={{ border: '1px solid #e1e8ed', borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', minWidth: 0 }}>
                <button type="button" onClick={() => openProfile(p)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'inherit', minWidth: 0, maxWidth: '100%' }}>
                  <Face name={p.name} photo={p.photo} size={44} />
                  <b style={{ fontSize: 13, color: INK, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(p.name)}</b>
                  <span style={{ fontSize: 11, color: MUTED }}>majibu {p.replies}</span>
                </button>
                {!(isLoggedIn && Number(currentUser?.id) === Number(p.ownerUserId)) && followBtn(p, false)}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
