import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import { formatWaybill } from '../../utils/waybill';

// Red notice: parcels received at this office with no dispatch information
// for longer than the setting (default 24 h). Stays red until the list is
// empty. It loads on its own and hides itself on any error, so it can never
// block the counter.
const ago = (iso) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 48) return `saa ${hours} zilizopita`;
  return `siku ${Math.floor(hours / 24)} zilizopita`;
};

export default function StaleParcelsNotice({ onAddToShehena }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const res = await api.get('/dispatch-reminders/mine'); setData(res.data); }
    catch { setData(null); }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data || !data.count) return null;

  const stillHere = async (parcelId) => {
    setBusyId(parcelId); setError('');
    try { await api.post(`/dispatch-reminders/parcels/${parcelId}/still-here`); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'Imeshindikana. Jaribu tena.'); }
    finally { setBusyId(null); }
  };

  const btn = (bg, color, border) => ({ flex: 1, padding: '9px 8px', borderRadius: 9, border: `1px solid ${border}`,
    backgroundColor: bg, color, fontSize: 12, fontWeight: 800, cursor: 'pointer' });

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12,
          border: 'none', backgroundColor: '#dc2626', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ minWidth: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', color: '#dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15 }}>{data.count}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>
          {data.count === 1 ? 'Kifurushi kimepokelewa' : 'Vifurushi vimepokelewa'} bila taarifa za kusafirisha (zaidi ya saa {data.staleHours})
        </span>
        <span style={{ fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ backgroundColor: '#fff', borderRadius: 12, marginTop: 6, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          {data.parcels.map((p) => (
            <div key={p.parcelId} style={{ borderBottom: '1px solid #f1f5f9', padding: '10px 4px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 900, color: '#0f172a' }}>
                {p.waybillNumber ? formatWaybill(p.waybillNumber) : p.trackingNumber}
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                {p.recipientName || 'Mpokeaji hajaandikwa'} · {p.destinationCity} · kimepokelewa {ago(p.receivedAt)}
              </div>
              {p.bulkShipmentCode && (
                <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>Kiko kwenye shehena {p.bulkShipmentCode} ambayo bado haijatumwa</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => onAddToShehena && onAddToShehena(p)} style={btn('#eff6ff', '#1d4ed8', '#bfdbfe')}>
                  {p.bulkShipmentCode ? '📦 Fungua shehena' : '📦 Ongeza kwenye shehena'}
                </button>
                <button onClick={() => stillHere(p.parcelId)} disabled={busyId === p.parcelId} style={btn('#fff', '#334155', '#cbd5e1')}>
                  {busyId === p.parcelId ? '⏳' : '✋ Bado kiko hapa'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
