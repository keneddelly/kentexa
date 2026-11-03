/**
 * KentexaFeeLine.js — the small "Ada ya KenteXa" line on a work screen (ofisi desk, agent jobs,
 * seller orders). Owner approved 2026-11-03. It shows the debt from the records and opens the
 * full page (KentexaFee). Before the fee is switched on, or when it cannot load, it shows nothing.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export default function KentexaFeeLine({ as, onNavigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    // Never breaks the work screen: any failure (or an old test mock) simply shows nothing.
    Promise.resolve().then(() => api.get('/kentexa-fee/mine', { params: { as } }))
      .then((r) => { if (live && r && r.data) setData(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [as]);
  if (!data?.ready) return null;
  const note = data.owed > 0 ? `Deni ${tzs(data.owed)}` : as !== 'seller' && data.freeLeft > 0 ? `Vya bure ${data.freeLeft}` : 'Hakuna deni';
  return (
    <button type="button" data-testid="kentexa-fee-line" onClick={() => onNavigate('KentexaFee', { as })}
      style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 14px',
        border: `1px solid ${data.inArrears ? '#fcd34d' : '#eff3f4'}`, borderRadius: 14, background: '#fff', fontFamily: 'inherit',
        fontSize: 15, fontWeight: 700, color: '#0f1419', cursor: 'pointer', boxSizing: 'border-box' }}>
      <span>Ada ya KenteXa</span>
      <span style={{ fontWeight: 600, color: data.inArrears ? '#92400e' : '#536471' }}>{note}</span>
    </button>
  );
}
