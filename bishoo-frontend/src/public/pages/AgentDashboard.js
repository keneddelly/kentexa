/**
 * AgentDashboard.js — the last-mile agent's work (approved mockup 2026-10-27).
 *
 * An agent is anyone who carries parcels the last mile in their city, by any vehicle
 * (boda, bajaji, bicycle, car, van, truck or on foot), and may collect pay-on-delivery cash.
 * Two tabs only:
 *   Kazi    — my jobs (collect from the sender, deliver to the customer, take to an office),
 *             jobs near my base point, and parcels an office handed me to deliver.
 *   Mapato  — delivery fees and pay-on-delivery cash from the records, my base point and
 *             my vehicle.
 *
 * Removed (owner 2026-10-27, old KenteXa payment model): taking buyers' invoice payments for
 * marketplace orders, the commission tiers, claiming marketplace orders directly and the old
 * seller "collections". Buyers now pay sellers directly; agents get jobs from shipments.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineIcon } from '../components/LineIcon';
import { PageLoading } from '../components/Loading';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';
import ShipmentPickupQueue from '../components/ShipmentPickupQueue';
import AgentBasePoint from '../components/AgentBasePoint';
import AgentVehicleCard from '../components/AgentVehicleCard';
import AgentPartnerSellersCard from '../components/AgentPartnerSellersCard';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const tzs = (n) => `TZS ${Math.round(Number(n || 0)).toLocaleString()}`;

const AgentDashboard = ({ onNavigate, isLoggedIn, inboxUnread }) => {
  const { t } = useTranslation();
  const [profile, setProfile]             = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [tab, setTab]                     = useState('work'); // 'work' | 'earnings'
  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline]           = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [transportForms, setTransportForms] = useState({});
  const [savingTransport, setSavingTransport] = useState(null);
  const [myParcels, setMyParcels]         = useState([]);
  const [handoffCodes, setHandoffCodes]   = useState({});
  const [deliveryCodes, setDeliveryCodes] = useState({});
  const [codCollected, setCodCollected]   = useState({});
  const [shipmentPickupCount, setShipmentPickupCount] = useState(0);
  const [summary, setSummary]             = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleOnline = async () => {
    try {
      setTogglingOnline(true);
      const res = await api.patch('/agents/toggle-online');
      setIsOnline(res.data.isOnline);
      // D1: once switched back on, the "switched off automatically" note no longer applies.
      setProfile((p) => (p ? { ...p, offlineReason: null } : p));
    } catch (err) {
      setError(err?.response?.data?.message || t('common.error_try_again', 'Imeshindikana. Jaribu tena.'));
    } finally { setTogglingOnline(false); }
  };

  const fetchSummary = async () => {
    try { setSummary((await api.get('/agents/my-summary')).data); } catch { setSummary(null); }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const profileRes = await api.get('/agents/my-profile');
      setProfile(profileRes.data);
      setIsOnline(profileRes.data?.isOnline || false);
      setProfileStatus(profileRes.data.status);
      if (profileRes.data.status === 'approved') await Promise.all([fetchWork(), fetchSummary()]);
    } catch (err) {
      if (err?.response?.status === 404) setProfileStatus('not_applied');
      else setError(t('agent_dashboard.load_error'));
    } finally {
      setLoading(false);
    }
  };

  // Parcels an office handed this agent for the last mile (keyed to the agent on the server).
  const fetchWork = async () => {
    try {
      const res = await api.get('/super-agents/my-deliveries');
      setMyParcels(res.data || []);
    } catch {
      setMyParcels([]);
      setError('Imeshindwa kupakia vifurushi ulivyokabidhiwa; jaribu tena');
    }
  };
  const refresh = () => { fetchWork(); fetchSummary(); };

  // ── Hub parcel actions ────────────────────────────────────────────────────
  const handleIssueDeliveryCode = async (trackingNumber) => {
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/parcels/${trackingNumber}/recipient-delivery-code`);
      setSuccess('Namba ya kuthibitisha imepelekwa kwa mpokeaji');
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kutuma namba kwa mpokeaji');
    } finally { setActionLoading(false); }
  };

  const handleConfirmDelivery = async (trackingNumber) => {
    const code = deliveryCodes[trackingNumber] || '';
    if (!/^\d{6}$/.test(code)) return;
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/parcels/${trackingNumber}/confirm-recipient-delivery`, { code });
      setDeliveryCodes(prev => ({ ...prev, [trackingNumber]: '' }));
      setSuccess('Mpokeaji amethibitisha kupokea kifurushi');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha makabidhiano');
    } finally { setActionLoading(false); }
  };

  const handleConfirmCodDelivery = async (trackingNumber) => {
    const code = deliveryCodes[trackingNumber] || '';
    const amount = codCollected[trackingNumber];
    if (!/^\d{6}$/.test(code) || amount === undefined || amount === '' ||
        !Number.isFinite(Number(amount)) || Number(amount) < 0) return;
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/parcels/${trackingNumber}/confirm-recipient-cod-delivery`, {
        code, codBalanceCollected: Number(amount),
      });
      setDeliveryCodes(prev => ({ ...prev, [trackingNumber]: '' }));
      setCodCollected(prev => ({ ...prev, [trackingNumber]: '' }));
      setSuccess('Mpokeaji amethibitisha kifurushi na salio la COD limeandikwa');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha COD na makabidhiano');
    } finally { setActionLoading(false); }
  };

  const handleConfirmHubHandoff = async (trackingNumber) => {
    const code = handoffCodes[trackingNumber] || '';
    if (!/^\d{6}$/.test(code)) return;
    try {
      setActionLoading(true); setError('');
      await api.post(`/super-agents/parcels/${trackingNumber}/confirm-agent-handoff`, { code });
      setHandoffCodes(prev => ({ ...prev, [trackingNumber]: '' }));
      setSuccess('Kifurushi kimepokelewa kutoka ofisi');
      fetchWork(profile);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kuthibitisha makabidhiano');
    } finally { setActionLoading(false); }
  };


  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
      <BackBar onBack={() => onNavigate('Home')} title="Wakala" top={0} />
      <PageLoading label="Inapakia kazi zako" />
    </div>
  );

  const workCount = myParcels.length + shipmentPickupCount;
  const vehicleLabel = profile?.agentType ? t(`agent_signup.vehicle_${profile.agentType}`) : null;
  const area = [profile?.district, profile?.city].filter(Boolean).join(', ') || profile?.region || null;
  const handleTourStepChange = (requiredState) => { if (requiredState.tab) setTab(requiredState.tab); };
  const tiles = [
    { label: 'Kazi sasa', value: String(workCount) },
    { label: 'Ada leo', value: summary ? Math.round(summary.today.fees).toLocaleString() : '—' },
    { label: 'Lipa ukipokea leo', value: summary ? Math.round(summary.today.codCollected).toLocaleString() : '—' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: INK, paddingBottom: 90 }}>
      <BackBar onBack={() => onNavigate('Home')} title="Wakala" top={0}
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={() => onNavigate('SellerInbox')} aria-label={t('bottom_nav.messages')}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <LineIcon name="chat" size={22} color={INK} />
              {inboxUnread > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -8, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 100,
                  backgroundColor: '#DC2626', color: '#fff', fontSize: 8, fontWeight: 800, lineHeight: '14px', textAlign: 'center' }}>
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
            </button>
            <TourTrigger tourKey="agent_dashboard_orientation" />
          </div>
        )} />
      <FeatureTour tourKey="agent_dashboard_orientation" onStepChange={handleTourStepChange} autoStart />

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Who I am */}
        <section data-testid="agent-identity" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: INK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{String(profile?.fullName || 'W').trim().charAt(0).toUpperCase()}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontSize: 18 }}>{profile?.fullName || t('agent_dashboard.name_fallback')}</strong>
            <span style={{ fontSize: 14, color: MUTED }}>{['Wakala', vehicleLabel, area].filter(Boolean).join(' · ')}</span>
            {profile?.agentCode && <span style={{ fontSize: 13, color: MUTED }}>{profile.agentCode}</span>}
          </span>
        </section>

        <div style={{ padding: '0 16px' }}>
        {profile?.status === 'approved' && !isOnline && profile?.onlineRequired === true && (
          <div role="status" data-testid="agent-offline-banner" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
            <strong>{t('agent_presence.offline_title')}</strong><br />
            {profile?.offlineReason === 'inactive'
              ? t('agent_presence.offline_inactive', { m: profile?.onlineExpiryMinutes || 60 })
              : t('agent_presence.offline_manual')}
            <button type="button" onClick={handleToggleOnline} disabled={togglingOnline}
              style={{ display: 'block', marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 800 }}>
              {togglingOnline ? '...' : t('agent_presence.go_online')}
            </button>
          </div>
        )}

        </div>
        {error && (
          <div role="alert" style={{ margin: '0 16px 12px', backgroundColor: '#fef2f2', color: '#b91c1c', padding: '12px 14px', borderRadius: 12, fontSize: 14, display: 'flex', gap: 10 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" aria-label="Funga" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18, padding: 0 }}>×</button>
          </div>
        )}
        {success && (
          <div role="status" style={{ margin: '0 16px 12px', backgroundColor: '#ecfdf3', color: '#166534', padding: '12px 14px', borderRadius: 12, fontSize: 14, display: 'flex', gap: 10 }}>
            <span style={{ flex: 1 }}>{success}</span>
            <button type="button" aria-label="Funga" onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 18, padding: 0 }}>×</button>
          </div>
        )}

        <div style={{ padding: '0 16px' }}>
        {/* ── NOT APPROVED YET ─────────────────────────────────────────── */}
        {profileStatus !== 'approved' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '32px 20px', textAlign: 'center', border: '1px solid #eff3f4' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}><LineIcon name={profileStatus === 'pending' ? 'clock' : ['rejected', 'suspended'].includes(profileStatus) ? 'cross' : 'handshake'} size={44} color="#536471" /></div>
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
                style={{ background: '#1d4ed8', color: '#fff', border: 'none', height: 48, padding: '0 24px', borderRadius: 24, cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
                {profileStatus === 'rejected' ? t('agent_dashboard.apply_again_button') : t('agent_dashboard.apply_now_button')}
              </button>
            )}
          </div>
        )}

        </div>

        {profileStatus === 'approved' && (
          <>
            <section data-testid="agent-tiles" style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {tiles.map((s) => (
                <div key={s.label} style={{ padding: 12, border: `1px solid ${LINE}`, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>{s.label}</span>
                  <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</strong>
                </div>
              ))}
            </section>

            <nav role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
              {[['work', `Kazi${workCount ? ` ${workCount}` : ''}`], ['earnings', 'Mapato']].map(([key, label]) => {
                const on = tab === key;
                return (
                  <button key={key} type="button" role="tab" aria-selected={on} data-tour={`ag-tab-${key}`} data-testid={`agent-tab-${key}`} onClick={() => setTab(key)}
                    style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0 0',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 15, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                    {label}
                    <span style={{ marginTop: 10, height: 4, width: 48, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
                  </button>
                );
              })}
            </nav>

            {tab === 'work' && (
              <div style={{ padding: 16 }}>
                {!profile?.hasBasePoint && (
                  <div style={{ marginBottom: 16 }}>
                    <AgentBasePoint hasBasePoint={false}
                      onSaved={(d) => setProfile((p) => ({ ...p, hasBasePoint: true, baseSetAt: d?.baseSetAt, baseLatitude: d?.latitude, baseLongitude: d?.longitude }))} />
                  </div>
                )}
                {/* Shipment jobs: my jobs (one next action each), then jobs near my base. */}
                <ShipmentPickupQueue onChanged={refresh} onCount={setShipmentPickupCount} />

                {/* SECTION D: My active hub parcel deliveries */}
                {myParcels.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h2 style={{ margin: '4px 0 8px', fontSize: 17, fontWeight: 800 }}>{t('agent_dashboard.section_d_title')}</h2>
                    {myParcels.map(parcel => {
                      const canMarkOut   = ['arrived_at_hub', 'awaiting_buyer'].includes(parcel.status) &&
                        parcel.buyerRequestedDelivery === true;
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
                        <div key={parcel.trackingNumber} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, border: '1px solid #eff3f4', marginBottom: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#536471', marginBottom: 6 }}>{parcel.trackingNumber}</div>
                          <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{parcel.order?.product?.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                            {parcel.recipientName || '—'} · {parcel.buyerPhone || '—'}
                            {parcel.deliveryAddress && ` · ${parcel.deliveryAddress}`}
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
                                      {savingTransport ? 'Inahifadhi' : t('agent_dashboard.save_button')}
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
                                      {savingTransport ? 'Inahifadhi' : t('agent_dashboard.save_button')}
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

                          {canMarkOut && (
                            <div style={{ backgroundColor: '#eff6ff', padding: 10, borderRadius: 8 }}>
                              <div style={{ fontSize: 16, marginBottom: 8 }}>
                                Pokea kifurushi ofisini; weka namba uliyopewa na mhudumu wa ofisi.
                              </div>
                              <input value={handoffCodes[parcel.trackingNumber] || ''}
                                onChange={e => setHandoffCodes(prev => ({ ...prev,
                                  [parcel.trackingNumber]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                inputMode="numeric" autoComplete="one-time-code" placeholder="Namba ya tarakimu 6"
                                style={{ width: '100%', minHeight: 44, padding: 10, marginBottom: 8, borderRadius: 8,
                                  boxSizing: 'border-box', fontSize: 16 }} />
                              <button onClick={() => handleConfirmHubHandoff(parcel.trackingNumber)}
                                disabled={actionLoading || (handoffCodes[parcel.trackingNumber] || '').length !== 6}
                                style={{ width: '100%', minHeight: 44, padding: 10, border: 'none', borderRadius: 8,
                                  color: '#fff', backgroundColor: '#2563eb', fontWeight: 800, fontSize: 16 }}>
                                Thibitisha nimepokea kutoka ofisi
                              </button>
                            </div>
                          )}
                          {canDeliver && parcel.order?.paymentMethod === 'cod' && (
                            <div style={{ backgroundColor: '#fef3c7', padding: 10, borderRadius: 8, fontSize: 16 }}>
                              <div style={{ marginBottom: 8 }}>Pokea pesa ya lipa ukipokea, kisha muombe mpokeaji namba yake wakati wa kumkabidhi.</div>
                              <button onClick={() => handleIssueDeliveryCode(parcel.trackingNumber)} disabled={actionLoading}
                                style={{ width: '100%', minHeight: 44, padding: 9, marginBottom: 8, border: 'none', borderRadius: 8, backgroundColor: '#15803d', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                Tuma namba kwa mpokeaji
                              </button>
                              <input value={deliveryCodes[parcel.trackingNumber] || ''}
                                onChange={e => setDeliveryCodes(prev => ({ ...prev,
                                  [parcel.trackingNumber]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                inputMode="numeric" autoComplete="one-time-code" placeholder="Namba ya mpokeaji (tarakimu 6)"
                                style={{ width: '100%', minHeight: 44, padding: 9, marginBottom: 8, borderRadius: 8, boxSizing: 'border-box', fontSize: 16 }} />
                              <input value={codCollected[parcel.trackingNumber] || ''}
                                onChange={e => setCodCollected(prev => ({ ...prev, [parcel.trackingNumber]: e.target.value }))}
                                inputMode="decimal" type="number" min="0" step="0.01"
                                placeholder={`Pesa ya kupokea: TZS ${Number(parcel.order?.codRemainingBalance || 0).toLocaleString()}`}
                                style={{ width: '100%', minHeight: 44, padding: 9, marginBottom: 8, borderRadius: 8, boxSizing: 'border-box', fontSize: 16 }} />
                              <button onClick={() => handleConfirmCodDelivery(parcel.trackingNumber)}
                                disabled={actionLoading || (deliveryCodes[parcel.trackingNumber] || '').length !== 6 ||
                                  codCollected[parcel.trackingNumber] === undefined || codCollected[parcel.trackingNumber] === ''}
                                style={{ width: '100%', minHeight: 44, padding: 9, border: 'none', borderRadius: 8,
                                  backgroundColor: '#166534', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                Thibitisha pesa na umemkabidhi
                              </button>
                            </div>
                          )}
                          {canDeliver && parcel.order?.paymentMethod !== 'cod' && (
                            <div style={{ backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8 }}>
                              <div style={{ fontSize: 16, marginBottom: 8 }}>Mpokeaji akupe namba yake wakati unapomkabidhi kifurushi.</div>
                              <button onClick={() => handleIssueDeliveryCode(parcel.trackingNumber)} disabled={actionLoading}
                                style={{ width: '100%', minHeight: 44, padding: 9, marginBottom: 8, border: 'none', borderRadius: 8, backgroundColor: '#15803d', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                Tuma namba kwa mpokeaji
                              </button>
                              <input value={deliveryCodes[parcel.trackingNumber] || ''}
                                onChange={e => setDeliveryCodes(prev => ({ ...prev,
                                  [parcel.trackingNumber]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                inputMode="numeric" autoComplete="one-time-code" placeholder="Namba ya mpokeaji (tarakimu 6)"
                                style={{ width: '100%', minHeight: 44, padding: 9, marginBottom: 8, borderRadius: 8, boxSizing: 'border-box', fontSize: 16 }} />
                              <button onClick={() => handleConfirmDelivery(parcel.trackingNumber)}
                                disabled={actionLoading || (deliveryCodes[parcel.trackingNumber] || '').length !== 6}
                                style={{ width: '100%', minHeight: 44, padding: 9, border: 'none', borderRadius: 8, backgroundColor: '#166534', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                Thibitisha kupokelewa
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {workCount === 0 && (
                  <div data-testid="agent-no-work" style={{ textAlign: 'center', padding: '32px 8px', color: MUTED, fontSize: 15, lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><LineIcon name="box" size={36} color="#94a3b8" /></div>
                    Hakuna kazi sasa. Kazi mpya karibu na kituo chako zitaonekana hapa.
                    {!profile?.hasBasePoint && <div style={{ marginTop: 8 }}>Weka kituo chako kwenye Mapato ili kazi zikufikie.</div>}
                  </div>
                )}

                {/* Sellers this agent works with as their partner agent (owner 2026-10-22). */}
                <AgentPartnerSellersCard />
              </div>
            )}

            {tab === 'earnings' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section data-testid="agent-earnings" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Ada za kufikisha mizigo</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    {[
                      ['Leo', summary ? tzs(summary.today.fees) : '—'],
                      ['Wiki hii', summary ? tzs(summary.week.fees) : '—'],
                      ['Mizigo nimefikisha', summary ? String(summary.totalDeliveries) : '—'],
                      ['Alama ya wateja', summary?.rating != null ? `${Number(summary.rating).toFixed(1)} / 5 (${summary.totalRatings})` : 'Bado'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: 14, border: `1px solid ${LINE}`, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
                        <strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                {summary && (summary.today.codCollected > 0 || summary.owedToKentexa > 0) && (
                  <section data-testid="agent-cod-cash" style={{ padding: 16, borderRadius: 16, background: '#fffbeb', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Pesa za lipa ukipokea ulizopokea leo</span>
                    <strong style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{tzs(summary.today.codCollected)}</strong>
                    {summary.owedToKentexa > 0 && (
                      <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>Unadaiwa na KenteXa ada yake tu: {tzs(summary.owedToKentexa)}.</span>
                    )}
                  </section>
                )}

                <div style={{ borderTop: '8px solid #f7f9f9', margin: '0 -16px', padding: '20px 16px 0' }}>
                  <AgentBasePoint hasBasePoint={!!profile?.hasBasePoint} baseSetAt={profile?.baseSetAt}
                    latitude={profile?.baseLatitude} longitude={profile?.baseLongitude} area={area}
                    onSaved={(d) => setProfile((p) => ({ ...p, hasBasePoint: true, baseSetAt: d?.baseSetAt, baseLatitude: d?.latitude ?? p?.baseLatitude, baseLongitude: d?.longitude ?? p?.baseLongitude }))} />
                </div>

                <div style={{ borderTop: '8px solid #f7f9f9', margin: '0 -16px', padding: '20px 16px 0' }}>
                  <AgentVehicleCard agentType={profile?.agentType} maxWeightKg={profile?.maxWeightKg}
                    onSaved={(v) => setProfile((p) => ({ ...p, ...v }))} />
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
