/**
 * SellerPayouts.js — Seller payout history & earnings
 * Place at: src/public/pages/SellerPayouts.js
 */
import React, { useState, useEffect } from 'react';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const fmt = (n) => Number(n || 0).toLocaleString();

const STATUS = {
  released: { label: 'Imetolewa',   color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
  held:     { label: 'Inashikiliwa',color: '#ca8a04', bg: '#fef9c3', icon: '⏳' },
  pending:  { label: 'Inasubiri',   color: '#64748b', bg: '#f8fafc', icon: '🕐' },
  disputed: { label: 'Tatizo',      color: '#dc2626', bg: '#fee2e2', icon: '⚠️' },
};

const PayoutCard = ({ order }) => {
  const s   = STATUS[order.payoutStatus] || STATUS.pending;
  const date = new Date(order.createdAt).toLocaleDateString('sw-TZ',
    { day: 'numeric', month: 'short', year: 'numeric' });
  const releaseDate = order.fundsReleasedAt
    ? new Date(order.fundsReleasedAt).toLocaleDateString('sw-TZ',
        { day: 'numeric', month: 'short' })
    : order.autoReleaseAt
    ? `~${new Date(order.autoReleaseAt).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' })}`
    : null;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '14px 16px',
      marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      borderLeft: `4px solid ${s.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.productName}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {order.buyerName} · {date}
          </div>
          {order.trackingNumber && (
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', marginTop: 2 }}>
              {order.trackingNumber}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px',
          borderRadius: 100, backgroundColor: s.bg, color: s.color,
          flexShrink: 0, marginLeft: 8 }}>
          {s.icon} {s.label}
        </span>
      </div>

      {/* Amount breakdown */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Jumla ya Mauzo</span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>TZS {fmt(order.totalAmount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Ada ya KenteXa</span>
          <span style={{ fontSize: 12, color: '#dc2626' }}>-TZS {fmt(order.platformFee)}</span>
        </div>
        <div style={{ height: 1, backgroundColor: '#e2e8f0', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a' }}>Mapato Yako</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#16a34a' }}>
            TZS {fmt(order.sellerAmount)}
          </span>
        </div>
      </div>

      {/* Release info */}
      {releaseDate && (
        <div style={{ fontSize: 11, color: order.fundsReleasedAt ? '#16a34a' : '#64748b',
          marginTop: 8 }}>
          {order.fundsReleasedAt ? `✅ Ilitolewa: ${releaseDate}` : `⏳ Inatarajiwa: ${releaseDate}`}
          {order.autoConfirmed && ' (Otomatiki)'}
        </div>
      )}
      {order.buyerConfirmedAt && (
        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>
          ✅ Mnunuzi alithibitisha: {new Date(order.buyerConfirmedAt)
            .toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
};

const SellerPayouts = ({ onNavigate }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('all'); // all | pending | released

  useEffect(() => {
    api.get('/seller/my-payouts')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = (data?.orders || []).filter(o => {
    if (tab === 'pending')  return o.payoutStatus !== 'released';
    if (tab === 'released') return o.payoutStatus === 'released';
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <BackBar title="Mapato & Malipo" onBack={() => onNavigate('back')} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 80px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40 }}>💰</div>
            <div style={{ marginTop: 12 }}>Inapakia...</div>
          </div>
        ) : !data ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            Imeshindwa kupakia data
          </div>
        ) : (
          <>
            {/* Summary hero */}
            <div style={{ background: 'linear-gradient(135deg,#16a34a,#059669)',
              borderRadius: 20, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)',
                fontWeight: 700, marginBottom: 4 }}>JUMLA YA MAPATO YALIYOTOLEWA</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', marginBottom: 16 }}>
                TZS {fmt(data.summary.totalEarned)}
              </div>
              <div style={{ display: 'flex', gap: 0 }}>
                <div style={{ flex: 1, textAlign: 'center',
                  borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>
                    TZS {fmt(data.summary.totalPending)}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                    Yanayosubiri ({data.summary.pendingCount})
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', paddingLeft: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>
                    {data.summary.totalOrders}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                    Maagizo Yaliyolipwa
                  </div>
                </div>
              </div>
            </div>

            {/* Info card */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
              marginBottom: 16, fontSize: 12, color: '#1d4ed8', lineHeight: 1.6 }}>
              💡 <strong>Jinsi malipo yanavyofanya kazi:</strong> Pesa yako inashikiliwa
              salama hadi mnunuzi athibitishe kupokea bidhaa, au kwa siku 3-5
              bila jibu (otomatiki).
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
              padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {[
                { key: 'all',      label: `Zote (${data.orders.length})` },
                { key: 'pending',  label: `⏳ Inasubiri (${data.summary.pendingCount})` },
                { key: 'released', label: `✅ Imetolewa (${data.summary.releasedCount})` },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ flex: 1, padding: '9px 6px', border: 'none',
                    cursor: 'pointer', borderRadius: 9, fontSize: 11, fontWeight: 700,
                    backgroundColor: tab === t.key ? '#16a34a' : 'transparent',
                    color: tab === t.key ? '#fff' : '#64748b' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Order list */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 36 }}>💰</div>
                <div style={{ marginTop: 12, fontSize: 13 }}>Hakuna maagizo katika kikundi hiki</div>
              </div>
            ) : filtered.map(o => <PayoutCard key={o.id} order={o} />)}
          </>
        )}
      </div>
    </div>
  );
};

export default SellerPayouts;