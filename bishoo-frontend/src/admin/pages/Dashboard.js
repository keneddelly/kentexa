import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const Dashboard = ({ activePage, onNavigate, onLogout }) => {
  const [overview, setOverview] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [network, setNetwork]   = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [batchStatus, setBatchStatus]   = useState(null);

  useEffect(() => { fetchStats(); fetchPlatformIntelligence(); fetchBatchStatus(); }, []);

  // One call, every number counted in the database (owner 2026-11-09). This used to download
  // every product, order, advert and user to count them here.
  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin-intelligence/overview');
      setOverview(data);
      setRecentOrders(Array.isArray(data?.recentOrders) ? data.recentOrders : []);
    } catch (err) {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  // Internal AI Intelligence, Layer 2 (CLAUDE.md) — real server-side
  // aggregation instead of fetching full lists to count them client-side.
  const fetchPlatformIntelligence = async () => {
    try {
      const res = await api.get('/admin-intelligence/platform?days=7');
      setPlatform(res.data.platformActivity);
      setNetwork(res.data.networkIntelligence);
    } catch (err) {
      console.error('Failed to load platform intelligence', err);
    }
  };

  const fetchBatchStatus = async () => {
    try {
      const res = await api.get('/daily-batches/manifest/today');
      setBatchStatus(res.data);
    } catch { setBatchStatus(null); }
  };

  const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
  const tzs = (v) => (v == null ? '—' : `TZS ${Number(v).toLocaleString('en-US')}`);
  const o = overview || {};
  const act = o.needsAction || {};
  // Waiting for someone at KenteXa: each opens the page where it is done.
  const actionCards = [
    { key: 'identity', title: 'Vitambulisho vinasubiri', value: act.identityPending, page: 'IdentityVerifications' },
    { key: 'applications', title: 'Maombi ya biashara', value: act.applicationsPending, page: 'Businesses' },
    { key: 'sellers', title: 'Wauzaji wanasubiri', value: act.sellersPending, page: 'Sellers' },
    { key: 'offices', title: 'Ofisi zinasubiri', value: act.officesPending, page: 'SuperAgents' },
    { key: 'contact', title: 'Ujumbe wa wateja', value: act.contactOpen, page: 'ContactMessages' },
    { key: 'disputes', title: 'Migogoro wazi', value: act.disputesOpen, page: 'Disputes' },
    { key: 'pickups', title: 'Kazi za mawakala zinasubiri', value: act.pickupsWaiting, page: 'AdminShipments' },
    { key: 'reported', title: 'Moments zilizoripotiwa (siku 7)', value: act.momentsReportedWeek, page: 'AdminReports' },
  ];
  const statCards = [
    { title: 'Watumiaji', value: n(o.users?.total), sub: `+${n(o.users?.today)} leo · +${n(o.users?.week)} siku 7`, color: '#10b981', page: 'Users' },
    { title: 'Biashara', value: n(o.businesses?.total), sub: `+${n(o.businesses?.week)} siku 7`, color: '#6366f1', page: 'Businesses' },
    { title: 'Oda leo', value: n(o.orders?.today), sub: tzs(o.orders?.todayValue), color: '#f59e0b', page: 'Orders' },
    { title: 'Oda siku 7', value: n(o.orders?.week), sub: tzs(o.orders?.weekValue), color: '#f59e0b', page: 'Orders' },
    { title: 'Mizigo inayoendelea', value: n(o.shipments?.open), sub: `${n(o.shipments?.today)} leo · ${n(o.shipments?.week)} siku 7`, color: '#0ea5e9', page: 'AdminShipments' },
    { title: 'Bidhaa', value: n(o.products?.active), sub: `+${n(o.products?.week)} siku 7`, color: '#8b5cf6', page: 'Products' },
    { title: 'Matangazo', value: n(o.classifieds?.active), sub: `+${n(o.classifieds?.week)} siku 7`, color: '#ef4444', page: 'Classifieds' },
    { title: 'Huduma', value: n(o.services?.active), sub: `+${n(o.services?.week)} siku 7`, color: '#14b8a6', page: 'AdminServices' },
    { title: 'Ofisi', value: n(o.offices?.active), sub: 'zinazofanya kazi', color: '#334155', page: 'SuperAgents' },
    { title: 'Mawakala', value: n(o.agents?.total), sub: `${n(o.agents?.online)} mtandaoni sasa`, color: '#334155', page: 'Agents' },
    { title: 'Mauzo yaliyolipwa', value: tzs(o.orders?.paidValue), sub: 'jumla', color: '#0ea5e9', page: 'Payments' },
  ];

  const orderStatusColor = (status) => {
    switch (status) {
      case 'delivered':  return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'pending':    return { backgroundColor: '#fef9c3', color: '#ca8a04' };
      case 'cancelled':  return { backgroundColor: '#fee2e2', color: '#dc2626' };
      default:           return { backgroundColor: '#dbeafe', color: '#2563eb' };
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: '250px', flex: 1, padding: '32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', backgroundColor: '#0f172a', padding: '24px 28px', borderRadius: '16px', color: '#fff' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0 }}>Muhtasari wa KenteXa</h1>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
              {new Date().toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={fetchStats}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            Onyesha upya
          </button>
        </div>

        {/* Batch Delivery Banner */}
        {batchStatus?.batch && (
          <div onClick={() => onNavigate('DispatcherManifest')}
            style={{ backgroundColor: '#1e1b4b', borderRadius: 14, padding: '16px 20px', marginBottom: 24, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#a5b4fc', marginBottom: 4 }}>Dar es Salaam Batch Delivery — Leo</div>
              <div style={{ fontSize: 22, fontWeight:800, color: '#fff' }}>
                {batchStatus.totalParcels} vifurushi
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400, marginLeft: 8 }}>
                  · {batchStatus.zones?.length || 0} maeneo · Mbagala → Mbezi → Bunju
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, backgroundColor: '#7c3aed', color: '#fff', marginBottom: 4 }}>
                {batchStatus.batch.status?.toUpperCase().replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Angalia Manifest →</div>
            </div>
          </div>
        )}

        {/* Waiting for someone at KenteXa */}
        {!loading && overview && (
          <section data-testid="needs-action" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>Inahitaji hatua</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {actionCards.map((c) => {
                const hot = Number(c.value) > 0;
                return (
                  <button key={c.key} type="button" data-testid={`action-${c.key}`} onClick={() => onNavigate(c.page)}
                    style={{ textAlign: 'left', background: hot ? '#fff7ed' : '#fff', border: `1px solid ${hot ? '#fdba74' : '#e2e8f0'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: hot ? '#9a3412' : '#0f172a' }}>{n(c.value)}</div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{c.title}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Stats Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Inapakia...</div>
        ) : !overview ? (
          <div role="alert" style={{ padding: 16, borderRadius: 12, background: '#fef2f2', color: '#991b1b', marginBottom: 24 }}>Muhtasari haukupatikana. Bonyeza "Onyesha upya".</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {statCards.map((stat) => (
              <div key={stat.title} onClick={() => onNavigate(stat.page)}
                style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: `4px solid ${stat.color}`, cursor: 'pointer', transition: 'transform 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.title}</div>
                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#0f172a' }}>{stat.value}</div>
                {stat.sub && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{stat.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Platform Activity (last 7 days) — Kentexa Internal AI Intelligence,
            Layer 2. Real server-side counts, no AI reasoning. */}
        {platform && (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 16px' }}>
              Shughuli za siku 7
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Watumiaji wapya',        value: platform.newUsers,        icon: '' },
                { label: 'Biashara mpya',   value: platform.newBusinesses,   icon: '' },
                { label: 'Wauzaji wapya',      value: platform.newSellers,      icon: '' },
                { label: 'Mawakala wapya',       value: platform.newAgents,       icon: '' },
                { label: 'Wasafirishaji wapya', value: platform.newTransporters, icon: '' },
                { label: 'Matangazo mapya',     value: platform.newListings,     icon: '' },
                { label: 'Oda',           value: platform.orders,          icon: '' },
                { label: 'Malipo',         value: platform.payments,        icon: '' },
                { label: 'Mizigo',        value: platform.shipments,       icon: '' },
              ].map(item => (
                <div key={item.label} style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight:'800', color: '#0f172a' }}>{item.value}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network Intelligence — the piece that actually needed the
            ActivityEvent bus (Phases 1-4): fast-growing businesses is a
            GROUP BY businessId query over real activity, not just a
            simple entity count. */}
        {network && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 14px' }}>Biashara zinazokua haraka</h2>
              {network.fastGrowingBusinesses.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>Hakuna shughuli kipindi hiki.</p>
              ) : network.fastGrowingBusinesses.map(b => (
                <div key={b.businessId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{b.displayName || `Profile #${b.businessId}`}</span>
                  <span style={{ color: '#6366f1', fontWeight: 700 }}>{b.activityCount} shughuli</span>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 14px' }}>Makundi yanayopendwa</h2>
              {network.popularCategories.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>Hakuna matangazo kipindi hiki.</p>
              ) : network.popularCategories.map(c => (
                <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600, textTransform: 'capitalize' }}>{c.category}</span>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 14px' }}>Maeneo yanayopendwa</h2>
              {network.popularLocations.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>Hakuna matangazo kipindi hiki.</p>
              ) : network.popularLocations.map(l => (
                <div key={l.location} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{l.location}</span>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>{l.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Recent Orders */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Oda za karibuni</h2>
              <button onClick={() => onNavigate('Orders')}
                style={{ backgroundColor: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                Ona zote →
              </button>
            </div>
            {recentOrders.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Bado hakuna oda</p>
            ) : (
              recentOrders.map(order => (
                <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Oda #{order.id}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{order.buyerName || order.buyer?.name || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#6366f1' }}>
                      TZS {Number(order.totalAmount).toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', ...orderStatusColor(order.status) }}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>Njia za haraka</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Bidhaa',      page: 'Products',          color: '#ede9fe', text: '#6366f1' },
                { label: 'Matangazo',       page: 'Classifieds',       color: '#dcfce7', text: '#16a34a' },
                { label: 'Watumiaji',      page: 'Users',             color: '#dbeafe', text: '#2563eb' },
                { label: 'Oda',       page: 'Orders',            color: '#fef9c3', text: '#ca8a04' },
                { label: 'Malipo',          page: 'Payments',          color: '#fee2e2', text: '#dc2626' },
                { label: 'Matangazo',         page: 'Announcements',     color: '#ede9fe', text: '#6366f1' },
                { label: 'Ujumbe',            page: 'ContactMessages',   color: '#fef9c3', text: '#ca8a04' },
                { label: 'Fedha',             page: 'FinancialDashboard', color: '#dcfce7', text: '#16a34a' },
                { label: 'Njia',              page: 'RouteManagement',   color: '#dbeafe', text: '#1d4ed8' },
                { label: 'Wasafirishaji',     page: 'TransportAdmin',    color: '#fef3c7', text: '#d97706' },
                { label: 'Vituo / Hubs',      page: 'HubAdmin',          color: '#f0fdf4', text: '#16a34a' },
                { label: 'Ramani ya Njia',   page: 'RouteCoverageMap',  color: '#f0f9ff', text: '#0284c7' },
                { label: 'Maeneo ya Kupokelea', page: 'PickupPoints', color: '#f0fdf4', text: '#16a34a' },
                { label: 'Flash Sales',          page: 'FlashSales',   color: '#fff5f5', text: '#dc2626' },
                { label: 'Malipo Wauzaji',    page: 'Payouts',           color: '#dcfce7', text: '#16a34a' },
                { label: 'My Profile',        page: 'Profile',           color: '#f1f5f9', text: '#64748b' },
                { label: 'Analytics',         page: 'Analytics',         color: '#e0f2fe', text: '#0284c7' },
                { label: 'Maeneo ya Van',     page: 'ZoneManagement',    color: '#ede9fe', text: '#7c3aed' },
                { label: 'Bei za Boda',        page: 'BodaRates',         color: '#fef9c3', text: '#92400e' },
                { label: 'Manifest ya Leo',   page: 'DispatcherManifest', color: '#dbeafe', text: '#1d4ed8' },
              ].map(action => (
                <button key={action.page} onClick={() => onNavigate(action.page)}
                  style={{ backgroundColor: action.color, color: action.text, border: 'none', padding: '14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', textAlign: 'left' }}>
                  {action.label}
                </button>
              ))}
            </div>

            {/* System Status */}
            <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                System Status
              </h4>
              {[
                { label: 'Backend API',        status: 'Online',    color: '#16a34a' },
                { label: 'Database',           status: 'Connected', color: '#16a34a' },
                { label: 'Malipo',           status: 'Sandbox',   color: '#ca8a04' },
                { label: 'Dar Batch Delivery', status: batchStatus?.batch ? `${batchStatus.totalParcels} vifurushi leo` : 'Hakuna batch', color: batchStatus?.batch ? '#7c3aed' : '#94a3b8' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: item.color }}>● {item.status}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;