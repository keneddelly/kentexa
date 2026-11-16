/**
 * FeedTray.js — the rows Home places between posts (owner approved 2026-11-16). One look for every
 * tray: a title, a horizontal row of cards, "Ona zote →" when there is a full list, and for Android
 * visitors without the app a last card with Google Play.
 *  - ListTray:  pictures and names (offices, agents, service providers, hotels);
 *  - ArticleTray, QuestionTray, PollTray, HashtagTray: the conversation trays.
 */
import React from 'react';
import { formatName, formatText, formatTitle } from '../utils/kentexaText';
import { pollTimeLeft } from '../utils/feedPresentation';
import { PlayButton, showGetApp } from './GetAppStrip';
import { BookIcon, TEAL } from './ArticlePost';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#e1e8ed';

const Shell = ({ testid, title, sub, onSeeAll, children }) => (
  <section data-testid={testid} aria-label={title} style={{ background: '#fff', borderBottom: '1px solid #eff3f4', padding: '12px 0 14px' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0 16px 10px' }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <b style={{ fontSize: 17, color: INK }}>{title}</b>
        {sub && <span style={{ fontSize: 13, color: MUTED }}>{sub}</span>}
      </span>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} data-testid={`${testid}-all`}
          style={{ border: 'none', background: 'none', color: '#1a6fb0', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Ona zote →</button>
      )}
    </div>
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
      {children}
      {showGetApp() && (
        <div data-testid={`${testid}-get-app`} style={{ flex: '0 0 150px', border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 14, padding: 12,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, color: INK, lineHeight: '18px' }}>Pata haya yote kwenye app ya KenteXa</span>
          <PlayButton />
        </div>
      )}
    </div>
  </section>
);

const card = (w = 150) => ({
  flex: `0 0 ${w}px`, border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', background: '#fff', textAlign: 'left',
  cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', flexDirection: 'column',
});

/** Pictures and names: offices, agents, service providers, hotels. */
export const ListTray = ({ testid, title, sub, items, onOpen, onSeeAll, round = false }) => {
  if (!items?.length) return null;
  return (
    <Shell testid={testid} title={title} sub={sub} onSeeAll={onSeeAll}>
      {items.map((it) => (
        <button key={it.key} type="button" onClick={() => onOpen(it)} style={card()}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 104, background: '#f7f9f9' }}>
            {it.image
              ? <img src={it.image} alt="" style={round ? { width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' } : { width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ width: 64, height: 64, borderRadius: round ? '50%' : 14, background: '#d6e4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: INK }}>{(formatName(it.name) || 'K').charAt(0)}</span>}
          </span>
          <span style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <b style={{ fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(it.name)}</b>
            {it.line && <span style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.line}</span>}
          </span>
        </button>
      ))}
    </Shell>
  );
};

/** Makala bora: cover, title, reading time. */
export const ArticleTray = ({ items, onNavigate }) => {
  if (!items?.length) return null;
  return (
    <Shell testid="tray-articles" title="Makala bora" sub="Zinazosomwa zaidi wiki hii">
      {items.map((a) => (
        <button key={a.id} type="button" onClick={() => onNavigate(`PostDetail-${a.id}`)} style={card(220)}>
          <span style={{ height: 110, background: a.cover ? '#f1f5f9' : 'linear-gradient(135deg,#134e4a,#0f766e 55%,#5eead4)', display: 'block', position: 'relative' }}>
            {a.cover && <img src={a.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            <span style={{ position: 'absolute', left: 8, bottom: 8, background: TEAL, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <BookIcon size={10} />MAKALA
            </span>
          </span>
          <span style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <b style={{ fontSize: 14, lineHeight: '19px', color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{formatTitle(a.title)}</b>
            <span style={{ fontSize: 12, color: MUTED }}>{formatName(a.owner)} · dakika {a.minutes}</span>
          </span>
        </button>
      ))}
    </Shell>
  );
};

const TalkCard = ({ testid, words, owner, community, footer, action, color, onOpen }) => (
  <button type="button" data-testid={testid} onClick={onOpen}
    style={{ ...card(240), padding: 12, gap: 8, justifyContent: 'space-between' }}>
    <span style={{ fontSize: 15, lineHeight: '20px', fontWeight: 700, color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>
      {formatText(words)}
    </span>
    <span style={{ fontSize: 12, color: MUTED }}>{formatName(owner)}{community ? ` · ${formatName(community)}` : ''}</span>
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: MUTED }}>
      <span>{footer}</span>
      <span style={{ background: color, color: '#fff', fontWeight: 700, fontSize: 13, padding: '5px 12px', borderRadius: 999 }}>{action}</span>
    </span>
  </button>
);

/** Maswali yasiyojibiwa: be the first to answer. */
export const QuestionTray = ({ items, onNavigate }) => {
  if (!items?.length) return null;
  return (
    <Shell testid="tray-questions" title="Maswali yasiyojibiwa" sub="Kuwa wa kwanza kujibu">
      {items.map((q) => (
        <TalkCard key={q.id} testid={`tray-question-${q.id}`} words={q.words} owner={q.owner} community={q.community}
          footer="Bado hakuna jibu" action="Jibu" color="#1d4ed8" onOpen={() => onNavigate(`PostDetail-${q.id}-comments`)} />
      ))}
    </Shell>
  );
};

/** Kura zinazoendelea: open polls. */
export const PollTray = ({ items, onNavigate }) => {
  if (!items?.length) return null;
  return (
    <Shell testid="tray-polls" title="Kura zinazoendelea" sub="Toa maoni yako kwa kubonyeza mara moja">
      {items.map((p) => (
        <TalkCard key={p.id} testid={`tray-poll-${p.id}`} words={p.words} owner={p.owner} community={p.community}
          footer={`kura ${p.votes} · ${pollTimeLeft(p.closesAt)}`} action="Piga kura" color="#c2410c" onOpen={() => onNavigate(`PostDetail-${p.id}`)} />
      ))}
    </Shell>
  );
};

/** Hashtag zinazovuma: chips that open the tag's page. */
export const HashtagTray = ({ items, onNavigate }) => {
  if (!items?.length) return null;
  return (
    <Shell testid="tray-hashtags" title="Hashtag zinazovuma" sub="Wiki hii kwenye KenteXa">
      {items.map((h) => (
        <button key={h.key} type="button" data-testid={`tray-tag-${h.key}`} onClick={() => onNavigate(`Tag-${h.key}`)}
          style={{ flex: '0 0 auto', border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <b style={{ fontSize: 15, color: '#1d9bf0' }}>#{h.display || h.key}</b>
          <span style={{ display: 'block', fontSize: 12, color: MUTED }}>machapisho {h.posts}</span>
        </button>
      ))}
    </Shell>
  );
};
