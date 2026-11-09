/**
 * Admin: everything about one business on one page (owner 2026-11-09). Owner, members, what it
 * may do (capabilities), counts, latest orders and every recorded action of the business.
 * GET /activity/admin/businesses/:businessId. Read-only.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import ActivityList from '../components/ActivityList';
import api from '../../api/api';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const tzs = (v) => `TZS ${Number(v || 0).toLocaleString('en-US')}`;
const CAP = { commerce: 'Kuuza', transport: 'Usafiri', super_agent: 'Ofisi', service: 'Huduma', cargo: 'Mizigo' };

export default function AdminBusinessView({ businessId, activePage, onNavigate, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!businessId) { setError('Biashara haijachaguliwa'); return; }
    setData(null); setError('');
    api.get(`/activity/admin/businesses/${businessId}`).then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Haikupatikana'));
  }, [businessId]);
  const b = data?.business; const c = data?.counts || {};
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar activePage={activePage || 'Businesses'} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 1000, color: '#0f172a', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" onClick={() => onNavigate('Businesses')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Biashara</button>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {!data && !error && <p style={{ color: '#64748b' }}>Inapakia...</p>}
        {b && (
          <>
            <section style={card} data-testid="business-head">
              <h1 style={{ margin: 0, fontSize: 22 }}>{b.tradingName || b.legalName}</h1>
              <div style={{ color: '#475569', marginTop: 4 }}>{b.legalName} · {b.status}</div>
              <div style={{ marginTop: 8, fontSize: 14 }}>Mmiliki:{' '}
                <button type="button" onClick={() => onNavigate('AdminPerson', { userId: b.ownerId })}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                  {b.ownerName || `#${b.ownerId}`}
                </button>{b.ownerPhone ? ` · ${b.ownerPhone}` : ''}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(data.capabilities || []).map((x) => (
                  <span key={`${x.workspaceId}-${x.capabilityCode}`} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: x.status === 'active' ? '#dcfce7' : '#f1f5f9' }}>
                    {CAP[x.capabilityCode] || x.capabilityCode} · {x.status}
                  </span>
                ))}
              </div>
            </section>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              {[['Bidhaa', c.products], ['Oda', c.orders], ['Huduma', c.services], ['Ofisi', c.offices], ['Wanatimu', (data.members || []).length]].map(([label, v]) => (
                <div key={label} style={card}><div style={{ fontSize: 22, fontWeight: 800 }}>{v ?? '—'}</div><div style={{ fontSize: 12, color: '#64748b' }}>{label}</div></div>
              ))}
            </section>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Timu</h2>
                {(data.members || []).map((m) => (
                  <button key={m.id} type="button" onClick={() => onNavigate('AdminPerson', { userId: m.userId })}
                    style={{ display: 'block', background: 'none', border: 'none', padding: '5px 0', color: '#0f172a', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textAlign: 'left' }}>
                    {m.name || `#${m.userId}`} · {m.role} · {m.status}
                  </button>
                ))}
              </div>
              <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Oda za karibuni</h2>
                {(data.recentOrders || []).length === 0 ? <p style={{ color: '#64748b', fontSize: 14 }}>Hakuna</p> : data.recentOrders.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>#{o.id} · {o.status}</span><b>{tzs(o.totalAmount)}</b>
                  </div>
                ))}
              </div>
            </section>
            <section style={card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Shughuli za biashara ({(data.events || []).length})</h2>
              <ActivityList items={data.events || []} onOpenPerson={(id) => onNavigate('AdminPerson', { userId: id })} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
