/**
 * AgentDashboard.js — unified dashboard for local KenteXa agents
 *
 * Combines what was previously split across two pages:
 *   - AgentDashboard (hub parcel claim + payment collection)
 *   - AgentOrderDashboard (direct seller pickup orders)
 *
 * A local agent has two types of work:
 *   1. DIRECT ORDERS — seller-to-buyer within one city.
 *      Buyer pays online, agent picks up from seller, delivers to buyer.
 *      Flow: Available → Claim → Pickup confirmed → Delivered
 *
 *   2. HUB PARCELS — intercity parcels that arrived at Super Agent hub.
 *      Super Agent assigns parcel to local agent for last-mile delivery.
 *      Flow: Arrived at hub (claim) → Out for delivery → Delivered
 *
 *   3. PAYMENT COLLECTION — agent processes M-Pesa/Airtel payments for buyers
 *      who walk in without a phone/card. Commission per transaction.
 */
import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';

// ── Status colours used across both order and parcel cards ────────────────
const STATUS_COLOR = {
  pending:          { bg: '#fef9c3', color: '#ca8a04' },
  paid:             { bg: '#dbeafe', color: '#2563eb' },
  preparing:        { bg: '#ede9fe', color: '#7c3aed' },
  in_transit:       { bg: '#fef3c7', color: '#d97706' },
  delivered:        { bg: '#dcfce7', color: '#16a34a' },
  cancelled:        { bg: '#fee2e2', color: '#dc2626' },
  arrived_at_hub:   { bg: '#eff6ff', color: '#1d4ed8' },
  out_for_delivery: { bg: '#fef9c3', color: '#ca8a04' },
};

const TIER_STYLE = {
  basic:  { bg: '#f1f5f9', color: '#64748b', icon: '🥉', label: 'BASIC' },
  silver: { bg: '#e2e8f0', color: '#475569', icon: '🥈', label: 'SILVER' },
  gold:   { bg: '#fef9c3', color: '#ca8a04', icon: '🥇', label: 'GOLD' },
};

// ── Launch scope ──────────────────────────────────────────────────────────
// Agents can help buyers pay (💳 Pay tab) from day one. The job queue
// (claim/pickup/deliver flow) stays disabled until that logic gets more
// real-world testing — flip this back on when ready, nothing below it
// needs to change.
const JOB_QUEUE_ENABLED = false;

const ComingSoonPanel = ({ icon, title, body }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 40,
    textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: '#64748b', maxWidth: 320, margin: '0 auto' }}>{body}</div>
  </div>
);


const JobCard = ({ order, onClaim, onPickup, onDeliver, actionLoading, profile }) => {
  const isClaimed    = order.status === 'preparing' || order.agentId;
  const isPickedUp   = order.status === 'in_transit';
  const isDelivered  = order.status === 'delivered';
  const fee          = Number(order.deliveryFeeAmount || order.agentCommissionAmount || 0);
  const weight       = order.weightKg || order.items?.reduce((s,i) => s + (i.weight||0)*i.qty, 0) || 0;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
      border: isClaimed ? '2px solid #f59e0b' : '1px solid #e2e8f0' }}>

      {/* Header bar */}
      <div style={{ background: isClaimed ? 'linear-gradient(135deg,#f59e0b,#f97316)'
        : 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
        padding: '10px 16px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>
          {isClaimed ? '🔥 UNAOIFANYA' : '📦 KAZI MPYA'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {weight > 0 && (
            <span style={{ fontSize: 10, backgroundColor: 'rgba(255,255,255,0.2)',
              color: '#fff', padding: '2px 8px', borderRadius: 100, fontWeight: 700 }}>
              {weight}kg
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 900, color: '#fff' }}>
            TZS {fee.toLocaleString() || '—'}
          </span>
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {/* Product */}
        <div style={{ fontSize: 14, fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>
          {order.product?.name || order.manualProductName || order.description || 'Bidhaa'}
          {order.quantity > 1 && <span style={{ color: '#64748b', fontWeight: 600 }}> ×{order.quantity}</span>}
        </div>

        {/* Route: Pickup → Delivery */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 12 }}>
          {/* Pickup */}
          <div style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: '10px 0 0 10px',
            padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8',
              letterSpacing: 0.5, marginBottom: 4 }}>📤 CHUKUA KUTOKA</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
              {order.seller?.storeName || order.seller?.businessName || order.seller?.name || 'Muuzaji'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {order.sellerPickupAddress || order.originCity || profile?.city || '—'}
            </div>
            {order.seller?.user?.phone || order.seller?.phone ? (
              <a href={`tel:${order.seller?.user?.phone || order.seller?.phone}`}
                style={{ fontSize: 11, color: '#1d4ed8', textDecoration: 'none',
                  fontWeight: 700, marginTop: 4, display: 'block' }}
                onClick={e => e.stopPropagation()}>
                📞 {order.seller?.user?.phone || order.seller?.phone}
              </a>
            ) : null}
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc',
            padding: '0 8px', fontSize: 16, color: '#94a3b8' }}>→</div>

          {/* Delivery */}
          <div style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: '0 10px 10px 0',
            padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#16a34a',
              letterSpacing: 0.5, marginBottom: 4 }}>📥 PELEKA KWA</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
              {order.buyer?.name || order.manualBuyerName || order.recipientName || 'Mnunuzi'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {order.ward || order.district || order.deliveryAddress?.split(',')[0] || order.destinationCity || '—'}
            </div>
            {order.buyer?.phone || order.phone || order.manualBuyerPhone ? (
              <a href={`tel:${order.buyer?.phone || order.phone || order.manualBuyerPhone}`}
                style={{ fontSize: 11, color: '#16a34a', textDecoration: 'none',
                  fontWeight: 700, marginTop: 4, display: 'block' }}
                onClick={e => e.stopPropagation()}>
                📞 {order.buyer?.phone || order.phone || order.manualBuyerPhone}
              </a>
            ) : null}
          </div>
        </div>

        {/* Full delivery address */}
        {order.deliveryAddress && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '7px 10px',
            fontSize: 11, color: '#64748b', marginBottom: 10, display: 'flex', gap: 6 }}>
            <span>📍</span>
            <span>{order.deliveryAddress}</span>
          </div>
        )}

        {/* Action button */}
        {!isClaimed && !isDelivered && (
          <button onClick={() => onClaim(order.id)}
            disabled={actionLoading[order.id]}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: actionLoading[order.id] ? '#94a3b8'
                : 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
              color: '#fff', fontSize: 14, fontWeight: 900,
              cursor: actionLoading[order.id] ? 'not-allowed' : 'pointer' }}>
            {actionLoading[order.id] ? '⏳ Inashughulikia...' : '✅ Chukua Kazi Hii'}
          </button>
        )}
        {isClaimed && !isPickedUp && !isDelivered && (
          <button onClick={() => onPickup(order.id)}
            disabled={actionLoading[order.id]}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
            {actionLoading[order.id] ? '⏳...' : '📦 Nimechukua Bidhaa'}
          </button>
        )}
        {isPickedUp && (
          <button onClick={() => onDeliver(order.id)}
            disabled={actionLoading[order.id]}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#16a34a,#059669)',
              color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
            {actionLoading[order.id] ? '⏳...' : '🏠 Imetolewa kwa Mnunuzi'}
          </button>
        )}
        {isDelivered && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13,
            fontWeight: 800, color: '#16a34a' }}>
            ✅ Imetolewa
          </div>
        )}
      </div>
    </div>
  );
};

const AgentDashboard = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  // ── State ────────────────────────────────────────────────────────────────
  const [profile, setProfile]           = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [tab, setTab]                   = useState('pay'); // 'work' | 'pay' | 'earnings'
  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline]               = useState(false);
  const [togglingOnline, setTogglingOnline]     = useState(false);
  const [availableJobs, setAvailableJobs]     = useState([]);
  const [jobsLoading, setJobsLoading]           = useState(false);
  const [transportForms, setTransportForms]     = useState({});
  const [savingTransport, setSavingTransport]   = useState(null);

  // Work queue — both direct orders and hub parcels combined
  const [directOrders, setDirectOrders]   = useState([]);
  const [myOrders, setMyOrders]           = useState([]);
  const [hubParcels, setHubParcels]       = useState([]);
  const [myParcels, setMyParcels]         = useState([]);
  const [workLoading, setWorkLoading]     = useState(false);

  // Stats
  const [stats, setStats]               = useState(null);
  const [payStats, setPayStats]         = useState(null);

  // Payment collection state
  const [invoiceInput, setInvoiceInput]   = useState('');
  const [invoiceLookup, setInvoiceLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [agentPhone, setAgentPhone]       = useState('');
  const [processing, setProcessing]       = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentPending, setPaymentPending] = useState(false);

  // Collection jobs state
  const [availableCollections, setAvailableCollections] = useState([]);
  const [myCollections, setMyCollections]               = useState([]);
  const [collectionLoading, setCollectionLoading]       = useState(false);

  // Delivery note for confirmations
  const [selectedItem, setSelectedItem]   = useState(null); // { type: 'order'|'parcel'|'collection', id }
  const [note, setNote]                   = useState('');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchJobs = async (city, maxWeight) => {
    try {
      setJobsLoading(true);
      await api.get(`/agents/available?city=${encodeURIComponent(city || '')}&weight=${maxWeight || 20}`);
      // Actually we need delivery jobs, not agents — for now show a placeholder
      // TODO: wire to /delivery-jobs/available when built
      setAvailableJobs([]);
    } catch { setAvailableJobs([]); }
    finally { setJobsLoading(false); }
  };

  const handleToggleOnline = async () => {
    try {
      setTogglingOnline(true);
      const res = await api.patch('/agents/toggle-online');
      setIsOnline(res.data.isOnline);
      if (res.data.isOnline && profile?.city) {
        fetchJobs(profile.city, profile.maxWeightKg);
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally { setTogglingOnline(false); }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const profileRes = await api.get('/agents/my-profile');
      setProfile(profileRes.data);
      setIsOnline(profileRes.data?.isOnline || false);
      if (profileRes.data?.isOnline && profileRes.data?.city) {
        fetchJobs(profileRes.data.city, profileRes.data.maxWeightKg);
      }
      setProfileStatus(profileRes.data.status);

      if (profileRes.data.status === 'approved') {
        await Promise.all([fetchWork(profileRes.data), fetchPayStats()]);
      }
    } catch (err) {
      if (err?.response?.status === 404) setProfileStatus('not_applied');
      else setError('Imeshindwa kupakia dashibodi');
    } finally {
      setLoading(false);
    }
  };

  const fetchWork = async (agentProfile) => {
    try {
      setWorkLoading(true);
      const city = agentProfile?.city || agentProfile?.district || agentProfile?.region;

      const [availRes, myRes, statsRes] = await Promise.all([
        api.get('/agent-orders/available'),
        api.get('/agent-orders/my-orders'),
        api.get('/agent-orders/stats'),
      ]);
      setDirectOrders(availRes.data || []);
      setMyOrders(myRes.data || []);
      setStats(statsRes.data);

      if (city) {
        const [incomingRes, mineRes] = await Promise.all([
          api.get(`/super-agents/incoming-parcels?city=${encodeURIComponent(city)}`),
          api.get('/super-agents/my-deliveries'),
        ]);
        setHubParcels(incomingRes.data || []);
        setMyParcels(mineRes.data || []);
      }
      // Fetch collection jobs
      try {
        setCollectionLoading(true);
        const [availColRes, myColRes] = await Promise.all([
          api.get('/collections/available'),
          api.get('/collections/my-collections'),
        ]);
        setAvailableCollections(availColRes.data || []);
        setMyCollections(myColRes.data || []);
      } catch {} finally { setCollectionLoading(false); }
    } catch {}
    finally { setWorkLoading(false); }
  };

  const fetchPayStats = async () => {
    try {
      const res = await api.get('/payments/agent/dashboard');
      setPayStats(res.data);
    } catch {}
  };

  // ── Direct order actions ──────────────────────────────────────────────────
  const handleClaimOrder = async (orderId) => {
    try {
      setActionLoading(true); setError('');
      await api.post(`/agent-orders/${orderId}/claim`);
      setSuccess(`Agizo #${orderId} limechukuliwa! Nenda "Kazi Yangu" kukipokea.`);
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kudai agizo');
    } finally { setActionLoading(false); }
  };

  const handlePickup = async (orderId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agent-orders/${orderId}/pickup`, { note });
      setSuccess(`Agizo #${orderId} limepokelewa kutoka kwa muuzaji!`);
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha');
    } finally { setActionLoading(false); }
  };

  const handleDeliverOrder = async (orderId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agent-orders/${orderId}/deliver`, { note });
      setSuccess(`Agizo #${orderId} limefikishwa! Hongera! 🎉`);
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha');
    } finally { setActionLoading(false); }
  };

  // ── Hub parcel actions ────────────────────────────────────────────────────
  const handleClaimParcel = async (trackingNumber) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${trackingNumber}/claim`);
      setSuccess(`Kifurushi ${trackingNumber} kimechukuliwa kwa uwasilishaji!`);
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kudai kifurushi');
    } finally { setActionLoading(false); }
  };

  const handleParcelStatus = async (trackingNumber, status) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${trackingNumber}/delivery-status`, { status });
      setSuccess(`Hali imesasishwa: ${status}`);
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kusasisha hali');
    } finally { setActionLoading(false); }
  };

  // ── Payment collection ────────────────────────────────────────────────────
  const handleLookupInvoice = async () => {
    if (!invoiceInput.trim()) return;
    try {
      setLookupLoading(true); setError(''); setInvoiceLookup(null);
      const res = await api.get(`/payments/agent/lookup/${invoiceInput.trim()}`);
      setInvoiceLookup(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Ankara haipatikani');
    } finally { setLookupLoading(false); }
  };

  const handleCollectPayment = async () => {
    if (!agentPhone.trim()) { setError('Weka namba yako ya simu'); return; }
    try {
      setProcessing(true); setError('');
      const res = await api.post('/payments/agent/initiate', {
        invoiceNumber: invoiceLookup.invoiceNumber,
        agentPhone:    agentPhone.trim(),
        provider:      'selcom',
      });
      setPaymentPending(true);
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setPaymentResult({
            invoiceNumber:    invoiceLookup.invoiceNumber,
            amount:           invoiceLookup.amount,
            commissionAmount: Math.round(invoiceLookup.amount * 0.025),
          });
          setPaymentPending(false);
          setInvoiceLookup(null);
          setInvoiceInput('');
          setAgentPhone('');
          fetchPayStats();
        } catch { setError('Malipo yameshindwa'); setPaymentPending(false); }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuanzisha malipo');
    } finally { setProcessing(false); }
  };

  // ── Collection handlers ──────────────────────────────────────────────────
  const handleClaimCollection = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      await api.post(`/collections/${collectionId}/claim`);
      setSuccess('Umechukua kazi ya kukusanya! Nenda kwa muuzaji.'); 
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kudai kazi');
    } finally { setActionLoading(false); }
  };

  const handleConfirmCollected = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/collections/${collectionId}/collected`, { notes: note });
      setSuccess('Umekusanya kifurushi! Peleka kwenye Super Agent hub.');
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha');
    } finally { setActionLoading(false); }
  };

  const handleHandedOver = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      const res = await api.patch(`/collections/${collectionId}/handed-over`);
      setSuccess(`Kazi imekamilika! Mapato yako: TZS ${Number(res.data?.collectionFee || 0).toLocaleString()} 🎉`);
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha');
    } finally { setActionLoading(false); }
  };

  // ── Computed work queue counts ─────────────────────────────────────────────
  const pendingDirectOrders  = directOrders.length;
  const activeDirectOrders   = myOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const availableHubParcels  = hubParcels.length;
  const activeHubParcels     = myParcels.length;
  const totalCollections = availableCollections.length + myCollections.length;
  const totalWorkItems = pendingDirectOrders + activeDirectOrders + availableHubParcels + activeHubParcels + totalCollections;

  // ── Render helpers ─────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 13,
    boxSizing: 'border-box', outline: 'none',
  };

  const ActionNote = ({ onConfirm, label, loading }) => (
    <div style={{ marginTop: 8 }}>
      <input placeholder="Maelezo (si lazima)" value={note}
        onChange={e => setNote(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={loading}
          style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
          {loading ? '⏳' : `✅ ${label}`}
        </button>
        <button onClick={() => { setSelectedItem(null); setNote(''); }}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
          Ghairi
        </button>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="AgentDashboard" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        Inapakia...
      </div>
    </div>
  );

  const tier = TIER_STYLE[profile?.tier || 'basic'];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', paddingBottom: 90 }}>
      <Navbar currentPage="AgentDashboard" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('Home')} title="🤝 Dashibodi ya Wakala" />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 2px' }}>
              {profile?.fullName || 'KenteXa Agent'}
            </h1>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
              {profile?.agentCode || '—'} · {profile?.city || profile?.district || 'Location not set'}
            </div>
          </div>
          {profile?.status === 'approved' && (
            <button onClick={handleToggleOnline} disabled={togglingOnline}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: togglingOnline ? 'not-allowed' : 'pointer',
                fontWeight: 800, fontSize: 12,
                backgroundColor: isOnline ? '#dcfce7' : 'rgba(255,255,255,0.2)',
                color: isOnline ? '#15803d' : '#fff' }}>
              {togglingOnline ? '⏳' : isOnline ? '🟢 Online' : '⚫ Offline'}
            </button>
          )}
          {profile?.status === 'approved' && (
            <div style={{ ...tier, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
              {tier.icon} {tier.label}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Alerts */}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>✅ {success}</span>
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* ── NOT APPROVED YET ─────────────────────────────────────────── */}
        {profileStatus !== 'approved' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '32px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {profileStatus === 'pending' ? '⏳' : profileStatus === 'rejected' ? '❌' : profileStatus === 'suspended' ? '🚫' : '🤝'}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>
              {profileStatus === 'pending'     ? 'Application Under Review'  : ''}
              {profileStatus === 'rejected'    ? 'Application Declined'      : ''}
              {profileStatus === 'suspended'   ? 'Account Suspended'         : ''}
              {profileStatus === 'not_applied' ? 'Not Applied Yet'           : ''}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              {profileStatus === 'pending'     ? 'We\u2019ll review your application within 24 hours.' : ''}
              {profileStatus === 'rejected'    ? profile?.rejectionReason || 'Your application was declined.' : ''}
              {profileStatus === 'suspended'   ? profile?.rejectionReason || 'Contact KenteXa support.' : ''}
              {profileStatus === 'not_applied' ? 'Apply to become a KenteXa agent and start earning commission.' : ''}
            </p>
            {(profileStatus === 'not_applied' || profileStatus === 'rejected') && (
              <button onClick={() => onNavigate('BecomeAgent')}
                style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                🚀 {profileStatus === 'rejected' ? 'Apply Again' : 'Apply Now'}
              </button>
            )}
          </div>
        )}

        {/* ── APPROVED — FULL DASHBOARD ─────────────────────────────────── */}
        {profileStatus === 'approved' && (
          <>
            {/* Payment success banner */}
            {paymentResult && (
              <div style={{ background: 'linear-gradient(135deg,#43e97b,#38f9d7)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 900, color: '#1e293b' }}>✅ Malipo Yamefanywa!</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  {[
                    { l: 'Ankara', v: paymentResult.invoiceNumber },
                    { l: 'Kiasi', v: `TZS ${Number(paymentResult.amount).toLocaleString()}` },
                    { l: 'Kamisheni Yako', v: `TZS ${Number(paymentResult.commissionAmount).toLocaleString()}` },
                  ].map(i => (
                    <div key={i.l} style={{ backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', fontWeight: 700 }}>{i.l}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{i.v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setPaymentResult(null)}
                  style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.3)', color: '#1e293b', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  Funga
                </button>
              </div>
            )}

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { icon: '📦', label: 'Jobs Today',    value: totalWorkItems,                color: '#1d4ed8', bg: '#dbeafe' },
                { icon: '✅', label: 'Completed',      value: stats?.delivered || 0,         color: '#16a34a', bg: '#dcfce7' },
                { icon: '💰', label: 'Payment Earnings',value: payStats ? `TZS ${Number(payStats.stats?.confirmedEarnings || 0).toLocaleString()}` : '—', color: '#7c3aed', bg: '#ede9fe' },
                { icon: '⭐', label: 'Rating',         value: profile?.rating ? Number(profile.rating).toFixed(1) : '5.0', color: '#f59e0b', bg: '#fef9c3' },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16 }}>{s.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: s.color, wordBreak: 'break-all' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              {[
                { key: 'work',     label: JOB_QUEUE_ENABLED ? `🚚 Jobs (${totalWorkItems})` : '🚚 Jobs (soon)' },
                { key: 'pay',      label: '💳 Collect Payment' },
                { key: 'earnings', label: '💰 Earnings' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    backgroundColor: tab === t.key ? '#2563eb' : 'transparent',
                    color: tab === t.key ? '#fff' : '#64748b' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ═══ TAB: WORK QUEUE ══════════════════════════════════════════ */}
            {tab === 'work' && !JOB_QUEUE_ENABLED && (
              <ComingSoonPanel icon="🚧" title="Job Queue — Coming Soon"
                body="Claiming and delivering jobs directly from here is launching soon. For now, you can still help buyers pay using the Collect Payment tab." />
            )}
            {tab === 'work' && JOB_QUEUE_ENABLED && (
              <>
                {(workLoading || collectionLoading) && (
                  <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>⏳ Inapakia kazi...</div>
                )}

                {!workLoading && !collectionLoading && totalWorkItems === 0 && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>Kazi zote zimekamilika!</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>Hakuna maagizo au vifurushi vinavyosubiri sasa hivi</div>
                  </div>
                )}

                {/* SECTION A: Direct orders from sellers (available to claim) */}
                {directOrders.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#1d4ed8' }} />
                      MAAGIZO YANAYOSUBIRI KUCHUKULIWA ({directOrders.length})
                    </div>
                    {directOrders.map(order => (
                      <JobCard key={order.id} order={order} profile={profile}
                        actionLoading={actionLoading}
                        onClaim={handleClaimOrder}
                        onPickup={(id) => handleClaimOrder(id)}
                        onDeliver={(id) => handleClaimOrder(id)}
                      />
                    ))}
                  </div>
                )}

                {/* SECTION B: My active direct orders */}
                {myOrders.filter(o => !['delivered','cancelled'].includes(o.status)).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                      MAAGIZO YANGU YANAYOENDELEA
                    </div>
                    {myOrders.filter(o => !['delivered','cancelled'].includes(o.status)).map(order => {
                      const sc = STATUS_COLOR[order.status] || { bg: '#f1f5f9', color: '#64748b' };
                      const isSelected = selectedItem?.type === 'order' && selectedItem?.id === order.id;
                      const canPickup  = order.status === 'preparing';
                      const canDeliver = order.status === 'in_transit';
                      return (
                        <div key={order.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #f59e0b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Agizo #{order.id}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: sc.bg, color: sc.color }}>
                              {order.status?.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>📦 {order.product?.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                            👤 {order.buyer?.name || '—'} · 📍 {order.deliveryAddress || '—'}
                          </div>
                          {canPickup && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'order', id: order.id }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              📤 Thibitisha Umechukua kutoka kwa Muuzaji
                            </button>
                          )}
                          {canPickup && isSelected && (
                            <ActionNote onConfirm={() => handlePickup(order.id)} label="Nimechukua" loading={actionLoading} />
                          )}
                          {canDeliver && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'order', id: order.id }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              🏠 Thibitisha Umefisha kwa Mteja
                            </button>
                          )}
                          {canDeliver && isSelected && (
                            <ActionNote onConfirm={() => handleDeliverOrder(order.id)} label="Nimefisha" loading={actionLoading} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* SECTION C: Hub parcels available to claim */}
                {hubParcels.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7c3aed' }} />
                      VIFURUSHI VYA HUB — TAYARI KWA KUCHUKUA ({hubParcels.length})
                    </div>
                    <div style={{ backgroundColor: '#ede9fe', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#7c3aed' }}>
                      🏢 Vifurushi hivi vimefika kutoka mji mwingine na viko kwenye hub ya Super Agent — chukua na uwasilishe kwa mteja
                    </div>
                    {hubParcels.map(parcel => (
                      <div key={parcel.trackingNumber} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #7c3aed' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed' }}>{parcel.trackingNumber}</div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                            HUB
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {parcel.order?.product?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                          📍 Kutoka: {parcel.originCity} → {parcel.destinationCity}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                          👤 {parcel.recipientName || parcel.order?.buyer?.name || '—'} · 📞 {parcel.buyerPhone || '—'}
                        </div>
                        {parcel.deliveryAddress && (
                          <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#64748b' }}>
                            🏠 {parcel.deliveryAddress}
                          </div>
                        )}
                        <button onClick={() => handleClaimParcel(parcel.trackingNumber)} disabled={actionLoading}
                          style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                          🤝 Chukua Kifurushi Hiki
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* SECTION D: My active hub parcel deliveries */}
                {myParcels.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                      VIFURUSHI VYANGU VYA KUWASILISHA
                    </div>
                    {myParcels.map(parcel => {
                      const isSelected = selectedItem?.type === 'parcel' && selectedItem?.id === parcel.trackingNumber;
                      const canMarkOut   = parcel.status === 'arrived_at_hub';
                      const canDeliver   = parcel.status === 'out_for_delivery';
                      const canUpdateTransport = parcel.status === 'collected_by_agent';
                      const tForm = transportForms[parcel.trackingNumber] || {};
                      const showTransportForm = tForm.show || false;
                      const transportData = tForm.data || { busCompany: '', busTicketNumber: '', courierName: '', courierTrackingRef: '', departureTime: '' };
                      const setShowTransportForm = (val) => setTransportForms(f => ({ ...f, [parcel.trackingNumber]: { ...f[parcel.trackingNumber], show: val } }));
                      const setTransportData = (updater) => setTransportForms(f => {
                        const prev = f[parcel.trackingNumber]?.data || {};
                        const next = typeof updater === 'function' ? updater(prev) : updater;
                        return { ...f, [parcel.trackingNumber]: { ...f[parcel.trackingNumber], data: next } };
                      });
                      return (
                        <div key={parcel.trackingNumber} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #16a34a' }}>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: '#16a34a', marginBottom: 6 }}>{parcel.trackingNumber}</div>
                          <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {parcel.order?.product?.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                            👤 {parcel.recipientName || '—'} · 📞 {parcel.buyerPhone || '—'}
                            {parcel.deliveryAddress && ` · 📍 ${parcel.deliveryAddress}`}
                          </div>
                          {/* Agent fills transport details after collecting from seller */}
                          {canUpdateTransport && (
                            <div style={{ marginBottom: 10 }}>
                              {!showTransportForm ? (
                                <div>
                                  <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                                    📋 Umechukua bidhaa — weka maelezo ya usafirishaji
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setShowTransportForm('bus')}
                                      style={{ flex: 1, backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      🚌 Nimeweka Basi
                                    </button>
                                    <button onClick={() => setShowTransportForm('hub')}
                                      style={{ flex: 1, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      🏢 Nimepeleka Hub
                                    </button>
                                    <button onClick={() => setShowTransportForm('courier')}
                                      style={{ flex: 1, backgroundColor: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      📦 Nimepeleka Courier
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'bus' ? (
                                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 8 }}>🚌 Maelezo ya Basi</div>
                                  {[
                                    { key: 'busCompany', label: 'Kampuni ya Basi', placeholder: 'e.g. Scandinavian' },
                                    { key: 'busTicketNumber', label: 'Namba ya Tiketi *', placeholder: 'e.g. KE-12345' },
                                    { key: 'departureTime', label: 'Saa ya Kuondoka', placeholder: 'e.g. Jumanne 6am' },
                                  ].map(f => (
                                    <div key={f.key} style={{ marginBottom: 8 }}>
                                      <div style={{ fontSize: 11, color: '#92400e', marginBottom: 3 }}>{f.label}</div>
                                      <input type="text" placeholder={f.placeholder}
                                        value={transportData[f.key] || ''}
                                        onChange={e => setTransportData(d => ({ ...d, [f.key]: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #fed7aa', fontSize: 12, boxSizing: 'border-box' }} />
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={async () => {
                                      if (!transportData.busTicketNumber) return;
                                      setSavingTransport(parcel.trackingNumber);
                                      try {
                                        await api.patch(`/super-agents/shipments/${parcel.trackingNumber}/transport`, transportData);
                                        setShowTransportForm(false);
                                        fetchWork(profile);
                                      } catch {} finally { setSavingTransport(null); }
                                    }} disabled={savingTransport === parcel.trackingNumber}
                                      style={{ flex: 1, backgroundColor: '#c2410c', color: '#fff', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                      {savingTransport ? '⏳' : '💾 Hifadhi'}
                                    </button>
                                    <button onClick={() => setShowTransportForm(false)}
                                      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                                      Ghairi
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'courier' ? (
                                <div style={{ backgroundColor: '#faf5ff', borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>📦 Maelezo ya Courier</div>
                                  {[
                                    { key: 'courierName', label: 'Jina la Courier', placeholder: 'e.g. DHL, EMS' },
                                    { key: 'courierTrackingRef', label: 'Namba ya Kufuatilia *', placeholder: 'e.g. DHL1234567890' },
                                  ].map(f => (
                                    <div key={f.key} style={{ marginBottom: 8 }}>
                                      <div style={{ fontSize: 11, color: '#6b21a8', marginBottom: 3 }}>{f.label}</div>
                                      <input type="text" placeholder={f.placeholder}
                                        value={transportData[f.key] || ''}
                                        onChange={e => setTransportData(d => ({ ...d, [f.key]: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e9d5ff', fontSize: 12, boxSizing: 'border-box' }} />
                                    </div>
                                  ))}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={async () => {
                                      if (!transportData.courierTrackingRef) return;
                                      setSavingTransport(parcel.trackingNumber);
                                      try {
                                        await api.patch(`/super-agents/shipments/${parcel.trackingNumber}/transport`, transportData);
                                        setShowTransportForm(false);
                                        fetchWork(profile);
                                      } catch {} finally { setSavingTransport(null); }
                                    }} disabled={savingTransport === parcel.trackingNumber}
                                      style={{ flex: 1, backgroundColor: '#7c3aed', color: '#fff', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                      {savingTransport ? '⏳' : '💾 Hifadhi'}
                                    </button>
                                    <button onClick={() => setShowTransportForm(false)}
                                      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                                      Ghairi
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'hub' ? (
                                <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, fontSize: 12, color: '#1d4ed8' }}>
                                  🏢 Hub itasasisha tracking mara itakapopokea bidhaa yako.
                                  <button onClick={() => setShowTransportForm(false)}
                                    style={{ display: 'block', marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#1d4ed8' }}>
                                    Sawa ✓
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {canMarkOut && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'parcel', id: parcel.trackingNumber }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              🚴 Nimeanza Kuwasilisha
                            </button>
                          )}
                          {canMarkOut && isSelected && (
                            <ActionNote onConfirm={() => handleParcelStatus(parcel.trackingNumber, 'out_for_delivery')} label="Nimeanza" loading={actionLoading} />
                          )}
                          {canDeliver && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'parcel', id: parcel.trackingNumber }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              ✅ Nimefisha kwa Mteja
                            </button>
                          )}
                          {canDeliver && isSelected && (
                            <ActionNote onConfirm={() => handleParcelStatus(parcel.trackingNumber, 'delivered')} label="Nimefisha" loading={actionLoading} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              {/* SECTION E: Available collection jobs — new parcels to pick up from sellers */}
                {availableCollections.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0f172a' }} />
                      KUSANYA KUTOKA KWA WAUZAJI ({availableCollections.length})
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#475569' }}>
                      📦 Wauzaji hawa hawana uwezo wa kupeleka wenyewe kwenye hub — chukua bidhaa zao, peleka kwa Super Agent, upate kamisheni yako
                    </div>
                    {availableCollections.map(job => (
                      <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #0f172a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Kukusanya #{job.id}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {job.isRural && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#fef9c3', color: '#ca8a04' }}>🌾 VIJIJINI</span>
                            )}
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                              TZS {Number(job.collectionFee).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {job.order?.product?.name || '—'}</div>
                        <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>MUUZAJI — CHUKUA HAPA</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{job.seller?.storeName || job.seller?.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>📞 {job.seller?.phone || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>📍 {job.pickupAddress || '—'}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>🏙️ Jiji: {job.city}</div>
                        <button onClick={() => handleClaimCollection(job.id)} disabled={actionLoading}
                          style={{ width: '100%', background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                          🚴 Chukua Kazi Hii — TZS {Number(job.collectionFee).toLocaleString()}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* SECTION F: My active collection jobs */}
                {myCollections.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ca8a04', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ca8a04' }} />
                      MAKUSANYO YANGU YANAYOENDELEA
                    </div>
                    {myCollections.map(job => {
                      const isSelected = selectedItem?.type === 'collection' && selectedItem?.id === job.id;
                      const canConfirmCollected = job.status === 'claimed';
                      const canHandOver = job.status === 'collected';
                      return (
                        <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #ca8a04' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Kukusanya #{job.id}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                              +TZS {Number(job.collectionFee).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {job.order?.product?.name || '—'}</div>
                          <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>
                              {job.status === 'claimed' ? 'NENDA HAPA — CHUKUA BIDHAA' : 'PELEKA HUB — IMEKUSANYWA'}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{job.seller?.name || '—'} · {job.seller?.phone || '—'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>📍 {job.pickupAddress}</div>
                          </div>
                          {canConfirmCollected && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'collection', id: job.id }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              📦 Nilichukua kutoka kwa Muuzaji
                            </button>
                          )}
                          {canConfirmCollected && isSelected && (
                            <ActionNote onConfirm={() => handleConfirmCollected(job.id)} label="Nimekusanya" loading={actionLoading} />
                          )}
                          {canHandOver && !isSelected && (
                            <button onClick={() => handleHandedOver(job.id)} disabled={actionLoading}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              🏢 Nimekabidhi kwa Super Agent Hub
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ═══ TAB: PAYMENT COLLECTION ══════════════════════════════════ */}
            {tab === 'pay' && (
              <div>
                <div style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#1d4ed8' }}>
                  💡 Mteja ana ankara (invoice number)? Ingiza hapa chini, pokea pesa yake, na upate kamisheni yako mara moja.
                </div>

                {paymentPending ? (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 30, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Inashughulikia Malipo...</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>Tafadhali subiri sekunde 4–10</div>
                  </div>
                ) : invoiceLookup ? (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📋 Ankara Imepatikana</div>
                    {[
                      ['Ankara', invoiceLookup.invoiceNumber],
                      ['Kiasi', `TZS ${Number(invoiceLookup.amount).toLocaleString()}`],
                      ['Mteja', invoiceLookup.buyerName || '—'],
                      ['Bidhaa', invoiceLookup.productName || '—'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>{l}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', margin: '12px 0' }}>
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>KAMISHENI YAKO</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>
                        TZS {Math.round(invoiceLookup.amount * 0.025).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Namba Yako ya Simu (kwa kuthibitisha)</label>
                      <input type="tel" placeholder="255XXXXXXXXX" value={agentPhone}
                        onChange={e => setAgentPhone(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleCollectPayment} disabled={processing}
                        style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                        {processing ? '⏳ Inashughulikia...' : '💳 Pokea Malipo'}
                      </button>
                      <button onClick={() => { setInvoiceLookup(null); setInvoiceInput(''); setAgentPhone(''); }}
                        style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                        Ghairi
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>Nambari ya Ankara</label>
                    <input type="text" placeholder="e.g. KNT-INV-2025-00001"
                      value={invoiceInput} onChange={e => setInvoiceInput(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 10 }} />
                    <button onClick={handleLookupInvoice} disabled={lookupLoading || !invoiceInput.trim()}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                      {lookupLoading ? '⏳ Inatafuta...' : '🔍 Tafuta Ankara'}
                    </button>
                  </div>
                )}

                {/* Recent payment transactions */}
                {payStats?.recentTransactions?.length > 0 && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📜 Miamala ya Hivi Karibuni</div>
                    {payStats.recentTransactions.slice(0, 5).map((tx, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                        <span style={{ color: '#64748b' }}>{tx.invoiceNumber}</span>
                        <span style={{ fontWeight: 700, color: '#16a34a' }}>+TZS {Number(tx.commissionAmount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: EARNINGS ════════════════════════════════════════════ */}
            {tab === 'earnings' && (
              <div>
                {/* Full Earnings History + Scorecard */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <button onClick={() => onNavigate('AgentEarnings')}
                    style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#059669)',
                      color: '#fff', border: 'none', padding: '14px 16px', borderRadius: 14,
                      cursor: 'pointer', fontSize: 13, fontWeight: 800,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span>💰 Earnings History</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>Full transaction log →</span>
                  </button>
                  <button onClick={() => onNavigate('AgentScorecard')}
                    style={{ flex: 1, background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                      color: '#fff', border: 'none', padding: '14px 16px', borderRadius: 14,
                      cursor: 'pointer', fontSize: 13, fontWeight: 800,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span>📊 Scorecard</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>Performance stats →</span>
                  </button>
                </div>

                {/* Tier progress */}
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>My Tier</div>
                    <div style={{ ...tier, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                      {tier.icon} {tier.label}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {[
                      { label: '🥉 BASIC', commission: '2.5%', range: '0–50 orders', active: profile?.tier === 'basic' },
                      { label: '🥈 SILVER', commission: '3.5%', range: '51–200', active: profile?.tier === 'silver' },
                      { label: '🥇 GOLD', commission: '5.0%', range: '200+', active: profile?.tier === 'gold' },
                    ].map(t => (
                      <div key={t.label} style={{ backgroundColor: t.active ? '#fef9c3' : '#f8fafc', borderRadius: 10, padding: 10, textAlign: 'center', border: t.active ? '2px solid #f59e0b' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{t.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b' }}>{t.commission}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{t.range}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment earnings */}
                {payStats && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>💳 Payment Earnings</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        { l: 'Total Transactions', v: payStats.stats?.totalTransactions || 0, c: '#7c3aed', bg: '#ede9fe' },
                        { l: 'Confirmed Earnings', v: `TZS ${Number(payStats.stats?.confirmedEarnings || 0).toLocaleString()}`, c: '#16a34a', bg: '#dcfce7' },
                        { l: 'Pending', v: `TZS ${Number(payStats.stats?.pendingEarnings || 0).toLocaleString()}`, c: '#f59e0b', bg: '#fef9c3' },
                        { l: 'Commission Rate', v: `${payStats.stats?.commissionRate || 2.5}%`, c: '#1d4ed8', bg: '#dbeafe' },
                      ].map(s => (
                        <div key={s.l} style={{ backgroundColor: s.bg, borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 15, fontWeight: 900, color: s.c }}>{s.v}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delivery earnings */}
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>🚚 Delivery Earnings</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { l: 'Delivered', v: stats?.delivered || 0, c: '#16a34a', bg: '#dcfce7' },
                      { l: 'In Progress', v: stats?.inProgress || 0, c: '#f59e0b', bg: '#fef9c3' },
                      { l: 'Rating', v: profile?.rating ? `${Number(profile.rating).toFixed(1)} ⭐` : '5.0 ⭐', c: '#f59e0b', bg: '#fef9c3' },
                      { l: 'Active City', v: profile?.city || profile?.district || '—', c: '#1d4ed8', bg: '#dbeafe' },
                    ].map(s => (
                      <div key={s.l} style={{ backgroundColor: s.bg, borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: s.c, wordBreak: 'break-all' }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AgentDashboard;