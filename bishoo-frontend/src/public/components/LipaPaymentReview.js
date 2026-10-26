import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/api';

// Lipa Namba payment review (owner 2026-10-23). The buyer paid the seller's own Lipa Namba
// and sent a screenshot; KenteXa never holds the money, so the seller says whether it arrived.
//   Seller: view the screenshot, "Nimepokea pesa" (confirm) or "Sijapokea" (reject + reason).
//   Buyer:  sees the decision; after a rejection sends a new screenshot.
// Hidden until the server has the feature switched on (503) or for a non-Lipa order (400).

const REASONS = [
  ['not_received', 'Pesa haijaonekana kwenye Lipa Namba'],
  ['amount_wrong', 'Kiasi hakilingani na bei'],
  ['unclear', 'Picha haisomeki'],
];
const LINK_MS = 9 * 60 * 1000; // the server's private link lasts 10 minutes
const btn = (bg, color = '#fff', border = 'none') => ({
  flex: 1, minHeight: 44, borderRadius: 10, border, backgroundColor: bg, color, fontWeight: 800, fontSize: 14, cursor: 'pointer',
});

const STATE = {
  waiting: ['Inasubiri muuzaji athibitishe malipo', '#b45309', '#fffbeb'],
  confirmed: ['Malipo yamethibitishwa', '#15803d', '#f0fdf4'],
  rejected: ['Malipo hayajathibitishwa', '#b91c1c', '#fef2f2'],
};

const LipaPaymentReview = ({ orderId, onChanged }) => {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [file, setFile] = useState(null);
  const [reference, setReference] = useState('');
  const fetchedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/orders/${orderId}/lipa`);
      fetchedAt.current = Date.now();
      setData(r.data);
      return r.data;
    } catch (e) {
      if ([400, 403, 404, 503].includes(e?.response?.status)) setHidden(true);
      return null;
    }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  if (hidden || !data) return null;

  const act = async (fn) => {
    setBusy(true); setError('');
    try { const r = await fn(); setData(r.data); fetchedAt.current = Date.now(); setChoosing(false); onChanged?.(r.data); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
    finally { setBusy(false); }
  };

  // The private link expires after 10 minutes: an old one is refreshed before opening.
  const openProof = async (e) => {
    if (Date.now() - fetchedAt.current < LINK_MS) return;
    e.preventDefault();
    const fresh = await load();
    if (fresh?.proofUrl) window.location.href = fresh.proofUrl;
  };

  const resend = () => act(async () => {
    const form = new FormData();
    form.append('file', file);
    const up = await api.post('/upload/payment-proof', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return api.post(`/orders/${orderId}/lipa/proof`, { proofId: up.data?.proofId, reference: reference.trim() || undefined });
  });

  const key = data.decision === 'confirmed' ? 'confirmed' : data.decision === 'rejected' ? 'rejected' : 'waiting';
  const [label, color, bg] = STATE[key];

  return (
    <div data-testid="lipa-review" style={{ border: `1px solid ${color}33`, backgroundColor: bg, borderRadius: 12, padding: 12, margin: '8px 0' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color }}>{label}</div>
      {/* The money to look for, big (owner 2026-10-27): the seller checks this amount on their Lipa Namba. */}
      {data.amount > 0 && (
        <div data-testid="lipa-amount" style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, color: '#475569' }}>Kiasi cha kuangalia kwenye Lipa Namba</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums' }}>
            TZS {Number(data.amount).toLocaleString()}
          </div>
        </div>
      )}
      {key === 'rejected' && data.rejectReasonText && (
        <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>Sababu: {data.rejectReasonText}</div>
      )}
      {data.reference && <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>Kumbukumbu ya malipo: {data.reference}</div>}
      {/* The buyer's screenshot, shown large; tap to open it full size. */}
      {data.proofUrl && (
        <a href={data.proofUrl} onClick={openProof} target="_blank" rel="noopener noreferrer"
          aria-label="Fungua picha ya malipo" style={{ display: 'block', marginTop: 10, textDecoration: 'none' }}>
          <img data-testid="lipa-proof" src={data.proofUrl} alt="Picha ya malipo ya mnunuzi"
            style={{ display: 'block', width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 10, backgroundColor: '#fff', border: '1px solid #e2e8f0' }} />
          <span style={{ display: 'block', marginTop: 6, fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>Fungua picha kubwa</span>
        </a>
      )}
      {!data.proofUrl && key === 'waiting' && (
        <div style={{ fontSize: 13, color: '#334155', marginTop: 8 }}>Mnunuzi hajatuma picha hapa. Angalia Lipa Namba yako au WhatsApp, kisha thibitisha.</div>
      )}

      {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c', marginTop: 8 }}>{error}</div>}

      {(data.canConfirm || data.canReject) && !choosing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {data.canConfirm && (
            <button type="button" disabled={busy} onClick={() => act(() => api.patch(`/orders/${orderId}/lipa/confirm`))}
              style={{ ...btn('#15803d'), opacity: busy ? 0.6 : 1 }}>Nimepokea pesa</button>
          )}
          {data.canReject && (
            <button type="button" disabled={busy} onClick={() => setChoosing(true)}
              style={{ ...btn('#fff', '#b91c1c', '1px solid #fecaca'), opacity: busy ? 0.6 : 1 }}>Sijapokea</button>
          )}
        </div>
      )}

      {choosing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Kwa nini?</div>
          {REASONS.map(([value, text]) => (
            <button key={value} type="button" disabled={busy}
              onClick={() => act(() => api.patch(`/orders/${orderId}/lipa/reject`, { reason: value }))}
              style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '0 12px', marginBottom: 6,
                borderRadius: 10, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 14, color: '#0f172a', cursor: 'pointer' }}>
              {text}
            </button>
          ))}
          <button type="button" onClick={() => setChoosing(false)}
            style={{ background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', padding: 4 }}>Rudi</button>
        </div>
      )}

      {data.canResend && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>Tuma picha mpya ya malipo:</div>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, marginBottom: 6, maxWidth: '100%' }} />
          <input type="text" placeholder="Kumbukumbu ya malipo (hiari)" value={reference} onChange={(e) => setReference(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, marginBottom: 6 }} />
          <button type="button" disabled={busy || !file} onClick={resend}
            style={{ ...btn('#1d4ed8'), width: '100%', opacity: busy || !file ? 0.6 : 1 }}>{busy ? 'Inatuma…' : 'Tuma picha'}</button>
        </div>
      )}
    </div>
  );
};

export default LipaPaymentReview;
