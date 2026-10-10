import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';
import { formatWaybill } from '../../utils/waybill';

// Admin view of the "received but not dispatched" reminder: every "Still
// here" tap (who, which parcel, when) and every evening SMS attempt.
const STATUS = { sent: 'Imetumwa', failed: 'Imeshindikana', no_phone: 'Hakuna simu ya ofisi', sending: 'Inatuma…' };
const fmt = (d) => (d ? new Date(d).toLocaleString('sw-TZ') : '—');

export default function AdminDispatchReminders({ activePage, onNavigate, onLogout }) {
  const [days, setDays] = useState(7);
  const [marks, setMarks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true); setError('');
    Promise.all([
      api.get('/dispatch-reminders/admin/still-here', { params: { days } }),
      api.get('/dispatch-reminders/admin/reminders', { params: { days } }),
    ]).then(([m, r]) => { setMarks(m.data || []); setReminders(r.data || []); })
      .catch((e) => setError(e.response?.data?.message || 'Imeshindikana kupakia'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = { background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', marginBottom: 16 };
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0' };
  const td = { padding: '8px 10px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'Manrope,Inter,sans-serif' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0, color: '#0f172a' }}>⏰ Dispatch reminders</h1>
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 13 }}>
              Vifurushi vilivyopokelewa bila taarifa za kusafirisha: alama za "Bado kiko hapa" na SMS za jioni kwa ofisi.
            </p>
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 10 }}>
            {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Siku {d}</option>)}
          </select>
        </div>
        {error && <div style={{ padding: 12, background: '#fee2e2', color: '#b91c1c', borderRadius: 10, marginBottom: 16 }}>{error}</div>}
        {loading ? <div>Inapakia…</div> : (
          <>
            <div style={card}>
              <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>✋ "Bado kiko hapa" ({marks.length})</h2>
              {marks.length === 0 ? <div style={{ color: '#64748b', fontSize: 13 }}>Hakuna alama.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Lini</th><th style={th}>Ofisi</th><th style={th}>Kifurushi</th><th style={th}>Kwenda</th><th style={th}>Hali sasa</th><th style={th}>Aliyebonyeza</th></tr></thead>
                  <tbody>{marks.map((m) => (
                    <tr key={m.id}>
                      <td style={td}>{fmt(m.markedAt)}</td>
                      <td style={td}>{m.officeName} · {m.officeCity}</td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{m.waybillNumber ? formatWaybill(m.waybillNumber) : m.trackingNumber}</td>
                      <td style={td}>{m.destinationCity}</td>
                      <td style={td}>{m.parcelStatus}</td>
                      <td style={td}>{m.markedByName || `#${m.markedByUserId}`}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </div>
            <div style={card}>
              <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>📩 SMS za jioni ({reminders.length})</h2>
              {reminders.length === 0 ? <div style={{ color: '#64748b', fontSize: 13 }}>Hakuna SMS.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Tarehe</th><th style={th}>Ofisi</th><th style={th}>Vifurushi</th><th style={th}>Hali</th><th style={th}>Majaribio</th><th style={th}>Kosa</th></tr></thead>
                  <tbody>{reminders.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{String(r.reminderDate).slice(0, 10)}</td>
                      <td style={td}>{r.officeName} · {r.officeCity}</td>
                      <td style={td}>{r.parcelCount}</td>
                      <td style={{ ...td, fontWeight: 800, color: r.status === 'sent' ? '#16a34a' : '#b91c1c' }}>{STATUS[r.status] || r.status}</td>
                      <td style={td}>{r.attempts}</td>
                      <td style={{ ...td, fontSize: 12, color: '#64748b' }}>{r.lastError || '—'}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
