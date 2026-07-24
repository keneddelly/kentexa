import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const Reports = ({ activePage, onNavigate, onLogout }) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const [orders, invoices, users, products] = await Promise.all([
        api.get('/orders'),
        api.get('/invoices'),
        api.get('/users'),
        api.get('/products'),
      ]);

      const allOrders   = orders.data   || [];
      const allInvoices = invoices.data || [];
      const allUsers    = users.data    || [];
      const allProducts = products.data || [];

      const paidInvoices  = allInvoices.filter(i => i.status === 'paid');
      const totalRevenue  = paidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
      const platformFees  = allOrders.reduce((s, o) => s + Number(o.platformFeeAmount || 0), 0);
      const totalOrders   = allOrders.length;
      const completedOrders = allOrders.filter(o => o.status === 'completed').length;
      const disputedOrders  = allOrders.filter(o => o.status === 'disputed').length;

      // Orders by status
      const byStatus = {};
      allOrders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });

      // Top selling products
      const productSales = {};
      allOrders.forEach(o => {
        if (o.product?.name) {
          if (!productSales[o.product.name]) productSales[o.product.name] = { count: 0, revenue: 0 };
          productSales[o.product.name].count   += o.quantity || 1;
          productSales[o.product.name].revenue += Number(o.totalAmount || 0);
        }
      });
      const topProducts = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);

      // Users by role
      const byRole = {};
      allUsers.forEach(u => { byRole[u.role] = (byRole[u.role] || 0) + 1; });

      setData({
        totalRevenue, platformFees, totalOrders, completedOrders, disputedOrders,
        totalUsers: allUsers.length, totalProducts: allProducts.length,
        paidInvoicesCount: paidInvoices.length,
        byStatus, topProducts, byRole,
        conversionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0,
      });
    } catch (err) {
      setError('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, color: '#64748b' }}>⏳ Loading reports...</main>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, fontFamily: 'Manrope,sans-serif' }}>📊 Reports & Analytics</h1>
            <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>Platform overview and performance</p>
          </div>
          <button onClick={fetchReports} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>🔄 Refresh</button>
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20 }}>❌ {error}</div>}

        {data && (
          <>
            {/* Key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Revenue',   value: `TZS ${data.totalRevenue.toLocaleString()}`,  icon: '💰', gradient: 'linear-gradient(135deg,#16a34a,#15803d)' },
                { label: 'Platform Fees',   value: `TZS ${data.platformFees.toLocaleString()}`,  icon: '🏦', gradient: 'linear-gradient(135deg,#1d4ed8,#2563eb)' },
                { label: 'Total Orders',    value: data.totalOrders,                              icon: '🛒', gradient: 'linear-gradient(135deg,#7c3aed,#6d28d9)' },
                { label: 'Conversion Rate', value: `${data.conversionRate}%`,                    icon: '📈', gradient: 'linear-gradient(135deg,#ea580c,#dc2626)' },
              ].map(s => (
                <div key={s.label} style={{ background: s.gradient, borderRadius: 14, padding: 20, color: '#fff' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Secondary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Users',     value: data.totalUsers,           bg: '#ede9fe', color: '#7c3aed' },
                { label: 'Total Products',  value: data.totalProducts,        bg: '#dbeafe', color: '#2563eb' },
                { label: 'Completed Orders',value: data.completedOrders,      bg: '#dcfce7', color: '#16a34a' },
                { label: 'Disputed Orders', value: data.disputedOrders,       bg: '#fee2e2', color: '#dc2626' },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Orders by status */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>📦 Orders by Status</h3>
                {Object.entries(data.byStatus).sort((a,b) => b[1]-a[1]).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{status.replace(/_/g,' ')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 80, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3 }}>
                        <div style={{ width: `${(count/data.totalOrders*100)}%`, height: '100%', backgroundColor: '#1d4ed8', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 24 }}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Users by role */}
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>👥 Users by Role</h3>
                {Object.entries(data.byRole).sort((a,b) => b[1]-a[1]).map(([role, count]) => (
                  <div key={role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{role.replace(/_/g,' ')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 80, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3 }}>
                        <div style={{ width: `${(count/data.totalUsers*100)}%`, height: '100%', backgroundColor: '#7c3aed', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 24 }}>{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top products */}
            {data.topProducts.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>🏆 Top Selling Products</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#','Product','Units Sold','Revenue'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', backgroundColor: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map(([name, stats], i) => (
                      <tr key={name} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px', fontSize: 14, fontWeight: 900, color: i === 0 ? '#f59e0b' : '#64748b' }}>{i + 1}</td>
                        <td style={{ padding: '12px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{name}</td>
                        <td style={{ padding: '12px', fontSize: 14, color: '#64748b' }}>{stats.count} units</td>
                        <td style={{ padding: '12px', fontSize: 14, fontWeight: 900, color: '#16a34a' }}>TZS {stats.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Reports;