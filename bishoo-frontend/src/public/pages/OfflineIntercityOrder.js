/**
 * OfflineIntercityOrder.js — Seller creates a manual intercity order
 *
 * Used when a customer walks in, calls, or contacts the seller outside KenteXa.
 * Seller selects a KenteXa product, enters buyer details, shipping method,
 * and marks payment as received. Works for all shipping methods:
 *   - KenteXa Super Agent (intercity network)
 *   - Bus (seller books bus ticket themselves)
 *   - Courier (DHL, EMS, etc.)
 *
 * Shows ETA + transit city before submitting so seller can inform buyer.
 */
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import Footer from '../components/Footer';
import api from '../../api/api';

const CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
  'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
  'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
  'Mpanda','Masasi','Korogwe','Geita','Bariadi','Chato','Sengerema','Mbinga',
];

const BUS_COMPANIES = {
  default: ['Kilimanjaro Express','Scandinavian','Dar Express','Fresh Ya Bus',
            'Moderners','Shabiby','Hood Bus','Sumry','Tahmeed'],
  'Arusha': ['Kilimanjaro Express','Dar Express','Scandinavian'],
  'Mwanza': ['Kilimanjaro Express','Scandinavian','Moderners'],
  'Mbeya':  ['Scandinavian','Fresh Ya Bus','Moderners','Shabiby'],
  'Songea': ['Scandinavian','Moderners','Hood Bus'],
  'Kigoma': ['Kilimanjaro Express','Scandinavian'],
};

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const SectionTitle = ({ icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px' }}>
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{title}</span>
    <div style={{ flex: 1, height: 1, backgroundColor: '#f1f5f9' }} />
  </div>
);

const Field = ({ label, required, children, hint }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
    {children}
    {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
  </div>
);

const OfflineIntercityOrder = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [products, setProducts]       = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [routeInfo, setRouteInfo]     = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [sellerCity, setSellerCity]   = useState('');

  const [form, setForm] = useState({
    productId: '', quantity: '1',
    buyerName: '', buyerPhone: '', destinationCity: '', deliveryAddress: '',
    shippingMethod: 'agent',
    busCompany: '', busTicketNumber: '', busDeparture: '',
    courierName: '', externalTrackingRef: '',
    paymentMethod: 'M-Pesa', paymentRef: '', notes: '',
  });

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchProducts();
    fetchSellerCity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/my/products');
      setProducts(res.data || []);
    } catch { setProducts([]); }
    finally { setLoadingProducts(false); }
  };

  const fetchSellerCity = async () => {
    try {
      const res = await api.get('/store/profile');
      const loc = res.data?.businessLocation || res.data?.sellerCity || 'Dar es Salaam';
      setSellerCity(loc.split(',')[0].trim());
    } catch { setSellerCity('Dar es Salaam'); }
  };

  const lookupRoute = useCallback(async (destCity) => {
    if (!destCity) { setRouteInfo(null); return; }
    try {
      setRouteLoading(true);
      const origin = sellerCity || 'Dar es Salaam';
      const res = await api.get(
        `/super-agents/route/${encodeURIComponent(origin)}/${encodeURIComponent(destCity)}`
      );
      setRouteInfo(res.data || null);
    } catch { setRouteInfo(null); }
    finally { setRouteLoading(false); }
  }, [sellerCity]);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === 'destinationCity') lookupRoute(value);
  };

  const getExpectedArrival = () => {
    if (!routeInfo?.estimatedDays) return null;
    const date = new Date();
    date.setDate(date.getDate() + routeInfo.estimatedDays);
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    return date.toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const selectedProduct = products.find(p => String(p.id) === String(form.productId));
  const busCompanies = BUS_COMPANIES[form.destinationCity] || BUS_COMPANIES.default;

  const validate = () => {
    if (!form.productId)                return 'Chagua bidhaa';
    if (!form.buyerName.trim())         return 'Weka jina la mnunuzi';
    if (!form.buyerPhone.trim())        return 'Weka simu ya mnunuzi';
    if (!form.destinationCity)          return 'Chagua mji wa mwisho';
    if (!form.deliveryAddress.trim())   return 'Weka anwani ya uwasilishaji';
    if (form.shippingMethod === 'bus' && !form.busCompany)  return 'Chagua kampuni ya basi';
    if (form.shippingMethod === 'bus' && !form.busTicketNumber.trim()) return 'Weka nambari ya tiketi';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post('/super-agents/offline-intercity', {
        // Product / seller side
        productId:           form.productId,
        quantity:            Number(form.quantity) || 1,
        // Buyer / recipient
        buyerName:           form.buyerName.trim(),
        buyerPhone:          form.buyerPhone.trim(),
        destinationCity:     form.destinationCity,
        deliveryAddress:     form.deliveryAddress.trim(),
        // Shipping
        shippingMethod:      form.shippingMethod,
        busCompany:          form.shippingMethod === 'bus'     ? form.busCompany : null,
        busTicketNumber:     form.shippingMethod === 'bus'     ? form.busTicketNumber.trim() : null,
        busDeparture:        form.shippingMethod === 'bus'     ? form.busDeparture : null,
        courierName:         form.shippingMethod === 'courier' ? form.courierName.trim() : null,
        externalTrackingRef: form.shippingMethod === 'courier' ? form.externalTrackingRef.trim() : null,
        // Payment
        paymentMethod:       form.paymentMethod,
        paymentRef:          form.paymentRef.trim() || null,
        notes:               form.notes.trim() || null,
        // Route info (for parcel creation)
        transitCity:         routeInfo?.transitCity || null,
        estimatedDays:       routeInfo?.estimatedDays || null,
      });
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuunda agizo');
    } finally { setLoading(false); }
  };

  const handleNew = () => {
    setResult(null);
    setRouteInfo(null);
    setForm({ productId: '', quantity: '1', buyerName: '', buyerPhone: '',
      destinationCity: '', deliveryAddress: '', shippingMethod: 'agent',
      busCompany: '', busTicketNumber: '', busDeparture: '',
      courierName: '', externalTrackingRef: '',
      paymentMethod: 'M-Pesa', paymentRef: '', notes: '' });
    setError('');
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="OfflineIntercityOrder" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="Agizo la Mkoa" />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 24, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>Agizo Limesajiliwa!</h2>
          <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>Mpe mnunuzi namba hii ya kufuatilia</p>
        </div>

        {/* Tracking number */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>NAMBA YA KUFUATILIA</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
            {result.trackingNumber}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            Fuatilia: kentexa.com/?track={result.trackingNumber}
          </div>
        </div>

        {/* Route + ETA summary */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📋 Muhtasari</div>
          {[
            ['Bidhaa', selectedProduct?.name || form.productId],
            ['Mnunuzi', form.buyerName],
            ['Simu', form.buyerPhone],
            ['Kutoka', sellerCity || 'Dar es Salaam'],
            ['Kwenda', form.destinationCity],
            ...(result.transitCity ? [['Via (Transit)', result.transitCity]] : []),
            ['Muda wa Utoaji', result.estimatedDays ? `Siku ${result.estimatedDays}` : '—'],
            ['Inatarajiwa Kufika', getExpectedArrival() || '—'],
            ['Njia ya Usafirishaji',
              form.shippingMethod === 'agent'   ? '🏢 KenteXa Super Agent' :
              form.shippingMethod === 'bus'     ? `🚌 ${form.busCompany} (Tiketi: ${form.busTicketNumber})` :
              `📦 ${form.courierName} (Ref: ${form.externalTrackingRef})`],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>{l}</span>
              <span style={{ fontWeight: 700, color: '#1e293b', textAlign: 'right', maxWidth: '60%' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleNew}
            style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
            📦 Agizo Jipya
          </button>
          <button onClick={() => onNavigate('SellerDashboard')}
            style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            🏪 Dashibodi
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="OfflineIntercityOrder" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="🚚 Agizo la Mkoa — Mkono" />

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          💡 Mnunuzi alikuja dukani au alikupigia simu? Sajili hapa. Malipo umeshapata. Tutashughulikia usafirishaji.
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Product selection */}
          <SectionTitle icon="📦" title="Bidhaa" />
          <Field label="Chagua Bidhaa *">
            {loadingProducts ? (
              <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>⏳ Inapakia bidhaa...</div>
            ) : (
              <select value={form.productId} onChange={e => set('productId', e.target.value)} style={inputStyle}>
                <option value="">— Chagua Bidhaa —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — TZS {Number(p.basePrice).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {selectedProduct && (
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              {selectedProduct.images?.[0] && (
                <img src={selectedProduct.images[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{selectedProduct.name}</div>
                <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                  TZS {Number(selectedProduct.basePrice).toLocaleString()}
                  {selectedProduct.deliveryFee > 0 && (
                    <span style={{ color: '#64748b', fontWeight: 400 }}> + TZS {Number(selectedProduct.deliveryFee).toLocaleString()} (usafirishaji)</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <Field label="Idadi">
            <input type="number" min="1" value={form.quantity}
              onChange={e => set('quantity', e.target.value)} style={inputStyle} />
          </Field>

          {/* Buyer info */}
          <SectionTitle icon="👤" title="Mnunuzi" />
          <Field label="Jina la Mnunuzi *">
            <input type="text" placeholder="e.g. Amina Hassan"
              value={form.buyerName} onChange={e => set('buyerName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Simu ya Mnunuzi *" hint="Atatumwa SMS na namba ya kufuatilia">
            <input type="tel" placeholder="0712345678 au 255712345678"
              value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} style={inputStyle} />
          </Field>

          {/* Destination */}
          <SectionTitle icon="📍" title="Mji wa Mwisho" />
          <Field label="Mji *">
            <select value={form.destinationCity} onChange={e => set('destinationCity', e.target.value)} style={inputStyle}>
              <option value="">— Chagua Mji —</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {/* ETA card — shown when city selected */}
          {form.destinationCity && (
            <div style={{ marginBottom: 14 }}>
              {routeLoading ? (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
                  ⏳ Inatafuta njia...
                </div>
              ) : routeInfo ? (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>📅 Maelezo ya Njia</div>

                  {/* Transit route */}
                  {routeInfo.transitCity && (
                    <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#92400e' }}>
                      🔄 <strong>Via {routeInfo.transitCity}</strong> — hakuna basi la moja kwa moja
                      {routeInfo.leg1Days && routeInfo.leg2Days && (
                        <span> (siku {routeInfo.leg1Days} + siku {routeInfo.leg2Days})</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>MUDA WA UTOAJI</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>
                        Siku {routeInfo.estimatedDays}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>INATARAJIWA KUFIKA</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>
                        {getExpectedArrival() || '—'}
                      </div>
                    </div>
                  </div>

                  {routeInfo.primaryTransport && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      🚌 Usafiri wa kawaida: {
                        routeInfo.primaryTransport === 'bus'       ? 'Basi' :
                        routeInfo.primaryTransport === 'agent_van' ? 'Van ya Agent' :
                        routeInfo.primaryTransport === 'courier'   ? 'Courier' : routeInfo.primaryTransport
                      }
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c' }}>
                  ⚠️ Hakuna njia iliyosajiliwa kwa {form.destinationCity}. Muda wa utoaji utategemea usafiri unaochagua.
                </div>
              )}
            </div>
          )}

          <Field label="Anwani ya Uwasilishaji *" hint="Mtaa, alama muhimu — wakala atatumia hii">
            <textarea rows={2} placeholder="e.g. Karibu na kanisa, nyumba ya paa la bati nyekundu"
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Shipping method */}
          <SectionTitle icon="🚚" title="Njia ya Usafirishaji" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { value: 'agent',   label: '🏢 Super Agent', desc: 'KenteXa itashughulikia' },
              { value: 'bus',     label: '🚌 Basi',         desc: 'Wewe unatuma' },
              { value: 'courier', label: '📦 Courier',       desc: 'DHL, EMS n.k.' },
            ].map(m => (
              <button key={m.value} onClick={() => set('shippingMethod', m.value)}
                style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 11,
                  fontWeight: 700, textAlign: 'center',
                  border: form.shippingMethod === m.value ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                  backgroundColor: form.shippingMethod === m.value ? '#eff6ff' : '#fff',
                  color: form.shippingMethod === m.value ? '#1d4ed8' : '#64748b' }}>
                <div>{m.label}</div>
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Bus fields */}
          {form.shippingMethod === 'bus' && (
            <>
              <Field label="Kampuni ya Basi *">
                <select value={form.busCompany} onChange={e => set('busCompany', e.target.value)} style={inputStyle}>
                  <option value="">— Chagua Kampuni —</option>
                  {busCompanies.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Namba ya Tiketi *">
                  <input type="text" placeholder="e.g. KE-12345"
                    value={form.busTicketNumber} onChange={e => set('busTicketNumber', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Tarehe ya Kuondoka">
                  <input type="date" value={form.busDeparture}
                    onChange={e => set('busDeparture', e.target.value)} style={inputStyle} />
                </Field>
              </div>
            </>
          )}

          {/* Courier fields */}
          {form.shippingMethod === 'courier' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Jina la Courier">
                <input type="text" placeholder="e.g. DHL, EMS"
                  value={form.courierName} onChange={e => set('courierName', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Ref ya Kufuatilia">
                <input type="text" placeholder="Namba ya courier"
                  value={form.externalTrackingRef} onChange={e => set('externalTrackingRef', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          )}

          {/* Payment */}
          <SectionTitle icon="💰" title="Malipo (Umeshapokea)" />
          <Field label="Njia ya Malipo">
            <div style={{ display: 'flex', gap: 8 }}>
              {['M-Pesa','Airtel Money','Tigo Pesa','Halotel','Pesa Taslimu'].map(m => (
                <button key={m} onClick={() => set('paymentMethod', m)}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 10, fontWeight: 700, textAlign: 'center',
                    border: form.paymentMethod === m ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    backgroundColor: form.paymentMethod === m ? '#dcfce7' : '#fff',
                    color: form.paymentMethod === m ? '#15803d' : '#64748b' }}>
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Ref ya Malipo (si lazima)">
            <input type="text" placeholder="e.g. namba ya M-Pesa confirmation"
              value={form.paymentRef} onChange={e => set('paymentRef', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Maelezo Zaidi">
            <input type="text" placeholder="Maelezo yoyote ya ziada"
              value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} />
          </Field>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', background: loading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#fff', border: 'none', padding: 16, borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900,
              marginTop: 8, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
            {loading ? '⏳ Inasajili...' : '✅ Sajili Agizo'}
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default OfflineIntercityOrder;