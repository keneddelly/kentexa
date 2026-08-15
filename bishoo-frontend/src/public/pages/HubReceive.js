import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';

/**
 * HubReceive — Super Agent uses this at Kariakoo hub to receive parcels
 * from sellers physically arriving with their goods.
 *
 * Workflow:
 * 1. Seller arrives with parcel → gives Super Agent tracking number
 * 2. Super Agent types/scans tracking number here
 * 3. System looks up the parcel in today's batch
 * 4. Super Agent confirms receipt → status changes to 'at_hub'
 * 5. Parcel is ready for van loading
 */

const HubReceive = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = { en: 'en-US', sw: 'sw-TZ', fr: 'fr-FR' }[i18n.language] || 'en-US';
  const [trackingInput, setTrackingInput] = useState('');
  const [parcel, setParcel]               = useState(null);
  const [searching, setSearching]         = useState(false);
  const [receiving, setReceiving]         = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [recentlyReceived, setRecentlyReceived] = useState([]);
  const [todaySummary, setTodaySummary]   = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetchTodaySummary();
  }, []);

  const fetchTodaySummary = async () => {
    try {
      const res = await api.get('/daily-batches/manifest/today');
      setTodaySummary(res.data);
    } catch { setTodaySummary(null); }
  };

  const handleSearch = async () => {
    const val = trackingInput.trim().toUpperCase();
    if (!val) { setError(t('hub_receive.tracking_required')); return; }

    try {
      setSearching(true); setError(''); setParcel(null);

      // Search in today's manifest for this tracking number
      const manifestRes = await api.get('/daily-batches/manifest/today');
      const allParcels  = (manifestRes.data?.zones || []).flatMap(z => z.parcels);
      const found       = allParcels.find(p =>
        p.trackingNumber?.toUpperCase() === val ||
        String(p.orderId) === val
      );

      if (!found) {
        // Try searching by order ID if numeric
        if (/^\d+$/.test(val)) {
          const found2 = allParcels.find(p => String(p.orderId) === val);
          if (found2) { setParcel(found2); return; }
        }
        setError(t('hub_receive.not_found', { val }));
        return;
      }

      setParcel(found);
    } catch (err) {
      setError(err?.response?.data?.message || t('hub_receive.search_failed'));
    } finally {
      setSearching(false);
    }
  };

  const handleReceive = async () => {
    if (!parcel) return;
    try {
      setReceiving(true); setError('');
      await api.patch(`/daily-batches/parcels/${parcel.parcelId}/received`);

      // Add to recently received list
      setRecentlyReceived(prev => [{
        trackingNumber: parcel.trackingNumber,
        recipientName:  parcel.recipientName,
        productName:    parcel.productName,
        zone:           parcel.zone || '—',
        time:           new Date().toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }),
      }, ...prev].slice(0, 10));

      setSuccess(t('hub_receive.received_success', { name: parcel.recipientName }));
      setParcel(null);
      setTrackingInput('');
      fetchTodaySummary();
      setTimeout(() => {
        setSuccess('');
        inputRef.current?.focus();
      }, 3000);
    } catch (err) {
      setError(err?.response?.data?.message || t('hub_receive.receive_failed'));
    } finally {
      setReceiving(false);
    }
  };

  const awaitingCount = todaySummary?.zones
    ?.flatMap(z => z.parcels)
    ?.filter(p => p.status === 'awaiting_handover')?.length || 0;

  const atHubCount = todaySummary?.zones
    ?.flatMap(z => z.parcels)
    ?.filter(p => p.status === 'at_hub')?.length || 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('DispatcherManifest')} title={t('hub_receive.page_title')} top={0} />

      {/* Status banner */}
      {todaySummary?.batch && (
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              {t('hub_receive.batch_today_label', { count: todaySummary.totalParcels })}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>{awaitingCount}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{t('hub_receive.awaiting_label')}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80' }}>{atHubCount}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>{t('hub_receive.at_hub_label')}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Search box */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
            {t('hub_receive.search_box_title')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              placeholder={t('hub_receive.search_placeholder')}
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '13px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'monospace', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.border = '2px solid #1d4ed8'}
              onBlur={e => e.target.style.border = '2px solid #e2e8f0'}
            />
            <button onClick={handleSearch} disabled={searching}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              {searching ? '⏳' : '🔍'}
            </button>
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginTop: 10, fontSize: 13 }}>
              ❌ {error}
            </div>
          )}
          {success && (
            <div style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '10px 14px', borderRadius: 8, marginTop: 10, fontSize: 13, fontWeight: 700 }}>
              {success}
            </div>
          )}
        </div>

        {/* Parcel found — confirm receipt */}
        {parcel && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16, border: '2px solid #1d4ed8' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 14 }}>
              {t('hub_receive.parcel_found_title')}
            </div>

            {[
              { label: t('hub_receive.label_tracking_number'), value: parcel.trackingNumber, mono: true },
              { label: t('hub_receive.label_recipient'), value: parcel.recipientName },
              { label: t('hub_receive.label_phone'), value: parcel.recipientPhone || '—' },
              { label: t('hub_receive.label_product'), value: parcel.productName },
              { label: t('hub_receive.label_delivery_address'), value: parcel.deliveryAddress },
              { label: t('hub_receive.label_van_zone'), value: parcel.zoneName || '—' },
              { label: t('hub_receive.label_current_status'), value: parcel.status?.replace(/_/g, ' ') },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', fontFamily: item.mono ? 'monospace' : 'inherit', maxWidth: '60%', textAlign: 'right' }}>
                  {item.value}
                </span>
              </div>
            ))}

            {parcel.status === 'at_hub' ? (
              <div style={{ backgroundColor: '#dcfce7', borderRadius: 10, padding: 12, marginTop: 14, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                {t('hub_receive.already_at_hub')}
              </div>
            ) : parcel.status === 'on_van' ? (
              <div style={{ backgroundColor: '#dbeafe', borderRadius: 10, padding: 12, marginTop: 14, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#2563eb' }}>
                {t('hub_receive.already_on_van')}
              </div>
            ) : (
              <button onClick={handleReceive} disabled={receiving}
                style={{ width: '100%', background: receiving ? '#93c5fd' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: receiving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, marginTop: 16, boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
                {receiving ? t('hub_receive.receiving_button') : t('hub_receive.receive_button')}
              </button>
            )}

            <button onClick={() => { setParcel(null); setTrackingInput(''); inputRef.current?.focus(); }}
              style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 10, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
              {t('hub_receive.search_another')}
            </button>
          </div>
        )}

        {/* Today's awaiting parcels */}
        {todaySummary?.zones && awaitingCount > 0 && !parcel && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
              {t('hub_receive.awaiting_parcels_title', { count: awaitingCount })}
            </div>
            {todaySummary.zones.flatMap(z =>
              z.parcels
                .filter(p => p.status === 'awaiting_handover')
                .map(p => ({ ...p, zoneName: z.zoneName }))
            ).map(p => (
              <div key={p.parcelId}
                onClick={() => { setTrackingInput(p.trackingNumber); setParcel(p); }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#fef9c3', borderRadius: 10, marginBottom: 8, cursor: 'pointer', border: '1px solid #fde68a' }}>
                <div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#92400e' }}>{p.trackingNumber}</div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>{p.recipientName} · {p.zoneName}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setTrackingInput(p.trackingNumber); setParcel(p); }}
                  style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  {t('hub_receive.receive_short_button')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Recently received */}
        {recentlyReceived.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
              {t('hub_receive.recently_received_title', { count: recentlyReceived.length })}
            </div>
            {recentlyReceived.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                <div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8' }}>{p.trackingNumber}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{p.recipientName} · {p.zone}</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.time}</div>
              </div>
            ))}
          </div>
        )}

        {/* No batch */}
        {!todaySummary?.batch && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{t('hub_receive.no_batch_title')}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{t('hub_receive.no_batch_desc')}</div>
            <button onClick={() => onNavigate('DispatcherManifest')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              {t('hub_receive.view_manifest_button')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HubReceive;