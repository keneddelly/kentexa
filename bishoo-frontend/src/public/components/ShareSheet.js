/**
 * ShareSheet.js — the smart share sheet (viral engine C10, issue #381, mockup "1 · Smart share
 * sheet" approved 2026-11-16).
 *  - a small preview of what is shared, and a suggested message the person can edit
 *    (Kiswahili / English);
 *  - WhatsApp, Status (the Status card picture), Facebook, Telegram, X, Nakili, Zaidi (the
 *    phone's own share options: Messenger, Instagram...) and Picha (the link card picture);
 *  - every channel gets its own short link, so step B can count what each one brings.
 * Nothing is sent without the person's tap; contacts are never read.
 * Content that is not public to guests (members or followers only) can only be copied as its
 * normal address, with a note.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/api';
import { API_BASE_URL } from '../../api/baseUrl';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BORDER = '#cfd9de';
const CHANNELS = ['whatsapp', 'status', 'facebook', 'telegram', 'x', 'copy', 'native', 'image'];
const KIND_LABEL = { question: 'Swali', poll: 'Kura', discussion: 'Mjadala', offer: 'Ofa', experience: 'Uzoefu' };

const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

/** The suggested message for a kind of content, in Kiswahili or English (no link: added per channel). */
export const suggestedMessage = ({ contentType, intent, words, community, purpose, invite }, lang = 'sw') => {
  const w = cut(words, 140);
  if (contentType === 'community' && invite) {
    // C12: a member inviting friends.
    return lang === 'en'
      ? `I joined ${w} on KenteXa. Join me${purpose ? `: ${cut(purpose, 120)}` : ''}`
      : `Nimejiunga na ${w} kwenye KenteXa. Jiunge nami${purpose ? `: ${cut(purpose, 120)}` : ''}`;
  }
  if (contentType === 'community') {
    return lang === 'en'
      ? `Join ${w} on KenteXa${purpose ? `: ${cut(purpose, 120)}` : ''}`
      : `Jiunge na ${w} kwenye KenteXa${purpose ? `: ${cut(purpose, 120)}` : ''}`;
  }
  const where = community ? cut(community, 60) : '';
  if (lang === 'en') {
    if (intent === 'question') return `Can you answer this? ${w}${where ? ` People in ${where} are discussing it.` : ''} Answer here:`;
    if (intent === 'poll') return `What do you think? Vote: ${w}`;
    if (intent === 'offer') return `Offer on KenteXa: ${w}`;
    if (intent === 'experience') return `Read this experience on KenteXa: ${w}`;
    return `${where ? `Discussion in ${where}` : 'Discussion on KenteXa'}: ${w}`;
  }
  if (intent === 'question') return `Unaweza kujibu hili? ${w}${where ? ` Watu wa ${where} wanajadili.` : ''} Jibu hapa:`;
  if (intent === 'poll') return `Unaonaje? Piga kura: ${w}`;
  if (intent === 'offer') return `Ofa kwenye KenteXa: ${w}`;
  if (intent === 'experience') return `Soma uzoefu huu kwenye KenteXa: ${w}`;
  return `${where ? `Mjadala kwenye ${where}` : 'Mjadala kwenye KenteXa'}: ${w}`;
};

/** Where each channel sends the person (opened in a new tab or the app). */
export const channelUrl = (channel, message, url) => {
  const text = `${message} ${url}`.trim();
  if (channel === 'whatsapp') return `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (channel === 'facebook') return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  if (channel === 'telegram') return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`;
  if (channel === 'x') return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`;
  return null;
};

const cardUrl = (contentType, contentId, format, link) => {
  const code = (String(link || '').match(/\/s\/([A-Za-z0-9]{5,12})$/) || [])[1];
  return `${API_BASE_URL}/share/card/${contentType}/${contentId}.png${format === 'status' ? `?f=status${code ? `&s=${code}` : ''}` : ''}`;
};

const Circle = ({ bg, border, children }) => (
  <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: '50%', background: bg, border: border || 'none', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 800 }}>{children}</span>
);
const ico = (d, stroke = '#fff') => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.1" aria-hidden="true"><path d={d} /></svg>
);

export default function ShareSheet({ open, onClose, contentType, contentId, words, intent, community, purpose, replies, plainUrl, onShared, invite = false }) {
  const [lang, setLang] = useState('sw');
  const [message, setMessage] = useState('');
  const [links, setLinks] = useState(null); // { channel: url } | {} when not shareable outside
  const [note, setNote] = useState('');
  const [statusLink, setStatusLink] = useState(false); // after a Status picture: offer the link as its own Status
  const blobs = useRef({});
  const base = useMemo(() => ({ contentType, intent, words, community, purpose, invite }), [contentType, intent, words, community, purpose, invite]);

  useEffect(() => { if (open) { setMessage(suggestedMessage(base, lang)); setNote(''); setStatusLink(false); } }, [open, lang, base]);

  // Links for every channel, and the two card pictures, are made when the sheet opens, so each
  // tap can hand them to the phone at once (phones only share straight after a tap).
  useEffect(() => {
    if (!open || !contentId) return undefined;
    let alive = true;
    setLinks(null);
    blobs.current = {};
    Promise.resolve()
      .then(() => api.post('/share-links', { contentType, contentId, channels: CHANNELS }))
      .then((r) => {
        if (!alive) return;
        const l = r?.data?.links || {};
        setLinks(l);
        [['status', 'status', 'status'], ['image', 'link', 'image']].forEach(([key, fmt, ch]) => {
          fetch(cardUrl(contentType, contentId, fmt, l[ch]))
            .then((res) => (res.ok ? res.blob() : null))
            .then((b) => { if (b && alive) blobs.current[key] = new File([b], `kentexa-${contentType}-${contentId}${key === 'status' ? '-status' : ''}.png`, { type: 'image/png' }); })
            .catch(() => {});
        });
      })
      .catch(() => { if (alive) setLinks({}); });
    return () => { alive = false; };
  }, [open, contentType, contentId]);

  if (!open) return null;

  const shareable = links && Object.keys(links).length > 0;
  const linkFor = (ch) => (links && links[ch]) || plainUrl;
  const done = (ch) => { onShared?.(ch); };

  const go = (ch) => {
    const url = channelUrl(ch, message, linkFor(ch));
    if (url) { window.open(url, '_blank', 'noopener'); done(ch); }
  };
  const copy = async () => {
    const text = `${message} ${linkFor('copy')}`.trim();
    try { await navigator.clipboard.writeText(text); setNote('Imenakiliwa. Ibandike popote.'); done('copy'); }
    catch { setNote(linkFor('copy')); }
  };
  const native = async () => {
    try { await navigator.share({ text: message, url: linkFor('native') }); done('native'); } catch { /* closed */ }
  };
  const picture = async (key) => {
    const file = blobs.current[key];
    const text = `${message} ${linkFor(key)}`.trim();
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); done(key); if (key === 'status') setStatusLink(true); return; } catch { return; }
    }
    if (file) {
      // No picture sharing on this phone: save the picture, then the person posts it.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setNote(key === 'status' ? 'Picha imehifadhiwa. Iweke kwenye Status yako ya WhatsApp.' : 'Picha imehifadhiwa.');
      done(key);
      if (key === 'status') setStatusLink(true);
      return;
    }
    setNote('Picha bado inaandaliwa. Jaribu tena baada ya sekunde moja.');
  };

  // WhatsApp does not make a link tappable on a picture Status; a text Status with the link is
  // tappable (and shows the preview), so it is offered right after the picture.
  const shareStatusLink = async () => {
    const text = `${message} ${linkFor('status')}`.trim();
    if (navigator.share) {
      try { await navigator.share({ text }); done('status'); setStatusLink(false); } catch { /* closed */ }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    setStatusLink(false);
  };

  const btn = (key, label, circle, onClick, testid) => (
    <button key={key} type="button" data-testid={testid || `share-${key}`} onClick={onClick} disabled={!links}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'none', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 600, color: INK, cursor: links ? 'pointer' : 'wait', padding: '4px 0', opacity: links ? 1 : 0.6 }}>
      {circle}{label}
    </button>
  );
  const SHARE = 'M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13';
  const kind = contentType === 'community' ? 'Jumuiya' : (KIND_LABEL[intent] || 'Chapisho');
  const linkShown = shareable ? linkFor('copy').replace(/^https?:\/\//, '') : '';

  return (
    <div data-testid="share-sheet" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <button type="button" aria-label="Funga" onClick={onClose} style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(15,20,25,0.4)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label="Shiriki"
        style={{ position: 'relative', width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', padding: '10px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, background: BORDER }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK }}>{invite ? 'Alika marafiki' : contentType === 'community' ? 'Shiriki jumuiya hii' : 'Shiriki mjadala huu'}</h2>
          <button type="button" aria-label="Funga" onClick={onClose} style={{ width: 36, height: 36, border: 'none', borderRadius: '50%', background: '#f7f9f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {ico('M6 6l12 12M18 6L6 18', INK)}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${LINE}`, borderRadius: 14, padding: 8 }}>
          <div aria-hidden="true" style={{ width: 84, height: 44, borderRadius: 8, background: '#1d4ed8', color: '#fff', fontSize: 9, fontWeight: 800, padding: 6, boxSizing: 'border-box', lineHeight: '11px', overflow: 'hidden', flexShrink: 0 }}>
            {kind} · {cut(words, 50)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kind}: {cut(words, 80)}</span>
            <span data-testid="share-link" style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {links === null ? 'Inaandaa kiungo…' : shareable ? `${linkShown}${replies ? ` · majibu ${replies}` : ''}` : 'Kwa wanachama au wafuasi tu'}
            </span>
          </div>
        </div>

        {links && !shareable ? (
          <div data-testid="share-members-only" style={{ fontSize: 14, color: MUTED, lineHeight: '20px' }}>
            Hiki ni cha wanachama au wafuasi tu, kwa hiyo hakiwezi kushirikiwa nje ya KenteXa. Unaweza kunakili kiungo kwa wanaoweza kukiona.
          </div>
        ) : (
          <>
            <label htmlFor="share-msg" style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Ujumbe (unaweza kuubadilisha)</label>
            <textarea id="share-msg" data-testid="share-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500}
              style={{ height: 84, resize: 'none', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, lineHeight: '21px', color: INK }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[['sw', 'Kiswahili'], ['en', 'English']].map(([k, l]) => (
                <button key={k} type="button" data-testid={`share-lang-${k}`} aria-pressed={lang === k} onClick={() => setLang(k)}
                  style={{ height: 30, padding: '0 10px', borderRadius: 999, border: `1px solid ${lang === k ? INK : BORDER}`, background: lang === k ? INK : '#fff',
                    color: lang === k ? '#fff' : INK, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {shareable && btn('whatsapp', 'WhatsApp', <Circle bg="#25d366">{ico('M21 12a8 8 0 01-11.6 7.2L4 20l1-4.6A8 8 0 1121 12z')}</Circle>, () => go('whatsapp'))}
          {shareable && btn('status', 'Status', <Circle bg="#fff" border="3px solid #25d366">{ico('M12 7a5 5 0 100 10 5 5 0 000-10z', '#25d366')}</Circle>, () => picture('status'))}
          {shareable && btn('facebook', 'Facebook', <Circle bg="#1877f2">f</Circle>, () => go('facebook'))}
          {shareable && btn('telegram', 'Telegram', <Circle bg="#229ed9">{ico('M22 2L11 13M22 2l-7 20-4-9-9-4z')}</Circle>, () => go('telegram'))}
          {shareable && btn('x', 'X', <Circle bg={INK}>X</Circle>, () => go('x'))}
          {btn('copy', 'Nakili', <Circle bg={LINE}>{ico('M9 9h11v11H9zM5 15V5h10', INK)}</Circle>, copy)}
          {typeof navigator !== 'undefined' && navigator.share && btn('native', 'Zaidi', <Circle bg={LINE}>{ico(SHARE, INK)}</Circle>, native)}
          {shareable && btn('image', 'Picha', <Circle bg={LINE}>{ico('M4 3h16v18H4zM9 17h6', INK)}</Circle>, () => picture('image'))}
        </div>
        {statusLink && (
          <div data-testid="share-status-link" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#ecfdf3', border: '1px solid #86d4a2', borderRadius: 12, padding: '10px 12px' }}>
            <span style={{ fontSize: 14, color: INK, lineHeight: '20px' }}>
              Kwenye Status ya picha, WhatsApp haifanyi link ibonyezeke. Weka pia Status ya maandishi yenye link ili watu wabonyeze moja kwa moja.
            </span>
            <button type="button" data-testid="share-status-link-go" onClick={shareStatusLink}
              style={{ alignSelf: 'flex-start', height: 38, padding: '0 16px', borderRadius: 999, border: 'none', background: '#25d366', color: '#fff',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Weka link kwenye Status</button>
          </div>
        )}
        {note && <div role="status" data-testid="share-note" style={{ fontSize: 13, color: '#1d6b39', overflowWrap: 'anywhere' }}>{note}</div>}
        {shareable && <div style={{ fontSize: 12, color: MUTED, lineHeight: '17px' }}>"Zaidi" hufungua njia za simu yako (Messenger, Instagram...). "Status" na "Picha" hutuma kadi ya picha.</div>}
      </div>
    </div>
  );
}
