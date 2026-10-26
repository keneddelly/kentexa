import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Celebration from '../components/Celebration';
import { useCart } from '../../context/CartContext';
import api from '../../api/api';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import { DirectPaymentChoice, DirectPaymentSuccess, LipaPaymentStep } from '../components/DirectPayment';
import { usePaymentMode } from '../../utils/paymentMode';
import { Spinner } from '../components/Loading';

// Owner 2026-10-26: no emoji in the order flow; line icons and one spinner.
const B = '#1d4ed8';
const IC = {
  phone: 'M7 3h10v18H7zM11 18h2',
  agent: 'M16 11a4 4 0 10-8 0M4 21a8 8 0 0116 0M12 7a3 3 0 100-6 3 3 0 000 6z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  check: 'M5 12.5l4.5 4.5L19 7',
};
const Icon = ({ d, size = 18, color = '#536471' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const IconCircle = ({ d }) => (
  <span style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <Icon d={d} size={22} color={B} />
  </span>
);
const Radio = ({ on }) => (
  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, boxSizing: 'border-box',
    border: on ? `6px solid ${B}` : '2px solid #cfd9de', backgroundColor: '#fff' }} />
);
const SuccessMark = ({ size = 56 }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
  </span>
);
const PILL = { border: 'none', minHeight: 48, borderRadius: 24, cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#fff', fontFamily: 'inherit' };
const PILL_OUT = { ...PILL, backgroundColor: '#fff', color: '#0f1419', border: '1px solid #cfd9de' };

const NO_LOCATION = { regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' };
// tz_seed place references, the only ones the exact lookup below accepts.
const TZ_PLACE_REF = /^(ward|district|region):([1-9][0-9]{0,8})$/;

const Checkout = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { t } = useTranslation();
  const { cart, clearCart, removeFromCart, updateQuantity, syncStock } = useCart();

  const getItemPrice = (item) => Number(item.displayPrice || item.basePrice || item.price || 0);
  const cartTotal    = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);

  // A cart mixing physical + digital items still needs an address for the
  // physical item(s) — only skip it when every item is digital.
  const isDigitalOnlyCart = cart.length > 0 && cart.every(item => item.productType === 'digital');

  // COD is the seller's explicit per-product choice (never assumed) — the
  // option only appears when every item in the cart allows it. The backend
  // re-checks this independently in OrdersService.create() (never trust a
  // frontend-only gate); this is purely to avoid offering a choice that
  // would fail per-item once submitted.
  const allItemsAllowCod = cart.length > 0 && cart.every(item => item.codEnabled);

  const [form, setForm]                     = useState({ deliveryAddress: '', phone: '', recipientName: '' });
  const [deliveryLocation, setDeliveryLocation] = useState(NO_LOCATION);
  const [placeText, setPlaceText]           = useState('');
  const placePickRef = React.useRef(0);
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [loading, setLoading]               = useState(false);
  const [stockNotice, setStockNotice]       = useState('');
  const [error, setError]                   = useState('');
  const [paymentStep, setPaymentStep]       = useState(false);
  const [placedOrders, setPlacedOrders]     = useState([]);
  const [orderTotal, setOrderTotal]         = useState(0);

  const [showOnlinePayment, setShowOnlinePayment] = useState(false);
  const [payerPhone, setPayerPhone]               = useState('');
  const [paying, setPaying]                       = useState(false);
  const [paymentPending, setPaymentPending]       = useState(false);
  const [paymentSuccess, setPaymentSuccess]       = useState(false);

  // Cash on Delivery — chosen at checkout, before the order is created,
  // since the backend decides upfront/remaining split at creation time.
  const [paymentChoice, setPaymentChoice] = useState('online'); // 'online' | 'cod'
  const [codInfo, setCodInfo]             = useState(null); // { upfront, remaining } once order is placed
  // Live preview of that same split, fetched from the backend's own
  // CodCalculationService (via /orders/cod-quote) so the buyer sees the
  // real upfront/remaining amounts BEFORE placing the order, not only after.
  const [codQuote, setCodQuote]               = useState(null);
  const [codQuoteLoading, setCodQuoteLoading] = useState(false);

  // Release F (MARKETPLACE_PAYMENT_MODE): 'cod_lipa' (default) = the buyer pays
  // the seller directly; the old online payment screens below are used only in
  // 'online' mode. While the mode is loading (null) nothing old is shown.
  const paymentMode = usePaymentMode();
  const directMode = paymentMode !== 'online';
  const [directChoice, setDirectChoice] = useState(null); // 'cod' | 'lipa_namba'
  const [directInfo, setDirectInfo]     = useState({ loading: false, options: [], sameCity: false, lipaNambas: [] });
  const [directDone, setDirectDone]     = useState(null); // { method, total, notices }
  // Lipa Namba: "Lipa na uthibitishe" opens the payment step; the order is
  // created only when the buyer confirms with a screenshot per seller.
  const [lipaStep, setLipaStep]         = useState(false);
  const [lipaQuote, setLipaQuote]       = useState(null);
  const [lipaProofs, setLipaProofs]     = useState({}); // { [sellerId]: { proofId, preview, reference } }
  const [lipaError, setLipaError]       = useState('');
  // Same key on a retry = the server returns the first result, never a second set of orders.
  const checkoutKeyRef = React.useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const [showAgentStep, setShowAgentStep] = useState(false);
  const [nearbyAgents, setNearbyAgents]   = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [copied, setCopied]               = useState(false);
  const [celebrate, setCelebrate]         = useState(false);


  // Pre-fill buyer info from logged-in profile — enter once, get everywhere
  React.useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      recipientName: prev.recipientName || currentUser.name  || '',
      phone:         prev.phone         || currentUser.phone || '',
    }));
    if (currentUser.phone) setPayerPhone(p => p || currentUser.phone);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delivery method detection ─────────────────────────────────
  const [deliveryMethods, setDeliveryMethods]     = useState([]);
  const [selectedMethod, setSelectedMethod]       = useState(null); // 'boda'|'kentexa_delivery'|'agent'
  const [detectingMethods, setDetectingMethods]   = useState(false);
  const [isSameCity, setIsSameCity]               = useState(false);
  const DETECT_DELAY = 500; // ms after user stops typing

  // The backend's own intercity/same-city split for COD purposes is based
  // on the SHIPPING METHOD actually sent with the order ('agent'/'bus'/
  // 'courier' = intercity; see OrdersService.create()'s own comment) —
  // not the separate isSameCity flag above (that only describes whether
  // same-city delivery METHODS exist to offer at all). Mirrors the exact
  // `shippingMethod` fallback handleCheckout() sends below
  // (selectedMethod || (isSameCity ? 'boda' : 'agent')), so this is
  // accurate even before delivery-method detection has resolved —
  // relying on selectedMethod alone left it permanently "same-city" (and
  // showing 0% upfront) until that detection succeeded.
  const chosenShippingMethod = selectedMethod || (isSameCity ? 'boda' : 'agent');
  const isIntercityForCod = ['agent', 'bus', 'courier'].includes(chosenShippingMethod);

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  // ── Detect delivery methods when address changes ─────────────
  const detectDeliveryRef = React.useRef(null);
  const detectDeliveryMethodsFor = (address) => {
    setSelectedMethod(null);
    setDeliveryMethods([]);
    if (detectDeliveryRef.current) clearTimeout(detectDeliveryRef.current);
    if (!address.trim() || address.trim().length < 3 || cart.length === 0) return;
    detectDeliveryRef.current = setTimeout(async () => {
      try {
        setDetectingMethods(true);
        const productId = cart[0]?.id;
        if (!productId) return;
        const res = await api.get(`/orders/delivery-methods?address=${encodeURIComponent(address)}&productId=${productId}`);
        setDeliveryMethods(res.data.methods || []);
        setIsSameCity(res.data.isSameCity || false);
        // Auto-select first method
        if (res.data.methods?.length > 0) {
          setSelectedMethod(res.data.methods[0].key);
        }
      } catch { setDeliveryMethods([]); }
      finally { setDetectingMethods(false); }
    }, DETECT_DELAY);
  };
  const handleAddressChange = (address) => {
    setForm(f => ({ ...f, deliveryAddress: address }));
    detectDeliveryMethodsFor(address);
  };

  // One keyword search (the shipment form's) sets region, district and ward
  // together. The picked place is the only location: its label is the
  // delivery address that is saved, sent and shown. Typing again or picking
  // another place clears the old one first, so nothing stale survives.
  // The search returns names and a placeRef only; the ids come from the
  // exact lookup of that one place.
  const choosePlace = async (loc) => {
    const pick = ++placePickRef.current;
    setDeliveryLocation(NO_LOCATION);
    handleAddressChange('');
    if (!loc) return;
    const ref = loc.placeRef?.providerKey === 'tz_seed' && TZ_PLACE_REF.exec(loc.placeRef.providerPlaceId || '');
    let row = null;
    if (ref) {
      try { row = (await api.get(`/locations/places/${ref[1]}/${ref[2]}`)).data; } catch { row = null; }
    }
    if (pick !== placePickRef.current) return; // a newer pick replaced this one
    if (!row?.regionId) {
      setPlaceText('');
      setError(t('checkout.place_not_found'));
      return;
    }
    const isWard = row.type === 'ward';
    setDeliveryLocation({
      regionId: row.regionId, regionName: row.region || '',
      districtId: row.districtId || null, districtName: row.district || '',
      wardId: isWard ? row.wardId : null, wardName: isWard ? row.ward || '' : '',
    });
    setPlaceText(row.fullAddress);
    setError('');
    handleAddressChange(row.fullAddress);
  };

  // Release F: local delivery options (boda, van, collection) only when the
  // server says the buyer's region is the seller's region (payment-options,
  // by region id; never the typed address). Other region, no region yet, or
  // still checking: hidden, and the order goes as 'agent' with no local fee.
  const deliveryOptionsHidden = directMode && !isDigitalOnlyCart
    && !(deliveryLocation.regionId && !directInfo.loading && directInfo.sameCity);

  const getSelectedMethodData = () => (deliveryOptionsHidden ? null : deliveryMethods.find(m => m.key === selectedMethod) || null);

  const getCartTotal = () => {
    const method = getSelectedMethodData();
    if (!method || deliveryMethods.length === 0) return cartTotal;
    // Price changes based on delivery method:
    // - Dar buyer with boda: basePrice + bodaFee
    // - Dar buyer with van: basePrice + 3000 (flat van fee)
    // - Intercity: basePrice + deliveryFee (product default — unchanged)
    if (method.key === 'agent') return cartTotal; // intercity — use product price as-is
    const baseOnly = cart.reduce((sum, item) => sum + Number(item.basePrice || item.price || 0) * item.quantity, 0);
    return baseOnly + (method.fee || 0);
  };

  // If the cart changes so that COD is no longer offered (e.g. a non-COD
  // item gets added after COD was already selected), fall back to online
  // rather than leaving a hidden/stale 'cod' choice that could still submit.
  React.useEffect(() => {
    if (paymentChoice === 'cod' && !allItemsAllowCod) setPaymentChoice('online');
  }, [allItemsAllowCod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live COD preview — whenever COD is selected, ask the backend for the
  // real upfront/remaining split for the current cart total so it can be
  // shown before the order is placed, not only after.
  React.useEffect(() => {
    if (paymentChoice !== 'cod' || isDigitalOnlyCart || cart.length === 0) { setCodQuote(null); return; }
    const total = getCartTotal();
    if (!total) { setCodQuote(null); return; }
    let cancelled = false;
    setCodQuoteLoading(true);
    api.get('/orders/cod-quote', { params: { totalAmount: total, isIntercity: isIntercityForCod } })
      .then(res => { if (!cancelled) setCodQuote(res.data); })
      .catch(() => { if (!cancelled) setCodQuote(null); })
      .finally(() => { if (!cancelled) setCodQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [paymentChoice, cart, deliveryMethods, selectedMethod, isSameCity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release F: what the server allows for every item in the cart, for the
  // buyer's chosen region (same city = same region; unknown = other city).
  // COD only when the buyer's region equals the seller's region; district
  // matching comes later (NEXT_STEPS.md, Release F).
  const productKey = cart.map((i) => i.id).join(',');
  React.useEffect(() => {
    if (!directMode || cart.length === 0) return undefined;
    let cancelled = false;
    setDirectInfo((d) => ({ ...d, loading: true }));
    const ids = [...new Set(cart.map((i) => i.id))];
    Promise.all(ids.map((productId) => api.get('/orders/payment-options', {
      params: { productId, ...(deliveryLocation.regionId ? { regionId: deliveryLocation.regionId } : {}) },
    }).then((r) => r.data).catch(() => ({ options: [], sameCity: false, lipaNamba: null }))))
      .then((list) => {
        if (cancelled) return;
        const options = ['cod', 'lipa_namba'].filter((o) => list.every((x) => (x.options || []).includes(o)));
        const lipaNambas = [];
        list.forEach((x) => { if (x.lipaNamba?.number && !lipaNambas.some((l) => l.number === x.lipaNamba.number)) lipaNambas.push(x.lipaNamba); });
        setDirectInfo({ loading: false, options, sameCity: list.length > 0 && list.every((x) => x.sameCity), lipaNambas });
        setDirectChoice((c) => (c && options.includes(c) ? c : null));
      });
    return () => { cancelled = true; };
  }, [directMode, productKey, deliveryLocation.regionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stock is checked again on this page: an item that sold out while in the
  // cart is removed and the buyer told which one (a sold-out product answers
  // 404), and a quantity above what is left is lowered.
  const applyStockAnswer = React.useCallback((soldOutIds = [], lowered = []) => {
    const names = cart.filter((i) => soldOutIds.includes(i.id)).map((i) => i.name);
    soldOutIds.forEach((id) => removeFromCart(id));
    lowered.forEach(({ productId, stock }) => syncStock(productId, stock));
    const lines = [];
    if (names.length) lines.push(t('checkout.sold_out_removed', { names: names.join(', ') }));
    lowered.forEach(({ productId, stock }) => {
      const item = cart.find((i) => i.id === productId);
      if (item && item.quantity > stock) lines.push(t('checkout.stock_lowered', { count: stock, name: item.name }));
    });
    if (lines.length) setStockNotice(lines.join(' '));
  }, [cart]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (cart.length === 0) return undefined;
    let cancelled = false;
    Promise.all(cart.map((item) => api.get(`/products/${item.id}`)
      .then((r) => ({ item, stock: Number(r.data?.stock) }))
      .catch((err) => ({ item, stock: err?.response?.status === 404 ? 0 : null }))))
      .then((results) => {
        if (cancelled) return;
        const soldOut = results.filter((r) => r.stock !== null && r.stock <= 0).map((r) => r.item.id);
        const lowered = results
          .filter((r) => r.stock > 0 && r.item.productType !== 'digital' && r.stock !== Number(r.item.stock))
          .map((r) => ({ productId: r.item.id, stock: r.stock }));
        if (soldOut.length || lowered.length) applyStockAnswer(soldOut, lowered);
      });
    return () => { cancelled = true; };
  }, [productKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Removing an item changes what can be shipped and how: reload delivery methods.
  const firstProductId = cart[0]?.id;
  React.useEffect(() => {
    if (form.deliveryAddress) detectDeliveryMethodsFor(form.deliveryAddress);
  }, [firstProductId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The server refused a checkout over stock: drop / lower what it named.
  const handleServerStock = (data) => {
    if (data?.soldOut?.length || data?.shortStock?.length) {
      applyStockAnswer(data.soldOut || [], data.shortStock || []);
      return true;
    }
    return false;
  };

  const checkoutPayload = () => {
    const methodData = getSelectedMethodData();
    return {
      deliveryAddress:  form.deliveryAddress.trim(),
      regionId:         deliveryLocation.regionId || null,
      districtId:       deliveryLocation.districtId || null,
      wardId:           deliveryLocation.wardId || null,
      destinationCity:  deliveryLocation.districtName || deliveryLocation.regionName || null,
      phone:            form.phone.trim(),
      recipientName:    forSomeoneElse ? form.recipientName.trim() : null,
      shippingMethod:   deliveryOptionsHidden ? 'agent' : (selectedMethod || (isSameCity ? 'boda' : 'agent')),
      // Send the actual delivery fee for this method
      // agent = use product default, others = method fee
      ...(methodData && methodData.key !== 'agent' ? { deliveryFee: methodData.fee } : {}),
      paymentMethod: directMode ? directChoice : paymentChoice,
      items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
    };
  };

  // Paid to the seller directly: the whole cart in one request, so each seller gets ONE
  // notice for this checkout. For Lipa Namba this is the moment the orders are created.
  const submitDirectCheckout = async (extra = {}) => {
    const res = await api.post('/orders/checkout', { ...checkoutPayload(), ...extra, checkoutKey: checkoutKeyRef.current });
    const orders = res.data.orders || [];
    setOrderTotal(getCartTotal());
    setPlacedOrders(orders);
    clearCart();
    setDirectDone({
      method: directChoice,
      total: orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
      notices: res.data.sellerNotices || [],
    });
  };

  const openLipaStep = async () => {
    setLipaStep(true);
    setLipaQuote(null);
    setLipaError('');
    try {
      const { items, ...rest } = checkoutPayload();
      const res = await api.post('/orders/checkout/quote', { ...rest, items });
      setLipaQuote(res.data);
    } catch (err) {
      const data = err?.response?.data;
      setLipaStep(false);
      handleServerStock(data);
      setError(data?.message || t('checkout.err_place_orders'));
    }
  };

  const confirmLipa = async () => {
    try {
      setLoading(true);
      setLipaError('');
      await submitDirectCheckout({
        lipaProofs: (lipaQuote?.sellers || []).map((s) => ({
          sellerId: s.sellerId,
          proofId: lipaProofs[s.sellerId]?.proofId,
          ...(lipaProofs[s.sellerId]?.reference?.trim() ? { reference: lipaProofs[s.sellerId].reference.trim() } : {}),
        })),
      });
    } catch (err) {
      const data = err?.response?.data;
      if (handleServerStock(data)) { setLipaStep(false); setError(data.message); }
      else setLipaError(data?.message || t('checkout.err_place_orders'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (directMode && !directChoice) { setError(t('direct_payment.choose_first')); return; }
    if (directMode && !isDigitalOnlyCart && !deliveryLocation.regionId) { setError(t('direct_payment.choose_region')); return; }
    if ((!isDigitalOnlyCart && !form.deliveryAddress.trim()) || !form.phone.trim()) {
      setError(t('checkout.err_fill_address'));
      return;
    }
    if (forSomeoneElse && !form.recipientName.trim()) {
      setError(t('checkout.err_recipient_name'));
      return;
    }
    if (cart.length === 0) { setError(t('checkout.err_cart_empty')); return; }
    setError('');
    // Lipa Namba: no order yet — the payment step comes first.
    if (directMode && directChoice === 'lipa_namba') { openLipaStep(); return; }
    try {
      setLoading(true);
      if (directMode) {
        await submitDirectCheckout();
        return;
      }
      const { items, ...shared } = checkoutPayload();
      const orders = [];
      for (const item of items) {
        const res = await api.post('/orders', { ...shared, productId: item.productId, quantity: item.quantity });
        orders.push(res.data);
      }
      setOrderTotal(getCartTotal());
      setPlacedOrders(orders);
      clearCart();

      const first = orders[0];
      if (first?.paymentMethod === 'cod') {
        const upfront   = Number(first.codUpfrontAmount || 0);
        const remaining = Number(first.codRemainingBalance || 0);
        setCodInfo({ upfront, remaining });
        if (upfront <= 0) {
          // Same-city COD — nothing to pay now, order is already confirmed.
          setPaymentSuccess(true);
        } else {
          setPaymentStep(true);
        }
      } else {
        setPaymentStep(true);
      }
    } catch (err) {
      const data = err?.response?.data;
      handleServerStock(data);
      setError(data?.message || t('checkout.err_place_orders'));
    } finally {
      setLoading(false);
    }
  };

  const handlePayOnline = async () => {
    if (!payerPhone.trim()) { setError(t('checkout.err_enter_phone')); return; }
    try {
      setPaying(true); setError('');
      const firstOrder = placedOrders[0];
      const res = await api.post('/payments/invoice/pay', {
        invoiceNumber: firstOrder?.invoiceNumber || undefined,
        orderId:       firstOrder?.id, // fallback — backend creates/finds the invoice if missing
        phone:         payerPhone.trim(),
        provider:      'selcom',
      });
      setPaymentPending(true);
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setPaymentSuccess(true);
          setPaymentPending(false);
          // Check if this is the user's first order — only celebrate first time
          const isFirstOrder = !localStorage.getItem('kentexa_has_ordered');
          if (isFirstOrder) {
            localStorage.setItem('kentexa_has_ordered', 'true');
            setCelebrate(true);
          }
        } catch {
          setError(t('checkout.err_payment_confirm'));
          setPaymentPending(false);
        }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || t('checkout.err_payment_failed'));
    } finally {
      setPaying(false);
    }
  };

  const handlePayViaAgent = async () => {
    setShowAgentStep(true);
    try {
      setAgentsLoading(true);
      const res = await api.get(`/agents/nearby?region=${encodeURIComponent(deliveryLocation.regionName)}`);
      setNearbyAgents(res.data);
    } catch { setNearbyAgents([]); }
    finally { setAgentsLoading(false); }
  };

  const handleCopyInvoice = (inv) => {
    navigator.clipboard.writeText(inv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Release F: order placed, paid to the seller directly ───────────────────
  if (directDone) {
    return <DirectPaymentSuccess method={directDone.method} total={directDone.total} notices={directDone.notices} onNavigate={onNavigate} />;
  }

  // ── Lipa Namba payment step: pay, upload proof, confirm ─────────────────────
  if (lipaStep) {
    return (
      <LipaPaymentStep
        quote={lipaQuote}
        proofs={lipaProofs}
        onProofChange={(sellerId, patch) => setLipaProofs((p) => ({ ...p, [sellerId]: { ...p[sellerId], ...patch } }))}
        onConfirm={confirmLipa}
        onBack={() => setLipaStep(false)}
        confirming={loading}
        error={lipaError}
      />
    );
  }

  // ── Payment success ───────────────────────────────────────────────────────
  if (paymentSuccess) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9f9' }}>
        {celebrate && <Celebration message={t('checkout.first_order_celebration')} onDone={() => setCelebrate(false)} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '36px 24px', textAlign: 'center', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
            <SuccessMark />
            <h2 style={{ fontSize: 22, fontWeight:800, color: '#1e293b', marginBottom: 8, fontFamily:'inherit' }}>
              {codInfo ? t('checkout.cod_confirmed_title') : t('checkout.payment_confirmed')}
            </h2>
            <p style={{ color: '#64748b', marginBottom: 20, fontSize: 14 }}>
              {codInfo && codInfo.upfront <= 0 ? t('checkout.cod_confirmed_sub') : t('checkout.order_being_prepared')}
            </p>
            <div style={{ backgroundColor: '#ecfdf3', borderRadius: 16, padding: 16, marginBottom: codInfo && codInfo.upfront > 0 ? 10 : 20 }}>
              <div style={{ fontSize: 13, color: '#166534', marginBottom: 4 }}>
                {codInfo ? (codInfo.upfront > 0 ? t('checkout.cod_deposit_paid_label') : t('checkout.cod_pay_on_delivery')) : t('checkout.amount_paid')}
              </div>
              <div style={{ fontSize: 24, fontWeight:800, color: '#0f1419' }}>
                TZS {Number(codInfo ? (codInfo.upfront > 0 ? codInfo.upfront : orderTotal) : orderTotal).toLocaleString()}
              </div>
            </div>
            {codInfo && codInfo.upfront > 0 && (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                {t('checkout.cod_remaining_notice', { amount: Number(codInfo.remaining).toLocaleString() })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onNavigate('MyOrders')} style={{ ...PILL, flex: 1, backgroundColor: B }}>{t('checkout.my_orders_button')}</button>
              <button onClick={() => onNavigate('Home')} style={{ ...PILL_OUT, flex: 1 }}>{t('checkout.home_button')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Agent payment step ────────────────────────────────────────────────────
  if (paymentStep && showAgentStep) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9f9' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => setShowAgentStep(false)} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{t('checkout.pay_agent')}</span>
          </button>
        </div>
        <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #eff3f4', padding: '12px 16px' }}>
          <p style={{ fontSize: 14, color: '#536471', margin: 0, lineHeight: 1.45 }}>{t('checkout.visit_agent_notice')}</p>
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>{t('checkout.invoice_title')}</h3>
            {placedOrders.map((order, i) => (
              <div key={i} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 8, border: '2px dashed #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{t('checkout.invoice_number_label')}</div>
                  <div style={{ fontSize: 15, fontWeight:800, color: '#2563eb', fontFamily: 'monospace', wordBreak: 'break-all' }}>{order.invoiceNumber || order.id}</div>
                  {order.totalAmount && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>TZS {Number(order.totalAmount).toLocaleString()}</div>}
                </div>
                <button onClick={() => handleCopyInvoice(order.invoiceNumber || String(order.id))}
                  style={{ backgroundColor: copied ? '#dcfce7' : '#2563eb', color: copied ? '#16a34a' : '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {copied ? t('checkout.copied', 'Imenakiliwa') : t('checkout.copy_button')}
                </button>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 10px' }}>{t('checkout.nearby_agents_title')}</h3>
            {agentsLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}><Spinner size={16} color={B} /> {t('checkout.finding_agents')}</div>
            ) : nearbyAgents.length === 0 ? (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 14, fontSize: 12, color: '#92400e', textAlign: 'center' }}>
                {t('checkout.no_agents_found')}
              </div>
            ) : nearbyAgents.map(agent => (
              <div key={agent.id} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{agent.fullName}</div>
                <div style={{ fontSize: 13, color: '#536471' }}>{[agent.district, agent.region].filter(Boolean).join(', ') || '—'}</div>
                <a href={`tel:${agent.phone}`} style={{ fontSize: 14, color: B, fontWeight: 600, textDecoration: 'none' }}>{agent.phone}</a>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onNavigate('MyOrders')} style={{ ...PILL_OUT, flex: 1 }}>{t('checkout.my_orders_button')}</button>
            <button onClick={() => onNavigate('Home')} style={{ ...PILL, flex: 1, backgroundColor: B }}>{t('checkout.home_button')}</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment method selection ───────────────────────────────────────────────
  if (paymentStep) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9f9' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{t('checkout.choose_payment_header')}</span>
          </button>
        </div>
        <div style={{ flex: 1, padding: '16px', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

          {/* Success banner */}
          <div style={{ backgroundColor: '#ecfdf3', borderRadius: 16, padding: '18px 16px', textAlign: 'center', marginBottom: 16, border: '1px solid #bbf7d0' }}>
            <SuccessMark size={44} />
            <h2 style={{ fontSize: 18, fontWeight:800, color: '#15803d', margin: '0 0 4px', fontFamily:'inherit' }}>{t('checkout.order_placed')}</h2>
            <p style={{ color: '#166534', fontSize: 13, margin: '0 0 8px' }}>
              {codInfo ? t('checkout.cod_upfront_notice') : t('checkout.order_placed_sub')}
            </p>
            <div style={{ fontSize: 18, fontWeight:800, color: '#15803d' }}>
              TZS {Number(codInfo ? codInfo.upfront : orderTotal).toLocaleString()}
            </div>
            {codInfo && (
              <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>
                {t('checkout.cod_remaining_notice', { amount: Number(codInfo.remaining).toLocaleString() })}
              </div>
            )}
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
            </div>
          )}

          {/* Online payment */}
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, border: '2px solid #16a34a',  }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: showOnlinePayment ? 14 : 0 }}>
              <IconCircle d={IC.phone} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46' }}>{t('checkout.pay_online')}</div>
                <div style={{ fontSize: 12, color: '#047857' }}>{t('checkout.pay_online_sub')}</div>
              </div>
              {!showOnlinePayment && (
                <button onClick={() => setShowOnlinePayment(true)}
                  style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                  {t('checkout.select_button')}
                </button>
              )}
            </div>
            {showOnlinePayment && !paymentPending && (
              <>
                <input type="tel" placeholder="255712345678" value={payerPhone}
                  onChange={e => setPayerPhone(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowOnlinePayment(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('checkout.cancel')}</button>
                  <button onClick={handlePayOnline} disabled={paying || !payerPhone.trim()}
                    style={{ flex: 2, background: paying || !payerPhone.trim() ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)', color: paying || !payerPhone.trim() ? '#94a3b8' : '#fff', border: 'none', padding: 11, borderRadius: 8, cursor: paying || !payerPhone.trim() ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {paying ? t('checkout.sending') : t('checkout.pay_button', { amount: Number(codInfo ? codInfo.upfront : orderTotal).toLocaleString() })}
                  </button>
                </div>
              </>
            )}
            {paymentPending && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ marginBottom: 10 }}><Spinner size={28} color={B} /></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{t('checkout.check_phone')}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t('checkout.enter_pin')}</div>
              </div>
            )}
          </div>

          {/* Agent payment — not offered for COD orders (agent-assisted cash
              is redundant with the pay-on-delivery flow already chosen) */}
          {!codInfo && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, border: '2px solid #2563eb',  }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconCircle d={IC.agent} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8' }}>{t('checkout.pay_agent')}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t('checkout.pay_agent_sub')}</div>
              </div>
              <button onClick={handlePayViaAgent}
                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                {t('checkout.select_button')}
              </button>
            </div>
          </div>
          )}

          <button onClick={() => onNavigate('MyOrders')}
            style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {t('checkout.view_orders')}
          </button>
        </div>
      </div>
    );
  }

  // ── Main checkout form ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f7f9f9' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{t('checkout.title')}</span>
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Cart Items */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>{t('checkout.items_title', { count: cart.length })}</h3>
          {stockNotice && (
            <div role="alert" data-testid="stock-notice" style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 13, lineHeight: 1.45 }}>
              {stockNotice}
            </div>
          )}
          {cart.map(item => {
            // A quantity control only where the cart allows one (physical items, more than one in stock).
            const canChangeQty = item.productType !== 'digital' && Number(item.stock) > 1;
            const stepBtn = (disabled) => ({ width: 40, height: 40, borderRadius: 10, border: '1px solid #cbd5e1', backgroundColor: '#fff',
              fontSize: 18, fontWeight: 800, color: disabled ? '#cbd5e1' : '#1e293b', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 });
            return (
            <div key={item.id} data-testid="checkout-item" style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.images?.[0] ? <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon d={IC.box} size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{t('checkout.qty_label', { count: item.quantity })}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', flexShrink: 0 }}>
                  TZS {(getItemPrice(item) * item.quantity).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 54 }}>
                {canChangeQty && (
                  <>
                    <button type="button" aria-label={t('checkout.qty_less')} data-testid={`qty-less-${item.id}`} disabled={item.quantity <= 1}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)} style={stepBtn(item.quantity <= 1)}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: 800 }}>{item.quantity}</span>
                    <button type="button" aria-label={t('checkout.qty_more')} data-testid={`qty-more-${item.id}`} disabled={item.quantity >= Number(item.stock)}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)} style={stepBtn(item.quantity >= Number(item.stock))}>+</button>
                  </>
                )}
                <button type="button" data-testid={`remove-${item.id}`} onClick={() => removeFromCart(item.id)}
                  style={{ marginLeft: 'auto', minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #fecaca', backgroundColor: '#fff',
                    color: '#b91c1c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {t('checkout.remove_item')}
                </button>
              </div>
            </div>
            );
          })}
        </div>

        {/* Who is this for? */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#0f1419', color: '#fff', fontSize: 12, fontWeight:800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span> {t('checkout.who_for_title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { value: false, label: t('checkout.for_myself') },
              { value: true,  label: t('checkout.for_someone_else') },
            ].map(opt => (
              <button key={String(opt.value)} onClick={() => setForSomeoneElse(opt.value)}
                style={{ padding: 12, borderRadius: 10, cursor: 'pointer', border: forSomeoneElse === opt.value ? '2px solid #2563eb' : '2px solid #e2e8f0', backgroundColor: forSomeoneElse === opt.value ? '#eff6ff' : '#fff', fontWeight: 700, fontSize: 13, color: forSomeoneElse === opt.value ? '#1d4ed8' : '#64748b' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {forSomeoneElse && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>{t('checkout.recipient_name')} *</label>
              <input placeholder="e.g. Asha Mwakasege" value={form.recipientName}
                onChange={e => setForm({ ...form, recipientName: e.target.value })}
                style={inputStyle} />
              <div style={{ fontSize: 13, color: '#536471', marginTop: 4 }}>{t('checkout.gift_hint')}</div>
            </div>
          )}
        </div>

        {/* Delivery Details */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#0f1419', color: '#fff', fontSize: 12, fontWeight:800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span> {isDigitalOnlyCart ? t('checkout.contact_info') : t('checkout.delivery_address')}</h2>
          {isDigitalOnlyCart ? (
            <div style={{ backgroundColor: '#faf5ff', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
              {t('checkout.digital_instant_delivery')}
            </div>
          ) : (
            <IntelligentLocationInput
              label={t('checkout.place_label')}
              value={placeText}
              onTextChange={setPlaceText}
              onResolved={choosePlace}
              placeholder={t('checkout.place_placeholder')}
              required
            />
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
              {forSomeoneElse ? t('checkout.recipient_phone') : t('checkout.your_phone')}
            </label>
            <input type="tel" placeholder="255712345678" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              style={inputStyle} />
          </div>
        </div>

        {/* Delivery Method Selector — shown when address is filled */}
        {!isDigitalOnlyCart && !deliveryOptionsHidden && (detectingMethods || deliveryMethods.length > 0) && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#0f1419', color: '#fff', fontSize: 12, fontWeight:800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span> {t('checkout.delivery_method_title')}</h2>

            {detectingMethods ? (
              <div style={{ textAlign: 'center', padding: '14px 0', color: '#64748b', fontSize: 13 }}>
                <Spinner size={16} color={B} /> {t('checkout.detecting_methods')}
              </div>
            ) : (
              <>
                {isSameCity && (
                  <div style={{ backgroundColor: '#dcfce7', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#166534', fontWeight: 600 }}>
                    {t('checkout.same_city_notice')}
                  </div>
                )}
                {!isSameCity && deliveryMethods.length > 0 && (
                  <div style={{ backgroundColor: '#dbeafe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                    {t('checkout.diff_city_notice')}
                  </div>
                )}

                {deliveryMethods.map(method => (
                  <button key={method.key}
                    onClick={() => setSelectedMethod(method.key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', marginBottom: 10, borderRadius: 12, cursor: 'pointer',
                      border: selectedMethod === method.key ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                      backgroundColor: selectedMethod === method.key ? '#eff6ff' : '#fff',
                      textAlign: 'left',
                    }}>
                                        <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: selectedMethod === method.key ? '#1d4ed8' : '#1e293b' }}>
                        {method.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{method.desc}</div>
                      {method.key === 'kentexa_delivery' && (
                        <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, marginTop: 3 }}>
                          Kata: {method.cutoffTime} · Inafika: {method.estimatedArrival}
                        </div>
                      )}
                      {method.key === 'agent' && method.estimatedDays && (
                        <div style={{ marginTop: 6 }}>
                          {method.transitCity ? (
                            <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#92400e', marginBottom: 4 }}>
                              {t('checkout.via_transit')} <strong>{method.transitCity}</strong>
                              {method.leg1Days && method.leg2Days && (
                                <span> {t('checkout.days_suffix', { leg1: method.leg1Days, leg2: method.leg2Days })}</span>
                              )}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                            {t('checkout.expected_days', { days: method.estimatedDays })}
                            {method.expectedArrival && (
                              <span style={{ fontWeight: 500, color: '#64748b' }}>
                                {' '}· {new Date(method.expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight:800, color: method.fee === 0 && method.key !== 'boda' ? '#16a34a' : '#1d4ed8' }}>
                        {method.key === 'boda' && method.fee === 0
                          ? <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{t('checkout.seller_sets_price')}</span>
                          : method.fee === 0
                            ? t('cart.free')
                            : `TZS ${Number(method.fee).toLocaleString()}`
                        }
                      </div>
                      {selectedMethod === method.key && (
                        <Icon d={IC.check} size={20} color={B} />
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Release F: in cod_lipa mode the buyer pays the seller directly. */}
        {directMode && paymentMode && (
          <DirectPaymentChoice
            loading={directInfo.loading}
            options={directInfo.options}
            sameCity={directInfo.sameCity}
            regionChosen={!!deliveryLocation.regionId}
            digital={isDigitalOnlyCart}
            choice={directChoice}
            onChoose={setDirectChoice}
          />
        )}

        {/* Payment Method — chosen before order creation since the backend
            decides the upfront/remaining split (COD) at creation time */}
        {!directMode && !isDigitalOnlyCart && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>{t('checkout.payment_method_title')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div onClick={() => setPaymentChoice('online')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  backgroundColor: paymentChoice === 'online' ? '#f0fdf4' : '#f8fafc',
                  border: `2px solid ${paymentChoice === 'online' ? '#16a34a' : '#e2e8f0'}` }}>
                <Radio on={paymentChoice === 'online'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: paymentChoice === 'online' ? '#15803d' : '#1e293b' }}>{t('checkout.pm_online')}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t('checkout.pm_online_sub')}</div>
                </div>
                
              </div>
              {allItemsAllowCod ? (
                <div onClick={() => setPaymentChoice('cod')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    backgroundColor: paymentChoice === 'cod' ? '#eff6ff' : '#f8fafc',
                    border: `2px solid ${paymentChoice === 'cod' ? '#1d4ed8' : '#e2e8f0'}` }}>
                  <Radio on={paymentChoice === 'cod'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: paymentChoice === 'cod' ? '#1d4ed8' : '#1e293b' }}>{t('checkout.pm_cod')}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {isIntercityForCod ? t('checkout.pm_cod_sub_intercity') : t('checkout.pm_cod_sub_samecity')}
                    </div>
                  </div>
                  
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 4px' }}>
                  {t('checkout.pm_cod_not_offered')}
                </div>
              )}

              {paymentChoice === 'cod' && allItemsAllowCod && (
                codQuoteLoading ? (
                  <div style={{ fontSize: 13, color: '#536471', padding: '4px 4px', display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={14} color={B} />{t('checkout.cod_calculating')}</div>
                ) : codQuote && codQuote.eligible === false ? (
                  <div style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                    {codQuote.message}
                  </div>
                ) : codQuote ? (
                  <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #bfdbfe' }}>
                    {Number(codQuote.upfrontRequired) > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#1d4ed8', fontWeight: 700 }}>{t('checkout.cod_pay_now_label')}</span>
                          <span style={{ fontWeight:800, color: '#1d4ed8' }}>TZS {Number(codQuote.upfrontRequired).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: '#64748b' }}>{t('checkout.cod_pay_later_label')}</span>
                          <span style={{ fontWeight: 700, color: '#64748b' }}>TZS {Number(codQuote.remainingBalance).toLocaleString()}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#1d4ed8', fontWeight: 700 }}>{t('checkout.cod_pay_later_label')}</span>
                        <span style={{ fontWeight:800, color: '#1d4ed8' }}>TZS {Number(codQuote.remainingBalance).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* Summary + Place Order */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, border: '1px solid #eff3f4', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: '#64748b' }}>{t('cart.subtotal')}</span>
            <span style={{ fontWeight: 600 }}>TZS {deliveryMethods.length > 0 ? cart.reduce((s,i)=>s+Number(i.basePrice||i.price||0)*i.quantity,0).toLocaleString() : cartTotal.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
            <span style={{ color: '#64748b' }}>{t('checkout.delivery')}</span>
            {getSelectedMethodData() && getSelectedMethodData().key !== 'agent' ? (
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                TZS {Number(getSelectedMethodData().fee || 0).toLocaleString()}
                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>({getSelectedMethodData().label})</span>
              </span>
            ) : (
              <span style={{ fontWeight: 700, color: '#16a34a' }}>{t('checkout.delivery_included')}</span>
            )}
          </div>

          {/* ETA confirmation for intercity agent orders */}
          {getSelectedMethodData()?.key === 'agent' && getSelectedMethodData()?.estimatedDays && (
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>{t('checkout.delivery_info_title')}</div>
              {getSelectedMethodData().transitCity && (
                <div style={{ fontSize: 11, color: '#92400e', backgroundColor: '#fef9c3', borderRadius: 6, padding: '4px 8px', marginBottom: 6 }}>
                  {t('checkout.via_transit')} <strong>{getSelectedMethodData().transitCity}</strong>
                  {getSelectedMethodData().leg1Days && getSelectedMethodData().leg2Days && (
                    <span> ({t('checkout.days_suffix', { leg1: getSelectedMethodData().leg1Days, leg2: getSelectedMethodData().leg2Days })})</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>{t('checkout.delivery_time_label')}</span>
                <span style={{ fontWeight: 700, color: '#15803d' }}>{t('checkout.expected_days', { days: getSelectedMethodData().estimatedDays })}</span>
              </div>
              {getSelectedMethodData().expectedArrival && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 3 }}>
                  <span style={{ color: '#64748b' }}>{t('checkout.expected_arrival_label')}</span>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                    {new Date(getSelectedMethodData().expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Online (or COD not yet resolved): the big number is what gets
              charged right now, same as before. */}
          {(paymentChoice !== 'cod' || !codQuote || codQuote.eligible === false) && (
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{t('checkout.total')}</span>
              <span data-testid="checkout-total" style={{ fontSize: 22, fontWeight:800, color: '#2563eb' }}>TZS {getCartTotal().toLocaleString()}</span>
            </div>
          )}
          {paymentChoice === 'cod' && codQuoteLoading && (
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, textAlign: 'center', fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
              <Spinner size={14} color={B} /> {t('checkout.cod_calculating')}
            </div>
          )}
          {/* COD, intercity (upfront > 0): the amount charged right now is
              the deposit, NOT the order total — that must be the prominent
              number, since that's what the buyer is about to be asked to
              pay before the order is even placed. */}
          {paymentChoice === 'cod' && codQuote && codQuote.eligible !== false && Number(codQuote.upfrontRequired) > 0 && (
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{t('checkout.cod_pay_now_label')}</span>
                <span style={{ fontSize: 22, fontWeight:800, color: '#1d4ed8' }}>TZS {Number(codQuote.upfrontRequired).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                <span>{t('checkout.total')}</span>
                <span>TZS {getCartTotal().toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                <span>{t('checkout.cod_pay_later_label')}</span>
                <span>TZS {Number(codQuote.remainingBalance).toLocaleString()}</span>
              </div>
            </div>
          )}
          {/* COD, same-city (upfront = 0): nothing charged now — make that
              explicit rather than showing the total as if it's due today. */}
          {paymentChoice === 'cod' && codQuote && codQuote.eligible !== false && Number(codQuote.upfrontRequired) === 0 && (
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{t('checkout.cod_pay_now_label')}</span>
                <span style={{ fontSize: 22, fontWeight:800, color: '#16a34a' }}>TZS 0</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748b' }}>{t('checkout.cod_pay_later_label')} (100%)</span>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>TZS {Number(codQuote.remainingBalance).toLocaleString()}</span>
              </div>
            </div>
          )}
          {directMode ? (() => {
            const blocked = loading || cart.length === 0 || !paymentMode || directInfo.loading || !directChoice || !directInfo.options.includes(directChoice);
            return (
              <>
                <button data-testid="place-order" onClick={handleCheckout} disabled={blocked}
                  style={{ width: '100%', minHeight: 52, backgroundColor: blocked ? '#93c5fd' : B, color: '#fff', border: 'none', borderRadius: 26, cursor: blocked ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 800, marginBottom: 10, fontFamily:'inherit' }}>
                  {directChoice === 'lipa_namba'
                    ? t('direct_payment.pay_and_confirm')
                    : loading ? t('checkout.placing') : t('checkout.place_order')}
                </button>
                <div style={{ textAlign: 'center', fontSize: 12, color: '#475569' }}>{t('direct_payment.kentexa_note')}</div>
              </>
            );
          })() : (
            <>
              <button onClick={handleCheckout}
                disabled={loading || cart.length === 0 || (paymentChoice === 'cod' && codQuote?.eligible === false)}
                style={{ width: '100%', background: (loading || (paymentChoice === 'cod' && codQuote?.eligible === false)) ? '#93c5fd' : B, color: '#fff', border: 'none', minHeight: 52, borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: (loading || cart.length === 0 || (paymentChoice === 'cod' && codQuote?.eligible === false)) ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, marginBottom: 10, fontFamily:'inherit' }}>
                {loading ? <><Spinner size={18} color="#fff" /> {t('checkout.placing')}</> : t('checkout.place_order')}
              </button>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>{t('cart.secure_note')}</div>
            </>
          )}
        </div>
        <div style={{ height: 90 }} />
      </div>
    </div>
  );
};

export default Checkout;