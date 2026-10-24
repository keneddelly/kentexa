import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// The office records what a sender paid it for a send-form shipment (2026-10-24).
// Lists the parcels this office received with no payment recorded yet; one entry
// per parcel, cash or mobile money (mobile money once the server allows it).
// The office's own record: KenteXa never holds the money.
const card = { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const input = { width: '100%', boxSizing: 'border-box', height: 44, border: '1px solid #cbd5e1', borderRadius: 10, padding: '0 12px', fontSize: 15, fontFamily: 'inherit' };
const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
const tzs = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;
const METHOD_LABEL = { cash: 'Taslimu', mobile_money: 'Mobile money' };

function PaymentRow({ row, methods, onSaved }) {
  const [amount, setAmount] = useState(row.amountDue ? String(row.amountDue) : '');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/office/shipment-payments', {
        parcelId: row.parcelId, amount: Number(digits(amount)), method,
        reference: method === 'mobile_money' && reference.trim() ? reference.trim() : undefined,
      });
      onSaved(row);
    } catch (e) {
      setError(e?.response?.data?.message || 'Imeshindikana kuweka malipo.');
    } finally { setBusy(false); }
  };

  const label = row.waybill || row.trackingNumber;
  return (
    <div style={card} data-testid="office-payment-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>{label}</strong>
        {row.amountDue != null && <span style={{ fontSize: 12, color: '#475569' }}>Bei: {tzs(row.amountDue)}</span>}
      </div>
      <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
        {row.itemDescription || 'Mzigo'} → {row.destinationCity || '—'} · Mtumaji: {row.sender?.name || '—'}
      </div>
      <label htmlFor={`pay-${row.parcelId}`} style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', margin: '10px 0 4px' }}>
        Kiasi alicholipa (TZS)
      </label>
      {/* The suggested amount is not typed work: it never holds back an automatic update. */}
      <input id={`pay-${row.parcelId}`} inputMode="numeric" style={input}
        data-reload-safe={digits(amount) === String(row.amountDue ?? '') ? '' : undefined}
        value={digits(amount) ? Number(digits(amount)).toLocaleString('en-US') : ''} onChange={(e) => setAmount(digits(e.target.value))} />
      {methods.length > 1 && (
        <div role="radiogroup" aria-label="Njia ya malipo" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {methods.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
              style={{ flex: 1, height: 40, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: method === m ? '2px solid #1d4ed8' : '1px solid #cbd5e1', background: method === m ? '#eff6ff' : '#fff' }}>
              {METHOD_LABEL[m] || m}
            </button>
          ))}
        </div>
      )}
      {method === 'mobile_money' && (
        <input aria-label="Namba ya muamala (hiari)" placeholder="Namba ya muamala (hiari)" style={{ ...input, marginTop: 8 }}
          value={reference} onChange={(e) => setReference(e.target.value)} />
      )}
      {error && <div role="alert" style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{error}</div>}
      <button type="button" onClick={save} disabled={busy || !(Number(digits(amount)) > 0)}
        style={{ width: '100%', height: 44, marginTop: 10, border: 0, borderRadius: 10, background: '#15803d', color: '#fff',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: busy || !(Number(digits(amount)) > 0) ? 0.6 : 1 }}>
        {busy ? 'Inahifadhi…' : `Weka malipo ${METHOD_LABEL[method] ? `(${METHOD_LABEL[method].toLowerCase()})` : ''}`}
      </button>
    </div>
  );
}

export default function OfficeShipmentPayments({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try { const res = await api.get('/office/shipment-payments/pending'); setData(res.data); }
    catch { setData(null); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!data || !data.parcels?.length) {
    return message ? <div role="status" style={{ ...card, fontSize: 12, fontWeight: 700, color: '#065F46', background: '#ECFDF5' }}>{message}</div> : null;
  }
  const saved = (row) => {
    setMessage(`Malipo ya ${row.waybill || row.trackingNumber} yamewekwa. Mtumaji amepata SMS.`);
    load();
  };
  return (
    <div style={{ marginBottom: 20 }} data-testid="office-shipment-payments">
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        Malipo ya kuweka ({data.parcels.length})
      </div>
      {message && <div role="status" style={{ ...card, padding: 10, fontSize: 12, fontWeight: 700, color: '#065F46', background: '#ECFDF5' }}>{message}</div>}
      {data.parcels.map((row) => <PaymentRow key={row.parcelId} row={row} methods={data.methods || ['cash']} onSaved={saved} />)}
    </div>
  );
}
