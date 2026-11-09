/**
 * Admin: everything about one person on one page (owner 2026-11-09: "admin is the mirror of
 * KenteXa"). Account, roles, ID status, businesses, counts, latest orders and shipments, and
 * every recorded action by or about them. GET /activity/admin/people/:userId. Read-only.
 */
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import ActivityList from '../components/ActivityList';
import api from '../../api/api';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 };
const tzs = (v) => `TZS ${Number(v || 0).toLocaleString('en-US')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('sw-TZ') : '—');
// Phone in international digits for WhatsApp (07xx -> 2557xx).
export const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return `255${d.slice(1)}`;
  return d;
};
const contactBtn = { display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 18, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' };
const ID_LABEL = { verified: 'Kimeangaliwa', pending: 'Kimetumwa, kinasubiri', rejected: 'Kimekataliwa', not_submitted: 'Hakijatumwa' };

export default function AdminPerson({ userId, activePage, onNavigate, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!userId) { setError('Mtumiaji hajachaguliwa'); return; }
    setData(null); setError('');
    api.get(`/activity/admin/people/${userId}`).then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.message || 'Haikupatikana'));
  }, [userId]);
  const u = data?.user; const c = data?.counts || {};
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar activePage={activePage || 'Users'} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, maxWidth: 1000, color: '#0f172a', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" onClick={() => onNavigate('Users')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Watumiaji</button>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {!data && !error && <p style={{ color: '#64748b' }}>Inapakia...</p>}
        {u && (
          <>
            <section style={card} data-testid="person-head">
              <h1 style={{ margin: 0, fontSize: 22 }}>{u.name || `Mtumiaji #${u.id}`}</h1>
              <div style={{ color: '#475569', marginTop: 4 }}>{[u.phone, u.email, `alijiunga ${day(u.createdAt)}`].filter(Boolean).join(' · ')}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(data.roles || []).map((r) => (
                  <span key={r.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: r.status === 'active' ? '#dcfce7' : '#f1f5f9', color: '#0f172a' }}>{r.roleType} · {r.status}</span>
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="person-contact">
                <button type="button" data-testid="person-message" onClick={() => onNavigate('Announcements', { targetUserId: u.id, targetName: u.name || u.phone || `#${u.id}` })}
                  style={{ ...contactBtn, background: '#0f172a', color: '#fff', border: 'none' }}>Tuma taarifa</button>
                {u.phone && (
                  <>
                    <a href={`tel:${u.phone}`} style={contactBtn}>Piga</a>
                    <a href={`https://wa.me/${waNumber(u.phone)}`} target="_blank" rel="noreferrer" style={contactBtn}>WhatsApp</a>
                    <a href={`sms:${u.phone}`} style={contactBtn}>SMS ya simu yako</a>
                  </>
                )}
                {u.email && <a href={`mailto:${u.email}`} style={contactBtn}>Barua pepe</a>}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>Kitambulisho: <b>{ID_LABEL[data.identity?.status] || 'Hakijatumwa'}</b>{data.identity?.reviewedAt ? ` (${day(data.identity.reviewedAt)})` : ''}</div>
            </section>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              {[['Oda alizonunua', c.ordersBought], ['Oda alizouza', c.ordersSold], ['Bidhaa', c.products], ['Matangazo', c.classifieds], ['Huduma', c.services], ['Mizigo', c.shipments], ['Moments', c.moments]].map(([label, v]) => (
                <div key={label} style={card}><div style={{ fontSize: 22, fontWeight: 800 }}>{v ?? '—'}</div><div style={{ fontSize: 12, color: '#64748b' }}>{label}</div></div>
              ))}
            </section>
            {data.businesses?.length > 0 && (
              <section style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Biashara</h2>
                {data.businesses.map((b) => (
                  <button key={b.id} type="button" onClick={() => onNavigate('AdminBusinessView', { businessId: b.id })}
                    style={{ display: 'block', background: 'none', border: 'none', padding: '6px 0', color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                    {b.name} · {b.status}
                  </button>
                ))}
              </section>
            )}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Oda za karibuni</h2>
                {(data.recentOrders || []).length === 0 ? <p style={{ color: '#64748b', fontSize: 14 }}>Hakuna</p> : data.recentOrders.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span>#{o.id} · {o.asBuyer ? 'alinunua' : 'aliuza'} · {o.status}</span><b>{tzs(o.totalAmount)}</b>
                  </div>
                ))}
              </div>
              <div style={card}>
                <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Mizigo ya karibuni</h2>
                {(data.recentShipments || []).length === 0 ? <p style={{ color: '#64748b', fontSize: 14 }}>Hakuna</p> : data.recentShipments.map((s) => (
                  <div key={s.id} style={{ fontSize: 14, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    {s.trackingNumber || `#${s.id}`} · {s.originCity} → {s.destinationCity} · {s.status}
                  </div>
                ))}
              </div>
            </section>
            <section style={card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Shughuli zake ({(data.events || []).length})</h2>
              <ActivityList items={data.events || []} onOpenPerson={(id) => onNavigate('AdminPerson', { userId: id })} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
