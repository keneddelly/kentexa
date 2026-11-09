/**
 * Admin stage 3 (owner 2026-11-09: "all features found on KenteXa can be accessed by admin in
 * dashboard"). One screen for each kind of data that had no admin page; the menu item picks the
 * list (GET /admin-intelligence/data/:dataset). Words and status filters; people and businesses
 * open their own admin page. Reported Moments can be hidden or kept.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

// The admin menu item -> the list it opens.
export const PAGE_DATASET = {
  AdminMoments: 'moments', AdminReports: 'reports', AdminCommunities: 'communities', AdminHotelOrders: 'hotel_orders',
  AdminPosSales: 'pos_sales', AdminTeamInvitations: 'team_invitations', AdminInstagram: 'instagram', AdminOfficePrices: 'office_prices',
  AdminAgentJobs: 'agent_jobs', AdminReviews: 'reviews', AdminNotifications: 'notifications',
};

const NOTE = {
  moments: 'Kila Moment iliyowekwa, na ripoti zake.',
  reports: 'Moments ambazo watu wameripoti. Ficha (haionekani tena) au acha.',
  communities: 'Jumuiya zote, mwenye kuifungua na wanachama.',
  hotel_orders: 'Oda za chakula za hoteli na migahawa.',
  pos_sales: 'Mauzo yaliyofanywa kwa KenteXa POS.',
  team_invitations: 'Mialiko ya wafanyakazi kwenye biashara.',
  instagram: 'Biashara zilizounganisha Instagram, na kama ujumbe unaingia.',
  office_prices: 'Bei ambazo ofisi zimeweka (Bei zangu).',
  agent_jobs: 'Kazi za kuchukua mizigo: zinazosubiri, zilizokubaliwa na zilizofanyika.',
  reviews: 'Maoni ya wanunuzi kwa maduka na bidhaa.',
  notifications: 'Taarifa ambazo KenteXa imetuma kwa watu ndani ya programu. (Hakuna kumbukumbu ya SMS zilizotumwa.)',
};

// Column label + how to show it. Columns not listed are not shown.
const COLS = {
  moments: [['id', '#'], ['title', 'Kichwa'], ['type', 'Aina'], ['authorName', 'Mwandishi', 'person:authorId'], ['status', 'Hali'], ['visibility', 'Wanaoona'], ['reports', 'Ripoti'], ['openReports', 'Wazi'], ['createdAt', 'Lini', 'date']],
  reports: [['id', '#'], ['postTitle', 'Moment'], ['authorName', 'Mwandishi', 'person:authorId'], ['reporterName', 'Aliyeripoti', 'person:reporterId'], ['reason', 'Sababu'], ['note', 'Maelezo'], ['status', 'Hali'], ['postStatus', 'Hali ya Moment'], ['createdAt', 'Lini', 'date']],
  communities: [['id', '#'], ['name', 'Jina'], ['purpose', 'Lengo'], ['ownerName', 'Mfunguaji', 'person:ownerId'], ['memberCount', 'Wanachama'], ['joinPolicy', 'Kujiunga'], ['status', 'Hali'], ['createdAt', 'Lini', 'date']],
  hotel_orders: [['id', '#'], ['businessName', 'Hoteli', 'business:businessId'], ['mode', 'Aina'], ['placeNumber', 'Meza/Chumba'], ['customerName', 'Mteja', 'person:customerId'], ['totalAmount', 'Jumla', 'tzs'], ['paymentStatus', 'Malipo'], ['status', 'Hali'], ['createdAt', 'Lini', 'date']],
  pos_sales: [['id', '#'], ['receiptNumber', 'Risiti'], ['sellerName', 'Muuzaji', 'person:sellerId'], ['customerName', 'Mteja'], ['total', 'Jumla', 'tzs'], ['paymentMethod', 'Njia'], ['balanceDue', 'Deni', 'tzs'], ['status', 'Hali'], ['createdAt', 'Lini', 'date']],
  team_invitations: [['id', '#'], ['businessName', 'Biashara'], ['name', 'Aliyealikwa'], ['phone', 'Simu'], ['role', 'Kazi'], ['invitedByName', 'Aliyealika', 'person:invitedByUserId'], ['status', 'Hali'], ['createdAt', 'Lini', 'date']],
  instagram: [['id', '#'], ['businessName', 'Biashara', 'business:businessId'], ['instagramUsername', 'Instagram'], ['facebookPageName', 'Page'], ['status', 'Hali'], ['webhookSubscribed', 'Ujumbe unaingia', 'bool'], ['webhookError', 'Sababu'], ['connectedAt', 'Iliunganishwa', 'date']],
  office_prices: [['id', '#'], ['officeName', 'Ofisi'], ['originCity', 'Kutoka'], ['destinationCity', 'Kwenda'], ['ratePerKg', 'Kwa kg', 'tzs'], ['minimumCharge', 'Kiwango cha chini', 'tzs'], ['estimatedDays', 'Siku'], ['isActive', 'Inatumika', 'bool']],
  agent_jobs: [['id', '#'], ['trackingNumber', 'Mzigo'], ['originCity', 'Kutoka'], ['destinationCity', 'Kwenda'], ['senderName', 'Mtumaji', 'person:senderId'], ['agentName', 'Wakala'], ['status', 'Hali'], ['createdAt', 'Iliombwa', 'date'], ['claimedAt', 'Ilikubaliwa', 'date']],
  reviews: [['kind', 'Kwa'], ['subjectName', 'Duka/Bidhaa'], ['rating', 'Nyota'], ['comment', 'Maoni'], ['reviewerName', 'Aliyeandika', 'person:reviewerId'], ['verified', 'Alinunua', 'bool'], ['createdAt', 'Lini', 'date']],
  notifications: [['id', '#'], ['userName', 'Kwa', 'person:userId'], ['type', 'Aina'], ['title', 'Kichwa'], ['body', 'Ujumbe'], ['isRead', 'Imesomwa', 'bool'], ['createdAt', 'Lini', 'date']],
};

const cell = { padding: '8px 10px', borderTop: '1px solid #e2e8f0', verticalAlign: 'top', fontSize: 13 };
const input = { height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'inherit', background: '#fff' };
const link = { background: 'none', border: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left' };

export default function AdminData({ dataset, activePage, onNavigate, onLogout }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (status.trim()) params.status = status.trim();
      const r = await api.get(`/admin-intelligence/data/${dataset}`, { params });
      setData(r.data);
    } catch (e) { setError(e?.response?.data?.message || 'Data haikupatikana'); setData(null); }
  }, [dataset, q, status]);
  useEffect(() => { setData(null); const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const review = async (row, decision) => {
    setBusy(row.id); setError('');
    try { await api.post(`/admin-intelligence/reports/${row.id}/review`, { decision }); await load(); }
    catch (e) { setError(e?.response?.data?.message || 'Imeshindikana'); }
    finally { setBusy(null); }
  };

  const show = (row, [key, , kind]) => {
    const v = row[key];
    if (kind === 'date') return v ? new Date(v).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    if (kind === 'tzs') return v == null ? '—' : `TZS ${Number(v).toLocaleString('en-US')}`;
    if (kind === 'bool') return v ? 'Ndiyo' : 'Hapana';
    if (kind && kind.startsWith('person:')) {
      const id = row[kind.slice(7)];
      return id ? <button type="button" style={link} onClick={() => onNavigate('AdminPerson', { userId: Number(id) })}>{v || `#${id}`}</button> : (v || '—');
    }
    if (kind && kind.startsWith('business:')) {
      const id = row[kind.slice(9)];
      return id ? <button type="button" style={link} onClick={() => onNavigate('AdminBusinessView', { businessId: Number(id) })}>{v || `#${id}`}</button> : (v || '—');
    }
    if (v == null || v === '') return '—';
    const s = String(v);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  };

  const cols = COLS[dataset] || [];
  const rows = data?.rows || [];
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, color: '#0f172a', minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{data?.title || 'Data'}</h1>
        <p style={{ margin: '4px 0 16px', color: '#64748b' }}>{NOTE[dataset]}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input aria-label="Tafuta" placeholder="Tafuta" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, flex: 1, minWidth: 180 }} />
          <input aria-label="Hali" placeholder="Hali (mf. open, active)" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...input, width: 200 }} />
        </div>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {data?.unavailable && <p style={{ color: '#b45309' }}>Data hii haipatikani sasa kwenye server.</p>}
        {!data && !error ? <p style={{ color: '#64748b' }}>Inapakia...</p> : (
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
            <table data-testid={`data-${dataset}`} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr>
                {cols.map(([k, label]) => <th key={k} style={{ ...cell, borderTop: 'none', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</th>)}
                {dataset === 'reports' && <th style={{ ...cell, borderTop: 'none' }}>Hatua</th>}
              </tr></thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={cols.length + 1} style={{ ...cell, color: '#64748b' }}>Hakuna kitu bado.</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={`${row.kind || ''}${row.id ?? i}`} data-testid={`row-${row.kind || ''}${row.id ?? i}`}>
                    {cols.map((c) => <td key={c[0]} style={cell}>{show(row, c)}</td>)}
                    {dataset === 'reports' && (
                      <td style={cell}>{row.status === 'open' ? (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button type="button" data-testid={`hide-${row.id}`} disabled={busy !== null} onClick={() => review(row, 'hide')}>Ficha Moment</button>
                          <button type="button" data-testid={`keep-${row.id}`} disabled={busy !== null} onClick={() => review(row, 'keep')}>Acha</button>
                        </span>
                      ) : '—'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
