import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const Payments = ({ activePage, onNavigate, onLogout }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payments/admin/all');
      setPayments(res.data);
    } catch (err) {
      setError('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'success': return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'failed': return { backgroundColor: '#fee2e2', color: '#dc2626' };
      default: return { backgroundColor: '#fef9c3', color: '#ca8a04' };
    }
  };

  const providerColor = (provider) => {
    switch (provider) {
      case 'vodacom': return { backgroundColor: '#dbeafe', color: '#2563eb' };
      case 'airtel': return { backgroundColor: '#fee2e2', color: '#dc2626' };
      case 'tigo': return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'halopesa': return { backgroundColor: '#ede9fe', color: '#7c3aed' };
      case 'selcom': return { backgroundColor: '#e0f2fe', color: '#0284c7' };
      case 'mock': return { backgroundColor: '#f1f5f9', color: '#64748b' };
      default: return { backgroundColor: '#f1f5f9', color: '#64748b' };
    }
  };

  const filteredPayments = filter === 'all'
    ? payments
    : payments.filter(p => p.status === filter);

  const totalSuccess = payments
    .filter(p => p.status === 'success')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Build provider summary dynamically from actual data instead of hardcoded list
  const providers = [...new Set(payments.map(p => p.provider).filter(Boolean))];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: '250px', flex: 1, padding: '32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
              Payments
            </h1>
            <p style={{ color: '#64748b', marginTop: '4px', fontSize: '14px' }}>
              {payments.length} total transactions
            </p>
          </div>
          <button
            onClick={fetchPayments}
            style={{
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            ❌ {error}
          </div>
        )}

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total', value: payments.length, color: '#6366f1', icon: '💳' },
            { label: 'Success', value: payments.filter(p => p.status === 'success').length, color: '#10b981', icon: '✅' },
            { label: 'Pending', value: payments.filter(p => p.status === 'pending').length, color: '#f59e0b', icon: '⏳' },
            { label: 'Failed', value: payments.filter(p => p.status === 'failed').length, color: '#ef4444', icon: '❌' },
            { label: 'Revenue (TZS)', value: totalSuccess.toLocaleString(), color: '#0ea5e9', icon: '💰' },
          ].map(stat => (
            <div key={stat.label} style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${stat.color}`,
            }}>
              <div style={{ fontSize: '20px', marginBottom: '8px' }}>{stat.icon}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginTop: '4px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Provider Summary — built from actual data, not a hardcoded list */}
        {providers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(providers.length, 4)}, 1fr)`, gap: '12px', marginBottom: '24px' }}>
            {providers.map(provider => (
              <div key={provider} style={{
                backgroundColor: '#fff',
                borderRadius: '10px',
                padding: '14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px', ...providerColor(provider), padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                  {provider.toUpperCase()}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '8px' }}>
                  {payments.filter(p => p.provider === provider).length}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {['all', 'pending', 'success', 'failed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: filter === status ? '#6366f1' : '#f1f5f9',
                color: filter === status ? '#ffffff' : '#64748b',
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading && <p style={{ color: '#64748b' }}>Loading payments...</p>}

        {!loading && (
          <table style={{
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            borderCollapse: 'collapse',
          }}>
            <thead>
              <tr>
                {['#', 'Order ID', 'Phone / User', 'Amount (TZS)', 'Provider', 'Status', 'Reference', 'Date'].map(h => (
                  <th key={h} style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    backgroundColor: '#f1f5f9',
                    color: '#64748b',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    No payments found
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment, index) => (
                  <tr key={payment.id}>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '13px' }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', fontSize: '14px', color: '#6366f1', fontWeight: '600' }}>
                      #{payment.order?.id || '—'}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', fontSize: '14px', color: '#64748b' }}>
                      <div>{payment.phone}</div>
                      {payment.user?.name && <div style={{ fontSize: 11, color: '#94a3b8' }}>{payment.user.name}</div>}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                      {Number(payment.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        ...providerColor(payment.provider),
                      }}>
                        {payment.provider}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        ...statusColor(payment.status),
                      }}>
                        {payment.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', fontSize: '13px', color: '#64748b' }}>
                      {payment.providerReference || '—'}
                    </td>
                    <td style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', fontSize: '13px', color: '#64748b' }}>
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

      </main>
    </div>
  );
};

export default Payments;