/**
 * FinancialDashboard.js — Admin Revenue Command Center
 * Place at: src/admin/pages/FinancialDashboard.js
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtM = (n) => {
  const v = Number(n || 0);
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `${(v / 1000).toFixed(0)}K`;
  return String(v);
};

// SVG bar chart
const BarChart = ({ data, color = '#1d4ed8', label }) => {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 320, H = 80, PAD = 24;
  const barW = Math.floor((W - PAD) / data.length) - 4;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>{label}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + PAD}`}>
        <defs>
          <linearGradient id={`g-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const barH = Math.max(3, (d.value / max) * H);
          const x = PAD / 2 + i * (barW + 4);
          const y = H - barH;
          const isLast = i === data.length - 1;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={3}
                fill={isLast ? `url(#g-${color.slice(1)})` : '#e0e7ff'}
              />
              {isLast && d.value > 0 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                  fontSize={8} fill={color} fontWeight="700">
                  {fmtM(d.value)}
                </text>
              )}
              <text x={x + barW / 2} y={H + PAD - 4} textAnchor="middle"
                fontSize={9} fill={isLast ? color : '#94a3b8'}
                fontWeight={isLast ? '800' : '400'}>
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={PAD / 2 - 2} y1={H} x2={W - PAD / 2 + 2} y2={H}
          stroke="#f1f5f9" strokeWidth={1} />
      </svg>
    </div>
  );
};

const StatCard = ({ label, value, sub, color, bg, icon, trend }) => (
  <div style={{ backgroundColor: bg || '#fff', borderRadius: 14, padding: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      {trend !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 700,
          color: trend >= 0 ? '#16a34a' : '#dc2626',
          backgroundColor: trend >= 0 ? '#dcfce7' : '#fee2e2',
          padding: '2px 6px', borderRadius: 100 }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div style={{ fontSize: 20, fontWeight: 900, color: color || '#1e293b', marginTop: 8 }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: 600 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
  </div>
);

const FinancialDashboard = ({ onNavigate }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');
  const [period,  setPeriod]  = useState('month');

  useEffect(() => {
    api.get('/orders/admin/financial-summary')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
      <div>Inapakia takwimu za fedha...</div>
    </div>
  );

  if (!data) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
      Imeshindwa kupakia. Jaribu tena.
    </div>
  );

  const gmv            = data.totalRevenue  || data.gmv  || 0;
  const platformFees   = data.platformFees  || data.totalPlatformFees || 0;
  const pendingEscrow  = data.pendingEscrow || data.escrowBalance     || 0;
  const releasedToday  = data.releasedToday || 0;
  const totalOrders    = data.totalOrders   || 0;
  const onlineOrders   = data.onlineOrders  || 0;
  const offlineOrders  = data.offlineOrders || 0;
  const monthRevenue   = data.monthRevenue  || data.monthlyRevenue    || 0;
  const weekRevenue    = data.weekRevenue   || data.weeklyRevenue     || 0;
  const avgOrderValue  = totalOrders > 0 ? gmv / totalOrders : 0;

  // Build last 7 days chart from daily data if available
  const dailyData = data.dailyRevenue || Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return {
      label: d.toLocaleDateString('sw-TZ', { weekday: 'short' }),
      value: i === 6 ? weekRevenue / 7 : 0,
    };
  });

  // Top sellers
  const topSellers = data.topSellers || [];
  // Channel breakdown
  const channels = [
    { label: 'Online',  value: onlineOrders,  color: '#1d4ed8' },
    { label: 'Manual',  value: offlineOrders, color: '#7c3aed' },
    { label: 'Invoice', value: data.invoiceOrders || 0, color: '#16a34a' },
  ];
  const totalCh = channels.reduce((s, c) => s + c.value, 0) || 1;

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>
            💰 Dashibodi ya Fedha
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Muhtasari wa mapato yote ya KenteXa
          </div>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
            fontSize: 12, outline: 'none' }}>
          <option value="today">Leo</option>
          <option value="week">Wiki Hii</option>
          <option value="month">Mwezi Huu</option>
          <option value="all">Yote</option>
        </select>
      </div>

      {/* Hero GMV card */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
        borderRadius: 20, padding: 24, marginBottom: 20, color: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
          marginBottom: 6, letterSpacing: 1 }}>JUMLA YA MAUZO (GMV)</div>
        <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 4 }}>
          TZS {fmt(gmv)}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          {[
            { label: 'Mwezi Huu',  value: `TZS ${fmtM(monthRevenue)}` },
            { label: 'Wiki Hii',   value: `TZS ${fmtM(weekRevenue)}`  },
            { label: 'Maagizo',    value: totalOrders                  },
            { label: 'Wastani',    value: `TZS ${fmtM(avgOrderValue)}` },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)',
        gap: 12, marginBottom: 20 }}>
        <StatCard icon="💳" label="Ada za Platform"
          value={`TZS ${fmt(platformFees)}`}
          sub={`TZS 1,000 × ${totalOrders} maagizo`}
          color="#7c3aed" bg="#f5f3ff" />
        <StatCard icon="🔒" label="Escrow Inayosubiri"
          value={`TZS ${fmt(pendingEscrow)}`}
          sub="Itatolewa baada ya uthibitisho"
          color="#f59e0b" bg="#fef3c7" />
        <StatCard icon="✅" label="Ilitolewa Leo"
          value={`TZS ${fmt(releasedToday)}`}
          sub="Malipo kwa wauzaji"
          color="#16a34a" bg="#f0fdf4" />
        <StatCard icon="📦" label="Maagizo Yote"
          value={totalOrders}
          sub={`${onlineOrders} online · ${offlineOrders} manual`}
          color="#1d4ed8" bg="#eff6ff" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
        padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {[
          { key: 'overview', label: '📊 Muhtasari' },
          { key: 'channels', label: '🔀 Njia' },
          { key: 'sellers',  label: '🏪 Wauzaji' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: '9px 8px', border: 'none', cursor: 'pointer',
              borderRadius: 9, fontSize: 12, fontWeight: 700,
              backgroundColor: tab === t.key ? '#1d4ed8' : 'transparent',
              color: tab === t.key ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <BarChart data={dailyData} color="#1d4ed8" label="MAPATO — WIKI ILIYOPITA (TZS)" />

          <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '20px 0' }} />

          {/* Revenue breakdown */}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
            Mgawanyo wa Mapato
          </div>
          {[
            { label: 'GMV (Jumla ya Mauzo)',      value: gmv,          color: '#1d4ed8' },
            { label: 'Ada za Platform (10×1,000)', value: platformFees, color: '#7c3aed' },
            { label: 'Escrow Inayosubiri',         value: pendingEscrow,color: '#f59e0b' },
            { label: 'Ilitolewa kwa Wauzaji',      value: gmv - platformFees - pendingEscrow, color: '#16a34a' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '10px 0',
              borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3,
                  backgroundColor: r.color, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: '#475569' }}>{r.label}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: r.color }}>
                TZS {fmt(r.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Channels tab */}
      {tab === 'channels' && (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
            Maagizo kwa Njia
          </div>
          {channels.map(c => (
            <div key={c.label} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{c.label}</span>
                <span style={{ color: c.color, fontWeight: 800 }}>
                  {c.value} ({Math.round(c.value / totalCh * 100)}%)
                </span>
              </div>
              <div style={{ height: 10, backgroundColor: '#f1f5f9', borderRadius: 100 }}>
                <div style={{ height: '100%', borderRadius: 100,
                  backgroundColor: c.color,
                  width: `${Math.round(c.value / totalCh * 100)}%`,
                  transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}

          <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '20px 0' }} />

          {/* Quick links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: '📋 Ona Maagizo Yote', page: 'Orders' },
              { label: '💳 Ona Malipo',        page: 'Payments' },
              { label: '🧾 Ona Ankara',         page: 'Invoices' },
              { label: '🤝 Ona Wauzaji',        page: 'Sellers' },
            ].map(l => (
              <button key={l.page} onClick={() => onNavigate(l.page)}
                style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, color: '#1e293b', textAlign: 'left' }}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Sellers tab */}
      {tab === 'sellers' && (
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
            🏆 Wauzaji Bora
          </div>
          {topSellers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
              <div>Hakuna data ya wauzaji bado</div>
            </div>
          ) : topSellers.slice(0, 10).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.storeName || s.name || 'Muuzaji'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {s.ordersCount || 0} maagizo
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#16a34a' }}>
                TZS {fmtM(s.totalRevenue || s.revenue || 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;