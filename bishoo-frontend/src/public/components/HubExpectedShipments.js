import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';

// The hub desk's list of Shipments it is waiting for (logistics repair Gate 5).
//
// A Shipment that chose this hub reaches it one of two ways:
//   - the sender drops it off  -> the desk receives it by the customer's
//     own Shipment number (typed, or tapped in the list);
//   - an Agent brings it       -> the desk confirms that Agent's handover.
// The server says which (`nextAction`) and refuses anything else, so the
// desk cannot receive a parcel an Agent is still carrying.
const card = { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const btn = { border: 'none', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', backgroundColor: '#2563eb', color: '#fff' };

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
      setMessage({ type: 'error', text: err?.response?.data?.message || 'That did not work. Try again.' });
    } finally { setBusy(null); }
  };
  // The customer's Shipment number is all the desk needs.
  const receiveFromSender = (trackingNumber) => act(trackingNumber,
    () => api.patch(`/super-agents/parcels/${encodeURIComponent(trackingNumber)}/status`, { status: 'received_at_hub' }),
    `Received ${trackingNumber} at this hub.`);
  const confirmAgentHandover = (row) => act(row.trackingNumber,
    () => api.post(`/pickup-tasks/${row.pickupTask.id}/hub-receive`),
    `Received ${row.trackingNumber} from the Agent.`);

  const typed = number.trim().toUpperCase();
  return (
    <div style={{ marginBottom: 20 }} data-testid="hub-expected-shipments">
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        Booked shipments coming to this hub ({rows.length})
      </div>
      <div style={{ ...card, display: 'flex', gap: 8 }}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Shipment number, e.g. KTX-SHP-42" aria-label="Shipment number"
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14 }} />
        <button style={btn} disabled={!typed || busy === typed} onClick={() => receiveFromSender(typed)}>Receive</button>
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
            <strong style={{ fontSize: 14 }}>{row.trackingNumber}</strong>
            <span style={{ fontSize: 11, color: '#64748b' }}>{row.weightKg > 0 ? `${row.weightKg} kg` : ''}</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            {row.itemDescription || 'Parcel'} → {row.destinationCity}
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            Sender: {row.sender?.name || '—'}{row.sender?.phone ? <> · <a href={`tel:${row.sender.phone}`}>{row.sender.phone}</a></> : null}
          </div>
          {row.bookedTrip && (
            <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4, fontWeight: 700 }}>
              Booked on {row.bookedTrip.providerName || 'a trip'} · {new Date(row.bookedTrip.departureAt).toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {row.nextAction === 'receive_from_sender' && (
              <button style={btn} disabled={busy === row.trackingNumber} onClick={() => receiveFromSender(row.trackingNumber)}>
                Sender is here — receive parcel
              </button>
            )}
            {row.nextAction === 'confirm_agent_handover' && (
              <button style={btn} disabled={busy === row.trackingNumber} onClick={() => confirmAgentHandover(row)}>
                Confirm receipt from {row.pickupTask?.agentName || 'the Agent'}
              </button>
            )}
            {row.nextAction === 'agent_on_the_way' && (
              <div style={{ fontSize: 12, color: '#92400E' }}>
                {row.pickupTask?.agentName ? `${row.pickupTask.agentName} is bringing this parcel.` : 'An Agent pickup has been requested for this parcel.'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
