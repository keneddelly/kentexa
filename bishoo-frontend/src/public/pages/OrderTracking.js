import React, { useEffect, useState } from 'react';

import api from '../../api/api';
import { buildBuyerInquiryMessage } from '../utils/whatsapp-link';

const OrderTracking = ({ onNavigate, isLoggedIn, onLogout, userRole, orderId }) => {
  const [order, setOrder]     = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg]         = useState('');
  const [showDispute, setShowDispute]     = useState(false);
  const [showRating, setShowRating]       = useState(false);
  const [sellerRating, setSellerRating]   = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { onNavigate('PublicLogin'); return; }
    if (orderId) fetchOrderData();
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrderData = async () => {
    try {
      setLoading(true);
      const [orderRes, invoiceRes] = await Promise.all([
        api.get(`/orders/${orderId}/detail`),
        api.get(`/invoices/order/${orderId}`).catch(() => ({ data: null })),
      ]);
      setOrder(orderRes.data);
      setInvoice(invoiceRes.data);
    } catch (err) {
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/orders/${orderId}/confirm`);
      setActionMsg('✅ Order confirmed! Payment will be released to seller within 24 hours.');
      setShowRating(true); // prompt rating after confirmation
      fetchOrderData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to confirm');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (sellerRating === 0) return;
    try {
      await api.post(`/orders/${orderId}/rate-seller`, {
        rating:  sellerRating,
        comment: ratingComment.trim() || null,
      });
      setRatingSubmitted(true);
      setShowRating(false);
    } catch {}
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) { setError('Please explain the issue'); return; }
    try {
      setActionLoading(true);
      await api.patch(`/orders/${orderId}/dispute`, { reason: disputeReason });
      setActionMsg('⚠️ Dispute raised. Seller will be notified to respond within 24 hours.');
      setShowDispute(false);
      fetchOrderData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to raise dispute');
    } finally {
      setActionLoading(false);
    }
  };

  // ✅ Aligned with real backend OrderStatus enum
  const steps = [
    { status: 'pending_payment',  label: 'Order Placed',     icon: '🛒', desc: 'Your order has been placed' },
    { status: 'paid',              label: 'Payment Confirmed', icon: '💳', desc: 'Payment received successfully' },
    { status: 'preparing',         label: 'Preparing',        icon: '⚙️', desc: 'Seller is preparing your item' },
    { status: 'in_transit',        label: 'In Transit',       icon: '🚚', desc: 'On its way to you' },
    { status: 'ready_for_pickup',  label: 'Ready for Pickup', icon: '🏪', desc: 'Ready for collection at agent' },
    { status: 'delivered',         label: 'Delivered',        icon: '📦', desc: 'Item delivered — awaiting confirmation' },
    { status: 'completed',         label: 'Completed',        icon: '🎉', desc: 'Order completed — payment released' },
  ];

  const cancelledSteps = [
    { status: 'pending_payment', label: 'Order Placed', icon: '🛒', desc: 'Order was placed' },
    { status: 'cancelled',       label: 'Cancelled',    icon: '❌', desc: 'Order was cancelled' },
  ];

  const disputedSteps = [
    ...steps.slice(0, 5),
    { status: 'disputed', label: 'Disputed', icon: '⚠️', desc: 'Buyer raised a dispute' },
  ];

  const getSteps = () => {
    if (!order) return steps;
    if (order.status === 'cancelled') return cancelledSteps;
    if (order.status === 'disputed')  return disputedSteps;
    return steps;
  };

  const getCurrentIndex = (stepsArr) => {
    if (!order) return -1;
    return stepsArr.findIndex(s => s.status === order.status);
  };

  const statusColor = (status) => ({
    pending_payment:  '#f59e0b',
    paid:             '#3b82f6',
    preparing:        '#8b5cf6',
    in_transit:       '#f97316',
    ready_for_pickup: '#06b6d4',
    delivered:        '#10b981',
    completed:        '#16a34a',
    disputed:         '#ef4444',
    cancelled:        '#dc2626',
  }[status] || '#64748b');

  const paymentBadge = (status) => ({
    paid:   { bg: '#dcfce7', color: '#16a34a', label: '✅ Paid' },
    failed: { bg: '#fee2e2', color: '#dc2626', label: '❌ Failed' },
  }[status] || { bg: '#fef9c3', color: '#ca8a04', label: '⏳ Pending' });

  // ✅ Buyer can confirm/dispute once parcel is on the move, at pickup, or delivered
  const canConfirmOrDispute = order && [
    'delivered', 'ready_for_pickup', 'in_transit'
  ].includes(order.status);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:8, padding:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>📍 Tracking</span>
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:8, padding:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <p style={{ color: '#64748b' }}>{error || 'Order not found'}</p>
          <button onClick={() => onNavigate('MyOrders')} style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', marginTop: 16, fontWeight: 700 }}>
            ← My Orders
          </button>
        </div>
      </div>
    );
  }

  const currentSteps = getSteps();
  const currentIdx   = getCurrentIndex(currentSteps);
  const payment      = paymentBadge(order?.paymentStatus);

  const API_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8,#2563eb)', padding: '32px 16px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <button onClick={() => onNavigate('MyOrders')} style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            ← My Orders
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>📦 Order #{order?.id}</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
                {new Date(order?.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ backgroundColor: payment.bg, color: payment.color, padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{payment.label}</span>
              <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {order?.status?.replace(/_/g, ' ').toUpperCase()}
              </span>
              {order?.shippingMethod && (
                <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  {order.shippingMethod === 'agent' ? '🤝 Via Agent' :
                    order.shippingMethod === 'boda' ? '🛵 Boda Boda' :
                    order.shippingMethod === 'personal' ? '🚶 Personal Delivery' :
                    order.shippingMethod === 'bus' ? '🚌 Bus' :
                    '📦 Direct Ship'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 800, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Action message */}
        {/* Seller rating — shown after buyer confirms delivery */}
        {showRating && !ratingSubmitted && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', marginBottom: 16, border: '2px solid #fde68a' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>⭐ Kadiria Muuzaji</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>Uzoefu wako husaidia wanunuzi wengine kuchagua muuzaji mzuri</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => setSellerRating(star)}
                  style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', opacity: star <= sellerRating ? 1 : 0.3 }}>
                  ⭐
                </button>
              ))}
            </div>
            <textarea placeholder="Maoni yako (si lazima)..." value={ratingComment}
              onChange={e => setRatingComment(e.target.value)}
              rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', marginBottom: 10, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSubmitRating} disabled={sellerRating === 0}
                style={{ flex: 1, background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '10px', borderRadius: 8, cursor: sellerRating === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                💾 Tuma Ukadiriaji
              </button>
              <button onClick={() => setShowRating(false)}
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                Baadaye
              </button>
            </div>
          </div>
        )}

        {ratingSubmitted && (
          <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
            ⭐ Asante kwa ukadiriaji wako! Unasaidia jamii ya KenteXa.
          </div>
        )}

        {actionMsg && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>{actionMsg}</span>
            <button onClick={() => setActionMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Tracking number banner — shown once parcel is in transit or beyond */}
        {order?.trackingNumber && (
          <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 14, padding: '16px 18px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginBottom: 4 }}>📦 TRACKING NUMBER</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'monospace', letterSpacing: 1 }}>{order.trackingNumber}</div>
            {order.courierName && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>🚌 {order.courierName}</div>}
            <button onClick={() => onNavigate(`TrackParcel-${order.trackingNumber}`)}
              style={{ marginTop: 10, backgroundColor: '#fff', color: '#1d4ed8', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
              🔍 View Live Parcel Tracking
            </button>
            {/* Buyer → Seller WhatsApp — same info a tap away, no need to call */}
            <a
              href={buildBuyerInquiryMessage(order.seller?.storeWhatsApp || order.seller?.phone, {
                trackingNumber:  order.trackingNumber,
                productName:     order.product?.name,
                sellerStoreName: order.seller?.storeName || order.seller?.name,
                shippingMethod:  order.shippingMethod,
                busCompany:          order.busCompany,
                busTicketNumber:     order.busTicketNumber,
                courierName:         order.courierName,
                externalTrackingRef: order.externalTrackingRef,
              })}
              target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 8, marginLeft: 8, background: '#25D366', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
              💬 Wasiliana na Muuzaji
            </a>
          </div>
        )}

        {/* Tracking Timeline */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 24px' }}>📍 Order Tracking</h2>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 20, top: 20, bottom: 20, width: 2, background: 'linear-gradient(to bottom,#2563eb,#e2e8f0)' }} />
            {currentSteps.map((step, index) => {
              const isCompleted = index <= currentIdx;
              const isCurrent   = index === currentIdx;
              const color       = statusColor(step.status);
              return (
                <div key={step.status} style={{ display: 'flex', gap: 18, marginBottom: index < currentSteps.length - 1 ? 22 : 0, position: 'relative' }}>
                  <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: isCompleted ? `linear-gradient(135deg,${color},${color}bb)` : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: isCurrent ? `0 0 0 4px ${color}30` : 'none', border: isCurrent ? `2px solid ${color}` : '2px solid transparent', zIndex: 1 }}>
                    {isCompleted ? step.icon : <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>{index + 1}</span>}
                  </div>
                  <div style={{ flex: 1, paddingTop: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: isCurrent ? 800 : 600, color: isCompleted ? '#1e293b' : '#94a3b8', marginBottom: 2 }}>
                      {step.label}
                      {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, backgroundColor: `${color}20`, color, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>CURRENT</span>}
                    </div>
                    <div style={{ fontSize: 12, color: isCompleted ? '#64748b' : '#cbd5e1' }}>{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shipping proof — show when shipped */}
        {order?.shippingProductImage && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>📸 Shipping Proof</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>PRODUCT PHOTO</div>
                <img src={order.shippingProductImage} alt="Product" style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 150 }} />
              </div>
              {order.shippingReceiptImage && (
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>RECEIPT</div>
                  <img src={order.shippingReceiptImage} alt="Receipt" style={{ width: '100%', borderRadius: 10, objectFit: 'cover', maxHeight: 150 }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Buyer action — Confirm or Dispute */}
        {canConfirmOrDispute && order.status !== 'disputed' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 10px' }}>📦 Have you received your item?</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
              Confirm if you received the correct item. If there's a problem, raise a dispute within 24 hours.
            </p>

            {!showDispute ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleConfirm} disabled={actionLoading}
                  style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                  {actionLoading ? '⏳' : '✅ Confirm Received'}
                </button>
                <button onClick={() => setShowDispute(true)}
                  style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626', border: '2px solid #fecaca', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                  ⚠️ Raise Dispute
                </button>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Explain the issue:</label>
                <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                  placeholder="e.g. Wrong item received, damaged product..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #fecaca', fontSize: 13, boxSizing: 'border-box', outline: 'none', minHeight: 80, marginBottom: 10, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowDispute(false)} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                  <button onClick={handleDispute} disabled={actionLoading || !disputeReason.trim()}
                    style={{ flex: 2, backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {actionLoading ? '⏳' : '⚠️ Submit Dispute'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
              Auto-confirmed in 24 hours if no action taken
            </div>
          </div>
        )}

        {/* Disputed status */}
        {order?.status === 'disputed' && (
          <div style={{ backgroundColor: '#fef2f2', borderRadius: 16, padding: 18, border: '2px solid #fecaca', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', margin: '0 0 8px' }}>⚠️ Dispute In Progress</h3>
            <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 8px' }}>Reason: {order.disputeReason}</p>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Admin is reviewing. You'll be notified of the decision.</p>
          </div>
        )}

        {/* Completed */}
        {order?.status === 'completed' && (
          <div style={{ background: 'linear-gradient(135deg,#43e97b,#38f9d7)', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Order Completed!</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', margin: '0 0 16px' }}>Thank you for shopping on KenteXa!</p>
            <button onClick={() => onNavigate('Stores')} style={{ backgroundColor: '#fff', color: '#16a34a', border: 'none', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              🛒 Shop Again
            </button>
          </div>
        )}

        {/* Order Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>📦 Product</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {order?.product?.images?.[0] ? <img src={order.product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>📦</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{order?.product?.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Qty: {order?.quantity}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#2563eb' }}>TZS {Number(order?.totalAmount).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>📍 Delivery</h3>
            {[
              { icon: '👤', label: 'Deliver to', value: order?.recipientName || order?.buyer?.name || '—' },
              { icon: '📍', label: 'Address',    value: order?.deliveryAddress || '—' },
              { icon: '📞', label: 'Phone',      value: order?.phone || '—' },
              { icon: '📅', label: 'Date',       value: new Date(order?.createdAt).toLocaleDateString() },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: 6, marginBottom: 6, fontSize: 12 }}>
                <span>{item.icon}</span>
                <span style={{ color: '#94a3b8' }}>{item.label}: </span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Invoice */}
        {invoice && (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>🧾 Invoice</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: 'Invoice #',  value: invoice.invoiceNumber },
                { label: 'Status',    value: invoice.status?.replace(/_/g, ' ').toUpperCase() },
                { label: 'Amount',    value: `TZS ${Number(invoice.amount).toLocaleString()}` },
              ].map(item => (
                <div key={item.label} style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {invoice.invoiceNumber && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href={`${API_URL}/invoices/number/${invoice.invoiceNumber}/pdf`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', textDecoration: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                  📄 Download Invoice
                </a>
                {invoice.receiptNumber && (
                  <a href={`${API_URL}/invoices/receipt/${invoice.receiptNumber}/pdf`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                    🧾 Download Receipt
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate('MyOrders')} style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>← All Orders</button>
          <button onClick={() => onNavigate('Stores')} style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>🏪 Shop More</button>
          <button onClick={fetchOrderData} style={{ backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>🔄 Refresh</button>
        </div>
      </div>
      <div style={{ height: 90 }} />
    </div>
  );
};

export default OrderTracking;