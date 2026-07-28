import React, { useEffect, useState } from 'react';

import api from '../../api/api';

const API_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const MyOrders = ({ onNavigate, isLoggedIn, onLogout, userRole, highlightOrderId }) => {
  const [orders, setOrders] = useState([]);
  const highlightRef = React.useRef(null);
  const [classifiedInvoices, setClassifiedInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('orders');
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState('');

  // ── Pay Now modal state ────────────────────────────────────────────────
  const [payModalOrder, setPayModalOrder]     = useState(null); // order being paid
  const [payMode, setPayMode]                 = useState(null); // null | 'online' | 'agent'
  const [payerPhone, setPayerPhone]           = useState('');
  const [paying, setPaying]                   = useState(false);
  const [paymentPending, setPaymentPending]   = useState(false);
  const [nearbyAgents, setNearbyAgents]       = useState([]);
  const [agentsLoading, setAgentsLoading]     = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [payingInvoice, setPayingInvoice]     = useState(null); // classified invoice id being paid online
  const [onlinePayPhone, setOnlinePayPhone]   = useState('');
  const [payingOnline, setPayingOnline]       = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      onNavigate('PublicLogin');
      return;
    }
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a notification — scroll to and highlight that order.
  useEffect(() => {
    if (!highlightOrderId || !orders.length || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [orders, highlightOrderId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersRes, invoicesRes] = await Promise.all([
        api.get('/orders/my-orders'),
        api.get('/classifieds/invoices/my-requests'),
      ]);
      setOrders(ordersRes.data);
      setClassifiedInvoices(invoicesRes.data);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      setCancellingId(orderId);
      await api.patch(`/orders/${orderId}/cancel`);
      setMessage('Order cancelled successfully');
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancellingId(null);
    }
  };

  // ── Resume payment for an order whose checkout was abandoned ──────────────
  const openPayModal = (order) => {
    setPayModalOrder(order);
    setPayMode(null);
    setPayerPhone('');
    setPaymentPending(false);
    setNearbyAgents([]);
    setCopied(false);
  };

  const closePayModal = () => {
    setPayModalOrder(null);
    setPayMode(null);
  };

  const handlePayOnline = async () => {
    if (!payerPhone.trim()) { setError('Enter your phone number'); return; }
    try {
      setPaying(true);
      setError('');
      const res = await api.post('/payments/invoice/pay', {
        invoiceNumber: payModalOrder.invoiceNumber || undefined,
        orderId:       payModalOrder.id,  // fallback — backend self-heals if invoice missing
        phone:         payerPhone.trim(),
        provider:      'selcom',
      });
      setPaymentPending(true);
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setMessage('Payment confirmed! Your order is being prepared.');
          closePayModal();
          fetchData();
        } catch {
          setError('Payment confirmation failed.');
          setPaymentPending(false);
        }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Payment failed.');
    } finally {
      setPaying(false);
    }
  };

  const handlePayViaAgent = async () => {
    setPayMode('agent');
    try {
      setAgentsLoading(true);
      const parts = (payModalOrder.deliveryAddress || '').split(',').map(s => s.trim());
      const res = await api.get(`/agents/nearby?region=${encodeURIComponent(parts[0] || '')}`);
      setNearbyAgents(res.data);
    } catch { setNearbyAgents([]); }
    finally { setAgentsLoading(false); }
  };

  const handleCopyInvoice = (inv) => {
    navigator.clipboard.writeText(inv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePayClassifiedOnline = async (inv) => {
    if (!onlinePayPhone.trim()) { setError('Enter your phone number'); return; }
    try {
      setPayingOnline(true); setError('');
      const res = await api.post('/payments/invoice/pay', {
        invoiceNumber: inv.invoiceNumber,
        phone:         onlinePayPhone.trim(),
        provider:      'selcom',
      });
      // Mock confirm in dev
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setMessage('✅ Payment confirmed! Seller will be notified to ship your item.');
          setPayingInvoice(null); setOnlinePayPhone('');
          fetchData();
        } catch { setError('Payment confirmation failed. Try again.'); }
      }, 4000);
      setMessage('📱 Check your phone and enter your PIN to confirm payment.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Payment failed. Try again.');
    } finally {
      setPayingOnline(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'pending':    return { backgroundColor: '#fef9c3', color: '#ca8a04' };
      case 'confirmed':  return { backgroundColor: '#dbeafe', color: '#2563eb' };
      case 'processing': return { backgroundColor: '#ede9fe', color: '#7c3aed' };
      case 'shipped':    return { backgroundColor: '#ffedd5', color: '#ea580c' };
      case 'delivered':  return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'cancelled':  return { backgroundColor: '#fee2e2', color: '#dc2626' };
      default:           return { backgroundColor: '#f1f5f9', color: '#64748b' };
    }
  };

  const paymentColor = (status) => {
    switch (status) {
      case 'paid':   return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'failed': return { backgroundColor: '#fee2e2', color: '#dc2626' };
      default:       return { backgroundColor: '#fef9c3', color: '#ca8a04' };
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case 'pending':    return '⏳';
      case 'confirmed':  return '✅';
      case 'processing': return '⚙️';
      case 'shipped':    return '🚚';
      case 'delivered':  return '📦';
      case 'cancelled':  return '❌';
      default:           return '📋';
    }
  };

  const invoiceStatusStyle = (status) => {
    switch (status) {
      case 'pending':   return { backgroundColor: '#fef9c3', color: '#ca8a04' };
      case 'sent':      return { backgroundColor: '#dbeafe', color: '#2563eb' };
      case 'paid':      return { backgroundColor: '#dcfce7', color: '#16a34a' };
      case 'cancelled': return { backgroundColor: '#fee2e2', color: '#dc2626' };
      default:          return { backgroundColor: '#f1f5f9', color: '#64748b' };
    }
  };

  const invoiceStatusLabel = (status) => {
    switch (status) {
      case 'pending':   return '⏳ Waiting for seller';
      case 'sent':      return '📄 Invoice Ready — Pay Now';
      case 'paid':      return '✅ Paid';
      case 'cancelled': return '❌ Cancelled';
      default:          return status;
    }
  };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  const pendingInvoicesCount = classifiedInvoices.filter(i => i.status === 'sent').length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => onNavigate('Home')} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:8, padding:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>My Orders</span>
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '80px', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          Loading your orders...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('Home')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>📦 My Orders</span>
        </button>
      </div>

      <div style={{ padding: '16px 16px 100px', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Messages */}
        {message && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
            ✅ {message}
            <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Orders',   value: orders.length,                                          color: '#6366f1', icon: '🛒' },
            { label: 'Pending',        value: orders.filter(o => o.status === 'pending').length,       color: '#f59e0b', icon: '⏳' },
            { label: 'Delivered',      value: orders.filter(o => o.status === 'delivered').length,     color: '#10b981', icon: '📦' },
            { label: 'Invoices',       value: classifiedInvoices.length,                               color: '#7c3aed', icon: '🧾' },
          ].map(stat => (
            <div key={stat.label} style={{
              backgroundColor: '#fff', borderRadius: '10px', padding: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${stat.color}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{stat.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {[
            { key: 'orders',   label: '🛒 Store Orders' },
            { key: 'invoices', label: '🧾 Classified Invoices' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                backgroundColor: activeTab === tab.key ? '#6366f1' : '#fff',
                color: activeTab === tab.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              {tab.label}
              {tab.key === 'invoices' && pendingInvoicesCount > 0 && (
                <span style={{
                  backgroundColor: '#ef4444', color: '#fff',
                  borderRadius: '50%', width: '20px', height: '20px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '800',
                }}>
                  {pendingInvoicesCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── STORE ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', border: 'none',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                    backgroundColor: filter === status ? '#6366f1' : '#fff',
                    color: filter === status ? '#fff' : '#64748b',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '56px', marginBottom: '16px' }}>🛒</div>
                <h3 style={{ color: '#0f172a', marginBottom: '8px' }}>No orders found</h3>
                <p style={{ color: '#64748b', marginBottom: '24px' }}>Start shopping on Kentexa Store</p>
                <button
                  onClick={() => onNavigate('Store')}
                  style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                >
                  🏪 Browse Store
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredOrders.map(order => {
                  const isHighlighted = Number(highlightOrderId) === order.id;
                  return (
                  <div key={order.id} ref={isHighlighted ? highlightRef : null} style={{
                    backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
                    boxShadow: isHighlighted ? '0 0 0 3px #6366f1, 0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.06)',
                    border: isHighlighted ? '1px solid #6366f1' : '1px solid #f1f5f9',
                  }}>
                    {/* Order Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px' }}>
                          Order #{order.id}
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                          {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', ...paymentColor(order.paymentStatus) }}>
                          💳 {order.paymentStatus}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', ...statusColor(order.status) }}>
                          {statusIcon(order.status)} {order.status}
                        </span>
                      </div>
                    </div>

                    {/* Order Progress */}
                    {order.status !== 'cancelled' && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          {['pending', 'confirmed', 'processing', 'shipped', 'delivered'].map((step, index) => {
                            const steps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
                            const currentIndex = steps.indexOf(order.status);
                            const isCompleted = index <= currentIndex;
                            return (
                              <div key={step} style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{
                                  width: '28px', height: '28px', borderRadius: '50%',
                                  backgroundColor: isCompleted ? '#6366f1' : '#e2e8f0',
                                  color: isCompleted ? '#fff' : '#94a3b8',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  margin: '0 auto 4px', fontSize: '12px', fontWeight: 'bold',
                                }}>
                                  {isCompleted ? '✓' : index + 1}
                                </div>
                                <div style={{ fontSize: '10px', color: isCompleted ? '#6366f1' : '#94a3b8', fontWeight: isCompleted ? '600' : '400' }}>
                                  {step}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Product Info */}
                    <div style={{ display: 'flex', gap: '16px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', marginBottom: '16px', alignItems: 'center' }}>
                      <div style={{ width: '70px', height: '70px', borderRadius: '8px', backgroundColor: '#e2e8f0', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {order.product?.images?.[0] ? (
                          <img src={order.product.images[0]} alt={order.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span style={{ fontSize: '28px' }}>📦</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px' }}>
                          {order.product?.name || 'Product'}
                        </h4>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 4px' }}>
                          Qty: {order.quantity} × TZS {Number(order.product?.price || 0).toLocaleString()}
                        </p>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          📍 {order.deliveryAddress || '—'}
                        </div>
                        {order.seller && (
                          <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>
                            🏪 Seller: {order.seller?.storeName || order.seller?.businessName || order.seller?.name || '—'}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6366f1' }}>
                          TZS {Number(order.totalAmount).toLocaleString()}
                        </div>
                        {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', fontWeight: '600' }}>
                            Payment pending
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pay Now — unpaid orders that weren't cancelled */}
                    {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
                      <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '13px', color: '#fff' }}>
                          <strong>💳 Payment not completed.</strong> Finish paying to avoid losing this order.
                        </div>
                        <button
                          onClick={() => openPayModal(order)}
                          style={{ backgroundColor: '#fff', color: '#1d4ed8', border: 'none', padding: '9px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '800', whiteSpace: 'nowrap' }}
                        >
                          💳 Pay Now
                        </button>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          disabled={cancellingId === order.id}
                          style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: cancellingId === order.id ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}
                        >
                          {cancellingId === order.id ? 'Cancelling...' : '❌ Cancel'}
                        </button>
                      )}
                      <button
                        onClick={() => onNavigate(`TrackParcel-KTX-ORD-${order.id}`)}
                        style={{ backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                      >
                        📍 Track
                      </button>
                      {/* Confirm Delivery button - shown when delivered */}
                      {['delivered','in_transit'].includes(order.status) && order.trackingNumber && (
                        <button
                          onClick={() => onNavigate(`ConfirmDelivery-${order.confirmationToken || order.trackingNumber}`)}
                          style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '2px solid #86efac',
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 12, fontWeight: 800 }}
                        >
                          ✅ Thibitisha Kupokea
                        </button>
                      )}
                      {/* Rate seller - when completed */}
                      {order.status === 'completed' && !order.buyerRating && (
                        <button
                          onClick={() => onNavigate(`ConfirmDelivery-${order.confirmationToken || order.trackingNumber}`)}
                          style={{ backgroundColor: '#fef9c3', color: '#ca8a04', border: '1px solid #fde68a',
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 12, fontWeight: 800 }}
                        >
                          ⭐ Panga Muuzaji
                        </button>
                      )}
                      {order.status === 'completed' && order.buyerRating && (
                        <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, padding: '6px 0' }}>
                          {'⭐'.repeat(order.buyerRating)}
                        </span>
                      )}
                      <button
                        onClick={() => onNavigate('Store')}
                        style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                      >
                        🏪 Shop More
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CLASSIFIED INVOICES TAB ── */}
        {activeTab === 'invoices' && (
          <div>
            {classifiedInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧾</div>
                <h3 style={{ color: '#0f172a', marginBottom: '8px' }}>No invoice requests</h3>
                <p style={{ color: '#64748b', marginBottom: '24px' }}>
                  Request invoices from classified listings to buy safely via Kentexa
                </p>
                <button
                  onClick={() => onNavigate('ClassifiedsPublic')}
                  style={{ backgroundColor: '#6366f1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
                >
                  📋 Browse Classifieds
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {classifiedInvoices.map(inv => (
                  <div key={inv.id} style={{
                    backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9',
                  }}>
                    {/* Invoice Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
                          {inv.classifiedTitle}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          Seller: <strong>{inv.sellerName}</strong> • Requested {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '20px', whiteSpace: 'nowrap', ...invoiceStatusStyle(inv.status) }}>
                        {invoiceStatusLabel(inv.status)}
                      </span>
                    </div>

                    {/* Buyer message */}
                    {inv.buyerMessage && (
                      <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                        Your message: "{inv.buyerMessage}"
                      </div>
                    )}

                    {/* Waiting state */}
                    {inv.status === 'pending' && (
                      <div style={{ backgroundColor: '#fef9c3', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>⏳</span>
                        <div>
                          <strong>Waiting for seller to create your invoice.</strong>
                          <div style={{ marginTop: '2px' }}>You will see the invoice details here once the seller creates it.</div>
                        </div>
                      </div>
                    )}

                    {/* Invoice details — sent or paid */}
                    {(inv.status === 'sent' || inv.status === 'paid') && inv.invoiceNumber && (
                      <>
                        <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: inv.invoiceDescription || inv.sellerNotes ? '12px' : '0' }}>
                            {[
                              { label: 'Invoice Number', value: inv.invoiceNumber },
                              { label: 'Amount',         value: `TZS ${Number(inv.amount).toLocaleString()}` },
                              { label: 'Due Date',       value: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                              { label: 'Status',         value: inv.status.toUpperCase() },
                            ].map(item => (
                              <div key={item.label} style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>{item.label}</div>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                          {inv.invoiceDescription && (
                            <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #f1f5f9', marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Description</div>
                              <div style={{ fontSize: '14px', color: '#1e293b' }}>{inv.invoiceDescription}</div>
                            </div>
                          )}
                          {inv.sellerNotes && (
                            <div style={{ padding: '10px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                              <div style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Seller Note</div>
                              <div style={{ fontSize: '13px', color: '#92400e', fontStyle: 'italic' }}>{inv.sellerNotes}</div>
                            </div>
                          )}
                        </div>

                        {/* How to pay — only when sent */}
                        {inv.status === 'sent' && (
                          <div style={{ marginBottom: 14 }}>
                            {/* Invoice number card */}
                            <div style={{ backgroundColor: '#1e1b4b', borderRadius: 12, padding: 14, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 3 }}>INVOICE NUMBER</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: 1, wordBreak: 'break-all' }}>{inv.invoiceNumber}</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>TZS {Number(inv.amount).toLocaleString()}</div>
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(inv.invoiceNumber); setMessage('Invoice number copied!'); setTimeout(() => setMessage(''), 2000); }}
                                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                📋 Copy
                              </button>
                            </div>

                            {/* Payment options */}
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>💳 Choose how to pay:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* Pay via Agent */}
                              <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, border: '1.5px solid #bfdbfe' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: 22, flexShrink: 0 }}>🤝</span>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 3 }}>Pay via KenteXa Agent</div>
                                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                                      Visit a nearby KenteXa agent, show them your invoice number <strong>{inv.invoiceNumber}</strong> and pay <strong>TZS {Number(inv.amount).toLocaleString()}</strong> cash.
                                    </div>
                                    <button onClick={() => onNavigate(`PayInvoice-${payModalOrder?.id || ''}`)}
                                      style={{ marginTop: 8, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                      🔍 Find Agent Near Me
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Pay Online */}
                              <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, border: '1.5px solid #86efac' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: 22, flexShrink: 0 }}>💳</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', marginBottom: 3 }}>Pay Online — M-Pesa / Airtel / Tigo</div>
                                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 8 }}>
                                      Pay directly from your phone. Enter your number below.
                                    </div>
                                    {!payingInvoice || payingInvoice !== inv.id ? (
                                      <button onClick={() => setPayingInvoice(inv.id)}
                                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                        💳 Pay Now
                                      </button>
                                    ) : (
                                      <div>
                                        <input type="tel" placeholder="255712345678" value={onlinePayPhone}
                                          onChange={e => setOnlinePayPhone(e.target.value)}
                                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <button onClick={() => setPayingInvoice(null)}
                                            style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 8, borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                                          <button onClick={() => handlePayClassifiedOnline(inv)}
                                            disabled={!onlinePayPhone.trim() || payingOnline}
                                            style={{ flex: 2, backgroundColor: !onlinePayPhone.trim() || payingOnline ? '#e2e8f0' : '#16a34a', color: !onlinePayPhone.trim() || payingOnline ? '#94a3b8' : '#fff', border: 'none', padding: 8, borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                            {payingOnline ? '⏳' : `Pay TZS ${Number(inv.amount).toLocaleString()}`}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Paid confirmation */}
                    {inv.status === 'paid' && (
                      <div>
                        <div style={{ backgroundColor: '#dcfce7', borderRadius: '10px', padding: '14px 16px', fontSize: '13px', color: '#16a34a', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 10 }}>
                          <span style={{ fontSize: '24px' }}>✅</span>
                          <div>
                            <div>Payment confirmed via {inv.paymentMethod || '—'}</div>
                            {inv.paidAt && <div style={{ fontWeight: '400', marginTop: '2px' }}>Paid on {new Date(inv.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
                          </div>
                        </div>
                        {inv.invoiceNumber && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <a href={`${API_URL}/invoices/number/${inv.invoiceNumber}/pdf`} target="_blank" rel="noreferrer"
                              style={{ flex: 1, display: 'block', textAlign: 'center', backgroundColor: '#ede9fe', color: '#7c3aed', textDecoration: 'none', padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                              📄 Download Invoice
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════ PAY NOW MODAL ══════════════════════════ */}
      {payModalOrder && (
        <div onClick={closePayModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 2000 }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 20, padding: '24px 20px', textAlign: 'center', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            {payMode !== 'agent' ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 8 }}>💳</div>
                <h2 style={{ fontSize: 19, fontWeight: 900, color: '#1e293b', marginBottom: 4, fontFamily: 'Manrope,sans-serif' }}>Complete Payment</h2>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 13, color: '#64748b' }}>
                  Order #{payModalOrder.id} · <strong style={{ color: '#2563eb', fontSize: 15 }}>TZS {Number(payModalOrder.totalAmount).toLocaleString()}</strong>
                </div>

                {error && (
                  <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 10, marginBottom: 14, fontSize: 12, textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                    <span>❌ {error}</span>
                    <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
                  </div>
                )}

                {payMode !== 'online' ? (
                  <button onClick={() => setPayMode('online')} style={{ width: '100%', border: '2px solid #16a34a', borderRadius: 14, padding: '18px 16px', backgroundColor: '#f0fdf4', cursor: 'pointer', marginBottom: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>💳</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46', marginBottom: 4 }}>Pay Online</div>
                    <div style={{ fontSize: 12, color: '#047857', marginBottom: 6 }}>Selcom · M-Pesa · Airtel Money</div>
                    <div style={{ display: 'inline-block', backgroundColor: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>⚡ Instant Confirmation</div>
                  </button>
                ) : (
                  <div style={{ border: '2px solid #16a34a', borderRadius: 14, padding: '18px 16px', marginBottom: 12, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46', marginBottom: 10 }}>💳 Enter your phone number</div>
                    {!paymentPending ? (
                      <>
                        <input placeholder="255712345678" value={payerPhone} onChange={e => setPayerPhone(e.target.value)}
                          style={{ width: '100%', padding: 11, borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none', marginBottom: 10 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setPayMode(null)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                          <button onClick={handlePayOnline} disabled={paying || !payerPhone.trim()}
                            style={{ flex: 2, background: paying || !payerPhone.trim() ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)', color: paying || !payerPhone.trim() ? '#94a3b8' : '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: paying || !payerPhone.trim() ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                            {paying ? '⏳' : `💳 Pay TZS ${Number(payModalOrder.totalAmount).toLocaleString()}`}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>Check Your Phone</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Enter your PIN to confirm payment</div>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handlePayViaAgent} style={{ width: '100%', border: '2px solid #2563eb', borderRadius: 14, padding: '18px 16px', backgroundColor: '#eff6ff', cursor: 'pointer', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🤝</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8', marginBottom: 4 }}>Pay via Agent</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Pay cash at a nearby KenteXa agent</div>
                </button>

                <button onClick={closePayModal} style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, width: '100%' }}>
                  Close
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🤝</div>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 4, fontFamily: 'Manrope,sans-serif' }}>Pay via Agent</h2>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>Visit a nearby agent with cash and your invoice number</p>

                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 14, border: '2px dashed #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>INVOICE NUMBER</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#2563eb', fontFamily: 'monospace' }}>{payModalOrder.invoiceNumber || payModalOrder.id}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>TZS {Number(payModalOrder.totalAmount).toLocaleString()}</div>
                  </div>
                  <button onClick={() => handleCopyInvoice(payModalOrder.invoiceNumber || String(payModalOrder.id))}
                    style={{ backgroundColor: copied ? '#dcfce7' : '#2563eb', color: copied ? '#16a34a' : '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {copied ? '✅' : '📋 Copy'}
                  </button>
                </div>

                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', textAlign: 'left' }}>Nearby Agents</h3>
                {agentsLoading ? (
                  <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>⏳ Finding agents near you...</div>
                ) : nearbyAgents.length === 0 ? (
                  <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 14, fontSize: 12, color: '#92400e', textAlign: 'center', marginBottom: 12 }}>
                    ⚠️ No agents found near your area. Contact KenteXa support.
                  </div>
                ) : nearbyAgents.map(agent => (
                  <div key={agent.id} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{agent.fullName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>📍 {[agent.district, agent.region].filter(Boolean).join(', ') || '—'}</div>
                    <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>📞 {agent.phone}</div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setPayMode(null)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>← Back</button>
                  <button onClick={closePayModal} style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrders;