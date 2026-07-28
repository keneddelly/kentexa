/**
 * MyProfile.js — KenteXa Commerce Identity
 * Place at: src/public/pages/MyProfile.js
 *
 * Complete identity hub with all 9 sections:
 * Identity · Roles · Businesses · Commerce · Logistics · Finance · Reputation · Communication · Settings
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const B   = '#2563EB';
const DK  = '#0F172A';
const GR  = '#64748B';
const WH  = '#FFFFFF';

const fmt  = n => Number(n||0).toLocaleString();
const fmtD = d => d ? new Date(d).toLocaleDateString('sw-TZ') : '—';

const TIERS = [
  { min:900, name:'KenteXa Elite', icon:'🏆', color:'#DC2626', bg:'#FEE2E2' },
  { min:600, name:'Mshirika Mkuu', icon:'💎', color:'#7C3AED', bg:'#EDE9FE' },
  { min:300, name:'Mwaminifu',     icon:'🌟', color:B,          bg:'#DBEAFE' },
  { min:100, name:'Mwenye Imani',  icon:'⭐', color:'#16A34A',  bg:'#DCFCE7' },
  { min:0,   name:'New',          icon:'🌱', color:GR,         bg:'#F1F5F9' },
];
const getTier = s => TIERS.find(t => Number(s||0) >= t.min) || TIERS[4];

const ROLE_META = {
  user:               { icon:'👤', label:'Buyer',        color:'#475569', bg:'#F1F5F9' },
  seller:             { icon:'🏪', label:'Seller',        color:B,          bg:'#EFF6FF' },
  agent:              { icon:'🏍️', label:'Agent',         color:'#A21CAF',  bg:'#FDF2F8' },
  super_agent:        { icon:'🏢', label:'Super Agent',    color:'#7C3AED',  bg:'#F5F3FF' },
  transport_provider: { icon:'🚌', label:'Transporter',   color:'#D97706',  bg:'#FEF3C7' },
  service_provider:   { icon:'🔧', label:'Mtoa Services',    color:'#16A34A',  bg:'#F0FDF4' },
};

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

  const role = userRole || profile?.role || 'user';

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setLoading(true);
    Promise.allSettled([
      api.get('/auth/profile'),
      api.get('/reputation/my'),
      api.get('/notifications/unread-count'),
    ]).then(([p, r, n]) => {
      if (p.status === 'fulfilled') setProfile(p.value.data);
      if (r.status === 'fulfilled') setRep(r.value.data);
      if (n.status === 'fulfilled') setUnread(n.value.data?.count || n.value.data || 0);
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
        if (!sellerStats && ['seller','admin','manager'].includes(role))
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
    { key:'identity',      icon:'👤', label:'Identity' },
    { key:'roles',         icon:'🏷️', label:'My Roles' },
    isBusinessOwner && { key:'businesses', icon:'🏢', label:'Businesses Zangu' },
    { key:'commerce',      icon:'📦', label:'Businesses' },
    { key:'logistics',     icon:'🚚', label:'Logistics' },
    isPaidRole && { key:'finance', icon:'💰', label:'Finance' },
    { key:'reputation',    icon:'⭐', label:'Reputation' },
    { key:'communication', icon:'💬', label:'Messages', badge: unread },
    { key:'settings',      icon:'⚙️', label:'Settings' },
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
              <div style={{ fontSize:16, fontWeight:900, color:DK }}>👤 My Profile</div>
              <div style={{ fontSize:11, color:GR }}>KenteXa Commerce Identity</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowQR(true)}
                style={{ backgroundColor:'#F1F5F9', border:'none', borderRadius:8,
                  padding:'7px 12px', cursor:'pointer', fontSize:12, fontWeight:700, color:DK }}>
                📲 QR
              </button>
              <button onClick={() => onNavigate('CommerceProfile')}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:8,
                  padding:'7px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                Public Profile →
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
              {profile.logo
                ? <img src={profile.logo} alt=""
                    style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <span style={{ fontSize:28, fontWeight:900 }}>
                    {(profile.name||'K').charAt(0).toUpperCase()}
                  </span>}
            </div>
            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:18, fontWeight:900, lineHeight:1.2 }}>
                {profile.storeName || profile.name || 'Mtumiaji'}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
                📱 {profile.phone}
                {profile.isVerified && ' · ✓ Verified'}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
                📍 {profile.businessLocation || profile.city || 'Tanzania'}
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
        if (['seller','admin','manager'].includes(userRole)) {
          actions.push({
            icon:'📦', label:'New Orders',
            value: sellerStats?.stats?.pendingOrders != null ? String(sellerStats.stats.pendingOrders) : '—',
            sub:'Tap to view', color:B, bg:'#EFF6FF',
            onAction:()=>onNavigate('SellerOrders'),
          });
          actions.push({
            icon:'💰', label:'Revenue',
            value: sellerStats?.stats?.totalRevenue != null ? `TZS ${fmt(sellerStats.stats.totalRevenue)}` : '—',
            sub:'Recent orders', color:'#16A34A', bg:'#F0FDF4',
            onAction:()=>onNavigate('SellerAnalytics'),
          });
        }
        if (userRole === 'agent') {
          actions.push({
            icon:'🏍️', label:'My Jobs',
            value:'View', sub:'Available near you', color:'#A21CAF', bg:'#FDF2F8',
            onAction:()=>onNavigate('AgentDashboard'),
          });
          actions.push({
            icon:'💰', label:'Pending Payout',
            value: agentData?.pendingEarnings != null ? `TZS ${fmt(agentData.pendingEarnings)}` : '—',
            sub:'Earnings', color:'#16A34A', bg:'#F0FDF4',
            onAction:()=>onNavigate('AgentEarnings'),
          });
        }
        if (userRole === 'super_agent') {
          actions.push({
            icon:'📦', label:'Hub Parcels',
            value:'View', sub: saData?.city || 'Your hub', color:'#7C3AED', bg:'#F5F3FF',
            onAction:()=>onNavigate('SuperAgentDashboard'),
          });
        }
        if (userRole === 'transport_provider') {
          actions.push({
            icon:'🚌', label:"Today's Routes",
            value:'View', sub:'Assignments', color:'#D97706', bg:'#FEF3C7',
            onAction:()=>onNavigate('TransportProviderDashboard'),
          });
        }
        actions.push({
          icon:'💬', label:'Messages',
          value: unread > 0 ? String(unread) : '—',
          sub: unread > 0 ? 'New' : 'All read', color: unread>0?'#EF4444':GR,
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
                    {n.badge} new
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
                👤 Taarifa za Msingi
              </div>
              <Row icon="📸" label="Picha ya Profile"
                value={profile?.logo ? '✓ Set' : 'Incomplete'}
                color={profile?.logo ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="✏️" label="Jina Kamili" value={profile?.name || '—'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📱" label="Nambari ya Simu" value={profile?.phone || '—'} />
              <Row icon="✉️" label="Barua Pepe" value={profile?.email || 'Not set'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📍" label="Eneo"
                value={profile?.businessLocation || profile?.city || 'Not set'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📝" label="Maelezo Mafupi"
                value={profile?.storeDescription || profile?.bio ? '✓' : 'Incomplete'}
                color={profile?.storeDescription ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                ✅ Hali ya Uthibitisho
              </div>
              <Row icon="📱" label="Simu Verified"
                value={profile?.isVerified ? '✓ Ndio' : '✗ Bado'}
                color={profile?.isVerified ? '#16A34A' : '#DC2626'} />
              <Row icon="✅" label="Usanidi wa Account"
                value={profile?.onboardingCompleted ? '✓ Umekamilika' : 'Hajakamilika'}
                color={profile?.onboardingCompleted ? '#16A34A' : '#D97706'}
                onAction={() => !profile?.onboardingCompleted && onNavigate('Onboarding')} />
              <Row icon="🪪" label="Kitambulisho (KYC)" 
                value={profile?.kycLevel || 'Not done'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🏢" label="Businesses Verified"
                value={['seller','admin','manager'].includes(role) ? '✓ Ndio' : 'Bado'}
                color={['seller','admin','manager'].includes(role) ? '#16A34A' : GR} />
            </SCard>

            {/* QR Code */}
            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                📲 Msimbo wa QR — KenteXa ID
              </div>
              <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                <QRDisplay
                  value={`${window.location.origin}/?page=CommerceProfile-${profile?.id}`}
                  size={100} />
                <div>
                  <div style={{ fontSize:12, color:GR, lineHeight:1.6, marginBottom:10 }}>
                    Waalike watu wafuate wasifu wako kwa kuonyesha QR code hii.
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:B,
                    backgroundColor:'#EFF6FF', padding:'4px 10px', borderRadius:8,
                    display:'inline-block' }}>
                    KTX-{String(profile?.id||0).padStart(6,'0')}
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
                🏷️ Majukumu Yako Yanayofanya Jobs
              </div>
              <div style={{ fontSize:12, color:GR, marginBottom:14 }}>
                Account moja · Majukumu mengi · Imani moja
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
                        ✓ Tumewa · Inafanya Jobs
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
                      Go →
                    </button>
                  </div>
                );
              })}
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                ➕ Add New Role
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
                      <div style={{ fontSize:11, color:GR }}>Tap to register</div>
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
                🏢 Businesses Zangu
              </div>
              <Row icon="🏪" label="Online Store"
                value={profile?.storeName || 'Not set up yet'}
                onAction={() => onNavigate('StoreSettings')} />
              <Row icon="⚙️" label="Store Settings"
                onAction={() => onNavigate('StoreSettings')} />
              <Row icon="👥" label="Team Members"
                onAction={() => onNavigate('SellerTeam')} />
              <Row icon="🏷️" label="My Products"
                value={fmt(sellerStats?.stats?.totalProducts||0)}
                onAction={() => onNavigate('SellerClassifieds')} />
              <Row icon="🔧" label="My Services"
                value={`${myServices.length} services`}
                onAction={() => onNavigate('MyServices')} />
              <Row icon="📊" label="Business Analytics"
                onAction={() => onNavigate('SellerAnalytics')} />
              <Row icon="📸" label="Share a Moment"
                onAction={() => onOpenMoment?.('selling')} />
              <Row icon="📢" label="My Posts"
                onAction={() => onNavigate('CommerceProfile')} />
            </SCard>

            {sellerStats && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                  📊 Business Overview
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { label:'Revenue', value:`TZS ${fmt(sellerStats.stats?.totalRevenue||0)}`, color:'#16A34A' },
                    { label:'My Orders',  value:fmt(sellerStats.stats?.pendingOrders||0),           color:B },
                    { label:'All Products',    value:fmt(sellerStats.stats?.totalProducts||0),            color:'#7C3AED' },
                    { label:'Customers',         value:fmt(sellerStats.stats?.totalCustomers||0),           color:'#D97706' },
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
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                📦 Activity za Businesses
              </div>
              <Row icon="🛒" label="Orders Yangu" value={fmt(orders.length)}
                onAction={() => onNavigate('MyOrders')} />
              <Row icon="📦" label="Vifurushi / Shipments"
                onAction={() => onNavigate('SellerShipment')} />
              <Row icon="🔍" label="Fuatilia Mzigo"
                onAction={() => onNavigate('TrackParcel')} />
              <Row icon="❤️" label="Wishlist — Zilizohifadhiwa"
                onAction={() => onNavigate('Wishlist')} />
              <Row icon="🏪" label="Businesses I Follow"
                value={fmt(followed.length)} onAction={() => onNavigate('Stores')} />
              <Row icon="📋" label="Hali za Orders"
                onAction={() => onNavigate('MyOrders')} />
            </SCard>

            {orders.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  Orders ya Hivi Nearbyni
                </div>
                {orders.slice(0,5).map(o => (
                  <div key={o.id} onClick={() => onNavigate(`OrderTracking-${o.id}`)}
                    style={{ display:'flex', justifyContent:'space-between',
                      padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                      cursor:'pointer', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK }}>
                        {o.product?.name || o.manualProductName || 'Products'}
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
                🚚 Activity za Transportshaji
              </div>
              {role === 'agent' && (
                <>
                  <Row icon="🏍️" label="Jobs za Utoaji"
                    onAction={() => onNavigate('AgentDashboard')} />
                  <Row icon="💰" label="Mapato ya Agent"
                    value={agentData ? `TZS ${fmt(agentData.totalEarnings)}` : '—'}
                    onAction={() => onNavigate('AgentEarnings')} />
                  <Row icon="📊" label="My Scorecard"
                    onAction={() => onNavigate('AgentScorecard')} />
                  <Row icon="✅" label="Zilizotolewa"
                    value={fmt(agentData?.totalDeliveriesCompleted||0)} />
                </>
              )}
              {role === 'super_agent' && (
                <>
                  <Row icon="🏢" label="Hub Dashboard"
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                  <Row icon="📦" label="Vifurushi vya Hub"
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                  <Row icon="🚌" label="Panga Transport"
                    onAction={() => onNavigate('SuperAgentDashboard')} />
                </>
              )}
              {role === 'transport_provider' && (
                <>
                  <Row icon="🚌" label="Dashibodi ya Routes"
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="📍" label="Njia Zangu"
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="📦" label="Orders ya Mizigo"
                    value={fmt(tpData?.completedAssignments||0)}
                    onAction={() => onNavigate('TransportProviderDashboard')} />
                  <Row icon="🗺️" label="Ramani ya Njia"
                    onAction={() => onNavigate('RouteCoverageMap')} />
                </>
              )}
              {!['agent','super_agent','transport_provider'].includes(role) && (
                <div style={{ textAlign:'center', padding:'24px 0' }}>
                  <div style={{ fontSize:40, marginBottom:8 }}>🚚</div>
                  <div style={{ fontSize:13, color:GR, marginBottom:12 }}>
                    Jiunge kama Agent au Transporter ili kupata kazi za logistics
                  </div>
                  <button onClick={() => onNavigate('RoleActivation')}
                    style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                      padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    Add Role
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
                💰 Finance na Malipo
              </div>
              <Row icon="💳" label="Malipo Yangu"
                value={`${payments.length} malipo`}
                onAction={() => onNavigate('SellerPayouts')} />
              <Row icon="📄" label="Ankara / Invoices"
                value={`${invoices.length} ankara`}
                onAction={() => onNavigate('SellerInvoices')} />
              <Row icon="💸" label="Payout Method"
                value={profile?.payoutMethod || 'Not set'}
                color={profile?.payoutMethod ? '#16A34A' : '#DC2626'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🏦" label="Benki / Account"
                value={profile?.payoutAccountName || 'Not set'}
                onAction={() => onNavigate('CustomerProfile')} />
              {role === 'agent' && (
                <Row icon="💰" label="Mapato ya Agent"
                  value={agentData ? `TZS ${fmt(agentData.totalEarnings)}` : '—'}
                  onAction={() => onNavigate('AgentEarnings')} />
              )}
              {['seller','admin','manager'].includes(role) && (
                <Row icon="📊" label="Overview wa Mapato"
                  onAction={() => onNavigate('SellerPayouts')} />
              )}
            </SCard>

            {payments.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  Miamala ya Hivi Nearbyni
                </div>
                {payments.slice(0,5).map((p, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                    alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK }}>
                        {p.description || p.type || 'Malipo'}
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
                Score za Imani / 1000
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
                Trust Tiers
              </div>
              {[...TIERS].reverse().map(t => (
                <div key={t.name} style={{ display:'flex', alignItems:'center', gap:12,
                  padding:'10px 0', borderBottom:'1px solid #F8FAFC',
                  opacity: score >= t.min ? 1 : 0.4 }}>
                  <span style={{ fontSize:22 }}>{t.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:t.color }}>{t.name}</div>
                    <div style={{ fontSize:10, color:GR }}>Score {t.min}+</div>
                  </div>
                  {score >= t.min
                    ? <span style={{ fontSize:10, fontWeight:800, backgroundColor:t.bg,
                        color:t.color, padding:'2px 8px', borderRadius:100 }}>✓ Achieved</span>
                    : <span style={{ fontSize:10, color:GR }}>{t.min - score} zaidi</span>}
                </div>
              ))}
            </SCard>

            {/* Score breakdown */}
            {rep?.breakdown && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  Mgawanyo wa Score
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
                  Historia ya Score
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
                💬 Messages
              </div>
              <Row icon="📨" label="Ujumbe" sub="Inbox ya Businesses"
                onAction={() => onNavigate('SellerInbox')} />
              <Row icon="🔔" label="Arifa" value={unread > 0 ? `${unread} mpya` : 'Zimeachwa'}
                color={unread>0?'#EF4444':GR}
                onAction={() => onNavigate('Activity')} />
              <Row icon="📢" label="Masasisho ya Businesses"
                sub="Products mpya kutoka kwa biashara unazofuata"
                onAction={() => onNavigate('Home')} />
              <Row icon="🎧" label="Msaada"
                onAction={() => onNavigate('ContactUs')} />
            </SCard>

            {notifs.length > 0 && (
              <SCard>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  Arifa za Hivi Nearbyni
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
                  Ona Arifa All →
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
                👤 Account
              </div>
              <Row icon="✏️" label="Edit Profile"
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🏪" label="Settings ya Store"
                onAction={() => onNavigate('StoreSettings')} />
              <Row icon="🪪" label="Thibitisha Kitambulisho (KYC)"
                onAction={() => onNavigate('CustomerProfile')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                💳 Malipo
              </div>
              <Row icon="🏦" label="Payout Method"
                value={profile?.payoutMethod || 'Not set'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="👤" label="Jina la Account"
                value={profile?.payoutAccountName || '—'}
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="🏛️" label="Benki"
                value={profile?.payoutBankName || '—'}
                onAction={() => onNavigate('CustomerProfile')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                🔒 Security & Privacy
              </div>
              <Row icon="🔑" label="Change Password"
                onAction={() => onNavigate('CustomerProfile')} />
              <Row icon="📱" label="Thibitisha Simu"
                value={profile?.isVerified ? '✓ Imethitbishwa' : 'Bado'}
                color={profile?.isVerified ? '#16A34A' : '#DC2626'} />
              <Row icon="🛡️" label="Faragha"
                onAction={() => onNavigate('PrivacyPolicy')} />
              <Row icon="📋" label="Masharti ya Matumizi"
                onAction={() => onNavigate('TermsAndConditions')} />
            </SCard>

            <SCard>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:14 }}>
                ℹ️ About KenteXa
              </div>
              <Row icon="🌐" label="Toleo" value="v2.0 — Commerce Identity" />
              <Row icon="📞" label="Contact Nasi"
                onAction={() => onNavigate('ContactUs')} />
              <Row icon="❓" label="Jinsi Inavyofanya Jobs"
                onAction={() => onNavigate('HowItWorks')} />
            </SCard>

            {/* Logout */}
            <div style={{ backgroundColor:'#FEF2F2', borderRadius:14, padding:16,
              border:'1px solid #FECACA' }}>
              <button onClick={() => {
                if (window.confirm('Una uhakika unataka kutoka?')) {
                  onLogout?.();
                  onNavigate('Home');
                }
              }}
                style={{ width:'100%', backgroundColor:'#DC2626', color:WH,
                  border:'none', borderRadius:10, padding:'14px 0',
                  cursor:'pointer', fontSize:14, fontWeight:800 }}>
                🚪 Logout
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
              📲 KenteXa ID Yangu
            </div>
            <div style={{ fontSize:12, color:GR, marginBottom:20 }}>
              Onyesha hii ili watu wafuate wasifu wako
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
              {profile?.storeName || profile?.name}
            </div>
            <button onClick={() => setShowQR(false)}
              style={{ width:'100%', backgroundColor:'#F1F5F9', color:DK,
                border:'none', borderRadius:10, padding:'12px 0',
                cursor:'pointer', fontSize:14, fontWeight:700 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyProfile;