import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

/**
 * Admin: Ada ya KenteXa payments (owner approved 2026-11-03). An ofisi, agent or seller pays
 * KenteXa's Lipa Namba and sends the screenshot; here admin opens the screenshot and confirms
 * (the debt goes down) or rejects with a reason (they are told and can send again).
 * Only this list for now; the fee settings screen comes later (admin last).
 */
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const WHO = { office: 'Ofisi', agent: 'Wakala', seller: 'Muuzaji' };

export default function AdminKentexaFees({ activePage, onNavigate, onLogout }) {
  const [status, setStatus] = useState('waiting');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  const load = (st = status) => api.get('/kentexa-fee/admin/payments', { params: { status: st } })
    .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
    .catch((e) => { setRows([]); setMsg(e?.response?.data?.message || 'Imeshindikana kupakia'); });
  useEffect(() => { load(status); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, decision) => {
    setBusy(true); setMsg('');
    try {
      await api.post(`/kentexa-fee/admin/payments/${id}/${decision}`, decision === 'reject' ? { reason } : {});
      setMsg(decision === 'confirm' ? 'Malipo yamethibitishwa' : 'Malipo yamekataliwa');
      setRejecting(null); setReason('');
      await load();
    } catch (e) { setMsg(e?.response?.data?.message || 'Imeshindikana'); } finally { setBusy(false); }
  };

  const card = { background: '#fff', border: '1px solid #eff3f4', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 };
  const btn = (dark) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? '#0f1419' : '#fff',
    color: dark ? '#fff' : '#0f1419', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f9f9' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Ada ya KenteXa: malipo</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['waiting', 'Yanasubiri'], ['confirmed', 'Yamethibitishwa'], ['rejected', 'Yamekataliwa']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} style={btn(status === k)}>{l}</button>
          ))}
        </div>
        {msg && <div role="status" style={{ fontSize: 14 }}>{msg}</div>}
        {rows === null && <div>Inapakia…</div>}
        {rows && rows.length === 0 && <div style={{ color: '#536471' }}>Hakuna malipo hapa.</div>}
        {rows && rows.map((p) => (
          <div key={p.id} style={card} data-testid={`fee-payment-${p.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <b>{WHO[p.accountType] || p.accountType}: {p.who || `#${p.accountId}`}{p.phone ? ` · ${p.phone}` : ''}</b>
              <b>{tzs(p.amount)}</b>
            </div>
            <div style={{ fontSize: 14, color: '#536471' }}>
              {new Date(p.createdAt).toLocaleString('en-GB')}{p.reference ? ` · Muamala ${p.reference}` : ''} · Deni la sasa {tzs(p.owed)}
              {p.reason ? ` · Sababu: ${p.reason}` : ''}
            </div>
            {p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#1d9bf0', fontWeight: 700 }}>Fungua picha ya malipo</a>}
            {p.status === 'waiting' && rejecting !== p.id && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={busy} onClick={() => act(p.id, 'confirm')} style={btn(true)}>Thibitisha</button>
                <button type="button" disabled={busy} onClick={() => { setRejecting(p.id); setReason(''); }} style={btn(false)}>Kataa</button>
              </div>
            )}
            {rejecting === p.id && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sababu (mf. kiasi hakilingani)"
                  style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid #cfd9de', fontSize: 14 }} />
                <button type="button" disabled={busy} onClick={() => act(p.id, 'reject')} style={btn(true)}>Kataa</button>
                <button type="button" onClick={() => setRejecting(null)} style={btn(false)}>Ghairi</button>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
