import React, { useCallback, useState } from 'react';
import api from '../../api/api';

// The parcels senders booked on one Run (logistics repair Gate 5), for the
// transporter who owns it. Each row shows where the parcel stands; one that
// has reached the load hub can be accepted onto the Run with one tap -- the
// server uses the stops it committed the booking to, never values from here.
const STATE = {
  not_confirmed: ['Sender has not confirmed yet', '#64748b'],
  awaiting_parcel: ['Not at the load hub yet', '#92400E'],
  ready_to_assign: ['At the load hub — ready', '#065F46'],
  assigned: ['On the manifest', '#1d4ed8'],
  loaded: ['On board', '#1d4ed8'],
  unloaded: ['Off-loaded', '#475569'],
  received: ['Received at destination', '#475569'],
};

export default function RunBookings({ runId, onAssigned }) {
  const [rows, setRows] = useState(null); // null = not opened
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { const res = await api.get(`/van-pilot/runs/${runId}/bookings`); setRows(res.data || []); }
    catch (err) { setError(err?.response?.data?.message || 'Could not load the bookings for this trip'); setRows([]); }
  }, [runId]);

  const accept = async (booking) => {
    setBusy(booking.parcelId); setError('');
    try {
      await api.post(`/van-pilot/runs/${runId}/bookings/${booking.parcelId}/assign`);
      await load();
      if (onAssigned) onAssigned();
    } catch (err) { setError(err?.response?.data?.message || 'Could not accept this parcel onto the trip'); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => (rows === null ? load() : setRows(null))}
        style={{ border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontWeight: 700, background: '#EFF6FF', color: '#1d4ed8' }}>
        {rows === null ? 'Booked parcels' : 'Hide booked parcels'}
      </button>
      {error && <div role="alert" style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>{error}</div>}
      {rows !== null && rows.length === 0 && !error && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>No sender has booked this trip yet.</div>
      )}
      {rows !== null && rows.map((b) => {
        const [label, color] = STATE[b.state] || [b.state, '#475569'];
        return (
          <div key={b.shipmentId} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 800 }}>
              <span>{b.trackingNumber || `Shipment #${b.shipmentId}`}</span>
              <span style={{ color }}>{label}</span>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
              {b.itemDescription || 'Parcel'}{b.weightKg > 0 ? ` · ${b.weightKg} kg` : ''} · {b.loadStop || '?'} → {b.unloadStop || '?'}
            </div>
            {b.state === 'ready_to_assign' && (
              <button disabled={busy === b.parcelId} onClick={() => accept(b)}
                style={{ border: 'none', borderRadius: 8, padding: '8px 12px', marginTop: 6, cursor: 'pointer', fontWeight: 800, background: '#1d4ed8', color: '#fff' }}>
                Accept onto this trip
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
