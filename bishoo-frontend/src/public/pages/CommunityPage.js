/**
 * CommunityPage.js — one community (Jumuiya). Social Home part 3 (owner approved 2026-11-02),
 * rebuilt for discussion in issue #374 part D, and redesigned as a discussion community in D2
 * (mockup v2, owner approved 2026-11-16):
 *  - a cover band with back / search / share / ⋯; under it a white header: the community's icon
 *    beside its name (never over the cover), kind and topic, purpose, a row of member faces,
 *    and Umejiunga (or Jiunge) / Alika / Kanuni;
 *  - when scrolled, a compact bar with the icon, name and member count stays on top with the tabs;
 *  - members get a writing card with three coloured starts: Swali, Kura, Mjadala;
 *  - tabs Mijadala / Maswali / Kura / Wanachama, and Mpya / Zinazovuma / Hazijajibiwa;
 *  - every discussion is its own card: a solid coloured kind label, Imejibiwa or MPYA, the title,
 *    a short start of the text, who wrote it, who is replying, and "Kuwa wa kwanza kujibu" when
 *    nobody has replied yet. Polls show their bars where the poll itself shows results.
 *  - pinned discussions sit together at the top, in yellow.
 * Names follow the KenteXa name style (each word with a capital). What the viewer may see is
 * decided by the server.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/api';
import { pollTimeLeft, postPhotos, topicLabel } from '../utils/feedPresentation';
import { formatCaption, formatName, formatText } from '../utils/kentexaText';
import ShareSheet from '../components/ShareSheet';
import ShareResult from '../components/ShareResult';
import { askToJoin } from '../utils/guestJoin';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const CARD_LINE = '#e1e8ed';
const BORDER = '#cfd9de';
const BLUE = '#1d9bf0';
const LINK = '#1a6fb0';
const GROUND = '#eef1f4';

const TABS = [
  { key: 'all', label: 'Mijadala' },
  { key: 'question', label: 'Maswali' },
  { key: 'poll', label: 'Kura' },
  { key: 'members', label: 'Wanachama' },
];

const SORTS = [
  { key: 'latest', label: 'Mpya' },
  { key: 'top', label: 'Zinazovuma' },
  { key: 'unanswered', label: 'Hazijajibiwa' },
];

// A cover colour per community (stable: from its id), from KenteXa's palette.
const COVERS = ['#1d4ed8', '#0f766e', '#7c2d12', '#0f1419', '#6d28d9', '#b45309'];
export const coverColor = (id) => COVERS[Math.abs(Number(id) || 0) % COVERS.length];

export const initials = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'J';
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
};

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

const KindIcon = ({ kind, size = 12, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[kind]}</svg>
);

const KindPill = ({ kind }) => {
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
const faceBg = (name) => FACE_BG[Array.from(String(name || '')).reduce((n, ch) => n + ch.charCodeAt(0), 0) % FACE_BG.length];
const Face = ({ name, photo, size = 22, ring = false, overlap = false }) => (
  <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: faceBg(name), color: INK, flexShrink: 0, overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.45), fontWeight: 700,
    border: ring ? '2px solid #fff' : 'none', marginLeft: overlap ? -Math.round(size * 0.3) : 0, boxSizing: 'border-box' }}>
    {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (formatName(name) || 'M').charAt(0).toUpperCase()}
  </span>
);

const pill = (dark) => ({
  minHeight: 40, padding: '0 16px', borderRadius: 999, border: dark ? 'none' : `1px solid ${BORDER}`,
  background: dark ? INK : '#fff', color: dark ? '#fff' : INK, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
});

const card = {
  background: '#fff', border: `1px solid ${CARD_LINE}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
  color: INK, boxShadow: '0 1px 2px rgba(15,20,25,0.06)', cursor: 'pointer', textAlign: 'left', minWidth: 0,
};

const openOnKey = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

const PollBars = ({ poll }) => {
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

const ThreadCard = ({ post, onOpen }) => {
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
      <span style={{ flexShrink: 0 }}>· {shortAgo(post.createdAt)}</span>
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
    <div role="link" tabIndex={0} data-testid={`thread-${post.id}`} onClick={open} onKeyDown={openOnKey(open)} style={card}>
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

const PinnedCard = ({ post, onOpen }) => {
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

const PinIcon = ({ color = MUTED }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" /></svg>
);

const roundBtn = (dark) => ({
  width: 36, height: 36, borderRadius: '50%', border: 'none', background: dark ? 'rgba(15,20,25,0.45)' : 'none', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
});
const SearchIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
);
const DotsIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={color} aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
);

export default function CommunityPage({ communityId, onNavigate, isLoggedIn, currentUser, onOpenMoment }) {
  const [community, setCommunity] = useState(null);
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('latest');
  const [threads, setThreads] = useState([]);
  const [total, setTotal] = useState(0);
  const [unanswered, setUnanswered] = useState(0);
  const [page, setPage] = useState(1);
  const [listState, setListState] = useState('loading');
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const headRef = useRef(null);

  const load = useCallback(() => {
    setState('loading');
    api.get(`/communities/${communityId}`)
      .then((r) => { setCommunity(r.data); setState('ready'); })
      .catch(() => setState('missing'));
  }, [communityId]);
  useEffect(() => { load(); }, [load]);

  const isMember = community?.myStatus === 'active';
  const isModerator = isMember && ['admin', 'helper'].includes(community?.myRole);
  const isAdmin = isMember && community?.myRole === 'admin';
  const canRead = community && (community.joinPolicy === 'open' || isMember);

  const loadThreads = useCallback((p) => {
    const params = { page: p, ...(tab === 'all' ? {} : { kind: tab }), ...(sort === 'latest' ? {} : { sort }), ...(query ? { q: query } : {}) };
    return api.get(`/communities/${communityId}/threads`, { params })
      .then((r) => {
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setThreads((prev) => (p === 1 ? items : [...prev, ...items.filter((i) => !prev.some((x) => x.id === i.id))]));
        setTotal(Number(r.data?.total || 0));
        setUnanswered(Number(r.data?.unanswered || 0));
        setPage(p);
        setListState('ready');
      })
      .catch(() => setListState('error'));
  }, [communityId, tab, sort, query]);

  useEffect(() => {
    if (!community || !canRead || tab === 'members') return;
    setListState('loading');
    loadThreads(1);
  }, [community?.id, canRead, tab, loadThreads]); // eslint-disable-line react-hooks/exhaustive-deps

  // Members: the faces in the header and the Wanachama tab.
  useEffect(() => {
    if (!community || !canRead) { setMembers([]); return; }
    api.get(`/communities/${communityId}/members`).then((r) => setMembers(Array.isArray(r.data) ? r.data : [])).catch(() => setMembers([]));
  }, [community?.id, community?.memberCount, canRead, communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isModerator) { setRequests([]); return; }
    api.get(`/communities/${communityId}/requests`).then((r) => setRequests(Array.isArray(r.data) ? r.data : [])).catch(() => setRequests([]));
  }, [isModerator, communityId]);

  // The compact bar: shown once the header has scrolled away.
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setCompact(!!e && !e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  // Search: what is typed is looked up after a short pause.
  useEffect(() => {
    const words = searchText.trim();
    const id = setTimeout(() => setQuery(words.length >= 2 ? words : ''), 350);
    return () => clearTimeout(id);
  }, [searchText]);

  // Viral engine B (#381): a guest is invited to join right here and comes back to this community.
  const askGuest = () => {
    if (!askToJoin({ action: 'join', destination: `Community-${communityId}`, people: [], replies: 0 })) onNavigate('PublicLogin');
  };
  const act = async (path) => {
    if (!isLoggedIn) { askGuest(); return; }
    setBusy(true); setError(''); setMenu(false);
    try { const r = await api.post(`/communities/${communityId}/${path}`); setCommunity(r.data); }
    catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
    finally { setBusy(false); }
  };
  const decide = async (userId, approve) => {
    try {
      await api.post(`/communities/${communityId}/requests/${userId}`, { approve });
      setRequests((prev) => prev.filter((x) => Number(x.userId) !== Number(userId)));
      if (approve) setCommunity((c) => ({ ...c, memberCount: (c.memberCount || 0) + 1 }));
    } catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
  };
  const setHelper = async (m, helper) => {
    try {
      await api.post(`/communities/${communityId}/helpers/${m.userId}`, { helper });
      setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role: helper ? 'helper' : 'member' } : x)));
    } catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
  };
  const write = (kind) => {
    if (!isLoggedIn) { askGuest(); return; }
    onOpenMoment?.('moment', kind ? { communityId: community.id, kind } : { communityId: community.id });
  };
  const openThread = (post) => onNavigate(`PostDetail-${post.id}`);
  const toggleSearch = () => {
    if (searchOpen) { setSearchText(''); setQuery(''); }
    setSearchOpen(!searchOpen);
    if (tab === 'members') setTab('all');
  };

  // Viral engine C10: an open community is shared through the smart share sheet.
  const canShare = community?.joinPolicy === 'open';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviting, setInviting] = useState(false); // C12: a member inviting friends (own message)
  const share = () => { setInviting(false); setSheetOpen(true); };
  const invite = () => { setInviting(true); setSheetOpen(true); };
  // C12: what invitations brought, for the community's moderators (numbers only, never names).
  const [invites, setInvites] = useState(null);
  useEffect(() => {
    if (!isModerator || !canShare) { setInvites(null); return undefined; }
    let alive = true;
    Promise.resolve().then(() => api.get(`/communities/${communityId}/invitations`))
      .then((r) => { if (alive) setInvites(r?.data || null); }).catch(() => {});
    return () => { alive = false; };
  }, [isModerator, canShare, communityId]);

  if (state === 'loading') return <div style={{ padding: 24, color: MUTED }}>Inapakia...</div>;
  if (state === 'missing' || !community) {
    return (
      <div data-testid="community-missing" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Jumuiya haipatikani</div>
        <button type="button" onClick={() => onNavigate('Home')} style={{ ...pill(true), marginTop: 14 }}>Nenda Mwanzo</button>
      </div>
    );
  }

  const name = formatName(community.name);
  const memberCount = Number(community.memberCount || 0);
  const joinLabel = community.myStatus === 'pending' ? 'Ombi limetumwa' : community.joinPolicy === 'request' ? 'Omba kujiunga' : 'Jiunge';
  const hasMore = tab !== 'members' && listState === 'ready' && threads.length < total;
  const shownSorts = SORTS.filter((s) => !(tab === 'poll' && s.key === 'unanswered'));
  const pinned = sort === 'latest' && !query ? threads.filter((t) => t.pinned) : [];
  const rest = threads.filter((t) => !pinned.includes(t));
  const faces = members.slice(0, 3);
  const named = members.slice(0, 2).map((m) => formatName(m.name)).filter(Boolean);
  const others = Math.max(0, memberCount - named.length);

  const menuItems = [
    community.rules && { key: 'rules', label: 'Kanuni za jumuiya', run: () => { setShowRules(true); setMenu(false); } },
    { key: 'members', label: 'Wanachama', run: () => { setTab('members'); setMenu(false); } },
    isMember && !isAdmin && { key: 'leave', label: 'Ondoka kwenye jumuiya', danger: true, run: () => act('leave') },
  ].filter(Boolean);

  const tabsAndSort = (
    <>
      <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-testid={`community-tab-${t.key}`} onClick={() => setTab(t.key)}
            style={{ flex: 1, position: 'relative', height: 46, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 15, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? INK : MUTED, whiteSpace: 'nowrap' }}>
            {t.label}
            <span aria-hidden="true" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 48, height: 3, borderRadius: 2, background: tab === t.key ? BLUE : 'transparent' }} />
          </button>
        ))}
      </div>
      {tab !== 'members' && (
        <div role="radiogroup" aria-label="Panga" style={{ display: 'flex', gap: 8, padding: '10px 16px', overflowX: 'auto' }}>
          {shownSorts.map((s) => {
            const on = sort === s.key;
            return (
              <button key={s.key} type="button" role="radio" aria-checked={on} data-testid={`community-sort-${s.key}`} onClick={() => setSort(s.key)}
                style={{ height: 32, padding: '0 14px', borderRadius: 999, border: on ? 'none' : `1px solid ${BORDER}`, background: on ? INK : '#fff',
                  color: on ? '#fff' : INK, fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {s.label}{s.key === 'unanswered' && unanswered > 0 ? ` · ${unanswered}` : ''}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: GROUND, borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, paddingBottom: 80 }}>
      {/* Cover band: never covers the community's icon. */}
      <div data-testid="community-cover" style={{ height: 'calc(112px + env(safe-area-inset-top, 0px))', background: coverColor(community.id), position: 'relative' }}>
        <div style={{ position: 'absolute', left: 12, right: 12, top: 'calc(12px + env(safe-area-inset-top, 0px))', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Rudi" onClick={() => onNavigate('back')} style={roundBtn(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span style={{ flex: 1 }} />
          {canRead && (
            <button type="button" aria-label="Tafuta kwenye jumuiya" data-testid="community-search-open" onClick={toggleSearch} style={roundBtn(true)}><SearchIcon color="#fff" /></button>
          )}
          {canShare && (
            <button type="button" aria-label="Shiriki jumuiya" data-testid="community-share" onClick={share} style={roundBtn(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden="true"><path d="M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13" /></svg>
            </button>
          )}
          <button type="button" aria-label="Zaidi" data-testid="community-menu" onClick={() => setMenu((v) => !v)} style={roundBtn(true)}><DotsIcon color="#fff" /></button>
        </div>
      </div>

      {menu && (
        <div role="menu" data-testid="community-menu-list" style={{ position: 'fixed', right: 'max(12px, calc(50% - 288px))', top: 'calc(56px + env(safe-area-inset-top, 0px))', zIndex: 40, minWidth: 220,
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 28px rgba(15,20,25,0.18)', padding: 6, display: 'flex', flexDirection: 'column' }}>
          {menuItems.map((it) => (
            <button key={it.key} type="button" role="menuitem" data-testid={it.key === 'leave' ? 'community-leave' : `menu-${it.key}`} disabled={busy} onClick={it.run}
              style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 600,
                color: it.danger ? '#b4122f' : INK, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }}>
              {it.label}
            </button>
          ))}
        </div>
      )}

      <div ref={headRef} data-testid="community-head" style={{ background: '#fff', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${CARD_LINE}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 16, background: INK, color: '#fff', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{initials(name)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 21, lineHeight: '26px', fontWeight: 800, color: INK, overflowWrap: 'anywhere' }}>{name}</h1>
            <span data-testid="community-kind" style={{ fontSize: 14, color: MUTED }}>
              {community.joinPolicy === 'request' ? 'Jumuiya ya wanachama tu' : 'Jumuiya ya umma'} · {topicLabel(community.topicKey)}
            </span>
          </div>
        </div>
        {community.purpose && <div style={{ fontSize: 15, lineHeight: '21px', color: INK }}>{formatText(community.purpose)}</div>}
        <div data-testid="community-people" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: MUTED }}>
          {faces.length > 0 && (
            <span style={{ display: 'flex', flexShrink: 0 }}>
              {faces.map((m, i) => <Face key={m.userId || i} name={m.name} photo={m.photo} size={26} ring overlap={i > 0} />)}
            </span>
          )}
          <span>
            {named.length ? (
              <><b style={{ color: INK }}>{named.join(', ')}</b>{others > 0 ? <> na wengine <b style={{ color: INK }}>{others.toLocaleString('en-US')}</b></> : ''} ni wanachama</>
            ) : (
              <>wanachama <b style={{ color: INK }}>{memberCount.toLocaleString('en-US')}</b></>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isMember ? (
            <button type="button" data-testid="community-join" disabled={busy || community.myStatus === 'pending'} onClick={() => act('join')}
              style={{ ...pill(community.myStatus !== 'pending'), flex: 1, opacity: community.myStatus === 'pending' ? 0.7 : 1 }}>
              {joinLabel}
            </button>
          ) : (
            <>
              <button type="button" data-testid="community-joined" onClick={() => setMenu((v) => !v)} style={{ ...pill(false), flex: 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.6" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                Umejiunga
              </button>
              {canShare && (
                <button type="button" data-testid="community-invite" onClick={invite} style={{ ...pill(false), flex: 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" /></svg>
                  Alika
                </button>
              )}
            </>
          )}
          {community.rules && (
            <button type="button" data-testid="community-rules-toggle" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}
              style={{ ...pill(false), border: 'none', background: '#f7f9f9', padding: '0 14px', fontSize: 14 }}>
              Kanuni
            </button>
          )}
        </div>
        {showRules && community.rules && (
          <div data-testid="community-rules" style={{ fontSize: 14, color: INK, background: '#f7f9f9', borderRadius: 12, padding: '10px 12px', whiteSpace: 'pre-wrap', lineHeight: '20px' }}>
            {formatText(community.rules)}
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
        {canShare && <ShareResult contentType="community" contentId={community.id} isLoggedIn={isLoggedIn} />}
        {invites && invites.links > 0 && (
          <div data-testid="community-invitations" style={{ fontSize: 13, color: MUTED }}>
            Mialiko ya wanachama: wamefungua <b style={{ color: INK }}>{invites.opens}</b> · wamejiunga <b style={{ color: INK }}>{invites.joined}</b>
          </div>
        )}
        {sheetOpen && (
          <ShareSheet open onClose={() => setSheetOpen(false)} contentType="community" contentId={community.id} words={name} invite={inviting}
            purpose={formatText(community.purpose)} plainUrl={`${window.location.origin}/community/${community.id}`} />
        )}
      </div>

      {isModerator && requests.length > 0 && (
        <div data-testid="community-requests" style={{ background: '#fff', marginTop: 10, padding: '10px 16px', borderTop: `1px solid ${CARD_LINE}`, borderBottom: `1px solid ${CARD_LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 14, color: INK }}>Maombi ya kujiunga ({requests.length})</strong>
          {requests.map((r) => (
            <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
              <span style={{ flex: 1, minWidth: 0, color: INK }}>{formatName(r.name)}</span>
              <button type="button" data-testid={`approve-${r.userId}`} onClick={() => decide(r.userId, true)} style={{ ...pill(true), minHeight: 36 }}>Kubali</button>
              <button type="button" onClick={() => decide(r.userId, false)} style={{ ...pill(false), minHeight: 36 }}>Kataa</button>
            </div>
          ))}
        </div>
      )}

      {canRead ? (
        <>
          {isMember && (
            <div data-testid="community-composer" style={{ background: '#fff', marginTop: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10,
              borderTop: `1px solid ${CARD_LINE}`, borderBottom: `1px solid ${CARD_LINE}` }}>
              <button type="button" data-testid="community-post" onClick={() => write(null)}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <Face name={currentUser?.name || 'U'} photo={currentUser?.avatarUrl} size={36} />
                <span style={{ flex: 1, height: 42, borderRadius: 21, background: '#f7f9f9', border: `1px solid ${CARD_LINE}`, color: MUTED, fontSize: 15,
                  display: 'flex', alignItems: 'center', padding: '0 14px' }}>Anzisha mjadala…</span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {['question', 'poll', 'discussion'].map((k) => (
                  <button key={k} type="button" data-testid={`community-start-${k}`} onClick={() => write(k)}
                    style={{ height: 40, borderRadius: 12, border: 'none', background: KIND[k].color, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
                    <KindIcon kind={k} size={16} />{KIND[k].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabs and sorting stay on top while reading; once the header is gone, the community's name joins them. */}
          <div data-testid="community-bar" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', marginTop: 10, borderTop: `1px solid ${CARD_LINE}`, borderBottom: `1px solid ${CARD_LINE}` }}>
            {compact && (
              <div data-testid="community-compact" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: 'env(safe-area-inset-top, 0px) 8px 0', borderBottom: `1px solid ${LINE}` }}>
                <button type="button" aria-label="Rudi" onClick={() => onNavigate('back')} style={roundBtn(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: INK, color: '#fff', fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(name)}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <b style={{ fontSize: 16, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</b>
                  <span style={{ fontSize: 12, color: MUTED }}>wanachama {memberCount.toLocaleString('en-US')}</span>
                </span>
                <button type="button" aria-label="Tafuta kwenye jumuiya" onClick={() => { setSearchOpen(true); if (tab === 'members') setTab('all'); window.scrollTo?.(0, 0); }} style={roundBtn(false)}><SearchIcon color={INK} /></button>
                <button type="button" aria-label="Zaidi" onClick={() => setMenu((v) => !v)} style={roundBtn(false)}><DotsIcon color={MUTED} /></button>
              </div>
            )}
            {searchOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 0' }}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, background: '#f7f9f9', border: `1px solid ${CARD_LINE}`, padding: '0 12px' }}>
                  <SearchIcon color={MUTED} />
                  <input data-testid="community-search" type="search" autoFocus value={searchText} onChange={(e) => setSearchText(e.target.value)}
                    placeholder={`Tafuta kwenye ${name}`} aria-label="Tafuta kwenye jumuiya"
                    style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: 15, color: INK, fontFamily: 'inherit' }} />
                </span>
                <button type="button" data-testid="community-search-close" onClick={toggleSearch}
                  style={{ border: 'none', background: 'none', color: LINK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Funga</button>
              </div>
            )}
            {tabsAndSort}
          </div>

          {tab === 'members' ? (
            <div data-testid="community-members" style={{ background: '#fff', borderBottom: `1px solid ${CARD_LINE}` }}>
              {members.map((m) => {
                const mName = formatName(m.name) || 'Mwanachama';
                return (
                  <div key={m.userId} style={{ padding: '10px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
                    <Face name={mName} photo={m.photo} size={40} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <b style={{ color: INK, fontSize: 15 }}>{mName}</b>
                      {m.role !== 'member' && <span style={{ color: MUTED, fontSize: 13 }}>{m.role === 'admin' ? 'Msimamizi' : 'Msaidizi'}</span>}
                    </span>
                    {isAdmin && m.role !== 'admin' && (
                      <button type="button" data-testid={`helper-${m.userId}`} onClick={() => setHelper(m, m.role !== 'helper')} style={{ ...pill(false), minHeight: 32, padding: '0 12px', fontSize: 13 }}>
                        {m.role === 'helper' ? 'Ondoa usaidizi' : 'Mfanye msaidizi'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : listState === 'loading' ? (
            <div style={{ padding: 24, color: MUTED, fontSize: 15 }}>Inapakia...</div>
          ) : listState === 'error' ? (
            <div role="alert" style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 15 }}>
              Imeshindikana kupakia.{' '}
              <button type="button" onClick={() => { setListState('loading'); loadThreads(1); }} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>Jaribu tena</button>
            </div>
          ) : threads.length === 0 ? (
            <div data-testid="community-empty" style={{ padding: 24, color: MUTED, fontSize: 15, textAlign: 'center' }}>
              {query ? `Hakuna kilichopatikana kwa "${query}".`
                : sort === 'unanswered' ? 'Kila swali hapa limepata jibu.'
                  : `Bado hakuna mazungumzo hapa.${isMember ? ' Anzisha la kwanza.' : ''}`}
            </div>
          ) : (
            <div data-testid="community-threads" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
              {pinned.length > 0 && (
                <>
                  <div data-testid="community-pinned" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: MUTED, padding: '0 4px' }}>
                    <PinIcon />IMEBANDIKWA
                  </div>
                  {pinned.map((p) => <PinnedCard key={p.id} post={p} onOpen={openThread} />)}
                </>
              )}
              {rest.map((p) => <ThreadCard key={p.id} post={p} onOpen={openThread} />)}
            </div>
          )}
          {hasMore && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button type="button" data-testid="community-more" onClick={() => loadThreads(page + 1)} style={pill(false)}>Onyesha zaidi</button>
            </div>
          )}
        </>
      ) : (
        <div data-testid="community-members-only" style={{ background: '#fff', marginTop: 10, padding: 24, color: MUTED, fontSize: 15, textAlign: 'center' }}>
          Mazungumzo ya jumuiya hii ni ya wanachama tu.
        </div>
      )}
    </div>
  );
}
