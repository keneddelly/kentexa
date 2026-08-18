/**
 * SuperAgentDashboard.js
 *
 * Super Agent = independent business operating a physical hub.
 * Their full role:
 *
 * 📥 POKEA (Receive):
 *   A) Walk-in sender → create parcel on the spot (inline form)
 *   B) Online KenteXa order → seller brings order number → confirm receipt
 *   C) Incoming intercity parcel → confirm arrival at hub
 *
 * 📤 TUMA (Dispatch):
 *   A) Send parcel via bus/courier to destination city
 *   B) Assign local agent for last-mile delivery
 *   C) Track what's in transit
 *
 * 💰 MAPATO (Earnings):
 *   A) Cash collected today (manual/offline orders)
 *   B) KenteXa owes me (online order shipping fees pending payout)
 *
 * 📋 BEI (Rate Card):
 *   Quick reference — per kg prices to each city
 *   Answer walk-in questions instantly
 *
 * 🚐 VAN YA LEO (Dar es Salaam only):
 *   Daily batch for same-city deliveries
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

// ── Launch scope ──────────────────────────────────────────────────────────
// Full hub-operations dashboard (receive/dispatch/pricing/van) re-enabled —
// the backend endpoints it calls have been live all along.
const HUB_OPS_ENABLED = true;

// ── Constants ─────────────────────────────────────────────────────────────

// CITIES replaced by LocationPicker

const STATUS_LABEL = {
  pending:              { l: 'Inasubiri',        c: '#64748b', bg: '#f1f5f9' },
  received_at_hub:      { l: 'Iko Hubuni',        c: '#1d4ed8', bg: '#eff6ff' },
  verified:             { l: 'Imethibitishwa',    c: '#0891b2', bg: '#ecfeff' },
  ready_for_dispatch:   { l: 'Tayari Kutuma',     c: '#16a34a', bg: '#dcfce7' },
  dispatched:           { l: 'Imetumwa',          c: '#15803d', bg: '#f0fdf4' },
  in_transit:           { l: '🚌 Njiani',         c: '#ca8a04', bg: '#fef9c3' },
  arrived_at_hub:       { l: '📍 Imefika Hubuni', c: '#7c3aed', bg: '#ede9fe' },
  awaiting_buyer:       { l: '⏳ Mteja Achague',  c: '#dc2626', bg: '#fee2e2' },
  out_for_delivery:     { l: '🏍️ Inafikishwa',   c: '#f59e0b', bg: '#fef9c3' },
  delivered:            { l: '✅ Imefikishwa',    c: '#16a34a', bg: '#dcfce7' },
  collection_requested: { l: 'Ombi la Kuchukua',  c: '#f59e0b', bg: '#fef9c3' },
  collected_by_agent:   { l: 'Imechukuliwa',      c: '#7c3aed', bg: '#ede9fe' },
};

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box',
};

const SBadge = ({ status }) => {
  const s = STATUS_LABEL[status] || { l: status, c: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px',
      borderRadius: 10, backgroundColor: s.bg, color: s.c }}>
      {s.l}
    </span>
  );
};

// ── Parcel card ────────────────────────────────────────────────────────────

const PCard = ({ p, actions = [] }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', marginBottom: 6 }}>
      <div>
        <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800,
          color: '#1d4ed8' }}>{p.trackingNumber}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {p.originCity} → {p.destinationCity}
          {p.transitCity && <span style={{ color: '#f59e0b' }}> via {p.transitCity}</span>}
        </div>
      </div>
      <SBadge status={p.status} />
    </div>

    {(p.recipientName || p.senderName) && (
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
        {p.senderName && <span>👤 Mtumaji: {p.senderName} </span>}
        {p.recipientName && <span>→ Mpokeaji: {p.recipientName}</span>}
      </div>
    )}

    {p.description && (
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
        📦 {p.description}
      </div>
    )}

    {/* Payment type badge */}
    {p.source === 'online' ? (
      <div style={{ backgroundColor: '#f0fdf4', borderRadius: 6, padding: '3px 8px',
        fontSize: 10, color: '#16a34a', marginBottom: 8, display: 'inline-block' }}>
        💳 KenteXa italipa ada ya usafirishaji
      </div>
    ) : p.source === 'seller_shipment' || p.source === 'offline_intercity' ? (
      <div style={{ backgroundColor: '#eff6ff', borderRadius: 6, padding: '3px 8px',
        fontSize: 10, color: '#1d4ed8', marginBottom: 8, display: 'inline-block' }}>
        💵 Mtumaji analipa cash
      </div>
    ) : null}

    {/* Bus/courier details if dispatched */}
    {p.busTicketNumber && (
      <div style={{ fontSize: 11, color: '#92400e', backgroundColor: '#fef9c3',
        borderRadius: 6, padding: '3px 8px', marginBottom: 8 }}>
        🚌 {p.busCompany} — Tiketi: <strong>{p.busTicketNumber}</strong>
      </div>
    )}

    {actions.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {actions.map((a, i) => (
          <button key={i} onClick={() => a.fn(p)}
            style={{ padding: '7px 12px', borderRadius: 7, border: 'none',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              backgroundColor: a.color || '#1d4ed8', color: '#fff' }}>
            {a.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────

const SuperAgentDashboard = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();

  // ── Core state ────────────────────────────────────────────────────────────
  const [profile, setProfile]           = useState(null);
  const [dashData, setDashData]         = useState(null);
  const [rates, setRates]               = useState([]);
  const [localAgents, setLocalAgents]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [profileStatus, setProfileStatus] = useState(null);
  const [activeTab, setActiveTab]       = useState('pokea');
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // ── POKEA sub-modes ───────────────────────────────────────────────────────
  // 'list' | 'walk_in' | 'online_order' | 'confirm_arrival'
  const [pokeaMode, setPokeaMode]       = useState('list');

  // Walk-in sender form (inline SuperAgentParcel)
  const [walkForm, setWalkForm] = useState({
    senderName: '', senderPhone: '', recipientName: '', recipientPhone: '',
    destinationCity: '', deliveryAddress: '', description: '',
    weightKg: '', shippingFeeCollected: '', paymentMethod: 'cash', notes: '',
  });
  const [walkRoute, setWalkRoute]       = useState(null);
  const [walkDestLocation, setWalkDestLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [walkPriceEstimate, setWalkPriceEstimate] = useState(null);
  const [confirmSending, setConfirmSending]     = useState({});
  const [walkRouteLoading, setWalkRouteLoading] = useState(false);
  const [walkResult, setWalkResult]     = useState(null);

  // Online order receive
  const [onlineOrderId, setOnlineOrderId] = useState('');
  const [orderLookup, setOrderLookup]   = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Confirm arrival form
  const [arrivalTracking, setArrivalTracking] = useState('');
  const [arrivalNote, setArrivalNote]   = useState('');

  // ── TUMA state ────────────────────────────────────────────────────────────
  const [dispatchParcel, setDispatchParcel] = useState(null);

  // ── Transport Assignment ──────────────────────────────────────────────────
  const [assignTransport,    setAssignTransport]    = useState(null); // { trackingNumber, fromCity, toCity }
  const [transportOptions,   setTransportOptions]   = useState(null); // { published, providers }
  const [loadingTransport,   setLoadingTransport]   = useState(false);
  const [selectedProvider,   setSelectedProvider]   = useState(null);
  const [selectedAvailId,    setSelectedAvailId]    = useState(null);
  const [transportNotes,     setTransportNotes]     = useState('');
  const [agreedPrice,        setAgreedPrice]        = useState('');
  const [assigningTransport, setAssigningTransport] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    transportType: 'bus', busCompany: '', busTicketNumber: '',
    busDeparture: '', courierName: '', courierTrackingRef: '', notes: '',
    driverName: '', driverPhone: '', vehicleNumber: '',
    departureDate: '', departureTime: '', expectedArrivalDate: '', expectedArrivalTime: '',
  });
  const [dispatchMode, setDispatchMode] = useState('transport');
  const [selectedAgent, setSelectedAgent] = useState(null);

  // ── Status update ─────────────────────────────────────────────────────────
  const [statusParcel, setStatusParcel] = useState(null);
  const [newStatus, setNewStatus]       = useState('');
  const [statusNote, setStatusNote]     = useState('');

  // ── Apply form ────────────────────────────────────────────────────────────
  const [applyForm, setApplyForm] = useState({
    businessName: '', phone: '', address: '', city: '', region: '', description: '',
  });
  const [applying, setApplying]         = useState(false);
  const [transferModal, setTransferModal] = useState(null);
  const [transferForm, setTransferForm]   = useState({ destinationHub: '', destinationCity: '', note: '' });

  const isDar = profile?.city?.toLowerCase().includes('dar');

  // ── Data loading ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const profileRes = await api.get('/super-agents/my-profile').catch(() => null);
      if (!profileRes?.data || profileRes.data.status === 'not_applied') {
        setProfileStatus('not_applied'); return;
      }
      const p = profileRes.data;
      setProfile(p);
      setProfileStatus(p.status);

      if (p.status === 'active') {
        const [dashRes, ratesRes, agentsRes] = await Promise.all([
          api.get('/super-agents/dashboard'),
          api.get(`/super-agents/rates/${encodeURIComponent(p.city)}`).catch(() => ({ data: [] })),
          api.get(`/agents/nearby?region=${encodeURIComponent(p.city)}`).catch(() => ({ data: [] })),
        ]);
        setDashData(dashRes.data);
        setRates(ratesRes.data || []);
        setLocalAgents(agentsRes.data || []);
      }
    } catch (err) {
      if (err?.response?.status === 404) setProfileStatus('not_applied');
      else setError(t('super_agent_dashboard.load_failed'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parcel grouping ───────────────────────────────────────────────────────

  const parcels       = dashData?.parcels || [];
  const atHub         = parcels.filter(p => ['received_at_hub','verified','ready_for_dispatch'].includes(p.status));
  const incoming      = parcels.filter(p => ['dispatched','in_transit','arrived_at_hub'].includes(p.status) && p.myRole === 'destination');
  const toDispatch    = parcels.filter(p => ['received_at_hub','ready_for_dispatch'].includes(p.status) && p.myRole !== 'destination');
  const inTransit     = parcels.filter(p => ['dispatched','in_transit'].includes(p.status) && p.myRole !== 'destination');
  const awaitingBuyer = parcels.filter(p => ['awaiting_buyer','out_for_delivery'].includes(p.status) && p.myRole === 'destination');
  // eslint-disable-next-line no-unused-vars
  const delivered     = parcels.filter(p => p.status === 'delivered');

  // Earnings
  const cashToday     = parcels.filter(p => {
    const today = new Date().toDateString();
    return p.source !== 'online' && new Date(p.createdAt).toDateString() === today;
  }).reduce((sum, p) => sum + Number(p.shippingFeeCollected || p.actualShippingFee || 0), 0);

  const kenetxaOwes   = parcels.filter(p => p.source === 'online' && !p.agentPaidOut)
    .reduce((sum, p) => sum + Number(p.actualShippingFee || p.superAgentEarnings || 0), 0);

  // ── Walk-in handlers ──────────────────────────────────────────────────────

  const handleSendConfirmLink = async (orderId) => {
    if (!orderId) return;
    setConfirmSending(p => ({ ...p, [orderId]: true }));
    try {
      await api.post(`/orders/${orderId}/send-confirmation`);
      setSuccess('✅ Link ya kuthibitisha imetumwa kwa mnunuzi!');
    } catch { setError('Imeshindwa kutuma link. Jaribu tena.'); }
    finally { setConfirmSending(p => ({ ...p, [orderId]: false })); }
  };

  const lookupWalkRoute = async (dest) => {
    if (!dest || !profile?.city) return;
    try {
      setWalkRouteLoading(true);
      const res = await api.get(
        `/super-agents/route/${encodeURIComponent(profile.city)}/${encodeURIComponent(dest)}`
      );
      setWalkRoute(res.data || null);
    } catch { setWalkRoute(null); }
    finally { setWalkRouteLoading(false); }
  };

  const handleWalkSubmit = async () => {
    if (!walkForm.senderName || !walkForm.recipientName || !walkForm.destinationCity) {
      setError('Jaza sehemu zote zinazohitajika'); return;
    }
    try {
      setActionLoading(true); setError('');
      const res = await api.post('/super-agents/offline-intercity', {
        ...walkForm,
        originCity: profile?.city,
        weightKg:   walkForm.weightKg ? Number(walkForm.weightKg) : undefined,
        shippingFeeCollected: Number(walkForm.shippingFeeCollected || 0),
      });
      setWalkResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuunda agizo');
    } finally { setActionLoading(false); }
  };

  const resetWalk = () => {
    setWalkForm({ senderName: '', senderPhone: '', recipientName: '', recipientPhone: '',
      destinationCity: '', deliveryAddress: '', description: '',
      weightKg: '', shippingFeeCollected: '', paymentMethod: 'cash', notes: '' });
    setWalkRoute(null); setWalkResult(null);
    setPokeaMode('list'); fetchAll();
  };

  // Print a physical receipt for the sender confirming payment received.
  // Their own business name leads as the logistics brand (Super Agents are
  // growing their own brand through every customer touchpoint — same
  // principle already applied to the SMS templates), with Kentexa's
  // verification badge secondary underneath, not the other way around.
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const handlePrintReceipt = (receipt) => {
    if (!receipt) return;
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) { setError('Imeshindwa kufungua dirisha la kuchapisha'); return; }
    const row = (label, value) => value
      ? `<div class="row"><span class="l">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></div>`
      : '';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" />
      <title>Risiti — ${escapeHtml(receipt.parcelReference)}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; color: #000; }
        .brand { text-align: center; font-size: 18px; font-weight: 900; margin-bottom: 2px; }
        .brand-sub { text-align: center; font-size: 11px; margin-bottom: 10px; }
        .verified { text-align: center; font-size: 10px; color: #444; margin-bottom: 10px;
          border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; }
        .row { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
        .l { color: #333; } .v { font-weight: 700; text-align: right; }
        .amount { text-align: center; font-size: 20px; font-weight: 900; margin: 12px 0; }
        .footer { text-align: center; font-size: 10px; margin-top: 12px; color: #555; }
      </style></head><body>
      <div class="brand">${escapeHtml(receipt.superAgentName || 'Super Agent')}</div>
      <div class="brand-sub">${escapeHtml(receipt.superAgentCity || '')}</div>
      <div class="verified">✔ Verified by Kentexa</div>
      ${row('Namba ya Risiti', receipt.receiptNumber)}
      ${row('Kifurushi', receipt.parcelReference)}
      ${row('Tarehe', receipt.paidAt ? new Date(receipt.paidAt).toLocaleString('sw-TZ') : '')}
      <hr />
      ${row('Mtumaji', receipt.senderName)}
      ${row('Simu ya Mtumaji', receipt.senderPhone)}
      ${row('Mpokeaji', receipt.receiverName)}
      ${row('Simu ya Mpokeaji', receipt.receiverPhone)}
      <hr />
      ${row('Njia ya Malipo', receipt.paymentMethod)}
      <div class="amount">TZS ${Number(receipt.amountPaid || 0).toLocaleString()}</div>
      <div class="footer">Malipo yamepokewa. Asante kwa kutumia<br />${escapeHtml(receipt.superAgentName || 'Super Agent')}</div>
      <script>window.onload = () => { window.print(); };</script>
      </body></html>`);
    win.document.close();
  };

  // ── Online order handlers ─────────────────────────────────────────────────

  const handleLookupOrder = async () => {
    if (!onlineOrderId.trim()) return;
    try {
      setLookupLoading(true); setError('');
      const res = await api.get(`/orders/${onlineOrderId.trim()}/agent-lookup`).catch(() => null)
        || await api.get(`/super-agents/track/${onlineOrderId.trim()}`).catch(() => null);
      setOrderLookup(res?.data || null);
      if (!res?.data) setError('Agizo halipatikani — angalia namba');
    } catch { setError('Imeshindwa kutafuta'); }
    finally { setLookupLoading(false); }
  };

  const handleReceiveOnline = async () => {
    if (!onlineOrderId.trim()) return;
    try {
      setActionLoading(true); setError('');
      await api.patch(`/orders/${onlineOrderId.trim()}/super-agent-receive`);
      setSuccess(`✅ Agizo #${onlineOrderId} limepokewa hubuni!`);
      setOnlineOrderId(''); setOrderLookup(null);
      setPokeaMode('list'); fetchAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kupokea');
    } finally { setActionLoading(false); }
  };

  // ── Confirm arrival handlers ──────────────────────────────────────────────

  const handleConfirmArrival = async () => {
    if (!arrivalTracking.trim()) return;
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/shipments/${arrivalTracking.trim()}/arrived`, {
        city: profile?.city, note: arrivalNote,
      });
      setSuccess(`✅ ${arrivalTracking} imesajiliwa kufika hubuni`);
      setArrivalTracking(''); setArrivalNote('');
      setPokeaMode('list'); fetchAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kusajili');
    } finally { setActionLoading(false); }
  };

  // ── Dispatch handlers ─────────────────────────────────────────────────────


  // ── Transport Assignment functions ────────────────────────────────────────

  const openAssignTransport = async (trackingNumber, fromCity, toCity) => {
    setAssignTransport({ trackingNumber, fromCity, toCity });
    setTransportOptions(null);
    setSelectedProvider(null);
    setSelectedAvailId(null);
    setTransportNotes('');
    setAgreedPrice('');
    try {
      setLoadingTransport(true);
      const res = await api.get(
        `/transport/available?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}`
      );
      setTransportOptions(res.data);
    } catch { setTransportOptions({ published: [], providers: [] }); }
    finally { setLoadingTransport(false); }
  };

  const handleAssignTransport = async () => {
    if (!selectedProvider) return alert('Chagua msafirishaji kwanza');
    try {
      setAssigningTransport(true);
      await api.post('/transport/assignments', {
        trackingNumber:  assignTransport.trackingNumber,
        providerId:      selectedProvider.id,
        availabilityId:  selectedAvailId || undefined,
        agreedPrice:     agreedPrice ? Number(agreedPrice) : undefined,
        superAgentNotes: transportNotes || undefined,
      });
      alert(`✅ ${selectedProvider.name} wamepewa mgawo!`);
      setAssignTransport(null);
    } catch (e) {
      alert('Imeshindwa: ' + (e.response?.data?.message || 'Jaribu tena'));
    } finally { setAssigningTransport(false); }
  };

  const handleDispatch = async () => {
    if (!dispatchParcel) return;
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${dispatchParcel.trackingNumber}/dispatch`, {
        ...dispatchForm,
        localAgentId: selectedAgent?.id || null,
      });
      setSuccess(`✅ ${dispatchParcel.trackingNumber} imetumwa!`);
      setDispatchParcel(null); setSelectedAgent(null);
      fetchAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kutuma');
    } finally { setActionLoading(false); }
  };

  // ── Status update handler ─────────────────────────────────────────────────

  const handleStatus = async () => {
    if (!statusParcel || !newStatus) return;
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${statusParcel.trackingNumber}/status`, {
        status: newStatus, city: profile?.city, note: statusNote,
      });
      setSuccess('✅ Hali imesasishwa');
      setStatusParcel(null); setStatusNote(''); setNewStatus('');
      fetchAll();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa');
    } finally { setActionLoading(false); }
  };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = async () => {
    try {
      setApplying(true); setError('');
      await api.post('/super-agents/apply', applyForm);
      setProfileStatus('pending');
    } catch (err) {
      setError(err?.response?.data?.message || t('super_agent_dashboard.submit_failed'));
    } finally { setApplying(false); }
  };

  // ── Not applied ───────────────────────────────────────────────────────────

  if (!loading && profileStatus === 'not_applied') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_dashboard.apply_title')} top={0} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', paddingBottom: 32 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: 16 }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🏢</div>
          <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 900,
            color: '#1e293b', margin: '0 0 6px' }}>{t('super_agent_dashboard.apply_title')}</h2>
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            {t('super_agent_dashboard.apply_desc')}
          </p>
          {[
            { k: 'businessName', l: t('super_agent_dashboard.field_business_name_label'), ph: 'e.g. Geita Express Hub' },
            { k: 'phone',        l: t('super_agent_dashboard.field_phone_label'),             ph: '0712345678' },
            { k: 'city',         l: t('super_agent_dashboard.field_city_label'),              ph: 'e.g. Geita' },
            { k: 'address',      l: t('super_agent_dashboard.field_address_label'),    ph: 'Mtaa, alama muhimu' },
            { k: 'region',       l: t('super_agent_dashboard.field_region_label'),               ph: 'e.g. Geita' },
            { k: 'description',  l: t('super_agent_dashboard.field_description_label'),  ph: 'Mzigo, vifurushi...' },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569',
                display: 'block', marginBottom: 4 }}>{f.l}</label>
              <input type="text" placeholder={f.ph} value={applyForm[f.k]}
                onChange={e => setApplyForm(p => ({ ...p, [f.k]: e.target.value }))}
                style={inp} />
            </div>
          ))}
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>❌ {error}</div>}
          <button onClick={handleApply} disabled={applying}
            style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
              padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 900 }}>
            {applying ? t('super_agent_dashboard.submitting') : t('super_agent_dashboard.submit_application_button')}
          </button>
        </div>
      </div>
    </div>
  );

  if (!loading && profileStatus === 'pending') return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_dashboard.pending_title')} top={0} />
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h3 style={{ color: '#1e293b' }}>{t('super_agent_dashboard.pending_title')}</h3>
        <p style={{ color: '#64748b', fontSize: 14 }}>{t('super_agent_dashboard.pending_desc')}</p>
      </div>
    </div>
  );

  // ── Launch scope ──────────────────────────────────────────────────────────
  // Registration/application stays fully open (the two early-returns above).
  // The hub operations dashboard (receive/send/pricing/van — everything
  // below this point) stays disabled until that logic gets more real-world
  // testing. Create Shipment is a separate, already-working action and
  // stays available. Flip HUB_OPS_ENABLED back on when ready — nothing
  // below needs to change.
  if (!loading && profileStatus === 'active' && !HUB_OPS_ENABLED) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_dashboard.header_title', 'Hub Dashboard')} top={0} />
      <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: 420, margin: '0 auto', flex: 1 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 8px' }}>
          {t('super_agent_dashboard.registered_title', { name: profile?.businessName || t('super_agent_dashboard.your_hub_fallback') })}
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
          {t('super_agent_dashboard.registered_desc')}
        </p>
        <button onClick={() => onNavigate('SellerShipment')}
          style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff',
            border: 'none', padding: '14px 28px', borderRadius: 12, cursor: 'pointer',
            fontSize: 14, fontWeight: 800 }}>
          {t('super_agent_dashboard.create_shipment_button')}
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} top={0} />
      <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>{t('super_agent_dashboard.loading')}</div>
    </div>
  );

  // ── Main dashboard ────────────────────────────────────────────────────────

  const handleTransferHub = async (trackingNumber, form) => {
    if (!form.destinationHub || !form.destinationCity) {
      alert('Weka hub na mji wa marudio'); return;
    }
    try {
      await api.post('/super-agents/parcels/' + trackingNumber + '/transfer-hub', form);
      alert('Kimehamishwa!');
      setTransferModal(null);
      setTransferForm({ destinationHub: '', destinationCity: '', note: '' });
    } catch (e) {
      alert('Imeshindwa: ' + (e.response?.data?.message || 'Jaribu tena'));
    }
  };


  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_dashboard.header_title', 'Hub Dashboard')} top={0} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', padding: '16px 16px 0' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {/* Hub name + settings */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 1 }}>
                HUB YA KENTEXA
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>
                {profile?.businessName || 'Hub Yangu'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                📍 {profile?.city} · {profile?.agentCode || '—'}
              </div>
            </div>
            <button onClick={() => onNavigate('SuperAgentSettings')}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none',
                borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                color: '#fff', fontSize: 16 }}>⚙️</button>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
            {[
              { icon: '📥', label: 'Hubuni',  value: atHub.length,         c: '#60a5fa' },
              { icon: '🚌', label: 'Inakuja', value: incoming.length,      c: '#a78bfa' },
              { icon: '📤', label: 'Tuma',    value: toDispatch.length,    c: '#34d399' },
              { icon: '⏳', label: 'Mteja',   value: awaitingBuyer.length, c: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 14 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.c }}>{s.value}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'pokea',   label: '📥 POKEA'   },
              { key: 'tuma',    label: '📤 TUMA'    },
              { key: 'mapato',  label: '💰 MAPATO'  },
              { key: 'bei',     label: '📋 BEI'     },
              ...(isDar ? [{ key: 'van', label: '🚐 VAN' }] : []),
            ].map(t => (
              <button key={t.key} onClick={() => { setActiveTab(t.key); setPokeaMode('list'); }}
                style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 800, borderRadius: '6px 6px 0 0',
                  backgroundColor: activeTab === t.key ? '#f1f5f9' : 'transparent',
                  color: activeTab === t.key ? '#1d4ed8' : 'rgba(255,255,255,0.6)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 16, maxWidth: 560, margin: '0 auto',
        width: '100%', boxSizing: 'border-box', paddingBottom: 80 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626',
            padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
            ❌ {error}
            <button onClick={() => setError('')}
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a',
            padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
            {success}
            <button onClick={() => setSuccess('')}
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            📥 POKEA TAB
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'pokea' && (
          <>
            {/* Sub-mode selector */}
            {pokeaMode === 'list' && (
              <>
                {/* Three action buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
                  <button onClick={() => setPokeaMode('walk_in')}
                    style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none',
                      padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>👤</div>
                    Mteja wa Walk-In
                  </button>
                  <button onClick={() => setPokeaMode('online_order')}
                    style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                      padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>📱</div>
                    Agizo la KenteXa
                  </button>
                  <button onClick={() => setPokeaMode('confirm_arrival')}
                    style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none',
                      padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                      fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>🚌</div>
                    Imefika Hub
                  </button>
                </div>

                {/* Parcels at hub */}
                {atHub.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                      🏢 ZIKO HUBUNI — TAYARI KUTUMA ({atHub.length})
                    </div>
                    {atHub.map(p => (
                      <PCard key={p.trackingNumber} p={p} actions={[
                        { label: '📤 Tuma', color: '#16a34a',
                          fn: (parcel) => { setActiveTab('tuma'); setDispatchParcel(parcel); } },
                        { label: 'Sasisha', color: '#64748b',
                          fn: (parcel) => { setStatusParcel(parcel); setNewStatus(''); } },
                      ]} />
                    ))}
                  </>
                )}

                {/* Incoming intercity parcels */}
                {incoming.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed',
                      marginBottom: 8, marginTop: 16 }}>
                      🚌 ZINAKUJA — KUTOKA MIJI MINGINE ({incoming.length})
                    </div>
                    {incoming.map(p => (
                      <PCard key={p.trackingNumber} p={p} actions={[
                        { label: '✅ Pokea', color: '#7c3aed',
                          fn: (parcel) => { setStatusParcel(parcel); setNewStatus('received_at_hub'); } },
                      ]} />
                    ))}
                  </>
                )}

                {/* Awaiting buyer */}
                {awaitingBuyer.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#dc2626',
                      marginBottom: 8, marginTop: 16 }}>
                      ⏳ ZINASUBIRI MTEJA ({awaitingBuyer.length})
                    </div>
                    {awaitingBuyer.map(p => (
                      <PCard key={p.trackingNumber} p={p} actions={[
                        { label: 'Sasisha Hali', color: '#7c3aed',
                          fn: (parcel) => { setStatusParcel(parcel); setNewStatus(''); } },
                      ]} />
                    ))}
                  </>
                )}

                {atHub.length === 0 && incoming.length === 0 && awaitingBuyer.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                    Hakuna vifurushi vya kupokea sasa
                  </div>
                )}
              </>
            )}

            {/* ── A) WALK-IN FORM ──────────────────────────────────────── */}
            {pokeaMode === 'walk_in' && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>
                    👤 Mteja wa Walk-In
                  </div>
                  <button onClick={() => setPokeaMode('list')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 20, color: '#64748b' }}>×</button>
                </div>

                {!walkResult ? (
                  <>
                    {/* Sender */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                      marginBottom: 8, letterSpacing: 0.5 }}>MTUMAJI</div>
                    {[
                      { k: 'senderName',  l: 'Jina *',  ph: 'Juma Hamisi' },
                      { k: 'senderPhone', l: 'Simu *',  ph: '0712345678' },
                    ].map(f => (
                      <div key={f.k} style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                          display: 'block', marginBottom: 3 }}>{f.l}</label>
                        <input type="text" placeholder={f.ph} value={walkForm[f.k]}
                          onChange={e => setWalkForm(p => ({ ...p, [f.k]: e.target.value }))}
                          style={inp} />
                      </div>
                    ))}

                    {/* Recipient */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                      margin: '14px 0 8px', letterSpacing: 0.5 }}>MPOKEAJI</div>
                    {[
                      { k: 'recipientName',  l: 'Jina *',    ph: 'Amina Hassan' },
                      { k: 'recipientPhone', l: 'Simu *',    ph: '0787654321' },
                    ].map(f => (
                      <div key={f.k} style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                          display: 'block', marginBottom: 3 }}>{f.l}</label>
                        <input type="text" placeholder={f.ph} value={walkForm[f.k]}
                          onChange={e => setWalkForm(p => ({ ...p, [f.k]: e.target.value }))}
                          style={inp} />
                      </div>
                    ))}

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                        display: 'block', marginBottom: 3 }}>Mji wa Mwisho *</label>
                      <LocationPicker
                        label=""
                        value={walkDestLocation}
                        onChange={async loc => {
                          setWalkDestLocation(loc);
                          const cityStr = loc.districtName || loc.regionName || '';
                          setWalkForm(p => ({ ...p, destinationCity: cityStr }));
                          lookupWalkRoute(cityStr);
                          // Fetch price estimate
                          if (cityStr && profile?.city) {
                            try {
                              const params = new URLSearchParams({
                                from:   profile.city,
                                to:     loc.regionName || cityStr,
                                weight: String(walkForm.weightKg || 1),
                                ...(loc.districtId ? { destDistrictId: String(loc.districtId) } : {}),
                                ...(loc.districtName ? { destDistrict: loc.districtName } : {}),
                              });
                              const res = await api.get(`/pricing/estimate?${params}`);
                              setWalkPriceEstimate(res.data);
                            } catch { setWalkPriceEstimate(null); }
                          }
                        }}
                        required
                      />
                    </div>

                    {/* Route info */}
                    {/* Live price estimate */}
                    {walkPriceEstimate && (
                      <div style={{ borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                        backgroundColor: walkPriceEstimate.confidence === 'exact' ? '#f0fdf4' : '#fff7ed',
                        border: `1px solid ${walkPriceEstimate.confidence === 'exact' ? '#86efac' : '#fed7aa'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700,
                              color: walkPriceEstimate.confidence === 'exact' ? '#15803d' : '#92400e' }}>
                              {walkPriceEstimate.confidence === 'exact' ? '✅ Bei Halisi' : '📊 Makisio ya Bei'}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {walkPriceEstimate.displayNote}
                              {walkPriceEstimate.via && ` · ${walkPriceEstimate.via}`}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 900,
                              color: walkPriceEstimate.confidence === 'exact' ? '#16a34a' : '#f59e0b' }}>
                              {walkPriceEstimate.displayPrice}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              Siku {walkPriceEstimate.estimatedDays}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {walkRouteLoading && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                        ⏳ Inatafuta njia...
                      </div>
                    )}
                    {walkRoute && !walkRouteLoading && (
                      <div style={{ backgroundColor: '#f0fdf4', borderRadius: 8,
                        padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#15803d' }}>
                        📍 {profile?.city} → {walkForm.destinationCity}
                        {walkRoute.transitCity && ` via ${walkRoute.transitCity}`}
                        {' '}· Siku {walkRoute.estimatedDays}
                        {walkRoute.baseShippingFee && (
                          <span style={{ marginLeft: 8, fontWeight: 700 }}>
                            · ~TZS {Number(walkRoute.baseShippingFee).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                        display: 'block', marginBottom: 3 }}>Anwani ya Mpokeaji *</label>
                      <input type="text" placeholder="Mtaa, alama muhimu"
                        value={walkForm.deliveryAddress}
                        onChange={e => setWalkForm(p => ({ ...p, deliveryAddress: e.target.value }))}
                        style={inp} />
                    </div>

                    {/* Parcel + fee */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b',
                      margin: '14px 0 8px', letterSpacing: 0.5 }}>BIDHAA NA MALIPO</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { k: 'description',        l: 'Bidhaa',      ph: 'e.g. Nguo, Simu' },
                        { k: 'weightKg',            l: 'Uzito (kg)',   ph: '2.5', type: 'number' },
                        { k: 'shippingFeeCollected',l: 'Ada Uliyokusanya (TZS)', ph: '8000', type: 'number' },
                      ].map(f => (
                        <div key={f.k} style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                            display: 'block', marginBottom: 3 }}>{f.l}</label>
                          <input type={f.type || 'text'} placeholder={f.ph}
                            value={walkForm[f.k]}
                            onChange={e => setWalkForm(p => ({ ...p, [f.k]: e.target.value }))}
                            style={inp} />
                        </div>
                      ))}
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#475569',
                          display: 'block', marginBottom: 3 }}>Malipo</label>
                        <select value={walkForm.paymentMethod}
                          onChange={e => setWalkForm(p => ({ ...p, paymentMethod: e.target.value }))}
                          style={inp}>
                          <option value="cash">Cash</option>
                          <option value="mpesa">M-Pesa</option>
                          <option value="airtel">Airtel Money</option>
                        </select>
                      </div>
                    </div>

                    <button onClick={handleWalkSubmit} disabled={actionLoading}
                      style={{ width: '100%', backgroundColor: actionLoading ? '#94a3b8' : '#16a34a',
                        color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                        cursor: 'pointer', fontSize: 14, fontWeight: 900, marginTop: 8 }}>
                      {actionLoading ? '⏳ Inasajili...' : '📥 Sajili Kifurushi'}
                    </button>
                  </>
                ) : (
                  /* Success — show tracking number. No separate platform-fee
                     payment step here — Kentexa's platform fee (free for the
                     first 50 orders, then billed per-order to the Super
                     Agent's own account balance) is tracked automatically on
                     the backend and never blocks activating the customer's
                     tracking number. */
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#15803d',
                      marginBottom: 8 }}>Kifurushi Kimesajiliwa!</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900,
                      color: '#1d4ed8', marginBottom: 6 }}>
                      {walkResult.trackingNumber}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                      SMS imetumwa kwa mpokeaji
                    </div>
                    {walkResult.billing && (
                      <div style={{ fontSize: 12, color: walkResult.billing.isFreeOrder ? '#16a34a' : '#64748b',
                        marginBottom: 20 }}>
                        {walkResult.billing.isFreeOrder
                          ? '🎁 Agizo la bure — halikutozwa ada'
                          : `Ada ya Kentexa TZS ${Number(walkResult.billing.platformFeeCharged).toLocaleString()} imeongezwa kwenye deni lako`}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                      {walkResult.receipt && (
                        <button onClick={() => handlePrintReceipt(walkResult.receipt)}
                          style={{ backgroundColor: '#fff', color: '#1d4ed8',
                            border: '2px solid #1d4ed8', padding: '12px 20px', borderRadius: 10,
                            cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                          🖨️ Chapisha Risiti
                        </button>
                      )}
                      <button onClick={resetWalk}
                        style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                          padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
                          fontSize: 14, fontWeight: 800 }}>
                        + Mteja Mwingine
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── B) ONLINE ORDER ──────────────────────────────────────── */}
            {pokeaMode === 'online_order' && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>
                    📱 Pokea Agizo la KenteXa
                  </div>
                  <button onClick={() => setPokeaMode('list')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 20, color: '#64748b' }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                  Muuzaji ameleta parcel. Weka namba ya agizo lake ili kuthibitisha.
                  KenteXa italipa ada ya usafirishaji baada ya uwasilishaji.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="text" placeholder="Namba ya Agizo (e.g. 147)"
                    value={onlineOrderId}
                    onChange={e => { setOnlineOrderId(e.target.value); setOrderLookup(null); }}
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={handleLookupOrder} disabled={lookupLoading}
                    style={{ backgroundColor: '#64748b', color: '#fff', border: 'none',
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                    {lookupLoading ? '⏳' : '🔍'}
                  </button>
                </div>

                {orderLookup && (() => {
                  const isOnlinePaid  = orderLookup.source === 'online' && orderLookup.paymentStatus === 'paid';
                  const isOffline     = ['offline', 'offline_intercity', 'seller_shipment'].includes(orderLookup.source);
                  const shippingFee   = Number(orderLookup.deliveryFeeAmount || orderLookup.shippingFee || 0);
                  return (
                    <div style={{ borderRadius: 12, padding: 14, marginBottom: 14,
                      border: `2px solid ${isOnlinePaid ? '#86efac' : isOffline ? '#fed7aa' : '#e2e8f0'}`,
                      backgroundColor: isOnlinePaid ? '#f0fdf4' : isOffline ? '#fff7ed' : '#f8fafc' }}>

                      {/* Payment status header */}
                      {isOnlinePaid ? (
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginBottom: 10 }}>
                          ✅ Agizo la KenteXa — Imelipiwa
                        </div>
                      ) : isOffline ? (
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#c2410c', marginBottom: 10 }}>
                          💵 Agizo la Nje ya Mtandao — Seller Analipa Cash Sasa
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', marginBottom: 10 }}>
                          📋 Agizo Limepatikana
                        </div>
                      )}

                      {/* Order details */}
                      {[
                        ['Bidhaa',   orderLookup.productName || orderLookup.description || orderLookup.manualProductName || '—'],
                        ['Mteja',    orderLookup.buyerName   || orderLookup.recipientName || '—'],
                        ['Simu',     orderLookup.buyerPhone  || orderLookup.recipientPhone || '—'],
                        ['Kwenda',   orderLookup.destinationCity || orderLookup.deliveryAddress || '—'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                          fontSize: 12, padding: '5px 0',
                          borderBottom: `1px solid ${isOnlinePaid ? '#dcfce7' : isOffline ? '#fed7aa' : '#f1f5f9'}` }}>
                          <span style={{ color: '#64748b' }}>{l}</span>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                        </div>
                      ))}

                      {/* Shipping fee — the most important part */}
                      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8,
                        backgroundColor: isOnlinePaid ? '#dcfce7' : isOffline ? '#fed7aa' : '#f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700,
                            color: isOnlinePaid ? '#15803d' : isOffline ? '#92400e' : '#475569' }}>
                            Ada ya Usafirishaji
                          </span>
                          <span style={{ fontSize: 18, fontWeight: 900,
                            color: isOnlinePaid ? '#15803d' : isOffline ? '#c2410c' : '#1e293b' }}>
                            {shippingFee > 0 ? `TZS ${shippingFee.toLocaleString()}` : '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, marginTop: 4,
                          color: isOnlinePaid ? '#16a34a' : isOffline ? '#92400e' : '#64748b' }}>
                          {isOnlinePaid
                            ? '💳 KenteXa italipa baada ya uwasilishaji — pokea bila cash'
                            : isOffline
                            ? '💵 Kusanya cash kutoka kwa seller KABLA ya kupokea kifurushi'
                            : ''}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleReceiveOnline}
                    disabled={actionLoading || !onlineOrderId.trim()}
                    style={{ flex: 2, backgroundColor: !onlineOrderId.trim() ? '#94a3b8' : '#1d4ed8',
                      color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                      cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
                    {actionLoading ? '⏳' : '✅ Pokea Hubuni'}
                  </button>
                  <button onClick={() => { setPokeaMode('list'); setOrderLookup(null); }}
                    style={{ flex: 1, background: '#fff', color: '#64748b',
                      border: '2px solid #e2e8f0', padding: 14, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Ghairi
                  </button>
                </div>
              </div>
            )}

            {/* ── C) CONFIRM ARRIVAL ───────────────────────────────────── */}
            {pokeaMode === 'confirm_arrival' && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>
                    🚌 Kifurushi Kimefika Hub
                  </div>
                  <button onClick={() => setPokeaMode('list')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 20, color: '#64748b' }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                  Kifurushi kilichotoka mji mwingine kimefika hub yako.
                  Mpokeaji ataarifiwa — atachagua delivery au self-pickup.
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569',
                    display: 'block', marginBottom: 4 }}>Namba ya Kufuatilia *</label>
                  <input type="text" placeholder="KTX-SHP-42 au KTX-ORD-147"
                    value={arrivalTracking}
                    onChange={e => setArrivalTracking(e.target.value)} style={inp} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569',
                    display: 'block', marginBottom: 4 }}>Maelezo (hiari)</label>
                  <input type="text" placeholder="e.g. Hali nzuri, imefika salama"
                    value={arrivalNote}
                    onChange={e => setArrivalNote(e.target.value)} style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleConfirmArrival}
                    disabled={actionLoading || !arrivalTracking.trim()}
                    style={{ flex: 2, backgroundColor: !arrivalTracking.trim() ? '#94a3b8' : '#7c3aed',
                      color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                      cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
                    {actionLoading ? '⏳' : '✅ Sajili Kufika — SMS kwa Mpokeaji'}
                  </button>
                  <button onClick={() => setPokeaMode('list')}
                    style={{ flex: 1, background: '#fff', color: '#64748b',
                      border: '2px solid #e2e8f0', padding: 14, borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Ghairi
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            📤 TUMA TAB
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tuma' && (
          <>
            {/* Dispatch form — shown when parcel selected */}
            {dispatchParcel ? (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>📤 Tuma</div>
                  <button onClick={() => setDispatchParcel(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 20, color: '#64748b' }}>×</button>
                </div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1d4ed8',
                  marginBottom: 14 }}>
                  {dispatchParcel.trackingNumber} → {dispatchParcel.destinationCity}
                  {dispatchParcel.transitCity && <span style={{ color: '#f59e0b' }}>
                    {' '}via {dispatchParcel.transitCity}
                  </span>}
                </div>

                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {[
                    { k: 'transport', l: '🚌 Basi / Courier' },
                    { k: 'agent',     l: '🏍️ Wakala wa Mtaa' },
                  ].map(m => (
                    <button key={m.k} onClick={() => setDispatchMode(m.k)}
                      style={{ flex: 1, padding: '9px 8px', borderRadius: 8,
                        cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none',
                        backgroundColor: dispatchMode === m.k ? '#1d4ed8' : '#f1f5f9',
                        color: dispatchMode === m.k ? '#fff' : '#475569' }}>
                      {m.l}
                    </button>
                  ))}
                </div>

                {dispatchMode === 'transport' && (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[{ k: 'bus', l: '🚌 Basi' }, { k: 'courier', l: '📦 Courier' }].map(t => (
                        <button key={t.k}
                          onClick={() => setDispatchForm(f => ({ ...f, transportType: t.k }))}
                          style={{ flex: 1, padding: 8, borderRadius: 8, cursor: 'pointer',
                            fontSize: 12, fontWeight: 700,
                            border: dispatchForm.transportType === t.k
                              ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                            backgroundColor: dispatchForm.transportType === t.k ? '#eff6ff' : '#fff',
                            color: dispatchForm.transportType === t.k ? '#1d4ed8' : '#64748b' }}>
                          {t.l}
                        </button>
                      ))}
                    </div>

                    {dispatchForm.transportType === 'bus' && (
                      <>
                        <input type="text" placeholder="Jina la Basi (e.g. Abood, Tahmeed, Scandinavian...)"
                          value={dispatchForm.busCompany}
                          onChange={e => setDispatchForm(f => ({ ...f, busCompany: e.target.value }))}
                          style={{ ...inp, marginBottom: 8 }} />
                        <input type="text" placeholder="Namba ya Tiketi *"
                          value={dispatchForm.busTicketNumber}
                          onChange={e => setDispatchForm(f => ({ ...f, busTicketNumber: e.target.value }))}
                          style={{ ...inp, marginBottom: 8 }} />
                        <input type="text" placeholder="Saa ya Kuondoka (e.g. 6am)"
                          value={dispatchForm.busDeparture}
                          onChange={e => setDispatchForm(f => ({ ...f, busDeparture: e.target.value }))}
                          style={{ ...inp, marginBottom: 8 }} />
                      </>
                    )}
                    {dispatchForm.transportType === 'courier' && (
                      <>
                        <input type="text" placeholder="Jina la Courier"
                          value={dispatchForm.courierName}
                          onChange={e => setDispatchForm(f => ({ ...f, courierName: e.target.value }))}
                          style={{ ...inp, marginBottom: 8 }} />
                        <input type="text" placeholder="Namba ya Kufuatilia"
                          value={dispatchForm.courierTrackingRef}
                          onChange={e => setDispatchForm(f => ({ ...f, courierTrackingRef: e.target.value }))}
                          style={{ ...inp, marginBottom: 8 }} />
                      </>
                    )}
                    {/* Optional — only fields actually filled in get included in the receiver SMS */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8',
                      marginTop: 6, marginBottom: 6, textTransform: 'uppercase' }}>
                      Maelezo ya ziada (hiari)
                    </div>
                    <input type="text" placeholder="Jina la Dereva (hiari)"
                      value={dispatchForm.driverName}
                      onChange={e => setDispatchForm(f => ({ ...f, driverName: e.target.value }))}
                      style={{ ...inp, marginBottom: 8 }} />
                    <input type="text" placeholder="Namba ya Simu ya Dereva (hiari)"
                      value={dispatchForm.driverPhone}
                      onChange={e => setDispatchForm(f => ({ ...f, driverPhone: e.target.value }))}
                      style={{ ...inp, marginBottom: 8 }} />
                    <input type="text" placeholder="Namba ya Gari (hiari)"
                      value={dispatchForm.vehicleNumber}
                      onChange={e => setDispatchForm(f => ({ ...f, vehicleNumber: e.target.value }))}
                      style={{ ...inp, marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input type="date" placeholder="Tarehe ya Kuondoka"
                        value={dispatchForm.departureDate}
                        onChange={e => setDispatchForm(f => ({ ...f, departureDate: e.target.value }))}
                        style={{ ...inp, flex: 1 }} />
                      <input type="time" placeholder="Saa ya Kuondoka"
                        value={dispatchForm.departureTime}
                        onChange={e => setDispatchForm(f => ({ ...f, departureTime: e.target.value }))}
                        style={{ ...inp, flex: 1 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input type="date" placeholder="Tarehe ya Kufika"
                        value={dispatchForm.expectedArrivalDate}
                        onChange={e => setDispatchForm(f => ({ ...f, expectedArrivalDate: e.target.value }))}
                        style={{ ...inp, flex: 1 }} />
                      <input type="time" placeholder="Saa ya Kufika"
                        value={dispatchForm.expectedArrivalTime}
                        onChange={e => setDispatchForm(f => ({ ...f, expectedArrivalTime: e.target.value }))}
                        style={{ ...inp, flex: 1 }} />
                    </div>
                  </>
                )}

                {dispatchMode === 'agent' && (
                  <>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                      Chagua wakala wa mtaa kwa uwasilishaji wa mwisho
                      katika {dispatchParcel.destinationCity}
                    </div>
                    {localAgents.length === 0 ? (
                      <div style={{ backgroundColor: '#fff7ed', borderRadius: 8,
                        padding: 12, fontSize: 12, color: '#c2410c' }}>
                        Hakuna mawakala walioidhinishwa katika {dispatchParcel.destinationCity}
                      </div>
                    ) : (
                      localAgents.map(a => (
                        <div key={a.id}
                          onClick={() => setSelectedAgent(selectedAgent?.id === a.id ? null : a)}
                          style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            marginBottom: 8,
                            border: selectedAgent?.id === a.id
                              ? '2px solid #16a34a' : '1px solid #e2e8f0',
                            backgroundColor: selectedAgent?.id === a.id ? '#f0fdf4' : '#fff' }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {a.fullName} {selectedAgent?.id === a.id && '✅'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            ⭐ {Number(a.rating || 5).toFixed(1)} ·
                            TZS {Number(a.deliveryFee || 1000).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}

                <input type="text" placeholder="Maelezo ya ziada (hiari)"
                  value={dispatchForm.notes}
                  onChange={e => setDispatchForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inp, marginBottom: 14, marginTop: 8 }} />

                <button onClick={handleDispatch} disabled={actionLoading}
                  style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff',
                    border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer',
                    fontSize: 14, fontWeight: 900 }}>
                  {actionLoading ? '⏳' : '📤 Tuma Sasa'}
                </button>
              </div>
            ) : (
              <>
                {/* Ready to dispatch */}
                {toDispatch.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a',
                      marginBottom: 8 }}>
                      📤 TAYARI KUTUMA ({toDispatch.length})
                    </div>
                    {toDispatch.map(p => (
                      <PCard key={p.trackingNumber} p={p} actions={[
                        { label: '🏢 Hamisha Hub', color: '#7c3aed', fn: (parcel) => setTransferModal(parcel) },
                        { label: '🚌 Panga Usafiri', color: '#1d4ed8',
                          fn: (parcel) => openAssignTransport(
                            parcel.trackingNumber,
                            parcel.originCity || profile?.city || 'Dar es Salaam',
                            parcel.destinationCity
                          )
                        },
                        { label: '📤 Tuma', color: '#16a34a',
                          fn: (parcel) => {
                            setDispatchParcel(parcel);
                            setDispatchForm({ transportType: 'bus', busCompany: '',
                              busTicketNumber: '', busDeparture: '',
                              courierName: '', courierTrackingRef: '', notes: '',
                              driverName: '', driverPhone: '', vehicleNumber: '',
                              departureDate: '', departureTime: '',
                              expectedArrivalDate: '', expectedArrivalTime: '' });
                            setSelectedAgent(null); setDispatchMode('transport');
                          }},
                      ]} />
                    ))}
                  </>
                )}

                {/* In transit */}
                {inTransit.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#ca8a04',
                      marginBottom: 8, marginTop: 16 }}>
                      🚌 NJIANI ({inTransit.length})
                    </div>
                    {inTransit.map(p => (
                      <PCard key={p.trackingNumber} p={p} actions={[
                        { label: 'Sasisha', color: '#64748b',
                          fn: (parcel) => { setStatusParcel(parcel); setNewStatus(''); } },
                         { label: confirmSending[p.orderId] ? '⏳...' : '📲 Thibitisha', // eslint-disable-line no-undef
                          color: '#16a34a',
                           fn: (parcel) => handleSendConfirmLink(parcel.orderId) }, // eslint-disable-line no-undef
                      ]} />
                    ))}
                  </>
                )}

                {toDispatch.length === 0 && inTransit.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                    Vifurushi vyote vimetumwa
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            💰 MAPATO TAB
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'mapato' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>
                  💵 CASH YA LEO
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>
                  TZS {cashToday.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Umekusanya moja kwa moja
                </div>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6 }}>
                  💳 KENTEXA INAKUDAIWA
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8' }}>
                  TZS {kenetxaOwes.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Ada ya usafirishaji — online orders
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                📊 Muhtasari wa Mwezi
              </div>
              {[
                ['Vifurushi vyote', dashData?.stats?.totalParcels || 0, '📦'],
                ['Vimefikishwa', dashData?.stats?.delivered || 0, '✅'],
                ['Mapato yote', `TZS ${Number(dashData?.stats?.totalEarnings || 0).toLocaleString()}`, '💰'],
                ['Inasubiri kulipwa', `TZS ${Number(dashData?.stats?.pendingEarnings || 0).toLocaleString()}`, '⏳'],
              ].map(([l, v, icon]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>{icon} {l}</span>
                  <span style={{ fontWeight: 800, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Founding-pilot free orders + real billing balance */}
            {dashData?.agent?.billing && (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14,
                border: dashData.agent.billing.billingBlocked ? '2px solid #dc2626' : 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                  🎁 Faida ya Super Agent Mwanzilishi
                </div>
                {[
                  ['Agizo la bure lililotolewa', dashData.agent.billing.freeOrdersGranted],
                  ['Agizo la bure lililotumika', dashData.agent.billing.freeOrdersUsed],
                  ['Yamebaki bure', dashData.agent.billing.freeOrdersRemaining],
                  ['Maagizo yaliyolipiwa', dashData.agent.billing.paidOrders],
                  ['Ada kwa kila agizo', `TZS ${Number(dashData.agent.billing.platformFeePerOrder).toLocaleString()}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l}</span>
                    <span style={{ fontWeight: 800, color: '#1e293b' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '10px 0 0', fontSize: 14 }}>
                  <span style={{ color: '#64748b', fontWeight: 700 }}>Deni lililobaki</span>
                  <span style={{ fontWeight: 900,
                    color: dashData.agent.billing.billingBlocked ? '#dc2626' : '#1e293b' }}>
                    TZS {Number(dashData.agent.billing.outstandingBalance).toLocaleString()}
                    {' '}/ {Number(dashData.agent.billing.billingThreshold).toLocaleString()}
                  </span>
                </div>
                {dashData.agent.billing.billingBlocked && (
                  <div style={{ marginTop: 10, backgroundColor: '#fef2f2', borderRadius: 8,
                    padding: '10px 12px', fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
                    ⚠️ Huduma imesimamishwa hadi deni lilipwe. Wasiliana na Kentexa kulipa deni lako.
                  </div>
                )}
              </div>
            )}

            {/* Online orders pending payout */}
            {parcels.filter(p => p.source === 'online' && !p.agentPaidOut && p.status === 'delivered').length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
                  💳 ONLINE ORDERS — KenteXa Itakulipa
                </div>
                {parcels.filter(p => p.source === 'online' && !p.agentPaidOut).map(p => (
                  <div key={p.trackingNumber} style={{ backgroundColor: '#eff6ff',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1d4ed8',
                        fontWeight: 700 }}>{p.trackingNumber}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {p.originCity} → {p.destinationCity} · <SBadge status={p.status} />
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: 14 }}>
                      TZS {Number(p.actualShippingFee || p.superAgentEarnings || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            📋 BEI TAB — Rate Card
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'bei' && (
          <>
            <div style={{ backgroundColor: '#fff7ed', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
              💡 Orodha hii inakusaidia kujibu haraka mtu anayeuliza bei ya kutuma mzigo
            </div>
            {rates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                Bado haujaweka bei zako.
                <br />
                <button onClick={() => onNavigate('SuperAgentSettings')}
                  style={{ marginTop: 12, backgroundColor: '#1d4ed8', color: '#fff',
                    border: 'none', padding: '10px 20px', borderRadius: 8,
                    cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  + Weka Bei Zangu
                </button>
              </div>
            ) : (
              <>
                <div style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    backgroundColor: '#f8fafc', padding: '10px 14px',
                    fontSize: 11, fontWeight: 800, color: '#64748b' }}>
                    <span>MJI</span><span>KWA KG</span><span>BEI YA CHINI</span>
                  </div>
                  {rates.map((r, i) => (
                    <div key={r.id} style={{ display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      padding: '10px 14px', fontSize: 13,
                      backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa',
                      borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>
                        {r.destinationCity}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        TZS {Number(r.perKgFee || 0).toLocaleString()}
                      </span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>
                        TZS {Number(r.baseShippingFee || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => onNavigate('SuperAgentSettings')}
                  style={{ width: '100%', marginTop: 12, background: '#fff',
                    color: '#1d4ed8', border: '2px solid #1d4ed8', padding: 12,
                    borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  ✏️ Hariri Bei
                </button>
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            🚐 VAN YA LEO TAB (Dar only)
            ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'van' && isDar && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚐</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
              Van ya Leo — Dar es Salaam
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Simamia batchi ya leo ya uwasilishaji ndani ya Dar
            </div>
            <button onClick={() => onNavigate('VanToday')}
              style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none',
                padding: '14px 28px', borderRadius: 12, cursor: 'pointer',
                fontSize: 15, fontWeight: 900 }}>
              🚐 Fungua Van ya Leo
            </button>
          </div>
        )}
      </div>

      {/* ── Status update bottom sheet ─────────────────────────────────────── */}
      {statusParcel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
            padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 4 }}>
              Sasisha Hali
            </div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1d4ed8',
              marginBottom: 14 }}>
              {statusParcel.trackingNumber}
            </div>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              style={{ ...inp, marginBottom: 12 }}>
              <option value="">— Chagua Hali Mpya —</option>
              {[
                ['received_at_hub',   '📥 Imepokewa Hubuni'],
                ['verified',         '✅ Imethibitishwa'],
                ['ready_for_dispatch','📦 Tayari Kutuma'],
                ['dispatched',       '🚌 Imetumwa'],
                ['in_transit',       '🚚 Njiani'],
                ['arrived_at_hub',   '🏢 Imefika Hubuni'],
                ['awaiting_buyer',   '⏳ Inasubiri Mteja'],
                ['out_for_delivery', '🏍️ Inafikishwa'],
                ['delivered',        '✅ Imefikishwa'],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="text" placeholder="Maelezo (hiari)"
              value={statusNote} onChange={e => setStatusNote(e.target.value)}
              style={{ ...inp, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleStatus} disabled={actionLoading || !newStatus}
                style={{ flex: 2, backgroundColor: !newStatus ? '#94a3b8' : '#1d4ed8',
                  color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                  cursor: 'pointer', fontSize: 14, fontWeight: 900 }}>
                {actionLoading ? '⏳' : '💾 Hifadhi'}
              </button>
              <button onClick={() => { setStatusParcel(null); setNewStatus(''); setStatusNote(''); }}
                style={{ flex: 1, background: '#fff', color: '#64748b',
                  border: '2px solid #e2e8f0', padding: 14, borderRadius: 10,
                  cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Ghairi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Transport Modal ──────────────────────────────────── */}
      {assignTransport && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
            padding: 20, width: '100%', maxWidth: 560, maxHeight: '85vh',
            overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>
                  🚌 Panga Usafiri
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {assignTransport.fromCity} → {assignTransport.toCity}
                  {assignTransport.trackingNumber && ` · ${assignTransport.trackingNumber}`}
                </div>
              </div>
              <button onClick={() => setAssignTransport(null)}
                style={{ background: 'none', border: 'none', fontSize: 24,
                  cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {loadingTransport ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                🔍 Inatafuta wasafirishaji...
              </div>
            ) : (<>

              {/* Published availability — today/tomorrow */}
              {transportOptions?.published?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a',
                    marginBottom: 8 }}>✅ NAFASI ZILIZOCHAPISHWA LEO / KESHO</div>
                  {transportOptions.published.map(avail => (
                    <div key={avail.id}
                      onClick={() => { setSelectedProvider(avail.provider); setSelectedAvailId(avail.id); }}
                      style={{ padding: 12, borderRadius: 12, marginBottom: 8, cursor: 'pointer',
                        border: `2px solid ${selectedAvailId === avail.id ? '#16a34a' : '#e2e8f0'}`,
                        backgroundColor: selectedAvailId === avail.id ? '#f0fdf4' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                            {avail.provider?.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            📅 {avail.date} {avail.departureTime && `· ${avail.departureTime}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
                            {avail.totalSlots - avail.usedSlots} nafasi
                          </div>
                          {avail.notes && (
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{avail.notes}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* All verified providers on this route */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
                  🚌 WASAFIRISHAJI KWENYE NJIA HII
                </div>
                {transportOptions?.providers?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8',
                    backgroundColor: '#f8fafc', borderRadius: 10 }}>
                    Hakuna msafirishaji aliyesajiliwa kwenye njia hii bado.
                    <br />
                    <span style={{ fontSize: 11 }}>Unaweza bado kumpa mgawo mtu yeyote hapa chini.</span>
                  </div>
                ) : transportOptions?.providers?.map(p => (
                  <div key={p.id}
                    onClick={() => { setSelectedProvider(p); setSelectedAvailId(null); }}
                    style={{ padding: 12, borderRadius: 12, marginBottom: 8, cursor: 'pointer',
                      border: `2px solid ${selectedProvider?.id === p.id && !selectedAvailId ? '#1d4ed8' : '#e2e8f0'}`,
                      backgroundColor: selectedProvider?.id === p.id && !selectedAvailId ? '#eff6ff' : '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
                          {p.type === 'bus' ? '🚌' : p.type === 'van' ? '🚐' : p.type === 'courier' ? '📦' : '🚛'} {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {p.contactPhone}
                          {p.rating > 0 && ` · ⭐ ${p.rating}`}
                          {p.completedAssignments > 0 && ` · ${p.completedAssignments} zilizokamilika`}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {p.confirmMode === 'auto' ? '⚡ Auto' : '✋ Manual'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected provider details + confirm */}
              {selectedProvider && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: 12,
                  padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                    ✅ Umechagua: {selectedProvider.name}
                    {selectedAvailId && ' (nafasi iliyochapishwa)'}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
                      display: 'block', marginBottom: 4 }}>
                      Bei Iliyokubaliwa (TZS) — hiari
                    </label>
                    <input type="number"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                      placeholder="Bei mnayokubaliwa nje ya KenteXa"
                      value={agreedPrice}
                      onChange={e => setAgreedPrice(e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
                      display: 'block', marginBottom: 4 }}>
                      Maelezo / Maagizo
                    </label>
                    <input
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
                      placeholder="e.g. Parcel nyepesi, iangaliwe vizuri"
                      value={transportNotes}
                      onChange={e => setTransportNotes(e.target.value)} />
                  </div>
                  <button onClick={handleAssignTransport} disabled={assigningTransport}
                    style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                      color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0',
                      fontSize: 14, fontWeight: 800,
                      cursor: assigningTransport ? 'not-allowed' : 'pointer' }}>
                    {assigningTransport ? '⏳ Inatuma...' :
                      selectedProvider.confirmMode === 'auto'
                        ? `⚡ Panga Moja kwa Moja — ${selectedProvider.name}`
                        : `📲 Tuma Ombi — ${selectedProvider.name}`}
                  </button>
                  {selectedProvider.confirmMode === 'manual' && (
                    <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
                      Msafirishaji atapata arifa na atathibitisha
                    </div>
                  )}
                </div>
              )}
            </>)}
          </div>
        </div>
      )}

      {transferModal && (
        <div style={{ position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:3000,display:'flex',alignItems:'flex-end' }}>
          <div style={{ width:'100%',backgroundColor:'#fff',borderRadius:'20px 20px 0 0',padding:'24px 20px 40px' }}>
            <div style={{ fontSize:16,fontWeight:900,color:'#1e293b',marginBottom:4 }}>🏢 Hamisha kwa Hub Nyingine</div>
            <div style={{ fontSize:12,color:'#64748b',marginBottom:20 }}>{transferModal.trackingNumber}</div>
            <input style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,marginBottom:10,boxSizing:'border-box',outline:'none' }}
              placeholder="Jina la Hub ya Marudio (e.g. KenteXa Hub Mwanza)"
              value={transferForm.destinationHub}
              onChange={e => setTransferForm(f => ({ ...f, destinationHub: e.target.value }))} />
            <input style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,marginBottom:10,boxSizing:'border-box',outline:'none' }}
              placeholder="Mji wa Marudio (e.g. Mwanza)"
              value={transferForm.destinationCity}
              onChange={e => setTransferForm(f => ({ ...f, destinationCity: e.target.value }))} />
            <input style={{ width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid #e2e8f0',fontSize:14,marginBottom:16,boxSizing:'border-box',outline:'none' }}
              placeholder="Maelezo (hiari)"
              value={transferForm.note}
              onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))} />
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={() => setTransferModal(null)}
                style={{ flex:1,backgroundColor:'#f1f5f9',color:'#64748b',border:'none',borderRadius:10,padding:'12px 0',cursor:'pointer',fontSize:14,fontWeight:700 }}>
                Funga
              </button>
              <button onClick={() => handleTransferHub(transferModal.trackingNumber, transferForm)}
                style={{ flex:2,background:'linear-gradient(135deg,#7c3aed,#1d4ed8)',color:'#fff',border:'none',borderRadius:10,padding:'12px 0',cursor:'pointer',fontSize:14,fontWeight:800 }}>
                ✅ Hamisha Sasa
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SuperAgentDashboard;