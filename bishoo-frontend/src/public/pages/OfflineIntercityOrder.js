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
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

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

const API_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const OfflineIntercityOrder = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'en-GB';
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
    return date.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const selectedProduct = products.find(p => String(p.id) === String(form.productId));
  const busCompanies = BUS_COMPANIES[form.destinationCity] || BUS_COMPANIES.default;

  const validate = () => {
    if (!form.productId)                return t('offline_intercity_order.validate_select_product');
    if (!form.buyerName.trim())         return t('offline_intercity_order.validate_buyer_name');
    if (!form.buyerPhone.trim())        return t('offline_intercity_order.validate_buyer_phone');
    if (!form.destinationCity)          return t('offline_intercity_order.validate_destination_city');
    if (!form.deliveryAddress.trim())   return t('offline_intercity_order.validate_delivery_address');
    if (form.shippingMethod === 'bus' && !form.busCompany)  return t('offline_intercity_order.validate_bus_company');
    if (form.shippingMethod === 'bus' && !form.busTicketNumber.trim()) return t('offline_intercity_order.validate_ticket_number');
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    try {
      setLoading(true); setError('');
      const res = await api.post('/orders/on-behalf', {
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
      setError(err?.response?.data?.message || t('offline_intercity_order.create_failed'));
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
      <BackBar onBack={() => onNavigate('SellerDashboard')} title={t('offline_intercity_order.success_page_title')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 90 }}>

        <div style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', borderRadius: 20, padding: 24, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>{t('offline_intercity_order.success_title')}</h2>
          <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>{t('offline_intercity_order.success_desc')}</p>
        </div>

        {/* Tracking number */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>{t('offline_intercity_order.tracking_number_label')}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace', letterSpacing: 2 }}>
            {result.trackingNumber}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            {t('offline_intercity_order.track_link', { number: result.trackingNumber })}
          </div>
        </div>

        {/* Receipt */}
        {result.receiptNumber && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 6 }}>{t('offline_intercity_order.receipt_number_label')}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 }}>
              {result.receiptNumber}
            </div>
            <a href={`${API_URL}/invoices/receipt/${result.receiptNumber}/pdf`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              {t('offline_intercity_order.download_receipt_button')}
            </a>
          </div>
        )}

        {/* Route + ETA summary */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('offline_intercity_order.summary_title')}</div>
          {[
            [t('offline_intercity_order.summary_product'), selectedProduct?.name || form.productId],
            [t('offline_intercity_order.summary_buyer'), form.buyerName],
            [t('offline_intercity_order.summary_phone'), form.buyerPhone],
            [t('offline_intercity_order.summary_from'), sellerCity || 'Dar es Salaam'],
            [t('offline_intercity_order.summary_to'), form.destinationCity],
            ...(result.transitCity ? [[t('offline_intercity_order.summary_via_transit'), result.transitCity]] : []),
            [t('offline_intercity_order.summary_delivery_time'), result.estimatedDays ? t('offline_intercity_order.days_value', { count: result.estimatedDays }) : '—'],
            [t('offline_intercity_order.summary_expected_arrival'), getExpectedArrival() || '—'],
            [t('offline_intercity_order.summary_shipping_method'),
              form.shippingMethod === 'agent'   ? t('offline_intercity_order.method_agent_name') :
              form.shippingMethod === 'bus'     ? t('offline_intercity_order.method_bus_name', { company: form.busCompany, ticket: form.busTicketNumber }) :
              t('offline_intercity_order.method_courier_name', { courier: form.courierName, ref: form.externalTrackingRef })],
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
            {t('offline_intercity_order.new_order_button')}
          </button>
          <button onClick={() => onNavigate('SellerDashboard')}
            style={{ flex: 1, background: '#fff', color: '#475569', border: '2px solid #e2e8f0', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            {t('offline_intercity_order.dashboard_button')}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('SellerDashboard')} title={t('offline_intercity_order.form_title')} />

      <div style={{ padding: 16, maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 90 }}>

        <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
          {t('offline_intercity_order.info_banner')}
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Product selection */}
          <SectionTitle icon="📦" title={t('offline_intercity_order.section_product')} />
          <Field label={t('offline_intercity_order.select_product_label')}>
            {loadingProducts ? (
              <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>{t('offline_intercity_order.loading_products')}</div>
            ) : (
              <select value={form.productId} onChange={e => set('productId', e.target.value)} style={inputStyle}>
                <option value="">{t('offline_intercity_order.select_product_placeholder')}</option>
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
                    <span style={{ color: '#64748b', fontWeight: 400 }}> + TZS {Number(selectedProduct.deliveryFee).toLocaleString()} {t('offline_intercity_order.shipping_fee_suffix')}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <Field label={t('offline_intercity_order.quantity_label')}>
            <input type="number" min="1" value={form.quantity}
              onChange={e => set('quantity', e.target.value)} style={inputStyle} />
          </Field>

          {/* Buyer info */}
          <SectionTitle icon="👤" title={t('offline_intercity_order.section_buyer')} />
          <Field label={t('offline_intercity_order.buyer_name_label')}>
            <input type="text" placeholder={t('offline_intercity_order.buyer_name_placeholder')}
              value={form.buyerName} onChange={e => set('buyerName', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('offline_intercity_order.buyer_phone_label')} hint={t('offline_intercity_order.buyer_phone_hint')}>
            <input type="tel" placeholder={t('offline_intercity_order.buyer_phone_placeholder')}
              value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} style={inputStyle} />
          </Field>

          {/* Destination */}
          <SectionTitle icon="📍" title={t('offline_intercity_order.section_destination')} />
          <Field label={t('offline_intercity_order.city_label')}>
            <select value={form.destinationCity} onChange={e => set('destinationCity', e.target.value)} style={inputStyle}>
              <option value="">{t('offline_intercity_order.select_city_placeholder')}</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {/* ETA card — shown when city selected */}
          {form.destinationCity && (
            <div style={{ marginBottom: 14 }}>
              {routeLoading ? (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
                  {t('offline_intercity_order.finding_route')}
                </div>
              ) : routeInfo ? (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>{t('offline_intercity_order.route_details_title')}</div>

                  {/* Transit route */}
                  {routeInfo.transitCity && (
                    <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#92400e' }}>
                      🔄 <strong>{t('offline_intercity_order.via_transit', { city: routeInfo.transitCity })}</strong>{t('offline_intercity_order.no_direct_bus')}
                      {routeInfo.leg1Days && routeInfo.leg2Days && (
                        <span>{t('offline_intercity_order.days_suffix', { leg1: routeInfo.leg1Days, leg2: routeInfo.leg2Days })}</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{t('offline_intercity_order.delivery_time_label')}</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>
                        {t('offline_intercity_order.days_value', { count: routeInfo.estimatedDays })}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{t('offline_intercity_order.expected_arrival_label')}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>
                        {getExpectedArrival() || '—'}
                      </div>
                    </div>
                  </div>

                  {routeInfo.primaryTransport && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      🚌 {t('offline_intercity_order.common_transport_label')} {
                        routeInfo.primaryTransport === 'bus'       ? t('offline_intercity_order.transport_bus') :
                        routeInfo.primaryTransport === 'agent_van' ? t('offline_intercity_order.transport_agent_van') :
                        routeInfo.primaryTransport === 'courier'   ? t('offline_intercity_order.transport_courier') : routeInfo.primaryTransport
                      }
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#c2410c' }}>
                  {t('offline_intercity_order.no_route_registered', { city: form.destinationCity })}
                </div>
              )}
            </div>
          )}

          <Field label={t('offline_intercity_order.delivery_address_label')} hint={t('offline_intercity_order.delivery_address_hint')}>
            <textarea rows={2} placeholder={t('offline_intercity_order.delivery_address_placeholder')}
              value={form.deliveryAddress} onChange={e => set('deliveryAddress', e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

          {/* Shipping method */}
          <SectionTitle icon="🚚" title={t('offline_intercity_order.section_shipping_method')} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { value: 'agent',   label: t('offline_intercity_order.method_agent'), desc: t('offline_intercity_order.method_agent_desc') },
              { value: 'bus',     label: t('offline_intercity_order.method_bus'),         desc: t('offline_intercity_order.method_bus_desc') },
              { value: 'courier', label: t('offline_intercity_order.method_courier'),       desc: t('offline_intercity_order.method_courier_desc') },
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
              <Field label={t('offline_intercity_order.bus_company_label')}>
                <select value={form.busCompany} onChange={e => set('busCompany', e.target.value)} style={inputStyle}>
                  <option value="">{t('offline_intercity_order.select_company_placeholder')}</option>
                  {busCompanies.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={t('offline_intercity_order.ticket_number_label')}>
                  <input type="text" placeholder="e.g. KE-12345"
                    value={form.busTicketNumber} onChange={e => set('busTicketNumber', e.target.value)} style={inputStyle} />
                </Field>
                <Field label={t('offline_intercity_order.departure_date_label')}>
                  <input type="date" value={form.busDeparture}
                    onChange={e => set('busDeparture', e.target.value)} style={inputStyle} />
                </Field>
              </div>
            </>
          )}

          {/* Courier fields */}
          {form.shippingMethod === 'courier' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={t('offline_intercity_order.courier_name_label')}>
                <input type="text" placeholder="e.g. DHL, EMS"
                  value={form.courierName} onChange={e => set('courierName', e.target.value)} style={inputStyle} />
              </Field>
              <Field label={t('offline_intercity_order.courier_ref_label')}>
                <input type="text" placeholder={t('offline_intercity_order.courier_ref_placeholder')}
                  value={form.externalTrackingRef} onChange={e => set('externalTrackingRef', e.target.value)} style={inputStyle} />
              </Field>
            </div>
          )}

          {/* Payment */}
          <SectionTitle icon="💰" title={t('offline_intercity_order.section_payment')} />
          <Field label={t('offline_intercity_order.payment_method_label')}>
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
          <Field label={t('offline_intercity_order.payment_ref_label')}>
            <input type="text" placeholder={t('offline_intercity_order.payment_ref_placeholder')}
              value={form.paymentRef} onChange={e => set('paymentRef', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={t('offline_intercity_order.notes_label')}>
            <input type="text" placeholder={t('offline_intercity_order.notes_placeholder')}
              value={form.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} />
          </Field>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', background: loading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#fff', border: 'none', padding: 16, borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 900,
              marginTop: 8, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
            {loading ? t('offline_intercity_order.registering') : t('offline_intercity_order.register_order_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineIntercityOrder;