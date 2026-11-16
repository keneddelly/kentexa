/**
 * ShareResult.js — "Ulichoshiriki" (viral engine B9, issue #381, mockup "3 · The sharer sees the
 * result" approved 2026-11-16): what the person's own shares of this post or community brought.
 * Only they see it; it shows only when they have shared it. Numbers come from recorded opens and
 * new accounts, never estimated.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const CHANNEL = { whatsapp: 'WhatsApp', status: 'Status', instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram', x: 'X', copy: 'Kiungo', native: 'Simu', image: 'Picha', link: 'Kiungo' };

export default function ShareResult({ contentType, contentId, isLoggedIn }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!isLoggedIn || !contentId) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => api.get(`/share-links/mine/${contentType}/${contentId}`))
      .then((r) => { if (alive) setStats(r?.data || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn, contentType, contentId]);

  if (!stats?.shared) return null;
  const cell = (n, label, testid) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <b data-testid={testid} style={{ fontSize: 22, color: '#0f1419' }}>{Number(n || 0).toLocaleString('en-US')}</b>
      <span style={{ fontSize: 12, color: '#536471' }}>{label}</span>
    </div>
  );
  return (
    <div data-testid="share-result" style={{ border: '1px solid #b7e1c4', background: '#f2fbf5', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1d6b39' }}>Ulichoshiriki (unaona wewe tu)</div>
      <div style={{ display: 'grid', gridTemplateColumns: contentType === 'post' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {cell(stats.opens, 'wamefungua', 'share-result-opens')}
        {cell(stats.joined, 'wamejiunga', 'share-result-joined')}
        {contentType === 'post' && cell(stats.newReplies, 'majibu mapya', 'share-result-replies')}
      </div>
      {stats.channels?.length > 0 && (
        <div data-testid="share-result-channels" style={{ fontSize: 13, color: '#536471' }}>
          {stats.channels.map((c) => `${CHANNEL[c.channel] || c.channel} ${c.opens}`).join(' · ')}
        </div>
      )}
    </div>
  );
}
