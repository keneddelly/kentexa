import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { buildBuyerInquiryMessage } from '../utils/whatsapp-link';

const CITY_TRANSIT_DAYS = {
  'dar-mbeya': 1, 'dar-mwanza': 1, 'dar-arusha': 1, 'dar-dodoma': 1,
  'dar-tanga': 1, 'dar-morogoro': 1, 'dar-mtwara': 2, 'dar-songea': 2,
  'dar-kigoma': 3, 'dar-tabora': 2, 'dar-shinyanga': 2, 'dar-bukoba': 2,
};
const getETA = (origin, dest, type, t) => {
  if (!origin || !dest) return null;
  const key = `${origin.toLowerCase().split(' ')[0]}-${dest.toLowerCase().split(' ')[0]}`;
  const rev = `${dest.toLowerCase().split(' ')[0]}-${origin.toLowerCase().split(' ')[0]}`;
  const days = CITY_TRANSIT_DAYS[key] || CITY_TRANSIT_DAYS[rev] || 2;
  const total = type === 'boda' ? 0 : type === 'van' ? Math.round(days * 0.5) : days;
  const eta = new Date(); eta.setDate(eta.getDate() + total);
  if (total === 0) return t('track_parcel.eta_today');
  if (total === 1) return t('track_parcel.eta_tomorrow');
  return eta.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
};

// ── Status steps — keys match BOTH SuperAgent parcel statuses AND
//    the mapped statuses returned by trackByOrderId ──────────────
// Batch parcel status → STATUS_STEPS key mapping
const BATCH_STATUS_MAP = {
  awaiting_handover: 'pending',
  at_hub:            'ready_for_dispatch',
  on_van:            'in_transit',
  at_zone:           'arrived_at_hub',
  out_for_delivery:  'out_for_delivery',
  delivered:         'delivered',
};

const getStatusSteps = t => [
  { key: 'pending',            icon: '📋', swLabel: t('track_parcel.step_pending_label'),            desc: t('track_parcel.step_pending_desc'),            color: '#64748b' },
  { key: 'paid',               icon: '💳', swLabel: t('track_parcel.step_paid_label'),               desc: t('track_parcel.step_paid_desc'),               color: '#7c3aed' },
  { key: 'ready_for_dispatch', icon: '📦', swLabel: t('track_parcel.step_ready_for_dispatch_label'), desc: t('track_parcel.step_ready_for_dispatch_desc'), color: '#f59e0b' },
  { key: 'dispatched',         icon: '🚀', swLabel: t('track_parcel.step_dispatched_label'),         desc: t('track_parcel.step_dispatched_desc'),         color: '#f97316' },
  { key: 'in_transit',         icon: '🚌', swLabel: t('track_parcel.step_in_transit_label'),         desc: t('track_parcel.step_in_transit_desc'),         color: '#1d4ed8' },
  { key: 'arrived_at_hub',     icon: '🏙️', swLabel: t('track_parcel.step_arrived_at_hub_label'),     desc: t('track_parcel.step_arrived_at_hub_desc'),     color: '#0891b2' },
  { key: 'out_for_delivery',   icon: '🏍️', swLabel: t('track_parcel.step_out_for_delivery_label'), desc: t('track_parcel.step_out_for_delivery_desc'),   color: '#059669' },
  { key: 'delivered',          icon: '✅', swLabel: t('track_parcel.step_delivered_label'),          desc: t('track_parcel.step_delivered_desc'),          color: '#16a34a' },
];

const STATUS_COLOR = {
  pending:            { bg: '#fef9c3', color: '#ca8a04' },
  received_at_hub:    { bg: '#dbeafe', color: '#2563eb' },
  ready_for_dispatch: { bg: '#fef3c7', color: '#d97706' },
  dispatched:         { bg: '#ffedd5', color: '#ea580c' },
  in_transit:         { bg: '#e0f2fe', color: '#0284c7' },
  arrived_at_hub:     { bg: '#d1fae5', color: '#059669' },
  out_for_delivery:   { bg: '#dcfce7', color: '#16a34a' },
  delivered:          { bg: '#dcfce7', color: '#15803d' },
  returned:           { bg: '#fee2e2', color: '#dc2626' },
  disputed:           { bg: '#fee2e2', color: '#991b1b' },
};

const getMethodInfo = t => ({
  boda:     { icon: '🛵', label: t('track_parcel.method_boda_label'),     desc: t('track_parcel.method_boda_desc') },
  personal: { icon: '🚶', label: t('track_parcel.method_personal_label'), desc: t('track_parcel.method_personal_desc') },
  direct:   { icon: '📦', label: t('track_parcel.method_direct_label'),   desc: t('track_parcel.method_direct_desc') },
  agent:    { icon: '🏢', label: t('track_parcel.method_agent_label'),    desc: t('track_parcel.method_agent_desc') },
});

const TrackParcel = ({ onNavigate, isLoggedIn, onLogout, userRole, trackingNumber: propTracking, orderId: propOrderId }) => {
  const { t } = useTranslation();
  const STATUS_STEPS = getStatusSteps(t);
  const METHOD_INFO = getMethodInfo(t);
  const [trackingInput, setTrackingInput] = useState(propTracking || (propOrderId ? `KTX-ORD-${propOrderId}` : ''));
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  useEffect(() => {
    if (propTracking) handleTrack(propTracking);
    else if (propOrderId) handleTrackByOrderId(propOrderId);
  }, [propTracking, propOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unified search — detects input type and routes correctly ──
  const handleSearch = async (input) => {
    const raw = (typeof input === 'string' ? input : null) || trackingInput;
    const val = String(raw || '').trim().toUpperCase();
    if (!val) { setError(t('track_parcel.error_empty')); return; }

    setLoading(true); setError(''); setResult(null);

    try {
      // 1. Pure number → order ID
      if (/^\d+$/.test(val)) {
        const res = await api.get(`/super-agents/track-order/${val}`);
        setResult({ ...res.data, _source: 'order' });
        return;
      }

      // 2. KTX-ORD-xxx → order ID
      const orderMatch = val.match(/^KTX-ORD-(\d+)$/);
      if (orderMatch) {
        const res = await api.get(`/super-agents/track-order/${orderMatch[1]}`);
        setResult({ ...res.data, _source: 'order' });
        return;
      }

      // 2b. KTX-BATCH-batchId-orderId → track batch parcel by order ID
      const batchMatch = val.match(/^KTX-BATCH-\d+-(\d+)$/);
      if (batchMatch) {
        const res = await api.get(`/super-agents/track-order/${batchMatch[1]}`);
        setResult({ ...res.data, _source: 'batch' });
        return;
      }

      // 2c. KTX-OFFLINE-batchId-orderId → same
      const offlineMatch = val.match(/^KTX-OFFLINE-\d+-(\d+)$/);
      if (offlineMatch) {
        const res = await api.get(`/super-agents/track-order/${offlineMatch[1]}`);
        setResult({ ...res.data, _source: 'batch' });
        return;
      }

      // 3. KTX-XXX-XXX-xxxxxx → Super Agent parcel
      if (val.startsWith('KTX-')) {
        try {
          const res = await api.get(`/super-agents/track/${val}`);
          setResult({ ...res.data, _source: 'superagent' });
          return;
        } catch (superAgentErr) {
          // KTX- prefix but not found as parcel — try as order fallback
          // e.g. user typed KTX-BATCH-xxx from batch system
          const batchMatch = val.match(/KTX-(?:BATCH|OFFLINE)-\d+-(\d+)/);
          if (batchMatch) {
            const res = await api.get(`/super-agents/track-order/${batchMatch[1]}`);
            setResult({ ...res.data, _source: 'order' });
            return;
          }
          throw superAgentErr;
        }
      }

      // 4. Anything else — try super agent first
      try {
        const res = await api.get(`/super-agents/track/${val}`);
        setResult({ ...res.data, _source: 'superagent' });
      } catch {
        // 5. Last resort — search orders by trackingNumber field
        try {
          const searchRes = await api.get(`/orders/by-tracking/${encodeURIComponent(val)}`);
          if (searchRes.data?.id) {
            const orderRes = await api.get(`/super-agents/track-order/${searchRes.data.id}`);
            setResult({ ...orderRes.data, _source: 'order' });
          } else {
            setError(t('track_parcel.error_not_found', { val }));
          }
        } catch {
          setError(t('track_parcel.error_not_found', { val }));
        }
      }

    } catch (err) {
      setError(err?.response?.data?.message || t('track_parcel.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  // Keep handleTrack as alias for backward compat (used in useEffect)
  const handleTrack = (tn) => handleSearch(typeof tn === 'string' ? tn : null);
  const handleTrackByOrderId = async (id) => {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.get(`/super-agents/track-order/${id}`);
      setResult({ ...res.data, _source: 'order' });
    } catch (err) {
      setError(err?.response?.data?.message || t('track_parcel.error_order_not_found', { id }));
    } finally {
      setLoading(false);
    }
  };

  const getStepIndex = (status) => {
    // Map batch parcel status to step key first
    const mapped = BATCH_STATUS_MAP[status] || status;
    return STATUS_STEPS.findIndex(s => s.key === mapped);
  };
  const currentStep  = result ? getStepIndex(result.status) : -1;
  const methodInfo   = result?.shippingMethod ? (METHOD_INFO[result.shippingMethod] || METHOD_INFO.agent) : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', padding: '32px 16px', textAlign: 'center', position:'relative' }}>
        <button onClick={() => onNavigate('back')} style={{ position:'absolute', top:14, left:14,
          background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, padding:6, cursor:'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>{t('track_parcel.header_title')}</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{t('track_parcel.header_subtitle')}</p>
      </div>

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Search box */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder={t('track_parcel.search_placeholder')}
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'monospace', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.border = '2px solid #1d4ed8'}
              onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
            />
            <button onClick={() => handleSearch()} disabled={loading}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {loading ? '⏳' : t('track_parcel.track_button')}
            </button>
          </div>
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginTop: 12, fontSize: 13 }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <>
            {/* Status banner */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{t('track_parcel.tracking_number_label')}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: '#1d4ed8' }}>{result.trackingNumber}</div>
                  {result.trackingRef && result.trackingRef !== result.trackingNumber && (
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginTop: 2 }}>{t('track_parcel.ref_label', { ref: result.trackingRef })}</div>
                  )}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                  backgroundColor: (STATUS_COLOR[result.status] || { bg: '#f1f5f9' }).bg,
                  color: (STATUS_COLOR[result.status] || { color: '#64748b' }).color,
                }}>
                  {STATUS_STEPS.find(s => s.key === result.status)?.swLabel || result.status?.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              {/* WhatsApp contact — goes to seller's WhatsApp (BiS etc.) or KenteXa support */}
              <a
                href={buildBuyerInquiryMessage(result.sellerWhatsApp, {
                  trackingNumber:      result.trackingNumber,
                  productName:         result.product,
                  sellerStoreName:     result.sellerStoreName,
                  shippingMethod:      result.shippingMethod,
                  bodaName:            result.courierName,       // boda rider name, if set
                  bodaPhone:           result.localAgent?.phone,
                  busCompany:          result.busCompany,
                  busTicketNumber:     result.busTicketNumber,
                  courierName:         result.courierName,
                  externalTrackingRef: result.externalTrackingRef,
                })}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff',
                  padding: '11px 16px', borderRadius: 12, fontSize: 13, fontWeight: 800,
                  textDecoration: 'none', marginBottom: 14,
                }}>
                {t('track_parcel.whatsapp_contact')}
              </a>

              {/* Delivery method badge */}
              {methodInfo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 10, marginBottom: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 18 }}>{methodInfo.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{methodInfo.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{methodInfo.desc}</div>
                  </div>
                  {result.courierName && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>{result.courierName}</span>
                  )}
                </div>
              )}

              {/* Rich shipping info based on method */}
              {result.shippingMethod === 'bus' && (result.busCompany || result.busTicketNumber) && (
                <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>{t('track_parcel.bus_details_title')}</div>
                  {result.busCompany && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: '#92400e' }}>{t('track_parcel.company_label')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{result.busCompany}</span>
                    </div>
                  )}
                  {result.busTicketNumber && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: '#92400e' }}>{t('track_parcel.ticket_number_label')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{result.busTicketNumber}</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#b45309', marginTop: 8, lineHeight: 1.5 }}>
                    {t('track_parcel.bus_contact_hint')}
                  </div>
                </div>
              )}

              {result.shippingMethod === 'courier' && (result.courierName || result.externalTrackingRef) && (
                <div style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#4338ca', marginBottom: 8 }}>{t('track_parcel.courier_details_title')}</div>
                  {result.courierName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: '#4338ca' }}>{t('track_parcel.company_label')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{result.courierName}</span>
                    </div>
                  )}
                  {result.externalTrackingRef && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: '#4338ca' }}>{t('track_parcel.tracking_ref_label')}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace' }}>{result.externalTrackingRef}</span>
                    </div>
                  )}
                </div>
              )}

              {result.shippingMethod === 'kentexa_delivery' && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>{t('track_parcel.van_title')}</div>
                  {result.superAgentHub && <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 4 }}>🗺️ {result.superAgentHub}</div>}
                  {result.dispatchTime && (
                    <div style={{ fontSize: 12, color: '#1d4ed8' }}>
                      🕐 {t('track_parcel.departed_label', { time: new Date(result.dispatchTime).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) })}
                    </div>
                  )}
                  {result.estimatedArrival && (
                    <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4 }}>
                      ⏰ {t('track_parcel.eta_label', { time: new Date(result.estimatedArrival).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) })}
                    </div>
                  )}
                </div>
              )}

              {result.shippingMethod === 'agent' && result.superAgentHub && result.superAgentHub !== '—' && (
                <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>{t('track_parcel.super_agent_title')}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{result.superAgentHub}</div>
                  {result.destinationCity && <div style={{ fontSize: 12, color: '#16a34a', marginTop: 3 }}>📍 {result.destinationCity}</div>}
                  {(() => {
                    const eta = getETA(result.originCity, result.destinationCity, result.transportType, t);
                    return eta && !['completed','delivered'].includes(result.status) ? (
                      <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 700, marginTop: 4,
                        backgroundColor: '#f5f3ff', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>
                        {t('track_parcel.expected_label', { eta })}
                      </div>
                    ) : null;
                  })()}
                  {result.localAgent && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>{t('track_parcel.local_agent_title')}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{result.localAgent.name}</div>
                      {result.localAgent.phone && <div style={{ fontSize: 12, color: '#16a34a' }}>📞 {result.localAgent.phone}</div>}
                      {result.localAgent.address && <div style={{ fontSize: 12, color: '#64748b' }}>📍 {result.localAgent.address}</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Route */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{result.originCity || '—'}</span>
                <div style={{ flex: 1, position: 'relative', height: 2, backgroundColor: '#e2e8f0' }}>
                  <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', fontSize: 16 }}>
                    {methodInfo?.icon || '✈️'}
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{result.destinationCity || '—'}</span>
              </div>

              {/* Transit city — shown when route is multi-hop */}
              {result.transitCity && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🔄</span>
                  <span>
                    {t('track_parcel.via_transit_notice', { city: result.transitCity, dest: result.destinationCity })}
                  </span>
                </div>
              )}

              {/* Expected arrival */}
              {result.expectedArrival && (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📅</span>
                  <span>{t('track_parcel.expected_arrival_notice', { date: new Date(result.expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' }) })}</span>
                </div>
              )}
              {/* ── COMPLETE PARCEL INFORMATION ──────────────────────────── */}

              {/* Item details */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 0.5, marginBottom: 10 }}>{t('track_parcel.item_details_title')}</div>
                {[
                  [t('track_parcel.product_label'), result.description || result.product || result.manualProductName],
                  [t('track_parcel.weight_label'), result.weightKg ? `${result.weightKg} kg` : null],
                  [t('track_parcel.size_label'), result.parcelSize ? ({small:t('track_parcel.size_small'),medium:t('track_parcel.size_medium'),large:t('track_parcel.size_large'),cargo:t('track_parcel.size_cargo')}[result.parcelSize]||result.parcelSize) : null],
                  [t('track_parcel.value_label'), result.declaredValue ? `TZS ${Number(result.declaredValue).toLocaleString()}` : null],
                  [t('track_parcel.time_label'), result.estimatedDays ? t('track_parcel.days_value', { count: result.estimatedDays }) : null],
                ].filter(([,v]) => v).map(([l,v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                    <span style={{ color:'#64748b' }}>{l}</span>
                    <span style={{ fontWeight:700, color:'#1e293b' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Sender */}
              {(result.senderName || result.sellerStoreName) && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 0.5, marginBottom: 8 }}>{t('track_parcel.sender_title')}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{result.senderName || result.sellerStoreName}</div>
                  {result.senderPhone && <a href={`tel:${result.senderPhone}`} style={{ fontSize:13, color:'#1d4ed8', textDecoration:'none', display:'block', marginTop:4 }}>📞 {result.senderPhone}</a>}
                  {result.originCity && <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>📍 {result.originCity}</div>}
                </div>
              )}

              {/* Recipient */}
              {result.recipientName && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 0.5, marginBottom: 8 }}>{t('track_parcel.recipient_title')}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{result.recipientName}</div>
                  {result.deliveryAddress && <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>📍 {result.deliveryAddress}</div>}
                  {result.destinationCity && <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>🏙️ {result.destinationCity}</div>}
                  {(userRole === 'seller' || userRole === 'admin' || userRole === 'super_agent') && result.buyerPhone && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <a href={`tel:${result.buyerPhone}`} style={{ fontSize:13, color:'#1d4ed8', textDecoration:'none', fontWeight:700 }}>📞 {result.buyerPhone}</a>
                      <a href={`https://wa.me/${String(result.buyerPhone).replace(/[^\d]/g,'').replace(/^0/,'255')}`} target="_blank" rel="noreferrer" style={{ fontSize:10, backgroundColor:'#25D366', color:'#fff', padding:'2px 8px', borderRadius:6, textDecoration:'none', fontWeight:700 }}>WA</a>
                    </div>
                  )}
                  {/* Phone — only visible to logged-in seller or admin */}
                  {(userRole === 'seller' || userRole === 'admin' || userRole === 'super_agent') && result.buyerPhone && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <a href={`tel:${result.buyerPhone}`}
                        style={{ fontSize:13, color:'#1d4ed8', textDecoration:'none', fontWeight:700 }}>
                        📞 {result.buyerPhone}
                      </a>
                      <a href={`https://wa.me/${String(result.buyerPhone).replace(/[^\d]/g,'').replace(/^0/,'255')}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize:10, backgroundColor:'#25D366', color:'#fff',
                          padding:'2px 8px', borderRadius:6, textDecoration:'none', fontWeight:700 }}>
                        WA
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Origin Hub */}
              {result.originAgent && (
                <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', letterSpacing: 0.5, marginBottom: 8 }}>{t('track_parcel.origin_hub_title')}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{result.originAgent}</div>
                  {result.originAgentPhone && <a href={`tel:${result.originAgentPhone}`} style={{ fontSize:13, color:'#1d4ed8', textDecoration:'none', display:'block', marginTop:4 }}>📞 {result.originAgentPhone}</a>}
                  {result.originCity && <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>📍 {result.originCity}</div>}
                </div>
              )}

              {/* Destination Hub */}
              {result.destinationAgent && (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#15803d', letterSpacing: 0.5, marginBottom: 8 }}>{t('track_parcel.destination_hub_title')}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{result.destinationAgent}</div>
                  {result.destinationAgentPhone && <a href={`tel:${result.destinationAgentPhone}`} style={{ fontSize:13, color:'#16a34a', textDecoration:'none', display:'block', marginTop:4 }}>📞 {result.destinationAgentPhone}</a>}
                  {result.destinationCity && <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>📍 {result.destinationCity}</div>}
                </div>
              )}

              {/* Bus / Courier details */}
              {(result.busCompany || result.busTicketNumber || result.courierName || result.courierTrackingRef) && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', letterSpacing: 0.5, marginBottom: 10 }}>
                    {result.busCompany ? t('track_parcel.bus_details_title') : t('track_parcel.courier_details_title')}
                  </div>
                  {[
                    [t('track_parcel.company_label'), result.busCompany || result.courierName],
                    [t('track_parcel.tracking_ref_label'), result.busTicketNumber || result.courierTrackingRef],
                    [t('track_parcel.departure_label'), result.busDeparture],
                  ].filter(([,v]) => v).map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #fde68a', fontSize:13 }}>
                      <span style={{ color:'#92400e' }}>{l}</span>
                      <span style={{ fontWeight:900, color: l===t('track_parcel.tracking_ref_label') ? '#1d4ed8' : '#1e293b', fontFamily: l===t('track_parcel.tracking_ref_label') ? 'monospace' : 'inherit', fontSize: l===t('track_parcel.tracking_ref_label') ? 15 : 13 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}


            {/* ── KenteXa Marketing Footer ─────────────────────────────── */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: 16, padding: 20, marginTop: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 16, marginBottom: 6 }}>🛡️</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', marginBottom: 6 }}>{t('track_parcel.protected_title')}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 14 }}>
                {t('track_parcel.protected_desc')}
              </div>
              {/* Only pitch "get your seller onto KenteXa" when we don't already
                  know who the seller is — showing it next to a Sender card with
                  their real name is a contradiction, not a nudge. */}
              {!(result.senderName || result.sellerStoreName) && (
                <>
                  <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 14 }} />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    {t('track_parcel.seller_not_using_prompt')}
                  </div>
                  <div style={{ fontSize: 12, color: '#93c5fd', marginBottom: 16, lineHeight: 1.6 }}>
                    {t('track_parcel.seller_not_using_desc')}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href="https://kentexa.com/for-sellers" target="_blank" rel="noreferrer"
                      style={{ flex: 1, backgroundColor: '#1d4ed8', color: '#fff', padding: '10px 8px',
                        borderRadius: 8, textDecoration: 'none', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                      {t('track_parcel.register_seller_button')}
                    </a>
                    <a href={'https://wa.me/255788075633?text=' + encodeURIComponent('Habari! Nataka kujua zaidi kuhusu KenteXa kwa wauzaji')}
                      target="_blank" rel="noreferrer"
                      style={{ flex: 1, backgroundColor: '#25D366', color: '#fff', padding: '10px 8px',
                        borderRadius: 8, textDecoration: 'none', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                      {t('track_parcel.ask_whatsapp_button')}
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* Local agent card */}
            {result.localAgent && (
              <div style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12, border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#047857', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('track_parcel.your_delivery_agent_title')}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>{result.localAgent.name}</div>
                {result.localAgent.address && (
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>📍 {result.localAgent.address}</div>
                )}
                {result.localAgent.phone && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={`tel:${result.localAgent.phone}`}
                      style={{ flex: 1, textAlign: 'center', backgroundColor: '#fff', color: '#047857', border: '2px solid #6ee7b7', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                      {t('track_parcel.call_button')}
                    </a>
                    <a href={`https://wa.me/${result.localAgent.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, textAlign: 'center', backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                      {t('track_parcel.whatsapp_button')}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Boda/Personal contact seller card — shown when method is boda or personal */}
            {(result.shippingMethod === 'boda' || result.shippingMethod === 'personal') && result.status !== 'delivered' && (
              <div style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', borderRadius: 16, padding: 18, marginBottom: 12, border: '1px solid #fed7aa' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c', marginBottom: 8 }}>
                  {result.shippingMethod === 'boda' ? t('track_parcel.boda_coming_title') : t('track_parcel.personal_delivery_title')}
                </div>
                <div style={{ fontSize: 13, color: '#7c2d12', marginBottom: 10, lineHeight: 1.6 }}>
                  {result.shippingMethod === 'boda'
                    ? t('track_parcel.boda_desc')
                    : t('track_parcel.personal_desc')
                  }
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c' }}>
                  {t('track_parcel.order_number_hint', { num: result.trackingNumber?.replace('KTX-ORD-', '') || '—' })}
                </div>
              </div>
            )}

            {/* Progress steps */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 16px', fontFamily: 'Manrope,sans-serif' }}>{t('track_parcel.progress_title')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {STATUS_STEPS.map((step, index) => {
                  const isDone    = currentStep >= 0 && index <= currentStep;
                  const isCurrent = index === currentStep;
                  return (
                    <div key={step.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: isCurrent ? 16 : 13,
                          backgroundColor: isCurrent ? (step.color || '#1d4ed8') : isDone ? '#1d4ed8' : '#f1f5f9',
                          border: isCurrent ? `3px solid ${step.color || '#1d4ed8'}` : isDone ? 'none' : '2px solid #e2e8f0',
                          boxShadow: isCurrent ? `0 0 0 4px ${(step.color || '#1d4ed8')}26` : 'none',
                          color: isDone ? '#fff' : '#cbd5e1',
                        }}>
                          {isDone ? (isCurrent ? step.icon : '✓') : '○'}
                        </div>
                        {index < STATUS_STEPS.length - 1 && (
                          <div style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: isDone ? '#1d4ed8' : '#e2e8f0', margin: '2px 0', transition: 'background-color 0.3s' }} />
                        )}
                      </div>
                      <div style={{ paddingBottom: 16, paddingTop: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: isCurrent ? 900 : 600,
                          color: isDone ? '#1e293b' : '#94a3b8' }}>
                          {step.swLabel}
                        </div>
                        {isCurrent && (
                          <div style={{ fontSize: 11, color: step.color || '#1d4ed8',
                            fontWeight: 700, marginTop: 2 }}>
                            {step.desc}
                          </div>
                        )}
                        {isDone && !isCurrent && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{t('track_parcel.step_done')}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>

            {/* Tracking history */}
            {result.history?.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 14px', fontFamily: 'Manrope,sans-serif' }}>{t('track_parcel.history_title')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...result.history].reverse().map((event, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', backgroundColor: i === 0 ? '#eff6ff' : '#f8fafc', borderRadius: 10, border: i === 0 ? '1px solid #bfdbfe' : 'none' }}>
                      <div style={{ fontSize: 20, flexShrink: 0 }}>
                        {STATUS_STEPS.find(s => s.key === event.status)?.icon || '📍'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                          {STATUS_STEPS.find(s => s.key === event.status)?.swLabel || event.status?.replace(/_/g, ' ')}
                          {event.city && <span style={{ color: '#64748b', fontWeight: 500 }}> — {event.city}</span>}
                        </div>
                        {event.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{event.note}</div>}

                        {/* Handler contact — who did this step */}
                        {event.updatedBy && event.handlerType !== 'system' && (
                          <div style={{ marginTop: 6, backgroundColor: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11 }}>
                                {event.handlerType === 'super_agent' ? '🏢' : '🤝'}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                                {event.updatedBy}
                              </span>
                              {event.handlerPhone && (
                                <a href={`tel:${event.handlerPhone}`}
                                  style={{ fontSize: 11, color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
                                  📞 {event.handlerPhone}
                                </a>
                              )}
                            </div>
                            {event.handlerLocation && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                                📍 {event.handlerLocation}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                          {event.createdAt ? new Date(event.createdAt).toLocaleString('sw-TZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivered banner */}
            {result.status === 'delivered' && (
              <div style={{ backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, border: '2px solid #86efac', textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#15803d', marginBottom: 4 }}>{t('track_parcel.delivered_title')}</div>
                {result.deliveredTime && (
                  <div style={{ fontSize: 13, color: '#16a34a' }}>
                    {t('track_parcel.delivered_time_label', { time: new Date(result.deliveredTime).toLocaleString('sw-TZ') })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{t('track_parcel.empty_title')}</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {t('track_parcel.empty_desc')}
            </p>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, fontSize: 12, color: '#64748b', textAlign: 'left' }}>
              <div style={{ fontWeight: 800, marginBottom: 8, color: '#1e293b' }}>{t('track_parcel.number_types_title')}</div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>KTX-DAR-MZA-000001</span>
                <span style={{ marginLeft: 8 }}>{t('track_parcel.type_super_agent')}</span>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>KTX-ORD-1234</span>
                <span style={{ marginLeft: 8 }}>{t('track_parcel.type_boda')}</span>
              </div>
              <div>
                <span style={{ fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>1234</span>
                <span style={{ marginLeft: 8 }}>{t('track_parcel.type_order')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 90 }} />
    </div>
  );
};

export default TrackParcel;