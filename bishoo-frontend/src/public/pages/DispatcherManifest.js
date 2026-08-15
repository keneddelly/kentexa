import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

/**
 * Dispatcher Manifest Screen
 * Used by Kariakoo Super Agent (dispatcher) on his phone via kentexa.com
 *
 * Shows today's batch manifest grouped by zone in route order:
 * Kariakoo Hub → Mbagala → Mbezi → Bunju
 *
 * Actions:
 * - Mark van departed (with driver info)
 * - Mark zone arrived (when van reaches each zone)
 * - Mark individual parcel delivered
 * - View all parcels per zone
 */

const getStatusColor = (t) => ({
  open:        { bg: '#dcfce7', color: '#16a34a', label: t('dispatcher_manifest.status_open') },
  cutoff:      { bg: '#fef9c3', color: '#ca8a04', label: t('dispatcher_manifest.status_cutoff') },
  departed:    { bg: '#dbeafe', color: '#2563eb', label: t('dispatcher_manifest.status_departed') },
  in_progress: { bg: '#e0f2fe', color: '#0284c7', label: t('dispatcher_manifest.status_in_progress') },
  completed:   { bg: '#f0fdf4', color: '#15803d', label: t('dispatcher_manifest.status_completed') },
  cancelled:   { bg: '#fee2e2', color: '#dc2626', label: t('dispatcher_manifest.status_cancelled') },
});

const PARCEL_STATUS_COLOR = {
  awaiting_handover: { bg: '#fef9c3', color: '#ca8a04' },
  at_hub:            { bg: '#dbeafe', color: '#2563eb' },
  on_van:            { bg: '#e0f2fe', color: '#0284c7' },
  at_zone:           { bg: '#ede9fe', color: '#7c3aed' },
  out_for_delivery:  { bg: '#dcfce7', color: '#16a34a' },
  delivered:         { bg: '#f0fdf4', color: '#15803d' },
  returned:          { bg: '#fee2e2', color: '#dc2626' },
};

const getParcelStatusLabel = (t) => ({
  awaiting_handover: t('dispatcher_manifest.parcel_status_awaiting_handover'),
  at_hub:            t('dispatcher_manifest.parcel_status_at_hub'),
  on_van:            t('dispatcher_manifest.parcel_status_on_van'),
  at_zone:           t('dispatcher_manifest.parcel_status_at_zone'),
  out_for_delivery:  t('dispatcher_manifest.parcel_status_out_for_delivery'),
  delivered:         t('dispatcher_manifest.parcel_status_delivered'),
  returned:          t('dispatcher_manifest.parcel_status_returned'),
});

const DispatcherManifest = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = { en: 'en-US', sw: 'sw-TZ', fr: 'fr-FR' }[i18n.language] || 'en-US';
  const STATUS_COLOR = getStatusColor(t);
  const PARCEL_STATUS_LABEL = getParcelStatusLabel(t);
  const [manifest, setManifest]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [message, setMessage]         = useState('');
  const [expandedZone, setExpandedZone] = useState(null);
  const [showDepartModal, setShowDepartModal] = useState(false);
  const [departForm, setDepartForm]   = useState({ driverName: '', driverPhone: '', vehicleInfo: '' });
  const [departing, setDeparting]     = useState(false);
  const [confirmParcel, setConfirmParcel] = useState(null); // parcel being delivered

  useEffect(() => {
    fetchManifest();
    // Refresh every 2 minutes
    const interval = setInterval(fetchManifest, 120000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchManifest = async () => {
    try {
      setLoading(true);
      const res = await api.get('/daily-batches/manifest/today');
      setManifest(res.data);
      // Auto-expand first zone that has parcels
      if (res.data.zones?.length > 0) {
        setExpandedZone(res.data.zones[0].zoneId);
      }
    } catch (err) {
      setError(err?.response?.data?.message || t('dispatcher_manifest.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleMarkReceived = async (parcelId) => {
    try {
      await api.patch(`/daily-batches/parcels/${parcelId}/received`);
      showMsg(t('dispatcher_manifest.received_at_hub_success'));
      fetchManifest();
    } catch (err) {
      showMsg('❌ ' + (err?.response?.data?.message || t('dispatcher_manifest.action_failed')));
    }
  };

  const handleDepart = async () => {
    if (!departForm.driverName.trim()) {
      showMsg('❌ ' + t('dispatcher_manifest.driver_name_required')); return;
    }
    try {
      setDeparting(true);
      await api.patch(`/daily-batches/${manifest.batch.id}/depart`, departForm);
      setShowDepartModal(false);
      showMsg(t('dispatcher_manifest.departed_success'));
      fetchManifest();
    } catch (err) {
      showMsg('❌ ' + (err?.response?.data?.message || t('dispatcher_manifest.action_failed')));
    } finally {
      setDeparting(false);
    }
  };

  const handleZoneArrival = async (zoneId) => {
    try {
      await api.patch(`/daily-batches/${manifest.batch.id}/zones/${zoneId}/arrived`);
      showMsg(t('dispatcher_manifest.zone_arrived_success'));
      fetchManifest();
    } catch (err) {
      showMsg('❌ ' + (err?.response?.data?.message || t('dispatcher_manifest.action_failed')));
    }
  };

  const handleParcelDelivered = async (parcelId) => {
    try {
      await api.patch(`/daily-batches/parcels/${parcelId}/delivered`);
      setConfirmParcel(null);
      showMsg(t('dispatcher_manifest.delivered_success'));
      fetchManifest();
    } catch (err) {
      showMsg('❌ ' + (err?.response?.data?.message || t('dispatcher_manifest.action_failed')));
    }
  };

  const batch = manifest?.batch;
  const zones = manifest?.zones || [];
  const totalParcels = manifest?.totalParcels || 0;

  const canDepart = batch && ['open', 'cutoff'].includes(batch.status);
  const hasLeft   = batch && ['departed', 'in_progress', 'completed'].includes(batch.status);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('SuperAgentDashboard')} title={t('dispatcher_manifest.page_title')} top={0} />
      <div style={{ textAlign: 'center', padding: '60px 16px', color: '#64748b' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <div>{t('dispatcher_manifest.loading')}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('SuperAgentDashboard')} title={t('dispatcher_manifest.page_title')} top={0}
        right={<button onClick={() => onNavigate('HubReceive')} style={{ background:'none', border:'none', color:'#f59e0b', fontWeight:800, fontSize:13, cursor:'pointer' }}>{t('dispatcher_manifest.receive_button')}</button>}
      />

      {/* Flash message */}
      {message && (
        <div style={{
          position: 'fixed', top: 60, left: 0, right: 0, zIndex: 9999,
          backgroundColor: message.startsWith('❌') ? '#fee2e2' : '#dcfce7',
          color: message.startsWith('❌') ? '#dc2626' : '#15803d',
          padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
        }}>
          {message}
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: 14, borderRadius: 12, marginBottom: 14, fontSize: 13 }}>
            ❌ {error}
            <button onClick={fetchManifest} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>{t('dispatcher_manifest.try_again')}</button>
          </div>
        )}

        {/* No batch today */}
        {!batch && !error && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{t('dispatcher_manifest.no_batch_title')}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              {t('dispatcher_manifest.no_batch_desc')}
            </div>

            {/* How to start batch — clear step by step */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                {t('dispatcher_manifest.how_to_start_title')}
              </div>
              {[
                { num: '1', text: t('dispatcher_manifest.step1') },
                { num: '2', text: t('dispatcher_manifest.step2') },
                { num: '3', text: t('dispatcher_manifest.step3') },
                { num: '4', text: t('dispatcher_manifest.step4') },
              ].map(s => (
                <div key={s.num} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.num}</span>
                  <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{s.text}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onNavigate('BatchHandoff')}
                style={{ flex: 2, background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: '13px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                {t('dispatcher_manifest.manual_order_button')}
              </button>
              <button onClick={fetchManifest}
                style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                {t('dispatcher_manifest.refresh_button')}
              </button>
            </div>
          </div>
        )}

        {batch && (
          <>
            {/* Batch Status Card */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{t('dispatcher_manifest.batch_today_label')}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>
                    {new Date(batch.runDate).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
                  backgroundColor: (STATUS_COLOR[batch.status] || { bg: '#f1f5f9' }).bg,
                  color: (STATUS_COLOR[batch.status] || { color: '#64748b' }).color,
                }}>
                  {(STATUS_COLOR[batch.status] || { label: batch.status }).label}
                </span>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { label: t('dispatcher_manifest.stat_parcels'), value: totalParcels, icon: '📦' },
                  { label: t('dispatcher_manifest.stat_zones'), value: zones.length, icon: '📍' },
                  { label: t('dispatcher_manifest.stat_departure_time'), value: new Date(batch.plannedDepartureTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }), icon: '🕗' },
                ].map(s => (
                  <div key={s.label} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20 }}>{s.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#1e293b' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              {/* Cutoff info */}
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#92400e' }}>{t('dispatcher_manifest.cutoff_label')}</span>
                <span style={{ color: '#92400e' }}>
                  {new Date(batch.cutoffTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Driver info if departed */}
              {hasLeft && batch.driverName && (
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 2 }}>{t('dispatcher_manifest.driver_today_title')}</div>
                  <div style={{ color: '#1e293b' }}>{batch.driverName}</div>
                  {batch.driverPhone && <div style={{ color: '#64748b' }}>📞 {batch.driverPhone}</div>}
                  {batch.vehicleInfo && <div style={{ color: '#64748b' }}>🚗 {batch.vehicleInfo}</div>}
                  {batch.actualDepartureTime && (
                    <div style={{ color: '#64748b' }}>
                      {t('dispatcher_manifest.departed_at_label', { time: new Date(batch.actualDepartureTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) })}
                    </div>
                  )}
                </div>
              )}

              {/* Route preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', padding: '4px 10px', backgroundColor: '#eff6ff', borderRadius: 20 }}>
                  {t('dispatcher_manifest.hub_badge')}
                </span>
                {zones.sort((a,b) => a.routeOrder - b.routeOrder).map(zone => (
                  <React.Fragment key={zone.zoneId}>
                    <span style={{ color: '#94a3b8', fontSize: 16 }}>→</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', padding: '4px 10px', backgroundColor: '#ede9fe', borderRadius: 20 }}>
                      📍 {zone.zoneName} ({zone.parcels.length})
                    </span>
                  </React.Fragment>
                ))}
              </div>

              {/* Main action button */}
              {canDepart && totalParcels > 0 && (
                <button onClick={() => setShowDepartModal(true)}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 14px rgba(29,78,216,0.3)' }}>
                  {t('dispatcher_manifest.depart_button', { count: totalParcels })}
                </button>
              )}

              {canDepart && totalParcels === 0 && (
                <div style={{ textAlign: 'center', padding: 12, fontSize: 13, color: '#94a3b8' }}>
                  {t('dispatcher_manifest.no_parcels_yet')}
                </div>
              )}

              {batch.status === 'completed' && (
                <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>{t('dispatcher_manifest.batch_completed_title')}</div>
                  <div style={{ fontSize: 12, color: '#16a34a' }}>{t('dispatcher_manifest.batch_completed_desc', { count: totalParcels })}</div>
                </div>
              )}
            </div>

            {/* Zone sections */}
            {zones.sort((a,b) => a.routeOrder - b.routeOrder).map((zone, zIdx) => {
              const isExpanded = expandedZone === zone.zoneId;
              const deliveredCount = zone.parcels.filter(p => p.status === 'delivered').length;
              const allDelivered = deliveredCount === zone.parcels.length && zone.parcels.length > 0;
              const zoneArrived = zone.parcels.some(p => ['at_zone','out_for_delivery','delivered'].includes(p.status));

              return (
                <div key={zone.zoneId} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

                  {/* Zone header */}
                  <button
                    onClick={() => setExpandedZone(isExpanded ? null : zone.zoneId)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: allDelivered ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
                      {zIdx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>
                        📍 {zone.zoneName}
                        {allDelivered && <span style={{ marginLeft: 8, fontSize: 12, color: '#16a34a' }}>{t('dispatcher_manifest.zone_completed_badge')}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {t('dispatcher_manifest.zone_meta', { agent: zone.zoneAgent, count: zone.parcels.length, eta: zone.etaMinutes })}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#16a34a' }}>
                          {t('dispatcher_manifest.zone_delivered_ratio', { delivered: deliveredCount, total: zone.parcels.length })}
                        </span>
                      </div>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 20 }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Zone arrival button */}
                  {hasLeft && !zoneArrived && (
                    <div style={{ padding: '0 16px 14px' }}>
                      <button onClick={() => handleZoneArrival(zone.zoneId)}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: '10px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        {t('dispatcher_manifest.zone_arrived_button', { zone: zone.zoneName })}
                      </button>
                    </div>
                  )}

                  {/* Parcel list */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f1f5f9' }}>
                      {zone.parcels.map((parcel, pIdx) => (
                        <div key={parcel.parcelId} style={{ padding: '12px 16px', borderBottom: pIdx < zone.parcels.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', marginBottom: 2 }}>
                                {parcel.trackingNumber}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {parcel.recipientName}
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                📦 {parcel.productName}
                              </div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                                📍 {parcel.deliveryAddress}
                              </div>
                              {parcel.recipientPhone && (
                                <a href={`tel:${parcel.recipientPhone}`} style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                                  📞 {parcel.recipientPhone}
                                </a>
                              )}
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0, marginLeft: 8,
                              backgroundColor: (PARCEL_STATUS_COLOR[parcel.status] || { bg: '#f1f5f9' }).bg,
                              color: (PARCEL_STATUS_COLOR[parcel.status] || { color: '#64748b' }).color,
                            }}>
                              {PARCEL_STATUS_LABEL[parcel.status] || parcel.status}
                            </span>
                          </div>

                          {/* Action buttons per parcel */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            {parcel.status === 'awaiting_handover' && (
                              <button onClick={() => handleMarkReceived(parcel.parcelId)}
                                style={{ flex: 1, backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                {t('dispatcher_manifest.receive_at_hub_button')}
                              </button>
                            )}
                            {['at_zone','out_for_delivery'].includes(parcel.status) && (
                              <button onClick={() => setConfirmParcel(parcel)}
                                style={{ flex: 1, background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff', border: 'none', padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                {t('dispatcher_manifest.confirm_delivery_button')}
                              </button>
                            )}
                            {parcel.status === 'delivered' && (
                              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#16a34a', fontWeight: 700, padding: '8px' }}>
                                {t('dispatcher_manifest.delivered_label')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Refresh button */}
            <button onClick={fetchManifest}
              style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              {t('dispatcher_manifest.refresh_manifest_button')}
            </button>
          </>
        )}
      </div>

      {/* Depart Modal */}
      {showDepartModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', margin: '0 0 6px' }}>{t('dispatcher_manifest.depart_modal_title')}</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>{t('dispatcher_manifest.depart_modal_desc')}</p>

            {[
              { key: 'driverName', label: t('dispatcher_manifest.field_driver_name'), placeholder: t('dispatcher_manifest.field_driver_name_placeholder') },
              { key: 'driverPhone', label: t('dispatcher_manifest.field_driver_phone'), placeholder: t('dispatcher_manifest.field_driver_phone_placeholder') },
              { key: 'vehicleInfo', label: t('dispatcher_manifest.field_vehicle_info'), placeholder: t('dispatcher_manifest.field_vehicle_info_placeholder') },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{field.label}</label>
                <input
                  placeholder={field.placeholder}
                  value={departForm[field.key]}
                  onChange={e => setDepartForm({ ...departForm, [field.key]: e.target.value })}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            ))}

            <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
              {t('dispatcher_manifest.depart_warning', { count: totalParcels })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDepartModal(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                {t('dispatcher_manifest.cancel_button')}
              </button>
              <button onClick={handleDepart} disabled={departing}
                style={{ flex: 2, background: departing ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: departing ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 14 }}>
                {departing ? t('dispatcher_manifest.sending_button') : t('dispatcher_manifest.depart_with_parcels_button', { count: totalParcels })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delivery modal */}
      {confirmParcel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 14px' }}>{t('dispatcher_manifest.confirm_delivery_modal_title')}</h2>

            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{t('dispatcher_manifest.parcel_label')}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{confirmParcel.recipientName}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>📦 {confirmParcel.productName}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>📍 {confirmParcel.deliveryAddress}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563eb', marginTop: 6 }}>{confirmParcel.trackingNumber}</div>
            </div>

            <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12, color: '#166534', fontWeight: 600 }}>
              {t('dispatcher_manifest.sms_notice')}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmParcel(null)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                {t('dispatcher_manifest.cancel_button')}
              </button>
              <button onClick={() => handleParcelDelivered(confirmParcel.parcelId)}
                style={{ flex: 2, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                {t('dispatcher_manifest.delivered_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatcherManifest;