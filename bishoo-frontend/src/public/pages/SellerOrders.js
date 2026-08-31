import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
// eslint-disable-next-line no-unused-vars
import { buildCreationMessage, buildTransportMessage, buildSellerToBuyerMessage } from '../utils/whatsapp-link';

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

// Shipping methods with their requirements
const getShippingMethods = (t) => [
  {
    key:      'agent',
    icon:     '🤝',
    label:    t('seller_orders.method_agent'),
    desc:     t('seller_orders.method_agent_desc'),
    needsTracking: false,
    needsReceipt:  true,
    trackingLabel: null,
    trackingPlaceholder: null,
    courierLabel: null,
    proofNote: t('seller_orders.method_agent_proof'),
  },
  {
    key:      'bus',
    icon:     '🚌',
    label:    t('seller_orders.method_bus'),
    desc:     t('seller_orders.method_bus_desc'),
    needsTracking: true,
    needsReceipt:  true,
    trackingLabel: t('seller_orders.method_bus_tracking_label'),
    trackingPlaceholder: 'e.g. KIL-001234',
    courierLabel: t('seller_orders.method_bus_courier_label'),
    proofNote: t('seller_orders.method_bus_proof'),
  },
  {
    key:      'courier',
    icon:     '📦',
    label:    t('seller_orders.method_courier'),
    desc:     t('seller_orders.method_courier_desc'),
    needsTracking: true,
    needsReceipt:  true,
    trackingLabel: t('seller_orders.method_courier_tracking_label'),
    trackingPlaceholder: 'e.g. DHL1234567890',
    courierLabel: t('seller_orders.method_courier_courier_label'),
    proofNote: t('seller_orders.method_courier_proof'),
  },
  {
    key:      'boda',
    icon:     '🏍️',
    label:    t('seller_orders.method_boda'),
    desc:     t('seller_orders.method_boda_desc'),
    needsTracking: false,
    needsReceipt:  false,
    trackingLabel: null,
    trackingPlaceholder: null,
    courierLabel: t('seller_orders.method_boda_courier_label'),
    proofNote: t('seller_orders.method_boda_proof'),
  },
  {
    key:      'personal',
    icon:     '🚶',
    label:    t('seller_orders.method_personal'),
    desc:     t('seller_orders.method_personal_desc'),
    needsTracking: false,
    needsReceipt:  false,
    trackingLabel: null,
    trackingPlaceholder: null,
    courierLabel: null,
    proofNote: t('seller_orders.method_personal_proof'),
  },
  {
    key:      'kentexa_delivery',
    icon:     '🚐',
    label:    t('seller_orders.method_van'),
    desc:     t('seller_orders.method_van_desc'),
    needsTracking: false,
    needsReceipt:  false,
    trackingLabel: null,
    trackingPlaceholder: null,
    courierLabel: null,
    proofNote: t('seller_orders.method_van_proof'),
    isBatch: true,
  },
];

const SellerOrders = ({ onNavigate, isLoggedIn, onLogout, userRole, highlightOrderId }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'en-GB';
  const highlightRef = React.useRef(null);
  const [orders, setOrders]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [confirmLoading, setConfirmLoading] = useState({});
  const [message, setMessage]             = useState('');
  const [filter, setFilter]               = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalStep, setModalStep]         = useState('method');
  const [showModal, setShowModal]         = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [transportModal, setTransportModal]     = useState(null);
  const [transportForm, setTransportForm]       = useState({ busCompany: '', busTicketNumber: '', busDeparture: '', courierName: '', courierTrackingRef: '' });
  const [savingTransport, setSavingTransport]   = useState(false);
  const [shippingMethodKey, setShippingMethodKey] = useState('agent');
  const [uploading, setUploading]         = useState({ product: false, receipt: false });
  const [shipForm, setShipForm]           = useState({
    trackingNumber: '', courierName: '', shippingNote: '',
    shippingProductImage: '', shippingReceiptImage: '',
  });
  const [selectedHub, setSelectedHub]     = useState(null);
  const [superAgentHubs, setSuperAgentHubs] = useState([]);
  const [loadingHubs, setLoadingHubs]     = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [historyList, setHistoryList]     = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [collectingCodId, setCollectingCodId] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) { onNavigate('PublicLogin'); return; }
    fetchOrders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a notification — scroll to and highlight that order.
  useEffect(() => {
    if (!highlightOrderId || !orders.length || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [orders, highlightOrderId]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/seller/dashboard');
      setOrders(res.data.recentOrders || []);
    } catch { setError(t('seller_orders.load_failed')); }
    finally { setLoading(false); }
  };

  // Full manual-shipment history (not capped like seller/dashboard's
  // recentOrders) — opened on demand from the "Historia Kamili" button.
  const openHistory = async () => {
    setShowHistory(true);
    try {
      setHistoryLoading(true);
      const res = await api.get('/super-agents/shipments/my');
      setHistoryList(res.data || []);
    } catch { setHistoryList([]); }
    finally { setHistoryLoading(false); }
  };

  const handleSaveTransport = async () => {
    if (!transportModal) return;
    // Validate required fields
    if (!transportForm.busTicketNumber?.trim() && !transportForm.courierName?.trim()) {
      setError(t('seller_orders.transport_validation_error')); return;
    }
    setSavingTransport(true);
    try {
      await api.patch(`/super-agents/shipments/${transportModal.trackingNumber}/transport`, transportForm);
      setTransportModal(null);
      setTransportForm({ busCompany: '', busTicketNumber: '', busDeparture: '', courierName: '', courierTrackingRef: '' });
      // Update local state immediately so button disappears right away
      setOrders(prev => prev.map(o =>
        o.trackingNumber === transportModal.trackingNumber
          ? { ...o, status: 'in_transit' }
          : o
      ));
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_orders.save_failed'));
    } finally { setSavingTransport(false); }
  };

  const handleSendConfirmLink = async (orderId) => {
    setConfirmLoading(p => ({ ...p, [orderId]: true }));
    try {
      const res = await api.post(`/orders/${orderId}/send-confirmation`);
      const url = res.data?.confirmationUrl;
      setMessage(`${t('seller_orders.link_sent')}${url ? ' ' + url : ''}`);
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_orders.link_send_failed'));
    } finally {
      setConfirmLoading(p => ({ ...p, [orderId]: false }));
    }
  };

  const openShipModal = (order) => {
    // kentexa_delivery has its own button — never open modal for it
    if (order.shippingMethod === 'kentexa_delivery') {
      onNavigate(`BatchHandoff-${order.id}`);
      return;
    }
    setSelectedOrder(order);
    setModalStep('method');
    // Pre-select buyer's chosen method — if boda/personal, lock to it
    const method = order.shippingMethod || 'agent';
    setShippingMethodKey(method);
    setShipForm({ trackingNumber: order.trackingNumber || `KTX-ORD-${order.id}`, courierName: '', shippingNote: '', shippingProductImage: '', shippingReceiptImage: '' });
    setShowModal(true);
    setError('');
  };

  const handleImageUpload = async (field, file) => {
    if (!file) return;
    try {
      setUploading(prev => ({ ...prev, [field]: true }));
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data.urls?.[0] || res.data.url;
      setShipForm(prev => ({
        ...prev,
        [field === 'product' ? 'shippingProductImage' : 'shippingReceiptImage']: url,
      }));
    } catch { setError(t('seller_orders.image_upload_failed')); }
    finally { setUploading(prev => ({ ...prev, [field]: false })); }
  };

  const SHIPPING_METHODS = getShippingMethods(t);
  const selectedMethod = SHIPPING_METHODS.find(m => m.key === shippingMethodKey) || SHIPPING_METHODS[0];

  const handleChooseMethod = async () => {
    if (shippingMethodKey === 'kentexa_delivery') {
      // Redirect directly to BatchHandoff — no proof needed, van handles it
      setShowModal(false);
      onNavigate(`BatchHandoff-${selectedOrder.id}`);
      return;
    }
    if (shippingMethodKey === 'agent') {
      // Fetch available super agent hubs for selection
      try {
        setLoadingHubs(true);
        const res = await api.get('/super-agents').catch(() => ({ data: [] }));
        const approved = (res.data || []).filter(a => a.status === 'approved' || a.isActive);
        setSuperAgentHubs(approved);
        setSelectedHub(null); // ✅ Don't auto-select — let seller choose
      } catch { setSuperAgentHubs([]); }
      finally { setLoadingHubs(false); }
      setModalStep('agent_info');
    } else {
      setModalStep('proof');
    }
  };

  const handleUploadProof = async () => {
    // Validate based on method
    // trackingNumber is KTX-ORD-{id} — already set. External ref (bus ticket etc) is optional
    if (selectedMethod.courierLabel && selectedMethod.needsTracking && !shipForm.courierName.trim()) {
      setError(selectedMethod.courierLabel?.replace(' *', '') + ' ' + t('seller_orders.field_required_suffix')); return;
    }
    if (selectedMethod.needsReceipt && !shipForm.shippingProductImage) {
      setError(t('seller_orders.product_photo_required')); return;
    }

    try {
      setActionLoading(true); setError('');

      // ✅ For agent method, record which hub the seller is dropping off at
      if (shippingMethodKey === 'agent' && selectedHub) {
        try {
          await api.patch(`/orders/${selectedOrder.id}/hand-to-agent`, {
            superAgentCity: selectedHub.city || selectedHub.region || 'Tanzania',
            notes: `Handing to ${selectedHub.businessName || selectedHub.user?.name || 'Super Agent'}`,
          });
        } catch {}
      }

      // Step 1: Upload shipping proof (changes status to 'preparing')
      await api.patch(`/orders/${selectedOrder.id}/shipping-proof`, {
        trackingNumber:       shipForm.trackingNumber || ((['boda','personal'].includes(shippingMethodKey) || !shipForm.trackingNumber) ? `KTX-ORD-${selectedOrder.id}` : `${shippingMethodKey.toUpperCase()}-${Date.now()}`),
        shippingReceiptImage: shipForm.shippingReceiptImage || shipForm.shippingProductImage || 'none',
        shippingProductImage: shipForm.shippingProductImage || 'none',
        courierName:          shipForm.courierName || (shippingMethodKey === 'agent' ? (selectedHub?.businessName || selectedMethod.label) : selectedMethod.label),
        shippingNote:         shipForm.shippingNote,
        shippingMethod:       shippingMethodKey,
      });

      // Step 2: For boda/personal — immediately mark as shipped
      // (status is now 'preparing' after step 1, so ship endpoint accepts it)
      if (!selectedMethod.needsTracking) {
        await api.patch(`/orders/${selectedOrder.id}/ship`);
        setMessage(t('seller_orders.shipped_via_msg', { id: selectedOrder.id, method: selectedMethod.label }));
      } else {
        setMessage(t('seller_orders.proof_saved_msg', { id: selectedOrder.id }));
      }
      setShowModal(false);
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_orders.save_failed_paid_hint'));
    } finally { setActionLoading(false); }
  };

  const handleMarkShipped = async (orderId) => {
    try {
      setActionLoading(true);
      await api.patch(`/orders/${orderId}/ship`);
      setMessage(t('seller_orders.marked_shipped_msg', { id: orderId }));
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_orders.mark_shipped_failed'));
    } finally { setActionLoading(false); }
  };

  // Same-city/boda shipments never involve a Super Agent, so there's
  // nobody else to confirm COD collection — the backend rejects this if a
  // Super Agent actually IS assigned to the shipment (see
  // OrdersService.sellerCollectCodBalance's own comment).
  const handleCollectCodBalance = async (orderId) => {
    try {
      setCollectingCodId(orderId);
      const res = await api.patch(`/orders/${orderId}/collect-cod-balance`);
      setMessage(res.data?.message || t('seller_orders.cod_collected_msg'));
      fetchOrders();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_orders.cod_collect_failed'));
    } finally { setCollectingCodId(null); }
  };

  const statusStyle = (status) => ({
    pending_payment:  { backgroundColor: '#f1f5f9', color: '#64748b' },
    paid:             { backgroundColor: '#dbeafe', color: '#2563eb' },
    preparing:        { backgroundColor: '#ede9fe', color: '#7c3aed' },
    in_transit:       { backgroundColor: '#ffedd5', color: '#ea580c' },
    ready_for_pickup: { backgroundColor: '#e0f2fe', color: '#0284c7' },
    delivered:        { backgroundColor: '#dcfce7', color: '#16a34a' },
    completed:        { backgroundColor: '#dcfce7', color: '#15803d' },
    disputed:         { backgroundColor: '#fee2e2', color: '#dc2626' },
    cancelled:        { backgroundColor: '#fee2e2', color: '#dc2626' },
  }[status] || { backgroundColor: '#f1f5f9', color: '#64748b' });

  const isManual = o => ['seller_shipment','offline','offline_intercity'].includes(o.source);
  const filteredOrders = filter === 'all' ? orders :
    filter === 'manual' ? orders.filter(isManual) : orders.filter(o => o.status === filter);
  const needsShipping  = orders.filter(o => o.status === 'paid').length;
  const totalEarnings  = orders.filter(o => o.payoutStatus === 'released').reduce((s, o) => s + Number(o.sellerAmount || 0), 0);

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '2px solid #e2e8f0', fontSize: 13,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <BackBar onBack={() => onNavigate('back')} title={t('seller_orders.title')}
        right={
          <button onClick={fetchOrders}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>
            {t('seller_orders.refresh')}
          </button>
        }
      />

      <div style={{ padding: '8px 16px 0', maxWidth: 900, margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={openHistory}
          style={{ background: '#fff', color: '#1d4ed8', border: '2px solid #1d4ed8', padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          📜 Historia Kamili
        </button>
        {/* Was OfflineIntercityOrder — a standalone re-implementation of
            exactly the walk-in-counter flow SuperAgentDashboard.js's own
            "Walk-In" form already posts to (same
            POST /super-agents/offline-intercity endpoint), except that
            endpoint is @Roles(SUPER_AGENT, ADMIN)-gated while this button
            lived on the SELLER's own orders page — a plain seller clicking
            it got a 403 on submit. SellerShipment.js ("Ship Item") is the
            real, working, COD-aware manual-order path for sellers; this
            just points there instead of to the broken duplicate. */}
        <button onClick={() => onNavigate('SellerShipment')}
          style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {t('seller_orders.create_manual_order')}
        </button>
      </div>

      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowHistory(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>📜 Historia Kamili ya Usafirishaji</h3>
              <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ Inapakia...</div>
            ) : historyList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Hakuna rekodi za usafirishaji</div>
            ) : (
              historyList.map(p => (
                <div key={p.trackingNumber} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{p.trackingNumber}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{p.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                    {p.originCity} → {p.destinationCity}
                    {p.createdAt ? ` · ${new Date(p.createdAt).toLocaleDateString('sw-TZ')}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px 90px', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>{message}</span>
            <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Needs shipping alert */}
        {needsShipping > 0 && (
          <div style={{ backgroundColor: '#fef9c3', border: '2px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>📦</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>{t('seller_orders.needs_shipping_alert', { count: needsShipping })}</div>
              <div style={{ fontSize: 12, color: '#92400e' }}>{t('seller_orders.needs_shipping_hint')}</div>
            </div>
          </div>
        )}

        {/* Stats — 2 cols on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: t('seller_orders.stat_total_orders'),   value: orders.length,                                        icon: '🛒', bg: '#ede9fe', color: '#7c3aed' },
            { label: t('seller_orders.stat_need_shipping'),  value: needsShipping,                                         icon: '📦', bg: '#fef9c3', color: '#ca8a04' },
            { label: t('seller_orders.stat_completed'),      value: orders.filter(o => o.status === 'completed').length,   icon: '✅', bg: '#dcfce7', color: '#16a34a' },
            { label: t('seller_orders.stat_released'),       value: `TZS ${totalEarnings.toLocaleString()}`,               icon: '💰', bg: '#dbeafe', color: '#2563eb' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color, marginTop: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
          {['all','paid','preparing','in_transit','completed','disputed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0, backgroundColor: filter === s ? '#1d4ed8' : '#fff', color: filter === s ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              {t(`seller_orders.${s === 'all' ? 'filter_all' : 'status_' + s}`)}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>{t('seller_orders.loading')}</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
            <p style={{ color: '#64748b' }}>{t('seller_orders.no_orders_found')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredOrders.map(order => {
              const isPaid      = order.status === 'paid';
              const isPreparing = order.status === 'preparing';
              const sc          = statusStyle(order.status);
              const isHighlighted = Number(highlightOrderId) === order.id;
              return (
                <div key={order.id} ref={isHighlighted ? highlightRef : null} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14,
                  boxShadow: isHighlighted ? '0 0 0 3px #6366f1, 0 2px 10px rgba(0,0,0,0.06)' : '0 2px 10px rgba(0,0,0,0.06)',
                  border: isHighlighted ? '2px solid #6366f1' : isPaid ? '2px solid #fcd34d' : '1px solid #f1f5f9' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                        {order.source === 'seller_shipment' ? t('seller_orders.order_type_shipment') :
                         order.source === 'offline' ? t('seller_orders.order_type_offline') :
                         order.source === 'offline_intercity' ? t('seller_orders.order_type_intercity') : t('seller_orders.order_type_default')} #{order.id}
                        {order.trackingNumber && (
                          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1d4ed8', marginTop: 2 }}>
                            🔗 {order.trackingNumber}
                          </div>
                        )}
                        {isPaid && <span style={{ marginLeft: 6, fontSize: 10, backgroundColor: '#fef9c3', color: '#ca8a04', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{t('seller_orders.ship_now_badge')}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{new Date(order.createdAt).toLocaleDateString(dateLocale)}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, flexShrink: 0, backgroundColor: sc.backgroundColor, color: sc.color }}>
                      {order.status?.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* Product + Buyer */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{t('seller_orders.product_label')}</div>
                      {/* Snapshot preferred over the live relation — a
                          renamed/deleted product must never rewrite what
                          this order actually shows was sold. */}
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.productNameSnapshot || order.product?.name || order.manualProductName || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{t('seller_orders.qty_label', { qty: order.quantity })}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8', marginTop: 2 }}>TZS {Number(order.totalAmount).toLocaleString()}</div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{t('seller_orders.deliver_to_label')}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.recipientName || order.buyer?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>📞 {order.phone || '—'}</div>
                      <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {order.deliveryAddress || '—'}</div>
                    </div>
                  </div>

                  {/* Fee breakdown — seller sees exactly what buyer paid and what they receive */}
                  <div style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#64748b' }}>{t('seller_orders.fee_product', { qty: order.quantity })}</span>
                      <span style={{ color: '#1e293b', fontWeight: 700 }}>TZS {Number(order.baseAmount || (Number(order.totalAmount) - Number(order.deliveryFeeAmount || 0))).toLocaleString()}</span>
                    </div>
                    {Number(order.deliveryFeeAmount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: '#64748b' }}>
                          {order.shippingMethod === 'boda' ? t('seller_orders.fee_delivery_boda') :
                           order.shippingMethod === 'kentexa_delivery' ? t('seller_orders.fee_delivery_van') :
                           order.shippingMethod === 'agent' ? t('seller_orders.fee_delivery_agent') :
                           t('seller_orders.fee_delivery_generic')}
                        </span>
                        <span style={{ color: '#475569' }}>TZS {Number(order.deliveryFeeAmount).toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#64748b' }}>{t('seller_orders.fee_total_paid')}</span>
                      <span style={{ color: '#1e293b', fontWeight: 800 }}>TZS {Number(order.totalAmount).toLocaleString()}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#dc2626' }}>{t('seller_orders.fee_kentexa')}</span>
                      <span style={{ color: '#dc2626' }}>-TZS {Number(order.platformFeeAmount || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ color: '#16a34a', fontWeight: 800 }}>{t('seller_orders.fee_you_receive')}</span>
                      <span style={{ color: '#16a34a', fontWeight: 900, fontSize: 13 }}>TZS {Number(order.sellerAmount || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* COD status — order.paymentMethod/codRemainingBalance/
                      codBalanceCollected already come through on every
                      order from GET /seller/dashboard; this was simply
                      never rendered anywhere on this page before. */}
                  {order.paymentMethod === 'cod' && (
                    <div style={{ backgroundColor: order.codBalanceCollected ? '#f0fdf4' : '#eff6ff',
                      border: `1px solid ${order.codBalanceCollected ? '#86efac' : '#93c5fd'}`,
                      borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, color: order.codBalanceCollected ? '#16a34a' : '#1d4ed8' }}>
                          🚚 {t('seller_orders.cod_label')}
                        </span>
                        {order.codBalanceCollected ? (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>{t('seller_orders.cod_settled_label')}</span>
                        ) : (
                          <span style={{ color: '#1d4ed8', fontWeight: 900 }}>
                            TZS {Number(order.codRemainingBalance || 0).toLocaleString()} {t('seller_orders.cod_owed_suffix')}
                          </span>
                        )}
                      </div>
                      {!order.codBalanceCollected && Number(order.codRemainingBalance) > 0 && (
                        <button onClick={() => handleCollectCodBalance(order.id)} disabled={collectingCodId === order.id}
                          style={{ width: '100%', marginTop: 8, padding: '9px 14px',
                            backgroundColor: collectingCodId === order.id ? '#f1f5f9' : '#1d4ed8',
                            color: collectingCodId === order.id ? '#94a3b8' : '#fff', border: 'none',
                            borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                          {collectingCodId === order.id ? t('seller_orders.saving') : t('seller_orders.cod_collect_button')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Tracking info */}
                  {order.trackingNumber && (
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 3 }}>
                        📦 {order.courierName || t('seller_orders.shipping_fallback')}: {order.trackingNumber}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {order.shippingProductImage && <img src={order.shippingProductImage} alt="item" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                        {order.shippingReceiptImage  && <img src={order.shippingReceiptImage}  alt="receipt" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                      </div>
                    </div>
                  )}

                  {/* Dispute */}
                  {order.status === 'disputed' && (
                    <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                      {t('seller_orders.dispute_raised', { reason: order.disputeReason })}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isPaid && order.source !== 'seller_shipment' && (
                      <button onClick={() => openShipModal(order)}
                        style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 900, boxShadow: '0 4px 12px rgba(247,151,30,0.4)' }}>
                        {t('seller_orders.start_shipping_button')}
                      </button>
                    )}
                    {/* KenteXa Van delivery — show assign button when paid/preparing and not yet in batch */}
                    {order.shippingMethod === 'kentexa_delivery' && ['paid','preparing'].includes(order.status) && !order.trackingNumber && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ backgroundColor: '#ede9fe', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>
                          {t('seller_orders.van_chosen_note')}
                        </div>
                        <button onClick={() => onNavigate(`BatchHandoff-${order.id}`)}
                          style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                          {t('seller_orders.assign_van_button')}
                        </button>
                      </div>
                    )}
                    {/* KenteXa Van — already assigned to batch */}
                    {order.shippingMethod === 'kentexa_delivery' && order.trackingNumber && (
                      <div style={{ backgroundColor: '#dcfce7', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                        {t('seller_orders.van_assigned_note', { tracking: order.trackingNumber })}
                      </div>
                    )}
                    {/* Notify buyer via WhatsApp — appears as soon as shipping has started (tracking number exists) */}
                    {order.trackingNumber && (order.buyer?.phone || order.phone) && (
                      <a
                        href={buildSellerToBuyerMessage(
                          order.buyer?.phone || order.phone || order.recipientPhone, {
                          trackingNumber:   order.trackingNumber || `KTX-ORD-${order.id}`,
                          productName:      order.productNameSnapshot || order.product?.name || order.manualProductName || order.description,
                          buyerName:        order.buyer?.name  || order.manualBuyerName || order.recipientName,
                          sellerStoreName:  order.seller?.storeName || order.seller?.businessName,
                          senderPhone:      order.seller?.user?.phone || order.seller?.phone,
                          originCity:       order.originCity,
                          destinationCity:  order.destinationCity || order.deliveryAddress,
                          transitCity:      order.transitCity,
                          expectedArrival:  order.expectedArrival,
                          estimatedDays:    order.estimatedDays,
                          busCompany:       order.busCompany,
                          busTicketNumber:  order.busTicketNumber,
                          busDeparture:     order.busDeparture,
                          courierName:      order.courierName,
                          courierTrackingRef: order.courierTrackingRef || order.externalTrackingRef,
                        })}
                        target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#25D366', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                        {t('seller_orders.notify_buyer_whatsapp')}
                      </a>
                    )}
                    {/* Transport details message — only when ticket/ref available */}
                    {order.trackingNumber && (order.busTicketNumber || order.courierTrackingRef || order.courierName) && (order.buyer?.phone || order.phone) && (
                      <a href={buildTransportMessage(
                          order.buyer?.phone || order.phone, {
                          trackingNumber:    order.trackingNumber,
                          productName:       order.productNameSnapshot || order.product?.name || order.manualProductName,
                          buyerName:         order.buyer?.name   || order.manualBuyerName || order.recipientName,
                          busCompany:        order.busCompany,
                          busTicketNumber:   order.busTicketNumber,
                          busDeparture:      order.busDeparture,
                          courierName:       order.courierName,
                          courierTrackingRef:order.courierTrackingRef,
                        })} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-block', padding: '8px 12px',
                          backgroundColor: '#1d4ed8', color: '#fff', borderRadius: 7,
                          textDecoration: 'none', fontSize: 11, fontWeight: 700,
                          marginTop: 6 }}>
                        {t('seller_orders.send_transport_details')}
                      </a>
                    )}

                    {/* Send confirmation link to buyer */}
                    {['delivered','in_transit','ready_for_pickup','shipped'].includes(order.status) && (
                      <button
                        onClick={() => handleSendConfirmLink(order.id)}
                        disabled={confirmLoading[order.id]}
                        style={{ width: '100%', marginTop: 8, padding: '9px 14px',
                          backgroundColor: confirmLoading[order.id] ? '#f1f5f9' : '#f0fdf4',
                          color: '#16a34a', border: '2px solid #86efac',
                          borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        {confirmLoading[order.id] ? t('seller_orders.sending') : t('seller_orders.send_confirm_link_button')}
                      </button>
                    )}

                    {isPreparing && !order.trackingNumber && order.source !== 'seller_shipment' && order.shippingMethod !== 'kentexa_delivery' && (
                      <button onClick={() => openShipModal(order)}
                        style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        {t('seller_orders.upload_proof_button')}
                      </button>
                    )}
                    {order.source === 'seller_shipment' && order.trackingNumber && !['in_transit','shipped','delivered','completed'].includes(order.status) && (
                      <button onClick={() => {
                        setTransportModal(order);
                        setTransportForm({ busCompany: order.busCompany || '', busTicketNumber: '', busDeparture: '', courierName: order.courierName || '', courierTrackingRef: '' });
                      }}
                        style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        {t('seller_orders.transport_details_button')}
                      </button>
                    )}
                    {isPreparing && order.trackingNumber && (
                      <button onClick={() => handleMarkShipped(order.id)} disabled={actionLoading}
                        style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                        {actionLoading ? '⏳' : t('seller_orders.mark_shipped_button')}
                      </button>
                    )}
                    <button onClick={() => onNavigate(`TrackParcel-KTX-ORD-${order.id}`)}
                      style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {t('seller_orders.track_button')}
                    </button>
                    {/* Full detail — OrderTracking.js already exists and
                        already allows seller access server-side
                        (orders.service.ts getOrderDetail's isSeller check);
                        it was just never linked from this page. */}
                    <button onClick={() => onNavigate(`OrderTracking-${order.id}`)}
                      style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {t('seller_orders.view_details_button')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SHIPPING MODAL ── */}
      {showModal && selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />

            {/* ── STEP 1: Choose Method ── */}
            {modalStep === 'method' && (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 4px' }}>{t('seller_orders.ship_order_title')}</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                  {t('seller_orders.order_hash_deliver_to', { id: selectedOrder.id, address: selectedOrder.deliveryAddress || '—' })}
                </p>

                {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>❌ {error}</div>}

                {/* Show buyer's chosen method prominently — seller doesn't re-choose */}
                <div style={{ backgroundColor: '#dbeafe', border: '2px solid #93c5fd', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>{t('seller_orders.buyer_chosen_method_label')}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>
                    {selectedOrder.shippingMethod === 'boda' ? t('seller_orders.method_name_boda') :
                     selectedOrder.shippingMethod === 'kentexa_delivery' ? t('seller_orders.method_name_van_dar') :
                     selectedOrder.shippingMethod === 'agent' ? t('seller_orders.method_name_agent_intercity') :
                     selectedOrder.shippingMethod === 'bus' ? t('seller_orders.method_name_bus') :
                     selectedOrder.shippingMethod === 'courier' ? t('seller_orders.method_name_courier') :
                     selectedOrder.shippingMethod === 'personal' ? t('seller_orders.method_name_personal') :
                     selectedOrder.shippingMethod || '—'}
                  </div>
                  {Number(selectedOrder.deliveryFeeAmount || 0) > 0 && (
                    <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4 }}>
                      {t('seller_orders.delivery_fee_paid_note', { amount: `TZS ${Number(selectedOrder.deliveryFeeAmount).toLocaleString()}` })}
                    </div>
                  )}
                </div>

                {/* Only show method picker if seller hasn't been locked to one */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {SHIPPING_METHODS.filter(m =>
                  m.key !== 'kentexa_delivery' &&
                  // Lock to buyer's specific choice if they chose a concrete method
                  (!selectedOrder?.shippingMethod ||
                   selectedOrder.shippingMethod === 'agent' ||
                   m.key === selectedOrder?.shippingMethod)
                ).map(method => (
                    <button key={method.key} onClick={() => setShippingMethodKey(method.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: shippingMethodKey === method.key ? '2px solid #1d4ed8' : '2px solid #e2e8f0', backgroundColor: shippingMethodKey === method.key ? '#eff6ff' : '#fff' }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{method.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: shippingMethodKey === method.key ? '#1d4ed8' : '#1e293b' }}>{method.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{method.desc}</div>
                      </div>
                      {shippingMethodKey === method.key && <span style={{ color: '#1d4ed8', fontSize: 16, flexShrink: 0 }}>✅</span>}
                    </button>
                  ))}
                </div>

                {/* Show delivery address for context */}
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{t('seller_orders.delivering_to_label')}</div>
                  <div style={{ color: '#475569' }}>{selectedOrder.recipientName || selectedOrder.buyer?.name || '—'}</div>
                  <div style={{ color: '#475569' }}>📞 {selectedOrder.phone || '—'}</div>
                  <div style={{ color: '#475569' }}>{selectedOrder.deliveryAddress || '—'}</div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowModal(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('seller_orders.cancel_button')}</button>
                  <button onClick={handleChooseMethod}
                    style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {t('seller_orders.continue_button')}
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 2: Super Agent Info ── */}
            {modalStep === 'agent_info' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <button onClick={() => setModalStep('method')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20 }}>←</button>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: 0 }}>{t('seller_orders.dropoff_title')}</h2>
                </div>

                {/* Order number to give agent */}
                <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginBottom: 4 }}>{t('seller_orders.show_to_agent')}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>#{selectedOrder.id}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{t('seller_orders.agent_scan_note')}</div>
                </div>

                {/* ✅ Hub selection list — seller picks before continuing */}
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{t('seller_orders.select_hub_label')}</div>
                {loadingHubs ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>{t('seller_orders.loading_hubs')}</div>
                ) : superAgentHubs.length === 0 ? (
                  <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 14, fontSize: 13, color: '#92400e', marginBottom: 14 }}>
                    {t('seller_orders.no_hubs_msg')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 260, overflowY: 'auto' }}>
                    {superAgentHubs.map(hub => (
                      <div key={hub.id} onClick={() => setSelectedHub(hub)}
                        style={{ backgroundColor: selectedHub?.id === hub.id ? '#f0fdf4' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: selectedHub?.id === hub.id ? '2px solid #16a34a' : '2px solid #e2e8f0', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{hub.businessName || hub.user?.name || 'Super Agent Hub'}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📍 {hub.city || hub.region || '—'}</div>
                            <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>📞 {hub.user?.phone || hub.phone || '—'}</div>
                          </div>
                          {selectedHub?.id === hub.id && <span style={{ color: '#16a34a', fontSize: 18 }}>✅</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                  {t('seller_orders.after_dropoff_note')}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setModalStep('method')}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('seller_orders.back_button')}</button>
                  <button onClick={() => { setModalStep('proof'); setError(''); }} disabled={!selectedHub}
                    style={{ flex: 2, background: !selectedHub ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)', color: !selectedHub ? '#94a3b8' : '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: !selectedHub ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {selectedHub ? t('seller_orders.drop_at_hub_button') : t('seller_orders.select_hub_first')}
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: Upload Proof ── */}
            {modalStep === 'proof' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <button onClick={() => setModalStep(shippingMethodKey === 'agent' ? 'agent_info' : 'method')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 20 }}>←</button>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: 0 }}>
                      {selectedMethod.icon} {selectedMethod.label}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>{t('seller_orders.order_hash', { id: selectedOrder.id })}</p>
                  </div>
                </div>

                {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>❌ {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', float: 'right' }}>×</button></div>}

                {/* Info banner based on method */}
                <div style={{ backgroundColor: selectedMethod.needsTracking ? '#eff6ff' : '#f0fdf4', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: selectedMethod.needsTracking ? '#1d4ed8' : '#16a34a' }}>
                  ℹ️ {selectedMethod.proofNote}
                </div>

                {/* Tracking number — only if needed */}
                {/* Permanent tracking number — always show, never editable */}
                <div style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{t('seller_orders.tracking_number_permanent_label')}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f7c948', fontFamily: 'monospace' }}>
                    {selectedOrder?.trackingNumber || `KTX-ORD-${selectedOrder?.id}`}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{t('seller_orders.tracking_number_note')}</div>
                </div>

                {/* External ref — only for bus/courier */}
                {selectedMethod?.needsTracking && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{selectedMethod.trackingLabel}</label>
                    <input type="text" placeholder={selectedMethod.trackingPlaceholder}
                      value={shipForm.trackingNumber} onChange={e => setShipForm({ ...shipForm, trackingNumber: e.target.value })}
                      style={inputStyle} />
                  </div>
                )}

                {/* Courier/bus name */}
                {selectedMethod.courierLabel && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{selectedMethod.courierLabel}</label>
                    <input type="text"
                      placeholder={selectedMethod.key === 'bus' ? t('seller_orders.courier_placeholder_bus') : selectedMethod.key === 'boda' ? t('seller_orders.courier_placeholder_boda') : t('seller_orders.courier_placeholder_generic')}
                      value={shipForm.courierName} onChange={e => setShipForm({ ...shipForm, courierName: e.target.value })}
                      style={inputStyle} />
                  </div>
                )}

                {/* Product photo — always show */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>
                    {t('seller_orders.photo_packed_item_label')} {selectedMethod.needsReceipt ? '*' : t('seller_orders.optional')}
                  </label>
                  <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: 12, backgroundColor: '#f8fafc', textAlign: 'center' }}>
                    {shipForm.shippingProductImage ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={shipForm.shippingProductImage} alt="item" style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                        <button onClick={() => setShipForm(p => ({ ...p, shippingProductImage: '' }))}
                          style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    ) : (
                      <>
                        <input type="file" accept="image/*" id="upload-product" style={{ display: 'none' }}
                          onChange={e => handleImageUpload('product', e.target.files[0])} />
                        <label htmlFor="upload-product"
                          style={{ display: 'inline-block', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                          {uploading.product ? t('seller_orders.uploading') : t('seller_orders.choose_photo')}
                        </label>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{t('seller_orders.from_gallery')}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Receipt photo — only if needed */}
                {selectedMethod.needsReceipt && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>
                      {shippingMethodKey === 'agent' ? t('seller_orders.receipt_photo_label_agent') : shippingMethodKey === 'bus' ? t('seller_orders.receipt_photo_label_bus') : t('seller_orders.receipt_photo_label_courier')}
                    </label>
                    <div style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: 12, backgroundColor: '#f8fafc', textAlign: 'center' }}>
                      {shipForm.shippingReceiptImage ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img src={shipForm.shippingReceiptImage} alt="receipt" style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                          <button onClick={() => setShipForm(p => ({ ...p, shippingReceiptImage: '' }))}
                            style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11 }}>×</button>
                        </div>
                      ) : (
                        <>
                          <input type="file" accept="image/*" id="upload-receipt" style={{ display: 'none' }}
                            onChange={e => handleImageUpload('receipt', e.target.files[0])} />
                          <label htmlFor="upload-receipt"
                            style={{ display: 'inline-block', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            {uploading.receipt ? t('seller_orders.uploading') : t('seller_orders.choose_photo')}
                          </label>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{t('seller_orders.from_gallery')}</div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Note */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{t('seller_orders.note_for_buyer_label')}</label>
                  <input type="text" placeholder={t('seller_orders.note_for_buyer_placeholder')}
                    value={shipForm.shippingNote} onChange={e => setShipForm({ ...shipForm, shippingNote: e.target.value })}
                    style={inputStyle} />
                </div>

                {/* Boda/Personal — no upload needed note */}
                {!selectedMethod.needsTracking && (
                  <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                    {t('seller_orders.no_upload_needed_note')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowModal(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('seller_orders.cancel_button')}</button>
                  <button onClick={handleUploadProof} disabled={actionLoading || uploading.product || uploading.receipt}
                    style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: actionLoading ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {actionLoading ? t('seller_orders.saving') : selectedMethod.needsTracking ? t('seller_orders.save_continue_button') : t('seller_orders.confirm_shipped_button')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


      {/* Transport upload modal — seller self drop-off */}
      {transportModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>{t('seller_orders.transport_modal_title')}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              {t('seller_orders.transport_modal_desc')}
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, fontFamily: 'monospace', color: '#1d4ed8' }}>
              {transportModal.trackingNumber}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>{t('seller_orders.via_bus_label')}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{t('seller_orders.via_bus_hint')}</div>
              <input type="text" placeholder={t('seller_orders.bus_company_placeholder')}
                value={transportForm.busCompany} onChange={e => setTransportForm(f => ({ ...f, busCompany: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <input type="text" placeholder={t('seller_orders.ticket_number_placeholder')}
                value={transportForm.busTicketNumber} onChange={e => setTransportForm(f => ({ ...f, busTicketNumber: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <input type="text" placeholder={t('seller_orders.departure_time_placeholder')}
                value={transportForm.busDeparture} onChange={e => setTransportForm(f => ({ ...f, busDeparture: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, margin: '8px 0' }}>{t('seller_orders.or_divider')}</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>{t('seller_orders.via_courier_label')}</div>
              <input type="text" placeholder={t('seller_orders.courier_name_placeholder')}
                value={transportForm.courierName} onChange={e => setTransportForm(f => ({ ...f, courierName: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <input type="text" placeholder={t('seller_orders.courier_tracking_placeholder')}
                value={transportForm.courierTrackingRef} onChange={e => setTransportForm(f => ({ ...f, courierTrackingRef: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSaveTransport}
                disabled={savingTransport || (!transportForm.busTicketNumber && !transportForm.courierName)}
                style={{ flex: 2, background: (!transportForm.busTicketNumber && !transportForm.courierTrackingRef) ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)',
                  color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 900 }}>
                {savingTransport ? t('seller_orders.saving') : t('seller_orders.save_notify_button')}
              </button>
              <button onClick={() => setTransportModal(null)}
                style={{ flex: 1, background: '#fff', color: '#64748b', border: '2px solid #e2e8f0', padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('seller_orders.cancel_ghairi')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerOrders;