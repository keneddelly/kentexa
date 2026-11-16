import React, { useEffect, useState } from 'react';
import api from '../../api/api';

// Mwandishi wa Wiki (owner approved 2026-11-16): this week's pick, made by plain counting. An admin
// removes a pick that breaks the rules (with a reason, kept on record); the next one moves up.
export default function WriterWeekAdminCard() {
  const [r, setR] = useState(null);
  const [state, setState] = useState('loading');
  const [reason, setReason] = useState({});
  const [error, setError] = useState('');
  const load = () => {
    setState('loading');
    api.get('/writer-of-week/admin').then((res) => { setR(res.data); setState('ready'); }).catch(() => setState('error'));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (id) => {
    setError('');
    try { await api.post(`/writer-of-week/admin/${id}/remove`, { reason: reason[id] || '' }); load(); }
    catch (err) { setError(err?.response?.data?.message || 'Imeshindikana.'); }
  };
  const picks = Array.isArray(r?.picks) ? r.picks : [];
  return (
    <div data-testid="writer-week-admin" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Mwandishi wa Wiki{r?.weekLabel ? ` · ${r.weekLabel}` : ''}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Imechaguliwa kwa kuhesabu tu. Ondoa chaguo linalovunja kanuni; anayefuata anapanda.</div>
      {state === 'loading' && <div style={{ marginTop: 10, color: '#64748b' }}>Inapakia...</div>}
      {state === 'error' && <div style={{ marginTop: 10, color: '#b91c1c' }}>Imeshindikana kupakia.</div>}
      {state === 'ready' && !picks.length && <div style={{ marginTop: 10, color: '#64748b' }}>Hakuna aliyetimiza kanuni wiki hii.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {picks.map((p) => (
          <div key={p.id} data-testid={`writer-pick-${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10,
            background: p.removedAt ? '#fef2f2' : '#f8fafc' }}>
            <b style={{ width: 24 }}>{p.rank}</b>
            <span style={{ flex: 1, minWidth: 160 }}>
              <b>{p.name}</b> · pointi {p.score} · majibu {p.replies} · watu {p.repliers}
              {p.removedAt && <span style={{ color: '#b91c1c' }}> · imeondolewa: {p.removeReason}</span>}
            </span>
            {!p.removedAt && (
              <>
                <input value={reason[p.id] || ''} onChange={(e) => setReason((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="Sababu"
                  style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', minWidth: 140 }} />
                <button type="button" data-testid={`writer-remove-${p.id}`} onClick={() => remove(p.id)}
                  style={{ borderRadius: 8, padding: '6px 12px', border: 'none', background: '#b91c1c', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Ondoa</button>
              </>
            )}
          </div>
        ))}
      </div>
      {error && <div role="alert" style={{ marginTop: 8, color: '#b91c1c' }}>{error}</div>}
    </div>
  );
}
