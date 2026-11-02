/**
 * LeoKwako.js — "Leo kwako", the daily block at the top of Home (Social Home part 2, owner
 * approved 2026-11-02). Shows only what the server found today (GET /feed/today): the most
 * active discussion in the person's topics, new replies on their posts, an open poll.
 * Nothing found, nothing shown. Each row opens the post.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#2563EB';

const ROW = {
  discussion: (i) => ({ lead: 'Mjadala wa leo', text: i.title, action: 'Jiunge', page: `PostDetail-${i.postId}-comments` }),
  replies: (i) => ({ lead: i.count === 1 ? 'Jibu jipya kwenye chapisho lako' : `Majibu ${i.count} mapya kwenye chapisho lako`, text: i.title, action: 'Soma', page: `PostDetail-${i.postId}-comments` }),
  poll: (i) => ({ lead: 'Kura', text: i.title, action: 'Piga kura', page: `PostDetail-${i.postId}` }),
};

export default function LeoKwako({ onNavigate, refreshKey }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    api.get('/feed/today')
      .then((r) => { if (alive) setItems(Array.isArray(r?.data) ? r.data.filter((i) => ROW[i?.kind] && i.postId) : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!items.length) return null;
  return (
    <section data-testid="leo-kwako" aria-label="Leo kwako"
      style={{ margin: '8px 12px', border: '1px solid #e6ebef', borderRadius: 14, padding: '10px 12px', background: '#f7f9fa',
        display: 'flex', flexDirection: 'column', gap: 4 }}>
      <strong style={{ fontSize: 14, color: INK }}>Leo kwako</strong>
      {items.map((i) => {
        const r = ROW[i.kind](i);
        return (
          <button key={`${i.kind}-${i.postId}`} type="button" data-testid={`leo-${i.kind}`} onClick={() => onNavigate(r.page)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', border: 'none', borderTop: '1px solid #eef1f3',
              background: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{r.lead}</span>
              <span style={{ fontSize: 14, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.text}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: BLUE, flexShrink: 0 }}>{r.action}</span>
          </button>
        );
      })}
    </section>
  );
}
