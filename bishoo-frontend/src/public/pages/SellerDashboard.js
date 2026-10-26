import React, { useEffect, useState } from 'react';
import { actorLabelParts } from '../utils/publicActor';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import PhoneNudgeBanner from '../components/PhoneNudgeBanner';
import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
import api from '../../api/api';
import SellerLipaNambaCard from '../components/SellerLipaNambaCard';
import SellerPartnerAgentsCard from '../components/SellerPartnerAgentsCard';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';
import { PageLoading } from '../components/Loading';
import { nextStep, isManualOrder, shortWhen } from './SellerOrders';

// The seller's home (owner 2026-10-27, approved mockup): who you are, today's numbers,
// what to do next, paid money this week, the latest orders, and every tool in four groups.
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const fmt = (n) => Number(n || 0).toLocaleString();

const Svg = ({ d, size = 22, color = INK, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const I = {
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01', cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0114 0v1M16 3.3a4 4 0 010 7.4M22 21v-1a6 6 0 00-4-5.6',
  chat: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', truck: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H3zM3 7l12-4v4M17 13h.01', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  money: 'M3 6h18v12H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 9v.01M18 15v.01', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-2.6-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 010-4h.1a1.6 1.6 0 001.1-2.6l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V3a2 2 0 014 0v.1a1.6 1.6 0 002.6 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  till: 'M4 4h16v6H4zM6 10v10h12V10M9 14h6M8 7h.01', lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11',
  chev: 'M9 6l6 6-6 6', check: 'M8 12.2l2.7 2.7L16.2 9.4',
};
const TONE = { blue: ['#eff6ff', BLUE], amber: ['#fffbeb', '#92400e'], red: ['#fef2f2', '#b91c1c'], green: ['#ecfdf3', '#166534'], muted: ['#f7f9f9', MUTED] };

const Section = ({ title, right, children, testId }) => (
  <section data-testid={testId} style={{ borderTop: `8px solid #f7f9f9`, padding: '16px 0 4px' }}>
    {(title || right) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 16px 6px', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>{right}
      </div>
    )}
    {children}
  </section>
);

const Row = ({ icon, label, value, onClick, locked, onLocked, dataTour, testId }) => (
  <button type="button" onClick={locked ? onLocked : onClick} data-tour={dataTour} data-testid={testId}
    style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 16px', border: 'none', background: 'none',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: locked ? MUTED : INK }}>
    <Svg d={locked ? I.lock : icon} color={locked ? '#8b98a5' : INK} />
    <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{label}</span>
    {locked ? <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Thibitisha</span>
      : value ? <span style={{ fontSize: 13, color: MUTED }}>{value}</span> : null}
    <Svg d={I.chev} size={16} color="#8b98a5" />
  </button>
);

const WEEKDAY = ['Jpi', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Iji', 'Jms'];

/** Paid money for the last 7 days, from the server's paid-only totals (never unpaid or cancelled orders). */
export const weekBars = (paidLast7Days, today = new Date()) => {
  const byDay = Object.fromEntries((paidLast7Days || []).map((d) => [d.day, Number(d.revenue) || 0]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, label: i === 6 ? 'Leo' : WEEKDAY[d.getDay()], revenue: byDay[key] || 0, today: i === 6 };
  });
};

const SellerDashboard = ({ onNavigate, isLoggedIn, onOpenMoment, currentUser, activeProfileId, activeProfile }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [invoiceRequests, setInvoiceRequests] = useState([]);
  const [posDashboard, setPosDashboard] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchData();
    // Re-fetch when the active business changes, so its own numbers show.
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verification is a trust upgrade, not a gate: every fetch runs for every seller and each
  // fails on its own, so a new account sees zeros instead of losing the page.
  const fetchData = async () => {
    const scope = { params: activeProfileId ? { commerceProfileId: activeProfileId } : {} };
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
      try { setData((await api.get('/seller/dashboard', scope)).data); } catch { setData(null); }
      try { setInvoiceRequests((await api.get('/classifieds/invoices/seller-requests', scope)).data || []); } catch { setInvoiceRequests([]); }
      try { setPosDashboard((await api.get('/sales/dashboard')).data); } catch { setPosDashboard(null); }
    } catch {
      setError(t('seller_dashboard.could_not_load'));
    } finally { setLoading(false); }
  };

  const verified = profileStatus === 'approved';
  const go = (page) => () => onNavigate(page);
  const toVerify = () => onNavigate('BecomeSeller');

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
      <BackBar onBack={() => onNavigate('MyProfile')} title="Dashibodi" top={0} />
      <PageLoading label="Inapakia dashibodi" />
    </div>
  );

  // ── The identity this dashboard is for ──────────────────────────────────────
  const actorParts = actorLabelParts(activeProfile, t);
  const displayName = activeProfile?.actorKind ? activeProfile.displayName
    : (activeProfile?.displayName || profile?.storeName || profile?.businessName || 'Biashara yako');
  const photo = activeProfile?.photoUrl;
  const subtitle = [actorParts?.subtitle || 'Muuzaji', activeProfile?.location].filter(Boolean).join(' · ');

  // ── Numbers: only what the server counted ───────────────────────────────────
  const stats = data?.stats || {};
  const totals = data?.totals || null;
  const toSend = totals ? totals.toSend : Number(stats.needsShipping || 0);
  const pendingInvoices = invoiceRequests.filter((r) => r.status === 'pending').length;
  const lowStock = posDashboard?.lowStock || [];
  const channels = posDashboard?.today?.byChannel || {};
  const todayParts = [['local_pos', 'Duka'], ['kentexa_online', 'Mtandaoni'], ['manual', 'Mkono']]
    .filter(([k]) => Number(channels[k]) > 0).map(([k, l]) => `${l} ${fmt(channels[k])}`);
  const hasActivity = Number(stats.totalOrders || 0) > 0 || Number(stats.totalProducts || 0) > 0 || Number(stats.totalClassifieds || 0) > 0;

  const tiles = [
    { label: 'Leo', value: `TZS ${fmt(posDashboard?.grossSales)}`, sub: todayParts.join(' · ') || 'Mauzo ya leo', page: 'POS', tour: 'sd-commerce-header' },
    { label: 'Maagizo', value: fmt(stats.totalOrders), sub: toSend ? `${toSend} ya kutuma` : 'Yote', page: 'SellerOrders' },
    { label: 'Bidhaa', value: fmt(stats.totalProducts), sub: `${fmt(stats.activeProducts)} ziko sokoni`, page: 'SellerProducts' },
    { label: 'Matangazo', value: fmt(stats.totalClassifieds), sub: 'Yako yote', page: 'SellerClassifieds' },
  ];

  const todo = [
    toSend > 0 && { icon: I.truck, tone: 'blue', title: toSend === 1 ? 'Agizo 1 linasubiri kutumwa' : `Maagizo ${toSend} yanasubiri kutumwa`, sub: 'Yatume kwa wateja', page: 'SellerOrders' },
    pendingInvoices > 0 && { icon: I.doc, tone: 'amber', title: pendingInvoices === 1 ? 'Ombi 1 la ankara' : `Maombi ${pendingInvoices} ya ankara`, sub: 'Wanunuzi wanasubiri ankara', page: 'SellerInvoices' },
    lowStock.length > 0 && { icon: I.alert, tone: 'red', title: lowStock.length === 1 ? 'Bidhaa 1 inakaribia kuisha' : `Bidhaa ${lowStock.length} zinakaribia kuisha`, sub: `${lowStock[0].name} imebaki ${lowStock[0].stock}`, page: 'SellerProducts' },
  ].filter(Boolean);

  const bars = weekBars(totals?.paidLast7Days);
  const weekTotal = bars.reduce((s, b) => s + b.revenue, 0);
  const maxBar = Math.max(...bars.map((b) => b.revenue), 1);
  const recent = (data?.recentOrders || []).slice(0, 5);

  const groups = [
    { title: 'Uza', rows: [
      { icon: I.camera, label: 'Weka Moment', onClick: () => onOpenMoment?.('selling') },
      { icon: I.tag, label: 'Matangazo yangu', value: stats.totalClassifieds ? fmt(stats.totalClassifieds) : '', page: 'SellerClassifieds', tour: 'sd-menu-listings' },
      { icon: I.box, label: 'Bidhaa zangu', value: stats.totalProducts ? fmt(stats.totalProducts) : '', page: 'SellerProducts', tour: 'sd-menu-products', locked: !verified },
      { icon: I.till, label: 'Duka (POS)', page: 'POS', tour: 'sd-open-pos' },
      { icon: I.truck, label: 'Tuma mzigo', page: 'SellerShipment' },
      { icon: I.star, label: 'Chapa zangu', page: 'MyBrands', locked: !verified },
    ] },
    { title: 'Wateja', rows: [
      { icon: I.cart, label: 'Maagizo', value: toSend ? `${toSend} ya kutuma` : '', page: 'SellerOrders', tour: 'sd-menu-orders' },
      { icon: I.people, label: 'Wateja', page: 'SellerCustomers' },
      { icon: I.chat, label: 'Ujumbe', page: 'SellerInbox' },
      { icon: I.doc, label: 'Ankara', value: pendingInvoices ? `${pendingInvoices} zinasubiri` : '', page: 'SellerInvoices', tour: 'sd-menu-invoices' },
      { icon: I.shield, label: 'Madai ya dhamana', page: 'SellerWarrantyClaims' },
    ] },
    { title: 'Pesa na takwimu', rows: [
      { icon: I.money, label: 'Malipo', page: 'SellerPayouts', locked: !verified },
      { icon: I.wallet, label: 'Pochi', page: 'SellerWallet', locked: !verified },
      { icon: I.chart, label: 'Takwimu', page: 'SellerAnalytics', locked: !verified },
    ] },
    { title: 'Biashara', rows: [
      { icon: I.people, label: 'Timu yangu', page: 'SellerTeam', locked: !verified },
      { icon: I.globe, label: 'Ukurasa wa umma', page: 'CommerceProfile', locked: !verified },
      { icon: I.gear, label: 'Mipangilio ya duka', page: 'StoreSettings', locked: !verified },
    ] },
  ];

  const statusNote = {
    pending: ['Ombi lako linakaguliwa', 'Tutakujulisha likikamilika.'],
    rejected: ['Ombi halikukubaliwa', profile?.rejectionReason ? `Sababu: ${profile.rejectionReason}` : 'Wasiliana na KenteXa kujua zaidi.'],
    suspended: ['Akaunti imesimamishwa', profile?.rejectionReason ? `Sababu: ${profile.rejectionReason}` : 'Wasiliana na KenteXa.'],
  }[profileStatus];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fff', color: INK, paddingBottom: 90 }}>
      <BackBar onBack={() => onNavigate('MyProfile')} title="Dashibodi" top={0} right={verified ? <TourTrigger tourKey="seller_dashboard_orientation" /> : null} />
      <FeatureTour tourKey="seller_dashboard_orientation" autoStart />

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Identity */}
        <section data-testid="dash-identity" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          {photo ? <img src={photo} alt="" style={{ width: 56, height: 56, borderRadius: 28, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ width: 56, height: 56, borderRadius: 28, background: INK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{String(displayName).trim().charAt(0).toUpperCase()}</span>}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <strong style={{ fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</strong>
              {activeProfile?.isVerified && (
                <svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink: 0 }}>
                  <path fill="#1d9bf0" d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1-3-1-3 2.8-1.6.9-3.1 3.2.3z" />
                  <path d={I.check} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span style={{ fontSize: 14, color: MUTED }}>{subtitle}</span>
            {activeProfile?.actorKind === 'PERSONAL_OPERATIONAL' && activeProfile?.roleType === 'seller' && (
              <button type="button" onClick={go('ConnectSelling')} style={{ alignSelf: 'flex-start', marginTop: 4, background: 'none', border: 'none', padding: 0, color: BLUE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('actor_label.connect_button')}
              </button>
            )}
          </span>
          {verified && (
            <button type="button" onClick={go('StoreSettings')} style={{ height: 36, padding: '0 14px', borderRadius: 18, border: '1px solid #cfd9de', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: INK }}>Hariri</button>
          )}
        </section>

        {error && <div role="alert" style={{ margin: '0 16px 12px', backgroundColor: '#fef2f2', color: '#b91c1c', padding: '12px 14px', borderRadius: 12, fontSize: 14 }}>{error}</div>}

        {/* Not verified yet: an upgrade, beside the dashboard, never instead of it */}
        {!verified && (
          <section data-testid="verify-card" style={{ margin: '0 16px 16px', padding: 16, borderRadius: 16, background: '#eff6ff', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Svg d={I.shield} size={20} color={BLUE} />
              <strong style={{ fontSize: 16 }}>{statusNote ? statusNote[0] : 'Thibitisha biashara yako'}</strong>
            </span>
            <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>
              {statusNote ? statusNote[1] : 'Wanunuzi wanaamini muuzaji aliyethibitishwa. Utaweza pia kuweka bidhaa dukani, kupokea malipo na kuona takwimu.'}
            </span>
            {profileStatus !== 'pending' && (
              <button type="button" onClick={toVerify} style={{ alignSelf: 'flex-start', height: 40, padding: '0 18px', borderRadius: 20, background: BLUE, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Thibitisha sasa</button>
            )}
          </section>
        )}

        {profile && !profile.phone && <PhoneNudgeBanner userId={currentUser?.id} onSaved={fetchData} />}
        <ProfileCompletionBanner profile={profile} onNavigate={onNavigate} />
        {profile && <SellerLipaNambaCard profile={profile} onSaved={(d) => setProfile((p) => ({ ...p, ...d }))} />}

        {hasActivity ? (
          <>
            <section data-testid="dash-tiles" style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {tiles.map((s) => (
                <button key={s.label} type="button" onClick={go(s.page)} data-tour={s.tour}
                  style={{ padding: 14, border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: INK, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>{s.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</span>
                </button>
              ))}
            </section>

            {todo.length > 0 && (
              <Section title="Kazi za kufanya" testId="dash-todo">
                {todo.map((x) => (
                  <button key={x.title} type="button" onClick={go(x.page)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
                    <span style={{ width: 40, height: 40, borderRadius: 20, background: TONE[x.tone][0], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Svg d={x.icon} size={20} color={TONE[x.tone][1]} />
                    </span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 15 }}>{x.title}</strong><span style={{ fontSize: 13, color: MUTED }}>{x.sub}</span></span>
                    <Svg d={I.chev} size={16} color="#8b98a5" />
                  </button>
                ))}
              </Section>
            )}

            <Section title="Mapato yaliyolipwa, siku 7" testId="dash-week" right={<strong style={{ fontSize: 15 }}>TZS {fmt(weekTotal)}</strong>}>
              <div role="img" aria-label={`Mapato yaliyolipwa siku 7: TZS ${fmt(weekTotal)}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 112, padding: '8px 16px 12px' }}>
                {bars.map((b) => (
                  <span key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ width: '100%', height: Math.max(4, Math.round((b.revenue / maxBar) * 80)), borderRadius: 6, background: b.today ? BLUE : b.revenue ? '#bfdbfe' : LINE }} />
                    <span style={{ fontSize: 12, color: b.today ? INK : MUTED, fontWeight: b.today ? 800 : 400 }}>{b.label}</span>
                  </span>
                ))}
              </div>
            </Section>

            <Section title="Maagizo ya karibuni" testId="dash-recent" right={<button type="button" onClick={go('SellerOrders')} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Yote</button>}>
              {recent.length === 0 ? <div style={{ padding: '8px 16px 16px', fontSize: 14, color: MUTED }}>Bado huna maagizo.</div> : recent.map((o) => {
                const step = nextStep(o);
                return (
                  <button key={o.id} type="button" onClick={() => onNavigate(`SellerOrders-${o.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.productNameSnapshot || o.product?.name || o.manualProductName || 'Bidhaa'}</strong>
                      <span style={{ fontSize: 13, color: MUTED }}>{[o.recipientName || o.buyer?.name || o.manualBuyerName, shortWhen(o.createdAt), isManualOrder(o) ? 'Mauzo yangu' : 'Sokoni'].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <strong style={{ fontSize: 15 }}>TZS {fmt(o.totalAmount)}</strong>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TONE[step.tone][1] }}>{step.label}</span>
                    </span>
                  </button>
                );
              })}
            </Section>
          </>
        ) : (
          <Section title="Anza kuuza" testId="dash-start">
            <div style={{ padding: '0 16px 8px', fontSize: 14, color: MUTED }}>Bado huna maagizo. Hatua hizi zitakusaidia kupata mteja wa kwanza.</div>
            {[
              ['Weka tangazo la kwanza', 'Picha, bei na mahali ulipo', go('SellerClassifieds')],
              ['Weka Moment', 'Waonyeshe wateja unachofanya leo', () => onOpenMoment?.('selling')],
              ['Ongeza namba ya simu', 'Wanunuzi wakupigie moja kwa moja', go('StoreSettings')],
            ].map(([title, sub, onClick], i) => (
              <button key={title} type="button" onClick={onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`, background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: INK }}>
                <span style={{ width: 28, height: 28, borderRadius: 14, border: '2px solid #cfd9de', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: MUTED, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><strong style={{ fontSize: 15 }}>{title}</strong><span style={{ fontSize: 13, color: MUTED }}>{sub}</span></span>
                <Svg d={I.chev} size={16} color="#8b98a5" />
              </button>
            ))}
          </Section>
        )}

        <div style={{ padding: '0 16px' }}><SellerPartnerAgentsCard /></div>

        <section data-testid="dash-menu" style={{ borderTop: '8px solid #f7f9f9', padding: '8px 0' }}>
          {groups.map((g) => (
            <div key={g.title} style={{ padding: '8px 0' }}>
              <div style={{ padding: '8px 16px 4px', fontSize: 13, fontWeight: 700, color: MUTED }}>{g.title}</div>
              {g.rows.map((r) => (
                <Row key={r.label} icon={r.icon} label={r.label} value={r.value} dataTour={r.tour} testId={`menu-${r.page || 'moment'}`}
                  onClick={r.onClick || go(r.page)} locked={r.locked} onLocked={toVerify} />
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default SellerDashboard;
