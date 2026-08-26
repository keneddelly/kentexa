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
import { trackProfileView } from '../hooks/useAnalytics';
import ProfileCompletion from '../components/ProfileCompletion';
import CommerceCommentSection from '../components/CommerceCommentSection';
import api             from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const fmt  = n => Number(n||0).toLocaleString();
const fmtM = n => { const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1000?`${(v/1e3).toFixed(0)}K`:String(v); };

// Matches ProviderType on the backend (transport-provider.entity.ts) — a
// truck operator's profile showing a bus icon (the old hardcoded default)
// told visitors nothing true about what that provider actually runs.
const PROVIDER_TYPE_ICON = {
  bus: '🚌', van: '🚐', courier: '📦', truck: '🚛',
  boda: '🏍️', rail: '🚆', air: '✈️', boat: '⛵',
};

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
      {icon:'👥',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
    ],
    super_agent: [
      {icon:'🏢',label:t('commerce_profile.action_my_hub'),  page:'SuperAgentDashboard',bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'📦',label:t('commerce_profile.action_parcels'),  page:'SuperAgentDashboard',bg:'#eff6ff',color:B},
      {icon:'🚌',label:t('commerce_profile.action_transport'),    page:'SuperAgentDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📊',label:t('commerce_profile.action_analytics'),  page:'SuperAgentDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'👥',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
    ],
    transport_provider: [
      {icon:'🚌',label:t('commerce_profile.action_my_routes'),page:'TransportProviderDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'📅',label:t('commerce_profile.action_availability'),page:'TransportProviderDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'📦',label:t('commerce_profile.action_orders'),    page:'TransportProviderDashboard',bg:'#eff6ff',color:B},
      {icon:'🗺️',label:t('commerce_profile.action_my_routes'), page:'RouteCoverageMap',          bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'👥',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
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
// Tabs are derived from the ONE CommerceProfile actually being viewed —
// its `type`, never the viewer's/owner's activeRoles. Every profile is
// its own independent identity: visiting a business profile never shows
// that owner's hub or transport tabs bleeding in, and visiting someone's
// personal profile never shows business tabs at all, regardless of how
// many other profiles that same account happens to run.
//
// Each type gets a PURPOSE-BUILT section list, not one generic template:
// Business → Products/Services/About/Reviews (+ owner-only Feed/Orders/
// Analytics dashboard shortcuts); Service Provider → Services/Portfolio/
// Reviews/About; Agent → Services/Jobs/Reviews/About; Hub/Transport keep
// their existing rich public stats tab, with Reviews added. The old
// single 'reputation' tab (tier badge + score history) is folded into
// the top of 'reviews' rather than dropped, so that content isn't lost.
// "feed" (moments/updates shared via CreateMomentModal from ANY profile
// type) was previously only ever reachable on business profiles, and even
// there only for the OWNER — a visitor/follower had no way to see a
// moment they'd just been notified about, on any profile type. Every
// profile type that can have moments shared to it now gets this tab,
// visible to everyone (not owner-gated) — only the compose button inside
// it stays owner-gated, and business-only (see the tab body), since
// "new_product/discount/restock" only make sense for a business.
const tabs = (profileType, isOwn, t) => {
  if (profileType === 'business') {
    const base = [
      { key:'posts',         label:t('commerce_profile.tab_products') },
      { key:'services_pub',  label:t('commerce_profile.tab_services') },
      { key:'feed',          label:t('commerce_profile.tab_posts') },
    ];
    if (isOwn) {
      base.push(
        { key:'orders',    label:t('commerce_profile.tab_orders') },
        { key:'analytics', label:t('commerce_profile.tab_analytics') },
      );
    }
    base.push(
      { key:'about',   label:t('commerce_profile.tab_about') },
      { key:'reviews', label:t('commerce_profile.tab_reviews') },
    );
    return base;
  }
  if (profileType === 'service_provider') {
    return [
      { key:'services_pub', label:t('commerce_profile.tab_services') },
      { key:'portfolio',    label:t('commerce_profile.tab_portfolio') },
      { key:'feed',         label:t('commerce_profile.tab_posts') },
      { key:'reviews',      label:t('commerce_profile.tab_reviews') },
      { key:'about',        label:t('commerce_profile.tab_about') },
    ];
  }
  if (profileType === 'agent') {
    return [
      { key:'services_pub', label:t('commerce_profile.tab_services') },
      { key:'jobs',         label:t('commerce_profile.tab_agent') },
      { key:'feed',         label:t('commerce_profile.tab_posts') },
      { key:'reviews',      label:t('commerce_profile.tab_reviews') },
      { key:'about',        label:t('commerce_profile.tab_about') },
    ];
  }
  if (profileType === 'hub') {
    return [
      { key:'hub',     label:t('commerce_profile.tab_hub') },
      { key:'feed',    label:t('commerce_profile.tab_posts') },
      { key:'reviews', label:t('commerce_profile.tab_reviews') },
    ];
  }
  if (profileType === 'transport_provider') {
    return [
      { key:'transport', label:t('commerce_profile.tab_routes') },
      { key:'feed',       label:t('commerce_profile.tab_posts') },
      { key:'reviews',   label:t('commerce_profile.tab_reviews') },
    ];
  }
  // Personal — About + (own-only) their own listing grid/quick services,
  // plus Reputation, plus the same moments/updates feed every other type
  // now gets. "Profiles" (Also on Kentexa) is always-visible below the
  // header, not a tab, so it isn't listed here.
  const base = [];
  if (isOwn) base.push({ key:'posts', label:t('commerce_profile.tab_listings') });
  base.push({ key:'feed', label:t('commerce_profile.tab_posts') });
  base.push({ key:'about', label:t('commerce_profile.tab_about') });
  if (isOwn) base.push({ key:'services', label:t('commerce_profile.tab_services') });
  base.push({ key:'reputation', label:t('commerce_profile.tab_reputation') });
  return base;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
const CommerceProfile = ({ onNavigate, isLoggedIn, userRole,
  currentUser, pageParam, commerceProfileId, activeProfileId: viewerActiveProfileId, track, onOpenMoment }) => {
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
  const highlightPostId = deepLinkPostId ? Number(deepLinkPostId) : null;
  const highlightPostRef = React.useRef(null);

  // The ONE identity this page renders — resolved either from an explicit
  // commerceProfileId (arrived via /@username or a card that already knows
  // which specific profile it's linking to) or, for older bare-user-id
  // links, defaulting to that account's PERSONAL profile. Never an
  // aggregate of "every role this account holds" — that's the exact bug
  // this replaced (a visitor landing on someone's personal page seeing
  // their business/hub tabs and follower counts bleed in).
  const [activeProfile, setActiveProfile] = useState(null);
  const isOwnProfile = !!(activeProfile && currentUser && activeProfile.ownerId === currentUser.id);
  const [shareMsg, setShareMsg] = useState('');

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
  const [siblingProfiles, setSiblingProfiles] = useState([]);
  const [reviews,          setReviews]          = useState([]);
  const [providerServices, setProviderServices] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('posts');
  const [following,  setFollowing]  = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);

  // Step 1 — resolve exactly which profile this page is for.
  useEffect(() => {
    setLoading(true);
    setActiveProfile(null);
    // Which tab actually applies depends on this profile's TYPE, not known
    // until it resolves below — Step 2 picks the real default (deep-linked
    // tab if valid for this type, else this type's first tab) once
    // activeProfile is set. This placeholder only avoids a stale tab from
    // a previously-viewed profile flashing before that happens.
    setTab(deepLinkTab || null);

    const uid = targetId || currentUser?.id || 0;
    // A deep-linked tab that exists on exactly one profile type must
    // resolve to THAT profile — not silently fall back to personal. A
    // bare user id is ambiguous between every identity an account runs,
    // and defaulting to personal regardless of deepLinkTab was quietly
    // swallowing every "open their transport/hub profile" link built this
    // session (moments, search results, notifications): the tab param
    // arrived correctly, but the page underneath was always the person's
    // own personal profile, which usually doesn't even have that tab.
    const TAB_TYPE_HINT = { transport: 'transport_provider', hub: 'hub', jobs: 'agent' };
    // "My own profile, no more specific target" (MyProfile.js's various
    // quick-action links, the bottom nav's Profile tab landing on
    // CommerceProfile — App.js always passes pageParam={null} here) used
    // to always fall through to `personal` below, regardless of which
    // profile the app shell currently has active. Since Moments are
    // profile-scoped, posting one as Business/Agent/Hub and then tapping
    // "my profile" silently showed Personal's empty feed instead — the
    // Moment wasn't missing, the page was just showing the wrong identity.
    // A THIRD PARTY opening a bare-user-id link still correctly defaults
    // to Personal (they have no "active profile" of someone else's account
    // to prefer), so this only kicks in when the viewer IS the account.
    const isSelfLookup = !targetId && !!currentUser && uid === currentUser.id;
    const resolve = commerceProfileId
      ? api.get(`/profiles/${commerceProfileId}`)
      : api.get(`/profiles/for-user/${uid}`).then(r => {
          const list = r.data || [];
          const hintedType = TAB_TYPE_HINT[deepLinkTab];
          const hinted = hintedType ? list.find(p => p.type === hintedType) : null;
          const active = isSelfLookup && viewerActiveProfileId
            ? list.find(p => p.id === viewerActiveProfileId)
            : null;
          const personal = list.find(p => p.type === 'personal');
          return { data: hinted || active || personal || list[0] || null };
        });

    resolve.then(res => {
      setActiveProfile(res.data || null);
      setFollowing(!!res.data?.isFollowing);
      setIsFollowedBy(!!res.data?.isFollowedBy);
    }).catch(() => setActiveProfile(null));
  }, [targetId, commerceProfileId, viewerActiveProfileId]); // eslint-disable-line

  // Step 2 — once the specific profile is known, load everything that
  // hangs off it: shared buyer-facing content (feed/products/classifieds),
  // owner-only extras, and exactly the ONE role-specific public dataset
  // that matches this profile's type (never all three).
  useEffect(() => {
    if (!activeProfile) return;
    const uid = activeProfile.ownerId;
    const own = currentUser && uid === currentUser.id;

    // "Profile visits" only becomes a real per-business number once views
    // are actually tracked with the target profile's id — mirrors
    // trackProductView (ProductDetail.js). Never counts a self-view.
    if (!own && track) trackProfileView(track, activeProfile);

    Promise.allSettled([
      api.get(`/seller/public/${uid}`).catch(() => ({ data: null })),
      api.get(`/reputation/user/${uid}`),
      api.get(`/feed/business/${uid}`, { params: { commerceProfileId: activeProfile.id } }),
      own ? api.get('/orders/my-orders?limit=5') : Promise.resolve({data:[]}),
      own ? api.get('/services/my') : Promise.resolve({data:[]}),
      (own && activeProfile.type === 'agent') ? api.get('/agents/my-profile') : Promise.resolve({data:null}),
      // Scoped to THIS specific profile — /classifieds/seller/:id returns
      // every classified the account has ever posted (personal + business
      // mixed together), which is exactly the "Kened's personal listings
      // show up on Bishoo's business tab" bug.
      api.get(`/classifieds/profile/${activeProfile.id}`),
      // Products belong to the Seller (business) Commerce Profile only —
      // /products/seller/:id is keyed on the account's userId, not a
      // specific profile, so fetching it for a personal/agent/hub/etc.
      // profile would bleed that same person's store products into a
      // profile that has nothing to do with selling products.
      activeProfile.type === 'business' ? api.get(`/products/seller/${uid}`) : Promise.resolve({data:[]}),
    ]).then(([p,r,f,o,s,a,cl,pr]) => {
      if (p.status==='fulfilled') setProfile(p.value.data);
      if (r.status==='fulfilled') setRep(r.value.data);
      if (f.status==='fulfilled') setFeed(f.value.data || []);
      if (o.status==='fulfilled') setOrders(o.value.data?.orders || o.value.data || []);
      if (s.status==='fulfilled') setServices(s.value.data || []);
      if (a.status==='fulfilled') setAgentData(a.value.data);
      if (cl.status==='fulfilled') setClassifieds(cl.value.data || []);
      if (pr.status==='fulfilled') setProducts(pr.value.data || []);
    }).finally(() => setLoading(false));

    setPublicAgentData(null); setPublicHubData(null); setPublicTransportData(null);
    if (activeProfile.type === 'agent') {
      api.get(`/agents/public/${uid}`).then(r => setPublicAgentData(r.data)).catch(() => {});
    } else if (activeProfile.type === 'hub') {
      api.get(`/super-agents/public/${uid}`).then(r => setPublicHubData(r.data)).catch(() => {});
    } else if (activeProfile.type === 'transport_provider') {
      api.get(`/transport/public/${uid}`).then(r => setPublicTransportData(r.data)).catch(() => {});
    }

    // Reviews are profile-scoped (GET /profiles/:id/reviews), not
    // account-wide — every type that shows a Reviews tab fetches its OWN
    // review list, never the owner's other profiles' reviews.
    setReviews([]);
    if (['business', 'service_provider', 'agent', 'hub', 'transport_provider'].includes(activeProfile.type)) {
      api.get(`/profiles/${activeProfile.id}/reviews`).then(r => setReviews(r.data || [])).catch(() => {});
    }

    // Services this profile publicly offers — backs the Services/Portfolio
    // sections on Business/Service Provider/Agent profiles. Distinct from
    // `services` above, which is the OWNER's own quick-manage list from
    // /services/my and only ever loads for the own-profile view.
    setProviderServices([]);
    if (['business', 'service_provider', 'agent'].includes(activeProfile.type)) {
      api.get(`/services/provider/${uid}`).then(r => setProviderServices(r.data || [])).catch(() => {});
    }

    // Default to the first tab that's actually valid for THIS profile's
    // type, unless a deep-linked tab was requested and is valid here too —
    // a stale tab key from switching profiles (e.g. 'posts' from a
    // business landing on a hub) must never be left selected.
    const validTabKeys = tabs(activeProfile.type, own, t).map(x => x.key);
    setTab(validTabKeys.includes(deepLinkTab) ? deepLinkTab : validTabKeys[0]);

    // "Also on Kentexa" — every OTHER profile this same account runs,
    // shown as independent, clickable cards (own name/photo/followers,
    // linking to their own page) — never blended into this profile's own
    // identity. This is the discovery mechanism for "buyer landed on
    // Kened personally but Bishoo Intelligence Systems is who they
    // actually want" without ever making the personal page ITSELF show
    // business data.
    api.get(`/profiles/for-user/${uid}`)
      .then(r => setSiblingProfiles((r.data || []).filter(p => p.id !== activeProfile.id)))
      .catch(() => setSiblingProfiles([]));
  }, [activeProfile]); // eslint-disable-line

  // Deep-linked from a "New save"/"New comment" notification — scroll to and
  // highlight that specific post once it's loaded into the Feed tab.
  useEffect(() => {
    if (!highlightPostId || tab !== 'feed' || !feed.length || !highlightPostRef.current) return;
    highlightPostRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [feed, tab, highlightPostId]);


  const handleFollow = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!activeProfile) return;
    try {
      // Follows THIS profile specifically — following Bishoo Intelligence
      // Systems never implies following Kened personally, or vice versa.
      const res = await api.post(`/profiles/${activeProfile.id}/follow`);
      setFollowing(res.data.following);
      setActiveProfile(p => p ? { ...p, followersCount: res.data.followersCount } : p);
    } catch {}
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

  if (!activeProfile) return (
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

  const score     = rep?.score || profile?.reputationScore || 0;
  const tier      = getTier(score);
  const profileTabs = tabs(activeProfile.type, isOwnProfile, t);

  // `profile` comes from GET /seller/public/:uid — a SELLER/business-shaped
  // payload (storeDescription, businessLocation, storeWhatsApp, isOfficialStore,
  // completedOrders). It belongs to the account's BUSINESS identity only, and
  // must never backfill header/about fields for any other profile type — doing
  // so leaks the business's bio/location/verified-badge/sales count onto that
  // same account's personal (or agent/hub/transport) profile, which is the
  // exact "roles bleeding into public identity" bug this whole redesign exists
  // to prevent. Below, `profile?.X` is only ever read behind this guard.
  const isBusinessProfile = activeProfile.type === 'business';
  const isTransportProfile = activeProfile.type === 'transport_provider';

  // Everything the header shows comes from activeProfile — the ONE
  // profile this page is for — never from role state or from whichever
  // tab happens to be selected. A visitor to a business page sees that
  // business's name/photo/followers the entire time they're on this
  // page, full stop; there is no other identity to bleed in.
  const displayName   = activeProfile.displayName;
  const displayPhoto  = activeProfile.photoUrl || (activeProfile.type === 'personal' ? currentUser?.avatarUrl : null);
  const displayHandle = activeProfile.username ? `@${activeProfile.username}` : null;
  // RoleActions' internal keying predates CommerceProfileType and still
  // expects role-shaped strings ('seller' not 'business', 'super_agent'
  // not 'hub') — map at the boundary rather than rename that component's
  // internal vocabulary as part of this change.
  const roleActionsKey = {
    business: 'seller', agent: 'agent', hub: 'super_agent', transport_provider: 'transport_provider',
  }[activeProfile.type] || null;

  // Links to the standalone /share backend route so a pasted link into
  // WhatsApp/Facebook shows a real preview card — crawlers don't execute
  // JS, so only a server-rendered response can carry this profile's actual
  // name/photo. `transport` sources its preview copy from the transport
  // provider's own public record instead of the generic seller one, since
  // this account's business-seller fields wouldn't accurately describe them.
  const handleShare = () => {
    const url = `${api.defaults.baseURL}/share/${isTransportProfile ? 'transport' : 'store'}/${activeProfile.ownerId}`;
    if (navigator.share) {
      navigator.share({ title: displayName || 'KenteXa', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      setShareMsg(t('share.link_copied'));
      setTimeout(() => setShareMsg(''), 3000);
    }
  };

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
        <button onClick={handleShare} title={t('share.button')}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:17, color:DK, padding:'4px 8px' }}>
          🔗
        </button>
        {isOwnProfile && (
          <button onClick={() => onNavigate('MyProfile')}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:B, fontSize:13, fontWeight:700 }}>
            {t('commerce_profile.edit_button')}
          </button>
        )}
      </div>

      {shareMsg && (
        <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          ✅ {shareMsg}
        </div>
      )}

      {/* Cover */}
      <div style={{ position:'relative' }}>
        <div style={{ height:140, overflow:'hidden',
          background: (activeProfile.coverImage || (isBusinessProfile && profile?.coverImage))
            ? `url(${activeProfile.coverImage || profile.coverImage}) center/cover`
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
                {following
                  ? t('commerce_profile.unfollow_button')
                  : isFollowedBy
                    ? t('commerce_profile.follow_back_button')
                    : t('commerce_profile.follow_button')}
              </button>
              <button onClick={() => onNavigate(isLoggedIn ? `MessageSeller-${activeProfile.ownerId}` : 'PublicLogin')}
                style={{ backgroundColor:'#eff6ff', color:B,
                  border:'1px solid #bfdbfe', borderRadius:10,
                  padding:'8px 14px', cursor:'pointer',
                  fontSize:12, fontWeight:800,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
                {t('commerce_profile.message_button')}
              </button>
              {isBusinessProfile && (profile?.storeWhatsApp || profile?.phone) && (
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
              {/* Same quick-contact button businesses already get — a
                  transport provider's whatsappPhone was fetched into
                  publicTransportData all along but never actually
                  surfaced anywhere on their own profile page, even though
                  WhatsApp is the primary contact channel this app treats
                  transport providers as using (Search.js's TransportCard,
                  the settings form, etc). */}
              {isTransportProfile && publicTransportData?.whatsappPhone && (
                <a href={`https://wa.me/${publicTransportData.whatsappPhone.replace(/^0/,'255').replace(/[^0-9]/g,'')}`}
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
          {(activeProfile.isVerified || (isBusinessProfile && profile?.isOfficialStore)) && (
            <span style={{ fontSize:16 }} title={t('commerce_profile.verified_title')}>✅</span>
          )}
          {isBusinessProfile && profile?.verificationTier === 'verified_business' && (
            <span style={{ fontSize:10, fontWeight:800, padding:'2px 9px', borderRadius:100,
              backgroundColor:'#FEF3C7', color:'#B45309' }}>
              🏆 {t('commerce_profile.tier_verified_business')}
            </span>
          )}
          {isBusinessProfile && profile?.verificationTier === 'verified_seller' && (
            <span style={{ fontSize:10, fontWeight:800, padding:'2px 9px', borderRadius:100,
              backgroundColor:'#DCFCE7', color:'#16A34A' }}>
              ✅ {t('commerce_profile.tier_verified_seller')}
            </span>
          )}
          <ReputationBadge score={score} size="sm" />
        </div>

        {/* Handle + location — the identity anchors for THIS profile only.
            No role badges here by design: an account's roles are internal
            bookkeeping for what it's allowed to manage, never a public
            label. A visitor to a business page sees that business; a
            visitor to a personal page sees a person — never both, and
            never a hint of what else the owner runs on the side. */}
        {(displayHandle || activeProfile.location || (isBusinessProfile && profile?.businessLocation)) && (
          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
            {displayHandle && (
              <div style={{ fontSize:12, fontWeight:800, color:DK,
                display:'inline-flex', alignItems:'center', gap:4 }}>
                {displayHandle}
              </div>
            )}
            {(activeProfile.location || (isBusinessProfile && profile?.businessLocation)) && (
              <span style={{ fontSize:11, color:GR }}>📍 {activeProfile.location || profile.businessLocation}</span>
            )}
          </div>
        )}

        {/* Bio */}
        {(activeProfile.bio || (isBusinessProfile && profile?.storeDescription)) && (
          <p style={{ fontSize:13, color:'#475569', margin:'0 0 10px',
            lineHeight:1.5 }}>
            {activeProfile.bio || profile.storeDescription}
          </p>
        )}

        {/* Stats — Sales (profile.completedOrders) and Rating
            (activeProfile.rating) only ever hold real numbers for the
            business type: Sales comes from the seller/business payload,
            and only submitReview()/addReview() stamp commerceProfileId
            for BUSINESS profiles, so every other type's `rating` is
            permanently 0. Showing them elsewhere is either a straight
            leak of the account's business numbers onto a different
            identity (personal, worst case) or a dead "0.0" stat that
            duplicates what agent/hub/transport already show in their own
            tab (deliveries completed, parcels handled, etc.). Followers
            and Reputation (account-level trust) are the only two that
            genuinely apply to every type. */}
        <div style={{ display:'flex', borderTop:'1px solid #f1f5f9',
          marginTop:8 }}>
          {isBusinessProfile && (
            <>
              <Stat value={fmtM(profile?.completedOrders||0)} label={t('commerce_profile.stat_sales')} />
              <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
            </>
          )}
          <Stat value={fmtM(activeProfile.followersCount||0)} label={t('commerce_profile.stat_followers')} />
          {isBusinessProfile && (
            <>
              <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
              <Stat value={Number(activeProfile.rating||0).toFixed(1)} label={t('commerce_profile.stat_rating')} />
            </>
          )}
          <div style={{ width:1, backgroundColor:'#f1f5f9', margin:'8px 0' }} />
          <Stat value={score} label={t('commerce_profile.stat_reputation')} />
        </div>
      </div>

      {/* Also on Kentexa — every OTHER independent profile this account
          runs, shown as its own clickable card (own photo/name/type/
          followers). Visible to everyone, not just the owner — this is
          how a visitor who landed on the wrong identity finds the right
          one, without either profile's own header/stats ever blending
          into the other's. */}
      {siblingProfiles.length > 0 && (
        <div style={{ backgroundColor:WH, padding:'14px 16px', marginBottom:4 }}>
          <div style={{ fontSize:11, fontWeight:800, color:GR, textTransform:'uppercase',
            letterSpacing:0.5, marginBottom:10 }}>
            {t('commerce_profile.also_on_kentexa')}
          </div>
          <div style={{ display:'flex', gap:10, overflowX:'auto', scrollbarWidth:'none', paddingBottom:2 }}>
            {siblingProfiles.map(sp => (
              <button key={sp.id}
                onClick={() => onNavigate(`CommerceProfile-${sp.ownerId}`, { commerceProfileId: sp.id })}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                  background:'none', border:'none', cursor:'pointer', flexShrink:0, width:76 }}>
                <div style={{ width:56, height:56, borderRadius:16, overflow:'hidden',
                  backgroundColor:'#F1F5F9', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:24, border:'1px solid #F1F5F9' }}>
                  {sp.photoUrl
                    ? <img src={sp.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : (sp.displayName||'?').charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:DK, textAlign:'center',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>
                  {sp.displayName}
                </div>
                <div style={{ fontSize:10, color:GR }}>
                  {fmtM(sp.followersCount||0)} {t('commerce_profile.stat_followers')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* People Behind This / Managed By — trust signal on any non-personal
          profile: who's actually running this. Derived from the SAME
          sibling-profiles fetch as "Also on Kentexa" above (no extra
          request) rather than a dedicated lookup. Never shown on a
          personal profile — there's no one "behind" a person. */}
      {activeProfile.type !== 'personal' && (() => {
        const owner = siblingProfiles.find(sp => sp.type === 'personal');
        if (!owner) return null;
        return (
          <div style={{ backgroundColor:WH, padding:'14px 16px', marginBottom:4 }}>
            <div style={{ fontSize:11, fontWeight:800, color:GR, textTransform:'uppercase',
              letterSpacing:0.5, marginBottom:10 }}>
              {t('commerce_profile.people_behind_this')}
            </div>
            <button onClick={() => onNavigate(`CommerceProfile-${owner.ownerId}`, { commerceProfileId: owner.id })}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%',
                background:'none', border:'none', cursor:'pointer', textAlign:'left', padding:0 }}>
              <div style={{ width:44, height:44, borderRadius:14, overflow:'hidden',
                backgroundColor:'#F1F5F9', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:18, fontWeight:800, color:GR, flexShrink:0 }}>
                {owner.photoUrl
                  ? <img src={owner.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : (owner.displayName||'?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:DK }}>{owner.displayName}</div>
                <div style={{ fontSize:11, color:GR }}>{t('commerce_profile.founder_owner_label')}</div>
              </div>
            </button>
          </div>
        );
      })()}

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

      {/* Quick actions for THIS profile (own profile only) */}
      {isOwnProfile && (
        <div style={{ backgroundColor:WH, padding:'14px 0',
          marginBottom:4,
          boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <RoleActions role={roleActionsKey} onNavigate={onNavigate} />
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
              <Empty icon="🏷️"
                text={activeProfile.type === 'business'
                  ? t('commerce_profile.no_products_yet')
                  : t('commerce_profile.no_listings_yet')}
                action={isOwnProfile
                  ? (activeProfile.type === 'business'
                      ? t('commerce_profile.add_product_action')
                      : t('commerce_profile.add_listing_action'))
                  : null}
                onAction={() => onNavigate(activeProfile.type === 'business' ? 'SellerProducts' : 'SellerClassifieds')} />
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

        {/* Feed / Posts — viewing is open to everyone (a follower needs to
            be able to see a moment they were just notified about). The
            compose entry point used to be a separate mini-form here,
            business-only, posting straight to /feed/publish with its own
            new_product/discount/announcement/restock type picker — a whole
            second way to create a Moment, redundant with (and out of sync
            with) the real Moment composer every profile type already
            reaches via the bottom nav's + button. Kentexa has exactly one
            way to post a Moment now; this just opens that same composer,
            open to any own profile type rather than business only. */}
        {tab==='feed' && (
          <div>
            {isOwnProfile && (
              <div style={{ marginBottom:16 }}>
                <button onClick={() => onOpenMoment?.()}
                  style={{ width:'100%', backgroundColor:WH,
                    border:'1.5px dashed #93c5fd', borderRadius:14,
                    padding:16, cursor:'pointer', fontSize:14,
                    fontWeight:700, color:B,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                  {t('commerce_profile.share_moment_button')}
                </button>
              </div>
            )}
            {feed.length === 0
              ? <Empty icon="📢" text={t('commerce_profile.no_announcements')} />
              : feed.map(f => (
                  <FeedPost key={f.id} f={f} onNavigate={onNavigate}
                    isLoggedIn={isLoggedIn} currentUser={currentUser}
                    activeProfileId={viewerActiveProfileId}
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
                    <span style={{ fontSize:28 }}>{PROVIDER_TYPE_ICON[publicTransportData.type] || '🚚'}</span>
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
                  {!publicTransportData.isVerified && (
                    <div style={{ fontSize:11, fontWeight:700, color:'#D97706',
                      backgroundColor:'#FEF3C7', padding:'6px 10px', borderRadius:8, marginBottom:10 }}>
                      ⏳ {t('commerce_profile.transport_pending_verification')}
                    </div>
                  )}
                  {publicTransportData.description && (
                    <div style={{ fontSize:13, color:GR, lineHeight:1.5 }}>
                      {publicTransportData.description}
                    </div>
                  )}
                </div>

                {/* Real upcoming departures — when the next trip actually
                    leaves, not just static coverage. Never hardcoded:
                    sourced from ProviderAvailability via
                    GET /transport/public/:userId. */}
                {publicTransportData.upcomingTrips?.length > 0 && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:16,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:GR, marginBottom:10 }}>
                      {t('commerce_profile.upcoming_trips_label')}
                    </div>
                    {publicTransportData.upcomingTrips.map(trip => (
                      <div key={trip.availabilityId}
                        onClick={() => onNavigate('SendShipment', {
                          origin: trip.fromCity, destination: trip.toCity,
                          availabilityId: trip.availabilityId, routeId: trip.routeId,
                        })}
                        style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                        <span style={{ fontSize:16 }}>{PROVIDER_TYPE_ICON[publicTransportData.type] || '🚚'}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:DK }}>
                            {trip.fromCity} → {trip.toCity}
                          </div>
                          <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                            {new Date(trip.date).toLocaleDateString('sw-TZ')}
                            {trip.departureTime ? ` · ${trip.departureTime}` : ''}
                            {' · '}{t('commerce_profile.slots_available', { count: trip.slotsAvailable })}
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:'#EA580C' }}>{t('commerce_profile.ship_button')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {publicTransportData.routes?.length > 0 && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:16,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize:12, fontWeight:800, color:GR, marginBottom:10 }}>
                      {t('commerce_profile.active_routes_label')}
                    </div>
                    {publicTransportData.routes.map(r => (
                      <div key={r.id}
                        onClick={() => onNavigate('SendShipment', {
                          origin: r.originCity, destination: r.destinationCity, routeId: r.id,
                        })}
                        style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                        <span style={{ fontSize:16 }}>{PROVIDER_TYPE_ICON[publicTransportData.type] || '🚚'}</span>
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

        {/* Services (public) — Business/Service Provider/Agent's own active
            service ads, as a visitor sees them. Distinct from the personal
            'services' tab above, which only ever shows the OWNER's own
            quick-manage list and never renders for a visitor. */}
        {tab==='services_pub' && (
          <div>
            {providerServices.length === 0
              ? <Empty icon="🔧" text={t('commerce_profile.no_services')} />
              : <div style={{ display:'grid',
                  gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                  {providerServices.map(s => (
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

        {/* Portfolio (service_provider only) — past-work gallery, sourced
            from this provider's own service ads' images. No dedicated
            portfolio entity exists yet, so this reuses what's already
            there rather than adding new storage for this pass. */}
        {tab==='portfolio' && (() => {
          const shots = providerServices.flatMap(s =>
            (s.images || []).map(img => ({ img, serviceId: s.id })));
          return shots.length === 0 ? (
            <Empty icon="🖼️" text={t('commerce_profile.no_portfolio_yet')} />
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }}>
              {shots.map((shot, i) => (
                <div key={`${shot.serviceId}-${i}`}
                  onClick={() => onNavigate(`ServiceDetail-${shot.serviceId}`)}
                  style={{ aspectRatio:'1', backgroundColor:'#F8FAFC',
                    cursor:'pointer', overflow:'hidden' }}>
                  <img src={shot.img} alt=""
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}
                    onError={e => e.target.style.display='none'} />
                </div>
              ))}
            </div>
          );
        })()}

        {/* About — bio plus a compact facts block. Same shape across
            Business/Service Provider/Agent/Personal; only the facts that
            actually exist for THIS profile render (profile?.X only ever
            applies to the business type — see isBusinessProfile above),
            so a personal or agent profile's About never shows the
            account's business location/contact/verification instead of
            its own. */}
        {tab==='about' && (() => {
          const facts = [
            (activeProfile.location || (isBusinessProfile && profile?.businessLocation)) &&
              [t('commerce_profile.about_location'), activeProfile.location || profile.businessLocation],
            (isBusinessProfile && (profile?.storeWhatsApp || profile?.phone)) &&
              [t('commerce_profile.about_contact'), profile.storeWhatsApp || profile.phone],
            activeProfile.category && [t('commerce_profile.about_category'), activeProfile.category],
            [t('commerce_profile.about_verified'),
              (activeProfile.isVerified || (isBusinessProfile && profile?.isOfficialStore))
                ? t('commerce_profile.about_verified_yes')
                : t('commerce_profile.about_verified_no')],
          ].filter(Boolean);
          const bio = activeProfile.bio || (isBusinessProfile && profile?.storeDescription);
          return (
            <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
              boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              {bio && (
                <p style={{ fontSize:13, color:'#475569', lineHeight:1.6, margin:'0 0 16px' }}>
                  {bio}
                </p>
              )}
              {facts.map(([label, value]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between',
                  gap:12, padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ fontSize:12, color:GR, flexShrink:0 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:DK, textAlign:'right' }}>{value}</span>
                </div>
              ))}
              {!bio && facts.length === 0 && (
                <Empty icon="ℹ️" text={t('commerce_profile.no_about_yet')} />
              )}
            </div>
          );
        })()}

        {/* Reviews — profile-scoped (GET /profiles/:id/reviews), never the
            owner's account-wide history. The tier card that used to live
            alone under 'reputation' opens this tab too, condensed, so nothing
            from the old single-tab view is lost, just relocated. */}
        {tab==='reviews' && (
          <div>
            <div style={{ background:`linear-gradient(135deg,${tier.color},#1d4ed8)`,
              borderRadius:20, padding:20, color:WH, textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:6 }}>{tier.icon}</div>
              <div style={{ fontSize:18, fontWeight:900 }}>{tier.name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:4 }}>
                {activeProfile.reviewsCount || reviews.length} {t('commerce_profile.tab_reviews')} · ⭐ {Number(activeProfile.rating||0).toFixed(1)}
              </div>
            </div>
            {reviews.length === 0
              ? <Empty icon="⭐" text={t('commerce_profile.no_reviews_yet')} />
              : reviews.map(rv => (
                  <div key={rv.id} style={{ backgroundColor:WH, borderRadius:14, padding:16,
                    marginBottom:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <div style={{ width:32, height:32, borderRadius:10, overflow:'hidden',
                        backgroundColor:'#F1F5F9', display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:14, fontWeight:800, color:GR, flexShrink:0 }}>
                        {rv.reviewerPhoto
                          ? <img src={rv.reviewerPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : (rv.reviewerName||'?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:DK }}>
                          {rv.reviewerName || t('commerce_profile.reviewer_fallback')}
                        </div>
                        <div style={{ fontSize:10, color:'#94a3b8' }}>
                          {new Date(rv.createdAt).toLocaleDateString('sw-TZ')}
                        </div>
                      </div>
                      <div style={{ fontSize:12, fontWeight:800, color:'#d97706', flexShrink:0 }}>
                        {'⭐'.repeat(Math.max(0, Math.round(rv.rating||0)))}
                      </div>
                    </div>
                    {rv.comment && (
                      <div style={{ fontSize:12, color:'#475569', lineHeight:1.5 }}>{rv.comment}</div>
                    )}
                  </div>
                ))}
          </div>
        )}
      </div>
    </div>
  );
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
const PostThread = ({ postId, isLoggedIn, onNavigate, activeProfileId }) => {
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
      const res = await api.post(`/feed/${postId}/comments`, { body: body.trim(), commerceProfileId: activeProfileId || undefined });
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
      ) : comments.map(c => {
        const commenterName = c.commerceProfile?.displayName || c.author?.storeName || c.author?.name;
        const commenterPhoto = c.commerceProfile?.photoUrl || c.author?.avatarUrl || c.author?.logo;
        return (
        <div key={c.id} style={{ display:'flex', gap:8, marginBottom:10 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
            backgroundColor:B, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, color:WH, fontWeight:900, overflow:'hidden' }}>
            {commenterPhoto
              ? <img src={commenterPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : (commenterName || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:800, color:DK }}>
              {commenterName || t('commerce_profile.user_fallback')}
            </div>
            <div style={{ fontSize:12, color:DK, lineHeight:1.4 }}>{c.body}</div>
          </div>
        </div>
        );
      })}
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

const FeedPost = ({ f, onNavigate, isLoggedIn, currentUser, highlighted, postRef, activeProfileId }) => {
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
              isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate}
              activeProfileId={activeProfileId} />
          </div>
        ) : (
          <PostThread postId={f.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate}
            activeProfileId={activeProfileId} />
        )
      )}
    </div>
  );
};

export default CommerceProfile;