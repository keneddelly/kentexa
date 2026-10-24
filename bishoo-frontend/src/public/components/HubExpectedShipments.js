import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// The office's list of parcels it is waiting for (logistics repair Gate 5;
// one waybill for every parcel, owner 2026-10-24).
//
// A parcel reaches the office one of three ways:
//   - the sender drops it off       -> the office receives it by its number;
//   - an Agent brings it            -> the office confirms that Agent's handover;
//   - a seller brings a marketplace order -> the office receives the order
//     (its own step: fees and order status).
// Every row shows the parcel's one KenteXa waybill (KTX 4829 1037 52). The
// server says which action applies (`nextAction`) and refuses anything else.
const card = { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btn = { border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', backgroundColor: '#2563eb', color: '#fff' };
const plain = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '');

export default function HubExpectedShipments({ onReceived }) {
  const [rows, setRows] = useState([]);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try { const res = await api.get('/pickup-tasks/hub/expected'); setRows(res.data || []); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key, request, okText) => {
    setBusy(key); setMessage(null);
    try {
      await request();
      setMessage({ type: 'ok', text: okText });
      setNumber('');
      await load();
      if (onReceived) onReceived();
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Imeshindikana. Jaribu tena.' });
    } finally { setBusy(null); }
  };
  const label = (row) => row.waybill || row.trackingNumber;
  const receiveFromSender = (trackingNumber, shown = trackingNumber) => act(trackingNumber,
    () => api.patch(`/super-agents/parcels/${encodeURIComponent(trackingNumber)}/status`, { status: 'received_at_hub' }),
    `${shown} imepokewa ofisini.`);
  const receiveOrder = (row) => act(row.trackingNumber,
    () => api.patch(`/orders/${row.orderId}/super-agent-receive`, {}),
    `Oda #${row.orderId} (${label(row)}) imepokewa ofisini.`);
  const confirmAgentHandover = (row) => act(row.trackingNumber,
    () => api.post(`/pickup-tasks/${row.pickupTask.id}/hub-receive`),
    `${label(row)} imepokewa kutoka kwa wakala.`);

  const typed = number.trim().toUpperCase();
  // A typed number that is a marketplace order in the list goes to its order step.
  const receiveTyped = () => {
    const row = rows.find((r) => [r.waybill, r.trackingNumber].some((n) => n && plain(n) === plain(typed)));
    if (row?.nextAction === 'receive_order') return receiveOrder(row);
    return receiveFromSender(typed);
  };
  return (
    <div style={{ marginBottom: 20 }} data-testid="hub-expected-shipments">
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        Mizigo inayokuja ofisini ({rows.length})
      </div>
      <div style={{ ...card, display: 'flex', gap: 8 }}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Namba ya mzigo, mfano KTX 4829 1037 52" aria-label="Namba ya mzigo"
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14 }} />
        <button style={btn} disabled={!typed || busy === typed} onClick={receiveTyped}>Pokea</button>
      </div>
      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} style={{ ...card, padding: 10, fontSize: 12, fontWeight: 700,
          color: message.type === 'error' ? '#B91C1C' : '#065F46', backgroundColor: message.type === 'error' ? '#FEF2F2' : '#ECFDF5' }}>
          {message.text}
        </div>
      )}
      {rows.map((row) => (
        <div key={row.parcelId} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{label(row)}</strong>
            <span style={{ fontSize: 11, color: '#64748b' }}>{row.weightKg > 0 ? `${row.weightKg} kg` : ''}</span>
          </div>
          {(row.orderId || (row.waybill && row.trackingNumber)) && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {row.orderId ? `Oda #${row.orderId}` : row.trackingNumber}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            {row.itemDescription || 'Mzigo'} → {row.destinationCity}
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            {row.orderId ? 'Muuzaji' : 'Mtumaji'}: {row.sender?.name || '—'}{row.sender?.phone ? <> · <a href={`tel:${row.sender.phone}`}>{row.sender.phone}</a></> : null}
          </div>
          {row.bookedTrip && (
            <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4, fontWeight: 700 }}>
              Imewekwa kwenye {row.bookedTrip.providerName || 'safari'} · {new Date(row.bookedTrip.departureAt).toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {row.nextAction === 'receive_from_sender' && (
              <button style={btn} disabled={busy === row.trackingNumber} onClick={() => receiveFromSender(row.trackingNumber, label(row))}>
                Mtumaji yuko hapa — pokea mzigo
              </button>
            )}
            {row.nextAction === 'receive_order' && (
              <button style={btn} disabled={busy === row.trackingNumber} onClick={() => receiveOrder(row)}>
                Muuzaji yuko hapa — pokea oda
              </button>
            )}
            {row.nextAction === 'confirm_agent_handover' && (
              <button style={btn} disabled={busy === row.trackingNumber} onClick={() => confirmAgentHandover(row)}>
                Thibitisha umepokea kutoka kwa {row.pickupTask?.agentName || 'wakala'}
              </button>
            )}
            {row.nextAction === 'agent_on_the_way' && (
              <div style={{ fontSize: 12, color: '#92400E' }}>
                {row.pickupTask?.agentName ? `${row.pickupTask.agentName} analeta mzigo huu.` : 'Wakala ameombwa kuchukua mzigo huu.'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
