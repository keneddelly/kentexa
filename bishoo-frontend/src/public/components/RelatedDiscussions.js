/**
 * RelatedDiscussions.js — discovery continues after a shared/Google landing post.
 * Recommendations are personalized when available; the fallback always gives guests
 * useful next destinations instead of ending the page at the post.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { formatName } from '../utils/kentexaText';
import { ThreadCard } from './DiscussionCard';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const buttonStyle = {
  minHeight: 42, padding: '0 14px', borderRadius: 10, border: `1px solid #cfd9de`,
  background: '#fff', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function RelatedDiscussions({ postId, onNavigate }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setLoaded(false);
    Promise.resolve()
      .then(() => api.get(`/feed/${postId}/related`))
      .then((r) => { if (alive) setData(r?.data || {}); })
      .catch(() => { if (alive) setData({}); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [postId]);

  const discussions = Array.isArray(data?.discussions) ? data.discussions : [];
  const communities = Array.isArray(data?.communities) ? data.communities : [];
  const businesses = Array.isArray(data?.businesses) ? data.businesses : [];
  const hasRecommendations = discussions.length > 0 || communities.length > 0 || businesses.length > 0;
  const h = { margin: 0, padding: '14px 16px 6px', fontSize: 17, fontWeight: 800, color: INK };
  return (
    <div data-testid="related" style={{ borderTop: `8px solid ${LINE}`, background: '#fff' }}>
      {discussions.length > 0 && (
        <section aria-label="Mijadala zaidi">
          <h2 style={{ ...h, background: '#eef1f4', paddingBottom: 10 }}>Mijadala zaidi</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 12px 12px', background: '#eef1f4' }}>
            {discussions.map((p) => (
              <ThreadCard key={p.id} post={p} showCommunity testId={`related-post-${p.id}`} onOpen={() => onNavigate(`PostDetail-${p.id}`)} />
            ))}
          </div>
        </section>
      )}
      {businesses.length > 0 && (
        <section aria-label="Biashara zinazohusiana na mada hii">
          <h2 style={h}>Biashara zinazohusiana na mada hii</h2>
          <p style={{ margin: '0 16px 8px', color: MUTED, fontSize: 13 }}>Biashara zilizolinganishwa na mada hii kwa kutumia taarifa zao za umma.</p>
          {businesses.map((b) => (
            <button key={b.id} type="button" data-testid={`related-business-${b.id}`}
              onClick={() => b.ownerId && onNavigate(`CommerceProfile-${b.ownerId}`, { commerceProfileId: b.id })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              {b.photoUrl ? <img src={b.photoUrl} alt="" loading="lazy" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} /> :
                <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, background: '#eef2ff', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{formatName(b.displayName).charAt(0).toUpperCase()}</span>}
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                <b style={{ fontSize: 15, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatName(b.displayName)}</b>
                <span style={{ fontSize: 13, color: MUTED }}>{[b.category, b.location].filter(Boolean).join(' · ') || 'Biashara kwenye Kentexa'}</span>
              </span>
              {b.isVerified && <span aria-label="Imethibitishwa" style={{ marginLeft: 'auto', color: '#2563eb', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Imethibitishwa</span>}
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
      <section aria-label="Endelea kugundua Kentexa" data-testid="discovery-fallback"
        style={{ padding: '16px', borderTop: `1px solid ${LINE}`, background: '#f8fafc' }}>
        <h2 style={{ ...h, padding: '0 0 6px' }}>Endelea kugundua Kentexa</h2>
        <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 14, lineHeight: 1.5 }}>
          {hasRecommendations
            ? 'Chunguza biashara, huduma na mijadala mingine ndani ya mtandao wa Kentexa.'
            : loaded
              ? 'Bado hatujapata mapendekezo yanayolingana moja kwa moja na chapisho hili. Unaweza kuendelea kugundua biashara na jumuiya nyingine.'
              : 'Tunatafuta mijadala, biashara na jumuiya zinazohusiana na chapisho hili.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" data-testid="discover-businesses" style={buttonStyle} onClick={() => onNavigate('Stores')}>Gundua biashara</button>
          <button type="button" data-testid="discover-communities" style={buttonStyle} onClick={() => onNavigate('JumuiyaHome')}>Tembelea Jumuiya</button>
          <button type="button" data-testid="discover-home" style={buttonStyle} onClick={() => onNavigate('Home')}>Mwanzo wa Kentexa</button>
        </div>
      </section>
    </div>
  );
}
