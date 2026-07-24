import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';

/**
 * VanToday — Seller's view of today's KenteXa van.
 * Shows van status, route, cutoff time, and seller's own parcels in the batch.
 * Replaces "Van ya Leo" quick action in SellerDashboard.
 */

const STATUS_COLOR = {
  open:        { bg: '#dcfce7', color: '#16a34a', label: '🟢 Inapokea Vifurushi' },
  cutoff:      { bg: '#fef9c3', color: '#ca8a04', label: '🟡 Muda Umekwisha' },
  departed:    { bg: '#dbeafe', color: '#2563eb', label: '🔵 Van Imeondoka' },
  in_progress: { bg: '#e0f2fe', color: '#0284c7', label: '🔵 Inasambaza' },
  completed:   { bg: '#f0fdf4', color: '#15803d', label: '✅ Imekamilika' },
};

const PARCEL_STATUS_LABEL = {
  awaiting_handover: '⏳ Subiri — Peleka Hubuni',
  at_hub:            '🏢 Imepokewa Hubuni',
  on_van:            '🚐 Ipo Vanini',
  at_zone:           '📍 Imefika Eneo',
  out_for_delivery:  '🛵 Inasambazwa',
  delivered:         '✅ Imetolewa',
  returned:          '↩️ Imerudishwa',
};

const PARCEL_STATUS_COLOR = {
  awaiting_handover: { bg: '#fef9c3', color: '#92400e' },
  at_hub:            { bg: '#dbeafe', color: '#1d4ed8' },
  on_van:            { bg: '#e0f2fe', color: '#0284c7' },
  at_zone:           { bg: '#ede9fe', color: '#7c3aed' },
  out_for_delivery:  { bg: '#dcfce7', color: '#16a34a' },
  delivered:         { bg: '#f0fdf4', color: '#15803d' },
  returned:          { bg: '#fee2e2', color: '#dc2626' },
};

const VanToday = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [manifest, setManifest]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [myParcels, setMyParcels]   = useState([]);

  useEffect(() => { fetchManifest(); }, []);

  const fetchManifest = async () => {
    try {
      setLoading(true);
      const res = await api.get('/daily-batches/manifest/today');
      setManifest(res.data);

      // Filter parcels belonging to this seller
      // We identify by checking orderId against seller's orders
      const allParcels = (res.data?.zones || []).flatMap(z =>
        z.parcels.map(p => ({ ...p, zoneName: z.zoneName, routeOrder: z.routeOrder }))
      );

      // Get seller's order IDs
      try {
        const ordersRes = await api.get('/shipping/seller-orders');
        const myOrderIds = new Set((ordersRes.data || []).map(o => o.id));
        setMyParcels(allParcels.filter(p => myOrderIds.has(p.orderId)));
      } catch {
        // If can't get seller orders, show all parcels
        setMyParcels(allParcels);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindwa kupakia');
    } finally {
      setLoading(false);
    }
  };

  const batch = manifest?.batch;
  const zones = manifest?.zones || [];
  const totalParcels = manifest?.totalParcels || 0;
  const batchStatus = STATUS_COLOR[batch?.status] || { bg: '#f1f5f9', color: '#64748b', label: batch?.status };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="VanToday" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ textAlign: 'center', padding: '60px 16px', color: '#64748b' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚐</div>
        <div>Inapakia habari za van...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="VanToday" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="Van ya Leo — KenteXa Dar" />

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 100 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: 14, borderRadius: 12, marginBottom: 14, fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        {/* No batch */}
        {!batch && !error && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>Hakuna batch bado leo</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Pangilia agizo lako kwenye van ya leo kuanza batch ya kwanza.
            </div>
            <button onClick={() => onNavigate('BatchHandoff')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px 28px', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
              🚐 Pangilia Agizo
            </button>
          </div>
        )}

        {batch && (
          <>
            {/* Van Status Card */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>

              {/* Status badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>🚐 Van ya KenteXa</div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 20, backgroundColor: batchStatus.bg, color: batchStatus.color }}>
                  {batchStatus.label}
                </span>
              </div>

              {/* Van timing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Tarehe', value: new Date(batch.runDate).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' }) },
                  { label: 'Muda wa Mwisho (Cutoff)', value: new Date(batch.cutoffTime).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) },
                  { label: 'Van Inaondoka', value: new Date(batch.plannedDepartureTime).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) },
                  { label: 'Vifurushi Vyote', value: `${totalParcels} vifurushi` },
                ].map(item => (
                  <div key={item.label} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>{item.label.toUpperCase()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Cutoff warning */}
              {batch.status === 'open' && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 14 }}>
                  ⏰ Wasilisha kifurushi chako Kariakoo Hub kabla ya {new Date(batch.cutoffTime).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              {/* Driver info */}
              {batch.driverName && (
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                  🧑 Dereva: {batch.driverName} {batch.driverPhone && `· 📞 ${batch.driverPhone}`}
                  {batch.vehicleInfo && ` · 🚗 ${batch.vehicleInfo}`}
                </div>
              )}
            </div>

            {/* Route */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>🗺️ Route ya Van</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', backgroundColor: '#1d4ed8', color: '#fff', borderRadius: 20 }}>
                    🏢 Kariakoo
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>HUB</div>
                </div>
                {[...zones].sort((a,b) => a.routeOrder - b.routeOrder).map(zone => (
                  <React.Fragment key={zone.zoneId}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: 18 }}>→</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>+{zone.etaMinutes}min</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', backgroundColor: '#ede9fe', color: '#7c3aed', borderRadius: 20 }}>
                        📍 {zone.zoneName}
                      </div>
                      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{zone.parcels.length} vifurushi</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* My parcels in this batch */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                📦 Vifurushi Vyangu kwenye Van Hii
                {myParcels.length > 0 && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>({myParcels.length})</span>}
              </div>

              {myParcels.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13 }}>Huna vifurushi kwenye van hii bado.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Bonyeza "Pangilia Agizo" hapa chini.</div>
                </div>
              ) : (
                myParcels.map(parcel => {
                  const sc = PARCEL_STATUS_COLOR[parcel.status] || { bg: '#f1f5f9', color: '#64748b' };
                  return (
                    <div key={parcel.parcelId} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', marginBottom: 3 }}>
                            {parcel.trackingNumber}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{parcel.recipientName}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            📍 {parcel.zoneName} · {parcel.deliveryAddress}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: sc.bg, color: sc.color, flexShrink: 0, marginLeft: 8, textAlign: 'center' }}>
                          {PARCEL_STATUS_LABEL[parcel.status] || parcel.status}
                        </span>
                      </div>

                      {/* Instruction for awaiting_handover */}
                      {parcel.status === 'awaiting_handover' && (
                        <div style={{ backgroundColor: '#fef9c3', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                          ⚠️ Peleka kifurushi hiki Kariakoo Hub kabla ya {new Date(batch.cutoffTime).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* All zones summary */}
            {zones.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>📊 Muhtasari wa Maeneo</div>
                {[...zones].sort((a,b) => a.routeOrder - b.routeOrder).map(zone => {
                  const delivered = zone.parcels.filter(p => p.status === 'delivered').length;
                  return (
                    <div key={zone.zoneId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📍 {zone.zoneName}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Inafika baada ya dakika {zone.etaMinutes}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#7c3aed' }}>{zone.parcels.length}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{delivered}/{zone.parcels.length} vimetolewa</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom action buttons */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', gap: 10 }}>
        <button onClick={() => onNavigate('BatchHandoff')}
          style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
          🚐 Pangilia Agizo
        </button>
        <button onClick={fetchManifest}
          style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          🔄 Refresh
        </button>
      </div>
    </div>
  );
};

export default VanToday;