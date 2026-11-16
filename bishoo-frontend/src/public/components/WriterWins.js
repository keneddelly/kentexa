/**
 * WriterWins.js — on a profile: "Mwandishi wa Wiki mara N" (owner approved 2026-11-16), kept for
 * good once someone has been the writer of the week. Nothing when they never were.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { Star } from './WriterOfWeek';

export default function WriterWins({ ownerUserId }) {
  const [wins, setWins] = useState(null);
  useEffect(() => {
    if (!ownerUserId) return undefined;
    let alive = true;
    Promise.resolve().then(() => api.get(`/writer-of-week/profile/${ownerUserId}`))
      .then((r) => { if (alive) setWins(r?.data || null); }).catch(() => {});
    return () => { alive = false; };
  }, [ownerUserId]);
  if (!wins || !(Number(wins.wins) > 0)) return null;
  return (
    <div data-testid="writer-wins" style={{ marginTop: 8, border: '1px solid #f5d38a', background: '#fffbeb', borderRadius: 14, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#b45309)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Star size={18} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <b style={{ fontSize: 15, color: '#0f1419' }}>Mwandishi wa Wiki{Number(wins.wins) > 1 ? ` mara ${wins.wins}` : ''}</b>
        {wins.lastLabel && <span style={{ fontSize: 13, color: '#536471' }}>Mara ya mwisho: {wins.lastLabel}</span>}
      </span>
    </div>
  );
}
