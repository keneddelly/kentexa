/**
 * DiscussionCard.js — one discussion as a card (community D2, owner approved 2026-11-16), shared by
 * the community page and "Mijadala zaidi" under a discussion: a solid coloured kind label,
 * Imejibiwa / MPYA, the title and a short start of the text, who wrote it, who is replying,
 * "Kuwa wa kwanza kujibu", and poll bars where the poll shows results.
 */
import React from 'react';
import { pollTimeLeft, postPhotos } from '../utils/feedPresentation';
import { formatCaption, formatName, formatText } from '../utils/kentexaText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const CARD_LINE = '#e1e8ed';
const BLUE = '#1d9bf0';
const LINK = '#1a6fb0';

// Kind labels: solid colour, white letters, an icon, so each kind is seen at once (owner 2026-11-16).
const ICON = {
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 4M12 17v.5" /></>,
  poll: <path d="M5 20V10M12 20V4M19 20v-7" />,
  discussion: <path d="M21 12a8 8 0 01-11.6 7.2L4 20l1-4.6A8 8 0 1121 12z" />,
  experience: <path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14 3 9.5 9.5 9z" />,
  offer: <path d="M20 12l-8 8-9-9V3h8zM7.5 7.5h.01" />,
};
export const KIND = {
  question: { label: 'Swali', color: '#1d4ed8' },
  poll: { label: 'Kura', color: '#c2410c' },
  discussion: { label: 'Mjadala', color: '#6d28d9' },
  experience: { label: 'Uzoefu', color: '#15803d' },
  offer: { label: 'Ofa', color: '#b4122f' },
};

export const KindIcon = ({ kind, size = 12, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[kind]}</svg>
);

export const KindPill = ({ kind }) => {
  const k = KIND[kind];
  if (!k) return null;
  return (
    <span data-testid="thread-kind" style={{ background: k.color, color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '0.03em', padding: '4px 10px',
      borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <KindIcon kind={kind} />{k.label.toUpperCase()}
    </span>
  );
};

/** "sasa hivi", "dk 5", "saa 3", "siku 2", or a date. */
export const shortAgo = (iso, now = Date.now()) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'sasa hivi';
  if (s < 3600) return `dk ${Math.floor(s / 60)}`;
  if (s < 86400) return `saa ${Math.floor(s / 3600)}`;
  if (s < 7 * 86400) return `siku ${Math.floor(s / 86400)}`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * What a card shows: its title (the caption's title, or the first line of the text) and a short
 * start of the rest, so one discussion is never read as one long sentence.
 */
export const threadWords = (post) => {
  const { lead, text } = formatCaption(post.title === 'Moment' ? '' : post.title, post.body);
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lead) return { title: lead, excerpt: lines.join(' ') };
  return { title: lines[0] || 'Chapisho', excerpt: lines.slice(1).join(' ') };
};
export const threadTitle = (post) => threadWords(post).title;

// Faces: a photo, or the first letter on a soft colour chosen from the name.
const FACE_BG = ['#d6e4f0', '#fde2c8', '#dff3e4', '#e9d5ff', '#fde68a', '#fecdd3'];
export const faceBg = (name) => FACE_BG[Array.from(String(name || '')).reduce((n, ch) => n + ch.charCodeAt(0), 0) % FACE_BG.length];
export const Face = ({ name, photo, size = 22, ring = false, overlap = false }) => (
  <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: faceBg(name), color: INK, flexShrink: 0, overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.45), fontWeight: 700,
    border: ring ? '2px solid #fff' : 'none', marginLeft: overlap ? -Math.round(size * 0.3) : 0, boxSizing: 'border-box' }}>
    {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (formatName(name) || 'M').charAt(0).toUpperCase()}
  </span>
);


const card = {
  background: '#fff', border: `1px solid ${CARD_LINE}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
  color: INK, boxShadow: '0 1px 2px rgba(15,20,25,0.06)', cursor: 'pointer', textAlign: 'left', minWidth: 0,
};

export const openOnKey = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

export const PollBars = ({ poll }) => {
  const options = Array.isArray(poll?.options) ? poll.options : [];
  if (!options.length) return null;
  const top = Math.max(...options.map((o) => (o.pct == null ? -1 : o.pct)));
  return (
    <span data-testid="thread-poll" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map((o, i) => (
        <span key={i} style={{ position: 'relative', minHeight: 34, borderRadius: 8, background: '#f7f9f9', border: o.pct == null ? `1px solid ${CARD_LINE}` : 'none',
          overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 14, fontWeight: o.pct != null && o.pct === top ? 700 : 600 }}>
          {o.pct != null && (
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${o.pct}%`, background: o.pct === top ? '#fed7aa' : '#e5e7eb' }} />
          )}
          <span style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatText(o.label)}</span>
          {o.pct != null && <span style={{ position: 'relative', marginLeft: 8 }}>{o.pct}%</span>}
        </span>
      ))}
    </span>
  );
};

export const ThreadCard = ({ post, onOpen, showCommunity = false, testId = null }) => {
  const { title, excerpt } = threadWords(post);
  const author = formatName(post.business?.storeName || post.business?.name) || 'Mwanachama';
  const isPoll = post.intent === 'poll' && post.poll;
  const photo = !isPoll ? postPhotos(post)[0]?.url : null;
  const people = Array.isArray(post.participants) ? post.participants : [];
  const replies = Number(post.replyCount || 0);
  const open = () => onOpen(post);
  const byline = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: MUTED, minWidth: 0 }}>
      <Face name={author} photo={post.business?.logo} />
      <b style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author}</b>
      {showCommunity && post.community?.name && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {formatName(post.community.name)}</span>
      )}
      {post.createdAt && <span style={{ flexShrink: 0 }}>· {shortAgo(post.createdAt)}</span>}
    </span>
  );
  let footer;
  if (isPoll) {
    const closed = post.poll.closed || pollTimeLeft(post.poll.closesAt) === 'imefungwa';
    footer = (
      <>
        <span>kura <b style={{ color: INK }}>{Number(post.poll.votes || 0)}</b> · {pollTimeLeft(post.poll.closesAt)}</span>
        <span style={{ marginLeft: 'auto', color: KIND.poll.color, fontWeight: 700, flexShrink: 0 }}>
          {closed ? 'Matokeo →' : post.poll.voted ? 'Umepiga kura' : 'Piga kura →'}
        </span>
      </>
    );
  } else if (replies === 0) {
    footer = (
      <>
        <span>{post.repliesLocked ? 'Majibu yamefungwa' : 'Bado hakuna jibu'}</span>
        {!post.repliesLocked && (
          <span data-testid="thread-first-reply" style={{ marginLeft: 'auto', background: BLUE, color: '#fff', fontWeight: 700, padding: '6px 12px', borderRadius: 999, flexShrink: 0 }}>
            Kuwa wa kwanza kujibu
          </span>
        )}
      </>
    );
  } else {
    const last = people[0]?.name ? formatName(people[0].name) : '';
    footer = (
      <>
        {people.length > 0 && (
          <span style={{ display: 'flex', flexShrink: 0 }}>
            {people.slice(0, 3).map((p, i) => <Face key={i} name={p.name} photo={p.photo} size={20} ring overlap={i > 0} />)}
          </span>
        )}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Majibu <b style={{ color: INK }}>{replies}</b>
          {post.lastReplyAt ? ` · la mwisho ${shortAgo(post.lastReplyAt)}` : ''}{last ? `, ${last}` : ''}
          {post.repliesLocked ? ' · imefungwa' : ''}
        </span>
        <span style={{ marginLeft: 'auto', color: LINK, fontWeight: 700, flexShrink: 0 }}>Soma →</span>
      </>
    );
  }
  return (
    <div role="link" tabIndex={0} data-testid={testId || `thread-${post.id}`} onClick={open} onKeyDown={openOnKey(open)} style={card}>
      {!!(KIND[post.intent] || post.bestCommentId || post.unread) && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <KindPill kind={post.intent} />
          {!!post.bestCommentId && (
            <span data-testid="thread-answered" style={{ background: '#ecfdf3', color: '#15803d', border: '1px solid #86d4a2', fontSize: 12, fontWeight: 800,
              padding: '3px 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>Imejibiwa
            </span>
          )}
          {post.unread && (
            <span data-testid="thread-unread" style={{ marginLeft: 'auto', background: BLUE, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999 }}>MPYA</span>
          )}
        </span>
      )}
      <span style={{ display: 'flex', gap: 12, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span data-testid="thread-title" style={{ fontSize: 17, lineHeight: '23px', fontWeight: 800, overflowWrap: 'anywhere', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{title}</span>
          {excerpt && !isPoll && (
            <span data-testid="thread-excerpt" style={{ fontSize: 14, lineHeight: '20px', color: MUTED, overflowWrap: 'anywhere', overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{excerpt}</span>
          )}
          {!isPoll && byline}
        </span>
        {photo && <img src={photo} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: '#d1d9e0' }} />}
      </span>
      {isPoll && <PollBars poll={post.poll} />}
      {isPoll && byline}
      <span data-testid="thread-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 10, minWidth: 0 }}>
        {footer}
      </span>
    </div>
  );
};

export const PinnedCard = ({ post, onOpen }) => {
  const author = formatName(post.business?.storeName || post.business?.name) || 'Msimamizi';
  const open = () => onOpen(post);
  return (
    <div role="link" tabIndex={0} data-testid={`thread-${post.id}`} onClick={open} onKeyDown={openOnKey(open)}
      style={{ ...card, background: '#fffbeb', border: '1px solid #f5d38a', gap: 8, boxShadow: 'none' }}>
      <span style={{ fontSize: 16, lineHeight: '22px', fontWeight: 800, overflowWrap: 'anywhere' }}>{threadTitle(post)}</span>
      <span style={{ fontSize: 13, color: MUTED }}>{author} · majibu <b style={{ color: INK }}>{Number(post.replyCount || 0)}</b></span>
    </div>
  );
};
