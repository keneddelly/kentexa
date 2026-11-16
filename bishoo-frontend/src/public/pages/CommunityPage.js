/**
 * CommunityPage.js — one community (Jumuiya). Social Home part 3 (owner approved 2026-11-02),
 * rebuilt for discussion in issue #374 part D (owner approved 2026-11-16):
 *  - a header with a cover colour and the community's icon, name, topic, members, purpose,
 *    "Kanuni za jumuiya", Jiunge / Umejiunga, and a ⋯ menu (Kanuni, Wanachama, Ondoka);
 *  - members get an "Andika kwenye jumuiya…" box;
 *  - tabs Mijadala / Maswali / Kura / Wanachama;
 *  - threads as a list: pinned first, then the latest activity; each row shows its kind, its
 *    title, who wrote it, the number of replies and the time of the last reply, and a dot when
 *    it has news since your last visit. Tapping a row opens the discussion (the post page).
 * What the viewer may see is decided by the server.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { pollTimeLeft, topicLabel } from '../utils/feedPresentation';
import { formatCaption, formatName, formatText } from '../utils/kentexaText';
import ShareSheet from '../components/ShareSheet';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BORDER = '#cfd9de';
const BLUE = '#1d9bf0';

const TABS = [
  { key: 'all', label: 'Mijadala' },
  { key: 'question', label: 'Maswali' },
  { key: 'poll', label: 'Kura' },
  { key: 'members', label: 'Wanachama' },
];

// A cover colour per community (stable: from its id), from KenteXa's palette.
const COVERS = ['#1d4ed8', '#0f766e', '#7c2d12', '#0f1419', '#6d28d9', '#b45309'];
export const coverColor = (id) => COVERS[Math.abs(Number(id) || 0) % COVERS.length];

export const initials = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'J';
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
};

const KIND = {
  question: { label: 'Swali', bg: '#e8f5fd', color: '#1a6fb0' },
  poll: { label: 'Kura', bg: '#fff4e5', color: '#9a4d00' },
  discussion: { label: 'Mjadala', bg: '#eef1f3', color: '#3c4a55' },
  offer: { label: 'Ofa', bg: '#fdecef', color: '#b4122f' },
  experience: { label: 'Uzoefu', bg: '#ecfdf3', color: '#1d6b39' },
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

/** The words a thread row shows: the caption's title, or the start of its text. */
export const threadTitle = (post) => {
  const { lead, text } = formatCaption(post.title === 'Moment' ? '' : post.title, post.body);
  return lead || String(text || '').split('\n')[0] || 'Chapisho';
};

const pill = (dark) => ({
  minHeight: 36, padding: '0 16px', borderRadius: 999, border: dark ? 'none' : `1px solid ${BORDER}`,
  background: dark ? INK : '#fff', color: dark ? '#fff' : INK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
});

const ThreadRow = ({ post, onOpen }) => {
  const kind = KIND[post.intent];
  const author = formatName(post.business?.storeName || post.business?.name) || 'Mwanachama';
  const isPoll = post.intent === 'poll' && post.poll;
  return (
    <button type="button" data-testid={`thread-${post.id}`} onClick={() => onOpen(post)}
      style={{ width: '100%', display: 'flex', gap: 10, padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
        background: post.pinned ? '#f7fbff' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
      {!post.pinned && (
        <span aria-label={post.unread ? 'Kuna mapya' : undefined} data-testid={post.unread ? 'thread-unread' : undefined}
          style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 7, flexShrink: 0, background: post.unread ? BLUE : 'transparent' }} />
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {post.pinned && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" /></svg>
            Imebandikwa na msimamizi
          </span>
        )}
        <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
          {kind && (
            <span style={{ flexShrink: 0, background: kind.bg, color: kind.color, fontWeight: 700, borderRadius: 4, padding: '1px 6px', fontSize: 12, marginTop: 2 }}>
              {kind.label}
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: INK, lineHeight: '20px', overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{threadTitle(post)}</span>
        </span>
        <span data-testid="thread-meta" style={{ fontSize: 13, color: MUTED }}>
          {author}
          {isPoll ? (
            <> · kura <b style={{ color: INK }}>{post.poll.votes}</b> · {pollTimeLeft(post.poll.closesAt)}</>
          ) : (
            <> · majibu <b style={{ color: INK }}>{post.replyCount || 0}</b>
              {post.lastReplyAt ? ` · jibu la mwisho ${shortAgo(post.lastReplyAt)}` : ` · ${shortAgo(post.createdAt)}`}</>
          )}
          {post.repliesLocked ? ' · imefungwa' : ''}
        </span>
      </span>
    </button>
  );
};

export default function CommunityPage({ communityId, onNavigate, isLoggedIn, currentUser, onOpenMoment }) {
  const [community, setCommunity] = useState(null);
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('all');
  const [threads, setThreads] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listState, setListState] = useState('loading');
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);

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
    const params = { page: p, ...(tab === 'all' ? {} : { kind: tab }) };
    return api.get(`/communities/${communityId}/threads`, { params })
      .then((r) => {
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setThreads((prev) => (p === 1 ? items : [...prev, ...items.filter((i) => !prev.some((x) => x.id === i.id))]));
        setTotal(Number(r.data?.total || 0));
        setPage(p);
        setListState('ready');
      })
      .catch(() => setListState('error'));
  }, [communityId, tab]);

  useEffect(() => {
    if (!community || !canRead) { setThreads([]); setMembers([]); return; }
    if (tab === 'members') {
      api.get(`/communities/${communityId}/members`).then((r) => setMembers(Array.isArray(r.data) ? r.data : [])).catch(() => setMembers([]));
      return;
    }
    setListState('loading');
    loadThreads(1);
  }, [community?.id, canRead, tab, communityId, loadThreads]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isModerator) { setRequests([]); return; }
    api.get(`/communities/${communityId}/requests`).then((r) => setRequests(Array.isArray(r.data) ? r.data : [])).catch(() => setRequests([]));
  }, [isModerator, communityId]);

  const act = async (path) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
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
  const write = () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    onOpenMoment?.('moment', { communityId: community.id });
  };
  const openThread = (post) => onNavigate(`PostDetail-${post.id}`);

  // Viral engine C10: an open community is shared through the smart share sheet.
  const canShare = community?.joinPolicy === 'open';
  const [sheetOpen, setSheetOpen] = useState(false);
  const share = () => setSheetOpen(true);

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
  const joinLabel = community.myStatus === 'pending' ? 'Ombi limetumwa' : community.joinPolicy === 'request' ? 'Omba kujiunga' : 'Jiunge';
  const roundBtn = { position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', width: 36, height: 36, borderRadius: '50%', border: 'none',
    background: 'rgba(15,20,25,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  const hasMore = tab !== 'members' && listState === 'ready' && threads.length < total;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, paddingBottom: 80 }}>
      <div data-testid="community-cover" style={{ height: 'calc(96px + env(safe-area-inset-top, 0px))', background: coverColor(community.id), position: 'relative' }}>
        <button type="button" aria-label="Rudi" onClick={() => onNavigate('back')} style={{ ...roundBtn, left: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {canShare && (
          <button type="button" aria-label="Shiriki jumuiya" data-testid="community-share" onClick={share} style={{ ...roundBtn, right: 56 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden="true"><path d="M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13" /></svg>
          </button>
        )}
        <button type="button" aria-label="Zaidi" data-testid="community-menu" onClick={() => setMenu((v) => !v)} style={{ ...roundBtn, right: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
        {menu && (
          <div role="menu" data-testid="community-menu-list" style={{ position: 'absolute', right: 12, top: 'calc(52px + env(safe-area-inset-top, 0px))', zIndex: 20, minWidth: 200,
            background: '#fff', borderRadius: 12, boxShadow: '0 8px 28px rgba(15,20,25,0.18)', padding: 6, display: 'flex', flexDirection: 'column' }}>
            {[
              community.rules && { key: 'rules', label: 'Kanuni za jumuiya', run: () => { setShowRules(true); setMenu(false); } },
              { key: 'members', label: 'Wanachama', run: () => { setTab('members'); setMenu(false); } },
              isMember && !isAdmin && { key: 'leave', label: 'Ondoka kwenye jumuiya', danger: true, run: () => act('leave') },
            ].filter(Boolean).map((it) => (
              <button key={it.key} type="button" role="menuitem" data-testid={it.key === 'leave' ? 'community-leave' : `menu-${it.key}`} disabled={busy} onClick={it.run}
                style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 600,
                  color: it.danger ? '#b4122f' : INK, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }}>
                {it.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div data-testid="community-head" style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -28 }}>
          <div aria-hidden="true" style={{ width: 60, height: 60, borderRadius: 14, border: '3px solid #fff', background: INK, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{initials(name)}</div>
          {!isMember ? (
            <button type="button" data-testid="community-join" disabled={busy || community.myStatus === 'pending'} onClick={() => act('join')}
              style={{ ...pill(community.myStatus !== 'pending'), opacity: community.myStatus === 'pending' ? 0.7 : 1 }}>
              {joinLabel}
            </button>
          ) : (
            <button type="button" data-testid="community-joined" onClick={() => setMenu((v) => !v)} style={pill(false)}>Umejiunga</button>
          )}
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 21, color: INK, overflowWrap: 'anywhere' }}>{name}</h1>
        <div style={{ fontSize: 14, color: MUTED }}>
          {topicLabel(community.topicKey)} · <b style={{ color: INK }}>{Number(community.memberCount || 0).toLocaleString('en-US')}</b> wanachama
          {community.joinPolicy === 'request' ? ' · Kwa ombi' : ' · Wazi kwa wote'}
        </div>
        <div style={{ fontSize: 15, color: INK, lineHeight: '21px' }}>{formatText(community.purpose)}</div>
        {community.rules && (
          <button type="button" data-testid="community-rules-toggle" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}
            style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '4px 0', color: '#1a6fb0', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Kanuni za jumuiya
          </button>
        )}
        {showRules && community.rules && (
          <div data-testid="community-rules" style={{ fontSize: 14, color: INK, background: '#f7f9f9', borderRadius: 12, padding: '10px 12px', whiteSpace: 'pre-wrap', lineHeight: '20px' }}>
            {formatText(community.rules)}
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
        {sheetOpen && (
          <ShareSheet open onClose={() => setSheetOpen(false)} contentType="community" contentId={community.id} words={name}
            purpose={formatText(community.purpose)} plainUrl={`${window.location.origin}/community/${community.id}`} />
        )}
      </div>

      {isModerator && requests.length > 0 && (
        <div data-testid="community-requests" style={{ padding: '10px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 14, color: INK }}>Maombi ya kujiunga ({requests.length})</strong>
          {requests.map((r) => (
            <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
              <span style={{ flex: 1, minWidth: 0, color: INK }}>{formatName(r.name)}</span>
              <button type="button" data-testid={`approve-${r.userId}`} onClick={() => decide(r.userId, true)} style={pill(true)}>Kubali</button>
              <button type="button" onClick={() => decide(r.userId, false)} style={pill(false)}>Kataa</button>
            </div>
          ))}
        </div>
      )}

      {canRead ? (
        <>
          <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, position: 'relative', height: 48, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? INK : MUTED, whiteSpace: 'nowrap' }}>
                {t.label}
                <span aria-hidden="true" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 48, height: 3, borderRadius: 2, background: tab === t.key ? BLUE : 'transparent' }} />
              </button>
            ))}
          </div>

          {isMember && tab !== 'members' && (
            <button type="button" data-testid="community-post" onClick={write}
              style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#d6e4f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: INK, flexShrink: 0, overflow: 'hidden' }}>
                {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (currentUser?.name || 'U').charAt(0).toUpperCase()}
              </span>
              <span style={{ flex: 1, fontSize: 15, color: MUTED, background: '#f7f9f9', border: `1px solid ${LINE}`, borderRadius: 20, padding: '9px 14px' }}>
                Andika kwenye jumuiya…
              </span>
            </button>
          )}

          {tab === 'members' ? (
            <div data-testid="community-members">
              {members.map((m) => {
                const mName = formatName(m.name) || 'Mwanachama';
                return (
                  <div key={m.userId} style={{ padding: '10px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
                    <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#d6e4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: INK, flexShrink: 0 }}>
                      {mName.charAt(0).toUpperCase()}
                    </span>
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
              Bado hakuna mazungumzo hapa.{isMember ? ' Anzisha la kwanza.' : ''}
            </div>
          ) : (
            <div data-testid="community-threads">
              {threads.map((p) => <ThreadRow key={p.id} post={p} onOpen={openThread} />)}
            </div>
          )}
          {hasMore && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button type="button" data-testid="community-more" onClick={() => loadThreads(page + 1)} style={pill(false)}>Onyesha zaidi</button>
            </div>
          )}
        </>
      ) : (
        <div data-testid="community-members-only" style={{ padding: 24, color: MUTED, fontSize: 15, textAlign: 'center' }}>
          Mazungumzo ya jumuiya hii ni ya wanachama tu.
        </div>
      )}
    </div>
  );
}
