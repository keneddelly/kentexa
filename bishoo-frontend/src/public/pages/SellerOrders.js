import { fromTyped } from '../components/PlaceSearchField';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import { isDirectPaymentOrder } from '../../utils/paymentMode';
import { getAccessToken } from '../../api/tokenStore';
import { buildTransportMessage, buildSellerToBuyerMessage } from '../utils/whatsapp-link';
import LipaPaymentReview from '../components/LipaPaymentReview';
import { PageLoading, Spinner } from '../components/Loading';

// Shipping methods with their requirements
const getShippingMethods = (t) => [
  {
    key:      'agent',
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

/**
 * One shipment engine (owner 2026-10-25): a paid marketplace order that travels through
 * the KenteXa network is sent with the same seller form as every other send. Its waybill
 * from checkout stays. Pay-on-delivery with money still to collect keeps the counter path.
 */
export const engineShippable = (order) => ['paid', 'preparing'].includes(order?.status)
  && ['agent', 'kentexa_delivery'].includes(order?.shippingMethod)
  && order?.source !== 'seller_shipment' && !(Number(order?.codRemainingBalance) > 0)
  && !String(order?.shippingNote || '').startsWith('Imetumwa kupitia KenteXa')
  && order?.product?.productType !== 'digital';

/** The seller form's prefill for an order: nothing the order already says is asked again. */
export const orderToSend = (order) => {
  const qty = Number(order.quantity) || 1;
  const place = fromTyped(order.deliveryAddress || '');
  return {
    orderId: order.id,
    name: order.recipientName || order.buyer?.name || order.manualBuyerName || '',
    phone: order.phone || order.buyer?.phone || order.recipientPhone || '',
    region: place.regionName, district: place.districtName, ward: place.wardName,
    items: [{
      name: order.productNameSnapshot || order.product?.name || order.manualProductName || 'Bidhaa', qty,
      price: Math.round((Number(order.baseAmount) || 0) / qty), weight: Number(order.product?.weightKg) || 0,
      productId: order.product?.id || null, classifiedId: null,
    }],
  };
};

// ── The page by job, not by system status (owner 2026-10-27) ──────────────────
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const TONE = { blue: BLUE, amber: '#92400e', red: '#b91c1c', green: '#166534', muted: MUTED };
const MANUAL = ['seller_shipment', 'offline', 'offline_intercity'];
export const isManualOrder = (o) => MANUAL.includes(o?.source);
const sentThroughKentexa = (o) => String(o?.shippingNote || '').startsWith('Imetumwa kupitia KenteXa');

/** Which tab an order sits in: what the seller has to do, not the raw status. */
export const tabOf = (o) => {
  const s = o?.status;
  if (s === 'disputed' || s === 'cancelled') return 'problem';
  if (s === 'delivered' || s === 'completed') return 'done';
  if (['in_transit', 'ready_for_pickup', 'shipped'].includes(s)) return 'way';
  if (s === 'preparing' && (o.trackingNumber || isManualOrder(o) || sentThroughKentexa(o) || o.shippingMethod === 'kentexa_delivery')) return 'way';
  return 'send';
};

export const TABS = [
  { key: 'send', label: 'Za kutuma' },
  { key: 'way', label: 'Njiani' },
  { key: 'done', label: 'Zimefika' },
  { key: 'problem', label: 'Tatizo' },
];

/**
 * The ONE next step for an order: what it says on the row and the main button inside.
 * action: engine (the send form) | modal (the buyer chose their own way) | shipped | confirm | null.
 */
export const nextStep = (o) => {
  const s = o?.status;
  const lipaUnpaid = o?.paymentMethod === 'lipa_namba' && o?.paymentStatus !== 'paid';
  if (s === 'disputed') return { label: 'Mteja ameleta malalamiko', tone: 'red', action: null };
  if (s === 'cancelled') return { label: 'Limeghairiwa', tone: 'red', action: null };
  if (s === 'completed') return { label: 'Limekamilika', tone: 'green', action: null };
  if (lipaUnpaid && ['pending_payment', 'paid'].includes(s)) return { label: 'Thibitisha malipo ya Lipa Namba', tone: 'amber', action: 'lipa' };
  if (s === 'pending_payment') return { label: 'Inasubiri malipo ya mteja', tone: 'amber', action: null };
  const cod = o?.paymentMethod === 'cod' && !o?.codBalanceCollected && Number(o?.codRemainingBalance) > 0;
  if (s === 'paid') {
    if (o.shippingMethod === 'kentexa_delivery' && !engineShippable(o)) return { label: 'Peleka ofisini', tone: 'blue', action: null };
    if (engineShippable(o)) return { label: cod ? 'Lipa ukipokea. Itume' : 'Imelipwa. Itume', tone: 'blue', action: 'engine' };
    if (!isManualOrder(o)) return { label: cod ? 'Lipa ukipokea. Itume' : 'Imelipwa. Itume', tone: 'blue', action: 'modal' };
  }
  if (s === 'preparing') {
    if (o.shippingMethod === 'kentexa_delivery' && !sentThroughKentexa(o)) return { label: 'Peleka ofisini', tone: 'blue', action: null };
    if (!o.trackingNumber && !isManualOrder(o) && !sentThroughKentexa(o)) return { label: 'Weka uthibitisho wa kutuma', tone: 'blue', action: 'modal' };
    if (o.trackingNumber && !isManualOrder(o) && !sentThroughKentexa(o)) return { label: 'Thibitisha umetuma', tone: 'blue', action: 'shipped' };
    return { label: cod ? 'Inapelekwa. Pesa italipwa akipokea' : 'Inapelekwa kwa mteja', tone: 'muted', action: null };
  }
  if (['in_transit', 'ready_for_pickup', 'shipped'].includes(s)) return { label: 'Njiani kwa mteja', tone: 'muted', action: isManualOrder(o) ? null : 'confirm' };
  if (s === 'delivered') return { label: isManualOrder(o) ? 'Imefika' : 'Imefika. Mteja athibitishe', tone: 'green', action: isManualOrder(o) ? null : 'confirm' };
  return { label: 'Inaandaliwa', tone: 'muted', action: null };
};

/** How this order is paid, shown on every row (owner 2026-10-27): COD and Lipa Namba must be obvious. */
export const payLabel = (o) => {
  if (o?.paymentMethod === 'lipa_namba') {
    return o.paymentStatus === 'paid' ? { text: 'Lipa Namba · imelipwa', tone: 'green' } : { text: 'Lipa Namba · thibitisha', tone: 'amber' };
  }
  if (o?.paymentMethod === 'cod') {
    return o.codBalanceCollected || (o.paymentStatus === 'paid' && !(Number(o.codRemainingBalance) > 0))
      ? { text: 'Lipa ukipokea · amelipa', tone: 'green' } : { text: 'Lipa ukipokea', tone: 'amber' };
  }
  return null;
};
const money = (n) => `TZS ${Number(n || 0).toLocaleString()}`;
const itemName = (o) => o.productNameSnapshot || o.product?.name || o.manualProductName || 'Bidhaa';
const buyerName = (o) => o.recipientName || o.buyer?.name || o.manualBuyerName || 'Mteja';
const buyerPhone = (o) => o.phone || o.buyer?.phone || o.manualBuyerPhone || o.recipientPhone || '';
const placeOf = (o) => String(o.deliveryAddress || '').split(',')[0].trim();
const DAYS = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
export const shortWhen = (v) => {
  if (!v) return '';
  const d = new Date(v); const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 0) return `leo ${hm}`;
  if (days === 1) return 'jana';
  if (days < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const Svg = ({ d, size = 18, color = INK, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const P = {
  plus: 'M12 5v14M5 12h14', back: 'M15 6l-6 6 6 6', chev: 'M9 6l6 6-6 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  chat: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z',
};
const pillBtn = (bg, fg = '#fff', border = 'none') => ({ height: 48, borderRadius: 24, border, background: bg, color: fg, fontSize: 15, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', padding: '0 18px' });
const rowLink = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 0', border: 'none', borderBottom: `1px solid ${LINE}`,
  background: 'none', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: INK, cursor: 'pointer', textAlign: 'left', textDecoration: 'none' };

const SellerOrders = ({ onNavigate, isLoggedIn, onLogout, userRole, highlightOrderId, activeProfileId }) => {
  const { t } = useTranslation();
  const highlightRef = React.useRef(null);
  const [orders, setOrders]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [confirmLoading, setConfirmLoading] = useState({});
  const [message, setMessage]             = useState('');
  const [tab, setTab]                     = useState(null); // null: the first tab with work in it
  const [kind, setKind]                   = useState('all'); // all | market | mine
  const [openId, setOpenId]               = useState(highlightOrderId ? Number(highlightOrderId) : null);
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
  const [collectingCodId, setCollectingCodId] = useState(null);

  useEffect(() => {
    if (!getAccessToken()) { onNavigate('PublicLogin'); return; }
    fetchOrders();
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a notification — scroll to and highlight that order.
  useEffect(() => {
    if (!highlightOrderId || !orders.length || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [orders, highlightOrderId]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      // Every order of the active business (not the dashboard's latest 30 per source).
      const res = await api.get('/seller/orders', { params: activeProfileId ? { commerceProfileId: activeProfileId } : {} });
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch { setError(t('seller_orders.load_failed')); }
    finally { setLoading(false); }
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
      // KenteXa transport starts with hub intake. The Super Agent scans the
      // existing order tracking number; backend creates/updates the canonical
      // Parcel + custody event, after which Stage 3S movement takes over.
      setShowModal(false);
      setMessage('Van ya mtaa imechaguliwa. Peleka mzigo ofisini na namba yake ya kufuatilia.');
      return;
    }
    if (shippingMethodKey === 'agent') {
      // Fetch available super agent hubs for selection
      try {
        setLoadingHubs(true);
        const res = await api.get('/super-agents').catch(() => ({ data: [] }));
        const approved = (res.data || []).filter(a => a.status === 'approved' || a.isActive);
        setSuperAgentHubs(approved);
        setSelectedHub(null); // Don't auto-select — let seller choose
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

      // For agent method, record which hub the seller is dropping off at
      if (shippingMethodKey === 'agent' && selectedHub) {
        try {
          await api.patch(`/orders/${selectedOrder.id}/hand-to-agent`, {
            superAgentCity: selectedHub.city || selectedHub.region || 'Tanzania',
            // The office itself, so it sees this order coming with its waybill.
            superAgentId: selectedHub.id || undefined,
            notes: `Handing to ${selectedHub.businessName || selectedHub.user?.name || 'ofisi'}`,
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

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '2px solid #e2e8f0', fontSize: 13,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  const counts = TABS.reduce((m, tb) => ({ ...m, [tb.key]: orders.filter((o) => tabOf(o) === tb.key).length }), {});
  const shownTab = tab || (counts.send ? 'send' : counts.way ? 'way' : counts.done ? 'done' : 'send');
  const list = orders
    .filter((o) => tabOf(o) === shownTab)
    .filter((o) => kind === 'all' || (kind === 'mine' ? isManualOrder(o) : !isManualOrder(o)));
  const open = openId != null ? orders.find((o) => o.id === openId) : null;

  const runAction = (o, action) => {
    if (action === 'engine') onNavigate('SellerShipment', orderToSend(o));
    else if (action === 'modal') openShipModal(o);
    else if (action === 'shipped') handleMarkShipped(o.id);
    else if (action === 'confirm') handleSendConfirmLink(o.id);
  };
  const ACTION_LABEL = { engine: 'Tuma mzigo', modal: 'Tuma mzigo', shipped: 'Nimetuma', confirm: 'Mtumie link ya kuthibitisha' };

  const notices = (
    <>
      {message && (
        <div role="status" style={{ margin: '12px 16px 0', backgroundColor: '#ecfdf3', color: '#166534', padding: '12px 14px', borderRadius: 12, fontSize: 14, display: 'flex', gap: 10 }}>
          <span style={{ flex: 1 }}>{message}</span>
          <button type="button" aria-label="Funga" onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 18, padding: 0 }}>×</button>
        </div>
      )}
      {error && (
        <div role="alert" style={{ margin: '12px 16px 0', backgroundColor: '#fef2f2', color: '#b91c1c', padding: '12px 14px', borderRadius: 12, fontSize: 14, display: 'flex', gap: 10 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" aria-label="Funga" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, padding: 0 }}>×</button>
        </div>
      )}
    </>
  );

  // ── One order: its one next step first, everything else below ──────────────
  const renderOrder = (o) => {
    const step = nextStep(o);
    const phone = buyerPhone(o);
    const cod = o.paymentMethod === 'cod' && !isDirectPaymentOrder(o);
    const codOwed = cod && !o.codBalanceCollected && Number(o.codRemainingBalance) > 0;
    const photo = o.product?.images?.[0];
    const fact = (k, v) => v ? (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', fontSize: 15, borderBottom: `1px solid ${LINE}` }}>
        <span style={{ color: MUTED }}>{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong>
      </div>
    ) : null;
    const whatsapp = o.trackingNumber && phone ? buildSellerToBuyerMessage(phone, {
      trackingNumber: o.trackingNumber, productName: itemName(o), buyerName: buyerName(o),
      sellerStoreName: o.seller?.storeName || o.seller?.businessName, senderPhone: o.seller?.phone,
      originCity: o.originCity, destinationCity: o.destinationCity || o.deliveryAddress, transitCity: o.transitCity,
      expectedArrival: o.expectedArrival, estimatedDays: o.estimatedDays, busCompany: o.busCompany,
      busTicketNumber: o.busTicketNumber, busDeparture: o.busDeparture, courierName: o.courierName,
      courierTrackingRef: o.courierTrackingRef || o.externalTrackingRef,
    }) : null;
    const transportMsg = o.trackingNumber && phone && (o.busTicketNumber || o.courierTrackingRef || o.courierName)
      ? buildTransportMessage(phone, { trackingNumber: o.trackingNumber, productName: itemName(o), buyerName: buyerName(o),
        busCompany: o.busCompany, busTicketNumber: o.busTicketNumber, busDeparture: o.busDeparture,
        courierName: o.courierName, courierTrackingRef: o.courierTrackingRef }) : null;
    const reached = { send: 1, way: 2, done: 3, problem: 1 }[tabOf(o)];
    const stages = ['Agizo limepokelewa', 'Litume', 'Njiani kwa mteja', o.status === 'completed' ? 'Limekamilika' : 'Mteja amepokea'];
    return (
      <div data-testid="order-view">
        <section style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          {photo ? <img src={photo} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ width: 64, height: 64, borderRadius: 12, background: LINE, flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 17 }}>{itemName(o)}</strong>
            <span style={{ fontSize: 14, color: MUTED }}>{Number(o.quantity) || 1} × {money(o.totalAmount / (Number(o.quantity) || 1))} · {isManualOrder(o) ? 'Mauzo yangu' : 'Sokoni'}</span>
          </span>
        </section>

        <section data-testid="next-step" style={{ margin: '0 16px', padding: 16, borderRadius: 16, background: step.tone === 'red' ? '#fef2f2' : step.tone === 'green' ? '#ecfdf3' : '#eff6ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TONE[step.tone] }}>Hatua inayofuata</span>
          <strong style={{ fontSize: 17 }}>{step.label}</strong>
          {o.status === 'disputed' && o.disputeReason && <span style={{ fontSize: 14, color: MUTED }}>{o.disputeReason}</span>}
          {o.shippingMethod === 'kentexa_delivery' && ['paid', 'preparing'].includes(o.status) && !engineShippable(o) && (
            <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>Peleka mzigo ofisini. Ofisi itasoma namba {o.trackingNumber || `KTX-ORD-${o.id}`} na kuupokea.</span>
          )}
          {codOwed && (
            <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>Mteja analipa {money(o.codRemainingBalance)} akipokea.</span>
          )}
          {step.action === 'lipa' && <LipaPaymentReview orderId={o.id} />}
          {step.action && step.action !== 'lipa' && (
            <button type="button" data-testid="next-action" onClick={() => runAction(o, step.action)}
              disabled={actionLoading || (step.action === 'confirm' && confirmLoading[o.id])} style={pillBtn(BLUE)}>
              {(actionLoading && step.action === 'shipped') || (step.action === 'confirm' && confirmLoading[o.id])
                ? <Spinner size={18} color="#fff" /> : ACTION_LABEL[step.action]}
            </button>
          )}
          {codOwed && (
            <button type="button" data-testid="cod-collect" onClick={() => handleCollectCodBalance(o.id)} disabled={collectingCodId === o.id}
              style={pillBtn('#fff', INK, '1px solid #cfd9de')}>
              {collectingCodId === o.id ? <Spinner size={18} color={INK} /> : 'Nimepokea pesa ya mteja'}
            </button>
          )}
        </section>

        <section style={{ padding: 16 }}>
          <span style={{ fontSize: 13, color: MUTED }}>Mteja</span>
          {fact('Jina', buyerName(o))}
          {fact('Simu', phone)}
          {fact('Mahali', o.deliveryAddress)}
          {fact('Malipo', o.paymentMethod === 'lipa_namba' ? 'Lipa Namba' : cod ? (o.codBalanceCollected ? 'Lipa ukipokea · amelipa' : 'Lipa ukipokea') : isDirectPaymentOrder(o) ? 'Moja kwa moja kwako' : 'Kupitia KenteXa')}
        </section>

        <section style={{ padding: '0 16px', display: 'flex', gap: 10 }}>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" style={{ ...pillBtn('#fff', INK, '1px solid #cfd9de'), flex: 1, height: 44, fontSize: 14 }}><Svg d={P.chat} />WhatsApp</a>}
          {phone && <a href={`tel:${phone}`} style={{ ...pillBtn('#fff', INK, '1px solid #cfd9de'), flex: 1, height: 44, fontSize: 14 }}><Svg d={P.phone} />Piga simu</a>}
        </section>

        <section style={{ padding: 16 }}>
          <span style={{ fontSize: 13, color: MUTED }}>Pesa</span>
          {fact('Bidhaa', money(o.baseAmount || (Number(o.totalAmount) - Number(o.deliveryFeeAmount || 0))))}
          {Number(o.deliveryFeeAmount) > 0 && fact('Usafiri', money(o.deliveryFeeAmount))}
          {fact('Jumla', money(o.totalAmount))}
          {!isDirectPaymentOrder(o) && !isManualOrder(o) && fact('Ada ya KenteXa', `-${money(o.platformFeeAmount)}`)}
          {!isDirectPaymentOrder(o) && !isManualOrder(o) && fact('Utapokea', money(o.sellerAmount))}
        </section>

        <section style={{ padding: '0 16px 8px' }}>
          <span style={{ fontSize: 13, color: MUTED }}>Safari ya agizo</span>
          {stages.map((label, i) => (
            <div key={label} style={{ display: 'flex', gap: 12, paddingTop: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, flexShrink: 0, background: i < reached ? BLUE : i === reached ? INK : '#cfd9de' }} />
              <span style={{ fontSize: 15, fontWeight: i === reached ? 800 : 600, color: i > reached ? '#8b98a5' : INK }}>{label}</span>
            </div>
          ))}
          {o.trackingNumber && <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>Namba ya mzigo: <strong style={{ color: INK }}>{o.trackingNumber}</strong>{o.courierName ? ` · ${o.courierName}` : ''}</div>}
          {(o.shippingProductImage || o.shippingReceiptImage) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {[o.shippingProductImage, o.shippingReceiptImage].filter((u) => u && u !== 'none').map((u) => <img key={u} src={u} alt="Uthibitisho" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />)}
            </div>
          )}
        </section>

        <section style={{ padding: '8px 16px 24px' }}>
          <span style={{ fontSize: 13, color: MUTED }}>Zaidi</span>
          <button type="button" onClick={() => onNavigate(`TrackParcel-${o.trackingNumber || `KTX-ORD-${o.id}`}`)} style={rowLink}><span style={{ flex: 1 }}>Fuatilia mzigo</span><Svg d={P.chev} color="#8b98a5" /></button>
          <button type="button" onClick={() => onNavigate(`OrderTracking-${o.id}`)} style={rowLink}><span style={{ flex: 1 }}>Maelezo kamili ya agizo</span><Svg d={P.chev} color="#8b98a5" /></button>
          {o.source === 'seller_shipment' && o.trackingNumber && !['in_transit', 'shipped', 'delivered', 'completed'].includes(o.status) && (
            <button type="button" onClick={() => { setTransportModal(o); setTransportForm({ busCompany: o.busCompany || '', busTicketNumber: '', busDeparture: '', courierName: o.courierName || '', courierTrackingRef: '' }); }} style={rowLink}>
              <span style={{ flex: 1 }}>Weka maelezo ya basi au kampuni</span><Svg d={P.chev} color="#8b98a5" />
            </button>
          )}
          {transportMsg && <a href={transportMsg} target="_blank" rel="noreferrer" style={rowLink}><span style={{ flex: 1 }}>Mtumie mteja maelezo ya basi</span><Svg d={P.chev} color="#8b98a5" /></a>}
        </section>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: INK, paddingBottom: 90 }}>
      {open ? (
        <>
          <BackBar onBack={() => setOpenId(null)} title={`Agizo #${open.id}`} top={0} />
          {notices}
          {renderOrder(open)}
        </>
      ) : (
        <>
          <BackBar onBack={() => onNavigate('SellerDashboard')} title="Maagizo" top={0}
            right={
              <button type="button" onClick={() => onNavigate('SellerShipment')} style={{ ...pillBtn(INK), height: 36, fontSize: 14, padding: '0 14px' }}>
                <Svg d={P.plus} color="#fff" sw={2.4} size={16} />Uza
              </button>
            } />
          <nav role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, maxWidth: 720, margin: '0 auto' }}>
            {TABS.map((tb) => {
              const on = shownTab === tb.key;
              return (
                <button key={tb.key} type="button" role="tab" aria-selected={on} data-testid={`tab-${tb.key}`} onClick={() => setTab(tb.key)}
                  style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0 0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 14, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                  <span>{tb.label}{counts[tb.key] ? ` ${counts[tb.key]}` : ''}</span>
                  <span style={{ marginTop: 10, height: 4, width: 48, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
                </button>
              );
            })}
          </nav>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
              {[['all', 'Zote'], ['market', 'Sokoni'], ['mine', 'Mauzo yangu']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  style={{ height: 32, padding: '0 14px', borderRadius: 16, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: kind === k ? 'none' : '1px solid #cfd9de', background: kind === k ? INK : '#fff', color: kind === k ? '#fff' : INK }}>{label}</button>
              ))}
            </div>
            {notices}
            {loading ? <PageLoading label="Inapakia maagizo" /> : list.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: MUTED, fontSize: 15 }}>
                {shownTab === 'send' ? 'Hakuna agizo la kutuma sasa.' : shownTab === 'way' ? 'Hakuna agizo njiani.' : shownTab === 'done' ? 'Bado hakuna agizo lililofika.' : 'Hakuna agizo lenye tatizo.'}
              </div>
            ) : (
              <ul data-testid="order-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {list.map((o) => {
                  const step = nextStep(o);
                  const photo = o.product?.images?.[0];
                  const highlighted = Number(highlightOrderId) === o.id;
                  return (
                    <li key={o.id} ref={highlighted ? highlightRef : null}>
                      <button type="button" data-testid={`order-${o.id}`} onClick={() => setOpenId(o.id)}
                        style={{ display: 'flex', gap: 12, width: '100%', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                          background: highlighted ? '#eff6ff' : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
                        {photo ? <img src={photo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                          : <span style={{ width: 48, height: 48, borderRadius: 10, background: LINE, flexShrink: 0 }} />}
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName(o)}</strong>
                            <strong style={{ fontSize: 15, flexShrink: 0 }}>{money(o.totalAmount)}</strong>
                          </span>
                          <span style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[buyerName(o), placeOf(o), shortWhen(o.createdAt)].filter(Boolean).join(' · ')}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, border: '1px solid #cfd9de', borderRadius: 10, padding: '1px 8px', flexShrink: 0 }}>{isManualOrder(o) ? 'Mauzo yangu' : 'Sokoni'}</span>
                            {payLabel(o) && (
                              <span data-testid="row-pay" style={{ fontSize: 12, fontWeight: 700, color: TONE[payLabel(o).tone], background: payLabel(o).tone === 'green' ? '#ecfdf3' : '#fffbeb', borderRadius: 10, padding: '1px 8px', flexShrink: 0 }}>{payLabel(o).text}</span>
                            )}
                            <span data-testid="row-next" style={{ fontSize: 13, fontWeight: 700, color: TONE[step.tone] }}>{step.label}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── SHIPPING MODAL ── */}
      {showModal && selectedOrder && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />

            {/* ── STEP 1: Choose Method ── */}
            {modalStep === 'method' && (
              <>
                <h2 style={{ fontSize: 17, fontWeight:800, color: '#1e293b', margin: '0 0 4px' }}>{t('seller_orders.ship_order_title')}</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
                  {t('seller_orders.order_hash_deliver_to', { id: selectedOrder.id, address: selectedOrder.deliveryAddress || '—' })}
                </p>

                {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>{error}</div>}

                {/* Show buyer's chosen method prominently — seller doesn't re-choose */}
                <div style={{ backgroundColor: '#dbeafe', border: '2px solid #93c5fd', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>{t('seller_orders.buyer_chosen_method_label')}</div>
                  <div style={{ fontSize: 15, fontWeight:800, color: '#1e293b' }}>
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
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: shippingMethodKey === method.key ? '#1d4ed8' : '#1e293b' }}>{method.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{method.desc}</div>
                      </div>
                      {shippingMethodKey === method.key && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                    </button>
                  ))}
                </div>

                {/* Show delivery address for context */}
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{t('seller_orders.delivering_to_label')}</div>
                  <div style={{ color: '#475569' }}>{selectedOrder.recipientName || selectedOrder.buyer?.name || '—'}</div>
                  <div style={{ color: '#475569' }}>Simu: {selectedOrder.phone || '—'}</div>
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
                  <h2 style={{ fontSize: 17, fontWeight:800, color: '#1e293b', margin: 0 }}>{t('seller_orders.dropoff_title')}</h2>
                </div>

                {/* Order number to give agent */}
                <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, marginBottom: 4 }}>{t('seller_orders.show_to_agent')}</div>
                  <div style={{ fontSize: 24, fontWeight:800, color: '#fff', fontFamily: 'monospace' }}>#{selectedOrder.id}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{t('seller_orders.agent_scan_note')}</div>
                </div>

                {/* Hub selection list — seller picks before continuing */}
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
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{hub.businessName || hub.user?.name || 'Ofisi'}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{hub.city || hub.region || '—'}</div>
                            <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>{hub.user?.phone || hub.phone || '—'}</div>
                          </div>
                          {selectedHub?.id === hub.id && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
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
                    <h2 style={{ fontSize: 17, fontWeight:800, color: '#1e293b', margin: 0 }}>
                      {selectedMethod.label}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>{t('seller_orders.order_hash', { id: selectedOrder.id })}</p>
                  </div>
                </div>

                {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>{error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', float: 'right' }}>×</button></div>}

                {/* Info banner based on method */}
                <div style={{ backgroundColor: selectedMethod.needsTracking ? '#eff6ff' : '#f0fdf4', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: selectedMethod.needsTracking ? '#1d4ed8' : '#16a34a' }}>
                  ℹ️ {selectedMethod.proofNote}
                </div>

                {/* Tracking number — only if needed */}
                {/* Permanent tracking number — always show, never editable */}
                <div style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{t('seller_orders.tracking_number_permanent_label')}</div>
                  <div style={{ fontSize: 18, fontWeight:800, color: '#f7c948', fontFamily: 'monospace' }}>
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
            <div style={{ fontSize: 16, fontWeight:800, color: '#1e293b', marginBottom: 6 }}>{t('seller_orders.transport_modal_title')}</div>
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
                  color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight:800 }}>
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
