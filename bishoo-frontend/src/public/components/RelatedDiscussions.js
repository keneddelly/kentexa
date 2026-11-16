/**
 * RelatedDiscussions.js — what to read next at the end of a discussion (viral engine C, issue
 * #381): "Mijadala zaidi" (same community, then same topic) and "Jumuiya zinazofanana" (open
 * communities on the same topic), so a visitor from a shared link finds more reasons to stay.
 * Shown to everyone, guests included; the server applies the usual visibility rules.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { formatCaption, formatName } from '../utils/kentexaText';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const KIND = { question: 'Swali', poll: 'Kura', discussion: 'Mjadala', offer: 'Ofa', experience: 'Uzoefu' };

const titleOf = (p) => {
  const { lead, text } = formatCaption(p.title === 'Moment' ? '' : p.title, p.body);
  return lead || String(text || '').split('\n')[0] || 'Chapisho';
};

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
    <div data-testid="related" style={{ borderTop: `8px solid ${LINE}`, paddingBottom: 96 }}>
      {discussions.length > 0 && (
        <section aria-label="Mijadala zaidi">
          <h2 style={h}>Mijadala zaidi</h2>
          {discussions.map((p) => (
            <button key={p.id} type="button" data-testid={`related-post-${p.id}`} onClick={() => onNavigate(`PostDetail-${p.id}`)}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
                {KIND[p.intent] && <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#1a6fb0', background: '#e8f5fd', borderRadius: 4, padding: '1px 6px', marginTop: 2 }}>{KIND[p.intent]}</span>}
                <span style={{ fontSize: 15, fontWeight: 700, color: INK, lineHeight: '20px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{titleOf(p)}</span>
              </span>
              <span style={{ fontSize: 13, color: MUTED }}>
                {formatName(p.business?.storeName || p.business?.name) || 'Mwanachama'}
                {p.community?.name ? ` · ${formatName(p.community.name)}` : ''} · majibu <b style={{ color: INK }}>{p.replyCount || 0}</b>
              </span>
            </button>
          ))}
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
