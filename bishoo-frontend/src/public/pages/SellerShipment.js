/**
 * SellerShipment.js — Unified seller manual order form
 *
 * Two-stage flow:
 * STAGE 1 (seller, at creation):
 *   Pick item → buyer details → transport METHOD → pickup agent OR self drop-off → pay TZS 1,000
 *
 * STAGE 2 (agent, after pickup):
 *   Agent collects → takes to bus/hub → fills ticket/ref details → tracking updates
 *
 * Bus ticket, courier ref etc. are NOT asked at creation —
 * seller doesn't have them yet. Agent fills after reaching bus office/hub.
 */
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer from '../components/Footer';
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

const SellerShipment = ({ onNavigate, isLoggedIn, onLogout, userRole, prefill = null, currentUser }) => {
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
  const [feePaid, setFeePaid]         = useState(false);
  const [payingFee, setPayingFee]     = useState(false);
  const [feePhone, setFeePhone]       = useState('');
  const [feeError, setFeeError]       = useState('');
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
    // Also pre-set destination location label if district/region available
    if (prefill.district || prefill.region) {
      setDestLocation(prev => ({
        ...prev,
        districtName: prefill.district || prev.districtName,
        regionName:   prefill.region   || prev.regionName,
      }));
    }
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      const [profileRes, productsRes, classifiedsRes] = await Promise.all([
        api.get('/store/profile').catch(() => null),
        api.get('/products/my/products').catch(() => ({ data: [] })),
        api.get('/classifieds/user/mine').catch(() => ({ data: [] })),
      ]);
      const loc = profileRes?.data?.businessLocation || 'Dar es Salaam';
      setSellerCity(loc.split(',')[0].trim());
      setProducts(productsRes.data || []);
      setClassifieds(classifiedsRes.data || []);
    } catch {}
  };

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

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
  };

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
    return d.toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const validate = () => {
    if (items.length === 0)            return 'Ongeza bidhaa angalau moja';
    if (!form.recipientName.trim())    return 'Weka jina la mpokeaji';
    if (!form.recipientPhone.trim())   return 'Weka simu ya mpokeaji';
    if (!form.destinationCity)         return 'Chagua mji wa mwisho';
    if (!form.deliveryAddress.trim())  return 'Weka anwani ya mpokeaji';
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

      const res = await api.post('/super-agents/shipments', {
        classifiedId:    items.find(i => i.classifiedId)?.classifiedId || null,
        description:     getDescription(),
        items:           items.map(i => ({ name: i.name, qty: i.qty, price: i.price, weight: i.weight, productId: i.productId, classifiedId: i.classifiedId })),
        weightKg:        getTotalWeight() || (form.weightKg ? Number(form.weightKg) : undefined),
        parcelSize:      form.parcelSize,
        recipientName:   form.recipientName.trim(),
        recipientPhone:  form.recipientPhone.trim(),
        destinationCity: form.destinationCity,
        deliveryAddress: form.deliveryAddress.trim(),
        originCity:      sellerCity || 'Dar es Salaam',
        transportMethod: isSameCity ? 'boda' : form.transportMethod,
        busCompany:         form.busCompany      || null,
        busTicketNumber:    form.busTicketNumber  || null,
        busDeparture:       form.busDeparture     || null,
        courierName:        form.courierName      || null,
        courierTrackingRef: form.courierTrackingRef || null,
        notes:      [form.notes, form.superAgentNote, form.bodaNote].filter(Boolean).join(' | ') || null,
        totalValue: getTotalValue() || null,
      });
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuunda agizo. Jaribu tena.');
    } finally { setLoading(false); }
  };

  const handlePayFee = async () => {
    if (!feePhone.trim()) { setFeeError('Weka namba yako ya M-Pesa'); return; }
    try {
      setPayingFee(true); setFeeError('');
      const res = await api.post('/payments/invoice/pay', {
        orderId: result.orderId, phone: feePhone.trim(),
        provider: 'selcom', amount: 1000, purpose: 'platform_tracking_fee',
      });
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setFeePaid(true);
          // After payment — load available agents in seller's city
          try {
            setAgentsLoading(true);
            const agRes = await api.get(
              `/agents/available?city=${encodeURIComponent(sellerCity)}&weight=${form.weightKg || 5}`
            );
            setAvailableAgents(agRes.data || []);
          } catch { setAvailableAgents([]); }
          finally { setAgentsLoading(false); }
        } catch { setFeeError('Malipo yameshindwa. Jaribu tena.'); }
        setPayingFee(false);
      }, 3000);
    } catch (err) {
      setFeeError(err?.response?.data?.message || 'Imeshindwa');
      setPayingFee(false);
    }
  };

  const handleNew = () => {
    setResult(null); setFeePaid(false); setRouteInfo(null);
    setSelectedProduct(null); setSelectedClassified(null);
    setItems([]); setAddText(''); setAddPrice(''); setAddWeight(''); setAddQty(1);
    setNewClassifiedTitle(''); setShowAddItem(true); setIsSameCity(false);
    setForm({ recipientName: '', recipientPhone: '', destinationCity: '', deliveryAddress: '',
      weightKg: '', parcelSize: 'small', transportMethod: 'super_agent',
      superAgentNote: '', busCompany: '', busTicketNumber: '', busDeparture: '',
      courierName: '', courierTrackingRef: '', bodaNote: '', notes: '' });
    setError('');
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SellerShipment" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="Tuma Bidhaa" />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>
        {!feePaid ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>📱</div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 6px' }}>Lipa Ada ya Ufuatiliaji</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Lipa TZS 1,000 kuamsha ufuatiliaji na kutuma SMS kwa {form.recipientName}
              </p>
            </div>
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>MPOKEAJI ATAPATA:</div>
              {[
                `📱 SMS: "Bidhaa yako ipo njiani kutoka ${sellerCity}"`,
                `🔗 Link ya kufuatilia: kentexa.com/?track=${result.trackingNumber}`,
                `📅 Inatarajiwa: ${getExpectedArrival() || 'Leo/Kesho'}`,
                `🔔 SMS kila hatua — Hub, Njiani, Imefika`,
              ].map(item => <div key={item} style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{item}</div>)}
            </div>
            <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '12px 14px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#92400e' }}>TZS 1,000</div>
              <div style={{ fontSize: 11, color: '#92400e' }}>Ada ya mfumo wa ufuatiliaji wa KenteXa</div>
            </div>
            <Field label="Namba ya M-Pesa (255XXXXXXXXX)">
              <input type="tel" placeholder="255712345678"
                value={feePhone} onChange={e => setFeePhone(e.target.value)} style={inputStyle} />
            </Field>
            {feeError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>❌ {feeError}</div>}
            <button onClick={handlePayFee} disabled={payingFee}
              style={{ width: '100%', background: payingFee ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff', border: 'none', padding: 14, borderRadius: 12,
                cursor: payingFee ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900 }}>
              {payingFee ? '⏳ Inashughulikia M-Pesa...' : '💳 Lipa TZS 1,000 — Amsha Tracking'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 24, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Agizo Limesajiliwa!</h2>
              <p style={{ fontSize: 13, opacity: 0.85, margin: '0 0 12px' }}>
                SMS imetumwa kwa {form.recipientName} — {form.recipientPhone}
              </p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>NAMBA YA KUFUATILIA</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
                {result.trackingNumber}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>kentexa.com/?track={result.trackingNumber}</div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              {[
                ['Bidhaa', getDescription()],
                  ['Idadi ya Vitu', `${items.length} ${items.length === 1 ? 'bidhaa' : 'bidhaa'}`],
                  ['Thamani', getTotalValue() > 0 ? `TZS ${getTotalValue().toLocaleString()}` : '—'],
                ['Kutoka', sellerCity],
                ['Kwenda', form.destinationCity],
                ...(result.transitCity ? [['Via', result.transitCity]] : []),
                ['Inatarajiwa', getExpectedArrival() || (isSameCity ? 'Leo/Kesho' : '—')],
                ['Usafirishaji', isSameCity ? 'Boda/Agent wa mtaa' :
                  form.transportMethod === 'bus' ? `🚌 ${form.busCompany} — Tiketi: ${form.busTicketNumber}` :
                  form.transportMethod === 'courier' ? `📦 ${form.courierName} — Ref: ${form.courierTrackingRef}` :
                  '🏢 KenteXa Super Agent'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b', textAlign: 'right', maxWidth: '58%' }}>{v}</span>
                </div>
              ))}
            </div>
            {/* Available agents — shown after payment */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                🏍️ Chagua Dereva wa Kuchukua Bidhaa
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                {isSameCity ? 'Dereva atakuja kwako na kukufikishia mteja moja kwa moja'
                  : `Atakuchukua na kulipeleka kwenye Super Agent hub ya ${sellerCity}`}
              </div>

              {agentsLoading ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>⏳ Inatafuta madereva...</div>
              ) : availableAgents.length === 0 ? (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 14, fontSize: 13, color: '#c2410c' }}>
                  😔 Hakuna dereva mtandaoni sasa hivi katika {sellerCity}.
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>
                    Wasiliana na Super Agent hub moja kwa moja, au jaribu tena baadaye.
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
                              {agent.agentTypeLabel} · ⭐ {Number(agent.rating || 5).toFixed(1)} · {agent.totalDeliveries || 0} zimefishwa
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              ⏱️ {agent.deliveryTime} · Hadi {agent.maxWeightKg}kg
                            </div>
                            {agent.vehicleDescription && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>🚗 {agent.vehicleDescription}</div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>
                              TZS {Number(agent.deliveryFee).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>ada ya kuchukua</div>
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
                      📞 Wasiliana na {selectedAgent.fullName} — TZS {Number(selectedAgent.deliveryFee).toLocaleString()}
                    </button>
                  ) : jobPosted ? (
                    <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 14, fontSize: 13, color: '#15803d', fontWeight: 700, textAlign: 'center' }}>
                      ✅ Piga simu {selectedAgent?.fullName}: <a href={`tel:${selectedAgent?.phone}`} style={{ color: '#1d4ed8' }}>{selectedAgent?.phone}</a>
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleNew}
                style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                📦 Tuma Kingine
              </button>
              <button onClick={() => onNavigate('SellerDashboard')}
                style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                🏪 Dashibodi
              </button>
            </div>
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────────
  const transport = isSameCity ? 'boda' : form.transportMethod;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SellerShipment" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="📦 Tuma Bidhaa" />

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Mission reminder */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          🎯 KenteXa inafuatilia kila hatua — mteja wako ataona bidhaa yake iko wapi wakati wote.
          Maelezo ya usafirishaji yanahitajika ili ufuatiliaji ufanye kazi vizuri.
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* ── STEP 1: BIDHAA (Multi-item cart) ─────────────────────────────── */}
          <SectionTitle icon="1️⃣" title="Bidhaa Unazotuma"
            subtitle="Ongeza bidhaa moja au nyingi — zote zitafuatiliwa pamoja" />

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
                  {items.length} bidhaa · {items.reduce((s,i) => s + i.qty, 0)} vipande
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
              + Ongeza Bidhaa Nyingine
            </button>
          ) : (
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
              border: '2px solid #1d4ed8' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 12 }}>
                {items.length === 0 ? '📦 Ongeza Bidhaa ya Kwanza' : '+ Ongeza Bidhaa Nyingine'}
              </div>

              {/* Source mode tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[
                  { key: 'product',    label: '🛒 Dukani' },
                  { key: 'classified', label: '📋 Matangazo' },
                  { key: 'text',       label: '✏️ Eleza' },
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
                    Huna bidhaa dukani.{' '}
                    <button onClick={() => setAddMode('text')}
                      style={{ color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                      Eleza kwa maneno →
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
                    <input type="text" placeholder="Jina la bidhaa mpya..."
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
                <input type="text" placeholder="e.g. Nguo za watoto 3, rangi nyekundu"
                  value={addText} onChange={e => setAddText(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
                    marginBottom: 8 }} />
              )}

              {/* Qty, price, weight row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>IDADI</div>
                  <input type="number" min="1" value={addQty}
                    onChange={e => setAddQty(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>BEI (TZS)</div>
                  <input type="number" placeholder="0" value={addPrice}
                    onChange={e => setAddPrice(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                      border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>UZITO (kg)</div>
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
                  ✅ Ongeza kwenye Kifurushi
                </button>
                {items.length > 0 && (
                  <button onClick={() => setShowAddItem(false)}
                    style={{ flex: 1, backgroundColor: '#fff', color: '#64748b',
                      border: '1px solid #e2e8f0', padding: '10px 14px',
                      borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                    Imaliza
                  </button>
                )}
              </div>
            </div>
          )}


          {/* ── STEP 2: BUYER ─────────────────────────────────────────────── */}
          <SectionTitle icon="2️⃣" title="Mpokeaji"
            subtitle="Mteja wako — atatumwa SMS na link ya kufuatilia mara moja" />

          <Field label="Jina la Mpokeaji" required>
            <input type="text" placeholder="e.g. Amina Hassan"
              value={form.recipientName} onChange={e => set('recipientName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Simu ya Mpokeaji" required hint="Atatumwa SMS: 'Bidhaa yako ipo njiani — fuatilia hapa'">
            <input type="tel" placeholder="0712345678"
              value={form.recipientPhone} onChange={e => set('recipientPhone', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Mji wa Mwisho" required>
            <LocationPicker
              label="Mji / Kata ya Mpokeaji *"
              value={destLocation}
              onChange={loc => {
                setDestLocation(loc);
                const cityStr = loc.districtName || loc.regionName || '';
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
                ⏳ Inahesabu bei...
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
                      {priceEstimate.confidence === 'exact' ? '✅ Bei Halisi' : '📊 Makisio ya Bei'}
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
                      Siku {priceEstimate.estimatedDays}
                      {priceEstimate.perKgFee > 0 &&
                        ` · +TZS ${Number(priceEstimate.perKgFee).toLocaleString()}/kg`}
                    </div>
                  </div>
                </div>
                {priceEstimate.districtFee > 0 && (
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 6,
                    paddingTop: 6, borderTop: '1px solid #fed7aa' }}>
                    Bei ya msingi: TZS {Number(priceEstimate.basePrice).toLocaleString()} +
                    ada ya wilaya: TZS {Number(priceEstimate.districtFee).toLocaleString()}
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
                    🏍️ Uwasilishaji wa Ndani — {form.destinationCity}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    Boda au wakala wa mtaa · Kawaida masaa 1-4 kulingana na dereva · Mpokeaji ataona tracking mara moja
                  </div>
                </div>
              ) : routeLoading ? (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>⏳ Inatafuta njia...</div>
              ) : routeInfo ? (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>
                    📍 {sellerCity} → {form.destinationCity}
                  </div>
                  {routeInfo.transitCity && (
                    <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '4px 10px', marginBottom: 6, fontSize: 11, color: '#92400e' }}>
                      🔄 Via <strong>{routeInfo.transitCity}</strong>
                      {routeInfo.leg1Days && routeInfo.leg2Days && ` (siku ${routeInfo.leg1Days} + ${routeInfo.leg2Days})`}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>MUDA WA SAFARI</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>Siku {routeInfo.estimatedDays}</div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>INATARAJIWA KUFIKA</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>{getExpectedArrival() || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c' }}>
                  ⚠️ Hakuna njia iliyosajiliwa kwa {form.destinationCity} bado. Unaweza bado kutuma — weka maelezo ya usafirishaji hapa chini.
                </div>
              )}
            </div>
          )}

          <Field label="Anwani ya Uwasilishaji" required hint="Mtaa, alama muhimu — wakala atatumia hii kufika kwa mpokeaji">
            <textarea rows={2} placeholder="e.g. Karibu na kanisa kuu, nyumba ya paa la bati nyekundu, Mtaa wa Geita"
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Weight */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            <Field label="Uzito (kg)">
              <input type="number" min="0.1" step="0.1" placeholder="e.g. 1.5"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Ukubwa">
              <select value={form.parcelSize} onChange={e => set('parcelSize', e.target.value)} style={inputStyle}>
                <option value="small">Ndogo (hadi 2kg)</option>
                <option value="medium">Wastani (2–10kg)</option>
                <option value="large">Kubwa (10kg+)</option>
              </select>
            </Field>
          </div>

          {/* ── STEP 3: SHIPPING — REQUIRED ───────────────────────────────── */}
          {form.destinationCity && (
            <>
              <SectionTitle icon="3️⃣" title="Jinsi Unavyotuma"
                subtitle="Hii INAHITAJIKA — bila maelezo ya usafirishaji, mpokeaji hawezi kujua bidhaa yake iko wapi" />

              {isSameCity ? (
                /* Same city — boda */
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '2px solid #86efac' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginBottom: 6 }}>🏍️ Boda / Wakala wa Mtaa</div>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                    Baada ya kulipa, mawakala wa KenteXa katika {form.destinationCity} wataona agizo hili na mmoja atachukua kazi ya kuwasilisha kwa mpokeaji.
                  </div>
                  <Field label="Maelezo ya Ziada (si lazima)" hint="e.g. Mpokeaji yuko nyumbani baada ya 2pm">
                    <input type="text" placeholder="e.g. Piga simu kabla ya kufika..."
                      value={form.bodaNote} onChange={e => set('bodaNote', e.target.value)} style={inputStyle} />
                  </Field>
                </div>
              ) : (
                /* Intercity — choose method */
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {[
                      { value: 'super_agent', icon: '🏢', label: 'Super Agent', desc: 'Peleka hub karibu nawe' },
                      { value: 'bus',         icon: '🚌', label: 'Basi',        desc: 'Umeweka kwenye basi' },
                      { value: 'courier',     icon: '📦', label: 'Courier',     desc: 'DHL, EMS, G4S n.k.' },
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
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>🏢 KenteXa Super Agent Network</div>
                      <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
                        Peleka bidhaa yako kwenye <strong>Super Agent hub ya {sellerCity}</strong>.
                        Watashughulikia safari yote hadi {form.destinationCity} na mawakala wa huko watawasilisha kwa {form.recipientName}.
                      </div>
                      <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#64748b' }}>
                        📍 Hii ndiyo njia rahisi zaidi — KenteXa inashughulikia kila kitu na mpokeaji ataona kila hatua.
                      </div>
                    </div>
                  )}

                  {/* Bus — agent fills ticket after pickup */}
                  {transport === 'bus' && (
                    <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #fed7aa' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 4 }}>🚌 Via Basi</div>
                      <div style={{ fontSize: 12, color: '#92400e' }}>
                        Dereva atakayechukua bidhaa yako ndiye atakayeweka tiketi ya basi na maelezo yote kwenye KenteXa
                        baada ya kufika ofisini. Wewe huhitaji kujua tiketi sasa hivi.
                      </div>
                    </div>
                  )}

                  {/* Courier — agent fills ref after handover */}
                  {transport === 'courier' && (
                    <div style={{ backgroundColor: '#fdf4ff', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>📦 Via Courier</div>
                      <div style={{ fontSize: 12, color: '#6b21a8' }}>
                        Dereva atakayepeleka bidhaa kwa courier ndiye atakayeweka namba ya kufuatilia baada ya kukabidhi.
                        Mpokeaji wako ataona taarifa mara tu inapowekwa.
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Notes */}
          <Field label="Maelezo Zaidi (si lazima)">
            <input type="text" placeholder="e.g. Vitu laini — shughulikia kwa uangalifu"
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
            {loading ? '⏳ Inasajili...' : '📦 Sajili Agizo → Lipa TZS 1,000'}
          </button>

          {!form.destinationCity && (
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Chagua mji wa mwisho kwanza
            </div>
          )}
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default SellerShipment;