/**
 * CommerceProfile.js — Role-aware identity profile
 * Place at: src/public/pages/CommerceProfile.js
 *
 * Same page for all users — tabs change based on active roles.
 * Own profile shows dashboard actions. Others' profiles show public info.
 */
import React, { useState, useEffect } from 'react';
import ReputationBadge from '../components/ReputationBadge';
import ProfileCompletion from '../components/ProfileCompletion';
import api             from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const fmt  = n => Number(n||0).toLocaleString();
const fmtM = n => { const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1000?`${(v/1e3).toFixed(0)}K`:String(v); };

const TIERS = [
  {min:900,name:'KenteXa Elite',icon:'🏆',color:'#dc2626',bg:'#fee2e2'},
  {min:600,name:'Mshirika Mkuu',icon:'💎',color:'#7c3aed',bg:'#ede9fe'},
  {min:300,name:'Mwaminifu',    icon:'🌟',color:'#1d4ed8',bg:'#dbeafe'},
  {min:100,name:'Mwenye Imani', icon:'⭐',color:'#16a34a',bg:'#dcfce7'},
  {min:0,  name:'New',         icon:'🌱',color:'#64748b',bg:'#f1f5f9'},
];
const getTier = s => TIERS.find(t => Number(s||0) >= t.min) || TIERS[4];

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
  const actions = {
    seller: [
      {icon:'📦',label:'Orders',    page:'SellerOrders',     bg:'#eff6ff', color:B},
      {icon:'🏷️',label:'Products',    page:'SellerClassifieds', bg:'#f0fdf4', color:'#16a34a'},
      {icon:'📊',label:'Analytics',  page:'SellerAnalytics',  bg:'#f5f3ff', color:'#7c3aed'},
      {icon:'📢',label:'Listing',    page:'CommerceProfile',  bg:'#fff7ed', color:'#ea580c'},
      {icon:'👥',label:'Timu',       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
      {icon:'💳',label:'Malipo',     page:'SellerPayouts',    bg:'#fef9c3', color:'#ca8a04'},
    ],
    agent: [
      {icon:'🏍️',label:'Jobs Zangu', page:'AgentDashboard',   bg:'#fdf2f8', color:'#a21caf'},
      {icon:'💰',label:'Mapato',     page:'AgentEarnings',    bg:'#f0fdf4', color:'#16a34a'},
      {icon:'📊',label:'Scorecard',  page:'AgentScorecard',   bg:'#eff6ff', color:B},
      {icon:'📦',label:'Vifurushi',  page:'AgentDashboard',   bg:'#fff7ed', color:'#ea580c'},
    ],
    super_agent: [
      {icon:'🏢',label:'Hub Yangu',  page:'SuperAgentDashboard',bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'📦',label:'Vifurushi',  page:'SuperAgentDashboard',bg:'#eff6ff',color:B},
      {icon:'🚌',label:'Transport',    page:'SuperAgentDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📊',label:'Analytics',  page:'SuperAgentDashboard',bg:'#f0fdf4',color:'#16a34a'},
    ],
    transport_provider: [
      {icon:'🚌',label:'Routes Zangu',page:'TransportProviderDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📅',label:'Upatikanaji',page:'TransportProviderDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'📦',label:'Orders',    page:'TransportProviderDashboard',bg:'#eff6ff',color:B},
      {icon:'🗺️',label:'Njia Zangu', page:'RouteCoverageMap',          bg:'#f5f3ff',color:'#7c3aed'},
    ],
  };

  // Buyer actions (everyone)
  const buyerActions = [
    {icon:'📦',label:'Orders Yangu',page:'MyOrders',       bg:'#eff6ff', color:B},
    {icon:'❤️',label:'Zilizohifadhiwa',page:'Wishlist',     bg:'#fff1f2', color:'#e11d48'},
    {icon:'🔍',label:'Discover',        page:'Search',        bg:'#f0fdf4', color:'#16a34a'},
    {icon:'🏷️',label:'List Item',       page:'SellerClassifieds',bg:'#fef9c3',color:'#ca8a04'},
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
const tabs = (role, isOwn) => {
  const base = [{ key:'posts',      label:'📋 Products'   }];
  if (isOwn && ['seller','admin','manager'].includes(role)) {
    base.push(
      { key:'feed',       label:'📢 Posts' },
      { key:'orders',     label:'📦 Orders'   },
      { key:'analytics',  label:'📊 Analytics' },
    );
  }
  // Identity tabs — public for everyone, not just the owner. What differs
  // by isOwn is the CONTENT (public stats vs. private earnings/dashboard
  // shortcut), not whether the tab is visible at all.
  if (role === 'agent') {
    base.push({ key:'jobs', label:'🏍️ Agent' });
  }
  if (role === 'super_agent') {
    base.push({ key:'hub', label:'🏢 Hub' });
  }
  if (role === 'transport_provider') {
    base.push({ key:'transport', label:'🚌 Routes' });
  }
  if (isOwn) {
    base.push({ key:'services', label:'🔧 Services' });
  }
  base.push({ key:'reputation', label:'🏆 Reputation' });
  return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
const CommerceProfile = ({ onNavigate, isLoggedIn, onLogout, userRole,
  currentUser, pageParam }) => {

  const targetId   = pageParam ? Number(pageParam) : null;
  const isOwnProfile = !targetId || (currentUser && targetId === currentUser.id);

  const [profile,    setProfile]    = useState(null);
  const [rep,        setRep]        = useState(null);
  const [feed,       setFeed]       = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [services,   setServices]   = useState([]);
  const [classifieds,setClassifieds]= useState([]);
  const [products,   setProducts]   = useState([]);
  const [itemCounts, setItemCounts] = useState({}); // `${type}-${id}` -> {saves,comments}
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
    setTab('posts');

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

  // Fetch public role-identity info once we know the profile owner's role.
  // Uses the TARGET's role (profile.role), never the viewer's own role.
  useEffect(() => {
    const uid = targetId || currentUser?.id;
    if (!uid || !profile) return;
    const role = profile.role;

    if (role === 'agent') {
      api.get(`/agents/public/${uid}`).then(r => setPublicAgentData(r.data)).catch(() => setPublicAgentData(null));
    }
    if (role === 'super_agent') {
      api.get(`/super-agents/public/${uid}`).then(r => setPublicHubData(r.data)).catch(() => setPublicHubData(null));
    }
    if (role === 'transport_provider') {
      api.get(`/transport/public/${uid}`).then(r => setPublicTransportData(r.data)).catch(() => setPublicTransportData(null));
    }
  }, [profile, targetId]); // eslint-disable-line

  // Fetch real like/comment counts for the products tab, once catalog loads
  useEffect(() => {
    const clIds = classifieds.map(c => c.id);
    const prIds = products.map(p => p.id);
    if (!clIds.length && !prIds.length) return;

    Promise.allSettled([
      clIds.length ? api.get(`/engagements/counts?entityType=classified&entityIds=${clIds.join(',')}`) : Promise.resolve({data:{}}),
      prIds.length ? api.get(`/engagements/counts?entityType=product&entityIds=${prIds.join(',')}`)    : Promise.resolve({data:{}}),
    ]).then(([clRes, prRes]) => {
      const merged = {};
      if (clRes.status==='fulfilled') {
        Object.entries(clRes.value.data||{}).forEach(([id,c]) => { merged[`classified-${id}`] = c; });
      }
      if (prRes.status==='fulfilled') {
        Object.entries(prRes.value.data||{}).forEach(([id,c]) => { merged[`product-${id}`] = c; });
      }
      setItemCounts(merged);
    }).catch(() => {});
  }, [classifieds, products]);

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
        <div>Inapakia wasifu...</div>
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
          <div style={{ marginTop:12 }}>Profile not found</div>
        </div>
      </div>
    </div>
  );

  const score     = rep?.score || profile.reputationScore || 0;
  const tier      = getTier(score);
  const role      = profile.role || userRole || 'user';
  const profileTabs = tabs(role, isOwnProfile);

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
          {profile.storeName || profile.name || 'Profile'}
        </div>
        {isOwnProfile && (
          <button onClick={() => onNavigate('MyProfile')}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:B, fontSize:13, fontWeight:700 }}>
            Edit
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
          {profile.logo
            ? <img src={profile.logo} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : (profile.storeName||profile.name||'K').charAt(0).toUpperCase()}
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
              + Add Role
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
                {following ? '✓ Unafuata' : '+ Fuata'}
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
            {profile.storeName || profile.name || 'Mtumiaji wa KenteXa'}
          </h1>
          {profile.isOfficialStore && (
            <span style={{ fontSize:16 }} title="Imehakikiwa">✅</span>
          )}
          <ReputationBadge score={score} size="sm" />
        </div>

        {/* Role badges */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
          {role === 'seller'             && <span style={pillStyle('#eff6ff',B)}>🏪 Seller</span>}
          {role === 'agent'              && <span style={pillStyle('#fdf2f8','#a21caf')}>🏍️ Agent</span>}
          {role === 'super_agent'        && <span style={pillStyle('#f5f3ff','#7c3aed')}>🏢 Super Agent</span>}
          {role === 'transport_provider' && <span style={pillStyle('#fff7ed','#ea580c')}>🚌 Transporter</span>}
          {                               <span style={pillStyle('#f1f5f9',GR)}>🛒 Buyer</span>}
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
          <Stat value={fmtM(profile.completedOrders||0)} label="Mauzo" />
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={fmtM(profile.followersCount||0)} label="Followers"
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
          <Stat value={Number(profile.rating||0).toFixed(1)} label="Ukadiriaji" />
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={score} label="Reputation" />
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
        {profileTabs.map(t => (
          <button key={t.key} onClick={() => {
            setTab(t.key);
            if (t.key==='services' && services.length===0) {
              api.get('/services/my').then(r=>setServices(r.data||[])).catch(()=>{});
            }
          }}
            style={{ padding:'12px 16px', border:'none', cursor:'pointer',
              backgroundColor:'transparent', fontSize:12, fontWeight:700,
              whiteSpace:'nowrap', flexShrink:0,
              color: tab===t.key ? B : GR,
              borderBottom: tab===t.key ? `2px solid ${B}` : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding:'16px 16px 32px', maxWidth:900,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* Posts / Products */}
        {tab==='posts' && (
          <div>
            {(classifieds.length === 0 && products.length === 0) ? (
              <Empty icon="🏷️" text="No products listed yet"
                action={isOwnProfile ? 'Add a Product' : null}
                onAction={() => onNavigate('SellerClassifieds')} />
            ) : (
              <>
                {products.length > 0 && (
                  <div style={{ marginBottom: classifieds.length > 0 ? 20 : 0 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:GR, marginBottom:10,
                      textTransform:'uppercase', letterSpacing:0.4 }}>
                      🛍️ Shop Products ({products.length})
                    </div>
                    <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
                      {products.map(p => (
                        <div key={`p-${p.id}`}
                          onClick={() => onNavigate(`ProductDetail-${p.id}`)}
                          style={{ backgroundColor:WH, borderRadius:14,
                            boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
                            cursor:'pointer', overflow:'hidden' }}>
                          <div style={{ height:120, backgroundColor:'#F8FAFC',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            overflow:'hidden' }}>
                            {p.images?.[0]
                              ? <img src={p.images[0]} alt={p.name}
                                  style={{ width:'100%',height:'100%',objectFit:'cover' }}
                                  onError={e => e.target.style.display='none'} />
                              : <span style={{ fontSize:32 }}>🛍️</span>}
                          </div>
                          <div style={{ padding:'10px 12px' }}>
                            <div style={{ fontSize:12,fontWeight:700,color:DK,marginBottom:3,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize:13,fontWeight:900,color:B }}>
                              TZS {fmt(p.displayPrice || p.basePrice)}
                            </div>
                            {!p.isAvailable && (
                              <div style={{ fontSize:9,color:'#DC2626',fontWeight:700,marginTop:2 }}>
                                Out of stock
                              </div>
                            )}
                            {(() => {
                              const c = itemCounts[`product-${p.id}`];
                              if (!c || (!c.saves && !c.comments)) return null;
                              return (
                                <div style={{ fontSize:10, color:GR, marginTop:4 }}>
                                  {c.saves > 0 && `❤️ ${c.saves}`}
                                  {c.saves > 0 && c.comments > 0 && '  '}
                                  {c.comments > 0 && `💬 ${c.comments}`}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {classifieds.length > 0 && (
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:GR, marginBottom:10,
                      textTransform:'uppercase', letterSpacing:0.4 }}>
                      📢 Listings ({classifieds.length})
                    </div>
                    <div style={{ display:'grid',
                      gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
                      {classifieds.map(c => (
                        <div key={`c-${c.id}`}
                          onClick={() => onNavigate(`ClassifiedDetail-${c.id}`)}
                          style={{ backgroundColor:WH, borderRadius:14,
                            boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
                            cursor:'pointer', overflow:'hidden' }}>
                          <div style={{ height:120, backgroundColor:'#F8FAFC',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            overflow:'hidden' }}>
                            {c.images?.[0]
                              ? <img src={c.images[0]} alt={c.title}
                                  style={{ width:'100%',height:'100%',objectFit:'cover' }}
                                  onError={e => e.target.style.display='none'} />
                              : <span style={{ fontSize:32 }}>🏷️</span>}
                          </div>
                          <div style={{ padding:'10px 12px' }}>
                            <div style={{ fontSize:12,fontWeight:700,color:DK,marginBottom:3,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                              {c.title}
                            </div>
                            <div style={{ fontSize:13,fontWeight:900,
                              color: c.isFlashSale ? '#DC2626' : B }}>
                              TZS {fmt(c.flashSalePrice || c.price)}
                            </div>
                            {(() => {
                              const cnt = itemCounts[`classified-${c.id}`];
                              if (!cnt || (!cnt.saves && !cnt.comments)) return null;
                              return (
                                <div style={{ fontSize:10, color:GR, marginTop:4 }}>
                                  {cnt.saves > 0 && `❤️ ${cnt.saves}`}
                                  {cnt.saves > 0 && cnt.comments > 0 && '  '}
                                  {cnt.comments > 0 && `💬 ${cnt.comments}`}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
                    + Post Listing kwa Wafuataji Wako
                  </button>
                ) : (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                    boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:14 }}>
                      📢 Listing Jipya
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                      gap:8, marginBottom:12 }}>
                      {[
                        {value:'new_product',  label:'🛍️ Products New'},
                        {value:'discount',     label:'🏷️ Discount'},
                        {value:'announcement', label:'📣 Listing'},
                        {value:'restock',      label:'📦 Imerejesha'},
                      ].map(t => (
                        <label key={t.value}
                          style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'10px 12px', borderRadius:10, cursor:'pointer',
                            border:`2px solid ${postForm.type===t.value?B:'#e2e8f0'}`,
                            backgroundColor:postForm.type===t.value?'#eff6ff':WH }}>
                          <input type="radio" name="ft" value={t.value}
                            checked={postForm.type===t.value}
                            onChange={e=>setPostForm(f=>({...f,type:e.target.value}))} />
                          <span style={{ fontSize:12, fontWeight:700 }}>{t.label}</span>
                        </label>
                      ))}
                    </div>
                    <input style={inputSt} placeholder="Kichwa cha tangazo *"
                      value={postForm.title}
                      onChange={e=>setPostForm(f=>({...f,title:e.target.value}))} />
                    <textarea style={{...inputSt, minHeight:80, resize:'vertical',
                      display:'block', marginBottom:10}}
                      placeholder="Maelezo zaidi (hiari)..."
                      value={postForm.body}
                      onChange={e=>setPostForm(f=>({...f,body:e.target.value}))} />
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>setShowPost(false)}
                        style={{ flex:1, backgroundColor:'#f1f5f9', color:GR,
                          border:'none', borderRadius:10, padding:'11px 0',
                          cursor:'pointer', fontSize:14, fontWeight:700 }}>
                        Close
                      </button>
                      <button onClick={handlePublish} disabled={publishing}
                        style={{ flex:2, background:'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                          color:WH, border:'none', borderRadius:10, padding:'11px 0',
                          cursor:publishing?'not-allowed':'pointer',
                          fontSize:14, fontWeight:800 }}>
                        {publishing ? '⏳...' : '📢 Post'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {feed.length === 0
              ? <Empty icon="📢" text="Bado hakuna matangazo" />
              : feed.map(f => (
                  <FeedPost key={f.id} f={f} onNavigate={onNavigate} />
                ))}
          </div>
        )}

        {/* Orders */}
        {tab==='orders' && (
          <div>
            {orders.length === 0
              ? <Empty icon="📦" text="Bado hakuna maagizo"
                  action="Enda Sokoni" onAction={()=>onNavigate('Classifieds')} />
              : orders.map(o => (
                  <div key={o.id}
                    onClick={()=>onNavigate(`TrackParcel-${o.trackingNumber||o.id}`)}
                    style={{ backgroundColor:WH, borderRadius:14, padding:16,
                      marginBottom:10, cursor:'pointer',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:DK }}>
                          {o.product?.name || o.manualProductName || 'Products'}
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
                + Add Services New
              </button>
            )}
            {services.length === 0
              ? <Empty icon="🔧" text="Bado hakuna huduma" />
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
                        {s.priceType==='negotiate' ? 'Bei kwa mazungumzo'
                         : s.priceType==='free_quote' ? 'Omba bei'
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
                  🏍️ Go to Agent Dashboard
                </button>
                {agentData && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                    marginTop:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    {[
                      ['Completed Deliveries', agentData.totalDeliveriesCompleted||0, '#16a34a'],
                      ['Total Earnings', `TZS ${fmt(agentData.totalEarnings||0)}`, B],
                      ['Rating', `${Number(agentData.rating||0).toFixed(1)}/5.0`, '#d97706'],
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
              <Empty icon="🏍️" text="Agent profile not available" />
            ) : (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>🏍️</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:900, color:DK }}>
                      {publicAgentData.fullName || 'Delivery Agent'}
                    </div>
                    <div style={{ fontSize:12, color:GR }}>
                      📍 {publicAgentData.district || publicAgentData.city || 'Tanzania'}
                    </div>
                  </div>
                </div>
                {publicAgentData.coverageAreas?.length > 0 && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:GR, marginBottom:6 }}>
                      SERVICE AREAS
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
                  ['Deliveries Completed', fmt(publicAgentData.totalDeliveriesCompleted||0), '#16A34A'],
                  ['Rating', `⭐ ${Number(publicAgentData.rating||0).toFixed(1)} (${publicAgentData.totalRatings||0})`, '#D97706'],
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
                🏢 Go to Hub Dashboard
              </button>
            ) : !publicHubData ? (
              <Empty icon="🏢" text="Hub profile not available" />
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
                      DELIVERS TO
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
                  ['Parcels Handled', fmt(publicHubData.totalParcelsHandled||0), '#7C3AED'],
                  ['Parcels Delivered', fmt(publicHubData.totalParcelsDelivered||0), '#16A34A'],
                  ['Rating', `⭐ ${Number(publicHubData.rating||0).toFixed(1)} (${publicHubData.totalRatings||0})`, '#D97706'],
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
                🚌 Go to Transport Dashboard
              </button>
            ) : !publicTransportData ? (
              <Empty icon="🚌" text="Transport profile not available" />
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
                      ACTIVE ROUTES
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
                            : 'Route'}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:'#EA580C' }}>Ship →</span>
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
            📊 Angalia Analytics Kamili
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
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>Score za Imani / 1000</div>
            </div>
            {rep?.history?.length > 0 && (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:12 }}>
                  Historia ya Score
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
                Followers {followers.length > 0 && `(${followers.length})`}
              </div>
              <button onClick={() => setShowFollowers(false)}
                style={{ background:'none', border:'none', cursor:'pointer',
                  fontSize:20, color:GR }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 16px 16px' }}>
              {loadingFollowers ? (
                <div style={{ fontSize:13, color:GR, padding:'20px 0', textAlign:'center' }}>
                  Loading...
                </div>
              ) : followers.length === 0 ? (
                <div style={{ fontSize:13, color:GR, padding:'30px 0', textAlign:'center' }}>
                  No followers yet — share your profile to get your first one!
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
                        Following since {new Date(f.followedAt).toLocaleDateString('en-GB')}
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

const FeedPost = ({ f, onNavigate }) => (
  <div style={{ backgroundColor:WH, borderRadius:14, padding:16,
    marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ display:'flex', justifyContent:'space-between',
      marginBottom:8 }}>
      <span style={{ fontSize:10, fontWeight:800, color:B,
        backgroundColor:'#eff6ff', padding:'2px 10px', borderRadius:100 }}>
        {f.type==='new_product'?'🛍️ New Product':
         f.type==='discount'?'🏷️ Discount':
         f.type==='restock'?'📦 Restocked':'📣 Listing'}
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
        {(f.saveCount||0) > 0 && `${Number(f.saveCount).toLocaleString()} liked`}
        {(f.saveCount||0) > 0 && (f.commentCount||0) > 0 && '  ·  '}
        {(f.commentCount||0) > 0 && `${Number(f.commentCount).toLocaleString()} comment${f.commentCount!==1?'s':''}`}
      </div>
    )}
    {f.ctaLabel && f.linkedEntityId && (
      <button onClick={() => onNavigate(`ClassifiedDetail-${f.linkedEntityId}`)}
        style={{ marginTop:10, backgroundColor:B, color:WH,
          border:'none', borderRadius:8, padding:'8px 18px',
          cursor:'pointer', fontSize:12, fontWeight:700 }}>
        {f.ctaLabel}
      </button>
    )}
  </div>
);

export default CommerceProfile;