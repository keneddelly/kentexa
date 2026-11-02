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

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

export default function PostDetail({ postId, openComments = false, onNavigate, isLoggedIn, currentUser, activeProfileId }) {
  const [post, setPost] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing

  useEffect(() => {
    let alive = true;
    setState('loading');
    api.get(`/feed/${postId}`)
      .then((r) => { if (!alive) return; if (r.data && r.data.id) { setPost(r.data); setState('ready'); } else setState('missing'); })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [postId]);

  const back = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else onNavigate('Home');
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', background: '#fff', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={back} aria-label="Rudi"
          style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Chapisho</div>
      </div>

      {state === 'loading' && <div data-testid="post-loading" style={{ padding: 24, color: MUTED, fontSize: 15 }}>Inapakia...</div>}

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

      {state === 'ready' && post && (
        <PostCard post={post} isLoggedIn={isLoggedIn} onNavigate={onNavigate} currentUser={currentUser}
          activeProfileId={activeProfileId} initialShowComments={openComments} />
      )}
    </div>
  );
}
