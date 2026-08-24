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
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';

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

const getTierStyle = t => ({
  basic:  { bg: '#f1f5f9', color: '#64748b', icon: '🥉', label: t('agent_dashboard.tier_basic') },
  silver: { bg: '#e2e8f0', color: '#475569', icon: '🥈', label: t('agent_dashboard.tier_silver') },
  gold:   { bg: '#fef9c3', color: '#ca8a04', icon: '🥇', label: t('agent_dashboard.tier_gold') },
});

// ── Launch scope ──────────────────────────────────────────────────────────
// Job queue (claim/pickup/deliver flow) re-enabled — the backend endpoints
// it calls have been live all along, this just un-stubs the Work tab.
const JOB_QUEUE_ENABLED = true;

const ComingSoonPanel = ({ icon, title, body }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 40,
    textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: '#64748b', maxWidth: 320, margin: '0 auto' }}>{body}</div>
  </div>
);


const JobCard = ({ order, onClaim, onPickup, onDeliver, actionLoading, profile }) => {
  const { t } = useTranslation();
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
          {isClaimed ? t('agent_dashboard.job_active_badge') : t('agent_dashboard.job_new_badge')}
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
          {order.product?.name || order.manualProductName || order.description || t('agent_dashboard.product_fallback')}
          {order.quantity > 1 && <span style={{ color: '#64748b', fontWeight: 600 }}> ×{order.quantity}</span>}
        </div>

        {/* Route: Pickup → Delivery */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 12 }}>
          {/* Pickup */}
          <div style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: '10px 0 0 10px',
            padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#1d4ed8',
              letterSpacing: 0.5, marginBottom: 4 }}>{t('agent_dashboard.pickup_from_label')}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
              {order.seller?.storeName || order.seller?.businessName || order.seller?.name || t('agent_dashboard.seller_fallback')}
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
              letterSpacing: 0.5, marginBottom: 4 }}>{t('agent_dashboard.deliver_to_label')}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
              {order.buyer?.name || order.manualBuyerName || order.recipientName || t('agent_dashboard.buyer_fallback')}
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
            {actionLoading[order.id] ? t('agent_dashboard.processing_button') : t('agent_dashboard.claim_job_button')}
          </button>
        )}
        {isClaimed && !isPickedUp && !isDelivered && (
          <button onClick={() => onPickup(order.id)}
            disabled={actionLoading[order.id]}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
            {actionLoading[order.id] ? '⏳...' : t('agent_dashboard.picked_up_button')}
          </button>
        )}
        {isPickedUp && (
          <button onClick={() => onDeliver(order.id)}
            disabled={actionLoading[order.id]}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#16a34a,#059669)',
              color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
            {actionLoading[order.id] ? '⏳...' : t('agent_dashboard.delivered_to_buyer_button')}
          </button>
        )}
        {isDelivered && (
          <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13,
            fontWeight: 800, color: '#16a34a' }}>
            {t('agent_dashboard.delivered_badge')}
          </div>
        )}
      </div>
    </div>
  );
};

const AgentDashboard = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const TIER_STYLE = getTierStyle(t);
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
  // eslint-disable-next-line no-unused-vars -- read once /delivery-jobs/available ships, see fetchJobs TODO
  const [availableJobs, setAvailableJobs]     = useState([]);
  // eslint-disable-next-line no-unused-vars -- read once /delivery-jobs/available ships, see fetchJobs TODO
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
      else setError(t('agent_dashboard.load_error'));
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
      setSuccess(t('agent_dashboard.claim_order_success', { id: orderId }));
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.claim_order_error'));
    } finally { setActionLoading(false); }
  };

  const handlePickup = async (orderId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agent-orders/${orderId}/pickup`, { note });
      setSuccess(t('agent_dashboard.pickup_success', { id: orderId }));
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.confirm_error'));
    } finally { setActionLoading(false); }
  };

  const handleDeliverOrder = async (orderId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/agent-orders/${orderId}/deliver`, { note });
      setSuccess(t('agent_dashboard.deliver_order_success', { id: orderId }));
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.confirm_error'));
    } finally { setActionLoading(false); }
  };

  // ── Hub parcel actions ────────────────────────────────────────────────────
  const handleClaimParcel = async (trackingNumber) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${trackingNumber}/claim`);
      setSuccess(t('agent_dashboard.claim_parcel_success', { tn: trackingNumber }));
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.claim_parcel_error'));
    } finally { setActionLoading(false); }
  };

  const handleParcelStatus = async (trackingNumber, status) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/super-agents/parcels/${trackingNumber}/delivery-status`, { status });
      setSuccess(t('agent_dashboard.status_update_success', { status }));
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.status_update_error'));
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
      setError(err?.response?.data?.message || t('agent_dashboard.invoice_not_found'));
    } finally { setLookupLoading(false); }
  };

  const handleCollectPayment = async () => {
    if (!agentPhone.trim()) { setError(t('agent_dashboard.enter_phone_error')); return; }
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
        } catch { setError(t('agent_dashboard.payment_failed')); setPaymentPending(false); }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.payment_init_error'));
    } finally { setProcessing(false); }
  };

  // ── Collection handlers ──────────────────────────────────────────────────
  const handleClaimCollection = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      await api.post(`/collections/${collectionId}/claim`);
      setSuccess(t('agent_dashboard.claim_collection_success'));
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.claim_collection_error'));
    } finally { setActionLoading(false); }
  };

  const handleConfirmCollected = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      await api.patch(`/collections/${collectionId}/collected`, { notes: note });
      setSuccess(t('agent_dashboard.confirm_collected_success'));
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.confirm_error'));
    } finally { setActionLoading(false); }
  };

  const handleHandedOver = async (collectionId) => {
    try {
      setActionLoading(true); setError('');
      const res = await api.patch(`/collections/${collectionId}/handed-over`);
      setSuccess(t('agent_dashboard.handed_over_success', { amount: Number(res.data?.collectionFee || 0).toLocaleString() }));
      setSelectedItem(null); setNote('');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || t('agent_dashboard.confirm_error'));
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
      <input placeholder={t('agent_dashboard.note_placeholder')} value={note}
        onChange={e => setNote(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} disabled={loading}
          style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
          {loading ? '⏳' : `✅ ${label}`}
        </button>
        <button onClick={() => { setSelectedItem(null); setNote(''); }}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
          {t('agent_dashboard.cancel_button')}
        </button>
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('Home')} title={t('agent_dashboard.header_title')} top={0} />
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        {t('agent_dashboard.loading_ellipsis')}
      </div>
    </div>
  );

  const tier = TIER_STYLE[profile?.tier || 'basic'];

  // Lets the generic FeatureTour engine switch this page's own tab before
  // measuring a step's target — same pattern as SuperAgentDashboard.js.
  const handleTourStepChange = (requiredState) => {
    if (requiredState.tab) setTab(requiredState.tab);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', paddingBottom: 90 }}>
      <BackBar onBack={() => onNavigate('Home')} title={t('agent_dashboard.header_title')} top={0}
        right={<TourTrigger tourKey="agent_dashboard_orientation" />} />
      <FeatureTour tourKey="agent_dashboard_orientation" onStepChange={handleTourStepChange} autoStart />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', padding: '20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 2px' }}>
              {profile?.fullName || t('agent_dashboard.name_fallback')}
            </h1>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
              {profile?.agentCode || '—'} · {profile?.city || profile?.district || t('agent_dashboard.location_not_set')}
            </div>
          </div>
          {profile?.status === 'approved' && (
            <button onClick={handleToggleOnline} disabled={togglingOnline}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: togglingOnline ? 'not-allowed' : 'pointer',
                fontWeight: 800, fontSize: 12,
                backgroundColor: isOnline ? '#dcfce7' : 'rgba(255,255,255,0.2)',
                color: isOnline ? '#15803d' : '#fff' }}>
              {togglingOnline ? '⏳' : isOnline ? t('agent_dashboard.online_label') : t('agent_dashboard.offline_label')}
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
              {profileStatus === 'pending'     ? t('agent_dashboard.pending_title')  : ''}
              {profileStatus === 'rejected'    ? t('agent_dashboard.rejected_title')      : ''}
              {profileStatus === 'suspended'   ? t('agent_dashboard.suspended_title')         : ''}
              {profileStatus === 'not_applied' ? t('agent_dashboard.not_applied_title')           : ''}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              {profileStatus === 'pending'     ? t('agent_dashboard.pending_desc') : ''}
              {profileStatus === 'rejected'    ? profile?.rejectionReason || t('agent_dashboard.rejected_desc_fallback') : ''}
              {profileStatus === 'suspended'   ? profile?.rejectionReason || t('agent_dashboard.suspended_desc_fallback') : ''}
              {profileStatus === 'not_applied' ? t('agent_dashboard.not_applied_desc') : ''}
            </p>
            {(profileStatus === 'not_applied' || profileStatus === 'rejected') && (
              <button onClick={() => onNavigate('BecomeAgent')}
                style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                {profileStatus === 'rejected' ? t('agent_dashboard.apply_again_button') : t('agent_dashboard.apply_now_button')}
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
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 900, color: '#1e293b' }}>{t('agent_dashboard.payment_done_title')}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  {[
                    { l: t('agent_dashboard.invoice_label'), v: paymentResult.invoiceNumber },
                    { l: t('agent_dashboard.amount_label'), v: `TZS ${Number(paymentResult.amount).toLocaleString()}` },
                    { l: t('agent_dashboard.your_commission_label'), v: `TZS ${Number(paymentResult.commissionAmount).toLocaleString()}` },
                  ].map(i => (
                    <div key={i.l} style={{ backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', fontWeight: 700 }}>{i.l}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{i.v}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setPaymentResult(null)}
                  style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.3)', color: '#1e293b', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  {t('agent_dashboard.close_button')}
                </button>
              </div>
            )}

            {/* Stats strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { icon: '📦', label: t('agent_dashboard.jobs_today_label'),    value: totalWorkItems,                color: '#1d4ed8', bg: '#dbeafe' },
                { icon: '✅', label: t('agent_dashboard.completed_label'),      value: stats?.delivered || 0,         color: '#16a34a', bg: '#dcfce7' },
                { icon: '💰', label: t('agent_dashboard.payment_earnings_label'),value: payStats ? `TZS ${Number(payStats.stats?.confirmedEarnings || 0).toLocaleString()}` : '—', color: '#7c3aed', bg: '#ede9fe' },
                { icon: '⭐', label: t('agent_dashboard.rating_label'),         value: profile?.rating ? Number(profile.rating).toFixed(1) : '5.0', color: '#f59e0b', bg: '#fef9c3' },
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
                { key: 'work',     label: JOB_QUEUE_ENABLED ? t('agent_dashboard.tab_work_count', { count: totalWorkItems }) : t('agent_dashboard.tab_work_soon') },
                { key: 'pay',      label: t('agent_dashboard.tab_pay') },
                { key: 'earnings', label: t('agent_dashboard.tab_earnings') },
              ].map(tabItem => (
                <button key={tabItem.key} data-tour={`ag-tab-${tabItem.key}`} onClick={() => setTab(tabItem.key)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    backgroundColor: tab === tabItem.key ? '#2563eb' : 'transparent',
                    color: tab === tabItem.key ? '#fff' : '#64748b' }}>
                  {tabItem.label}
                </button>
              ))}
            </div>

            {/* ═══ TAB: WORK QUEUE ══════════════════════════════════════════ */}
            {tab === 'work' && !JOB_QUEUE_ENABLED && (
              <ComingSoonPanel icon="🚧" title={t('agent_dashboard.job_queue_title')}
                body={t('agent_dashboard.job_queue_desc')} />
            )}
            {tab === 'work' && JOB_QUEUE_ENABLED && (
              <>
                {(workLoading || collectionLoading) && (
                  <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>{t('agent_dashboard.loading_jobs')}</div>
                )}

                {!workLoading && !collectionLoading && totalWorkItems === 0 && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{t('agent_dashboard.all_done_title')}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{t('agent_dashboard.all_done_desc')}</div>
                  </div>
                )}

                {/* SECTION A: Direct orders from sellers (available to claim) */}
                {directOrders.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#1d4ed8' }} />
                      {t('agent_dashboard.section_a_title', { count: directOrders.length })}
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
                      {t('agent_dashboard.section_b_title')}
                    </div>
                    {myOrders.filter(o => !['delivered','cancelled'].includes(o.status)).map(order => {
                      const sc = STATUS_COLOR[order.status] || { bg: '#f1f5f9', color: '#64748b' };
                      const isSelected = selectedItem?.type === 'order' && selectedItem?.id === order.id;
                      const canPickup  = order.status === 'preparing';
                      const canDeliver = order.status === 'in_transit';
                      return (
                        <div key={order.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #f59e0b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('agent_dashboard.order_number', { id: order.id })}</div>
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
                              {t('agent_dashboard.confirm_pickup_button')}
                            </button>
                          )}
                          {canPickup && isSelected && (
                            <ActionNote onConfirm={() => handlePickup(order.id)} label={t('agent_dashboard.note_label_picked')} loading={actionLoading} />
                          )}
                          {canDeliver && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'order', id: order.id }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {t('agent_dashboard.confirm_deliver_button')}
                            </button>
                          )}
                          {canDeliver && isSelected && (
                            <ActionNote onConfirm={() => handleDeliverOrder(order.id)} label={t('agent_dashboard.note_label_delivered')} loading={actionLoading} />
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
                      {t('agent_dashboard.section_c_title', { count: hubParcels.length })}
                    </div>
                    <div style={{ backgroundColor: '#ede9fe', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#7c3aed' }}>
                      {t('agent_dashboard.hub_notice')}
                    </div>
                    {hubParcels.map(parcel => (
                      <div key={parcel.trackingNumber} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #7c3aed' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed' }}>{parcel.trackingNumber}</div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                            {t('agent_dashboard.hub_badge')}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {parcel.order?.product?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                          {t('agent_dashboard.from_label', { origin: parcel.originCity, dest: parcel.destinationCity })}
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
                          {t('agent_dashboard.claim_parcel_button')}
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
                      {t('agent_dashboard.section_d_title')}
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
                                    {t('agent_dashboard.transport_notice')}
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setShowTransportForm('bus')}
                                      style={{ flex: 1, backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      {t('agent_dashboard.bus_button')}
                                    </button>
                                    <button onClick={() => setShowTransportForm('hub')}
                                      style={{ flex: 1, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      {t('agent_dashboard.hub_button')}
                                    </button>
                                    <button onClick={() => setShowTransportForm('courier')}
                                      style={{ flex: 1, backgroundColor: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                                      {t('agent_dashboard.courier_button')}
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'bus' ? (
                                <div style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 8 }}>{t('agent_dashboard.bus_details_title')}</div>
                                  {[
                                    { key: 'busCompany', label: t('agent_dashboard.field_bus_company'), placeholder: 'e.g. Scandinavian' },
                                    { key: 'busTicketNumber', label: t('agent_dashboard.field_ticket_number'), placeholder: 'e.g. KE-12345' },
                                    { key: 'departureTime', label: t('agent_dashboard.field_departure_time'), placeholder: 'e.g. Jumanne 6am' },
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
                                      {savingTransport ? '⏳' : t('agent_dashboard.save_button')}
                                    </button>
                                    <button onClick={() => setShowTransportForm(false)}
                                      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                                      {t('agent_dashboard.cancel_button')}
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'courier' ? (
                                <div style={{ backgroundColor: '#faf5ff', borderRadius: 10, padding: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>{t('agent_dashboard.courier_details_title')}</div>
                                  {[
                                    { key: 'courierName', label: t('agent_dashboard.field_courier_name'), placeholder: 'e.g. DHL, EMS' },
                                    { key: 'courierTrackingRef', label: t('agent_dashboard.field_tracking_ref'), placeholder: 'e.g. DHL1234567890' },
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
                                      {savingTransport ? '⏳' : t('agent_dashboard.save_button')}
                                    </button>
                                    <button onClick={() => setShowTransportForm(false)}
                                      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                                      {t('agent_dashboard.cancel_button')}
                                    </button>
                                  </div>
                                </div>
                              ) : showTransportForm === 'hub' ? (
                                <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, fontSize: 12, color: '#1d4ed8' }}>
                                  {t('agent_dashboard.hub_auto_update_notice')}
                                  <button onClick={() => setShowTransportForm(false)}
                                    style={{ display: 'block', marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#1d4ed8' }}>
                                    {t('agent_dashboard.ok_button')}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {canMarkOut && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'parcel', id: parcel.trackingNumber }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {t('agent_dashboard.start_delivery_button')}
                            </button>
                          )}
                          {canMarkOut && isSelected && (
                            <ActionNote onConfirm={() => handleParcelStatus(parcel.trackingNumber, 'out_for_delivery')} label={t('agent_dashboard.note_label_started')} loading={actionLoading} />
                          )}
                          {canDeliver && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'parcel', id: parcel.trackingNumber }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {t('agent_dashboard.delivered_to_customer_button')}
                            </button>
                          )}
                          {canDeliver && isSelected && (
                            <ActionNote onConfirm={() => handleParcelStatus(parcel.trackingNumber, 'delivered')} label={t('agent_dashboard.note_label_delivered')} loading={actionLoading} />
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
                      {t('agent_dashboard.section_e_title', { count: availableCollections.length })}
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#475569' }}>
                      {t('agent_dashboard.collection_notice')}
                    </div>
                    {availableCollections.map(job => (
                      <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #0f172a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('agent_dashboard.collection_number', { id: job.id })}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {job.isRural && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#fef9c3', color: '#ca8a04' }}>{t('agent_dashboard.rural_badge')}</span>
                            )}
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                              TZS {Number(job.collectionFee).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {job.order?.product?.name || '—'}</div>
                        <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>{t('agent_dashboard.seller_pickup_label')}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{job.seller?.storeName || job.seller?.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>📞 {job.seller?.phone || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>📍 {job.pickupAddress || '—'}</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{t('agent_dashboard.city_label', { city: job.city })}</div>
                        <button onClick={() => handleClaimCollection(job.id)} disabled={actionLoading}
                          style={{ width: '100%', background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                          {t('agent_dashboard.claim_collection_button', { fee: Number(job.collectionFee).toLocaleString() })}
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
                      {t('agent_dashboard.section_f_title')}
                    </div>
                    {myCollections.map(job => {
                      const isSelected = selectedItem?.type === 'collection' && selectedItem?.id === job.id;
                      const canConfirmCollected = job.status === 'claimed';
                      const canHandOver = job.status === 'collected';
                      return (
                        <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 10, borderLeft: '4px solid #ca8a04' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('agent_dashboard.collection_number', { id: job.id })}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                              +TZS {Number(job.collectionFee).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>📦 {job.order?.product?.name || '—'}</div>
                          <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>
                              {job.status === 'claimed' ? t('agent_dashboard.go_here_label') : t('agent_dashboard.deliver_hub_label')}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{job.seller?.name || '—'} · {job.seller?.phone || '—'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>📍 {job.pickupAddress}</div>
                          </div>
                          {canConfirmCollected && !isSelected && (
                            <button onClick={() => { setSelectedItem({ type: 'collection', id: job.id }); setNote(''); }}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {t('agent_dashboard.collected_from_seller_button')}
                            </button>
                          )}
                          {canConfirmCollected && isSelected && (
                            <ActionNote onConfirm={() => handleConfirmCollected(job.id)} label={t('agent_dashboard.note_label_collected')} loading={actionLoading} />
                          )}
                          {canHandOver && !isSelected && (
                            <button onClick={() => handleHandedOver(job.id)} disabled={actionLoading}
                              style={{ width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                              {t('agent_dashboard.handed_over_button')}
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
                  {t('agent_dashboard.pay_hint')}
                </div>

                {paymentPending ? (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 30, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{t('agent_dashboard.processing_payment_title')}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>{t('agent_dashboard.please_wait_desc')}</div>
                  </div>
                ) : invoiceLookup ? (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('agent_dashboard.invoice_found_title')}</div>
                    {[
                      [t('agent_dashboard.invoice_field_label'), invoiceLookup.invoiceNumber],
                      [t('agent_dashboard.amount_field_label'), `TZS ${Number(invoiceLookup.amount).toLocaleString()}`],
                      [t('agent_dashboard.customer_field_label'), invoiceLookup.buyerName || '—'],
                      [t('agent_dashboard.product_field_label'), invoiceLookup.productName || '—'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>{l}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', margin: '12px 0' }}>
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>{t('agent_dashboard.your_commission_label2')}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>
                        TZS {Math.round(invoiceLookup.amount * 0.025).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('agent_dashboard.your_phone_confirm_label')}</label>
                      <input type="tel" placeholder="255XXXXXXXXX" value={agentPhone}
                        onChange={e => setAgentPhone(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleCollectPayment} disabled={processing}
                        style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                        {processing ? t('agent_dashboard.processing_ellipsis') : t('agent_dashboard.collect_payment_button')}
                      </button>
                      <button onClick={() => { setInvoiceLookup(null); setInvoiceInput(''); setAgentPhone(''); }}
                        style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                        {t('agent_dashboard.cancel_button')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{t('agent_dashboard.invoice_number_field_label')}</label>
                    <input data-tour="ag-invoice-input" type="text" placeholder="e.g. KNT-INV-2025-00001"
                      value={invoiceInput} onChange={e => setInvoiceInput(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 10 }} />
                    <button onClick={handleLookupInvoice} disabled={lookupLoading || !invoiceInput.trim()}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                      {lookupLoading ? t('agent_dashboard.searching_ellipsis') : t('agent_dashboard.search_invoice_button')}
                    </button>
                  </div>
                )}

                {/* Recent payment transactions */}
                {payStats?.recentTransactions?.length > 0 && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('agent_dashboard.recent_transactions_title')}</div>
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
                    <span>{t('agent_dashboard.earnings_history_label')}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{t('agent_dashboard.full_transaction_log')}</span>
                  </button>
                  <button onClick={() => onNavigate('AgentScorecard')}
                    style={{ flex: 1, background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                      color: '#fff', border: 'none', padding: '14px 16px', borderRadius: 14,
                      cursor: 'pointer', fontSize: 13, fontWeight: 800,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span>{t('agent_dashboard.scorecard_label')}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{t('agent_dashboard.performance_stats')}</span>
                  </button>
                </div>

                {/* Tier progress */}
                <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('agent_dashboard.my_tier_label')}</div>
                    <div style={{ ...tier, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                      {tier.icon} {tier.label}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {[
                      { label: `🥉 ${t('agent_dashboard.tier_basic')}`, commission: '2.5%', range: t('agent_dashboard.range_0_50'), active: profile?.tier === 'basic' },
                      { label: `🥈 ${t('agent_dashboard.tier_silver')}`, commission: '3.5%', range: t('agent_dashboard.range_51_200'), active: profile?.tier === 'silver' },
                      { label: `🥇 ${t('agent_dashboard.tier_gold')}`, commission: '5.0%', range: t('agent_dashboard.range_200_plus'), active: profile?.tier === 'gold' },
                    ].map(tierItem => (
                      <div key={tierItem.label} style={{ backgroundColor: tierItem.active ? '#fef9c3' : '#f8fafc', borderRadius: 10, padding: 10, textAlign: 'center', border: tierItem.active ? '2px solid #f59e0b' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#1e293b' }}>{tierItem.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b' }}>{tierItem.commission}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{tierItem.range}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment earnings */}
                {payStats && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('agent_dashboard.payment_earnings_title')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        { l: t('agent_dashboard.total_transactions_label'), v: payStats.stats?.totalTransactions || 0, c: '#7c3aed', bg: '#ede9fe' },
                        { l: t('agent_dashboard.confirmed_earnings_label'), v: `TZS ${Number(payStats.stats?.confirmedEarnings || 0).toLocaleString()}`, c: '#16a34a', bg: '#dcfce7' },
                        { l: t('agent_dashboard.pending_label'), v: `TZS ${Number(payStats.stats?.pendingEarnings || 0).toLocaleString()}`, c: '#f59e0b', bg: '#fef9c3' },
                        { l: t('agent_dashboard.commission_rate_label'), v: `${payStats.stats?.commissionRate || 2.5}%`, c: '#1d4ed8', bg: '#dbeafe' },
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
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>{t('agent_dashboard.delivery_earnings_title')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { l: t('agent_dashboard.delivered_stat'), v: stats?.delivered || 0, c: '#16a34a', bg: '#dcfce7' },
                      { l: t('agent_dashboard.in_progress_stat'), v: stats?.inProgress || 0, c: '#f59e0b', bg: '#fef9c3' },
                      { l: t('agent_dashboard.rating_label'), v: profile?.rating ? `${Number(profile.rating).toFixed(1)} ⭐` : '5.0 ⭐', c: '#f59e0b', bg: '#fef9c3' },
                      { l: t('agent_dashboard.active_city_stat'), v: profile?.city || profile?.district || '—', c: '#1d4ed8', bg: '#dbeafe' },
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