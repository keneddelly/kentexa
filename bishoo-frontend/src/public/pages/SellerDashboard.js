import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import api from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const GN = '#16A34A';
const PU = '#7C3AED';
const fmt = n => Number(n||0).toLocaleString();

// ── Revenue Chart — last 7 days ────────────────────────────────────────────
const LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

const RevenueChart = ({ orders }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = LOCALE_MAP[i18n.language] || 'en-GB';
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date:  d,
      label: d.toLocaleDateString(dateLocale, { weekday: 'short' }),
      key:   d.toISOString().slice(0, 10),
      revenue: 0,
      orders:  0,
    };
  });

  (orders || []).forEach(o => {
    const day = o.createdAt?.slice(0, 10);
    const found = days.find(d => d.key === day);
    if (found) {
      found.revenue += Number(o.totalAmount || 0);
      found.orders  += 1;
    }
  });

  const maxRev  = Math.max(...days.map(d => d.revenue), 1);
  const W = 320, H = 120, PAD = 28, BAR_W = 32, GAP = 14;
  const totalW  = days.length * (BAR_W + GAP) - GAP;
  const startX  = (W - totalW) / 2;

  return (
    <div style={{ backgroundColor: WH, borderRadius: 16, padding: 20,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: DK }}>
          📊 {t('seller_dashboard.revenue_this_week')}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: GN }}>
          TZS {fmt(days.reduce((s, d) => s + d.revenue, 0))}
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H + PAD}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={B} />
            <stop offset="100%" stopColor={PU} />
          </linearGradient>
        </defs>
        {days.map((day, i) => {
          const x      = startX + i * (BAR_W + GAP);
          const barH   = day.revenue > 0 ? Math.max(8, (day.revenue / maxRev) * H) : 4;
          const y      = H - barH;
          const isToday = i === 6;
          return (
            <g key={day.key}>
              <rect x={x} y={y} width={BAR_W} height={barH}
                rx={6} fill={isToday ? 'url(#barGrad)' : '#E2E8F0'}
                style={{ transition: 'height 0.3s' }} />
              {(isToday && day.revenue > 0) && (
                <text x={x + BAR_W / 2} y={y - 6}
                  textAnchor="middle" fontSize={9} fill={B} fontWeight="700">
                  {(day.revenue / 1000).toFixed(0)}k
                </text>
              )}
              <text x={x + BAR_W / 2} y={H + PAD - 4}
                textAnchor="middle" fontSize={10}
                fill={isToday ? B : '#94A3B8'}
                fontWeight={isToday ? '800' : '400'}>
                {day.label}
              </text>
              {day.orders > 0 && (
                <circle cx={x + BAR_W / 2} cy={y - 14}
                  r={7} fill={isToday ? B : '#A5B4FC'} />
              )}
              {day.orders > 0 && (
                <text x={x + BAR_W / 2} y={y - 10}
                  textAnchor="middle" fontSize={8} fill={WH} fontWeight="800">
                  {day.orders}
                </text>
              )}
            </g>
          );
        })}
        <line x1={startX - 4} y1={H} x2={startX + totalW + 4} y2={H}
          stroke="#F1F5F9" strokeWidth={1} />
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 4, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#E2E8F0' }} />
          {t('seller_dashboard.past_days')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg,${B},${PU})` }} />
          {t('seller_dashboard.today')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: GR }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#A5B4FC' }} />
          {t('seller_dashboard.order_count')}
        </div>
      </div>
    </div>
  );
};

// ── Menu row — icon, label, optional live value, chevron ──────────────────
// `locked` rows are never hidden (per the "don't hide selling tools, offer
// an upgrade" principle) — they stay visible and tappable, just route to
// the verification flow instead of the real page underneath.
const MenuRow = ({ icon, label, value, onClick, last, dataTour, locked, onLockedClick, t }) => (
  <button onClick={locked ? onLockedClick : onClick} data-tour={dataTour}
    style={{ width:'100%', display:'flex', alignItems:'center', gap:14,
      padding:'14px 16px', border:'none', background:'none', cursor:'pointer',
      borderBottom: last ? 'none' : '1px solid #F8FAFC', textAlign:'left',
      opacity: locked ? 0.65 : 1 }}>
    <span style={{ fontSize:20, width:26, textAlign:'center', flexShrink:0 }}>{icon}</span>
    <span style={{ flex:1, fontSize:14, fontWeight:700, color:DK }}>{label}</span>
    {locked ? (
      <span style={{ fontSize:10, fontWeight:800, color:'#7C3AED', backgroundColor:'#F5F3FF',
        padding:'3px 8px', borderRadius:20, flexShrink:0 }}>
        🔒 {t('seller_dashboard.verified_only')}
      </span>
    ) : value != null && (
      <span style={{ fontSize:12, fontWeight:700, color:GR, flexShrink:0 }}>{value}</span>
    )}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke={GR} strokeWidth="2" style={{ flexShrink:0 }}>
      <polyline points="9,18 15,12 9,6"/>
    </svg>
  </button>
);

// ── BIS Commerce Dashboard — merges Local POS + Manual (Sale) and Kentexa
// Online (Order) data from GET /sales/dashboard. Renders nothing if the
// seller has no POS/inventory activity yet, so it never adds noise for a
// seller who only sells online. ─────────────────────────────────────────
const CHANNEL_LABELS = { local_pos: '🖥️', kentexa_online: '🌐', manual: '📝' };
const BisCommerceDashboard = ({ data, onNavigate, t }) => {
  if (!data) return null;
  const hasAnyChannelData = Object.values(data.today?.byChannel || {}).some(v => v > 0);
  if (!hasAnyChannelData && data.inventory?.totalProducts === 0) return null;

  return (
    <div style={{ backgroundColor: WH, borderRadius: 16, padding: 20,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
      <div data-tour="sd-commerce-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: DK }}>🧾 {t('seller_dashboard.commerce_dashboard_title')}</div>
        <button data-tour="sd-open-pos" onClick={() => onNavigate('POS')} style={{ background: `linear-gradient(135deg,${B},${PU})`,
          color: WH, border: 'none', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>
          {`🖥️ ${t('seller_products.open_pos')}`}
        </button>
      </div>

      {/* Today by channel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {['local_pos', 'kentexa_online', 'manual'].map(ch => (
          <div key={ch} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{CHANNEL_LABELS[ch]}</div>
            <div style={{ fontSize: 12, fontWeight: 900, color: DK, marginTop: 2 }}>TZS {fmt(data.today?.byChannel?.[ch] || 0)}</div>
            <div style={{ fontSize: 9, color: GR, fontWeight: 700, textTransform: 'uppercase' }}>{t(`seller_dashboard.channel_${ch}`)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderTop: '1px solid #F1F5F9', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: DK }}>{t('seller_dashboard.today_total')}</span>
        <span style={{ fontSize: 17, fontWeight: 900, color: GN }}>TZS {fmt(data.grossSales)}</span>
      </div>

      {/* Gross profit — only when cost prices are actually set on at least
          one sold item, per the spec's "if cost prices are available". */}
      {data.costOfGoods > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GR, marginBottom: 4 }}>
          <span>{t('seller_dashboard.cost_of_goods')}</span><span>TZS {fmt(data.costOfGoods)}</span>
        </div>
      )}
      {data.costOfGoods > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: DK, marginBottom: 14 }}>
          <span>{t('seller_dashboard.gross_profit')}</span><span>TZS {fmt(data.grossProfit)}</span>
        </div>
      )}

      {/* Low stock */}
      {data.lowStock?.length > 0 && (
        <div style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', marginBottom: 6 }}>
            ⚠️ {t('seller_dashboard.low_stock_title', { count: data.lowStock.length })}
          </div>
          {data.lowStock.slice(0, 4).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#991B1B', padding: '2px 0' }}>
              <span>{p.name}</span><span style={{ fontWeight: 700 }}>{t('seller_products.stock_label', { count: p.stock })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Best sellers */}
      {data.bestSellers?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: DK, marginBottom: 6 }}>{t('seller_dashboard.best_sellers_title')}</div>
          {data.bestSellers.slice(0, 5).map((p, i) => (
            <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: DK }}>{i + 1}. {p.name}</span>
              <span style={{ color: GR, fontWeight: 700 }}>{t('seller_dashboard.units_sold', { count: p.unitsSold })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SellerDashboard = ({ onNavigate, isLoggedIn, onLogout, userRole, onOpenMoment, currentUser, activeProfileId }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = LOCALE_MAP[i18n.language] || 'en-GB';
  const [data, setData]                       = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');
  const [profile, setProfile]                 = useState(null);
  const [profileStatus, setProfileStatus]     = useState(null);
  const [invoiceRequests, setInvoiceRequests] = useState([]);
  const [showCreateInvoice, setShowCreateInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm]         = useState({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceMessage, setInvoiceMessage]   = useState('');
  const [vanStatus, setVanStatus]             = useState(null);
  const [posDashboard, setPosDashboard]       = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchData();
    // Re-fetch when the active profile changes — otherwise switching from
    // Business A to Business B while already on this page keeps showing
    // Business A's stats until a manual reload.
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verification status is a trust/privilege signal now, not a gate on
  // reaching your own seller data — every fetch below runs for every user
  // regardless of profileStatus, each independently error-handled so a
  // brand-new account with no SellerProfile/no activity yet just sees
  // zero-value stats instead of losing the whole page.
  const fetchData = async () => {
    try {
      setLoading(true);

      try {
        const profileRes = await api.get('/seller/my-profile');
        setProfile(profileRes.data);
        setProfileStatus(profileRes.data.status);
      } catch (err) {
        if (err?.response?.status === 404) setProfileStatus('not_applied');
        else throw err;
      }

      try {
        // Scopes stats to whichever profile is currently active — without
        // this, an account running more than one business always saw every
        // business's data merged together (profile-architecture-audit-
        // 2026-08 Stage 6).
        const dashRes = await api.get('/seller/dashboard', {
          params: activeProfileId ? { commerceProfileId: activeProfileId } : {},
        });
        setData(dashRes.data);
      } catch { setData(null); }
      try {
        const invoiceRes = await api.get('/classifieds/invoices/seller-requests');
        setInvoiceRequests(invoiceRes.data);
      } catch { setInvoiceRequests([]); }
      try {
        const vanRes = await api.get('/daily-batches/manifest/today');
        setVanStatus(vanRes.data);
      } catch { setVanStatus(null); }
      try {
        const posRes = await api.get('/sales/dashboard');
        setPosDashboard(posRes.data);
      } catch { setPosDashboard(null); }
    } catch (err) {
      setError(t('seller_dashboard.could_not_load'));
    } finally { setLoading(false); }
  };

  const handleCreateInvoice = async (requestId) => {
    if (!invoiceForm.amount || !invoiceForm.invoiceDescription) {
      setError(t('seller_dashboard.amount_desc_required')); return;
    }
    try {
      setCreatingInvoice(true);
      const res = await api.post(`/classifieds/invoices/${requestId}/create`, {
        amount: Number(invoiceForm.amount),
        invoiceDescription: invoiceForm.invoiceDescription,
        sellerNotes: invoiceForm.sellerNotes,
        dueDays: Number(invoiceForm.dueDays),
      });
      setInvoiceMessage(`✅ ${t('seller_dashboard.invoice_sent', { number: res.data.invoiceNumber })}`);
      setShowCreateInvoice(null);
      setInvoiceForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 });
      fetchData();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_dashboard.could_not_create_invoice'));
    } finally { setCreatingInvoice(false); }
  };

  const statusConfig = {
    pending:     { icon: '⏳', title: t('seller_dashboard.status_pending_title'), desc: t('seller_dashboard.status_pending_desc'), color: '#D97706', bg: '#FEF9C3' },
    approved:    { icon: '✅', title: t('seller_dashboard.status_approved_title'), desc: t('seller_dashboard.status_approved_desc'),                                              color: GN,        bg: '#DCFCE7' },
    rejected:    { icon: '❌', title: t('seller_dashboard.status_rejected_title'), desc: t('seller_dashboard.status_rejected_reason', { reason: profile?.rejectionReason || t('seller_dashboard.not_specified') }),                            color: '#DC2626',  bg: '#FEE2E2' },
    suspended:   { icon: '🚫', title: t('seller_dashboard.status_suspended_title'), desc: t('seller_dashboard.status_suspended_reason', { reason: profile?.rejectionReason || t('seller_dashboard.contact_support') }),                          color: '#DC2626',  bg: '#FEE2E2' },
    not_applied: { icon: '🏪', title: t('seller_dashboard.unlock_title'), desc: t('seller_dashboard.unlock_desc'),                                  color: PU,         bg: '#EDE9FE' },
  };

  const statusInfo  = statusConfig[profileStatus] || statusConfig['not_applied'];
  const displayName = profile?.storeName || profile?.businessName || t('seller_dashboard.your_business');
  const inputStyle  = { width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' };

  const vanBatch     = vanStatus?.batch;
  const vanParcels   = vanStatus?.totalParcels || 0;
  const vanCutoff    = vanBatch ? new Date(vanBatch.cutoffTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : null;
  const vanDeparts   = vanBatch ? new Date(vanBatch.plannedDepartureTime).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : null;

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <BackBar onBack={() => onNavigate('MyProfile')} title={t('seller_dashboard.badge')} top={0} />
      <div style={{ textAlign: 'center', padding: 80, color: GR }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>{t('seller_dashboard.loading')}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#F8FAFC', fontFamily: "'Inter','Segoe UI',sans-serif",
      paddingBottom: 90 }}>
      <BackBar onBack={() => onNavigate('MyProfile')} title={t('seller_dashboard.badge')} top={0} />
      <FeatureTour tourKey="seller_dashboard_orientation" autoStart />

      {/* ── Identity header ── */}
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9', padding: '18px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: GR, marginBottom: 2 }}>
              🏪 {t('seller_dashboard.badge')}
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 900, color: DK, margin: 0 }}>{displayName}</h1>
          </div>
          {profileStatus === 'approved' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ backgroundColor: '#DCFCE7', color: GN, padding: '5px 12px',
                borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                ✅ {t('seller_dashboard.approved')}
              </span>
              <button onClick={() => onNavigate('StoreSettings')}
                style={{ backgroundColor: '#F1F5F9', color: DK, border: 'none',
                  padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 11, fontWeight: 800 }}>
                ✏️ {t('seller_dashboard.edit_store')}
              </button>
              <TourTrigger tourKey="seller_dashboard_orientation" />
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 16px 32px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {error && (
          <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '12px 14px',
            borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Verification is a trust/privilege upgrade, not a gate — this banner
            sits ALONGSIDE the real dashboard below, never instead of it. */}
        {profileStatus !== 'approved' && (
          <div style={{ backgroundColor: statusInfo.bg, borderRadius: 14, padding: '14px 16px',
            marginBottom: 16, border: `1px solid ${statusInfo.color}30`,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 26, flexShrink: 0 }}>{statusInfo.icon}</div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: statusInfo.color,
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                {t('seller_dashboard.not_verified_badge')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: DK, marginBottom: 2 }}>{statusInfo.title}</div>
              <div style={{ fontSize: 12, color: GR, lineHeight: 1.5 }}>{statusInfo.desc}</div>
            </div>
            <button onClick={() => onNavigate('BecomeSeller')}
              style={{ background: `linear-gradient(135deg,${B},${PU})`, color: WH, border: 'none',
                padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                flexShrink: 0, whiteSpace: 'nowrap' }}>
              {t('seller_dashboard.verify_now')}
            </button>
          </div>
        )}

        {data && (
          <>
            {profile && !profile.phone && <PhoneNudgeBanner userId={currentUser?.id} onSaved={fetchData} />}
            <ProfileCompletionBanner profile={profile} onNavigate={onNavigate} />

            {/* ── Van Today banner ── */}
            {vanBatch && (
              <div onClick={() => onNavigate('VanToday')}
                style={{ background: `linear-gradient(135deg,#1E1B4B,${B})`, borderRadius: 14,
                  padding: '14px 16px', marginBottom: 16, cursor: 'pointer', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#A5B4FC', marginBottom: 4 }}>
                    🚐 {t('seller_dashboard.van_today')}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: WH }}>
                    {vanParcels} {t('seller_dashboard.parcels')}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 400, marginLeft: 8 }}>
                      {t('seller_dashboard.cutoff')}: {vanCutoff} · {t('seller_dashboard.departs')}: {vanDeparts}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                  backgroundColor: PU, color: WH }}>
                  {t('seller_dashboard.view')} →
                </div>
              </div>
            )}

            {/* ── Quick Actions — 4 live numbers, not decoration ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: t('seller_dashboard.products'), value: fmt(data.stats.totalProducts),  icon: '📦', color: B,  bg: '#EFF6FF', page: 'SellerProducts' },
                { label: t('seller_dashboard.listings'), value: fmt(data.stats.totalClassifieds), icon: '🏷️', color: '#EA580C', bg: '#FFF7ED', page: 'SellerClassifieds' },
                { label: t('seller_dashboard.orders'),   value: fmt(data.stats.totalOrders),    icon: '🛒', color: PU, bg: '#F5F3FF', page: 'SellerOrders' },
                { label: t('seller_dashboard.revenue'),  value: `${fmt(data.stats.totalRevenue)}`, icon: '💰', color: GN, bg: '#F0FDF4', page: 'SellerAnalytics' },
              ].map(s => (
                <button key={s.label} onClick={() => onNavigate(s.page)}
                  style={{ backgroundColor: s.bg, border: 'none', borderRadius: 14,
                    padding: '12px 8px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: s.color, wordBreak: 'break-word' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: GR, marginTop: 1, fontWeight: 700 }}>{s.label}</div>
                </button>
              ))}
            </div>

            {/* ── Menu — vertical list, Instagram-Settings style ── */}
            <div style={{ backgroundColor: WH, borderRadius: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 16 }}>
              {/* Universal — no verification required, matches classifieds'
                  own access model (peer-to-peer selling, ownership-based). */}
              <MenuRow t={t} icon="📸" label={t('seller_dashboard.share_moment')} onClick={() => onOpenMoment?.('selling')} />
              <MenuRow t={t} icon="🏷️" label={t('seller_dashboard.my_listings')} onClick={() => onNavigate('SellerClassifieds')} dataTour="sd-menu-listings" />
              <MenuRow t={t} icon="🛒" label={t('seller_dashboard.orders')} onClick={() => onNavigate('SellerOrders')} dataTour="sd-menu-orders" />
              <MenuRow t={t} icon="👥" label={t('seller_dashboard.customers')} onClick={() => onNavigate('SellerCustomers')} />
              <MenuRow t={t} icon="💬" label={t('seller_dashboard.inbox')} onClick={() => onNavigate('SellerInbox')} />
              <MenuRow t={t} icon="📦" label={t('seller_dashboard.ship_item')} onClick={() => onNavigate('SellerShipment')} />
              <MenuRow t={t} icon="🧾" label={t('seller_dashboard.invoices')} value={invoiceRequests.filter(r=>r.status==='pending').length > 0 ? t('seller_dashboard.pending_count', { count: invoiceRequests.filter(r=>r.status==='pending').length }) : null} onClick={() => onNavigate('SellerInvoices')} dataTour="sd-menu-invoices" />

              {/* Verified-only — a formal product catalog, logistics and
                  business tooling. Never hidden (per the "encourage upgrade,
                  don't block" principle) — routes to Verify Now instead. */}
              <MenuRow t={t} icon="📦" label={t('seller_dashboard.my_products')} onClick={() => onNavigate('SellerProducts')} dataTour="sd-menu-products"
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="🚐" label={t('seller_dashboard.van_today')} value={vanParcels > 0 ? `${vanParcels} ${t('seller_dashboard.parcels')}` : null} onClick={() => onNavigate('VanToday')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="💸" label={t('seller_dashboard.payouts')} onClick={() => onNavigate('SellerPayouts')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="👛" label={t('seller_dashboard.wallet')} onClick={() => onNavigate('SellerWallet')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="📊" label={t('seller_dashboard.analytics')} onClick={() => onNavigate('SellerAnalytics')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="👥" label={t('seller_dashboard.my_team')} onClick={() => onNavigate('SellerTeam')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="🌐" label={t('seller_dashboard.public_profile')} onClick={() => onNavigate('CommerceProfile')}
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
              <MenuRow t={t} icon="🏪" label={t('seller_dashboard.store_settings')} onClick={() => onNavigate('StoreSettings')} last
                locked={profileStatus !== 'approved'} onLockedClick={() => onNavigate('BecomeSeller')} />
            </div>

            {/* Recent Orders */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🛒 {t('seller_dashboard.recent_orders')}</h2>
                <button onClick={() => onNavigate('SellerOrders')}
                  style={{ backgroundColor: '#EDE9FE', color: PU, border: 'none', padding: '6px 12px',
                    borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  {t('seller_dashboard.view_all')} →
                </button>
              </div>

              <RevenueChart orders={data.recentOrders} />

              <BisCommerceDashboard data={posDashboard} onNavigate={onNavigate} t={t} />

              {data.recentOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🛒</div>
                  <p style={{ fontSize: 13 }}>{t('seller_dashboard.no_orders_yet')}</p>
                </div>
              ) : (
                data.recentOrders.map(order => (
                  <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10,
                    marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DK,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        #{order.id} — {order.product?.name || order.manualProductName || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: GR }}>
                        {order.recipientName || order.buyer?.name || order.manualBuyerName || '—'} · {new Date(order.createdAt).toLocaleDateString(dateLocale)}
                      </div>
                      {order.shippingMethod === 'kentexa_delivery' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: PU }}>🚐 {t('seller_dashboard.kentexa_van')}</span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: PU }}>TZS {fmt(order.totalAmount)}</div>
                      {(() => {
                        const badge =
                          ['delivered', 'completed'].includes(order.status)  ? { bg: '#DCFCE7', fg: GN } :
                          order.status === 'paid'                            ? { bg: '#DBEAFE', fg: B } :
                          ['disputed', 'cancelled'].includes(order.status)   ? { bg: '#FEE2E2', fg: '#DC2626' } :
                          { bg: '#FEF9C3', fg: '#CA8A04' };
                        return (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            backgroundColor: badge.bg, color: badge.fg }}>
                            {order.status}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Invoice Requests */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: '0 0 4px' }}>🧾 {t('seller_dashboard.invoice_requests_title')}</h2>
              <p style={{ fontSize: 12, color: GR, margin: '0 0 14px' }}>{t('seller_dashboard.invoice_requests_subtitle')}</p>

              {invoiceMessage && (
                <div style={{ backgroundColor: '#DCFCE7', color: GN, padding: '10px 14px', borderRadius: 8,
                  marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
                  {invoiceMessage}
                  <button onClick={() => setInvoiceMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: GN, fontWeight: 'bold' }}>×</button>
                </div>
              )}

              {invoiceRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 28, color: '#94A3B8' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
                  <p style={{ fontSize: 13 }}>{t('seller_dashboard.no_invoice_requests')}</p>
                </div>
              ) : (
                invoiceRequests.map(req => (
                  <div key={req.id} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
                    marginBottom: 10, border: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: DK, marginBottom: 2 }}>{req.classifiedTitle}</div>
                        <div style={{ fontSize: 11, color: GR }}>{t('seller_dashboard.from')}: <strong>{req.buyerName}</strong></div>
                        {req.buyerPhone && <div style={{ fontSize: 11, color: GR }}>📞 {req.buyerPhone}</div>}
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                          {t('seller_dashboard.listing_price')}: TZS {fmt(req.listingPrice)}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, flexShrink: 0,
                        backgroundColor: req.status === 'pending' ? '#FEF9C3' : req.status === 'sent' ? '#DBEAFE' : req.status === 'paid' ? '#DCFCE7' : '#FEE2E2',
                        color: req.status === 'pending' ? '#CA8A04' : req.status === 'sent' ? B : req.status === 'paid' ? GN : '#DC2626' }}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>

                    {req.status === 'sent' && req.invoiceNumber && (
                      <div style={{ backgroundColor: '#DBEAFE', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
                        <strong>{t('seller_dashboard.invoice_label')}:</strong> {req.invoiceNumber} · TZS {fmt(req.amount)}
                      </div>
                    )}
                    {req.status === 'paid' && (
                      <div style={{ backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10, fontSize: 12, color: GN, fontWeight: 600 }}>
                        ✅ {t('seller_dashboard.paid_label')} — TZS {fmt(req.amount)}
                      </div>
                    )}

                    {req.status === 'pending' && showCreateInvoice === req.id && (
                      <div style={{ backgroundColor: WH, borderRadius: 10, padding: 14, marginTop: 10, border: `2px solid ${B}` }}>
                        <h4 style={{ fontSize: 13, fontWeight: 800, color: DK, margin: '0 0 12px' }}>{t('seller_dashboard.create_invoice_for', { name: req.buyerName })}</h4>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('seller_dashboard.amount_tzs')}</label>
                          <input type="number" placeholder={String(req.listingPrice)} value={invoiceForm.amount}
                            onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, color: GR, marginBottom: 4, fontWeight: 600 }}>{t('seller_dashboard.invoice_description')}</label>
                          <input placeholder={t('seller_dashboard.invoice_description_placeholder')} value={invoiceForm.invoiceDescription}
                            onChange={e => setInvoiceForm({ ...invoiceForm, invoiceDescription: e.target.value })} style={inputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setShowCreateInvoice(null); setInvoiceForm({ amount: '', invoiceDescription: '', sellerNotes: '', dueDays: 3 }); }}
                            style={{ flex: 1, backgroundColor: '#F1F5F9', color: GR, border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>{t('seller_dashboard.cancel')}</button>
                          <button onClick={() => handleCreateInvoice(req.id)} disabled={creatingInvoice}
                            style={{ flex: 2, background: creatingInvoice ? '#A5B4FC' : `linear-gradient(135deg,${B},${PU})`, color: WH, border: 'none', padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                            {creatingInvoice ? '⏳' : `📤 ${t('seller_dashboard.send_invoice')}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {req.status === 'pending' && showCreateInvoice !== req.id && (
                      <button onClick={() => { setShowCreateInvoice(req.id); setInvoiceForm({ amount: String(req.listingPrice || ''), invoiceDescription: req.classifiedTitle, sellerNotes: '', dueDays: 3 }); }}
                        style={{ backgroundColor: B, color: WH, border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                        🧾 {t('seller_dashboard.create_invoice')}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Business Profile summary */}
            <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, color: DK, margin: 0 }}>🏪 {t('seller_dashboard.business_profile_title')}</h2>
                <button onClick={() => onNavigate('StoreSettings')}
                  style={{ backgroundColor: '#EDE9FE', color: PU, border: 'none', padding: '6px 12px',
                    borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  ✏️ {t('seller_dashboard.edit')}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: t('seller_dashboard.store_name'),    value: profile?.storeName || t('seller_dashboard.not_set') },
                  { label: t('seller_dashboard.business_name'), value: profile?.businessName || t('seller_dashboard.not_available') },
                  { label: t('seller_dashboard.phone'),         value: profile?.phone || t('seller_dashboard.not_available') },
                  { label: t('seller_dashboard.address'),       value: profile?.businessLocation || profile?.address || t('seller_dashboard.not_available') },
                ].map(item => (
                  <div key={item.label} style={{ padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: GR, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700,
                      color: item.value?.startsWith?.('—') ? '#94A3B8' : DK,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SellerDashboard;