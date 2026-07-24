import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const Dashboard = ({ activePage, onNavigate, onLogout }) => {
  const [stats, setStats] = useState({
    products: 0, orders: 0, payments: 0,
    classifieds: 0, users: 0, revenue: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [batchStatus, setBatchStatus]   = useState(null);

  useEffect(() => { fetchStats(); fetchBatchStatus(); }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [productsRes, ordersRes, classifiedsRes, usersRes] = await Promise.all([
        api.get('/products'),
        api.get('/orders'),
        api.get('/classifieds'),
        api.get('/users'),
      ]);
      const orders  = ordersRes.data;
      const revenue = orders.filter(o => o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + Number(o.totalAmount), 0);
      setStats({
        products:   productsRes.data.length,
        orders:     orders.length,
        classifieds:classifiedsRes.data.length,
        users:      usersRes.data.length,
        revenue,
      });
      setRecentOrders(orders.slice(0, 5));
    } catch (err) {
      console.error('Failed to load stats', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchStatus = async () => {
    try {
      const res = await api.get('/daily-batches/manifest/today');
      setBatchStatus(res.data);
    } catch { setBatchStatus(null); }
  };

  const statCards = [
    { title: 'Total Products', value: stats.products,              icon: '📦', color: '#6366f1', page: 'Products' },
    { title: 'Total Orders',   value: stats.orders,                icon: '🛒', color: '#f59e0b', page: 'Orders' },
    { title: 'Total Users',    value: stats.users,                 icon: '👥', color: '#10b981', page: 'Users' },
    { title: 'Classifieds',    value: stats.classifieds,           icon: '📋', color: '#ef4444', page: 'Classifieds' },
    { title: 'Revenue (TZS)',  value: stats.revenue.toLocaleString(), icon: '💰', color: '#0ea5e9', page: 'Payments' },
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
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0 }}>⚡ Kentexa Dashboard</h1>
            <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
              Marketplace Control Panel — {new Date().toDateString()}
            </p>
          </div>
          <button onClick={fetchStats}
            style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            🔄 Refresh
          </button>
        </div>

        {/* Batch Delivery Banner */}
        {batchStatus?.batch && (
          <div onClick={() => onNavigate('DispatcherManifest')}
            style={{ backgroundColor: '#1e1b4b', borderRadius: 14, padding: '16px 20px', marginBottom: 24, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#a5b4fc', marginBottom: 4 }}>🚐 Dar es Salaam Batch Delivery — Leo</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>
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

        {/* Stats Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading stats...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {statCards.map((stat) => (
              <div key={stat.title} onClick={() => onNavigate(stat.page)}
                style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderTop: `4px solid ${stat.color}`, cursor: 'pointer', transition: 'transform 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{stat.icon}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.title}</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Recent Orders */}
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: 0 }}>🛒 Recent Orders</h2>
              <button onClick={() => onNavigate('Orders')}
                style={{ backgroundColor: 'transparent', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                View All →
              </button>
            </div>
            {recentOrders.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No orders yet</p>
            ) : (
              recentOrders.map(order => (
                <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Order #{order.id}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{order.buyer?.email || '—'}</div>
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
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '16px', marginTop: 0 }}>⚡ Quick Actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: '📦 Add Product',      page: 'Products',          color: '#ede9fe', text: '#6366f1' },
                { label: '📋 Add Listing',       page: 'Classifieds',       color: '#dcfce7', text: '#16a34a' },
                { label: '👥 Manage Users',      page: 'Users',             color: '#dbeafe', text: '#2563eb' },
                { label: '🛒 View Orders',       page: 'Orders',            color: '#fef9c3', text: '#ca8a04' },
                { label: '💳 Payments',          page: 'Payments',          color: '#fee2e2', text: '#dc2626' },
                { label: '📢 Matangazo',         page: 'Announcements',     color: '#ede9fe', text: '#6366f1' },
                { label: '📬 Ujumbe',            page: 'ContactMessages',   color: '#fef9c3', text: '#ca8a04' },
                { label: '💰 Fedha',             page: 'FinancialDashboard', color: '#dcfce7', text: '#16a34a' },
                { label: '🗺️ Njia',              page: 'RouteManagement',   color: '#dbeafe', text: '#1d4ed8' },
                { label: '🚌 Wasafirishaji',     page: 'TransportAdmin',    color: '#fef3c7', text: '#d97706' },
                { label: '🏢 Vituo / Hubs',      page: 'HubAdmin',          color: '#f0fdf4', text: '#16a34a' },
                { label: '🗺️ Ramani ya Njia',   page: 'RouteCoverageMap',  color: '#f0f9ff', text: '#0284c7' },
                { label: '📍 Maeneo ya Kupokelea', page: 'PickupPoints', color: '#f0fdf4', text: '#16a34a' },
                { label: '🔥 Flash Sales',          page: 'FlashSales',   color: '#fff5f5', text: '#dc2626' },
                { label: '💸 Malipo Wauzaji',    page: 'Payouts',           color: '#dcfce7', text: '#16a34a' },
                { label: '👤 My Profile',        page: 'Profile',           color: '#f1f5f9', text: '#64748b' },
                { label: '📊 Analytics',         page: 'Analytics',         color: '#e0f2fe', text: '#0284c7' },
                { label: '🗺️ Maeneo ya Van',     page: 'ZoneManagement',    color: '#ede9fe', text: '#7c3aed' },
                { label: '🛵 Bei za Boda',        page: 'BodaRates',         color: '#fef9c3', text: '#92400e' },
                { label: '🚐 Manifest ya Leo',   page: 'DispatcherManifest', color: '#dbeafe', text: '#1d4ed8' },
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
                { label: 'Payments',           status: 'Sandbox',   color: '#ca8a04' },
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