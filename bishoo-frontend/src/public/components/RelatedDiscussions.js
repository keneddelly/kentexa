/**
 * RelatedDiscussions.js — what to read next at the end of a discussion (viral engine C, issue
 * #381): "Mijadala zaidi" (same community, then same topic) and "Jumuiya zinazofanana" (open
 * communities on the same topic), so a visitor from a shared link finds more reasons to stay.
 * Shown to everyone, guests included; the server applies the usual visibility rules.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { formatName } from '../utils/kentexaText';
import { ThreadCard } from './DiscussionCard';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';

export default function RelatedDiscussions({ postId, onNavigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    Promise.resolve()
      .then(() => api.get(`/feed/${postId}/related`))
      .then((r) => { if (alive) setData(r?.data || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [postId]);

  const discussions = Array.isArray(data?.discussions) ? data.discussions : [];
  const communities = Array.isArray(data?.communities) ? data.communities : [];
  if (!discussions.length && !communities.length) return null;
  const h = { margin: 0, padding: '14px 16px 6px', fontSize: 17, fontWeight: 800, color: INK };
  return (
    <div data-testid="related" style={{ borderTop: `8px solid ${LINE}` }}>
      {discussions.length > 0 && (
        <section aria-label="Mijadala zaidi">
          <h2 style={{ ...h, background: '#eef1f4', paddingBottom: 10 }}>Mijadala zaidi</h2>
          {/* D2: the same discussion cards as the community page. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 12px 12px', background: '#eef1f4' }}>
            {discussions.map((p) => (
              <ThreadCard key={p.id} post={p} showCommunity testId={`related-post-${p.id}`} onOpen={() => onNavigate(`PostDetail-${p.id}`)} />
            ))}
          </div>
        </section>
      )}
      {communities.length > 0 && (
        <section aria-label="Jumuiya zinazofanana">
          <h2 style={h}>Jumuiya zinazofanana</h2>
          {communities.map((c) => (
            <button key={c.id} type="button" data-testid={`related-community-${c.id}`} onClick={() => onNavigate(`Community-${c.id}`)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: INK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                {formatName(c.name).charAt(0).toUpperCase()}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <b style={{ fontSize: 15, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(c.name)}</b>
                <span style={{ fontSize: 13, color: MUTED }}>wanachama {Number(c.memberCount || 0).toLocaleString('en-US')}</span>
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: INK, border: '1px solid #cfd9de', borderRadius: 999, padding: '6px 14px', flexShrink: 0 }}>Tazama</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
