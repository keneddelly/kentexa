/**
 * PostDetail.js — one post on its own page (Home Feed phase C, owner 2026-11-02).
 *
 * Opened from a share link (/post/:id), a notification (PostDetail-{id}, or
 * PostDetail-{id}-comments to open on the comments) or a tap in the app.
 * The server decides what the viewer may see (GET /feed/:id applies the same
 * visibility as the feed); this page only shows its answer, the same card the
 * feed shows, and never guesses a post that did not load.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { PostCard } from './HomeFeed';
import { formatName } from '../utils/kentexaText';
import ShareResult from '../components/ShareResult';
import ShareNudge, { markNudge, nudgeSeen } from '../components/ShareNudge';
import ShareSheet from '../components/ShareSheet';
import RelatedDiscussions from '../components/RelatedDiscussions';
import GetAppStrip from '../components/GetAppStrip';
import SeriesBar from '../components/SeriesBar';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

export default function PostDetail({ postId, onNavigate, isLoggedIn, currentUser, activeProfileId }) {
  const [post, setPost] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing

  useEffect(() => {
    let alive = true;
    setState('loading');
    // The page opens at its top (owner 2026-11-02: it opened lower down the page).
    try { window.scrollTo(0, 0); } catch { /* not in a browser */ }
    api.get(`/feed/${postId}`)
      .then((r) => {
        if (!alive) return;
        if (r.data && r.data.id) { setPost(r.data); setState('ready'); try { window.scrollTo(0, 0); } catch { /* not in a browser */ } }
        else setState('missing');
      })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [postId]);

  // #374 D: a post made in a community is a discussion there. Its header names the community,
  // and its moderators get a ⋯ menu: pin, close replies, make the writer a helper, remove.
  const communityId = post?.community?.id || post?.communityId || null;
  const [role, setRole] = useState(null);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    setRole(null);
    if (!communityId || !isLoggedIn) return undefined;
    let alive = true;
    api.get(`/communities/${communityId}`).then((r) => { if (alive) setRole(r.data?.myStatus === 'active' ? r.data.myRole : null); }).catch(() => {});
    return () => { alive = false; };
  }, [communityId, isLoggedIn]);
  const isModerator = role === 'admin' || role === 'helper';
  // Viral engine C11 (#381): when the writer's discussion reaches 10 replies, one invitation to put it
  // on Status (never again once used or dismissed on this phone).
  const [hotSheet, setHotSheet] = useState(false);
  const [hotDone, setHotDone] = useState(false);
  const hot = !!post && !hotDone && !hotSheet && isLoggedIn && Number(currentUser?.id) === Number(post.businessId ?? post.business?.id)
    && Number(post.commentCount || 0) >= 10 && (!post.visibility || post.visibility === 'public') && !nudgeSeen(`hot-${post.id}`);
  const moderate = async (path, body, apply) => {
    setMenu(false); setNote('');
    try {
      const r = await api.post(`/communities/${communityId}/posts/${post.id}/${path}`, body);
      apply(r.data);
    } catch (err) { setNote(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
  };
  const authorId = post?.businessId ?? post?.business?.id;
  const menuItems = !post || !isModerator ? [] : [
    { key: 'pin', label: post.pinnedAt ? 'Ondoa kwenye juu' : 'Bandika juu',
      run: () => moderate('pin', { pinned: !post.pinnedAt }, (d) => { setPost((p) => ({ ...p, pinnedAt: d?.pinned ? new Date().toISOString() : null })); setNote(d?.pinned ? 'Limebandikwa juu ya jumuiya.' : 'Limeondolewa juu.'); }) },
    { key: 'lock', label: post.repliesLocked ? 'Fungua majibu' : 'Funga majibu',
      run: () => moderate('lock', { locked: !post.repliesLocked }, (d) => { setPost((p) => ({ ...p, repliesLocked: !!d?.repliesLocked })); setNote(d?.repliesLocked ? 'Majibu yamefungwa.' : 'Majibu yamefunguliwa.'); }) },
    role === 'admin' && authorId && Number(authorId) !== Number(currentUser?.id) && { key: 'helper', label: 'Mfanye msaidizi',
      run: async () => {
        setMenu(false); setNote('');
        try { await api.post(`/communities/${communityId}/helpers/${authorId}`, { helper: true }); setNote('Sasa ni msaidizi wa jumuiya.'); }
        catch (err) { setNote(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
      } },
    { key: 'remove', label: 'Ondoa chapisho', danger: true,
      run: () => moderate('remove', undefined, () => { setState('missing'); onNavigate(`Community-${communityId}`); }) },
  ].filter(Boolean);

  // One navigation (#374): back returns to exactly where the person came from (a community,
  // a profile, a tag, Home...), at the same place; opened from a link, it goes Home.
  const back = () => onNavigate('back');

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={back} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Chapisho</div>
          {post?.community?.name && (
            <button type="button" data-testid="post-from-community" onClick={() => onNavigate(`Community-${communityId}`)}
              style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, fontSize: 12, color: MUTED, cursor: 'pointer', fontFamily: 'inherit',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              kutoka {formatName(post.community.name)}
            </button>
          )}
        </div>
        {menuItems.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button type="button" aria-label="Hatua za msimamizi" data-testid="moderator-menu" onClick={() => setMenu((v) => !v)}
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #cfd9de', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={MUTED} aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            {menu && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 46, zIndex: 20, minWidth: 210, background: '#fff', borderRadius: 12,
                boxShadow: '0 8px 28px rgba(15,20,25,0.18)', padding: 6, display: 'flex', flexDirection: 'column' }}>
                {menuItems.map((it) => (
                  <button key={it.key} type="button" role="menuitem" data-testid={`mod-${it.key}`} onClick={it.run}
                    style={{ minHeight: 44, padding: '0 12px', border: 'none', background: 'none', textAlign: 'left', fontSize: 15, fontWeight: 600,
                      color: it.danger ? '#b4122f' : INK, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }}>
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {note && <div role="status" data-testid="moderator-note" style={{ padding: '8px 16px', fontSize: 14, color: '#1d6b39', background: '#f2fbf5' }}>{note}</div>}

      {state === 'loading' && (
        <div data-testid="post-loading" aria-label="Inapakia" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: LINE }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ width: '40%', height: 12, borderRadius: 6, background: LINE }} />
              <div style={{ width: '25%', height: 10, borderRadius: 5, background: LINE }} />
            </div>
          </div>
          <div style={{ width: '90%', height: 14, borderRadius: 7, background: LINE }} />
          <div style={{ width: '70%', height: 14, borderRadius: 7, background: LINE }} />
          <div style={{ width: '100%', height: 220, borderRadius: 16, background: LINE }} />
        </div>
      )}

      {state === 'missing' && (
        <div data-testid="post-missing" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>Chapisho halipatikani</div>
          <div style={{ fontSize: 15, color: MUTED, marginBottom: 18 }}>Huenda limefutwa, au ni la wanaofuata tu.</div>
          <button type="button" onClick={() => onNavigate('Home')}
            style={{ height: 38, padding: '0 18px', borderRadius: 19, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Nenda Mwanzo
          </button>
        </div>
      )}

      {/* Mfululizo (#410): the series this post belongs to, with previous / next. */}
      {state === 'ready' && post && <SeriesBar postId={post.id} onNavigate={onNavigate} />}
      {state === 'ready' && post && (
        <PostCard post={post} isLoggedIn={isLoggedIn} onNavigate={onNavigate} currentUser={currentUser}
          activeProfileId={activeProfileId} initialShowComments detail communityRole={role}
          detailExtra={(
            <>
              <ShareResult contentType="post" contentId={post.id} isLoggedIn={isLoggedIn} />
              {hot && (
                <ShareNudge status testid="hot-nudge" title={`Mjadala wako unavuma: majibu ${post.commentCount}`}
                  text="Uweke kwenye Status ili watu zaidi waone na kujibu." action="Weka kwenye Status"
                  onShare={() => { markNudge(`hot-${post.id}`); setHotSheet(true); }} onDismiss={() => { markNudge(`hot-${post.id}`); setHotDone(true); }} />
              )}
            </>
          )} />
      )}
      {state === 'ready' && post && hotSheet && (
        <ShareSheet open onClose={() => { setHotSheet(false); setHotDone(true); }} contentType="post" contentId={Number(post.id)}
          words={post.body || post.title} intent={post.intent} community={post.community?.name ? formatName(post.community.name) : ''}
          replies={post.commentCount} plainUrl={`${window.location.origin}/post/${post.id}`} />
      )}
      {/* Owner 2026-11-16: Android visitors without the app are invited to get it. */}
      {state === 'ready' && post && <GetAppStrip text={post.intent === 'article' ? 'Soma makala kwa urahisi zaidi kwenye app ya KenteXa' : 'Fuatilia mjadala huu kwenye app ya KenteXa'} />}
      {state === 'ready' && post && <RelatedDiscussions postId={post.id} onNavigate={onNavigate} />}
      {/* Room at the very end so the fixed reply bar never covers the last words (it used to sit under the comments and left a blank gap above Mijadala zaidi). */}
      {state === 'ready' && post && <div data-testid="detail-comment-bottom-space" aria-hidden="true" style={{ height: 'calc(128px + env(safe-area-inset-bottom, 0px))' }} />}
    </div>
  );
}
