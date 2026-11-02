/**
 * CommunityPage.js — one community (Jumuiya), Social Home part 3, owner approved 2026-11-02.
 * Header (name, topic, members, purpose, rules, join/leave), tabs Mazungumzo / Maswali /
 * Kura / Wanachama, and for its admin and helpers the join requests. Posts use the same
 * card as Home. What the viewer may see is decided by the server.
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { PostCard } from './HomeFeed';
import { topicLabel } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#2563EB';

const TABS = [
  { key: 'all', label: 'Mazungumzo' },
  { key: 'question', label: 'Maswali' },
  { key: 'poll', label: 'Kura' },
  { key: 'members', label: 'Wanachama' },
];

export default function CommunityPage({ communityId, onNavigate, isLoggedIn, currentUser, activeProfileId, onOpenMoment }) {
  const [community, setCommunity] = useState(null);
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('all');
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState('loading');
    api.get(`/communities/${communityId}`)
      .then((r) => { setCommunity(r.data); setState('ready'); })
      .catch(() => setState('missing'));
  }, [communityId]);
  useEffect(() => { load(); }, [load]);

  const isMember = community?.myStatus === 'active';
  const isModerator = isMember && ['admin', 'helper'].includes(community?.myRole);
  const canRead = community && (community.joinPolicy === 'open' || isMember);

  useEffect(() => {
    if (!community || !canRead) { setPosts([]); setMembers([]); return; }
    if (tab === 'members') {
      api.get(`/communities/${communityId}/members`).then((r) => setMembers(Array.isArray(r.data) ? r.data : [])).catch(() => setMembers([]));
      return;
    }
    const params = tab === 'all' ? {} : { kind: tab };
    api.get(`/communities/${communityId}/posts`, { params }).then((r) => setPosts(r.data?.items || [])).catch(() => setPosts([]));
  }, [community, canRead, tab, communityId]);

  useEffect(() => {
    if (!isModerator) { setRequests([]); return; }
    api.get(`/communities/${communityId}/requests`).then((r) => setRequests(Array.isArray(r.data) ? r.data : [])).catch(() => setRequests([]));
  }, [isModerator, communityId]);

  const act = async (path) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setBusy(true); setError('');
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

  if (state === 'loading') return <div style={{ padding: 24, color: MUTED }}>Inapakia...</div>;
  if (state === 'missing' || !community) {
    return (
      <div data-testid="community-missing" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Jumuiya haipatikani</div>
        <button type="button" onClick={() => onNavigate('Home')} style={{ marginTop: 14, height: 38, padding: '0 18px', borderRadius: 19, border: 'none', background: INK, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Nenda Mwanzo</button>
      </div>
    );
  }

  const joinLabel = community.myStatus === 'pending' ? 'Ombi limetumwa' : community.joinPolicy === 'request' ? 'Omba kujiunga' : 'Jiunge';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div data-testid="community-head" style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: `1px solid ${LINE}` }}>
        <button type="button" aria-label="Rudi" onClick={() => onNavigate('Home')} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: INK, padding: 0 }}>‹</button>
        <h1 style={{ margin: 0, fontSize: 21, color: INK }}>{community.name}</h1>
        <div style={{ fontSize: 13, color: MUTED }}>
          {topicLabel(community.topicKey)} · Wanachama {Number(community.memberCount || 0).toLocaleString('en-US')}{community.joinPolicy === 'request' ? ' · Kwa ombi' : ''}
        </div>
        <div style={{ fontSize: 15, color: INK, lineHeight: 1.45 }}>{community.purpose}</div>
        {community.rules && <div style={{ fontSize: 13, color: MUTED, background: '#f7f9fa', borderRadius: 10, padding: '8px 10px' }}>Kanuni: {community.rules}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {!isMember ? (
            <button type="button" data-testid="community-join" disabled={busy || community.myStatus === 'pending'} onClick={() => act('join')}
              style={{ height: 34, padding: '0 16px', borderRadius: 17, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              {joinLabel}
            </button>
          ) : (
            <>
              <button type="button" data-testid="community-post" onClick={() => onOpenMoment?.('moment', { communityId: community.id })}
                style={{ height: 34, padding: '0 16px', borderRadius: 17, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Chapisha hapa
              </button>
              {community.myRole !== 'admin' && (
                <button type="button" data-testid="community-leave" disabled={busy} onClick={() => act('leave')}
                  style={{ height: 34, padding: '0 16px', borderRadius: 17, border: '1px solid #cfd9de', background: '#fff', color: INK, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ondoka
                </button>
              )}
            </>
          )}
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
      </div>

      {isModerator && requests.length > 0 && (
        <div data-testid="community-requests" style={{ padding: '10px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 14, color: INK }}>Maombi ya kujiunga ({requests.length})</strong>
          {requests.map((r) => (
            <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span style={{ flex: 1, minWidth: 0, color: INK }}>{r.name}</span>
              <button type="button" data-testid={`approve-${r.userId}`} onClick={() => decide(r.userId, true)} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>Kubali</button>
              <button type="button" onClick={() => decide(r.userId, false)} style={{ border: 'none', background: 'none', color: MUTED, fontWeight: 700, cursor: 'pointer' }}>Kataa</button>
            </div>
          ))}
        </div>
      )}

      {canRead ? (
        <>
          <div role="tablist" style={{ display: 'flex', gap: 4, padding: '0 8px', borderBottom: `1px solid ${LINE}`, overflowX: 'auto' }}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                style={{ position: 'relative', height: 40, padding: '0 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? INK : MUTED, whiteSpace: 'nowrap' }}>
                {t.label}
                <span aria-hidden="true" style={{ position: 'absolute', left: 12, right: 12, bottom: 0, height: 3, borderRadius: 2, background: tab === t.key ? BLUE : 'transparent' }} />
              </button>
            ))}
          </div>
          {tab === 'members' ? (
            <div data-testid="community-members">
              {members.map((m) => (
                <div key={m.userId} style={{ padding: '10px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: INK }}>{m.name}</span>
                  <span style={{ color: MUTED }}>{m.role === 'admin' ? 'Msimamizi' : m.role === 'helper' ? 'Msaidizi' : ''}</span>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div data-testid="community-empty" style={{ padding: 24, color: MUTED, fontSize: 15, textAlign: 'center' }}>
              Bado hakuna mazungumzo hapa.{isMember ? ' Anzisha la kwanza.' : ''}
            </div>
          ) : (
            posts.map((p) => (
              <PostCard key={p.id} post={p} isLoggedIn={isLoggedIn} onNavigate={onNavigate} currentUser={currentUser} activeProfileId={activeProfileId} />
            ))
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
