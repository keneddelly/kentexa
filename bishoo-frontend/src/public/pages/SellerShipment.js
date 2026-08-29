/**
 * SellerShipment.js — Unified seller manual order form
 *
 * Two-stage flow:
 * STAGE 1 (seller, at creation):
 *   Pick item → buyer details → transport METHOD → pickup agent OR self drop-off
 *   Tracking activates immediately — no upfront per-order payment. The
 *   backend applies the same founding-pilot billing model as Super Agents:
 *   first 50 manual shipments free, then billed per-order to the seller's
 *   own account balance (SellerProfile.outstandingBalance).
 *
 * STAGE 2 (agent, after pickup):
 *   Agent collects → takes to bus/hub → fills ticket/ref details → tracking updates
 *
 * Bus ticket, courier ref etc. are NOT asked at creation —
 * seller doesn't have them yet. Agent fills after reaching bus office/hub.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';


const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};

const Field = ({ label, required, hint, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
  </div>
);

const SectionTitle = ({ icon, title, subtitle }) => (
  <div style={{ margin: '20px 0 12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{title}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: '#f1f5f9' }} />
    </div>
    {subtitle && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, marginLeft: 24 }}>{subtitle}</div>}
  </div>
);

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

const SellerShipment = ({ onNavigate, isLoggedIn, onLogout, prefill = null, currentUser, activeProfileId }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'sw-TZ';
  const [products, setProducts]       = useState([]);
  const [classifieds, setClassifieds] = useState([]);
  const [sellerCity, setSellerCity]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');
  const [routeInfo, setRouteInfo]     = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [isSameCity, setIsSameCity]   = useState(false);
  const [destLocation, setDestLocation]     = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [priceEstimate, setPriceEstimate]   = useState(null);
  const [priceLoading, setPriceLoading]     = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [shippingEst, setShippingEst] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [estLoading, setEstLoading]   = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [agentsLoading, setAgentsLoading]     = useState(false);
  const [selectedAgent, setSelectedAgent]     = useState(null);
  const [jobPosted, setJobPosted]             = useState(false);

  // Item: 'product' | 'classified' | 'text'
  // ── Multi-item cart ────────────────────────────────────────────────────────
  const [items, setItems]                     = useState([]);
  const [addMode, setAddMode]                 = useState('product');
  const [addText, setAddText]                 = useState('');
  const [addQty, setAddQty]                   = useState(1);
  const [addPrice, setAddPrice]               = useState('');
  const [addWeight, setAddWeight]             = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedClassified, setSelectedClassified] = useState(null);
  const [newClassifiedTitle, setNewClassifiedTitle] = useState('');
  const [showAddItem, setShowAddItem]         = useState(true);

  const [form, setForm] = useState({
    recipientName: '', recipientPhone: '',
    destinationCity: '', deliveryAddress: '',
    weightKg: '', parcelSize: 'small',
    // The customer who actually paid — not always the recipient (e.g.
    // someone paying for a gift shipped to a different person). Defaults
    // to the recipient when left blank; buyerDiffersFromRecipient just
    // controls whether the separate fields are shown.
    buyerDiffersFromRecipient: false,
    buyerName: '', buyerPhone: '',
    paymentMethod: 'cash',
    // Cash on Delivery — buyer hasn't (fully) paid yet; the Super Agent
    // collects the remaining balance at delivery, same COD engine used by
    // online orders, Manual Sale, and classified invoices.
    isCod: false,
    codAmountPaid: '0',
    // Shipping — all required per method
    transportMethod: 'super_agent',
    superAgentNote: '',      // confirmation seller has/will hand to hub
    busCompany: '', busTicketNumber: '', busDeparture: '',
    courierName: '', courierTrackingRef: '',
    bodaNote: '',            // same-city: notes for boda rider
    notes: '',
  });

  // Auto-fill from logged-in seller profile (their own info for sender fields)
  React.useEffect(() => {
    if (!currentUser) return;
    // Only prefill if no customer prefill already set these
    if (!prefill?.phone) {
      // Seller's phone is useful for contact/pickup info
    }
  }, [currentUser, prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill form from customer data passed via navigation
  useEffect(() => {
    if (!prefill) return;
    setForm(prev => ({
      ...prev,
      recipientName:   prefill.name    || prev.recipientName,
      recipientPhone:  prefill.phone   || prev.recipientPhone,
      deliveryAddress: prefill.address || prev.deliveryAddress,
    }));
    // Pre-set the full destination location cascade — using the *Id fields
    // (not just names) is what makes LocationPicker actually render this as
    // already-selected instead of asking the seller to pick it again for a
    // customer whose location we already captured (e.g. via SellerCustomers).
    if (prefill.regionId || prefill.district || prefill.region) {
      setDestLocation(prev => ({
        ...prev,
        regionId:     prefill.regionId   ?? prev.regionId,
        regionName:   prefill.region     || prev.regionName,
        districtId:   prefill.districtId ?? prev.districtId,
        districtName: prefill.district   || prev.districtName,
        wardId:       prefill.wardId     ?? prev.wardId,
        wardName:     prefill.ward       || prev.wardName,
      }));
    }
    // Coming from a completed POS/Manual sale ("Ship It") — seed the cart
    // with what was actually sold instead of asking the seller to retype
    // it, and skip straight past the "add item" step since the cart is
    // already populated.
    if (prefill.items?.length > 0) {
      setItems(prefill.items.map((i, idx) => ({
        id: Date.now() + idx,
        name: i.name, qty: i.qty, price: i.price, weight: i.weight || 0,
        source: i.source || 'product',
        productId: i.productId || null,
        classifiedId: i.classifiedId || null,
      })));
      setShowAddItem(false);
    }
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    loadData();
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      // Scoped to the active profile — see SellerProducts.js's identical fix
      // (profile-architecture-audit-2026-08).
      const profileScopeParams = activeProfileId ? { commerceProfileId: activeProfileId } : {};
      const [profileRes, productsRes, classifiedsRes] = await Promise.all([
        api.get('/store/profile').catch(() => null),
        api.get('/products/my/products', { params: profileScopeParams }).catch(() => ({ data: [] })),
        api.get('/classifieds/user/mine', { params: profileScopeParams }).catch(() => ({ data: [] })),
      ]);
      const loc = profileRes?.data?.businessLocation || 'Dar es Salaam';
      setSellerCity(loc.split(',')[0].trim());
      setProducts(productsRes.data || []);
      setClassifieds(classifiedsRes.data || []);
    } catch {}
  };

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // Nearby Super Agent hubs for the chosen destination — previously the
  // "Super Agent" transport option only showed generic reassurance text,
  // with no way to actually see or choose which hub would handle it. The
  // seller's pick (if any) is sent as destinationSuperAgentId; leaving it
  // unset falls back to the same auto-match-by-city behavior as before.
  const [nearbyHubs, setNearbyHubs] = useState([]);
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState(null);

  const fetchNearbyHubs = useCallback(async (city) => {
    if (!city) { setNearbyHubs([]); return; }
    try {
      setLoadingHubs(true);
      const res = await api.get(`/super-agents/hubs/${encodeURIComponent(city)}`);
      setNearbyHubs(res.data || []);
      setSelectedHubId(res.data?.length === 1 ? res.data[0].id : null);
    } catch { setNearbyHubs([]); setSelectedHubId(null); }
    finally { setLoadingHubs(false); }
  }, []);

  const lookupRoute = useCallback(async (dest) => {
    if (!dest) { setRouteInfo(null); setIsSameCity(false); return; }
    const same = dest.toLowerCase() === (sellerCity || '').toLowerCase();
    setIsSameCity(same);
    if (same) { setRouteInfo(null); return; }
    try {
      setRouteLoading(true);
      const res = await api.get(
        `/super-agents/route/${encodeURIComponent(sellerCity || 'Dar es Salaam')}/${encodeURIComponent(dest)}`
      );
      setRouteInfo(res.data || null);
    } catch { setRouteInfo(null); }
    finally { setRouteLoading(false); }
  }, [sellerCity]);


  const fetchPriceEstimate = async (destCity, destDistrictId, destDistrictName, weightKg) => {
    if (!destCity) return;
    try {
      setPriceLoading(true);
      const params = new URLSearchParams({
        from:   sellerCity || 'Dar es Salaam',
        to:     destCity,
        weight: String(weightKg || form.weightKg || 1),
        ...(destDistrictId   ? { destDistrictId: String(destDistrictId)   } : {}),
        ...(destDistrictName ? { destDistrict:   destDistrictName         } : {}),
      });
      const res = await api.get(`/pricing/estimate?${params}`);
      setPriceEstimate(res.data);
    } catch { setPriceEstimate(null); }
    finally { setPriceLoading(false); }
  };

  const handleCityChange = (city) => {
    set('destinationCity', city);
    set('transportMethod', 'super_agent'); // reset on city change
    lookupRoute(city);
    fetchNearbyHubs(city);
  };

  // Drive the same city-change logic the LocationPicker itself would once we
  // know both the prefilled customer destination AND the seller's own city
  // (needed for the same-city/route lookup) — otherwise the destination
  // looks pre-selected but the route/pricing info behind it was never
  // computed, which just moves the "asks again" problem one step later.
  useEffect(() => {
    if (!prefill || !sellerCity || form.destinationCity) return;
    const city = prefill.district || prefill.region;
    if (city) handleCityChange(city);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, sellerCity]);

  // eslint-disable-next-line no-unused-vars
  const lookupEstimate = async (dest, weight) => {
    const kg = parseFloat(weight) || 0;
    if (!kg || !sellerCity) { setShippingEst(null); return; }
    try {
      setEstLoading(true);
      if (!dest || dest.toLowerCase() === sellerCity.toLowerCase()) {
        // Same city — estimate from origin rates
        const res = await api.get(`/super-agents/estimate-shipping?originCity=${encodeURIComponent(sellerCity)}&weightKg=${kg}`);
        setShippingEst(res.data?.available ? { type: 'range', min: res.data.min, max: res.data.max, suggested: res.data.suggested } : null);
      } else {
        // Intercity — specific route calculation
        const res = await api.get(`/super-agents/calculate-shipping?origin=${encodeURIComponent(sellerCity)}&destination=${encodeURIComponent(dest)}&weight=${kg}`);
        setShippingEst(res.data?.available ? { type: 'specific', cost: res.data.shippingCost, ratePerKg: res.data.ratePerKg } : null);
      }
    } catch { setShippingEst(null); }
    finally { setEstLoading(false); }
  };

  const getDescription = () => {
    if (items.length === 0) return '';
    if (items.length === 1) return `${items[0].name}${items[0].qty > 1 ? ` x${items[0].qty}` : ''}`;
    return items.map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ');
  };

  const getTotalValue = () => items.reduce((s, i) => s + (Number(i.price || 0) * Number(i.qty || 1)), 0);
  const getTotalWeight = () => items.reduce((s, i) => s + (Number(i.weight || 0) * Number(i.qty || 1)), 0);

  const addItem = (name, price, source, productId, classifiedId, weight) => {
    const newItem = {
      id:           Date.now(),
      name:         name.trim(),
      qty:          Number(addQty) || 1,
      price:        Number(price) || 0,
      weight:       Number(weight || addWeight) || 0,
      source,       // 'product' | 'classified' | 'text'
      productId:    productId || null,
      classifiedId: classifiedId || null,
    };
    setItems(prev => [...prev, newItem]);
    setAddText(''); setAddQty(1); setAddPrice(''); setAddWeight('');
    setSelectedProduct(null); setSelectedClassified(null);
    setNewClassifiedTitle('');
    setShowAddItem(false);
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const updateQty  = (id, qty) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, qty) } : i));

  const getExpectedArrival = () => {
    const days = isSameCity ? 1 : (routeInfo?.estimatedDays);
    if (!days) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const validate = () => {
    if (items.length === 0)            return t('seller_shipment.validate_add_item');
    // Thamani ya Mzigo — every shipment needs a real declared goods value;
    // the backend now rejects a zero total too (a free-text item with no
    // price typed in was the one way this UI already allowed reaching
    // zero even with items present), so this catches it here with a
    // clearer message instead of a raw 400 at submit.
    if (getTotalValue() <= 0)          return t('seller_shipment.validate_value_required');
    if (!form.recipientName.trim())    return t('seller_shipment.validate_recipient_name');
    if (!form.recipientPhone.trim())   return t('seller_shipment.validate_recipient_phone');
    if (form.buyerDiffersFromRecipient && !form.buyerName.trim())  return t('seller_shipment.validate_payer_name');
    if (form.buyerDiffersFromRecipient && !form.buyerPhone.trim()) return t('seller_shipment.validate_payer_phone');
    if (!form.destinationCity)         return t('seller_shipment.validate_destination');
    if (!form.deliveryAddress.trim())  return t('seller_shipment.validate_address');
    // Shipping validation — required for tracking to work
    if (isSameCity) {
      // boda/local — just need address (already validated above)
    }
    // Bus/courier details filled by agent after pickup — not required at creation
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true); setError('');

      // Save new classified draft if creating inline
      let classifiedId = selectedClassified?.id || null;
      if (items.some(i => i.source === 'classified' && !i.classifiedId) && newClassifiedTitle) {
        try {
          const res = await api.post('/classifieds', {
            title: newClassifiedTitle, status: 'draft', location: sellerCity,
          });
          classifiedId = res.data?.id || null;
        } catch {}
      }

      const itemsWithClassifiedId = items.map(i =>
        i.source === 'classified' && !i.classifiedId && classifiedId
          ? { ...i, classifiedId }
          : i
      );

      const res = await api.post('/super-agents/shipments', {
        classifiedId:    classifiedId || itemsWithClassifiedId.find(i => i.classifiedId)?.classifiedId || null,
        description:     getDescription(),
        items:           itemsWithClassifiedId.map(i => ({ name: i.name, qty: i.qty, price: i.price, weight: i.weight, productId: i.productId, classifiedId: i.classifiedId })),
        weightKg:        getTotalWeight() || (form.weightKg ? Number(form.weightKg) : undefined),
        parcelSize:      form.parcelSize,
        recipientName:   form.recipientName.trim(),
        recipientPhone:  form.recipientPhone.trim(),
        destinationCity: form.destinationCity,
        deliveryAddress: form.deliveryAddress.trim(),
        regionId:        destLocation.regionId   || null,
        regionName:      destLocation.regionName || null,
        districtId:      destLocation.districtId   || null,
        districtName:    destLocation.districtName || null,
        wardId:          destLocation.wardId   || null,
        wardName:        destLocation.wardName || null,
        originCity:      sellerCity || 'Dar es Salaam',
        transportMethod: isSameCity ? 'boda' : form.transportMethod,
        destinationSuperAgentId: (!isSameCity && form.transportMethod === 'super_agent') ? (selectedHubId || undefined) : undefined,
        busCompany:         form.busCompany      || null,
        busTicketNumber:    form.busTicketNumber  || null,
        busDeparture:       form.busDeparture     || null,
        courierName:        form.courierName      || null,
        courierTrackingRef: form.courierTrackingRef || null,
        notes:      [form.notes, form.superAgentNote, form.bodaNote].filter(Boolean).join(' | ') || null,
        totalValue: getTotalValue() || null,
        commerceProfileId: activeProfileId || undefined,
        buyerName:  form.buyerDiffersFromRecipient ? form.buyerName.trim()  || undefined : undefined,
        buyerPhone: form.buyerDiffersFromRecipient ? form.buyerPhone.trim() || undefined : undefined,
        paymentMethod: form.paymentMethod,
        // Set only when this continues an already-paid POS/Manual sale
        // ("Ship It") — the backend skips re-collecting payment for it.
        saleId: prefill?.saleId || undefined,
        // Cash on Delivery declared directly on this form (ignored by the
        // backend when saleId is set — that Sale's own isCod is authoritative).
        isCod: !prefill?.saleId && form.isCod ? true : undefined,
        codAmountPaid: !prefill?.saleId && form.isCod ? (Number(form.codAmountPaid) || 0) : undefined,
      });
      setResult(res.data);
      // Tracking is active immediately — no separate upfront fee payment
      // gates this anymore (see backend billing model: first 50 manual
      // shipments free, then billed per-order to the seller's own account
      // balance, same as Super Agents). Load available agents right away.
      try {
        setAgentsLoading(true);
        const agRes = await api.get(
          `/agents/available?city=${encodeURIComponent(sellerCity)}&weight=${form.weightKg || 5}`
        );
        setAvailableAgents(agRes.data || []);
      } catch { setAvailableAgents([]); }
      finally { setAgentsLoading(false); }
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_shipment.create_order_failed'));
    } finally { setLoading(false); }
  };

  const handleNew = () => {
    setResult(null); setRouteInfo(null);
    setSelectedProduct(null); setSelectedClassified(null);
    setItems([]); setAddText(''); setAddPrice(''); setAddWeight(''); setAddQty(1);
    setNewClassifiedTitle(''); setShowAddItem(true); setIsSameCity(false);
    setForm({ recipientName: '', recipientPhone: '', destinationCity: '', deliveryAddress: '',
      weightKg: '', parcelSize: 'small',
      buyerDiffersFromRecipient: false, buyerName: '', buyerPhone: '', paymentMethod: 'cash',
      transportMethod: 'super_agent',
      superAgentNote: '', busCompany: '', busTicketNumber: '', busDeparture: '',
      courierName: '', courierTrackingRef: '', bodaNote: '', notes: '' });
    setError('');
  };

  // Any authenticated user can ship a product or classified they actually
  // own — creating a listing was already universal (POST /products,
  // POST /classifieds only ever required JwtAuthGuard), and the backend
  // shipment endpoint (POST /super-agents/shipments) no longer restricts
  // by role either, so this page shouldn't gate on role anymore. A user
  // with nothing to ship simply sees an empty item picker below, not a
  // "Sellers Only" wall — a role check here used to block exactly the
  // "I received an invoice for my classified, now let me ship it" flow.

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('seller_shipment.title')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 90 }}>
        <>
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 24, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>{t('seller_shipment.order_registered')}</h2>
              <p style={{ fontSize: 13, opacity: 0.85, margin: '0 0 12px' }}>
                {result?.receipt?.buyerPaymentSmsSent
                  ? t('seller_shipment.payment_sms_sent_to', { name: result.receipt.buyerName, phone: result.receipt.buyerPhone })
                  : t('seller_shipment.payment_recorded_no_sms')}
              </p>
            </div>
            {result?.receipt && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                  {t('seller_shipment.receipt_title')}
                </div>
                {[
                  [t('seller_shipment.receipt_number_label'), result.receipt.receiptNumber],
                  [t('seller_shipment.receipt_amount_label'), `TZS ${Number(result.receipt.amount).toLocaleString()}`],
                  [t('seller_shipment.receipt_payer_label'), `${result.receipt.buyerName} — ${result.receipt.buyerPhone}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>{l}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {result?.billing && (
              <div style={{ backgroundColor: result.billing.isFreeOrder ? '#f0fdf4' : '#eff6ff',
                borderRadius: 12, padding: '12px 14px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800,
                  color: result.billing.isFreeOrder ? '#15803d' : '#1d4ed8' }}>
                  {result.billing.isFreeOrder
                    ? '🎁 Agizo la bure — halikutozwa ada'
                    : `Ada ya Kentexa TZS ${Number(result.billing.platformFeeCharged).toLocaleString()} imeongezwa kwenye deni lako`}
                </div>
              </div>
            )}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>{t('seller_shipment.tracking_number_label')}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
                {result.trackingNumber}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>kentexa.com/?track={result.trackingNumber}</div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              {[
                [t('seller_shipment.item_label'), getDescription()],
                  [t('seller_shipment.item_count_label'), `${items.length} ${t('seller_shipment.items_unit')}`],
                  [t('seller_shipment.value_label'), getTotalValue() > 0 ? `TZS ${getTotalValue().toLocaleString()}` : '—'],
                [t('seller_shipment.from_label'), sellerCity],
                [t('seller_shipment.to_label'), form.destinationCity],
                ...(result.transitCity ? [[t('seller_shipment.via_label'), result.transitCity]] : []),
                [t('seller_shipment.expected_label'), getExpectedArrival() || (isSameCity ? t('seller_shipment.today_tomorrow') : '—')],
                [t('seller_shipment.shipping_label'), isSameCity ? t('seller_shipment.boda_agent_local') :
                  form.transportMethod === 'bus' ? `🚌 ${form.busCompany} — ${t('seller_shipment.ticket_label')}: ${form.busTicketNumber}` :
                  form.transportMethod === 'courier' ? `📦 ${form.courierName} — ${t('seller_shipment.ref_label')}: ${form.courierTrackingRef}` :
                  `🏢 ${t('seller_shipment.kentexa_super_agent')}`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b', textAlign: 'right', maxWidth: '58%' }}>{v}</span>
                </div>
              ))}
            </div>
            {/* Available agents — loaded immediately, tracking is already active */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                🏍️ {t('seller_shipment.choose_driver')}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                {isSameCity ? t('seller_shipment.driver_comes_to_you')
                  : t('seller_shipment.driver_takes_to_hub', { city: sellerCity })}
              </div>

              {agentsLoading ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>⏳ {t('seller_shipment.finding_drivers')}</div>
              ) : availableAgents.length === 0 ? (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 14, fontSize: 13, color: '#c2410c' }}>
                  😔 {t('seller_shipment.no_drivers_online', { city: sellerCity })}
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
                    {t('seller_shipment.contact_hub_directly')}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {availableAgents.map(agent => (
                      <div key={agent.id}
                        onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                        style={{ padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                          border: selectedAgent?.id === agent.id ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                          backgroundColor: selectedAgent?.id === agent.id ? '#eff6ff' : '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{agent.fullName}</span>
                              {selectedAgent?.id === agent.id && <span>✅</span>}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {agent.agentTypeLabel} · ⭐ {Number(agent.rating || 5).toFixed(1)} · {agent.totalDeliveries || 0} {t('seller_shipment.deliveries_done')}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              ⏱️ {agent.deliveryTime} · {t('seller_shipment.up_to')} {agent.maxWeightKg}kg
                            </div>
                            {agent.vehicleDescription && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>🚗 {agent.vehicleDescription}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>
                              TZS {Number(agent.deliveryFee).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{t('seller_shipment.pickup_fee')}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedAgent && !jobPosted ? (
                    <button onClick={() => setJobPosted(true)}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)',
                        color: '#fff', border: 'none', padding: 14, borderRadius: 12,
                        cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
                      📞 {t('seller_shipment.contact_driver_button', { name: selectedAgent.fullName, fee: Number(selectedAgent.deliveryFee).toLocaleString() })}
                    </button>
                  ) : jobPosted ? (
                    <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 14, fontSize: 13, color: '#15803d', fontWeight: 700, textAlign: 'center' }}>
                      ✅ {t('seller_shipment.call_driver', { name: selectedAgent?.fullName })} <a href={`tel:${selectedAgent?.phone}`} style={{ color: '#1d4ed8' }}>{selectedAgent?.phone}</a>
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleNew}
                style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                📦 {t('seller_shipment.ship_another')}
              </button>
              <button onClick={() => onNavigate('SellerDashboard')}
                style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                🏪 {t('seller_shipment.dashboard')}
              </button>
            </div>
          </>
      </div>
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────────
  const transport = isSameCity ? 'boda' : form.transportMethod;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={`📦 ${t('seller_shipment.title')}`} />

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 90 }}>

        {/* Mission reminder */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          {t('seller_shipment.mission_reminder')}
        </div>

        {/* Continuing a POS/Manual sale ("Ship It") — payment is not asked
            for again below; this is shipping logistics only. A COD sale
            still has a balance owed, so it gets its own notice rather than
            claiming everything is already paid — the resulting Order
            carries the same COD balance through to the Super Agent who
            delivers it (see SuperAgentsService.createSellerShipment()). */}
        {prefill?.saleId && prefill?.isCod && Number(prefill?.balanceDue) > 0 ? (
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
            {`🚚 ${t('seller_shipment.cod_balance_banner', { amount: Number(prefill.balanceDue).toLocaleString() })}`}
          </div>
        ) : prefill?.saleId && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#166534', fontWeight: 700 }}>
            {`✅ ${t('seller_shipment.already_paid_banner')}`}
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* ── STEP 1: BIDHAA (Multi-item cart) ─────────────────────────────── */}
          <SectionTitle icon="1️⃣" title={t('seller_shipment.step1_title')}
            subtitle={t('seller_shipment.step1_subtitle')} />

          {/* Cart — items added so far */}
          {items.length > 0 && (
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 12 }}>
              {items.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0', borderBottom: idx < items.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
                    {item.price > 0 && (
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        TZS {Number(item.price).toLocaleString()} × {item.qty}
                        {item.weight > 0 && ` · ${item.weight}kg`}
                      </div>
                    )}
                  </div>
                  {/* Qty controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => updateQty(item.id, item.qty - 1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e2e8f0',
                        backgroundColor: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, item.qty + 1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e2e8f0',
                        backgroundColor: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>+</button>
                  </div>
                  <button onClick={() => removeItem(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: '#dc2626', fontSize: 16, padding: '0 4px' }}>×</button>
                </div>
              ))}

              {/* Cart totals */}
              <div style={{ display: 'flex', justifyContent: 'space-between',
                marginTop: 10, paddingTop: 10, borderTop: '2px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {t('seller_shipment.items_count_summary', { count: items.length, pieces: items.reduce((s,i) => s + i.qty, 0) })}
                  {getTotalWeight() > 0 && ` · ${getTotalWeight().toFixed(1)}kg`}
                </div>
                {getTotalValue() > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>
                    TZS {getTotalValue().toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add item section */}
          {!showAddItem ? (
            <button onClick={() => setShowAddItem(true)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '2px dashed #1d4ed8', backgroundColor: '#eff6ff',
                color: '#1d4ed8', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              + {t('seller_shipment.add_another_item')}
            </button>
          ) : (
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
              border: '2px solid #1d4ed8' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 12 }}>
                {items.length === 0 ? t('seller_shipment.add_first_item') : `+ ${t('seller_shipment.add_another_item')}`}
              </div>

              {/* Source mode tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[
                  { key: 'product',    label: t('seller_shipment.mode_store') },
                  { key: 'classified', label: t('seller_shipment.mode_listings') },
                  { key: 'text',       label: t('seller_shipment.mode_describe') },
                ].map(m => (
                  <button key={m.key} onClick={() => { setAddMode(m.key); setSelectedProduct(null); setSelectedClassified(null); }}
                    style={{ flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer',
                      fontSize: 11, fontWeight: 700,
                      border: addMode === m.key ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                      backgroundColor: addMode === m.key ? '#1d4ed8' : '#fff',
                      color: addMode === m.key ? '#fff' : '#64748b' }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Products mode */}
              {addMode === 'product' && (
                products.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>
                    {t('seller_shipment.no_products_in_store')}{' '}
                    <button onClick={() => setAddMode('text')}
                      style={{ color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                      {t('seller_shipment.describe_in_words')}
                    </button>
                  </div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {products.map(p => {
                      const isSel = selectedProduct?.id === p.id;
                      return (
                        <div key={p.id} onClick={() => setSelectedProduct(isSel ? null : p)}
                          style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                            border: isSel ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                            backgroundColor: isSel ? '#dbeafe' : '#fff',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              TZS {Number(p.basePrice || p.price || 0).toLocaleString()}
                            </div>
                          </div>
                          {isSel && <span style={{ color: '#1d4ed8', fontWeight: 900 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* Classifieds mode */}
              {addMode === 'classified' && (
                <>
                  {classifieds.length > 0 && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      {classifieds.map(c => {
                        const isSel = selectedClassified?.id === c.id;
                        return (
                          <div key={c.id} onClick={() => setSelectedClassified(isSel ? null : c)}
                            style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                              border: isSel ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                              backgroundColor: isSel ? '#dbeafe' : '#fff',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.title}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                TZS {Number(c.price || 0).toLocaleString()}
                              </div>
                            </div>
                            {isSel && <span style={{ color: '#1d4ed8', fontWeight: 900 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!selectedClassified && (
                    <input type="text" placeholder={t('seller_shipment.new_listing_title_placeholder')}
                      value={newClassifiedTitle}
                      onChange={e => setNewClassifiedTitle(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8,
                        border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
                        marginBottom: 8 }} />
                  )}
                </>
              )}

              {/* Text mode */}
              {addMode === 'text' && (
                <input type="text" placeholder={t('seller_shipment.describe_item_placeholder')}
                  value={addText} onChange={e => setAddText(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
                    marginBottom: 8 }} />
              )}

              {/* Qty, price, weight row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>{t('seller_shipment.qty_label')}</div>
                  <input type="number" min="1" value={addQty}
                    onChange={e => setAddQty(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>{t('seller_shipment.price_tzs_label')}</div>
                  <input type="number" placeholder="0" value={addPrice}
                    onChange={e => setAddPrice(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>{t('seller_shipment.weight_kg_label')}</div>
                  <input type="number" placeholder="0" value={addWeight}
                    onChange={e => setAddWeight(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Add to cart button */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  let name = '';
                  let price = addPrice;
                  let weight = addWeight;
                  let productId = null;
                  let classifiedId = null;

                  if (addMode === 'product' && selectedProduct) {
                    name = selectedProduct.name;
                    price = price || selectedProduct.basePrice || selectedProduct.price || 0;
                    productId = selectedProduct.id;
                  } else if (addMode === 'classified') {
                    name = selectedClassified ? selectedClassified.title : newClassifiedTitle;
                    price = price || (selectedClassified?.price) || 0;
                    classifiedId = selectedClassified?.id || null;
                  } else if (addMode === 'text') {
                    name = addText;
                  }

                  if (!name.trim()) return;
                  addItem(name, price, addMode, productId, classifiedId, weight);
                }}
                  style={{ flex: 2, backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13, fontWeight: 800 }}>
                  {t('seller_shipment.add_to_cart_button')}
                </button>
                {items.length > 0 && (
                  <button onClick={() => setShowAddItem(false)}
                    style={{ flex: 1, backgroundColor: '#fff', color: '#64748b',
                      border: '1px solid #e2e8f0', padding: '10px 14px',
                      borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                    {t('seller_shipment.done_button')}
                  </button>
                )}
              </div>
            </div>
          )}


          {/* ── STEP 2: BUYER ─────────────────────────────────────────────── */}
          <SectionTitle icon="2️⃣" title={t('seller_shipment.step2_title')}
            subtitle={t('seller_shipment.step2_subtitle')} />

          <Field label={t('seller_shipment.recipient_name_label')} required>
            <input type="text" placeholder={t('seller_shipment.recipient_name_placeholder')}
              value={form.recipientName} onChange={e => set('recipientName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('seller_shipment.recipient_phone_label')} required hint={t('seller_shipment.recipient_phone_hint')}>
            <input type="tel" placeholder="0712345678"
              value={form.recipientPhone} onChange={e => set('recipientPhone', e.target.value)} style={inputStyle} />
          </Field>

          {/* Payment — who actually paid you, and how. Defaults to the
              recipient above (the common case), but a gift/third-party
              payment needs its own identity so the payment-confirmation
              SMS goes to whoever paid, not whoever receives the parcel. */}
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer', marginBottom: form.buyerDiffersFromRecipient ? 10 : 0 }}>
              <input type="checkbox" checked={form.buyerDiffersFromRecipient}
                onChange={e => set('buyerDiffersFromRecipient', e.target.checked)} />
              {t('seller_shipment.payer_differs_label')}
            </label>
            {form.buyerDiffersFromRecipient && (
              <>
                <Field label={t('seller_shipment.payer_name_label')} required>
                  <input type="text" placeholder={t('seller_shipment.payer_name_placeholder')}
                    value={form.buyerName} onChange={e => set('buyerName', e.target.value)} style={inputStyle} />
                </Field>
                <Field label={t('seller_shipment.payer_phone_label')} required hint={t('seller_shipment.payer_phone_hint')}>
                  <input type="tel" placeholder="0712345678"
                    value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} style={inputStyle} />
                </Field>
              </>
            )}
            <Field label={t('seller_shipment.payment_method_label')}>
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} style={inputStyle}>
                <option value="cash">{t('seller_shipment.payment_method_cash')}</option>
                <option value="mobile_money">{t('seller_shipment.payment_method_mobile_money')}</option>
                <option value="bank">{t('seller_shipment.payment_method_bank')}</option>
                <option value="other">{t('seller_shipment.payment_method_other')}</option>
              </select>
            </Field>

            {/* Not shown when continuing a "Ship It" POS sale — that Sale's
                own isCod/balanceDue already governs (see the banner above),
                so re-declaring it here would be redundant and could disagree
                with what was actually recorded at the point of sale. */}
            {!prefill?.saleId && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isCod}
                    onChange={e => set('isCod', e.target.checked)} />
                  🚚 {t('seller_shipment.cod_toggle')}
                </label>
                {form.isCod && (
                  <div style={{ marginTop: 10 }}>
                    <Field label={t('seller_shipment.cod_amount_paid_label')} hint={t('seller_shipment.cod_amount_paid_hint')}>
                      <input type="number" placeholder="0" value={form.codAmountPaid}
                        onChange={e => set('codAmountPaid', e.target.value)} style={inputStyle} />
                    </Field>
                    <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#1d4ed8' }}>
                      {t('seller_shipment.cod_balance_preview', {
                        amount: Math.max(0, getTotalValue() - (Number(form.codAmountPaid) || 0)).toLocaleString(),
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Field label={t('seller_shipment.destination_city_label')} required>
            <LocationPicker
              label={t('seller_shipment.location_picker_label')}
              value={destLocation}
              onChange={loc => {
                setDestLocation(loc);
                // Region, not district — Super Agents register their `city`
                // against the fixed TANZANIA_CITIES list (region names:
                // "Dar es Salaam", "Mwanza", ...; see super-agent.entity.ts),
                // never a district. This fed handleCityChange() a district
                // name instead (e.g. "Kinondoni"), which never matches any
                // real Super Agent's city — the "nearby hubs" picker below
                // silently returned empty for every destination inside a
                // region that already has real, active hubs registered.
                // fetchPriceEstimate right below already got this correct
                // (loc.regionName first) — this brings the other caller in
                // this same handler in line with it, not a new convention.
                const cityStr = loc.regionName || loc.districtName || '';
                handleCityChange(cityStr);
                fetchPriceEstimate(
                  loc.regionName || cityStr,
                  loc.districtId,
                  loc.districtName,
                  form.weightKg
                );
              }}
              required
              style={{ marginBottom: 8 }}
            />

            {/* Live price estimate */}
            {priceLoading && (
              <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
                {t('seller_shipment.calculating_price')}
              </div>
            )}
            {priceEstimate && !priceLoading && (
              <div style={{ borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                backgroundColor: priceEstimate.confidence === 'exact' ? '#f0fdf4' : '#fff7ed',
                border: `1px solid ${priceEstimate.confidence === 'exact' ? '#86efac' : '#fed7aa'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700,
                      color: priceEstimate.confidence === 'exact' ? '#15803d' : '#92400e',
                      marginBottom: 2 }}>
                      {priceEstimate.confidence === 'exact' ? `✅ ${t('seller_shipment.exact_price')}` : `📊 ${t('seller_shipment.price_estimate')}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {priceEstimate.displayNote}
                      {priceEstimate.via && <span style={{ color: '#7c3aed' }}> · {priceEstimate.via}</span>}
                    </div>
                    {priceEstimate.providerName && (
                      <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 2 }}>
                        🚌 {priceEstimate.providerName}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 900,
                      color: priceEstimate.confidence === 'exact' ? '#16a34a' : '#f59e0b' }}>
                      {priceEstimate.displayPrice}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {t('seller_shipment.days_label')} {priceEstimate.estimatedDays}
                      {priceEstimate.perKgFee > 0 &&
                        ` · +TZS ${Number(priceEstimate.perKgFee).toLocaleString()}/kg`}
                    </div>
                  </div>
                </div>
                {priceEstimate.districtFee > 0 && (
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 6,
                    paddingTop: 6, borderTop: '1px solid #fed7aa' }}>
                    {t('seller_shipment.base_price_line', { base: Number(priceEstimate.basePrice).toLocaleString(), district: Number(priceEstimate.districtFee).toLocaleString() })}
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* ETA card */}
          {form.destinationCity && (
            <div style={{ marginBottom: 14 }}>
              {isSameCity ? (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginBottom: 4 }}>
                    🏍️ {t('seller_shipment.local_delivery_title', { city: form.destinationCity })}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    {t('seller_shipment.local_delivery_desc')}
                  </div>
                </div>
              ) : routeLoading ? (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>{t('seller_shipment.finding_route')}</div>
              ) : routeInfo ? (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>
                    {t('seller_shipment.route_summary', { from: sellerCity, to: form.destinationCity })}
                  </div>
                  {routeInfo.transitCity && (
                    <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '4px 10px', marginBottom: 6, fontSize: 11, color: '#92400e' }}>
                      🔄 {t('seller_shipment.via_label')} <strong>{routeInfo.transitCity}</strong>
                      {routeInfo.leg1Days && routeInfo.leg2Days && ` ${t('seller_shipment.leg_days', { leg1: routeInfo.leg1Days, leg2: routeInfo.leg2Days })}`}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{t('seller_shipment.travel_time')}</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>{t('seller_shipment.days_label')} {routeInfo.estimatedDays}</div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{t('seller_shipment.expected_arrival')}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>{getExpectedArrival() || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c' }}>
                  {t('seller_shipment.no_route_registered', { city: form.destinationCity })}
                </div>
              )}
            </div>
          )}

          <Field label={t('seller_shipment.delivery_address_label')} required hint={t('seller_shipment.delivery_address_hint')}>
            <textarea rows={2} placeholder={t('seller_shipment.delivery_address_placeholder')}
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Weight */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            <Field label={t('seller_shipment.weight_kg_field')}>
              <input type="number" min="0.1" step="0.1" placeholder="e.g. 1.5"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={t('seller_shipment.size_label')}>
              <select value={form.parcelSize} onChange={e => set('parcelSize', e.target.value)} style={inputStyle}>
                <option value="small">{t('seller_shipment.size_small')}</option>
                <option value="medium">{t('seller_shipment.size_medium')}</option>
                <option value="large">{t('seller_shipment.size_large')}</option>
              </select>
            </Field>
          </div>

          {/* ── STEP 3: SHIPPING — REQUIRED ───────────────────────────────── */}
          {form.destinationCity && (
            <>
              <SectionTitle icon="3️⃣" title={t('seller_shipment.step3_title')}
                subtitle={t('seller_shipment.step3_subtitle')} />

              {isSameCity ? (
                /* Same city — boda */
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '2px solid #86efac' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>{t('seller_shipment.boda_local_agent_title')}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                    {t('seller_shipment.boda_local_agent_desc', { city: form.destinationCity })}
                  </div>
                  <Field label={t('seller_shipment.extra_notes_optional')} hint={t('seller_shipment.extra_notes_hint')}>
                    <input type="text" placeholder={t('seller_shipment.extra_notes_placeholder')}
                      value={form.bodaNote} onChange={e => set('bodaNote', e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              ) : (
                /* Intercity — choose method */
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {[
                      { value: 'super_agent', icon: '🏢', label: t('seller_shipment.transport_super_agent'), desc: t('seller_shipment.transport_super_agent_desc') },
                      { value: 'bus',         icon: '🚌', label: t('seller_shipment.transport_bus'),        desc: t('seller_shipment.transport_bus_desc') },
                      { value: 'courier',     icon: '📦', label: t('seller_shipment.transport_courier'),     desc: t('seller_shipment.transport_courier_desc') },
                    ].map(m => (
                      <button key={m.value} onClick={() => set('transportMethod', m.value)}
                        style={{ flex: 1, padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                          fontSize: 10, fontWeight: 700, textAlign: 'center',
                          border: form.transportMethod === m.value ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                          backgroundColor: form.transportMethod === m.value ? '#eff6ff' : '#fff',
                          color: form.transportMethod === m.value ? '#1d4ed8' : '#64748b' }}>
                        <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                        <div style={{ fontWeight: 800 }}>{m.label}</div>
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Super Agent details */}
                  {transport === 'super_agent' && (
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '2px solid #bfdbfe' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>{t('seller_shipment.super_agent_network_title')}</div>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                        <Trans i18nKey="seller_shipment.super_agent_network_desc"
                          values={{ sellerCity, destCity: form.destinationCity, recipient: form.recipientName }}
                          components={{ strong: <strong /> }} />
                      </div>

                      {loadingHubs ? (
                        <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>
                          ⏳ {t('seller_shipment.hubs_loading')}
                        </div>
                      ) : nearbyHubs.length > 0 ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>
                            {t('seller_shipment.hubs_choose_label', { city: form.destinationCity })}
                          </div>
                          {nearbyHubs.map(h => (
                            <label key={h.id} onClick={() => setSelectedHubId(h.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                                border: `2px solid ${selectedHubId === h.id ? '#1d4ed8' : '#e2e8f0'}`,
                                backgroundColor: selectedHubId === h.id ? '#fff' : '#f8fafc' }}>
                              <input type="radio" checked={selectedHubId === h.id} readOnly />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{h.businessName}</div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  📍 {h.address || h.city}{h.rating ? ` · ⭐ ${Number(h.rating).toFixed(1)}` : ''}
                                </div>
                              </div>
                            </label>
                          ))}
                        </>
                      ) : (
                        <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#64748b' }}>
                          {t('seller_shipment.hubs_none_found')}
                        </div>
                      )}

                      <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#64748b', marginTop: 8 }}>
                        {t('seller_shipment.super_agent_network_note')}
                      </div>
                    </div>
                  )}

                  {/* Bus — agent fills ticket after pickup */}
                  {transport === 'bus' && (
                    <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #fed7aa' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 4 }}>{t('seller_shipment.via_bus_title')}</div>
                      <div style={{ fontSize: 12, color: '#92400e' }}>
                        {t('seller_shipment.via_bus_desc')}
                      </div>
                    </div>
                  )}

                  {/* Courier — agent fills ref after handover */}
                  {transport === 'courier' && (
                    <div style={{ backgroundColor: '#fdf4ff', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>{t('seller_shipment.via_courier_title')}</div>
                      <div style={{ fontSize: 12, color: '#6b21a8' }}>
                        {t('seller_shipment.via_courier_desc')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Notes */}
          <Field label={t('seller_shipment.extra_notes_label')}>
            <input type="text" placeholder={t('seller_shipment.extra_notes_placeholder2')}
              value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} />
          </Field>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading || !form.destinationCity}
            style={{ width: '100%',
              background: loading ? '#94a3b8' : !form.destinationCity ? '#e2e8f0' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: !form.destinationCity ? '#94a3b8' : '#fff',
              border: 'none', padding: 16, borderRadius: 12,
              cursor: loading || !form.destinationCity ? 'not-allowed' : 'pointer',
              fontSize: 15, fontWeight: 900, marginTop: 8,
              boxShadow: form.destinationCity ? '0 4px 12px rgba(29,78,216,0.3)' : 'none' }}>
            {loading ? `⏳ ${t('seller_shipment.registering')}` : t('seller_shipment.register_pay')}
          </button>

          {!form.destinationCity && (
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              {t('seller_shipment.choose_destination_first')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SellerShipment;