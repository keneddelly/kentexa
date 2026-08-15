/**
 * CommerceProfile.js — Role-aware identity profile
 * Place at: src/public/pages/CommerceProfile.js
 *
 * Same page for all users — tabs change based on active roles.
 * Own profile shows dashboard actions. Others' profiles show public info.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReputationBadge from '../components/ReputationBadge';
import ProfileCompletion from '../components/ProfileCompletion';
import CommerceCommentSection from '../components/CommerceCommentSection';
import api             from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const fmt  = n => Number(n||0).toLocaleString();
const fmtM = n => { const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1000?`${(v/1e3).toFixed(0)}K`:String(v); };

const getTiers = t => [
  {min:900,name:t('my_profile.tier_elite'),  icon:'🏆',color:'#dc2626',bg:'#fee2e2'},
  {min:600,name:t('my_profile.tier_partner'),icon:'💎',color:'#7c3aed',bg:'#ede9fe'},
  {min:300,name:t('my_profile.tier_loyal'),  icon:'🌟',color:'#1d4ed8',bg:'#dbeafe'},
  {min:100,name:t('my_profile.tier_trusted'),icon:'⭐',color:'#16a34a',bg:'#dcfce7'},
  {min:0,  name:t('my_profile.tier_new'),    icon:'🌱',color:'#64748b',bg:'#f1f5f9'},
];

// ─── Stat pill ────────────────────────────────────────────────────────────────
const Stat = ({ value, label, onClick }) => (
  <div onClick={onClick}
    style={{ textAlign:'center', padding:'8px 12px', cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ fontSize:18, fontWeight:900, color:DK }}>{value}</div>
    <div style={{ fontSize:10, color:GR, marginTop:2, fontWeight:600 }}>{label}</div>
  </div>
);

// ─── Action button ────────────────────────────────────────────────────────────
const Action = ({ icon, label, onClick, color=B, bg='#eff6ff' }) => (
  <button onClick={onClick}
    style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:4, backgroundColor:bg, border:'none', borderRadius:14,
      padding:'14px 12px', cursor:'pointer', flex:1, minWidth:0 }}>
    <span style={{ fontSize:22 }}>{icon}</span>
    <span style={{ fontSize:11, fontWeight:700, color, textAlign:'center', lineHeight:1.3 }}>
      {label}
    </span>
  </button>
);

// ─── Quick action grid by role ────────────────────────────────────────────────
const RoleActions = ({ role, onNavigate }) => {
  const { t } = useTranslation();
  const actions = {
    seller: [
      {icon:'📦',label:t('commerce_profile.action_orders'),    page:'SellerOrders',     bg:'#eff6ff', color:B},
      {icon:'🏷️',label:t('commerce_profile.action_products'),    page:'SellerClassifieds', bg:'#f0fdf4', color:'#16a34a'},
      {icon:'📊',label:t('commerce_profile.action_analytics'),  page:'SellerAnalytics',  bg:'#f5f3ff', color:'#7c3aed'},
      {icon:'📢',label:t('commerce_profile.action_listing'),    page:'CommerceProfile',  bg:'#fff7ed', color:'#ea580c'},
      {icon:'👥',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
      {icon:'💳',label:t('commerce_profile.action_payments'),     page:'SellerPayouts',    bg:'#fef9c3', color:'#ca8a04'},
    ],
    agent: [
      {icon:'🏍️',label:t('commerce_profile.action_my_jobs'), page:'AgentDashboard',   bg:'#fdf2f8', color:'#a21caf'},
      {icon:'💰',label:t('commerce_profile.action_earnings'),     page:'AgentEarnings',    bg:'#f0fdf4', color:'#16a34a'},
      {icon:'📊',label:t('commerce_profile.action_scorecard'),  page:'AgentScorecard',   bg:'#eff6ff', color:B},
      {icon:'📦',label:t('commerce_profile.action_parcels'),  page:'AgentDashboard',   bg:'#fff7ed', color:'#ea580c'},
    ],
    super_agent: [
      {icon:'🏢',label:t('commerce_profile.action_my_hub'),  page:'SuperAgentDashboard',bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'📦',label:t('commerce_profile.action_parcels'),  page:'SuperAgentDashboard',bg:'#eff6ff',color:B},
      {icon:'🚌',label:t('commerce_profile.action_transport'),    page:'SuperAgentDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📊',label:t('commerce_profile.action_analytics'),  page:'SuperAgentDashboard',bg:'#f0fdf4',color:'#16a34a'},
    ],
    transport_provider: [
      {icon:'🚌',label:t('commerce_profile.action_my_routes'),page:'TransportProviderDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📅',label:t('commerce_profile.action_availability'),page:'TransportProviderDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'📦',label:t('commerce_profile.action_orders'),    page:'TransportProviderDashboard',bg:'#eff6ff',color:B},
      {icon:'🗺️',label:t('commerce_profile.action_my_routes'), page:'RouteCoverageMap',          bg:'#f5f3ff',color:'#7c3aed'},
    ],
  };

  // Buyer actions (everyone)
  const buyerActions = [
    {icon:'📦',label:t('commerce_profile.action_my_orders'),page:'MyOrders',       bg:'#eff6ff', color:B},
    {icon:'❤️',label:t('commerce_profile.action_saved'),page:'Wishlist',     bg:'#fff1f2', color:'#e11d48'},
    {icon:'🔍',label:t('commerce_profile.action_discover'),        page:'Search',        bg:'#f0fdf4', color:'#16a34a'},
    {icon:'🏷️',label:t('commerce_profile.action_list_item'),       page:'SellerClassifieds',bg:'#fef9c3',color:'#ca8a04'},
  ];

  const roleActions = actions[role] || [];
  const allActions  = [...roleActions, ...buyerActions].slice(0, 8);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8,
      padding:'0 16px', marginBottom:4 }}>
      {allActions.map((a, i) => (
        <Action key={i} icon={a.icon} label={a.label}
          onClick={() => onNavigate(a.page)}
          color={a.color} bg={a.bg} />
      ))}
    </div>
  );
};

// ─── Tab content sections ─────────────────────────────────────────────────────
// Takes the full activeRoles array, not just the single primary `role` — a
// multi-role account (e.g. seller + agent + transport_provider all active)
// should show every applicable identity tab, not just whichever role was
// activated most recently (which is all the old single-role check could
// ever reflect, since `role` only ever holds one value at a time).
const tabs = (activeRoles, isOwn, t) => {
  const has = (r) => activeRoles.includes(r);
  const base = [{ key:'posts',      label:t('commerce_profile.tab_products')   }];
  if (isOwn && (has('seller') || has('admin') || has('manager'))) {
    base.push(
      { key:'feed',       label:t('commerce_profile.tab_posts') },
      { key:'orders',     label:t('commerce_profile.tab_orders')   },
      { key:'analytics',  label:t('commerce_profile.tab_analytics') },
    );
  }
  // Identity tabs — public for everyone, not just the owner. What differs
  // by isOwn is the CONTENT (public stats vs. private earnings/dashboard
  // shortcut), not whether the tab is visible at all.
  if (has('agent')) {
    base.push({ key:'jobs', label:t('commerce_profile.tab_agent') });
  }
  if (has('super_agent')) {
    base.push({ key:'hub', label:t('commerce_profile.tab_hub') });
  }
  if (has('transport_provider')) {
    base.push({ key:'transport', label:t('commerce_profile.tab_routes') });
  }
  if (isOwn) {
    base.push({ key:'services', label:t('commerce_profile.tab_services') });
  }
  base.push({ key:'reputation', label:t('commerce_profile.tab_reputation') });
  return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
const CommerceProfile = ({ onNavigate, isLoggedIn, onLogout, userRole,
  currentUser, pageParam }) => {
  const { t } = useTranslation();
  const TIERS = getTiers(t);
  const getTier = s => TIERS.find(tier => Number(s||0) >= tier.min) || TIERS[4];

  // pageParam is usually just a numeric seller id, but notification deep-links
  // may append a tab and a specific post id, e.g. "42-feed-17" — split it off
  // before parsing the number so a suffix never turns targetId into NaN (NaN
  // is falsy, which used to make isOwnProfile true and silently redirect
  // people to their OWN profile instead of the seller's).
  const [rawTargetId, deepLinkTab, deepLinkPostId] = String(pageParam || '').split('-');
  const targetId   = rawTargetId ? Number(rawTargetId) : null;
  const isOwnProfile = !targetId || (currentUser && targetId === currentUser.id);
  const highlightPostId = deepLinkPostId ? Number(deepLinkPostId) : null;
  const highlightPostRef = React.useRef(null);

  const [profile,    setProfile]    = useState(null);
  const [rep,        setRep]        = useState(null);
  const [feed,       setFeed]       = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [services,   setServices]   = useState([]);
  const [classifieds,setClassifieds]= useState([]);
  const [products,   setProducts]   = useState([]);
  const [agentData,  setAgentData]  = useState(null);
  const [publicAgentData,     setPublicAgentData]     = useState(null);
  const [publicHubData,       setPublicHubData]       = useState(null);
  const [publicTransportData, setPublicTransportData] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('posts');
  const [following,  setFollowing]  = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [followers,      setFollowers]    = useState([]);
  const [loadingFollowers, setLoadingFollowers] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPost,   setShowPost]   = useState(false);
  const [postForm,   setPostForm]   = useState({
    type:'new_product', title:'', body:'', ctaLabel:''
  });

  useEffect(() => {
    setLoading(true);
    setTab(deepLinkTab === 'feed' ? 'feed' : 'posts');

    const uid = targetId || currentUser?.id || 0;

    Promise.allSettled([
      api.get(targetId ? `/seller/public/${targetId}` : '/auth/profile'),
      api.get(targetId ? `/reputation/user/${targetId}` : '/reputation/my'),
      api.get(`/feed/business/${uid}`),
      isOwnProfile ? api.get('/orders/my-orders?limit=5') : Promise.resolve({data:[]}),
      isOwnProfile ? api.get('/services/my') : Promise.resolve({data:[]}),
      (isOwnProfile && userRole==='agent') ? api.get('/agents/my-profile') : Promise.resolve({data:null}),
      targetId ? api.get(`/stores/${targetId}`) : Promise.resolve({data:null}),
      uid ? api.get(`/classifieds/seller/${uid}`) : Promise.resolve({data:[]}),
      uid ? api.get(`/products/seller/${uid}`)    : Promise.resolve({data:[]}),
    ]).then(([p,r,f,o,s,a,st,cl,pr]) => {
      if (p.status==='fulfilled') setProfile(p.value.data);
      if (r.status==='fulfilled') setRep(r.value.data);
      if (f.status==='fulfilled') setFeed(f.value.data || []);
      if (o.status==='fulfilled') setOrders(o.value.data?.orders || o.value.data || []);
      if (s.status==='fulfilled') setServices(s.value.data || []);
      if (a.status==='fulfilled') setAgentData(a.value.data);
      if (st.status==='fulfilled' && st.value.data) setFollowing(!!st.value.data.isFollowing);
      else setFollowing(false);
      if (cl.status==='fulfilled') setClassifieds(cl.value.data || []);
      if (pr.status==='fulfilled') setProducts(pr.value.data || []);
    }).finally(() => setLoading(false));
  }, [targetId]); // eslint-disable-line

  // Fetch public role-identity info for every ACTIVE role the target holds
  // (not just their current primary `role`) — a multi-role account (seller
  // + agent + transport_provider all active) needs all three tabs' data
  // available, not just whichever role happens to be primary right now.
  useEffect(() => {
    const uid = targetId || currentUser?.id;
    if (!uid || !profile) return;
    const activeRoles = [profile.role, ...(profile.activeRoles || [])].filter((r,i,a) => a.indexOf(r)===i);

    if (activeRoles.includes('agent')) {
      api.get(`/agents/public/${uid}`).then(r => setPublicAgentData(r.data)).catch(() => setPublicAgentData(null));
    }
    if (activeRoles.includes('super_agent')) {
      api.get(`/super-agents/public/${uid}`).then(r => setPublicHubData(r.data)).catch(() => setPublicHubData(null));
    }
    if (activeRoles.includes('transport_provider')) {
      api.get(`/transport/public/${uid}`).then(r => setPublicTransportData(r.data)).catch(() => setPublicTransportData(null));
    }
  }, [profile, targetId]); // eslint-disable-line

  // Deep-linked from a "New save"/"New comment" notification — scroll to and
  // highlight that specific post once it's loaded into the Feed tab.
  useEffect(() => {
    if (!highlightPostId || tab !== 'feed' || !feed.length || !highlightPostRef.current) return;
    highlightPostRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [feed, tab, highlightPostId]);


  const handleFollow = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const res = await api.post(`/stores/${targetId}/follow`);
      setFollowing(res.data.following ?? !following);
    } catch {}
  };

  const handlePublish = async () => {
    if (!postForm.title.trim()) return;
    try {
      setPublishing(true);
      const res = await api.post('/feed/publish', postForm);
      setFeed(prev => [res.data, ...prev]);
      setShowPost(false);
      setPostForm({ type:'new_product', title:'', body:'', ctaLabel:'' });
    } catch {}
    finally { setPublishing(false); }
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'Manrope,Inter,sans-serif' }}>
      <div style={{ textAlign:'center', color:'#94a3b8' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>👤</div>
        <div>{t('commerce_profile.loading_profile')}</div>
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc', display:'flex',
      flexDirection:'column', fontFamily:'Manrope,Inter,sans-serif' }}>
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #f1f5f9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={DK} strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:64 }}>😕</div>
          <div style={{ marginTop:12 }}>{t('commerce_profile.profile_not_found')}</div>
        </div>
      </div>
    </div>
  );

  const score     = rep?.score || profile.reputationScore || 0;
  const tier      = getTier(score);
  // `role` = the account's current primary role — still used for things
  // that can only ever be one thing at a time (which brand the header
  // shows). `activeRoles` = every role this account holds simultaneously
  // (always includes `role` itself) — used for anything that should show
  // ALL of a multi-role account's identities, like the profile's tabs.
  const role        = profile.role || userRole || 'user';
  const activeRoles = [role, ...(profile.activeRoles || [])].filter((r,i,a) => a.indexOf(r)===i);
  const profileTabs = tabs(activeRoles, isOwnProfile, t);

  // Which brand the header shows follows the TAB being viewed, not the
  // account's primary `role` — role is just whichever identity was
  // approved most recently and has nothing to do with why a visitor is
  // here. Someone on the Products tab is here to buy something from the
  // seller; someone who's switched to Routes is here for the transport
  // side. Pinning the header to `role` meant a buyer looking at a seller's
  // camera listing would see whatever business was approved last (e.g. a
  // transport company), not the store they actually came for.
  const displayName  = (tab === 'transport' && publicTransportData?.name)
    ? publicTransportData.name
    : (tab === 'hub' && publicHubData?.businessName)
    ? publicHubData.businessName
    : (profile.storeName || profile.name);
  const displayPhoto = (tab === 'transport' && publicTransportData?.logoUrl)
    ? publicTransportData.logoUrl
    : (profile.avatarUrl || profile.logo);

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc', paddingBottom:100,
      fontFamily:'Manrope,Inter,-apple-system,sans-serif' }}>

      {/* Top bar */}
      <div style={{ position:'sticky', top:0, zIndex:100,
        backgroundColor:WH, borderBottom:'1px solid #f1f5f9',
        display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
        boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        <button onClick={() => onNavigate('back')}
          style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={DK} strokeWidth="2.5">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <div style={{ flex:1, fontSize:15, fontWeight:900, color:DK, overflow:'hidden',
          textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {displayName || t('commerce_profile.profile_fallback')}
        </div>
        {isOwnProfile && (
          <button onClick={() => onNavigate('MyProfile')}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:B, fontSize:13, fontWeight:700 }}>
            {t('commerce_profile.edit_button')}
          </button>
        )}
      </div>

      {/* Cover */}
      <div style={{ position:'relative' }}>
        <div style={{ height:140, overflow:'hidden',
          background: profile.coverImage
            ? `url(${profile.coverImage}) center/cover`
            : 'linear-gradient(135deg,#1e1b4b,#1d4ed8)' }} />

        {/* Avatar */}
        <div style={{ position:'absolute', bottom:-36, left:16,
          width:76, height:76, borderRadius:20,
          border:'4px solid #fff', overflow:'hidden',
          backgroundColor:B,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:32, color:'#fff', fontWeight:900,
          boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>
          {displayPhoto
            ? <img src={displayPhoto} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : (displayName||'K').charAt(0).toUpperCase()}
        </div>

        {/* Action buttons top-right */}
        <div style={{ position:'absolute', bottom:-24, right:16,
          display:'flex', gap:8 }}>
          {isOwnProfile ? (
            <button onClick={() => onNavigate('RoleActivation')}
              style={{ backgroundColor:WH, color:B,
                border:'1px solid #e2e8f0', borderRadius:10,
                padding:'8px 16px', cursor:'pointer',
                fontSize:12, fontWeight:800,
                boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
              {t('commerce_profile.add_role_button')}
            </button>
          ) : (
            <>
              <button onClick={handleFollow}
                style={{ backgroundColor: following ? WH : B,
                  color: following ? GR : WH,
                  border:`1px solid ${following ? '#e2e8f0' : B}`,
                  borderRadius:10, padding:'8px 16px',
                  cursor:'pointer', fontSize:12, fontWeight:800,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
                {following ? t('commerce_profile.unfollow_button') : t('commerce_profile.follow_button')}
              </button>
              <button onClick={() => onNavigate(isLoggedIn ? `MessageSeller-${targetId}` : 'PublicLogin')}
                style={{ backgroundColor:'#eff6ff', color:B,
                  border:'1px solid #bfdbfe', borderRadius:10,
                  padding:'8px 14px', cursor:'pointer',
                  fontSize:12, fontWeight:800,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
                {t('commerce_profile.message_button')}
              </button>
              {(profile.storeWhatsApp || profile.phone) && (
                <a href={`https://wa.me/${(profile.storeWhatsApp||profile.phone).replace(/^0/,'255').replace(/[^0-9]/g,'')}`}
                  target="_blank" rel="noreferrer"
                  style={{ backgroundColor:'#dcfce7', color:'#16a34a',
                    border:'1px solid #bbf7d0', borderRadius:10,
                    padding:'8px 12px', cursor:'pointer', fontSize:16,
                    textDecoration:'none', display:'flex', alignItems:'center',
                    boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
                  📲
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Profile info */}
      <div style={{ backgroundColor:WH, paddingTop:50, paddingBottom:4,
        paddingLeft:16, paddingRight:16, marginBottom:4 }}>

        {/* Name + verified */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:20, fontWeight:900, color:DK, margin:0 }}>
            {displayName || t('commerce_profile.default_name')}
          </h1>
          {profile.isOfficialStore && (
            <span style={{ fontSize:16 }} title={t('commerce_profile.verified_title')}>✅</span>
          )}
          <ReputationBadge score={score} size="sm" />
        </div>

        {/* Kentexa ID — the identity anchor across the whole site */}
        {profile.kentexaId && (
          <div style={{ fontSize:11, fontWeight:700, color:B, marginBottom:8,
            display:'inline-flex', alignItems:'center', gap:4,
            backgroundColor:'#eff6ff', border:'1px solid #bfdbfe',
            borderRadius:100, padding:'2px 10px', letterSpacing:0.5 }}>
            🆔 {profile.kentexaId}
          </div>
        )}

        {/* Role badges */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
          {activeRoles.includes('seller')             && <span style={pillStyle('#eff6ff',B)}>{t('commerce_profile.role_seller')}</span>}
          {activeRoles.includes('agent')              && <span style={pillStyle('#fdf2f8','#a21caf')}>{t('commerce_profile.role_agent')}</span>}
          {activeRoles.includes('super_agent')        && <span style={pillStyle('#f5f3ff','#7c3aed')}>{t('commerce_profile.role_super_agent')}</span>}
          {activeRoles.includes('transport_provider') && <span style={pillStyle('#fff7ed','#ea580c')}>{t('commerce_profile.role_transporter')}</span>}
          {                               <span style={pillStyle('#f1f5f9',GR)}>{t('commerce_profile.role_buyer')}</span>}
          {profile.businessLocation && (
            <span style={{ fontSize:11, color:GR }}>📍 {profile.businessLocation}</span>
          )}
        </div>

        {/* Bio */}
        {(profile.storeDescription || profile.bio) && (
          <p style={{ fontSize:13, color:'#475569', margin:'0 0 10px',
            lineHeight:1.5 }}>
            {profile.storeDescription || profile.bio}
          </p>
        )}

        {/* Stats */}
        <div style={{ display:'flex', borderTop:'1px solid #f1f5f9',
          marginTop:8 }}>
          <Stat value={fmtM(profile.completedOrders||0)} label={t('commerce_profile.stat_sales')} />
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={fmtM(profile.followersCount||0)} label={t('commerce_profile.stat_followers')}
            onClick={!isOwnProfile ? undefined : () => {
              setShowFollowers(true);
              if (followers.length) return;
              setLoadingFollowers(true);
              api.get('/stores/me/followers')
                .then(r => setFollowers(r.data || []))
                .catch(() => setFollowers([]))
                .finally(() => setLoadingFollowers(false));
            }} />
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={Number(profile.rating||0).toFixed(1)} label={t('commerce_profile.stat_rating')} />
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={score} label={t('commerce_profile.stat_reputation')} />
        </div>
      </div>

      {/* Profile completion (own profile only) */}
      {isOwnProfile && (
        <div style={{ padding:'0 16px', marginBottom:4 }}>
          <ProfileCompletion
            currentUser={profile}
            userRole={userRole}
            onNavigate={onNavigate}
            compact={true}
          />
        </div>
      )}

      {/* Role quick actions (own profile only) */}
      {isOwnProfile && (
        <div style={{ backgroundColor:WH, padding:'14px 0',
          marginBottom:4,
          boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <RoleActions role={role} onNavigate={onNavigate} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #f1f5f9',
        position:'sticky', top:52, zIndex:90,
        display:'flex', overflowX:'auto', scrollbarWidth:'none' }}>
        {profileTabs.map(tabItem => (
          <button key={tabItem.key} onClick={() => {
            setTab(tabItem.key);
            if (tabItem.key==='services' && services.length===0) {
              api.get('/services/my').then(r=>setServices(r.data||[])).catch(()=>{});
            }
          }}
            style={{ padding:'12px 16px', border:'none', cursor:'pointer',
              backgroundColor:'transparent', fontSize:12, fontWeight:700,
              whiteSpace:'nowrap', flexShrink:0,
              color: tab===tabItem.key ? B : GR,
              borderBottom: tab===tabItem.key ? `2px solid ${B}` : '2px solid transparent' }}>
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding:'16px 16px 32px', maxWidth:900,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* Posts / Products — clean Instagram-style photo grid, no
            price/title/stats baked into the cells. Tap opens the normal
            detail page; editing (owner-only) lives behind that page's
            ••• menu instead of an icon sitting on the grid. */}
        {tab==='posts' && (
          <div>
            {(classifieds.length === 0 && products.length === 0) ? (
              <Empty icon="🏷️" text={t('commerce_profile.no_products_yet')}
                action={isOwnProfile ? t('commerce_profile.add_product_action') : null}
                onAction={() => onNavigate('SellerClassifieds')} />
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }}>
                {[
                  ...products.map(p => ({ kind:'product', id:p.id, image:p.images?.[0], icon:'🛍️',
                    createdAt:p.createdAt, available:p.isAvailable })),
                  ...classifieds.map(c => ({ kind:'classified', id:c.id, image:c.images?.[0], icon:'🏷️',
                    createdAt:c.createdAt })),
                ]
                  .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
                  .map(item => (
                    <div key={`${item.kind}-${item.id}`}
                      onClick={() => onNavigate(item.kind==='product'
                        ? `ProductDetail-${item.id}` : `ClassifiedDetail-${item.id}`)}
                      style={{ position:'relative', aspectRatio:'1', backgroundColor:'#F8FAFC',
                        cursor:'pointer', overflow:'hidden' }}>
                      {item.image
                        ? <img src={item.image} alt=""
                            style={{ width:'100%', height:'100%', objectFit:'cover' }}
                            onError={e => e.target.style.display='none'} />
                        : <div style={{ width:'100%', height:'100%', display:'flex',
                            alignItems:'center', justifyContent:'center', fontSize:28 }}>
                            {item.icon}
                          </div>}
                      <span style={{ position:'absolute', top:4, right:4, fontSize:11 }}>
                        {item.icon}
                      </span>
                      {item.kind==='product' && item.available===false && (
                        <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(15,23,42,0.55)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:10, fontWeight:800, color:WH }}>
                          {t('commerce_profile.out_of_stock')}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Feed / Posts */}
        {tab==='feed' && (
          <div>
            {isOwnProfile && (
              <div style={{ marginBottom:16 }}>
                {!showPost ? (
                  <button onClick={() => setShowPost(true)}
                    style={{ width:'100%', backgroundColor:WH,
                      border:'1.5px dashed #93c5fd', borderRadius:14,
                      padding:16, cursor:'pointer', fontSize:14,
                      fontWeight:700, color:B,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                    {t('commerce_profile.post_listing_button')}
                  </button>
                ) : (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                    boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:14 }}>
                      {t('commerce_profile.new_listing_title')}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                      gap:8, marginBottom:12 }}>
                      {[
                        {value:'new_product',  label:t('commerce_profile.type_new_product')},
                        {value:'discount',     label:t('commerce_profile.type_discount')},
                        {value:'announcement', label:t('commerce_profile.type_announcement')},
                        {value:'restock',      label:t('commerce_profile.type_restock')},
                      ].map(opt => (
                        <label key={opt.value}
                          style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'10px 12px', borderRadius:10, cursor:'pointer',
                            border:`2px solid ${postForm.type===opt.value?B:'#e2e8f0'}`,
                            backgroundColor:postForm.type===opt.value?'#eff6ff':WH }}>
                          <input type="radio" name="ft" value={opt.value}
                            checked={postForm.type===opt.value}
                            onChange={e=>setPostForm(f=>({...f,type:e.target.value}))} />
                          <span style={{ fontSize:12, fontWeight:700 }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <input style={inputSt} placeholder={t('commerce_profile.title_placeholder')}
                      value={postForm.title}
                      onChange={e=>setPostForm(f=>({...f,title:e.target.value}))} />
                    <textarea style={{...inputSt, minHeight:80, resize:'vertical',
                      display:'block', marginBottom:10}}
                      placeholder={t('commerce_profile.body_placeholder')}
                      value={postForm.body}
                      onChange={e=>setPostForm(f=>({...f,body:e.target.value}))} />
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>setShowPost(false)}
                        style={{ flex:1, backgroundColor:'#f1f5f9', color:GR,
                          border:'none', borderRadius:10, padding:'11px 0',
                          cursor:'pointer', fontSize:14, fontWeight:700 }}>
                        {t('commerce_profile.close_button')}
                      </button>
                      <button onClick={handlePublish} disabled={publishing}
                        style={{ flex:2, background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                          color:WH, border:'none', borderRadius:10, padding:'11px 0',
                          cursor:publishing?'not-allowed':'pointer',
                          fontSize:14, fontWeight:800 }}>
                        {publishing ? t('commerce_profile.posting_button') : t('commerce_profile.post_button')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {feed.length === 0
              ? <Empty icon="📢" text={t('commerce_profile.no_announcements')} />
              : feed.map(f => (
                  <FeedPost key={f.id} f={f} onNavigate={onNavigate}
                    isLoggedIn={isLoggedIn} currentUser={currentUser}
                    highlighted={highlightPostId === f.id}
                    postRef={highlightPostId === f.id ? highlightPostRef : null} />
                ))}
          </div>
        )}

        {/* Orders */}
        {tab==='orders' && (
          <div>
            {orders.length === 0
              ? <Empty icon="📦" text={t('commerce_profile.no_orders')}
                  action={t('commerce_profile.go_to_market_button')} onAction={()=>onNavigate('Classifieds')} />
              : orders.map(o => (
                  <div key={o.id}
                    onClick={()=>onNavigate(`TrackParcel-${o.trackingNumber||o.id}`)}
                    style={{ backgroundColor:WH, borderRadius:14, padding:16,
                      marginBottom:10, cursor:'pointer',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:DK }}>
                          {o.product?.name || o.manualProductName || t('commerce_profile.product_fallback')}
                        </div>
                        <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                          {o.trackingNumber} · {new Date(o.createdAt).toLocaleDateString('sw-TZ')}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:14, fontWeight:900, color:B }}>
                          TZS {fmt(o.totalAmount)}
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, marginTop:2,
                          color:o.status==='completed'?'#16a34a':'#d97706',
                          textTransform:'capitalize' }}>
                          {o.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        )}

        {/* Services */}
        {tab==='services' && (
          <div>
            {isOwnProfile && (
              <button onClick={()=>onNavigate('PostService')}
                style={{ width:'100%', marginBottom:16, backgroundColor:WH,
                  border:'1.5px dashed #bbf7d0', borderRadius:14,
                  padding:14, cursor:'pointer', fontSize:14,
                  fontWeight:700, color:'#16a34a',
                  boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                {t('commerce_profile.add_service_button')}
              </button>
            )}
            {services.length === 0
              ? <Empty icon="🔧" text={t('commerce_profile.no_services')} />
              : <div style={{ display:'grid',
                  gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                  {services.map(s => (
                    <div key={s.id}
                      onClick={()=>onNavigate(`ServiceDetail-${s.id}`)}
                      style={{ backgroundColor:WH, borderRadius:14, padding:16,
                        cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                      <span style={{ fontSize:11, fontWeight:700,
                        backgroundColor:'#f0fdf4', color:'#16a34a',
                        padding:'3px 10px', borderRadius:100,
                        display:'inline-block', marginBottom:8 }}>
                        🔧 {s.category}
                      </span>
                      <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:4 }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize:14, fontWeight:900, color:B }}>
                        {s.priceType==='negotiate' ? t('search.negotiate_price')
                         : s.priceType==='free_quote' ? t('search.request_quote')
                         : `TZS ${fmt(s.price)}`}
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        )}

        {/* Agent */}
        {tab==='jobs' && (
          <div>
            {isOwnProfile ? (
              <>
                <button onClick={()=>onNavigate('AgentDashboard')}
                  style={{ width:'100%', backgroundColor:B, color:WH,
                    border:'none', borderRadius:12, padding:'14px 0',
                    cursor:'pointer', fontSize:15, fontWeight:800 }}>
                  {t('commerce_profile.go_to_agent_dashboard')}
                </button>
                {agentData && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                    marginTop:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    {[
                      [t('commerce_profile.completed_deliveries_label'), agentData.totalDeliveriesCompleted||0, '#16a34a'],
                      [t('commerce_profile.total_earnings_label'), `TZS ${fmt(agentData.totalEarnings||0)}`, B],
                      [t('commerce_profile.rating_label'), `${Number(agentData.rating||0).toFixed(1)}/5.0`, '#d97706'],
                    ].map(([l,v,c]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between',
                        padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                        <span style={{ fontSize:13, color:GR }}>{l}</span>
                        <span style={{ fontSize:14, fontWeight:900, color:c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : !publicAgentData ? (
              <Empty icon="🏍️" text={t('commerce_profile.agent_profile_unavailable')} />
            ) : (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>🏍️</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900, color:DK }}>
                      {publicAgentData.fullName || t('commerce_profile.delivery_agent_fallback')}
                    </div>
                    <div style={{ fontSize:12, color:GR }}>
                      📍 {publicAgentData.district || publicAgentData.city || t('commerce_profile.location_fallback')}
                    </div>
                  </div>
                </div>
                {publicAgentData.coverageAreas?.length > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:GR, marginBottom:6 }}>
                      {t('commerce_profile.service_areas_label')}
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {publicAgentData.coverageAreas.map(a => (
                        <span key={a} style={{ fontSize:11, fontWeight:700, color:B,
                          backgroundColor:'#EFF6FF', padding:'4px 10px', borderRadius:100 }}>
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {[
                  [t('commerce_profile.deliveries_completed_label'), fmt(publicAgentData.totalDeliveriesCompleted||0), '#16A34A'],
                  [t('commerce_profile.rating_label'), `⭐ ${Number(publicAgentData.rating||0).toFixed(1)} (${publicAgentData.totalRatings||0})`, '#D97706'],
                ].map(([l,v,c]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:13, color:GR }}>{l}</span>
                    <span style={{ fontSize:14, fontWeight:900, color:c }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Super Agent hub */}
        {tab==='hub' && (
          <div>
            {isOwnProfile ? (
              <button onClick={()=>onNavigate('SuperAgentDashboard')}
                style={{ width:'100%', backgroundColor:'#7c3aed', color:WH,
                  border:'none', borderRadius:12, padding:'14px 0',
                  cursor:'pointer', fontSize:15, fontWeight:800 }}>
                {t('commerce_profile.go_to_hub_dashboard')}
              </button>
            ) : !publicHubData ? (
              <Empty icon="🏢" text={t('commerce_profile.hub_profile_unavailable')} />
            ) : (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>🏢</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900, color:DK }}>
                      {publicHubData.businessName}
                    </div>
                    <div style={{ fontSize:12, color:GR }}>
                      📍 {publicHubData.city} {publicHubData.cityCode ? `(${publicHubData.cityCode})` : ''}
                    </div>
                  </div>
                </div>
                {publicHubData.coverageCitiesDestination?.length > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:GR, marginBottom:6 }}>
                      {t('commerce_profile.delivers_to_label')}
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {publicHubData.coverageCitiesDestination.map(c => (
                        <span key={c} style={{ fontSize:11, fontWeight:700, color:'#7C3AED',
                          backgroundColor:'#F5F3FF', padding:'4px 10px', borderRadius:100 }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {[
                  [t('commerce_profile.parcels_handled_label'), fmt(publicHubData.totalParcelsHandled||0), '#7C3AED'],
                  [t('commerce_profile.parcels_delivered_label'), fmt(publicHubData.totalParcelsDelivered||0), '#16A34A'],
                  [t('commerce_profile.rating_label'), `⭐ ${Number(publicHubData.rating||0).toFixed(1)} (${publicHubData.totalRatings||0})`, '#D97706'],
                ].map(([l,v,c]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:13, color:GR }}>{l}</span>
                    <span style={{ fontSize:14, fontWeight:900, color:c }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transport routes */}
        {tab==='transport' && (
          <div>
            {isOwnProfile ? (
              <button onClick={()=>onNavigate('TransportProviderDashboard')}
                style={{ width:'100%', backgroundColor:'#ea580c', color:WH,
                  border:'none', borderRadius:12, padding:'14px 0',
                  cursor:'pointer', fontSize:15, fontWeight:800 }}>
                {t('commerce_profile.go_to_transport_dashboard')}
              </button>
            ) : !publicTransportData ? (
              <Empty icon="🚌" text={t('commerce_profile.transport_profile_unavailable')} />
            ) : (
              <div>
                <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <span style={{ fontSize:28 }}>🚌</span>
                    <div>
                      <div style={{ fontSize:15, fontWeight:900, color:DK }}>
                        {publicTransportData.name}
                      </div>
                      <div style={{ fontSize:12, color:GR, textTransform:'capitalize' }}>
                        {publicTransportData.type}
                        {publicTransportData.rating > 0 && ` · ⭐ ${Number(publicTransportData.rating).toFixed(1)}`}
                      </div>
                    </div>
                  </div>
                  {publicTransportData.description && (
                    <div style={{ fontSize:13, color:GR, lineHeight:1.5 }}>
                      {publicTransportData.description}
                    </div>
                  )}
                </div>

                {publicTransportData.routes?.length > 0 && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:16,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize:12, fontWeight:800, color:GR, marginBottom:10 }}>
                      {t('commerce_profile.active_routes_label')}
                    </div>
                    {publicTransportData.routes.map(r => (
                      <div key={r.id} onClick={() => onNavigate('SellerShipment')}
                        style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                        <span style={{ fontSize:16 }}>🚌</span>
                        <div style={{ flex:1, fontSize:13, fontWeight:700, color:DK }}>
                          {r.routeType === 'intercity' && r.originCity && r.destinationCity
                            ? `${r.originCity} → ${r.destinationCity}`
                            : r.routeType === 'local_loop' && r.loopStops?.length
                            ? r.loopStops.join(' → ')
                            : r.routeType === 'last_mile' && r.coverageWards?.length
                            ? `${r.coverageCity || ''} — ${r.coverageWards.slice(0,3).join(', ')}`
                            : t('commerce_profile.route_fallback')}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:'#EA580C' }}>{t('commerce_profile.ship_button')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Analytics */}
        {tab==='analytics' && (
          <button onClick={()=>onNavigate('SellerAnalytics')}
            style={{ width:'100%', backgroundColor:'#7c3aed', color:WH,
              border:'none', borderRadius:12, padding:'14px 0',
              cursor:'pointer', fontSize:15, fontWeight:800 }}>
            {t('commerce_profile.view_full_analytics_button')}
          </button>
        )}

        {/* Reputation */}
        {tab==='reputation' && (
          <div>
            <div style={{ background:`linear-gradient(135deg,${tier.color},#1d4ed8)`,
              borderRadius:20, padding:24, color:WH, textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>{tier.icon}</div>
              <div style={{ fontSize:24, fontWeight:900 }}>{tier.name}</div>
              <div style={{ fontSize:36, fontWeight:900, margin:'8px 0' }}>{score}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{t('commerce_profile.trust_score_label')}</div>
            </div>
            {rep?.history?.length > 0 && (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('commerce_profile.score_history_title')}
                </div>
                {rep.history.map(e => (
                  <div key={e.id} style={{ display:'flex', justifyContent:'space-between',
                    padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK,
                        textTransform:'capitalize' }}>
                        {e.eventType.replace(/_/g,' ')}
                      </div>
                      <div style={{ fontSize:10, color:'#94a3b8' }}>
                        {new Date(e.createdAt).toLocaleDateString('sw-TZ')}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:14, fontWeight:900,
                        color:e.points>0?'#16a34a':'#dc2626' }}>
                        {e.points>0?'+':''}{e.points}
                      </div>
                      <div style={{ fontSize:10, color:'#94a3b8' }}>{e.scoreAfter}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Followers list modal ── */}
      {showFollowers && (
        <div onClick={() => setShowFollowers(false)}
          style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)',
            zIndex:3000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:'100%', maxWidth:480, backgroundColor:WH,
              borderRadius:'20px 20px 0 0', maxHeight:'75vh', display:'flex',
              flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'16px 16px 12px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:900, color:DK }}>
                {t('commerce_profile.followers_title')} {followers.length > 0 && `(${followers.length})`}
              </div>
              <button onClick={() => setShowFollowers(false)}
                style={{ background:'none', border:'none', cursor:'pointer',
                  fontSize:20, color:GR }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 16px 16px' }}>
              {loadingFollowers ? (
                <div style={{ fontSize:13, color:GR, padding:'20px 0', textAlign:'center' }}>
                  {t('commerce_profile.loading_ellipsis')}
                </div>
              ) : followers.length === 0 ? (
                <div style={{ fontSize:13, color:GR, padding:'30px 0', textAlign:'center' }}>
                  {t('commerce_profile.no_followers_desc')}
                </div>
              ) : (
                followers.map(f => (
                  <div key={f.id}
                    onClick={() => { setShowFollowers(false); onNavigate(`CommerceProfile-${f.id}`); }}
                    style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'10px 0', borderBottom:'1px solid #F8FAFC', cursor:'pointer' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', flexShrink:0,
                      backgroundColor:'#F1F5F9', overflow:'hidden', display:'flex',
                      alignItems:'center', justifyContent:'center' }}>
                      {f.logo
                        ? <img src={f.logo} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                        : <span style={{ fontSize:16, fontWeight:900, color:B }}>
                            {f.name.charAt(0).toUpperCase()}
                          </span>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:DK,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize:11, color:GR }}>
                        {t('commerce_profile.following_since_label', { date: new Date(f.followedAt).toLocaleDateString('en-GB') })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pillStyle = (bg, color) => ({
  fontSize:10, fontWeight:700, backgroundColor:bg,
  color, padding:'3px 10px', borderRadius:100,
  display:'inline-flex', alignItems:'center', gap:3,
});

const inputSt = {
  width:'100%', padding:'10px 12px', borderRadius:10,
  border:'1px solid #e2e8f0', fontSize:14, outline:'none',
  fontFamily:'inherit', marginBottom:10, boxSizing:'border-box',
  display:'block',
};

const Empty = ({ icon, text, action, onAction }) => (
  <div style={{ textAlign:'center', padding:'48px 20px',
    backgroundColor:WH, borderRadius:16,
    boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize:40, marginBottom:8 }}>{icon}</div>
    <div style={{ fontSize:14, color:GR, marginBottom: action ? 16 : 0 }}>{text}</div>
    {action && (
      <button onClick={onAction}
        style={{ backgroundColor:B, color:WH, border:'none',
          borderRadius:10, padding:'10px 24px', cursor:'pointer',
          fontSize:13, fontWeight:700 }}>
        {action}
      </button>
    )}
  </div>
);

// ── Flat comment thread for a feed post that ISN'T tagged to a real
// product/classified/service — e.g. a plain announcement or "Looking For".
// Tagged posts reuse CommerceCommentSection instead (see FeedPost below).
const PostThread = ({ postId, isLoggedIn, onNavigate }) => {
  const { t } = useTranslation();
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get(`/feed/${postId}/comments`)
      .then(r => setComments(r.data || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSend = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!body.trim()) return;
    try {
      setSending(true);
      setError('');
      const res = await api.post(`/feed/${postId}/comments`, { body: body.trim() });
      setComments(prev => [...prev, { ...res.data, replies: [] }]);
      setBody('');
    } catch (err) {
      setError(err?.response?.data?.message || t('commerce_profile.post_error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop:12, borderTop:'1px solid #F1F5F9', paddingTop:12 }}>
      {loading ? (
        <div style={{ fontSize:12, color:GR, padding:'8px 0' }}>{t('commerce_profile.loading_ellipsis')}</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize:12, color:GR, padding:'8px 0' }}>{t('commerce_profile.no_comments_yet')}</div>
      ) : comments.map(c => (
        <div key={c.id} style={{ display:'flex', gap:8, marginBottom:10 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
            backgroundColor:B, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, color:WH, fontWeight:900, overflow:'hidden' }}>
            {c.author?.logo
              ? <img src={c.author.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : (c.author?.storeName || c.author?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:800, color:DK }}>
              {c.author?.storeName || c.author?.name || t('commerce_profile.user_fallback')}
            </div>
            <div style={{ fontSize:12, color:DK, lineHeight:1.4 }}>{c.body}</div>
          </div>
        </div>
      ))}
      {error && (
        <div style={{ fontSize:11, color:'#DC2626', marginBottom:8, fontWeight:600 }}>{error}</div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <input value={body} onChange={e => setBody(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={t('commerce_profile.write_comment_placeholder')}
          style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1px solid #E2E8F0',
            fontSize:12, outline:'none', fontFamily:'inherit' }} />
        <button onClick={handleSend} disabled={sending || !body.trim()}
          style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
            padding:'0 16px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
          {sending ? t('commerce_profile.sending_ellipsis') : t('commerce_profile.send_button')}
        </button>
      </div>
    </div>
  );
};

const FeedPost = ({ f, onNavigate, isLoggedIn, currentUser, highlighted, postRef }) => {
  const { t } = useTranslation();
  const [showComments, setShowComments] = useState(false);
  const isTagged = !!(f.linkedEntityType && f.linkedEntityId);

  return (
    <div ref={postRef} style={{ backgroundColor:WH, borderRadius:14, padding:16,
      marginBottom:12,
      boxShadow: highlighted ? '0 0 0 3px #2563EB, 0 2px 8px rgba(0,0,0,0.06)' : '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:800, color:B,
          backgroundColor:'#eff6ff', padding:'2px 10px', borderRadius:100 }}>
          {f.type==='new_product'?t('commerce_profile.type_new_product'):
           f.type==='discount'?t('commerce_profile.type_discount'):
           f.type==='restock'?t('commerce_profile.type_restock'):t('commerce_profile.type_announcement')}
        </span>
        <span style={{ fontSize:10, color:'#94a3b8' }}>
          {new Date(f.createdAt).toLocaleDateString('en-GB')}
        </span>
      </div>
      <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:4 }}>{f.title}</div>
      {f.body && <div style={{ fontSize:12, color:'#475569', lineHeight:1.5 }}>{f.body}</div>}
      {f.imageUrl && (
        <img src={f.imageUrl} alt="" style={{ width:'100%', borderRadius:10,
          marginTop:10, maxHeight:200, objectFit:'cover' }} />
      )}
      {((f.saveCount||0) > 0 || (f.commentCount||0) > 0) && (
        <div style={{ fontSize:12, fontWeight:700, color:DK, marginTop:10 }}>
          {(f.saveCount||0) > 0 && t('commerce_profile.liked_count', { count: Number(f.saveCount).toLocaleString() })}
          {(f.saveCount||0) > 0 && (f.commentCount||0) > 0 && '  ·  '}
          {(f.commentCount||0) > 0 && t('commerce_profile.comment_count', { count: Number(f.commentCount) })}
        </div>
      )}
      <button onClick={() => setShowComments(s => !s)}
        style={{ background:'none', border:'none', cursor:'pointer', padding:0,
          marginTop:6, color:GR, fontSize:12, fontWeight:700 }}>
        {showComments ? t('commerce_profile.hide_comments') : (f.commentCount||0) > 0 ? t('commerce_profile.view_comments') : t('commerce_profile.comment_button')}
      </button>
      {f.ctaLabel && f.linkedEntityId && (
        <button onClick={() => onNavigate(`ClassifiedDetail-${f.linkedEntityId}`)}
          style={{ marginTop:10, backgroundColor:B, color:WH,
            border:'none', borderRadius:8, padding:'8px 18px',
            cursor:'pointer', fontSize:12, fontWeight:700 }}>
          {f.ctaLabel}
        </button>
      )}
      {showComments && (
        isTagged ? (
          <div style={{ marginTop:12, borderTop:'1px solid #F1F5F9', paddingTop:12,
            marginLeft:-16, marginRight:-16, marginBottom:-16 }}>
            <CommerceCommentSection
              entityType={f.linkedEntityType} entityId={f.linkedEntityId}
              entityTitle={f.title} sellerId={f.businessId}
              isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate} />
          </div>
        ) : (
          <PostThread postId={f.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
        )
      )}
    </div>
  );
};

export default CommerceProfile;