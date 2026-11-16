/**
 * GuestJoinSheet.js — the guest's invitation to take part (viral engine B, issue #381, mockup
 * "2 · Guest: write first, join after" approved 2026-11-16). Opened by askToJoin() from any
 * button a guest taps (Jibu, Penda, Kura, Jiunge, Fuata...). A reply can be written first; it is
 * kept on this phone for 1 hour and is ready on the same discussion after registering. It is
 * only sent when the person taps Tuma. Nothing is done for them without a tap.
 */
import React, { useEffect, useState } from 'react';
import { PlayMark, showGetApp } from './GetAppStrip';
import { PLAY_STORE_URL } from '../hooks/usePWA';
import { peopleLine, rememberGuestPlace } from '../utils/guestJoin';

const INK = '#0f1419';
const MUTED = '#536471';
const BORDER = '#cfd9de';

const TITLES = {
  reply: 'Andika jibu lako, kisha jisajili kulituma',
  like: 'Jisajili ili upende na ujibu',
  vote: 'Jisajili ili upige kura',
  join: 'Jisajili ili ujiunge na jumuiya hii',
  follow: 'Jisajili ili ufuate',
  save: 'Jisajili ili uhifadhi',
  repost: 'Jisajili ili usambaze',
};

export default function GuestJoinSheet({ onNavigate }) {
  const [ask, setAsk] = useState(null);
  const [body, setBody] = useState('');

  useEffect(() => {
    window.__kxJoinSheet = true;
    const on = (e) => { setAsk(e.detail || {}); setBody(e.detail?.draft?.body || ''); };
    window.addEventListener('kx:ask-to-join', on);
    return () => { window.removeEventListener('kx:ask-to-join', on); window.__kxJoinSheet = false; };
  }, []);

  if (!ask) return null;
  const isReply = ask.action === 'reply';
  const keep = () => rememberGuestPlace(ask.destination, isReply && ask.draft ? { ...ask.draft, body } : null);
  const go = (page) => { keep(); setAsk(null); onNavigate(page); };
  const names = (ask.people || []).filter(Boolean);

  return (
    <div data-testid="guest-join" style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <button type="button" aria-label="Funga" onClick={() => setAsk(null)} style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(15,20,25,0.4)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label="Jiunge na mazungumzo"
        style={{ position: 'relative', width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', padding: '10px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
        <div aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, background: BORDER }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {names.length > 0 && (
            <div aria-hidden="true" style={{ display: 'flex' }}>
              {names.slice(0, 3).map((n, i) => (
                <span key={i} style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid #fff', marginLeft: i ? -8 : 0, fontSize: 12, fontWeight: 700,
                  background: ['#fde2c8', '#d6e4f0', '#dff3e4'][i], color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n.charAt(0).toUpperCase()}</span>
              ))}
            </div>
          )}
          <span data-testid="guest-join-people" style={{ fontSize: 14, color: MUTED }}>{peopleLine(ask)}</span>
        </div>
        <h2 style={{ margin: 0, fontSize: 20, lineHeight: '26px', fontWeight: 800, color: INK }}>{TITLES[ask.action] || 'Jiunge na mazungumzo kwenye KenteXa'}</h2>
        {isReply && (
          <>
            <label htmlFor="guest-draft" style={{ position: 'absolute', left: -9999 }}>Jibu lako</label>
            <textarea id="guest-draft" data-testid="guest-draft" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000}
              placeholder={ask.draft?.replyName ? `Jibu kwa ${ask.draft.replyName}…` : 'Andika jibu lako…'}
              style={{ height: 92, resize: 'none', border: '1px solid #1d9bf0', borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, lineHeight: '21px', color: INK }} />
            <div style={{ fontSize: 13, color: MUTED, lineHeight: '18px' }}>
              Jibu lako linahifadhiwa kwenye simu hii kwa saa 1. Baada ya kujisajili utarudi hapa hapa, ukiwa na jibu tayari. Litatumwa ukibonyeza <b style={{ color: INK }}>Tuma</b>.
            </div>
          </>
        )}
        <button type="button" data-testid="guest-join-register" onClick={() => go('Register')}
          style={{ height: 48, borderRadius: 999, border: 'none', background: '#1d9bf0', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Jisajili kwa namba ya simu
        </button>
        <button type="button" data-testid="guest-join-login" onClick={() => go('PublicLogin')}
          style={{ height: 48, borderRadius: 999, border: `1px solid ${BORDER}`, background: '#fff', color: INK, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Nina akaunti: Ingia
        </button>
        {showGetApp() && (
          <a href={PLAY_STORE_URL} data-testid="guest-join-app" target="_blank" rel="noopener noreferrer"
            style={{ height: 44, borderRadius: 999, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#0f1419', fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
            <PlayMark size={16} />Pakua app ya KenteXa (Google Play)
          </a>
        )}
        <button type="button" data-testid="guest-join-later" onClick={() => setAsk(null)}
          style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 14, color: MUTED, cursor: 'pointer', padding: 6 }}>
          Endelea kusoma
        </button>
      </div>
    </div>
  );
}
