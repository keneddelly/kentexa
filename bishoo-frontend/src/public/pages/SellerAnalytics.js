/**
 * SellerAnalytics.js — "Takwimu": the seller's numbers from GET /seller/dashboard.
 * New look (owner 2026-11-03, "continue with our left work"): white page, plain numbers,
 * ink bars, no emoji or gradients. Same data and texts as before.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar  from '../components/BackBar';
import api      from '../../api/api';

const fmt   = n => Number(n || 0).toLocaleString();
const fmtM  = n => {
  const v = Number(n || 0);
  if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `${(v/1000).toFixed(0)}K`;
  return String(v);
};

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d9bf0';
const GREEN = '#05603a';
const RED = '#b42318';

// Bars for the daily revenue (the last day darker). Plain SVG, no gradients.
const BarChart = ({ data, valueKey = 'revenue' }) => {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const W = 320, H = 80, pad = 2;
  const barW = Math.floor(W / data.length) - pad;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ display: 'block' }} aria-hidden="true">
      {data.map((d, i) => {
        const v    = d[valueKey] || 0;
        const barH = Math.max(2, (v / max) * H);
        const x    = i * (barW + pad);
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={H - barH} width={barW} height={barH} rx={2} fill={v > 0 ? (isLast ? INK : '#8b98a5') : LINE} />
            {i % 2 === 0 && (
              <text x={x + barW/2} y={H + 14} textAnchor="middle" fontSize={7} fill={MUTED}>{d.label?.split(' ').pop() || ''}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const Stat = ({ label, value, sub }) => (
  <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: 22, fontWeight: 800, color: INK }}>{value}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{label}</span>
    {sub && <span style={{ fontSize: 12, color: MUTED }}>{sub}</span>}
  </div>
);

const Rank = ({ n }) => (
  <span style={{ width: 28, height: 28, borderRadius: 14, background: '#f7f9f9', color: INK, fontSize: 13, fontWeight: 800, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
);

const SellerAnalytics = ({ onNavigate, isLoggedIn, onLogout, userRole, activeProfileId }) => {
  const { t } = useTranslation();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('overview');

  useEffect(() => {
    // Scoped to the active profile — see SellerDashboard.js's identical fix.
    api.get('/seller/dashboard', {
      params: activeProfileId ? { commerceProfileId: activeProfileId } : {},
    })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeProfileId]);

  const page = { minHeight: '100vh', background: '#fff', color: INK };
  if (loading) return (
    <div style={page}>
      <BackBar onBack={() => onNavigate('SellerDashboard')} title={t('seller_analytics.page_title')} />
      <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED, fontSize: 15 }}>{t('seller_analytics.loading')}</div>
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
  const changeText = `${weekChange >= 0 ? '+' : ''}${weekChange}%`;
  const h2 = { margin: 0, fontSize: 18, fontWeight: 800 };

  return (
    <div style={page}>
      <BackBar onBack={() => onNavigate('SellerDashboard')} title={t('seller_analytics.page_title')} />

      <main style={{ padding: '8px 16px 90px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14, color: MUTED }}>{t('seller_analytics.total_revenue_label')}</span>
          <span data-testid="analytics-revenue" style={{ fontSize: 34, fontWeight: 800 }}>TZS {fmt(stats.totalRevenue)}</span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
            {[
              { label: t('seller_analytics.hero_orders'), value: stats.totalOrders || 0 },
              { label: t('seller_analytics.hero_this_week'), value: `TZS ${fmtM(weekTotal)}` },
              { label: t('seller_analytics.hero_change'), value: changeText, color: weekChange >= 0 ? GREEN : RED },
              { label: t('seller_analytics.hero_customers'), value: totalCustomers },
            ].map(x => (
              <div key={x.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: x.color || INK }}>{x.value}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{x.label}</span>
              </div>
            ))}
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Stat label={t('seller_analytics.stat_repeat_customers')} value={`${repeatRate}%`}
            sub={t('seller_analytics.stat_repeat_sub', { count: repeatCount, total: totalCustomers })} />
          <Stat label={t('seller_analytics.stat_products_sold')} value={topProducts.length}
            sub={t('seller_analytics.stat_products_sub', { name: topProducts[0]?.name?.slice(0, 20) || '—' })} />
          <Stat label={t('seller_analytics.stat_completed_orders')} value={stats.completedOrders || 0}
            sub={t('seller_analytics.stat_completed_sub', { pct: Math.round((stats.completedOrders || 0) / (stats.totalOrders || 1) * 100) })} />
          <Stat label={t('seller_analytics.stat_pending_shipping')} value={stats.needsShipping || 0}
            sub={t('seller_analytics.stat_pending_sub')} />
        </div>

        <nav role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${LINE}` }}>
          {[
            { key: 'overview',  label: t('seller_analytics.tab_overview') },
            { key: 'products',  label: t('seller_analytics.tab_products') },
            { key: 'customers', label: t('seller_analytics.tab_customers') },
          ].map(tabItem => {
            const on = tab === tabItem.key;
            return (
              <button key={tabItem.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(tabItem.key)}
                style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 15, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                {tabItem.label}
                <span style={{ marginTop: 10, height: 4, width: 48, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
              </button>
            );
          })}
        </nav>

        {tab === 'overview' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={h2}>{t('seller_analytics.revenue_chart_title')}</h2>
            <BarChart data={dailyRevenue} valueKey="revenue" />
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              {[
                { label: t('seller_analytics.this_week'), value: `TZS ${fmtM(weekTotal)}` },
                { label: t('seller_analytics.last_week'), value: `TZS ${fmtM(prevTotal)}` },
                { label: t('seller_analytics.change_label'), value: changeText, color: weekChange >= 0 ? GREEN : RED },
              ].map(x => (
                <div key={x.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: x.color || INK }}>{x.value}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{x.label}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'products' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={h2}>{t('seller_analytics.top_products_title')}</h2>
            {topProducts.length === 0 ? (
              <p style={{ margin: 0, color: MUTED, fontSize: 15 }}>{t('seller_analytics.no_product_data')}</p>
            ) : topProducts.map((p, i) => {
              const pct = Math.round((p.revenue / (stats.totalRevenue || 1)) * 100);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Rank n={i + 1} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 13, color: MUTED }}>{t('seller_analytics.orders_suffix', { count: p.orders })}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>TZS {fmtM(p.revenue)}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{t('seller_analytics.of_total_pct', { pct })}</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: LINE, borderRadius: 3 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: INK, width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === 'customers' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <h2 style={h2}>{t('seller_analytics.top_customers_title')}</h2>
              <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{t('seller_analytics.repeat_pill', { rate: repeatRate })}</span>
            </div>
            <div style={{ background: '#f7f9f9', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: MUTED }}>{t('seller_analytics.repeat_customers_label')}</span>
                <b>{repeatCount} / {totalCustomers}</b>
              </div>
              <div style={{ height: 8, background: LINE, borderRadius: 4 }}>
                <div style={{ height: '100%', borderRadius: 4, background: INK, width: `${repeatRate}%` }} />
              </div>
              <span style={{ fontSize: 13, color: MUTED }}>
                {repeatRate >= 30 ? t('seller_analytics.repeat_msg_high') : repeatRate >= 15 ? t('seller_analytics.repeat_msg_mid') : t('seller_analytics.repeat_msg_low')}
              </span>
            </div>
            {topCustomers.length === 0 ? (
              <p style={{ margin: 0, color: MUTED, fontSize: 15 }}>{t('seller_analytics.no_customer_data')}</p>
            ) : topCustomers.map((c, i) => {
              const phone = c.phone ? String(c.phone).replace(/[^0-9]/g, '').replace(/^0/, '255') : '';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${LINE}` }}>
                  <Rank n={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: MUTED }}>
                      {t('seller_analytics.orders_suffix', { count: c.orders })}{c.phone ? ` · ${c.phone}` : ''}{c.orders > 1 ? ` · ${t('seller_analytics.returning_badge')}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <b style={{ fontSize: 15 }}>TZS {fmtM(c.spent)}</b>
                    {phone && (
                      <a href={`https://wa.me/${phone}?text=${encodeURIComponent(`Habari ${String(c.name || '').split(' ')[0]}! Asante kwa kutuamini.`)}`}
                        target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: BLUE, textDecoration: 'none' }}>WhatsApp</a>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
};

export default SellerAnalytics;
