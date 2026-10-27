/**
 * CommerceProfile.js — Role-aware identity profile
 * Place at: src/public/pages/CommerceProfile.js
 *
 * Same page for all users — tabs change based on active roles.
 * Own profile shows dashboard actions. Others' profiles show public info.
 */
import { LineIcon } from '../components/LineIcon';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ExpandableText from '../components/ExpandableText';
import { trackProfileView } from '../hooks/useAnalytics';
import ProfileCompletion from '../components/ProfileCompletion';
import CommerceCommentSection from '../components/CommerceCommentSection';
import api             from '../../api/api';
import { commenterIdentity } from '../utils/publicActor';

import ProfileConnections from '../components/ProfileConnections';
import { listingUrl, listingWhatsAppHref } from '../utils/listingWhatsApp';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

// Kentexa verification mark: familiar social-platform verification semantics,
// but a Kentexa-owned visual rather than another platform's trademarked asset.
const VerifiedBadge = ({ official = false }) => (
  <span
    aria-label={official ? 'Official Kentexa' : 'Verified on Kentexa'}
    title={official ? 'Official Kentexa' : 'Verified on Kentexa'}
    style={{
      width: 20, height: 20, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, position: 'relative',
      filter: 'drop-shadow(0 1px 2px rgba(37,99,235,.32))'
    }}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1687F8" d="M12 1.7l2.05 1.62 2.58-.35 1.13 2.35 2.4 1.02-.13 2.6 1.82 1.87-1.36 2.22.64 2.53-2.18 1.43-.88 2.46-2.6.12L12 22.3l-2.05-1.62-2.58.35-1.13-2.35-2.4-1.02.13-2.6-1.82-1.87 1.36-2.22-.64-2.53 2.18-1.43.88-2.46 2.6-.12L12 1.7z"/>
      <path fill="#fff" d="M10.25 16.45L6.7 12.9l1.55-1.55 2 2 5.5-5.5 1.55 1.55-7.05 7.05z"/>
    </svg>
  </span>
);

// Twitter-style type and colors for the identity page (owner 2026-10-26).
const TW_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const iconBtn = { width:40, height:40, borderRadius:20, border:'none', background:'none', cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 };
const pillOutline = { height:40, padding:'0 16px', borderRadius:20, border:'1px solid #cfd9de', backgroundColor:'#fff',
  color:INK, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' };
const iconPill = { width:40, height:40, borderRadius:20, border:'1px solid #cfd9de', display:'flex',
  alignItems:'center', justifyContent:'center', boxSizing:'border-box', textDecoration:'none' };
const countBtn = { background:'none', border:'none', padding:0, cursor:'pointer', fontSize:15, fontFamily:'inherit' };

const agoShort = (d) => {
  if (!d) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 60) return `dk ${m || 1}`;
  if (m < 1440) return `saa ${Math.round(m / 60)}`;
  if (m < 10080) return `siku ${Math.round(m / 1440)}`;
  return new Date(d).toLocaleDateString('sw-TZ', { day:'numeric', month:'short' });
};
const fmt  = n => Number(n||0).toLocaleString();
const fmtM = n => { const v=Number(n||0); return v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1000?`${(v/1e3).toFixed(0)}K`:String(v); };

// Matches ProviderType on the backend (transport-provider.entity.ts) — a
// truck operator's profile showing a bus icon (the old hardcoded default)
// told visitors nothing true about what that provider actually runs.
const PROVIDER_TYPE_ICON = {
  bus: 'bus', van: 'truck', courier: 'box', truck: 'truck',
  boda: 'moto', rail: 'bus', air: 'globe', boat: 'globe',
};

const getTiers = t => [
  {min:900,name:t('my_profile.tier_elite'),  icon:'trophy',color:'#dc2626',bg:'#fee2e2'},
  {min:600,name:t('my_profile.tier_partner'),icon:'gem',color:'#7c3aed',bg:'#ede9fe'},
  {min:300,name:t('my_profile.tier_loyal'),  icon:'star',color:'#1d4ed8',bg:'#dbeafe'},
  {min:100,name:t('my_profile.tier_trusted'),icon:'star',color:'#16a34a',bg:'#dcfce7'},
  {min:0,  name:t('my_profile.tier_new'),    icon:'sprout',color:'#64748b',bg:'#f1f5f9'},
];

// ─── Action button ────────────────────────────────────────────────────────────
const Action = ({ icon, label, onClick, color=B, bg='#eff6ff' }) => (
  <button onClick={onClick}
    style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:4, backgroundColor:bg, border:'none', borderRadius:14,
      padding:'14px 12px', cursor:'pointer', flex:1, minWidth:0 }}>
    <LineIcon name={icon} size={22} />
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
      {icon:'box',label:t('commerce_profile.action_orders'),    page:'SellerOrders',     bg:'#eff6ff', color:B},
      {icon:'tag',label:t('commerce_profile.action_products'),    page:'SellerClassifieds', bg:'#f0fdf4', color:'#16a34a'},
      {icon:'chart',label:t('commerce_profile.action_analytics'),  page:'SellerAnalytics',  bg:'#f5f3ff', color:'#7c3aed'},
      {icon:'megaphone',label:t('commerce_profile.action_listing'),    page:'CommerceProfile',  bg:'#fff7ed', color:'#ea580c'},
      {icon:'people',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
      {icon:'card',label:t('commerce_profile.action_payments'),     page:'SellerPayouts',    bg:'#fef9c3', color:'#ca8a04'},
    ],
    agent: [
      {icon:'moto',label:t('commerce_profile.action_my_jobs'), page:'AgentDashboard',   bg:'#fdf2f8', color:'#a21caf'},
      {icon:'money',label:t('commerce_profile.action_earnings'),     page:'AgentEarnings',    bg:'#f0fdf4', color:'#16a34a'},
      {icon:'chart',label:t('commerce_profile.action_scorecard'),  page:'AgentScorecard',   bg:'#eff6ff', color:B},
      {icon:'box',label:t('commerce_profile.action_parcels'),  page:'AgentDashboard',   bg:'#fff7ed', color:'#ea580c'},
      {icon:'people',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
    ],
    super_agent: [
      {icon:'office',label:t('commerce_profile.action_my_hub'),  page:'SuperAgentDashboard',bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'box',label:t('commerce_profile.action_parcels'),  page:'SuperAgentDashboard',bg:'#eff6ff',color:B},
      {icon:'bus',label:t('commerce_profile.action_transport'),    page:'SuperAgentDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'chart',label:t('commerce_profile.action_analytics'),  page:'SuperAgentDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'people',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
    ],
    transport_provider: [
      {icon:'bus',label:t('commerce_profile.action_my_routes'),page:'TransportProviderDashboard',bg:'#fff7ed',color:'#ea580c'},
      {icon:'calendar',label:t('commerce_profile.action_availability'),page:'TransportProviderDashboard',bg:'#f0fdf4',color:'#16a34a'},
      {icon:'box',label:t('commerce_profile.action_orders'),    page:'TransportProviderDashboard',bg:'#eff6ff',color:B},
      {icon:'map',label:t('commerce_profile.action_my_routes'), page:'RouteCoverageMap',          bg:'#f5f3ff',color:'#7c3aed'},
      {icon:'people',label:t('commerce_profile.action_team'),       page:'SellerTeam',       bg:'#f0f9ff', color:'#0284c7'},
    ],
  };

  // Buyer actions (everyone)
  const buyerActions = [
    {icon:'box',label:t('commerce_profile.action_my_orders'),page:'MyOrders',       bg:'#eff6ff', color:B},
    {icon:'heart',label:t('commerce_profile.action_saved'),page:'Wishlist',     bg:'#fff1f2', color:'#e11d48'},
    {icon:'search',label:t('commerce_profile.action_discover'),        page:'Search',        bg:'#f0fdf4', color:'#16a34a'},
    {icon:'tag',label:t('commerce_profile.action_list_item'),       page:'SellerClassifieds',bg:'#fef9c3',color:'#ca8a04'},
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
// Moments come first on every identity (owner 2026-10-26: "moment should start").
const tabs = (profileType, isOwn, t) => {
  const list = tabsInner(profileType, isOwn, t);
  const feed = list.find(x => x.key === 'feed');
  const rest = list.filter(x => x.key !== 'feed');
  if (!rest.some(x => x.key === 'about')) rest.push({ key:'about', label:t('commerce_profile.tab_about') });
  return feed ? [{ ...feed, label:'Moments' }, ...rest] : rest;
};
const tabsInner = (profileType, isOwn, t) => {
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
      { key:'about',     label:t('commerce_profile.tab_about') },
    ];
  }
  // Personal — About + (own-only) their own listing grid/quick services,
  // plus Reputation, plus the same moments/updates feed every other type
  // now gets. "Profiles" (Also on Kentexa) is always-visible below the
  // header, not a tab, so it isn't listed here.
  const base = [];
  // A person's listings are public (owner 2026-10-26): visitors see them too, right after Moments.
  base.push({ key:'posts', label:t('commerce_profile.tab_listings') });
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
  // Hotel food ordering (owner 2026-10-27): a business with a menu shows a "Menyu" button.
  const [foodMenuBusinessId, setFoodMenuBusinessId] = useState(null);
  useEffect(() => {
    setFoodMenuBusinessId(null);
    if (activeProfile?.type !== 'business' || !activeProfile?.id) return undefined;
    let alive = true;
    api.get(`/food/profile/${activeProfile.id}`)
      .then((r) => { if (alive && r.data?.hasMenu) setFoodMenuBusinessId(r.data.businessId); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeProfile?.id, activeProfile?.type]);
  const isOwnProfile = !!(activeProfile && currentUser && activeProfile.ownerId === currentUser.id);
  const [shareMsg, setShareMsg] = useState('');

  const [profile,    setProfile]    = useState(null);
  const [rep,        setRep]        = useState(null);
  const [feed,       setFeed]       = useState([]);
  const [savedPostIds, setSavedPostIds] = useState([]);
  // Instagram-style profile grid: tapping a thumbnail opens the full post
  // (image/caption/comments/CTA — everything FeedPost already rendered
  // inline) in an overlay instead of losing that content to a thumbnail.
  const [openPostId, setOpenPostId] = useState(null);
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
  const [manageOpen, setManageOpen] = useState(false);
  const [connections, setConnections] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const [following,  setFollowing]  = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);

  // Step 1 — resolve exactly which profile this page is for.
  useEffect(() => {
    setLoading(true);
    setActiveProfile(null);
    setConnections(null);
    setFollowError('');
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

    let cancelled = false;
    resolve.then(async res => {
      // for-user gives identity metadata, not current social relationships.
      const detailed = res.data?.id && !commerceProfileId ? await api.get(`/profiles/${res.data.id}`) : res;
      if (cancelled) return;
      res = detailed;
      setActiveProfile(res.data || null);
      setFollowing(!!res.data?.isFollowing);
      setIsFollowedBy(!!res.data?.isFollowedBy);
    }).catch(() => { if (!cancelled) setActiveProfile(null); });
    return () => { cancelled = true; };
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
      isLoggedIn ? api.get('/feed/saved/ids').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([p,r,f,o,s,a,cl,pr,saved]) => {
      if (p.status==='fulfilled') setProfile(p.value.data);
      if (r.status==='fulfilled') setRep(r.value.data);
      if (f.status==='fulfilled') setFeed(f.value.data || []);
      if (o.status==='fulfilled') setOrders(o.value.data?.orders || o.value.data || []);
      if (s.status==='fulfilled') setServices(s.value.data || []);
      if (a.status==='fulfilled') setAgentData(a.value.data);
      if (cl.status==='fulfilled') setClassifieds(cl.value.data || []);
      if (pr.status==='fulfilled') setProducts(pr.value.data || []);
      if (saved.status==='fulfilled') setSavedPostIds(saved.value.data || []);
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
    // Scoped to THIS specific CommerceProfile (for-profile/:commerceProfileId
    // resolves internally to businessId- or commerceProfileId-scoped rows) —
    // never the raw owner id, which would mix every business/personal
    // service the same human runs into one list (B6D-P0).
    setProviderServices([]);
    if (['business', 'service_provider', 'agent'].includes(activeProfile.type)) {
      api.get(`/services/for-profile/${activeProfile.id}`).then(r => setProviderServices(r.data || [])).catch(() => {});
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
  }, [activeProfile?.id, currentUser?.id]); // eslint-disable-line

  // Deep-linked from a "New save"/"New comment" notification — the Feed
  // tab is now a thumbnail grid, so "scroll to it" doesn't show much;
  // opening it directly in the post overlay actually lands the viewer on
  // what the notification was about.
  useEffect(() => {
    if (!highlightPostId || tab !== 'feed' || !feed.length) return;
    setOpenPostId(highlightPostId);
  }, [feed, tab, highlightPostId]);


  const handleFollow = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!activeProfile) return;
    try {
      // Follows THIS profile specifically — following Bishoo Intelligence
      // Systems never implies following Kened personally, or vice versa.
      if (followBusy) return;
      setFollowBusy(true); setFollowError('');
      const res = await api.post(`/profiles/${activeProfile.id}/follow`);
      setFollowing(res.data.following);
      setActiveProfile(p => p ? { ...p, followersCount: res.data.followersCount } : p);
    } catch { setFollowError(t('profile_connections.error')); }
    finally { setFollowBusy(false); }
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'inherit' }}>
      <div style={{ textAlign:'center', color:'#94a3b8' }}>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}><LineIcon name="person" size={36} color="#94a3b8" /></div>
        <div>{t('commerce_profile.loading_profile')}</div>
      </div>
    </div>
  );

  if (!activeProfile) return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc', display:'flex',
      flexDirection:'column', fontFamily:'inherit' }}>
      <div style={{ backgroundColor:WH, borderBottom:'1px solid #f1f5f9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={DK} strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ display:'flex', justifyContent:'center' }}><LineIcon name="search" size={48} color="#94a3b8" /></div>
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
  // @kentexa is a protected, Admin-assigned handle. Treat it as the canonical
  // platform identity, distinct from ordinary account/business verification.
  const isOfficialKentexa = activeProfile.username?.toLowerCase() === 'kentexa';
  // RoleActions' internal keying predates CommerceProfileType and still
  // expects role-shaped strings ('seller' not 'business', 'super_agent'
  // not 'hub') — map at the boundary rather than rename that component's
  // internal vocabulary as part of this change.
  const roleActionsKey = {
    business: 'seller', agent: 'agent', hub: 'super_agent', transport_provider: 'transport_provider',
  }[activeProfile.type] || null;

  // Communication canonicality fix: which conversation "Message" opens
  // must preserve the operational identity actually being viewed, not
  // just the underlying person. A Super Agent hub, Agent, or Transport
  // Provider profile routes through MessageOperational-{type}-{profileId}
  // (profileId = activeProfile.id, the same CommerceProfile.id already
  // used elsewhere on this page -- resolved server-side, see
  // ConversationService.resolveOperationalTarget) instead of collapsing
  // onto that same person's Seller conversation via bare User.id. Seller/
  // Personal/Service Provider profiles keep the exact legacy
  // MessageSeller-{ownerId} link.
  const OPERATIONAL_TARGET_TYPE = { agent: 'agent', hub: 'super_agent', transport_provider: 'transport_provider' };
  const messageDestination = OPERATIONAL_TARGET_TYPE[activeProfile.type]
    ? `MessageOperational-${OPERATIONAL_TARGET_TYPE[activeProfile.type]}-${activeProfile.id}`
    : `MessageSeller-${activeProfile.ownerId}`;

  // ── Brand header (owner 2026-10-26: "make KenteXa a brand authority") ──
  const KIND_LABEL = { business:'Biashara', hub:'Ofisi ya usafirishaji', agent:'Wakala wa KenteXa',
    transport_provider:'Usafiri', service_provider:'Huduma', personal:'' };
  const identityKind = KIND_LABEL[activeProfile.type] ?? '';
  const place = activeProfile.location || (isBusinessProfile && profile?.businessLocation) || '';
  const joined = activeProfile.createdAt
    ? new Date(activeProfile.createdAt).toLocaleDateString('sw-TZ', { month:'long', year:'numeric' }) : '';
  const isVerifiedIdentity = !!(activeProfile.isVerified || (isBusinessProfile && profile?.isOfficialStore));
  const waPhone = isBusinessProfile ? (profile?.storeWhatsApp || profile?.phone)
    : isTransportProfile ? publicTransportData?.whatsappPhone : null;
  const waHref = waPhone ? listingWhatsAppHref({ phone: waPhone, kind: isTransportProfile ? 'transport' : 'store',
    url: listingUrl('store', targetId),
    shopName: isTransportProfile ? (publicTransportData?.name || profile?.name) : (profile?.storeName || profile?.displayName || profile?.name) }) : null;
  // Trust numbers come only from records KenteXa keeps (orders, deliveries, reviews,
  // reputation), never from what the owner typed.
  const ratingNum = Number(isTransportProfile ? publicTransportData?.rating : activeProfile.rating) || 0;
  const ratingCount = Number(isTransportProfile ? publicTransportData?.totalRatings : activeProfile.reviewsCount) || 0;
  const trustStats = [
    ratingCount > 0 || ratingNum > 0
      ? { value: ratingNum.toFixed(1), label: ratingCount ? `Maoni ${fmt(ratingCount)}` : t('commerce_profile.stat_rating') } : null,
    isBusinessProfile ? { value: fmtM(profile?.completedOrders || 0), label: 'Oda zilizokamilika' } : null,
    isTransportProfile && publicTransportData ? { value: fmtM(publicTransportData.completedAssignments || 0), label: 'Mizigo imefika' } : null,
    isTransportProfile && publicTransportData ? { value: fmtM(publicTransportData.routes?.length || 0), label: 'Njia' } : null,
    { value: fmt(score), label: `Alama · ${tier.name}` },
  ].filter(Boolean);
  const trustBadges = [
    isOfficialKentexa ? { label: 'KenteXa rasmi', bg:'#eff6ff', color:'#1e40af' } : null,
    !isOfficialKentexa && isVerifiedIdentity ? { label: 'Imethibitishwa na KenteXa', bg:'#eff6ff', color:'#1e40af' } : null,
    isBusinessProfile && profile?.verificationTier === 'verified_business' ? { label: t('commerce_profile.tier_verified_business'), bg:'#fef3c7', color:'#92400e' } : null,
    isBusinessProfile && profile?.verificationTier === 'verified_seller' ? { label: t('commerce_profile.tier_verified_seller'), bg:'#f0fdf4', color:'#166534' } : null,
    isTransportProfile && publicTransportData ? (publicTransportData.isVerified
      ? { label: 'Msafirishaji amethibitishwa', bg:'#f0fdf4', color:'#166534' }
      : { label: 'Uthibitisho unasubiri', bg:'#fef3c7', color:'#92400e' }) : null,
  ].filter(Boolean);

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
    <div style={{ minHeight:'100vh', backgroundColor:'#f7f9f9', paddingBottom:100, color:INK,
      fontFamily:TW_FONT }}>

      {/* Top bar: name and what this identity is, Twitter-style */}
      <div style={{ position:'sticky', top:0, zIndex:100, backgroundColor:'rgba(255,255,255,0.92)',
        backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderBottom:`1px solid ${LINE}`,
        display:'flex', alignItems:'center', gap:8, padding:'4px 8px', minHeight:52, boxSizing:'border-box' }}>
        <button onClick={() => onNavigate('back')} aria-label={t('common.back', 'Rudi')} style={iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:17, fontWeight:700, color:INK, lineHeight:'20px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {displayName || t('commerce_profile.profile_fallback')}
          </div>
          {identityKind && <div style={{ fontSize:13, color:MUTED, lineHeight:'16px' }}>{identityKind}</div>}
        </div>
        <button onClick={handleShare} aria-label={t('share.button')} title={t('share.button')} style={iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>
          </svg>
        </button>
      </div>

      {shareMsg && (
        <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '10px 16px', fontSize: 14, textAlign: 'center' }}>
          {shareMsg}
        </div>
      )}

      <div style={{ backgroundColor:WH, marginBottom:4 }}>
        {/* Cover + logo */}
        <div style={{ position:'relative' }}>
          <div style={{ height:132, overflow:'hidden',
            background: (activeProfile.coverImage || (isBusinessProfile && profile?.coverImage))
              ? `url(${activeProfile.coverImage || profile.coverImage}) center/cover`
              : B }} />
          <div style={{ position:'absolute', bottom:-42, left:16,
            width:88, height:88, borderRadius:22, border:`4px solid ${WH}`, overflow:'hidden',
            backgroundColor:INK, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:34, color:WH, fontWeight:800, boxSizing:'border-box' }}>
            {displayPhoto
              ? <img src={displayPhoto} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
              : (displayName||'K').charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Actions, right-aligned under the cover */}
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, padding:'12px 16px 0', minHeight:40, flexWrap:'wrap' }}>
          {isOwnProfile ? (
            <>
              <button onClick={() => setManageOpen(v => !v)} aria-expanded={manageOpen}
                style={manageOpen ? { ...pillOutline, backgroundColor:INK, color:WH, borderColor:INK } : pillOutline}>
                Simamia
              </button>
              <button onClick={() => onNavigate('RoleActivation')} style={pillOutline}>
                {t('commerce_profile.add_role_button')}
              </button>
              <button onClick={() => onNavigate('EditPublicProfile', { commerceProfileId: activeProfile.id })} style={pillOutline}>
                {t('commerce_profile.edit_button')}
              </button>
            </>
          ) : (
            <>
              {waHref && (
                <a href={waHref} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={iconPill}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" aria-hidden="true">
                    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/>
                  </svg>
                </a>
              )}
              {foodMenuBusinessId && (
                <button type="button" data-testid="profile-food-menu" onClick={() => onNavigate(`HotelMenu-${foodMenuBusinessId}`)}
                  style={{ ...pillOutline, backgroundColor: '#1d4ed8', color: WH, borderColor: '#1d4ed8' }}>
                  Menyu
                </button>
              )}
              <button onClick={() => onNavigate(isLoggedIn ? messageDestination : 'PublicLogin', isLoggedIn && messageDestination.startsWith('MessageSeller-') ? { commerceProfileId: activeProfile.id } : undefined)}
                style={pillOutline}>
                {t('commerce_profile.message_button')}
              </button>
              <button onClick={handleFollow} disabled={followBusy}
                style={following ? pillOutline : { ...pillOutline, backgroundColor:INK, color:WH, borderColor:INK }}>
                {following
                  ? t('commerce_profile.unfollow_button')
                  : isFollowedBy
                    ? t('commerce_profile.follow_back_button')
                    : t('commerce_profile.follow_button')}
              </button>
            </>
          )}
        </div>

        {/* Name, badge, handle, bio */}
        <div style={{ padding:'18px 16px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <h1 style={{ fontSize:22, fontWeight:800, color:INK, margin:0, lineHeight:'26px' }}>
                {displayName || t('commerce_profile.default_name')}
              </h1>
              {isOfficialKentexa ? <VerifiedBadge official /> : isVerifiedIdentity && <VerifiedBadge />}
            </div>
            {(displayHandle || activeProfile.category) && (
              <div style={{ fontSize:15, color:MUTED, lineHeight:'20px', marginTop:2 }}>
                {[displayHandle, activeProfile.category].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {(activeProfile.bio || (isBusinessProfile && profile?.storeDescription)) && (
            <ExpandableText text={activeProfile.bio || profile.storeDescription} lines={4} />
          )}

          {(place || joined) && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 14px', fontSize:15, color:MUTED }}>
              {place && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
                  {place}
                </span>
              )}
              {joined && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
                  Kwenye KenteXa tangu {joined}
                </span>
              )}
            </div>
          )}

          <div style={{ display:'flex', gap:16, fontSize:15 }}>
            <button type="button" onClick={() => setConnections('followers')} style={countBtn}>
              <b style={{ color:INK }}>{fmt(activeProfile.followersCount||0)}</b> <span style={{ color:MUTED }}>{t('commerce_profile.stat_followers')}</span>
            </button>
            <button type="button" onClick={() => setConnections('following')} style={countBtn}>
              <b style={{ color:INK }}>{fmt(activeProfile.followingCount||0)}</b> <span style={{ color:MUTED }}>{t(activeProfile.type === 'personal' ? 'profile_connections.following' : 'profile_connections.account_following')}</span>
            </button>
          </div>

          {isTransportProfile && publicTransportData && !isOwnProfile && (
            <button onClick={() => onNavigate(isLoggedIn ? 'SendShipment' : 'PublicLogin', isLoggedIn ? { transportProviderId: publicTransportData.id, transportProviderName: publicTransportData.name, transportProfileId: activeProfile.id } : undefined)}
              style={{ height:48, borderRadius:24, border:'none', backgroundColor:B, color:WH, fontSize:15, fontWeight:700, cursor:'pointer' }}>
              Tuma mzigo
            </button>
          )}
        </div>

        {/* Trust on KenteXa: only numbers KenteXa recorded, never typed by the owner */}
        <div data-testid="trust-card" style={{ margin:'0 16px 16px', border:`1px solid ${LINE}`, borderRadius:16, padding:14, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B} strokeWidth="2" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>
            <span style={{ fontSize:15, fontWeight:700, color:INK }}>Imani kwenye KenteXa</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${trustStats.length}, minmax(0, 1fr))`, gap:8 }}>
            {trustStats.map(s => (
              <div key={s.label} style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
                <span style={{ fontSize:20, fontWeight:800, color:INK }}>{s.value}</span>
                <span style={{ fontSize:13, color:MUTED }}>{s.label}</span>
              </div>
            ))}
          </div>
          {trustBadges.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {trustBadges.map(b => (
                <span key={b.label} style={{ fontSize:13, padding:'4px 10px', borderRadius:999, background:b.bg, color:b.color }}>{b.label}</span>
              ))}
            </div>
          )}
          <div style={{ fontSize:13, color:MUTED, lineHeight:'18px' }}>
            Taarifa hizi zinatoka kwenye oda, mizigo na maoni halisi kwenye KenteXa. Mwenye wasifu hawezi kuzibadilisha.
          </div>
        </div>
      </div>

      {followError && <p role="alert" style={{ color: '#b91c1c', padding: '0 16px' }}>{followError}</p>}
      {connections && (
        <ProfileConnections profile={activeProfile} kind={connections} isLoggedIn={isLoggedIn}
          currentUser={currentUser} onNavigate={onNavigate} onClose={() => setConnections(null)}
          onChanged={async () => {
            const res = await api.get(`/profiles/${activeProfile.id}`);
            setActiveProfile(res.data); setFollowing(!!res.data.isFollowing); setIsFollowedBy(!!res.data.isFollowedBy);
          }} />
      )}

      {/* Profile completion + dashboard shortcuts (own profile only), behind "Simamia" */}
      {isOwnProfile && manageOpen && (
        <div style={{ padding:'0 16px', marginBottom:4 }}>
          <ProfileCompletion
            currentUser={currentUser}
            userRole={userRole}
            onNavigate={onNavigate}
            compact={true}
            personalProfile={activeProfile.type === 'personal' ? activeProfile : undefined}
          />
        </div>
      )}

      {/* Quick actions for THIS profile (own profile only) */}
      {isOwnProfile && manageOpen && (
        <div style={{ backgroundColor:WH, padding:'14px 0',
          marginBottom:4,
          boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
          <RoleActions role={roleActionsKey} onNavigate={onNavigate} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ backgroundColor:WH, borderBottom:`1px solid ${LINE}`,
        position:'sticky', top:52, zIndex:90,
        display:'flex', overflowX:'auto', scrollbarWidth:'none' }}>
        {profileTabs.map(tabItem => (
          <button key={tabItem.key} onClick={() => {
            setTab(tabItem.key);
            if (tabItem.key==='services' && services.length===0) {
              api.get('/services/my').then(r=>setServices(r.data||[])).catch(()=>{});
            }
          }}
            style={{ padding:'0 16px', height:52, border:'none', cursor:'pointer',
              backgroundColor:'transparent', fontSize:15, fontFamily:'inherit',
              fontWeight: tab===tabItem.key ? 700 : 500,
              whiteSpace:'nowrap', flexShrink:0, flexGrow:1, position:'relative',
              color: tab===tabItem.key ? INK : MUTED }}>
            {tabItem.label}
            <span aria-hidden="true" style={{ position:'absolute', left:'50%', bottom:0, transform:'translateX(-50%)',
              width:'min(56px, 70%)', height:4, borderRadius:2,
              backgroundColor: tab===tabItem.key ? B : 'transparent' }} />
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
              <Empty icon="tag"
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
                  ...products.map(p => ({ kind:'product', id:p.id, image:p.images?.[0], icon:'cart',
                    createdAt:p.createdAt, available:p.isAvailable && Number(p.stock) > 0 })),
                  ...classifieds.map(c => ({ kind:'classified', id:c.id, image:c.images?.[0], icon:'tag',
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
                            <LineIcon name={item.icon} size={26} color="#94a3b8" />
                          </div>}
                      <span style={{ position:'absolute', top:4, right:4, display:'flex', padding:3, borderRadius:8, background:'rgba(255,255,255,0.9)' }}>
                        <LineIcon name={item.icon} size={12} color="#0f1419" />
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
                  style={{ width:'100%', height:48, backgroundColor:B, border:'none', borderRadius:24,
                    cursor:'pointer', fontSize:15, fontWeight:700, color:WH, fontFamily:'inherit' }}>
                  {t('commerce_profile.share_moment_button')}
                </button>
              </div>
            )}
            {/* Moments as a Twitter-style list: who, when, the whole text with
                "Soma zaidi", the picture, counts. Tap opens the full post. */}
            {feed.length === 0
              ? <Empty icon="megaphone" text={t('commerce_profile.no_announcements')} />
              : (
                <div style={{ margin:'0 -16px', backgroundColor:WH, borderTop:`1px solid ${LINE}` }}>
                  {feed.map(f => {
                    const title = (f.title || '').trim();
                    const body = (f.body || '').trim();
                    const text = body && (title === body || title === 'Moment') ? body
                      : [title !== 'Moment' ? title : '', body].filter(Boolean).join('\n');
                    return (
                      <article key={f.id} ref={highlightPostId === f.id ? highlightPostRef : null}
                        onClick={() => setOpenPostId(f.id)}
                        style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:`1px solid ${LINE}`, cursor:'pointer',
                          backgroundColor: highlightPostId === f.id ? '#eff6ff' : WH }}>
                        <div style={{ width:40, height:40, borderRadius:10, overflow:'hidden', backgroundColor:INK, color:WH,
                          display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, flexShrink:0 }}>
                          {displayPhoto ? <img src={displayPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : (displayName||'K').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:6 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:15, minWidth:0 }}>
                            <b style={{ color:INK, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</b>
                            {isVerifiedIdentity && <VerifiedBadge />}
                            <span style={{ color:MUTED, whiteSpace:'nowrap' }}>· {agoShort(f.createdAt)}</span>
                          </div>
                          {text && <ExpandableText text={text} lines={4} />}
                          {f.imageUrl && (
                            <img src={f.imageUrl} alt="" data-testid="moment-image"
                              onClick={(e) => {
                                // A Moment made from a listing: its picture opens that listing.
                                if (!f.linkedEntityType || !f.linkedEntityId) return;
                                e.stopPropagation();
                                onNavigate(f.linkedEntityType === 'product' ? `ProductDetail-${f.linkedEntityId}`
                                  : f.linkedEntityType === 'service' ? `ServiceDetail-${f.linkedEntityId}`
                                  : `ClassifiedDetail-${f.linkedEntityId}`);
                              }}
                              style={{ width:'100%', maxHeight:420, objectFit:'cover',
                                borderRadius:16, border:`1px solid ${LINE}` }} />
                          )}
                          <div style={{ display:'flex', gap:24, color:MUTED, fontSize:13 }}>
                            <span>Maoni {fmt(f.commentCount || 0)}</span>
                            <span>Imependwa {fmt(f.saveCount || 0)}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* Post overlay — opened from a grid tile tap, or a deep-linked
            notification (see the highlightPostId effect above). */}
        {openPostId != null && (() => {
          const openPost = feed.find(f => f.id === openPostId);
          if (!openPost) return null;
          return (
            <div onClick={() => setOpenPostId(null)}
              style={{ position:'fixed', inset:0, backgroundColor:'rgba(15,23,42,0.6)',
                zIndex:4000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor:WH, borderRadius:'20px 20px 0 0', width:'100%',
                  maxWidth:480, maxHeight:'88vh', overflowY:'auto', padding:'8px 16px 16px',
                  boxSizing:'border-box' }}>
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button onClick={() => setOpenPostId(null)}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:24,
                      color:GR, padding:4 }}>×</button>
                </div>
                <FeedPost f={openPost} onNavigate={onNavigate}
                  isLoggedIn={isLoggedIn} currentUser={currentUser}
                  activeProfileId={viewerActiveProfileId}
                  initiallyLiked={savedPostIds.includes(openPost.id)}
                  onDeleted={(postId) => {
                    setFeed(prev => prev.filter(item => item.id !== postId));
                    setOpenPostId(null);
                  }} />
              </div>
            </div>
          );
        })()}

        {/* Orders */}
        {tab==='orders' && (
          <div>
            {orders.length === 0
              ? <Empty icon="box" text={t('commerce_profile.no_orders')}
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
                        <div style={{ fontSize:14, fontWeight:800, color:B }}>
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
              ? <Empty icon="wrench" text={t('commerce_profile.no_services')} />
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
                        {s.category}
                      </span>
                      <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:4 }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize:14, fontWeight:800, color:B }}>
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
                        <span style={{ fontSize:14, fontWeight:800, color:c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : !publicAgentData ? (
              <Empty icon="moto" text={t('commerce_profile.agent_profile_unavailable')} />
            ) : (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <LineIcon name="moto" size={28} />
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:DK }}>
                      {publicAgentData.fullName || t('commerce_profile.delivery_agent_fallback')}
                    </div>
                    <div style={{ fontSize:12, color:GR }}>
                      {publicAgentData.district || publicAgentData.city || t('commerce_profile.location_fallback')}
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
                  [t('commerce_profile.rating_label'), (publicAgentData.totalRatings > 0 ? `${Number(publicAgentData.rating||0).toFixed(1)} / 5 (${publicAgentData.totalRatings})` : '—'), '#D97706'],
                ].map(([l,v,c]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:13, color:GR }}>{l}</span>
                    <span style={{ fontSize:14, fontWeight:800, color:c }}>{v}</span>
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
              <Empty icon="office" text={t('commerce_profile.hub_profile_unavailable')} />
            ) : (
              <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <LineIcon name="office" size={28} />
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:DK }}>
                      {publicHubData.businessName}
                    </div>
                    <div style={{ fontSize:12, color:GR }}>
                      {publicHubData.city} {publicHubData.cityCode ? `(${publicHubData.cityCode})` : ''}
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
                  [t('commerce_profile.rating_label'), `${Number(publicHubData.rating||0).toFixed(1)} (${publicHubData.totalRatings||0})`, '#D97706'],
                ].map(([l,v,c]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between',
                    padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                    <span style={{ fontSize:13, color:GR }}>{l}</span>
                    <span style={{ fontSize:14, fontWeight:800, color:c }}>{v}</span>
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
              <Empty icon="bus" text={t('commerce_profile.transport_profile_unavailable')} />
            ) : (
              <div>
                <div style={{ backgroundColor:WH, borderRadius:16, padding:20,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <LineIcon name={PROVIDER_TYPE_ICON[publicTransportData.type] || 'truck'} size={28} />
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:DK }}>
                        {publicTransportData.name}
                      </div>
                      <div style={{ fontSize:12, color:GR, textTransform:'capitalize' }}>
                        {publicTransportData.type}
                        {publicTransportData.rating > 0 && ` · ${Number(publicTransportData.rating).toFixed(1)}`}
                      </div>
                    </div>
                  </div>
                  {!publicTransportData.isVerified && (
                    <div style={{ fontSize:11, fontWeight:700, color:'#D97706',
                      backgroundColor:'#FEF3C7', padding:'6px 10px', borderRadius:8, marginBottom:10 }}>
                      {t('commerce_profile.transport_pending_verification')}
                    </div>
                  )}
                  {publicTransportData.description && (
                    <div style={{ fontSize:13, color:GR, lineHeight:1.5 }}>
                      {publicTransportData.description}
                    </div>
                  )}
                </div>

                {/* Canonical Stage 3S physical Runs first. ProviderAvailability
                    remains below only as the compatible bookable-slot surface. */}
                {publicTransportData.upcomingRuns?.length > 0 && (
                  <div style={{ backgroundColor:WH, borderRadius:16, padding:16,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:10 }}>
                      Upcoming Runs
                    </div>
                    {publicTransportData.upcomingRuns.map(run => {
                      const stops = run.stops || [];
                      const first = stops[0]?.locationLabel;
                      const last = stops[stops.length - 1]?.locationLabel;
                      return (
                        <div key={run.id}
                          onClick={() => onNavigate('SendShipment', {
                            origin:first, destination:last, routeId:run.routeId, transportRunId:run.id,
                            transportProviderId: publicTransportData.id, transportProviderName: publicTransportData.name, transportProfileId: activeProfile.id,
                          })}
                          style={{ padding:'12px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <LineIcon name={PROVIDER_TYPE_ICON[publicTransportData.type] || 'truck'} size={18} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:800, color:DK }}>
                                {first && last ? `${first} → ${last}` : `Run #${run.id}`}
                              </div>
                              <div style={{ fontSize:11, color:GR, marginTop:2 }}>
                                {new Date(run.scheduledDeparture).toLocaleString('sw-TZ')} · {run.status}
                              </div>
                            </div>
                            <span style={{ fontSize:11, fontWeight:800, color:B }}>Tuma</span>
                          </div>
                          {stops.length > 2 && (
                            <div style={{ fontSize:11, color:GR, marginTop:7, paddingLeft:26 }}>
                              Stops: {stops.map(s => s.locationLabel).join(' → ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

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
                          transportProviderId: publicTransportData.id, transportProviderName: publicTransportData.name, transportProfileId: activeProfile.id,
                        })}
                        style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                        <LineIcon name={PROVIDER_TYPE_ICON[publicTransportData.type] || 'truck'} size={16} />
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
                          transportProviderId: publicTransportData.id, transportProviderName: publicTransportData.name, transportProfileId: activeProfile.id,
                        })}
                        style={{ display:'flex', alignItems:'center', gap:10,
                          padding:'10px 0', borderBottom:'1px solid #F1F5F9', cursor:'pointer' }}>
                        <LineIcon name={PROVIDER_TYPE_ICON[publicTransportData.type] || 'truck'} size={16} />
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
              <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}><LineIcon name={tier.icon} size={44} color="#fff" /></div>
              <div style={{ fontSize:24, fontWeight:800 }}>{tier.name}</div>
              <div style={{ fontSize:36, fontWeight:800, margin:'8px 0' }}>{score}</div>
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
                      <div style={{ fontSize:14, fontWeight:800,
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
              ? <Empty icon="wrench" text={t('commerce_profile.no_services')} />
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
                        {s.category}
                      </span>
                      <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:4 }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize:14, fontWeight:800, color:B }}>
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
            <Empty icon="camera" text={t('commerce_profile.no_portfolio_yet')} />
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
        {tab==='about' && (
          <div style={{ margin:'-16px -16px 12px' }}>
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

          </div>
        )}
        {tab==='about' && (() => {
          const facts = [
            isTransportProfile && publicTransportData?.type &&
              ['Transport type', publicTransportData.type],
            isTransportProfile && publicTransportData?.coverage?.length > 0 &&
              ['Route coverage', publicTransportData.coverage.slice(0,8).join(', ')],
            isTransportProfile && publicTransportData &&
              ['Transport verification', publicTransportData.isVerified ? 'Verified by Kentexa' : 'Pending verification'],
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
                <Empty icon="ℹ" text={t('commerce_profile.no_about_yet')} />
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
              <div style={{ display:'flex', justifyContent:'center', marginBottom:6 }}><LineIcon name={tier.icon} size={34} color="#fff" /></div>
              <div style={{ fontSize:18, fontWeight:800 }}>{tier.name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.85)', marginTop:4 }}>
                {activeProfile.reviewsCount || reviews.length} {t('commerce_profile.tab_reviews')} · {Number(activeProfile.rating||0).toFixed(1)}
              </div>
            </div>
            {reviews.length === 0
              ? <Empty icon="star" text={t('commerce_profile.no_reviews_yet')} />
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
                        {rv.rating ? `${Math.round(rv.rating)} / 5` : ''}
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
    <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}><LineIcon name={icon} size={36} color="#94a3b8" /></div>
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
        const { name: commenterName, photo: commenterPhoto } = commenterIdentity(c);
        return (
        <div key={c.id} style={{ display:'flex', gap:8, marginBottom:10 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
            backgroundColor:B, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, color:WH, fontWeight:800, overflow:'hidden' }}>
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

const FeedPost = ({ f, onNavigate, isLoggedIn, currentUser, activeProfileId, initiallyLiked = false, onDeleted }) => {
  const { t } = useTranslation();
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(initiallyLiked);
  const [likeCount, setLikeCount] = useState(Number(f.saveCount || 0));
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isTagged = !!(f.linkedEntityType && f.linkedEntityId);
  const isOwner = !!currentUser?.id && Number(currentUser.id) === Number(f.businessId);

  const requireLogin = () => {
    if (isLoggedIn) return true;
    onNavigate('PublicLogin');
    return false;
  };

  const handleLike = async () => {
    if (!requireLogin()) return;
    try {
      const res = await api.post(`/feed/${f.id}/engage`, { type: 'save' });
      const next = res.data?.toggled ?? !liked;
      setLiked(next);
      setLikeCount(n => Math.max(0, n + (next ? 1 : -1)));
    } catch {}
  };

  const handleShare = async () => {
    if (!requireLogin() || sharing) return;
    try {
      setSharing(true);
      await api.post(`/feed/${f.id}/engage`, { type: 'share' }).catch(() => {});
      const url = window.location.href;
      if (navigator.share) await navigator.share({ title: f.title, url }).catch(() => {});
      else await navigator.clipboard?.writeText(url);
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!window.confirm('Delete this post?')) return;
    try {
      setDeleting(true);
      await api.delete(`/feed/${f.id}`);
      onDeleted?.(f.id);
    } catch {
      setDeleting(false);
    }
  };

  // Was completely unclickable — tapping the photo/title did nothing except
  // the explicit comment/CTA buttons. Tagged posts (product/service/
  // classified) have a real detail page to land on; a plain untagged
  // announcement has nothing to navigate to, so it correctly stays inert.
  const goToDetail = () => {
    if (!isTagged) return;
    if (f.linkedEntityType === 'product') onNavigate(`ProductDetail-${f.linkedEntityId}`);
    else if (f.linkedEntityType === 'service') onNavigate(`ServiceDetail-${f.linkedEntityId}`);
    else onNavigate(`ClassifiedDetail-${f.linkedEntityId}`);
  };

  return (
    <div style={{ backgroundColor:WH, borderRadius:14, padding:16,
      marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
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
      <div onClick={goToDetail}
        style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:4,
          cursor: isTagged ? 'pointer' : 'default' }}>{f.title}</div>
      {f.body && <div style={{ fontSize:12, color:'#475569', lineHeight:1.5 }}>{f.body}</div>}
      {f.imageUrl && (
        // maxHeight was 200 — aggressively cropped any portrait photo (the
        // common case for a phone-camera product shot) since objectFit:cover
        // forces that height regardless of the image's real aspect ratio.
        // Matches HomeFeed.js's own feed-image treatment (maxHeight:420) so
        // the same photo doesn't get cropped differently in the two places
        // it appears.
        <img src={f.imageUrl} alt="" onClick={goToDetail} style={{ width:'100%', borderRadius:10,
          marginTop:10, maxHeight:420, objectFit:'cover',
          cursor: isTagged ? 'pointer' : 'default' }} />
      )}
      {(likeCount > 0 || (f.commentCount||0) > 0) && (
        <div style={{ fontSize:12, fontWeight:700, color:DK, marginTop:10 }}>
          {likeCount > 0 && t('commerce_profile.liked_count', { count: likeCount.toLocaleString() })}
          {likeCount > 0 && (f.commentCount||0) > 0 && '  ·  '}
          {(f.commentCount||0) > 0 && t('commerce_profile.comment_count', { count: Number(f.commentCount) })}
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8,
        borderTop:'1px solid #F1F5F9', borderBottom:'1px solid #F1F5F9', padding:'6px 0' }}>
        <button onClick={handleLike}
          style={{ flex:1, background:'none', border:'none', cursor:'pointer', padding:'8px 4px',
            color: liked ? '#DC2626' : GR, fontSize:13, fontWeight:800 }}>
          <LineIcon name="heart" size={16} color={liked ? '#dc2626' : 'currentColor'} /> Like
        </button>
        <button onClick={() => setShowComments(s => !s)}
          style={{ flex:1, background:'none', border:'none', cursor:'pointer', padding:'8px 4px',
            color: showComments ? B : GR, fontSize:13, fontWeight:800 }}>
          Comment
        </button>
        <button onClick={handleShare} disabled={sharing}
          style={{ flex:1, background:'none', border:'none', cursor:'pointer', padding:'8px 4px',
            color:GR, fontSize:13, fontWeight:800, opacity:sharing ? 0.6 : 1 }}>
          Share
        </button>
        {isOwner && (
          <button onClick={handleDelete} disabled={deleting}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'8px 8px',
              color:'#DC2626', fontSize:13, fontWeight:800, opacity:deleting ? 0.6 : 1 }}>
            Delete
          </button>
        )}
      </div>
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
