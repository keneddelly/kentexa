import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import api from '../../api/api';

const SellerShipping = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const [showShipForm, setShowShipForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [shipForm, setShipForm] = useState({ trackingNumber: '', courierName: '', shipmentProofUrl: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchOrders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/shipping/seller/orders');
      setOrders(res.data);
    } catch (err) {
      setError(t('seller_shipping.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPreparing = async (orderId) => {
    try {
      await api.patch(`/shipping/orders/${orderId}/preparing`);
      setMessage(t('seller_shipping.marked_preparing_msg'));
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_shipping.update_failed'));
    }
  };

  const handleShip = async () => {
    if (!shipForm.trackingNumber || !shipForm.courierName) {
      setError(t('seller_shipping.tracking_courier_required'));
      return;
    }
    try {
      setSubmitting(true);
      await api.post(`/shipping/orders/${selectedOrder.id}/ship`, shipForm);
      setMessage(t('seller_shipping.shipment_uploaded_msg'));
      setShowShipForm(false);
      setShipForm({ trackingNumber: '', courierName: '', shipmentProofUrl: '' });
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_shipping.upload_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'pending_payment': return { bg: '#f1f5f9', color: '#64748b' };
      case 'paid':            return { bg: '#dbeafe', color: '#2563eb' };
      case 'preparing':       return { bg: '#fef9c3', color: '#ca8a04' };
      case 'ready_for_pickup':return { bg: '#ede9fe', color: '#7c3aed' };
      case 'in_transit':      return { bg: '#ffedd5', color: '#ea580c' };
      case 'delivered':       return { bg: '#dcfce7', color: '#16a34a' };
      case 'completed':       return { bg: '#dcfce7', color: '#16a34a' };
      case 'disputed':        return { bg: '#fee2e2', color: '#dc2626' };
      case 'cancelled':       return { bg: '#fee2e2', color: '#dc2626' };
      default:                return { bg: '#f1f5f9', color: '#64748b' };
    }
  };

  const escrowColor = (status) => {
    switch (status) {
      case 'holding':  return { bg: '#fef9c3', color: '#ca8a04', label: t('seller_shipping.escrow_holding') };
      case 'released': return { bg: '#dcfce7', color: '#16a34a', label: t('seller_shipping.escrow_released') };
      case 'refunded': return { bg: '#fee2e2', color: '#dc2626', label: t('seller_shipping.escrow_refunded') };
      case 'disputed': return { bg: '#fee2e2', color: '#dc2626', label: t('seller_shipping.escrow_disputed') };
      default:         return { bg: '#f1f5f9', color: '#64748b', label: t('seller_shipping.escrow_awaiting') };
    }
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const totalEscrow = orders
    .filter(o => o.escrowStatus === 'holding')
    .reduce((sum, o) => sum + Number(o.sellerAmount), 0);

  const totalReleased = orders
    .filter(o => o.escrowStatus === 'released')
    .reduce((sum, o) => sum + Number(o.sellerAmount), 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="SellerShipping" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '40px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <button
            onClick={() => onNavigate('SellerDashboard')}
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginBottom: '12px' }}
          >
            {t('seller_shipping.back_dashboard')}
          </button>
          <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#fff', margin: '0 0 4px' }}>
            {t('seller_shipping.page_title')}
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            {t('seller_shipping.page_desc')}
          </p>
        </div>
      </div>

      {/* Escrow Stats */}
      <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '20px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[
            { label: t('seller_shipping.stat_in_escrow'), value: `TZS ${totalEscrow.toLocaleString()}`, icon: '🔒', color: '#f59e0b' },
            { label: t('seller_shipping.stat_released'), value: `TZS ${totalReleased.toLocaleString()}`, icon: '✅', color: '#10b981' },
            { label: t('seller_shipping.stat_total_orders'), value: orders.length, icon: '📦', color: '#6366f1' },
          ].map(stat => (
            <div key={stat.label} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', border: `1px solid ${stat.color}30` }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{stat.icon}</div>
              <div style={{ fontSize: '18px', fontWeight: '900', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Escrow Explanation */}
      <div style={{ backgroundColor: '#fef9c3', borderLeft: '4px solid #f59e0b', padding: '14px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', fontSize: '13px', color: '#92400e' }}>
          🔒 <strong>{t('seller_shipping.escrow_explanation_title')}</strong> {t('seller_shipping.escrow_explanation_desc')}
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && (
          <div style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#fff', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
            ✅ {message}
            <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px' }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {['all', 'paid', 'preparing', 'in_transit', 'delivered', 'completed', 'disputed'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600',
              backgroundColor: filter === s ? '#0f172a' : '#fff',
              color: filter === s ? '#fff' : '#64748b',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              {s === 'all' ? t('seller_shipping.filter_all') : s.replace(/_/g, ' ').charAt(0).toUpperCase() + s.replace(/_/g, ' ').slice(1)}
            </button>
          ))}
        </div>

        {/* Orders */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>{t('seller_shipping.loading_orders')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', backgroundColor: '#fff', borderRadius: '16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
            <p style={{ color: '#64748b' }}>{t('seller_shipping.no_orders_found')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filtered.map(order => {
              const sc = statusColor(order.status);
              const ec = escrowColor(order.escrowStatus);
              return (
                <div key={order.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>

                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', margin: '0 0 4px' }}>
                        {t('seller_shipping.order_hash', { id: order.id })}
                      </h3>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                        {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', backgroundColor: sc.bg, color: sc.color }}>
                        {order.status?.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', backgroundColor: ec.bg, color: ec.color }}>
                        {ec.label}
                      </span>
                    </div>
                  </div>

                  {/* Product & Customer */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', marginBottom: '6px' }}>{t('seller_shipping.product_label')}</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{order.product?.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{t('seller_shipping.qty_label', { qty: order.quantity })}</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#7c3aed', marginTop: '4px' }}>
                        TZS {Number(order.totalAmount).toLocaleString()} {t('seller_shipping.buyer_paid_suffix')}
                      </div>
                    </div>
                    <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', marginBottom: '6px' }}>{t('seller_shipping.buyer_label')}</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{order.buyer?.email}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>📞 {order.phone || '—'}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>📍 {order.deliveryAddress || '—'}</div>
                    </div>
                  </div>

                  {/* Financial breakdown */}
                  <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '13px' }}>
                      {[
                        { label: t('seller_shipping.fin_buyer_paid'), value: `TZS ${Number(order.totalAmount).toLocaleString()}`, color: '#fff' },
                        { label: t('seller_shipping.fin_platform_fee'), value: `TZS ${Number(order.platformFeeAmount || 0).toLocaleString()}`, color: '#f59e0b' },
                        { label: t('seller_shipping.fin_agent_commission'), value: `TZS ${Number(order.agentCommissionAmount || 0).toLocaleString()}`, color: '#a78bfa' },
                        { label: t('seller_shipping.fin_your_earnings'), value: `TZS ${Number(order.sellerAmount || 0).toLocaleString()}`, color: '#4ade80' },
                      ].map(item => (
                        <div key={item.label}>
                          <div style={{ color: '#64748b', marginBottom: '2px' }}>{item.label}</div>
                          <div style={{ fontWeight: '800', color: item.color }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shipping info (if direct and in transit) */}
                  {order.trackingNumber && (
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '12px', marginBottom: '14px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: '700', marginBottom: '6px' }}>{t('seller_shipping.shipment_info_title')}</div>
                      <div style={{ fontSize: '13px', color: '#1e293b' }}>
                        <strong>{t('seller_shipping.courier_label')}</strong> {order.courierName} &nbsp;|&nbsp;
                        <strong>{t('seller_shipping.tracking_label')}</strong> {order.trackingNumber}
                        {order.shippedAt && <>&nbsp;|&nbsp; <strong>{t('seller_shipping.shipped_label')}</strong> {new Date(order.shippedAt).toLocaleDateString()}</>}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Paid — can mark preparing */}
                    {order.status === 'paid' && (
                      <button
                        onClick={() => handleMarkPreparing(order.id)}
                        style={{ background: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', color: '#1e293b', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}
                      >
                        {t('seller_shipping.mark_preparing_button')}
                      </button>
                    )}

                    {/* Direct shipping — can upload tracking */}
                    {order.shippingMethod === 'direct' && ['paid', 'preparing'].includes(order.status) && (
                      <button
                        onClick={() => { setSelectedOrder(order); setShowShipForm(true); }}
                        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}
                      >
                        {t('seller_shipping.upload_shipment_button')}
                      </button>
                    )}

                    {/* Agent shipping — show status */}
                    {order.shippingMethod === 'agent' && order.status === 'preparing' && (
                      <div style={{ backgroundColor: '#ede9fe', color: '#7c3aed', padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '600' }}>
                        {t('seller_shipping.waiting_agent_pickup')}
                      </div>
                    )}

                    <button
                      onClick={() => onNavigate(`OrderTracking-${order.id}`)}
                      style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '10px 16px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      {t('seller_shipping.track_button')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ship Modal */}
      {showShipForm && selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', margin: '0 0 8px' }}>
              {t('seller_shipping.modal_title')}
            </h2>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>
              {t('seller_shipping.modal_order_desc', { id: selectedOrder.id, product: selectedOrder.product?.name })}
            </p>

            {[
              { label: t('seller_shipping.field_courier_label'), key: 'courierName', placeholder: t('seller_shipping.field_courier_placeholder') },
              { label: t('seller_shipping.field_tracking_label'), key: 'trackingNumber', placeholder: t('seller_shipping.field_tracking_placeholder') },
              { label: t('seller_shipping.field_proof_label'), key: 'shipmentProofUrl', placeholder: t('seller_shipping.field_proof_placeholder') },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>{field.label}</label>
                <input
                  placeholder={field.placeholder}
                  value={shipForm[field.key]}
                  onChange={e => setShipForm({ ...shipForm, [field.key]: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.target.style.border = '2px solid #7c3aed'}
                  onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
                />
              </div>
            ))}

            <div style={{ backgroundColor: '#fef9c3', borderRadius: '10px', padding: '12px', marginBottom: '20px', fontSize: '13px', color: '#92400e' }}>
              {t('seller_shipping.confirm_note')}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowShipForm(false); setShipForm({ trackingNumber: '', courierName: '', shipmentProofUrl: '' }); }}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
              >
                {t('seller_shipping.cancel_button')}
              </button>
              <button
                onClick={handleShip}
                disabled={submitting}
                style={{ flex: 1, background: submitting ? '#a5b4fc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '800', fontSize: '14px' }}
              >
                {submitting ? t('seller_shipping.submitting') : t('seller_shipping.confirm_shipment_button')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SellerShipping;