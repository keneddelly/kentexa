/**
 * MyProfile.js — KenteXa Commerce Identity
 * Place at: src/public/pages/MyProfile.js
 *
 * Complete identity hub with all 9 sections:
 * Identity · Roles · Businesses · Commerce · Logistics · Finance · Reputation · Communication · Settings
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import VerifyIdentityModal from '../components/VerifyIdentityModal';

const B   = '#2563EB';
const DK  = '#0F172A';
const GR  = '#64748B';
const WH  = '#FFFFFF';

const fmt  = n => Number(n||0).toLocaleString();
const fmtD = d => d ? new Date(d).toLocaleDateString('sw-TZ') : '—';

const getTiers = t => [
  { min:900, name:t('my_profile.tier_elite'),   icon:'🏆', color:'#DC2626', bg:'#FEE2E2' },
  { min:600, name:t('my_profile.tier_partner'), icon:'💎', color:'#7C3AED', bg:'#EDE9FE' },
  { min:300, name:t('my_profile.tier_loyal'),   icon:'🌟', color:B,          bg:'#DBEAFE' },
  { min:100, name:t('my_profile.tier_trusted'), icon:'⭐', color:'#16A34A',  bg:'#DCFCE7' },
  { min:0,   name:t('my_profile.tier_new'),     icon:'🌱', color:GR,         bg:'#F1F5F9' },
];

const getRoleMeta = t => ({
  user:               { icon:'👤', label:t('my_profile.role_buyer'),            color:'#475569', bg:'#F1F5F9' },
  seller:             { icon:'🏪', label:t('my_profile.role_seller'),           color:B,          bg:'#EFF6FF' },
  agent:              { icon:'🏍️', label:t('my_profile.role_agent'),            color:'#A21CAF',  bg:'#FDF2F8' },
  super_agent:        { icon:'🏢', label:t('my_profile.role_super_agent'),      color:'#7C3AED',  bg:'#F5F3FF' },
  transport_provider: { icon:'🚌', label:t('my_profile.role_transporter'),      color:'#D97706',  bg:'#FEF3C7' },
  service_provider:   { icon:'🔧', label:t('my_profile.role_service_provider'), color:'#16A34A',  bg:'#F0FDF4' },
});

// ── Simple QR code via API (no library needed) ───────────────────────────────
const QRDisplay = ({ value, size = 120 }) => (
  <img
    src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=0F172A&bgcolor=FFFFFF`}
    alt="QR Code"
    style={{ width:size, height:size, borderRadius:8, border:'1px solid #E2E8F0' }}
  />
);

// ── Section card ─────────────────────────────────────────────────────────────
const SCard = ({ children, style={} }) => (
  <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
    boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:12, ...style }}>
    {children}
  </div>
);

// ── Row item ─────────────────────────────────────────────────────────────────
const Row = ({ icon, label, value, action, onAction, color='#1e293b', sub }) => (
  <div onClick={onAction}
    style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0',
      borderBottom:'1px solid #F8FAFC', cursor:onAction?'pointer':'default' }}>
    <span style={{ fontSize:20, flexShrink:0, width:28, textAlign:'center' }}>{icon}</span>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:13, fontWeight:700, color:DK }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:GR, marginTop:1 }}>{sub}</div>}
    </div>
    {value !== undefined && (
      <div style={{ fontSize:13, fontWeight:700, color, textAlign:'right',
        maxWidth:'55%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {value}
      </div>
    )}
    {onAction && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke={GR} strokeWidth="2" style={{ flexShrink:0 }}>
        <polyline points="9,18 15,12 9,6"/>
      </svg>
    )}
  </div>
);

// ── Main ─────────────────────────────────────────────────────────────────────
const MyProfile = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser, onOpenMoment }) => {
  const { t } = useTranslation();
  const TIERS = getTiers(t);
  const ROLE_META = getRoleMeta(t);
  const getTier = s => TIERS.find(tier => Number(s||0) >= tier.min) || TIERS[4];
  const [section,    setSection]    = useState(null); // null = list home, like IG Settings
  const [profile,    setProfile]    = useState(currentUser || null);
  const [rep,        setRep]        = useState(null);
  const [orders,     setOrders]     = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [invoices,   setInvoices]   = useState([]);
  const [followed,   setFollowed]   = useState([]);
  const [agentData,  setAgentData]  = useState(null);
  const [saData,     setSaData]     = useState(null);
  const [tpData,     setTpData]     = useState(null);
  const [sellerStats,setSellerStats]= useState(null);
  const [myServices, setMyServices] = useState([]);
  const [notifs,     setNotifs]     = useState([]);
  const [unread,     setUnread]     = useState(0);
  const [loading,    setLoading]    = useState(true); // eslint-disable-line no-unused-vars
  const [showQR,     setShowQR]     = useState(false);
  const [identityStatus, setIdentityStatus] = useState(null);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);

  const role = userRole || profile?.role || 'user';

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setLoading(true);
    Promise.allSettled([
      api.get('/auth/profile'),
      api.get('/reputation/my'),
      api.get('/notifications/unread-count'),
      api.get('/identity/me'),
    ]).then(([p, r, n, id]) => {
      if (p.status === 'fulfilled') setProfile(p.value.data);
      if (r.status === 'fulfilled') setRep(r.value.data);
      if (n.status === 'fulfilled') setUnread(n.value.data?.count || n.value.data || 0);
      if (id.status === 'fulfilled') setIdentityStatus(id.value.data);
    }).finally(() => setLoading(false));

    // Eagerly load just the ONE role-relevant summary so the Quick Actions
    // card can show real numbers right away, without loading all 9 sections.
    const r = userRole;
    if (['seller','admin','manager'].includes(r))
      api.get('/seller/dashboard').then(res => setSellerStats(res.data)).catch(()=>{});
    if (r === 'agent')
      api.get('/agents/my-profile').then(res => setAgentData(res.data)).catch(()=>{});
    if (r === 'super_agent')
      api.get('/super-agents/my-profile').then(res => setSaData(res.data)).catch(()=>{});
    if (r === 'transport_provider')
      api.get('/transport/my-profile').then(res => setTpData(res.data)).catch(()=>{});
  }, [isLoggedIn]); // eslint-disable-line

  // Lazy load section data
  useEffect(() => {
    switch (section) {
      case 'commerce':
        if (!orders.length)
          api.get('/orders/my-orders?limit=10').then(r => setOrders(r.data?.orders || r.data || [])).catch(()=>{});
        if (!followed.length)
          api.get('/stores/me/following').then(r => setFollowed(r.data || [])).catch(()=>{});
        break;
      case 'finance':
        if (!payments.length)
          api.get('/payments/my').then(r => setPayments(r.data || [])).catch(()=>{});
        if (!invoices.length)
          api.get('/invoices/my').then(r => setInvoices(r.data || [])).catch(()=>{});
        break;
      case 'logistics':
        if (role === 'agent' && !agentData)
          api.get('/agents/my-profile').then(r => setAgentData(r.data)).catch(()=>{});
        if (role === 'super_agent' && !saData)
          api.get('/super-agents/my-profile').then(r => setSaData(r.data)).catch(()=>{});
        if (role === 'transport_provider' && !tpData)
          api.get('/transport/my-profile').then(r => setTpData(r.data)).catch(()=>{});
        break;
      case 'businesses':
        // GET /seller/dashboard now works for any account, not just
        // role='seller' (which only ever flips on formal approval) --
        // fetch it universally so the Seller Center tile shows real
        // numbers for a brand-new, not-yet-verified seller too.
        if (!sellerStats)
          api.get('/seller/dashboard').then(r => setSellerStats(r.data)).catch(()=>{});
        if (!myServices.length)
          api.get('/services/my/ads').then(r => setMyServices(r.data || [])).catch(()=>{});
        break;
      case 'communication':
        if (!notifs.length)
          api.get('/notifications/my').then(r => setNotifs(r.data?.items || r.data || [])).catch(()=>{});
        break;
      default: break;
    }
  }, [section]); // eslint-disable-line

  const score = rep?.score || profile?.reputationScore || 0;
  const tier  = getTier(score);
  const roles = [role, ...(profile?.activeRoles || [])].filter((r,i,a) => a.indexOf(r)===i);

  // "Businesses Zangu" is store/products/services/analytics — only means
  // anything if you actually run a store. "Finance" is payouts/invoices/
  // payout method — only means anything if you're paid by KenteXa (seller
  // or agent). Neither applied to a plain buyer, who saw them anyway with
  // zero content that worked for them.
  const isBusinessOwner = roles.some(r => ['seller','admin','manager'].includes(r));
  const isPaidRole      = roles.some(r => ['seller','admin','manager','agent'].includes(r));

  const NAV = [
    { key:'identity',      icon:'👤', label:t('my_profile.nav_identity') },
    { key:'roles',         icon:'🏷️', label:t('my_profile.nav_roles') },
    isBusinessOwner && { key:'businesses', icon:'🏢', label:t('my_profile.nav_businesses') },
    { key:'commerce',      icon:'📦', label:t('my_profile.nav_commerce') },
    { key:'logistics',     icon:'🚚', label:t('my_profile.nav_logistics') },
    isPaidRole && { key:'finance', icon:'💰', label:t('my_profile.nav_finance') },
    { key:'reputation',    icon:'⭐', label:t('my_profile.nav_reputation') },
    { key:'communication', icon:'💬', label:t('my_profile.nav_communication'), badge: unread },
    { key:'settings',      icon:'⚙️', label:t('my_profile.nav_settings') },
  ].filter(Boolean);

  if (!isLoggedIn) return null;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#F8FAFC',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif', paddingBottom:80 }}>

      {/* ── Top bar ── */}
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
        padding:'14px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        {section ? (
          <>
            <button onClick={() => setSection(null)}
              style={{ display:'flex', alignItems:'center', gap:8, background:'none',
                border:'none', cursor:'pointer', padding:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={DK} strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
              <span style={{ fontSize:16, fontWeight:900, color:DK }}>
                {NAV.find(n => n.key === section)?.icon} {NAV.find(n => n.key === section)?.label}
              </span>
            </button>
            <div style={{ width:20 }} />
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize:16, fontWeight:900, color:DK }}>👤 {t('my_profile.header_title')}</div>
              <div style={{ fontSize:11, color:GR }}>{t('my_profile.header_subtitle')}</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowQR(true)}
                style={{ backgroundColor:'#F1F5F9', border:'none', borderRadius:8,
                  padding:'7px 12px', cursor:'pointer', fontSize:12, fontWeight:700, color:DK }}>
                {t('my_profile.qr_button')}
              </button>
              <button onClick={() => onNavigate('CommerceProfile')}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:8,
                  padding:'7px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                {t('my_profile.public_profile_button')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Identity mini-card (list-home only) ── */}
      {profile && !section && (
        <div style={{ background:`linear-gradient(135deg,#1E1B4B,${B})`,
          padding:'20px 16px', color:WH }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            {/* Avatar */}
            <div style={{ width:64, height:64, borderRadius:16,
              border:'3px solid rgba(255,255,255,0.3)', overflow:'hidden',
              backgroundColor:'rgba(255,255,255,0.2)', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt=""
                    style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <span style={{ fontSize:28, fontWeight:900 }}>
                    {(profile.name||'K').charAt(0).toUpperCase()}
                  </span>}
            </div>
            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:18, fontWeight:900, lineHeight:1.2 }}>
                {profile.name || profile.storeName || t('my_profile.default_name')}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
                📱 {profile.phone}
                {profile.isVerified && t('my_profile.verified_suffix')}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
                📍 {profile.city || profile.businessLocation || t('my_profile.location_fallback')}
              </div>
            </div>
            {/* Reputation */}
            <div style={{ backgroundColor:'rgba(255,255,255,0.15)', borderRadius:12,
              padding:'10px 14px', textAlign:'center', flexShrink:0 }}>
              <div style={{ fontSize:20 }}>{tier.icon}</div>
              <div style={{ fontSize:18, fontWeight:900 }}>{score}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.7)', marginTop:1 }}>
                {tier.name}
              </div>
            </div>
          </div>
          {/* Role badges */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>
            {roles.map(r => {
              const m = ROLE_META[r] || { icon:'👤', label:r };
              return (
                <span key={r} style={{ fontSize:10, fontWeight:700,
                  backgroundColor:'rgba(255,255,255,0.2)', color:WH,
                  padding:'3px 10px', borderRadius:100 }}>
                  {m.icon} {m.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick Actions (role-specific, list-home only) ── */}
      {!section && (() => {
        const actions = [];
        // Selling is universal now (see SellerDashboard.js) -- every account
        // gets a Seller Center tile here regardless of role/verification,
        // not just accounts already promoted to role='seller'. That role
        // gate was the exact same "verification as permission" bug already
        // fixed on the dashboard itself; this is the other place it lived.
        actions.push({
          icon:'🏪', label:t('my_profile.seller_center_label'),
          value: sellerStats?.stats?.pendingOrders > 0 ? String(sellerStats.stats.pendingOrders) : t('my_profile.manage_sales_sub'),
          sub: sellerStats?.stats?.pendingOrders > 0 ? t('my_profile.tap_to_view') : t('my_profile.sell_on_kentexa_sub'),
          color:B, bg:'#EFF6FF',
          onAction:()=>onNavigate('SellerDashboard'),
        });
        if (['seller','admin','manager'].some(r => roles.includes(r))) {
          actions.push({
            icon:'💰', label:t('my_profile.revenue_label'),
            value: sellerStats?.stats?.totalRevenue != null ? `TZS ${fmt(sellerStats.stats.totalRevenue)}` : '—',
            sub:t('my_profile.recent_orders_sub'), color:'#16A34A', bg:'#F0FDF4',
            onAction:()=>onNavigate('SellerAnalytics'),
          });
        }
        if (roles.includes('agent')) {
          actions.push({
            icon:'🏍️', label:t('my_profile.my_jobs_label'),
            value:'View', sub:t('my_profile.available_near_you'), color:'#A21CAF', bg:'#FDF2F8',
            onAction:()=>onNavigate('AgentDashboard'),
          });
          actions.push({
            icon:'💰', label:t('my_profile.pending_payout_label'),
            value: agentData?.pendingEarnings != null ? `TZS ${fmt(agentData.pendingEarnings)}` : '—',
            sub:t('my_profile.earnings_sub'), color:'#16A34A', bg:'#F0FDF4',
            onAction:()=>onNavigate('AgentEarnings'),
          });
        }
        if (roles.includes('super_agent')) {
          actions.push({
            icon:'📦', label:t('my_profile.hub_parcels_label'),
            value:'View', sub: saData?.city || t('my_profile.your_hub_fallback'), color:'#7C3AED', bg:'#F5F3FF',
            onAction:()=>onNavigate('SuperAgentDashboard'),
          });
        }
        if (roles.includes('transport_provider')) {
          actions.push({
            icon:'🚌', label:t('my_profile.todays_routes_label'),
            value:'View', sub:t('my_profile.assignments_sub'), color:'#D97706', bg:'#FEF3C7',
            onAction:()=>onNavigate('TransportProviderDashboard'),
          });
        }
        // The old Navbar.js hamburger menu (which had a "🛡️ Admin Panel"
        // entry) was removed when the app moved to the CommerceProfile-
        // driven bottom nav — nothing replaced it, leaving admin/manager
        // accounts with no way to reach the admin pages (Dashboard,
        // Products, Users, Orders, etc. — still fully wired in App.js's
        // renderPage(), just orphaned from the UI). This is that entry point.
        if (roles.includes('admin') || roles.includes('manager')) {
          actions.push({
            icon:'🛡️', label:t('my_profile.admin_panel_label'),
            value:'Open', sub:t('my_profile.admin_panel_sub'), color:'#7C3AED', bg:'#F5F3FF',
            onAction:()=>onNavigate('Dashboard'),
          });
        }
        actions.push({
          icon:'💬', label:t('my_profile.messages_label'),
          value: unread > 0 ? String(unread) : '—',
          sub: unread > 0 ? t('my_profile.new_sub') : t('my_profile.all_read_sub'), color: unread>0?'#EF4444':GR,
          bg: unread>0?'#FEF2F2':'#F8FAFC',
          onAction:()=>onNavigate('Activity'),
        });

        return (
          <div style={{ padding:'14px 14px 0', maxWidth:760, margin:'0 auto' }}>
            <div style={{ display:'grid',
              gridTemplateColumns:`repeat(${Math.min(actions.length,3)},1fr)`, gap:10 }}>
              {actions.map((a,i) => (
                <button key={i} onClick={a.onAction}
                  style={{ backgroundColor:a.bg, border:'none', borderRadius:14,
                    padding:'12px 10px', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{a.icon}</div>
                  <div style={{ fontSize:14, fontWeight:900, color:a.color }}>{a.value}</div>
                  <div style={{ fontSize:10, color:GR, marginTop:1 }}>{a.label}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Menu (vertical, Instagram-Settings style — list-home only) ── */}
      {!section && (
        <div style={{ padding:'14px 14px 20px', maxWidth:760,
          margin:'0 auto', width:'100%', boxSizing:'border-box' }}>
          <div style={{ backgroundColor:WH, borderRadius:16,
            boxShadow:'0 2px 8px rgba(0,0,0,0.05)', overflow:'hidden' }}>
            {NAV.map((n,i) => (
              <button key={n.key} onClick={() => setSection(n.key)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:14,
                  padding:'14px 16px', border:'none', background:'none', cursor:'pointer',
                  borderBottom: i < NAV.length-1 ? '1px solid #F8FAFC' : 'none',
                  textAlign:'left' }}>
                <span style={{ fontSize:20, width:26, textAlign:'center', flexShrink:0 }}>{n.icon}</span>
                <span style={{ flex:1, fontSize:14, fontWeight:700, color:DK }}>{n.label}</span>
                {n.badge > 0 && (
                  <span style={{ backgroundColor:'#EF4444', color:WH, fontSize:10,
                    fontWeight:900, borderRadius:100, padding:'2px 8px', flexShrink:0 }}>
                    {t('my_profile.badge_new', { count: n.badge })}
                  </span>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={GR} strokeWidth="2" style={{ flexShrink:0 }}>
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Section content (full "page" with back button above) ── */}
      {section && (
      <div style={{ padding:'14px 14px 20px', maxWidth:760,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* ══ IDENTITY ══ */}
        {section === 'identity' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.basic_info_title')}
              </div>
              <Row icon="📸" label={t('my_profile.profile_photo_label')}
                value={profile?.avatarUrl ? t('my_profile.set_status') : t('my_profile.incomplete_status')}
                color={profile?.avatarUrl ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🆔" label={t('my_profile.kentexa_id_label')} value={profile?.kentexaId || '—'} />
              <Row icon="✏️" label={t('my_profile.full_name_label')} value={profile?.name || '—'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📱" label={t('my_profile.phone_number_label')} value={profile?.phone || '—'} />
              <Row icon="✉️" label={t('my_profile.email_label')} value={profile?.email || t('my_profile.not_set')}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📍" label={t('my_profile.location_label')}
                value={profile?.businessLocation || profile?.city || t('my_profile.not_set')}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📝" label={t('my_profile.short_bio_label')}
                value={(profile?.storeDescription || profile?.bio) ? '✓' : t('my_profile.incomplete_status')}
                color={(profile?.storeDescription || profile?.bio) ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.verification_status_title')}
              </div>
              <Row icon="📱" label={t('my_profile.phone_verified_label')}
                value={profile?.isVerified ? t('my_profile.yes_label') : t('my_profile.not_yet_label')}
                color={profile?.isVerified ? '#16A34A' : '#DC2626'} />
              <Row icon="✅" label={t('my_profile.account_setup_label')}
                value={profile?.onboardingCompleted ? t('my_profile.account_completed_label') : t('my_profile.incomplete_status')}
                color={profile?.onboardingCompleted ? '#16A34A' : '#D97706'}
                onAction={() => !profile?.onboardingCompleted && onNavigate('Onboarding')} />
              {/* ID/KYC row removed — no verification pipeline exists yet
                  (kycLevel is never set anywhere); re-add once a real
                  document-upload + admin-review flow is built. */}
              <Row icon="🏢" label={t('my_profile.business_verified_label')}
                value={isBusinessOwner ? t('my_profile.yes_label') : t('my_profile.not_yet_label')}
                color={isBusinessOwner ? '#16A34A' : GR} />
            </SCard>

            {/* QR Code */}
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.qr_code_title')}
              </div>
              <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                <QRDisplay
                  value={`${window.location.origin}/?page=CommerceProfile-${profile?.id}`}
                  size={100} />
                <div>
                  <div style={{ fontSize:12, color:GR, lineHeight:1.6, marginBottom:10 }}>
                    {t('my_profile.qr_invite_desc')}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:B,
                    backgroundColor:'#EFF6FF', padding:'4px 10px', borderRadius:8,
                    display:'inline-block' }}>
                    {profile?.kentexaId || '—'}
                  </div>
                </div>
              </div>
            </SCard>
          </>
        )}

        {/* ══ ROLES ══ */}
        {section === 'roles' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:6 }}>
                {t('my_profile.your_active_roles_title')}
              </div>
              <div style={{ fontSize:12, color:GR, marginBottom:14 }}>
                {t('my_profile.one_account_desc')}
              </div>
              {roles.map(r => {
                const m = ROLE_META[r] || { icon:'👤', label:r, color:GR, bg:'#F1F5F9' };
                return (
                  <div key={r} style={{ display:'flex', alignItems:'center', gap:14,
                    padding:'14px 16px', borderRadius:12, marginBottom:10,
                    backgroundColor:m.bg, border:`1px solid ${m.color}20` }}>
                    <span style={{ fontSize:28 }}>{m.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:m.color }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                        {t('my_profile.active_working_badge')}
                      </div>
                    </div>
                    <button onClick={() => {
                      const pages = {
                        seller:'SellerDashboard', agent:'AgentDashboard',
                        super_agent:'SuperAgentDashboard',
                        transport_provider:'TransportProviderDashboard',
                      };
                      if (pages[r]) onNavigate(pages[r]);
                    }}
                      style={{ backgroundColor:m.color, color:WH, border:'none',
                        borderRadius:8, padding:'7px 14px', cursor:'pointer',
                        fontSize:12, fontWeight:700 }}>
                      {t('my_profile.go_button')}
                    </button>
                  </div>
                );
              })}
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.add_new_role_title')}
              </div>
              {Object.entries(ROLE_META)
                .filter(([k]) => !roles.includes(k) && k !== 'user')
                .map(([k, m]) => (
                  <div key={k} onClick={() => onNavigate('RoleActivation')}
                    style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'12px 14px', borderRadius:12, marginBottom:8,
                      backgroundColor:'#F8FAFC', border:'1.5px dashed #E2E8F0',
                      cursor:'pointer' }}>
                    <span style={{ fontSize:24 }}>{m.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:DK }}>{m.label}</div>
                      <div style={{ fontSize:11, color:GR }}>{t('my_profile.tap_to_register')}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke={GR} strokeWidth="2"><polyline points="9,18 15,12 9,6"/></svg>
                  </div>
                ))}
            </SCard>
          </>
        )}

        {/* ══ BUSINESSES ══ */}
        {section === 'businesses' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.my_businesses_title')}
              </div>
              <Row icon="📊" label={t('my_profile.seller_dashboard_label')}
                onAction={() => onNavigate('SellerDashboard')} />
              <Row icon="🏪" label={t('my_profile.online_store_label')}
                value={profile?.storeName || t('my_profile.not_set_up_yet')}
                onAction={() => onNavigate('StoreSettings')} />
              <Row icon="⚙️" label={t('my_profile.store_settings_label')}
                onAction={() => onNavigate('StoreSettings')} />
              <Row icon="👥" label={t('my_profile.team_members_label')}
                onAction={() => onNavigate('SellerTeam')} />
              <Row icon="🏷️" label={t('my_profile.my_products_label')}
                value={fmt(sellerStats?.stats?.totalProducts||0)}
                onAction={() => onNavigate('SellerClassifieds')} />
              <Row icon="🔧" label={t('my_profile.my_services_label')}
                value={t('my_profile.services_count', { count: myServices.length })}
                onAction={() => onNavigate('MyServices')} />
              <Row icon="📊" label={t('my_profile.business_analytics_label')}
                onAction={() => onNavigate('SellerAnalytics')} />
              <Row icon="📸" label={t('my_profile.share_moment_label')}
                onAction={() => onOpenMoment?.('selling')} />
              <Row icon="📢" label={t('my_profile.my_posts_label')}
                onAction={() => onNavigate('CommerceProfile')} />
            </SCard>

            {sellerStats && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                  {t('my_profile.business_overview_title')}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { label:t('my_profile.revenue_stat'), value:`TZS ${fmt(sellerStats.stats?.totalRevenue||0)}`, color:'#16A34A' },
                    { label:t('my_profile.my_orders_stat'),  value:fmt(sellerStats.stats?.pendingOrders||0),           color:B },
                    { label:t('my_profile.all_products_stat'),    value:fmt(sellerStats.stats?.totalProducts||0),            color:'#7C3AED' },
                    { label:t('my_profile.customers_stat'),         value:fmt(sellerStats.stats?.totalCustomers||0),           color:'#D97706' },
                  ].map(s => (
                    <div key={s.label} style={{ backgroundColor:'#F8FAFC', borderRadius:10,
                      padding:'12px 14px' }}>
                      <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:11, color:GR, marginTop:2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </SCard>
            )}
          </>
        )}

        {/* ══ COMMERCE ══ */}
        {section === 'commerce' && (
          <>
            <SCard>
              <Row icon="🏪" label={t('my_profile.seller_center_label')}
                onAction={() => onNavigate('SellerDashboard')} />
              <Row icon="🪪" label={t('my_profile.identity_label')}
                value={
                  identityStatus?.status === 'verified' ? t('my_profile.identity_verified')
                  : identityStatus?.status === 'pending' ? t('my_profile.identity_pending')
                  : identityStatus?.status === 'rejected' ? t('my_profile.identity_rejected')
                  : t('my_profile.identity_not_verified')
                }
                color={identityStatus?.status === 'verified' ? '#16a34a' : identityStatus?.status === 'pending' ? '#ca8a04' : GR}
                onAction={identityStatus?.status === 'verified' ? undefined : () => setShowVerifyIdentity(true)} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.business_activity_title')}
              </div>
              <Row icon="🛒" label={t('my_profile.my_orders_label')} value={fmt(orders.length)}
                onAction={() => onNavigate('MyOrders')} />
              <Row icon="🧾" label={t('my_profile.pay_invoice_label')}
                onAction={() => onNavigate('PayInvoice')} />
              <Row icon="🔍" label={t('my_profile.track_parcel_label')}
                onAction={() => onNavigate('TrackParcel')} />
              <Row icon="❤️" label={t('my_profile.wishlist_label')}
                onAction={() => onNavigate('Wishlist')} />
              <Row icon="🏪" label={t('my_profile.businesses_i_follow_label')}
                value={fmt(followed.length)} onAction={() => onNavigate('Stores')} />
              <Row icon="📋" label={t('my_profile.order_status_label')}
                onAction={() => onNavigate('MyOrders')} />
            </SCard>

            {orders.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('my_profile.recent_orders_title')}
                </div>
                {orders.slice(0,5).map(o => (
                  <div key={o.id} onClick={() => onNavigate(`OrderTracking-${o.id}`)}
                    style={{ display:'flex', justifyContent:'space-between',
                      padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                      cursor:'pointer', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK }}>
                        {o.product?.name || o.manualProductName || t('my_profile.product_fallback')}
                      </div>
                      <div style={{ fontSize:10, color:GR }}>
                        {o.trackingNumber} · {fmtD(o.createdAt)}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:900, color:B }}>
                        TZS {fmt(o.totalAmount)}
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, marginTop:2, textTransform:'capitalize',
                        color: o.status==='completed'?'#16A34A':o.status==='cancelled'?'#DC2626':'#D97706' }}>
                        {o.status}
                      </div>
                    </div>
                  </div>
                ))}
              </SCard>
            )}
          </>
        )}

        {/* ══ LOGISTICS ══ */}
        {section === 'logistics' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.transport_activity_title')}
              </div>
              {role === 'agent' && (
                <>
                  <Row icon="🏍️" label={t('my_profile.delivery_jobs_label')}
                    onAction={() => onNavigate('AgentDashboard')} />
                  <Row icon="💰" label={t('my_profile.agent_earnings_label')}
                    value={agentData ? `TZS ${fmt(agentData.totalEarnings)}` : '—'}
                    onAction={() => onNavigate('AgentEarnings')} />
                  <Row icon="📊" label={t('my_profile.my_scorecard_label')}
                    onAction={() => onNavigate('AgentScorecard')} />
                  <Row icon="✅" label={t('my_profile.delivered_label')}
                    value={fmt(agentData?.totalDeliveriesCompleted||0)} />
                </>
              )}
              {role === 'super_agent' && (
                <>
                  <Row icon="🏢" label={t('my_profile.hub_dashboard_label')}
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                  <Row icon="📦" label={t('my_profile.hub_parcels_label2')}
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                  <Row icon="🚌" label={t('my_profile.arrange_transport_label')}
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                </>
              )}
              {role === 'transport_provider' && (
                <>
                  <Row icon="🚌" label={t('my_profile.routes_dashboard_label')}
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="📍" label={t('my_profile.my_routes_label')}
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="📦" label={t('my_profile.cargo_orders_label')}
                    value={fmt(tpData?.completedAssignments||0)}
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="🗺️" label={t('my_profile.route_map_label')}
                    onAction={() => onNavigate('RouteCoverageMap')} />
                </>
              )}
              {!['agent','super_agent','transport_provider'].includes(role) && (
                <div style={{ textAlign:'center', padding:'24px 0' }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>🚚</div>
                  <div style={{ fontSize:13, color:GR, marginBottom:12 }}>
                    {t('my_profile.no_logistics_role_desc')}
                  </div>
                  <button onClick={() => onNavigate('RoleActivation')}
                    style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                      padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    {t('my_profile.add_role_button')}
                  </button>
                </div>
              )}
            </SCard>
          </>
        )}

        {/* ══ FINANCE ══ */}
        {section === 'finance' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.finance_payments_title')}
              </div>
              <Row icon="💳" label={t('my_profile.my_payments_label')}
                value={t('my_profile.payments_count', { count: payments.length })}
                onAction={() => onNavigate('SellerPayouts')} />
              <Row icon="📄" label={t('my_profile.invoices_label')}
                value={t('my_profile.invoices_count', { count: invoices.length })}
                onAction={() => onNavigate('SellerInvoices')} />
              <Row icon="💸" label={t('my_profile.payout_method_label')}
                value={profile?.payoutMethod || t('my_profile.not_set')}
                color={profile?.payoutMethod ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🏦" label={t('my_profile.bank_account_label')}
                value={profile?.payoutAccountName || t('my_profile.not_set')}
                onAction={() => onNavigate('CustomerProfile')} />
              {roles.includes('agent') && (
                <Row icon="💰" label={t('my_profile.agent_earnings_label')}
                  value={agentData ? `TZS ${fmt(agentData.totalEarnings)}` : '—'}
                  onAction={() => onNavigate('AgentEarnings')} />
              )}
              {isBusinessOwner && (
                <Row icon="📊" label={t('my_profile.payout_overview_label')}
                  onAction={() => onNavigate('SellerPayouts')} />
              )}
            </SCard>

            {payments.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('my_profile.recent_transactions_title')}
                </div>
                {payments.slice(0,5).map((p, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                    alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK }}>
                        {p.description || p.type || t('my_profile.payment_fallback')}
                      </div>
                      <div style={{ fontSize:10, color:GR }}>{fmtD(p.createdAt)}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:900,
                      color: p.status==='success'?'#16A34A':'#D97706' }}>
                      TZS {fmt(p.amount)}
                    </div>
                  </div>
                ))}
              </SCard>
            )}
          </>
        )}

        {/* ══ REPUTATION ══ */}
        {section === 'reputation' && (
          <>
            {/* Tier hero */}
            <div style={{ background:`linear-gradient(135deg,${tier.color},${B})`,
              borderRadius:20, padding:24, color:WH, textAlign:'center',
              marginBottom:12 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>{tier.icon}</div>
              <div style={{ fontSize:22, fontWeight:900 }}>{tier.name}</div>
              <div style={{ fontSize:36, fontWeight:900, margin:'8px 0', lineHeight:1 }}>
                {score}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>
                {t('my_profile.trust_score_label')}
              </div>
              <div style={{ height:8, backgroundColor:'rgba(255,255,255,0.2)',
                borderRadius:100, margin:'12px 0 0' }}>
                <div style={{ height:'100%', borderRadius:100,
                  backgroundColor:'rgba(255,255,255,0.8)',
                  width:`${Math.min(100,score/10)}%` }} />
              </div>
            </div>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.trust_tiers_title')}
              </div>
              {[...TIERS].reverse().map(tier => (
                <div key={tier.name} style={{ display:'flex', alignItems:'center', gap:12,
                  padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                  opacity: score >= tier.min ? 1 : 0.4 }}>
                  <span style={{ fontSize:22 }}>{tier.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:tier.color }}>{tier.name}</div>
                    <div style={{ fontSize:10, color:GR }}>{t('my_profile.score_plus_label', { min: tier.min })}</div>
                  </div>
                  {score >= tier.min
                    ? <span style={{ fontSize:10, fontWeight:800, backgroundColor:tier.bg,
                        color:tier.color, padding:'2px 8px', borderRadius:100 }}>{t('my_profile.achieved_badge')}</span>
                    : <span style={{ fontSize:10, color:GR }}>{t('my_profile.more_needed', { count: tier.min - score })}</span>}
                </div>
              ))}
            </SCard>

            {/* Score breakdown */}
            {rep?.breakdown && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('my_profile.score_breakdown_title')}
                </div>
                {Object.entries(rep.breakdown).map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between',
                    padding:'8px 0', borderBottom:'1px solid #F8FAFC',
                    alignItems:'center' }}>
                    <span style={{ fontSize:12, color:GR, textTransform:'capitalize' }}>{k}</span>
                    <span style={{ fontSize:13, fontWeight:900,
                      color: Number(v)>0?'#16A34A':'#DC2626' }}>
                      {Number(v)>0?'+':''}{v}
                    </span>
                  </div>
                ))}
              </SCard>
            )}

            {/* History */}
            {rep?.history?.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('my_profile.score_history_title')}
                </div>
                {rep.history.map(e => (
                  <div key={e.id} style={{ display:'flex', justifyContent:'space-between',
                    padding:'8px 0', borderBottom:'1px solid #F8FAFC', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK,
                        textTransform:'capitalize' }}>
                        {e.eventType.replace(/_/g,' ')}
                      </div>
                      <div style={{ fontSize:10, color:GR }}>{fmtD(e.createdAt)}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:900,
                        color:e.points>0?'#16A34A':'#DC2626' }}>
                        {e.points>0?'+':''}{e.points}
                      </div>
                      <div style={{ fontSize:10, color:GR }}>{e.scoreAfter}</div>
                    </div>
                  </div>
                ))}
              </SCard>
            )}
          </>
        )}

        {/* ══ COMMUNICATION ══ */}
        {section === 'communication' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.messages_title')}
              </div>
              <Row icon="📨" label={t('my_profile.inbox_label')} sub={t('my_profile.business_inbox_sub')}
                onAction={() => onNavigate('SellerInbox')} />
              <Row icon="🔔" label={t('my_profile.notifications_label')} value={unread > 0 ? t('my_profile.new_count', { count: unread }) : t('my_profile.all_read')}
                color={unread>0?'#EF4444':GR}
                onAction={() => onNavigate('Activity')} />
              <Row icon="📢" label={t('my_profile.business_updates_label')}
                sub={t('my_profile.new_products_sub')}
                onAction={() => onNavigate('Home')} />
              <Row icon="🎧" label={t('my_profile.support_label')}
                onAction={() => onNavigate('ContactUs')} />
            </SCard>

            {notifs.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('my_profile.recent_notifications_title')}
                </div>
                {notifs.slice(0,5).map(n => (
                  <div key={n.id} style={{ display:'flex', gap:12, padding:'10px 0',
                    borderBottom:'1px solid #F8FAFC',
                    opacity: n.isRead ? 0.6 : 1 }}>
                    <span style={{ fontSize:20 }}>{n.icon || '🔔'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight: n.isRead ? 600 : 800, color:DK }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize:11, color:GR }}>{n.body}</div>
                    </div>
                    {!n.isRead && (
                      <div style={{ width:8, height:8, borderRadius:'50%',
                        backgroundColor:B, marginTop:4, flexShrink:0 }} />
                    )}
                  </div>
                ))}
                <button onClick={() => onNavigate('Activity')}
                  style={{ width:'100%', marginTop:10, backgroundColor:'#EFF6FF',
                    color:B, border:'none', borderRadius:10, padding:'10px 0',
                    cursor:'pointer', fontSize:12, fontWeight:700 }}>
                  {t('my_profile.view_all_notifications_button')}
                </button>
              </SCard>
            )}
          </>
        )}

        {/* ══ SETTINGS ══ */}
        {section === 'settings' && (
          <>
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.account_title')}
              </div>
              <Row icon="✏️" label={t('my_profile.edit_profile_label')}
                onAction={() => onNavigate('CustomerProfile')} />
              {isBusinessOwner && (
                <Row icon="🏪" label={t('my_profile.store_settings_label')}
                  onAction={() => onNavigate('StoreSettings')} />
              )}
              {/* "Verify ID" removed — same dead KYC row already removed from
                  the Identity tab; it linked to CustomerProfile, which has no
                  ID-verification UI, for any role, seller included. */}
            </SCard>

            {/* Payout details — only means anything if KenteXa actually pays
                you (seller/agent/admin/manager). A plain buyer never
                receives a payout, only makes payments. */}
            {isPaidRole && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                  {t('my_profile.payments_title')}
                </div>
                <Row icon="🏦" label={t('my_profile.payout_method_label')}
                  value={profile?.payoutMethod || t('my_profile.not_set')}
                  onAction={() => onNavigate('CustomerProfile')} />
                <Row icon="👤" label={t('my_profile.account_name_label')}
                  value={profile?.payoutAccountName || '—'}
                  onAction={() => onNavigate('CustomerProfile')} />
                <Row icon="🏛️" label={t('my_profile.bank_label')}
                  value={profile?.payoutBankName || '—'}
                  onAction={() => onNavigate('CustomerProfile')} />
              </SCard>
            )}

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.security_privacy_title')}
              </div>
              <Row icon="🔑" label={t('my_profile.change_password_label')}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📱" label={t('my_profile.verify_phone_label')}
                value={profile?.isVerified ? t('my_profile.verified_label') : t('my_profile.not_yet_label')}
                color={profile?.isVerified ? '#16A34A' : '#DC2626'} />
              <Row icon="🛡️" label={t('my_profile.privacy_label')}
                onAction={() => onNavigate('PrivacyPolicy')} />
              <Row icon="📋" label={t('my_profile.terms_label')}
                onAction={() => onNavigate('TermsAndConditions')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                {t('my_profile.about_kentexa_title')}
              </div>
              <Row icon="🌐" label={t('my_profile.version_label')} value={t('my_profile.version_value')} />
              <Row icon="📞" label={t('my_profile.contact_us_label')}
                onAction={() => onNavigate('ContactUs')} />
              <Row icon="❓" label={t('my_profile.how_it_works_label')}
                onAction={() => onNavigate('HowItWorks')} />
            </SCard>

            {/* Logout */}
            <div style={{ backgroundColor:'#FEF2F2', borderRadius:14, padding:16,
              border:'1px solid #FECACA' }}>
              <button onClick={() => {
                if (window.confirm(t('my_profile.logout_confirm'))) {
                  onLogout?.();
                  onNavigate('Home');
                }
              }}
                style={{ width:'100%', backgroundColor:'#DC2626', color:WH,
                  border:'none', borderRadius:10, padding:'14px 0',
                  cursor:'pointer', fontSize:14, fontWeight:800 }}>
                {t('my_profile.logout_button')}
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* ── QR Modal ── */}
      {showQR && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.7)',
          zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center',
          padding:20 }}>
          <div style={{ backgroundColor:WH, borderRadius:20, padding:32,
            textAlign:'center', maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:16, fontWeight:900, color:DK, marginBottom:4 }}>
              {t('my_profile.my_kentexa_id_title')}
            </div>
            <div style={{ fontSize:12, color:GR, marginBottom:20 }}>
              {t('my_profile.qr_modal_desc')}
            </div>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
              <QRDisplay
                value={`${window.location.origin}/?page=CommerceProfile-${profile?.id}`}
                size={200} />
            </div>
            <div style={{ fontSize:13, fontWeight:800, color:B,
              backgroundColor:'#EFF6FF', padding:'8px 16px', borderRadius:10,
              display:'inline-block', marginBottom:16 }}>
              KTX-{String(profile?.id||0).padStart(6,'0')}
            </div>
            <div style={{ fontSize:12, color:GR, marginBottom:20 }}>
              {profile?.name || profile?.storeName}
            </div>
            <button onClick={() => setShowQR(false)}
              style={{ width:'100%', backgroundColor:'#F1F5F9', color:DK,
                border:'none', borderRadius:10, padding:'12px 0',
                cursor:'pointer', fontSize:14, fontWeight:700 }}>
              {t('my_profile.close_button')}
            </button>
          </div>
        </div>
      )}

      {showVerifyIdentity && (
        <VerifyIdentityModal
          onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => {
            setShowVerifyIdentity(false);
            api.get('/identity/me').then(r => setIdentityStatus(r.data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

export default MyProfile;