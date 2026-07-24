/**
 * SellerAnalytics.js — Seller Business Intelligence
 * Place at: src/public/pages/SellerAnalytics.js
 */
import React, { useState, useEffect } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const fmt   = n => Number(n || 0).toLocaleString();
const fmtM  = n => {
  const v = Number(n || 0);
  if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `${(v/1000).toFixed(0)}K`;
  return String(v);
};

// SVG bar chart component
const BarChart = ({ data, color = '#7c3aed', valueKey = 'revenue' }) => {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const W = 320, H = 80, pad = 2;
  const barW = Math.floor(W / data.length) - pad;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const v    = d[valueKey] || 0;
        const barH = Math.max(2, (v / max) * H);
        const x    = i * (barW + pad);
        const y    = H - barH;
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2}
              fill={v > 0 ? (isLast ? `url(#bar-grad)` : `${color}55`) : '#f1f5f9'} />
            {i % 2 === 0 && (
              <text x={x + barW/2} y={H + 14} textAnchor="middle"
                fontSize={7} fill="#94a3b8">
                {d.label?.split(' ').pop() || ''}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const StatCard = ({ icon, label, value, sub, color = '#1d4ed8', bg = '#eff6ff' }) => (
  <div style={{ backgroundColor: bg, borderRadius: 14, padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginTop: 2 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
  </div>
);

const SellerAnalytics = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');

  useEffect(() => {
    api.get('/seller/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentPage="SellerAnalytics" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div>Inapakia takwimu...</div>
        </div>
      </div>
    </div>
  );

  const stats     = data?.stats     || {};
  const analytics = data?.analytics || {};
  const { topProducts = [], topCustomers = [], repeatRate = 0,
          totalCustomers = 0, repeatCount = 0, dailyRevenue = [] } = analytics;

  // Week vs last week comparison
  const weekData   = dailyRevenue.slice(-7);
  const prevWeek   = dailyRevenue.slice(-14, -7);
  const weekTotal  = weekData.reduce((s, d) => s + d.revenue, 0);
  const prevTotal  = prevWeek.reduce((s, d) => s + d.revenue, 0);
  const weekChange = prevTotal > 0 ? Math.round((weekTotal - prevTotal) / prevTotal * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SellerAnalytics" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('SellerDashboard')} title="📊 Takwimu za Biashara" />

      <div style={{ flex: 1, padding: '16px 16px 40px', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Hero revenue card */}
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#7c3aed)', borderRadius: 20,
          padding: 24, marginBottom: 20, color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
            letterSpacing: 1, marginBottom: 6 }}>JUMLA YA MAPATO</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 4 }}>
            TZS {fmt(stats.totalRevenue)}
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            {[
              { label: 'Maagizo',   value: stats.totalOrders || 0 },
              { label: 'Wiki Hii',  value: `TZS ${fmtM(weekTotal)}` },
              { label: 'Mabadiliko', value: `${weekChange >= 0 ? '+' : ''}${weekChange}%`,
                color: weekChange >= 0 ? '#86efac' : '#fca5a5' },
              { label: 'Wateja',    value: totalCustomers },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 16, fontWeight: 900, color: s.color || '#fff' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard icon="🔁" label="Wateja Wanaorudia"
            value={`${repeatRate}%`}
            sub={`${repeatCount} kati ya ${totalCustomers}`}
            color="#7c3aed" bg="#f5f3ff" />
          <StatCard icon="📦" label="Bidhaa Zinazouzwa"
            value={topProducts.length}
            sub={`Bora: ${topProducts[0]?.name?.slice(0, 20) || '—'}`}
            color="#1d4ed8" bg="#eff6ff" />
          <StatCard icon="✅" label="Maagizo Yaliyokamilika"
            value={stats.completedOrders || 0}
            sub={`${Math.round((stats.completedOrders || 0) / (stats.totalOrders || 1) * 100)}% ya yote`}
            color="#16a34a" bg="#f0fdf4" />
          <StatCard icon="⏳" label="Yanayosubiri Kutumwa"
            value={stats.needsShipping || 0}
            sub="Yanahitaji hatua"
            color="#f59e0b" bg="#fef3c7" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
          padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[
            { key: 'overview',   label: '📈 Mapato' },
            { key: 'products',   label: '📦 Bidhaa' },
            { key: 'customers',  label: '👥 Wateja' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '9px 8px', border: 'none', cursor: 'pointer',
                borderRadius: 9, fontSize: 12, fontWeight: 700,
                backgroundColor: tab === t.key ? '#7c3aed' : 'transparent',
                color: tab === t.key ? '#fff' : '#64748b' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview tab — revenue chart */}
        {tab === 'overview' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
              Mapato — Siku 14 Zilizopita
            </div>
            <BarChart data={dailyRevenue} color="#7c3aed" valueKey="revenue" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16,
              paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              {[
                { label: 'Wiki Hii',    value: `TZS ${fmtM(weekTotal)}` },
                { label: 'Wiki Iliyopita', value: `TZS ${fmtM(prevTotal)}` },
                { label: 'Mabadiliko',  value: `${weekChange >= 0 ? '+' : ''}${weekChange}%`,
                  color: weekChange >= 0 ? '#16a34a' : '#dc2626' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: s.color || '#1e293b' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products tab */}
        {tab === 'products' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>
              🏆 Bidhaa Bora kwa Mapato
            </div>
            {topProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                Bado hakuna data ya bidhaa
              </div>
            ) : topProducts.map((p, i) => {
              const pct = Math.round((p.revenue / (stats.totalRevenue || 1)) * 100);
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#7c3aed,#1d4ed8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 900 }}>{i + 1}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{p.orders} maagizo</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#7c3aed' }}>
                        TZS {fmtM(p.revenue)}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct}% ya jumla</div>
                    </div>
                  </div>
                  <div style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 100 }}>
                    <div style={{ height: '100%', borderRadius: 100,
                      background: 'linear-gradient(90deg,#7c3aed,#1d4ed8)',
                      width: `${pct}%`, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Customers tab */}
        {tab === 'customers' && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                👥 Wateja Bora
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f5f3ff',
                color: '#7c3aed', padding: '4px 12px', borderRadius: 100, fontWeight: 700 }}>
                Wanaorudia: {repeatRate}%
              </div>
            </div>

            {/* Repeat rate visual */}
            <div style={{ backgroundColor: '#f5f3ff', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Wateja Wanaorudia</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#7c3aed' }}>
                  {repeatCount} / {totalCustomers}
                </span>
              </div>
              <div style={{ height: 8, backgroundColor: '#e9d5ff', borderRadius: 100 }}>
                <div style={{ height: '100%', borderRadius: 100,
                  backgroundColor: '#7c3aed', width: `${repeatRate}%`,
                  transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                {repeatRate >= 30 ? '🔥 Vizuri sana! Wateja wako wanarudi.' :
                 repeatRate >= 15 ? '👍 Wastani mzuri. Jaribu kuboresha huduma.' :
                 '⚠️ Wateja wachache wanaorudia. Fikiria promosheni.'}
              </div>
            </div>

            {topCustomers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                Bado hakuna data ya wateja
              </div>
            ) : topCustomers.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%',
                  background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#f97316)' :
                               i === 1 ? 'linear-gradient(135deg,#94a3b8,#64748b)' :
                               i === 2 ? 'linear-gradient(135deg,#cd7c32,#92400e)' :
                               'linear-gradient(135deg,#7c3aed,#1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {c.orders} maagizo · {c.phone}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#16a34a' }}>
                    TZS {fmtM(c.spent)}
                  </div>
                  {c.orders > 1 && (
                    <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>🔁 Anarudi</div>
                  )}
                </div>
              </div>
            ))}

            {/* WhatsApp top customers */}
            {topCustomers.some(c => c.phone) && (
              <div style={{ marginTop: 16, padding: 14, backgroundColor: '#f0fdf4',
                borderRadius: 12, border: '1px solid #86efac' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>
                  📲 Wasiliana na Wateja Bora
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {topCustomers.filter(c => c.phone).map((c, i) => {
                    const phone = String(c.phone).replace(/[^0-9]/g, '').replace(/^0/, '255');
                    return (
                      <a key={i}
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(`Habari ${c.name.split(' ')[0]}! Asante kwa kutuamini. 🙏`)}`}
                        target="_blank" rel="noreferrer"
                        style={{ padding: '6px 12px', backgroundColor: '#25D366',
                          color: '#fff', borderRadius: 8, textDecoration: 'none',
                          fontSize: 11, fontWeight: 700 }}>
                        📲 {c.name.split(' ')[0]}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default SellerAnalytics;