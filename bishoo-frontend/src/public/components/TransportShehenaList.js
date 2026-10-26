import React, { useEffect, useState } from 'react';
import api from '../../api/api';

/**
 * The transporter's view of the shehena offices loaded onto it (owner 2026-10-26):
 * from which office, to which office, how many parcels, the weight and the fare the
 * office agreed with it. Customers never see this; it is between office and transport.
 */
const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export default function TransportShehenaList() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get('/super-agents/shehena/as-transport').then((r) => setRows(r.data?.shehena || [])).catch(() => setRows([]));
  }, []);
  if (rows == null) return <div style={{ fontSize: 14, color: '#475569' }}>Inapakia…</div>;
  if (!rows.length) {
    return (
      <div data-testid="transport-shehena-empty" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, fontSize: 14, color: '#475569' }}>
        Bado hakuna shehena. Ofisi ikikuchagua inapotuma shehena, itaonekana hapa.
      </div>
    );
  }
  return (
    <div data-testid="transport-shehena" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((s) => (
        <div key={s.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{s.originCity} → {s.destinationCity}</strong>
            <span style={{ fontSize: 13, color: '#475569' }}>{s.code || `#${s.id}`}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Vifurushi {s.parcels}{s.weightKg ? ` · ${s.weightKg} kg` : ''}{s.fare ? ` · ${tzs(s.fare)}` : ''}</div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            Kutoka: {s.fromOffice || 'Ofisi'}{s.fromPhone ? ` (${s.fromPhone})` : ''}
            {s.toOffice ? ` · Kwenda: ${s.toOffice}${s.toPhone ? ` (${s.toPhone})` : ''}` : ''}
          </div>
          {s.ref && <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>Rejea: {s.ref}</div>}
        </div>
      ))}
    </div>
  );
}
