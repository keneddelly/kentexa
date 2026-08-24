/**
 * Search.js — Discover (Discover) + Search everything
 * Place at: src/public/pages/Search.js
 *
 * On load (no query):
 *   - Quick category grid
 *   - Featured classifieds (auto-loaded, no query needed)
 *   - Suggested sellers
 *   - Featured services
 *   - Flash sales banner
 *
 * On search:
 *   - Products tab | Classifieds tab | Services tab | All
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WishlistHeart from '../components/WishlistHeart';
import ReputationBadge from '../components/ReputationBadge';
import { trackSearch } from '../hooks/useAnalytics';
import api           from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const fmt = n => Number(n||0).toLocaleString();

const getCategories = t => [
  { icon:'📱', label:t('search.cat_phones'),      q:'simu'       },
  { icon:'👗', label:t('search.cat_clothes'),     q:'nguo'       },
  { icon:'🏠', label:t('search.cat_house'),       q:'nyumba'     },
  { icon:'🚗', label:t('search.cat_cars'),        q:'gari'       },
  { icon:'🍔', label:t('search.cat_food'),        q:'chakula'    },
  { icon:'🔨', label:t('search.cat_tools'),       q:'vifaa'      },
  { icon:'🛋️', label:t('search.cat_furniture'),  q:'samani'     },
  { icon:'💄', label:t('search.cat_beauty'),      q:'urembo'     },
  { icon:'💊', label:t('search.cat_health'),      q:'dawa'       },
  { icon:'📚', label:t('search.cat_education'),   q:'vitabu'     },
  { icon:'🌾', label:t('search.cat_agriculture'), q:'kilimo'     },
  { icon:'🔧', label:t('search.cat_services'),    q:'fundi'      },
];

const getTabs = t => [
  { key:'all',        label:t('search.tab_all')         },
  { key:'classifieds',label:t('search.tab_classifieds')  },
  { key:'products',   label:t('search.tab_products')    },
  { key:'services',   label:t('search.tab_services')     },
  { key:'transport',  label:t('search.tab_transport')    },
  { key:'hub',        label:t('search.tab_hub')          },
  { key:'people',     label:t('search.tab_people')       },
];

// ── Classified card ───────────────────────────────────────────────────────────
const ClassifiedCard = ({ item, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  return (
    <div onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}
      style={{ backgroundColor:WH, borderRadius:14, overflow:'hidden',
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', position:'relative' }}>
      <div style={{ position:'absolute', top:6, right:6, zIndex:10 }}>
        <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn}
          onNavigate={onNavigate} size={20} />
      </div>
      {item.isFlashSale && (
        <div style={{ position:'absolute', top:6, left:6, zIndex:10,
          backgroundColor:'#DC2626', color:WH, fontSize:10, fontWeight:800,
          padding:'2px 8px', borderRadius:100 }}>🔥 Flash</div>
      )}
      <div style={{ height:120, backgroundColor:'#F8FAFC',
        display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        {item.images?.[0]
          ? <img src={item.images[0]} alt={item.title}
              style={{ width:'100%', height:'100%', objectFit:'cover' }}
              onError={e => e.target.style.display='none'} />
          : <span style={{ fontSize:32 }}>🏷️</span>}
      </div>
      <div style={{ padding:'8px 10px 12px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:DK, marginBottom:3,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {item.title}
        </div>
        <div style={{ fontSize:14, fontWeight:900,
          color: item.isFlashSale ? '#DC2626' : B }}>
          TZS {fmt(item.flashSalePrice || item.price)}
        </div>
        <div style={{ fontSize:10, color:GR, marginTop:2 }}>
          📍 {item.location || t('search.location_fallback')}
        </div>
      </div>
    </div>
  );
};

// ── Service card ──────────────────────────────────────────────────────────────
const ServiceCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <div onClick={() => onNavigate(`ServiceDetail-${item.id}`)}
      style={{ backgroundColor:WH, borderRadius:14, padding:14,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer' }}>
      <div style={{ fontSize:10, fontWeight:700, backgroundColor:'#F0FDF4',
        color:'#16A34A', padding:'3px 8px', borderRadius:100,
        display:'inline-block', marginBottom:8 }}>🔧 {item.category}</div>
      <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:4,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {item.title}
      </div>
      <div style={{ fontSize:13, fontWeight:900, color:B }}>
        {item.priceType==='negotiate' ? t('search.negotiate_price')
         : item.priceType==='free_quote' ? t('search.request_quote')
         : `TZS ${fmt(item.price)}`}
      </div>
      {item.provider && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
          <div style={{ width:18, height:18, borderRadius:'50%', backgroundColor:'#F1F5F9',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>
            {(item.provider.name||'P').charAt(0)}
          </div>
          <span style={{ fontSize:10, color:GR }}>{item.provider.name}</span>
          {(item.provider.reputationScore||0) > 0 && (
            <ReputationBadge score={item.provider.reputationScore} size="xs" />
          )}
        </div>
      )}
    </div>
  );
};

// ── Transport provider card ─────────────────────────────────────────────────
const TRANSPORT_ICONS = {
  bus:'🚌', courier:'📦', van:'🚐', truck:'🚚', boda:'🏍️', rail:'🚆', air:'✈️', boat:'🛥️',
};
const TransportCard = ({ item, isLoggedIn, onNavigate }) => {
  const { t } = useTranslation();
  const contactHref = item.whatsappPhone
    ? `https://wa.me/${item.whatsappPhone.replace(/[^0-9]/g,'')}`
    : item.contactPhone ? `tel:${item.contactPhone}` : null;
  // Previously the only action on this whole card was the WhatsApp/call
  // button — there was no way to actually see the provider's routes or
  // details, only to message them cold. Now the card itself opens their
  // real public profile; the contact button stays as a secondary,
  // in-card action (stopPropagation so tapping it doesn't also navigate).
  return (
    <div onClick={() => item.userId && onNavigate(`CommerceProfile-${item.userId}-transport`)}
      style={{ backgroundColor:WH, borderRadius:14, padding:14,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor: item.userId ? 'pointer' : 'default' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{ width:34, height:34, borderRadius:10, backgroundColor:'#EFF6FF',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
          overflow:'hidden', flexShrink:0 }}>
          {item.logoUrl
            ? <img src={item.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
                onError={e => e.target.style.display='none'} />
            : (TRANSPORT_ICONS[item.type] || '🚚')}
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:DK,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.name}
          </div>
          <div style={{ fontSize:10, color:GR, textTransform:'capitalize' }}>
            {item.type}{item.rating > 0 ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}
          </div>
        </div>
      </div>
      {contactHref ? (
        <a href={contactHref} target="_blank" rel="noopener noreferrer"
          onClick={e => { e.stopPropagation(); if (!isLoggedIn) { e.preventDefault(); onNavigate('PublicLogin'); } }}
          style={{ display:'block', textAlign:'center', padding:'7px 0', borderRadius:8,
            backgroundColor:B, color:WH, fontSize:11, fontWeight:800, textDecoration:'none' }}>
          {t('search.transport_contact_button')}
        </a>
      ) : (
        <div style={{ fontSize:10, color:GR, textAlign:'center' }}>
          {t('search.transport_no_contact')}
        </div>
      )}
    </div>
  );
};

// ── Super Agent hub card ─────────────────────────────────────────────────────
const HubCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <div onClick={() => item.userId && onNavigate(`CommerceProfile-${item.userId}-hub`)}
      style={{ backgroundColor:WH, borderRadius:14, padding:14,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor: item.userId ? 'pointer' : 'default' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <div style={{ width:34, height:34, borderRadius:10, backgroundColor:'#EFF6FF',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
          🏢
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:DK,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {item.businessName}
          </div>
          <div style={{ fontSize:10, color:GR }}>
            {item.city}{item.rating > 0 ? ` · ⭐ ${item.rating.toFixed(1)}` : ''}
          </div>
        </div>
      </div>
      {item.address && (
        <div style={{ fontSize:10, color:GR, overflow:'hidden', textOverflow:'ellipsis',
          whiteSpace:'nowrap', marginBottom:8 }}>
          📍 {item.address}
        </div>
      )}
      <div style={{ textAlign:'center', padding:'7px 0', borderRadius:8,
        backgroundColor:'#EFF6FF', color:B, fontSize:11, fontWeight:800 }}>
        {t('search.hub_view_button')}
      </div>
    </div>
  );
};

// ── Profile card (people/business search results) ──────────────────────────
// Distinct from SellerCard below (which reads the legacy `/seller/public/all`
// shape for the featured-sellers strip) — this reads an actual CommerceProfile
// row from GET /profiles/search, so it works for ANY profile type a name
// search can match, not just sellers.
const PROFILE_TYPE_ICON = {
  personal: '👤', business: '🏪', hub: '🏢',
  transport_provider: '🚌', agent: '🏍️', service_provider: '🔧',
};
const ProfileResultCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <div onClick={() => onNavigate(`CommerceProfile-${item.ownerId}`, { commerceProfileId: item.id })}
      style={{ backgroundColor:WH, borderRadius:14, padding:14,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
      <div style={{ width:52, height:52, borderRadius:16, overflow:'hidden',
        backgroundColor:'#F1F5F9', display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:22, marginBottom:8 }}>
        {item.photoUrl
          ? <img src={item.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : (PROFILE_TYPE_ICON[item.type] || '👤')}
      </div>
      <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:2,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>
        {item.displayName}{item.isVerified ? ' ✅' : ''}
      </div>
      <div style={{ fontSize:10, color:GR, textTransform:'capitalize', marginBottom:6 }}>
        {(item.type||'').replace(/_/g,' ')}
      </div>
      <div style={{ fontSize:10, color:GR }}>
        {fmt(item.followersCount||0)} {t('commerce_profile.stat_followers')}
        {Number(item.rating||0) > 0 ? ` · ⭐ ${Number(item.rating).toFixed(1)}` : ''}
      </div>
    </div>
  );
};

// ── Seller card ───────────────────────────────────────────────────────────────
const SellerCard = ({ seller, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [following, setFollowing] = useState(!!seller.isFollowing);
  const id = seller.userId || seller.id;

  useEffect(() => { setFollowing(!!seller.isFollowing); }, [seller.isFollowing]);

  const handleFollow = async e => {
    e.stopPropagation();
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const r = await api.post(`/stores/${id}/follow`);
      setFollowing(r.data.following ?? !following);
    } catch {}
  };

  return (
    <div onClick={() => onNavigate(`CommerceProfile-${id}`,
      seller.commerceProfileId ? { commerceProfileId: seller.commerceProfileId } : undefined)}
      style={{ backgroundColor:WH, borderRadius:14, overflow:'hidden',
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer', flexShrink:0, width:160 }}>
      <div style={{ height:60, overflow:'hidden',
        background: seller.coverImage
          ? `url(${seller.coverImage}) center/cover`
          : 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' }} />
      <div style={{ padding:'0 12px 14px', marginTop:-20 }}>
        <div style={{ width:36, height:36, borderRadius:10, border:'3px solid #fff',
          overflow:'hidden', backgroundColor:B, display:'flex',
          alignItems:'center', justifyContent:'center',
          fontSize:16, color:WH, fontWeight:900, marginBottom:6 }}>
          {seller.logo
            ? <img src={seller.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
                onError={e => e.target.style.display='none'} />
            : (seller.storeName||seller.name||'?').charAt(0).toUpperCase()}
        </div>
        <div style={{ fontSize:12, fontWeight:800, color:DK, marginBottom:2,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {seller.storeName || seller.name}
        </div>
        <div style={{ fontSize:10, color:GR, marginBottom:8 }}>
          📍 {seller.businessLocation || t('search.location_fallback')}
        </div>
        <button onClick={handleFollow}
          style={{ width:'100%', padding:'6px 0', border:'none',
            borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:800,
            backgroundColor: following ? '#F1F5F9' : B,
            color: following ? GR : WH }}>
          {following ? t('search.unfollow_button') : t('search.follow_button')}
        </button>
      </div>
    </div>
  );
};

// ── Section ───────────────────────────────────────────────────────────────────
const Section = ({ title, sub, action, onAction, children, hscroll }) => (
  <div style={{ marginBottom:4, backgroundColor:WH,
    borderTop:'1px solid #F1F5F9', paddingBottom:12 }}>
    <div style={{ display:'flex', justifyContent:'space-between',
      alignItems:'center', padding:'14px 16px 10px' }}>
      <div>
        <div style={{ fontSize:14, fontWeight:900, color:DK }}>{title}</div>
        {sub && <div style={{ fontSize:11, color:GR, marginTop:1 }}>{sub}</div>}
      </div>
      {action && (
        <button onClick={onAction}
          style={{ background:'none', border:'none', cursor:'pointer',
            color:B, fontSize:12, fontWeight:700 }}>{action} →</button>
      )}
    </div>
    {hscroll ? (
      <div style={{ display:'flex', gap:12, overflowX:'auto',
        padding:'0 16px 4px', scrollbarWidth:'none' }}>
        {children}
      </div>
    ) : (
      <div style={{ padding:'0 14px' }}>{children}</div>
    )}
  </div>
);

// ── Deterministic relevance ranking ─────────────────────────────────────────
// Combines the DB's own keyword-match ordering, the semantic-search cosine
// score (when a result came from /search/semantic), how close the item's
// price sits to the AI-extracted min/max, whether its location matches the
// AI-extracted location, and existing seller-quality fields already present
// on every card (reputationScore/isVerified) — one explainable weighted sum,
// no second AI call. Replaces "keyword list, then append semantic leftovers
// at the end" with a real merged ranking.
const scoreResultItem = (item, index, listLength, intent, isSemanticOnly) => {
  const keywordScore = isSemanticOnly ? 0 : 1 - index / Math.max(listLength, 1);
  const semanticScore = item._score || 0;

  let priceScore = 0;
  const price = item.price ?? item.displayPrice ?? item.basePrice ?? null;
  if (price != null && (intent?.minPrice != null || intent?.maxPrice != null)) {
    const min = intent?.minPrice ?? 0;
    const max = intent?.maxPrice ?? Infinity;
    if (price >= min && price <= max) priceScore = 1;
    else {
      const bound = price < min ? min : max;
      const diff = Math.abs(price - bound);
      priceScore = Math.max(0, 1 - diff / (bound || 1));
    }
  }

  let locationScore = 0;
  if (intent?.location) {
    const loc = intent.location.toLowerCase();
    const itemLoc = (
      item.location || item.sellerCity || item.coverageCity ||
      item.seller?.businessLocation || item.provider?.businessLocation ||
      item.business?.businessLocation || ''
    ).toLowerCase();
    if (itemLoc && itemLoc.includes(loc)) locationScore = 1;
  }

  const seller = item.seller || item.provider || item.business || {};
  const repScore = Math.min(1, (seller.reputationScore || 0) / 1000);
  const verifiedScore = seller.isVerified ? 1 : 0;

  return (
    keywordScore  * 0.30 +
    semanticScore * 0.25 +
    priceScore    * 0.20 +
    locationScore * 0.15 +
    repScore      * 0.06 +
    verifiedScore * 0.04
  );
};

const rankResults = (list, semanticExtras, intent) => {
  const scored = [
    ...list.map((item, i) => ({ item, score: scoreResultItem(item, i, list.length, intent, false) })),
    ...semanticExtras.map((item, i) => ({ item, score: scoreResultItem(item, i, semanticExtras.length, intent, true) })),
  ];
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.item);
};

// ── Main ──────────────────────────────────────────────────────────────────────
const AI_DOMAIN_TO_TAB = { product: 'products', classified: 'classifieds', service: 'services', transport: 'transport', hub: 'hub', people: 'people', all: 'all' };

const Search = ({ onNavigate, isLoggedIn, onLogout, userRole, initialQuery, aiIntent, track }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const TABS = getTabs(t);
  const [query,     setQuery]     = useState(initialQuery || '');
  const [tab,       setTab]       = useState('all');
  const [searched,  setSearched]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  // Search results
  const [classifieds, setClassifieds] = useState([]);
  const [products,    setProducts]    = useState([]);
  const [services,    setServices]    = useState([]);
  const [transports,  setTransports]  = useState([]);
  const [hubs,        setHubs]        = useState([]);
  const [profiles,    setProfiles]    = useState([]);
  const [transportNeedsCities, setTransportNeedsCities] = useState(false);
  const [hubNeedsCity, setHubNeedsCity] = useState(false);

  // AI's conversational summary of the results actually found (not the
  // routing step above — see search.controller.ts's /search/explain).
  // Fetched after results are already showing; never blocks rendering them.
  const [aiSummary,      setAiSummary]      = useState(null);
  const [aiSuggestions,  setAiSuggestions]  = useState([]);
  const [aiExplaining,   setAiExplaining]   = useState(false);

  // Featured / discover content (auto-loaded)
  const [featured,    setFeatured]    = useState([]);    // recent classifieds
  const [sellers,     setSellers]     = useState([]);    // top sellers
  const [featSvc,     setFeatSvc]     = useState([]);    // featured services
  const [loadingFeat, setLoadingFeat] = useState(true);

  const inputRef = useRef(null);

  // ── Load featured content on mount (no query needed) ──────────────────────
  useEffect(() => {
    setLoadingFeat(true);
    Promise.allSettled([
      api.get('/classifieds/search?limit=8&sort=newest'),
      api.get('/seller/public/all'),
      api.get('/services?limit=6'),
    ]).then(([c, s, sv]) => {
      if (c.status  === 'fulfilled') setFeatured(c.value.data?.classifieds || c.value.data || []);
      if (s.status  === 'fulfilled') setSellers((s.value.data?.sellers || s.value.data || []).slice(0,8));
      if (sv.status === 'fulfilled') setFeatSvc(sv.value.data?.ads || sv.value.data || []);
    }).catch(() => {})
      .finally(() => setLoadingFeat(false));
  }, []);

  // ── Auto-search if initialQuery provided ─────────────────────────────────
  // aiIntent (from the homepage AI front door) skips the blind 3x-parallel
  // search below and fetches only the classified domain, pre-filtered.
  useEffect(() => {
    if (initialQuery) {
      if (aiIntent) handleAiSearch(initialQuery, aiIntent);
      else handleSearch(initialQuery);
    }
    inputRef.current?.focus();
  }, [initialQuery]); // eslint-disable-line

  // ── AI-routed search — one domain (or all, filtered) instead of three
  // blind unfiltered calls, PLUS an unconditional people/profile lookup so
  // a name match is never dropped just because the AI guessed the wrong
  // domain. `intent` comes from GET /search/intent, reached either via
  // handleSearch below (every query typed on this page) or the homepage's
  // AiSearchBar handoff (see the mount effect further down). ─────────────
  const handleAiSearch = useCallback(async (q, intent) => {
    const trimmed = (intent?.keywords || q || query).trim();
    const rawQ    = (q || query).trim();
    // Only transport/people are genuinely domain-exclusive fetches (see the
    // dedicated branches below — they never join the classifieds/products/
    // services fan-out, so "all" would show nothing for them). For every
    // other guessed domain, classifieds/products/services are ALWAYS
    // searched together regardless of what the AI guessed (see the comment
    // further down) — auto-switching to that one guessed tab was hiding
    // real matches: e.g. the AI guesses "product" for a query whose only
    // real match is a classified ad, so the classified never renders on
    // the auto-selected Products/Store tab and looks like it "vanished"
    // unless the user manually clicks back to All.
    const tabForDomain =
      intent?.domain === 'transport' || intent?.domain === 'people' || intent?.domain === 'hub'
        ? AI_DOMAIN_TO_TAB[intent.domain]
        : 'all';
    setLoading(true);
    setSearched(true);
    setTab(tabForDomain);
    setClassifieds([]);
    setProducts([]);
    setServices([]);
    setTransports([]);
    setHubs([]);
    setProfiles([]);
    setTransportNeedsCities(false);
    setHubNeedsCity(false);

    // People/business name match — uses the raw query, not the AI-extracted
    // keywords (that extraction is tuned for listing search, not names).
    // Runs alongside the meaning-based semantic search (GET /search/semantic)
    // — catches matches keyword search structurally cannot, e.g. a query in
    // one language against content in another, or a match that only exists
    // in a business's bio rather than a listing's own title. Both are
    // additive: they never replace or gate what keyword search already
    // finds, only add what it would otherwise miss.
    const [profileResults, semanticResults] = rawQ
      ? await Promise.all([
          api.get('/profiles/search', { params: { q: rawQ } }).then(r => r.data || []).catch(() => []),
          api.get('/search/semantic', { params: { q: rawQ } }).then(r => r.data || []).catch(() => []),
        ])
      : [[], []];
    const semanticByType = {
      product:    semanticResults.filter(r => r._type === 'product'),
      classified: semanticResults.filter(r => r._type === 'classified'),
      service:    semanticResults.filter(r => r._type === 'service'),
      profile:    semanticResults.filter(r => r._type === 'profile'),
    };
    const mergedProfiles = [
      ...profileResults,
      ...semanticByType.profile.filter(sp => !profileResults.some(p => p.id === sp.id)),
    ];
    setProfiles(mergedProfiles);

    // finish() closes out every branch below: merges in semantic-only
    // extras for whatever this branch found, logs to search history, then
    // fires the AI "explain what was found" call. Fire-and-forget: never
    // blocks the results themselves from rendering, and if it fails/times
    // out the summary banner simply never appears (search.controller.ts's
    // /explain fails open the same way /intent already does).
    const finish = (otherResultCount, opts = {}) => {
      const {
        topItems = [], domainCounts = {}, skipExplain = false,
        classifiedsList = [], productsList = [], servicesList = [],
      } = opts;

      const mergeSemantic = (list, type) => {
        const extras = semanticByType[type].filter(s => !list.some(x => x.id === s.id));
        return rankResults(list, extras, intent);
      };
      const finalClassifieds = mergeSemantic(classifiedsList, 'classified');
      const finalProducts    = mergeSemantic(productsList, 'product');
      const finalServices    = mergeSemantic(servicesList, 'service');
      setClassifieds(finalClassifieds);
      setProducts(finalProducts);
      setServices(finalServices);
      const semanticExtra =
        (finalClassifieds.length - classifiedsList.length) +
        (finalProducts.length - productsList.length) +
        (finalServices.length - servicesList.length) +
        (mergedProfiles.length - profileResults.length);

      setLoading(false);
      if (typeof track === 'function') {
        trackSearch(track, rawQ, otherResultCount + mergedProfiles.length + semanticExtra, {
          domain: intent?.domain ?? null,
          profileMatches: mergedProfiles.length,
          semanticMatches: semanticResults.length,
        });
      }
      setAiSummary(null);
      setAiSuggestions([]);
      if (skipExplain || !rawQ) return;
      const allTopItems = [
        ...topItems,
        ...mergedProfiles.slice(0, 2).map(p => ({
          type: 'profile', name: p.displayName,
          subtitle: (p.type || '').replace(/_/g, ' '),
        })),
      ].slice(0, 6);
      setAiExplaining(true);
      api.post('/search/explain', {
        q: rawQ,
        resultSummary: {
          domain: intent?.domain ?? 'all',
          counts: { ...domainCounts, people: mergedProfiles.length },
          topItems: allTopItems,
        },
      }).then(r => {
        setAiSummary(r.data?.summary || null);
        setAiSuggestions(r.data?.suggestions || []);
      }).catch(() => {}).finally(() => setAiExplaining(false));
    };

    // Transport is structured (from/to city), not a free-text match, so it
    // never joins the "all" fan-out below — it only fires when the AI is
    // confident enough to classify the query as transport specifically.
    if (tabForDomain === 'transport') {
      if (!intent?.fromCity || !intent?.toCity) {
        setTransportNeedsCities(true);
        finish(0, { skipExplain: true });
        return;
      }
      try {
        const res = await api.get('/transport/search-public', {
          params: { from: intent.fromCity, to: intent.toCity },
        });
        const transportList = res.data || [];
        setTransports(transportList);
        finish(transportList.length, {
          domainCounts: { transport: transportList.length },
          topItems: transportList.slice(0, 3).map(tItem => ({
            type: 'transport', name: tItem.name, subtitle: tItem.type,
          })),
        });
      } catch { finish(0, { skipExplain: true }); }
      return;
    }

    // Hub (Super Agent lookup) is the same shape as transport — a single
    // structured fetch by city, never joining the classifieds/products/
    // services fan-out below.
    if (tabForDomain === 'hub') {
      if (!intent?.location) {
        setHubNeedsCity(true);
        finish(0, { skipExplain: true });
        return;
      }
      try {
        const res = await api.get(`/super-agents/hubs/${encodeURIComponent(intent.location)}`);
        const hubList = res.data || [];
        setHubs(hubList);
        finish(hubList.length, {
          domainCounts: { hub: hubList.length },
          topItems: hubList.slice(0, 3).map(h => ({
            type: 'hub', name: h.businessName, subtitle: h.city,
          })),
        });
      } catch { finish(0, { skipExplain: true }); }
      return;
    }

    // People is likewise a dedicated single-source domain — the fetch
    // above already covers it, nothing further to fan out to.
    if (tabForDomain === 'people') { finish(0); return; }

    if (!trimmed) { finish(0, { skipExplain: true }); return; }

    // The AI's classified domain picks the DEFAULT tab (already set above
    // via setTab), never which domains get searched — always fan out to
    // all three. A hard per-domain filter here meant that the moment the
    // AI confidently classified a query (e.g. "camera" -> product), the
    // classifieds/services tabs got skipped entirely and showed nothing
    // even when real matches existed there, while people/semantic search
    // (which always run unconditionally, above) kept returning results —
    // exactly the "only profile comes back" regression this fixes.
    const domains = ['classifieds', 'products', 'services'];
    // intent.category/minPrice/maxPrice only ever apply to products/
    // classifieds, which share one category taxonomy — services uses a
    // completely different one (ServiceCategory), so forwarding e.g.
    // "electronics" into the services browse call would silently zero out
    // every service result via a category mismatch that never surfaces as
    // an error.
    const listingParams = new URLSearchParams({ q: trimmed, limit: '20' });
    if (intent?.category) listingParams.set('category', intent.category);
    if (intent?.minPrice != null) listingParams.set('minPrice', String(intent.minPrice));
    if (intent?.maxPrice != null) listingParams.set('maxPrice', String(intent.maxPrice));
    // Generic location (distinct from transport's fromCity/toCity) — a
    // place mentioned in a product/classified/service query, e.g. "kinasa
    // sauti Mwanza" or "spy camera Keko". classifieds/search already
    // supported this param server-side; products/search gained it
    // alongside this change; services' browse endpoint uses `city`.
    if (intent?.location) listingParams.set('location', intent.location);
    const serviceParams = new URLSearchParams({ q: trimmed, limit: '20' });
    if (intent?.location) serviceParams.set('city', intent.location);

    let count = 0;
    const domainCounts = {};
    const topItems = [];
    const lists = { classifieds: [], products: [], services: [] };
    try {
      const results = await Promise.allSettled(
        domains.map((d) => {
          if (d === 'classifieds') return api.get(`/classifieds/search?${listingParams}`);
          if (d === 'products') return api.get(`/products/search?${listingParams}`);
          return api.get(`/services?${serviceParams}`); // filterable browse endpoint — supports q, not the product/classified category taxonomy
        }),
      );
      domains.forEach((d, i) => {
        const res = results[i];
        if (res.status !== 'fulfilled') return;
        let list = [];
        if (d === 'classifieds') list = res.value.data?.classifieds || res.value.data || [];
        else if (d === 'products') list = res.value.data?.products || res.value.data || [];
        else list = res.value.data?.ads || res.value.data || [];
        lists[d] = list;
        count += list.length;
        domainCounts[d] = list.length;
        topItems.push(...list.slice(0, 2).map(item => ({
          type: d === 'classifieds' ? 'classified' : d === 'products' ? 'product' : 'service',
          name: item.title || item.name,
          subtitle: item.category || null,
          // Product has no plain `price` field — it's displayPrice/basePrice
          // (classifieds/services do use `price` directly). Reading
          // item.price for a product was always undefined, so the AI's own
          // summary of results silently dropped/misstated product prices.
          price: d === 'products' ? (item.displayPrice ?? item.basePrice ?? null) : (item.price ?? null),
          rating: item.rating ?? null,
        })));
      });
    } catch {}
    finish(count, {
      domainCounts, topItems: topItems.slice(0, 4),
      classifiedsList: lists.classifieds, productsList: lists.products, servicesList: lists.services,
    });
  }, [query, track]);

  // Every search on this page goes through the AI query-understanding step
  // first — previously only the FIRST query (handed off from the homepage's
  // AiSearchBar via the `aiIntent` prop) got AI treatment; retyping a query
  // directly on this page silently fell back to plain keyword search. If
  // /search/intent itself is unreachable, the synthesized "all" intent below
  // reduces to that same plain behavior, so search never goes fully dark.
  const handleSearch = useCallback(async (q) => {
    const trimmed = (q || query).trim();
    if (!trimmed) return;
    let intent = { domain: 'all', keywords: trimmed, category: null, minPrice: null, maxPrice: null, fromCity: null, toCity: null };
    try {
      const res = await api.get('/search/intent', { params: { q: trimmed } });
      if (res?.data) intent = res.data;
    } catch {}
    await handleAiSearch(trimmed, intent);
  }, [query, handleAiSearch]);

  const total = classifieds.length + products.length + services.length + transports.length + hubs.length + profiles.length;

  // Every item is tagged with _type so the render loop below picks the
  // right card regardless of whether it came via a single-domain tab or
  // the merged "all" list (previously only "all" items were tagged, which
  // meant viewing the Products/Services tab directly rendered them as
  // classified cards — fixed here since the AI front door routes straight
  // into a single-domain tab).
  const tabItems = {
    all:        [...classifieds.map(c => ({...c, _type:'classified'})),
                 ...products.map(p => ({...p, _type:'product'})),
                 ...services.map(s => ({...s, _type:'service'})),
                 ...profiles.map(p => ({...p, _type:'profile'}))],
    classifieds: classifieds.map(c => ({...c, _type:'classified'})),
    products:    products.map(p => ({...p, _type:'product'})),
    services:    services.map(s => ({...s, _type:'service'})),
    transport:   transports.map(tr => ({...tr, _type:'transport'})),
    hub:         hubs.map(h => ({...h, _type:'hub'})),
    people:      profiles.map(p => ({...p, _type:'profile'})),
  };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#FAFAFA',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif' }}>

      {/* ── Search bar (sticky) ── */}
      <div style={{ position:'sticky', top:0, zIndex:200, backgroundColor:WH,
        borderBottom:'1px solid #F1F5F9',
        boxShadow:'0 2px 8px rgba(0,0,0,0.04)', padding:'12px 14px' }}>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:8,
            backgroundColor:'#F1F5F9', borderRadius:12, padding:'10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={GR} strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(query)}
              placeholder={t('search.search_placeholder')}
              style={{ flex:1, border:'none', background:'none', outline:'none',
                fontSize:14, color:DK, fontFamily:'inherit' }} />
            {query && (
              <button onClick={() => { setQuery(''); setSearched(false); }}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color:GR, fontSize:18, padding:0 }}>×</button>
            )}
          </div>
          <button onClick={() => handleSearch(query)}
            style={{ backgroundColor:B, color:WH, border:'none',
              borderRadius:12, padding:'10px 16px', cursor:'pointer',
              fontSize:13, fontWeight:700 }}>
            {t('search.search_button')}
          </button>
        </div>
      </div>

      <div style={{ flex:1, paddingBottom:80 }}>

        {/* ── SEARCH RESULTS ── */}
        {searched && (
          <>
            {/* Tabs */}
            <div style={{ backgroundColor:WH, display:'flex',
              borderBottom:'1px solid #F1F5F9', overflowX:'auto',
              scrollbarWidth:'none', padding:'0 8px' }}>
              {TABS.map(tabItem => (
                <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
                  style={{ padding:'10px 14px', border:'none', background:'none',
                    cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                    color: tab===tabItem.key ? B : GR,
                    borderBottom:`2px solid ${tab===tabItem.key ? B : 'transparent'}` }}>
                  {tabItem.label}
                  {tabItem.key !== 'all' && tabItems[tabItem.key]?.length > 0 && (
                    <span style={{ marginLeft:4, fontSize:10, color:GR }}>
                      ({tabItems[tabItem.key].length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding:'14px' }}>
              {/* AI summary — the conversational layer on top of the result
                  grid below: a short explanation of what was actually found,
                  plus tappable follow-up suggestions. Appears once ready
                  (or a brief "thinking" state) without blocking the results
                  themselves, which render as soon as they're back. */}
              {(aiExplaining || aiSummary) && (
                <div style={{ display:'flex', gap:10, backgroundColor:'#F5F3FF',
                  border:'1px solid #DDD6FE', borderRadius:14, padding:'12px 14px',
                  marginBottom:14 }}>
                  <span style={{ fontSize:18, flexShrink:0, lineHeight:1 }}>✨</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    {!aiSummary ? (
                      <div style={{ fontSize:12, color:GR, fontStyle:'italic' }}>
                        {t('search.ai_thinking')}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:13, color:DK, fontWeight:600, lineHeight:1.5 }}>
                          {aiSummary}
                        </div>
                        {aiSuggestions.length > 0 && (
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                            {aiSuggestions.map(s => (
                              <button key={s}
                                onClick={() => { setQuery(s); handleSearch(s); }}
                                style={{ fontSize:11, fontWeight:700, color:'#7C3AED',
                                  backgroundColor:WH, border:'1px solid #DDD6FE',
                                  borderRadius:100, padding:'5px 10px', cursor:'pointer' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {loading ? (
                <div style={{ textAlign:'center', padding:'60px 0', color:GR }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                  <div style={{ fontSize:13 }}>{t('search.searching', { query })}</div>
                </div>
              ) : transportNeedsCities ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🚚</div>
                  <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                    {t('search.transport_needs_cities_title')}
                  </div>
                  <div style={{ fontSize:13, color:GR }}>
                    {t('search.transport_needs_cities_desc')}
                  </div>
                </div>
              ) : hubNeedsCity ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🏢</div>
                  <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                    {t('search.hub_needs_city_title')}
                  </div>
                  <div style={{ fontSize:13, color:GR }}>
                    {t('search.hub_needs_city_desc')}
                  </div>
                </div>
              ) : total === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
                  <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                    {t('search.no_results_title', { query })}
                  </div>
                  <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                    {t('search.no_results_desc')}
                  </div>
                  <button onClick={() => { setSearched(false); setQuery(''); }}
                    style={{ backgroundColor:B, color:WH, border:'none',
                      borderRadius:12, padding:'11px 24px', cursor:'pointer',
                      fontSize:13, fontWeight:700 }}>
                    {t('search.back_discover_button')}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:12, color:GR, marginBottom:12, fontWeight:600 }}>
                    {t('search.results_count', { count: total, query })}
                  </div>
                  <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
                    {(tab === 'all' ? tabItems.all : tabItems[tab]).map((item, i) => {
                      if (item._type === 'service') {
                        return <ServiceCard key={`s-${item.id}`} item={item} onNavigate={onNavigate} />;
                      }
                      if (item._type === 'transport') {
                        return (
                          <TransportCard key={`t-${item.id}`} item={item}
                            isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
                        );
                      }
                      if (item._type === 'hub') {
                        return <HubCard key={`h-${item.id}`} item={item} onNavigate={onNavigate} />;
                      }
                      if (item._type === 'profile') {
                        return <ProfileResultCard key={`pr-${item.id}`} item={item} onNavigate={onNavigate} />;
                      }
                      if (item._type === 'product') {
                        return (
                          <div key={`p-${item.id}`}
                            onClick={() => onNavigate(`ProductDetail-${item.id}`)}
                            style={{ backgroundColor:WH, borderRadius:14, overflow:'hidden',
                              boxShadow:'0 2px 8px rgba(0,0,0,0.06)', cursor:'pointer' }}>
                            <div style={{ height:120, backgroundColor:'#F8FAFC',
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {item.images?.[0]
                                ? <img src={item.images[0]} alt={item.name}
                                    style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : <span style={{ fontSize:32 }}>🛍️</span>}
                            </div>
                            <div style={{ padding:'8px 10px 12px' }}>
                              <div style={{ fontSize:12, fontWeight:700, color:DK, marginBottom:3,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize:14, fontWeight:900, color:B }}>
                                {/* Product has no plain `price` field — it's
                                    displayPrice/basePrice, unlike classifieds/
                                    services which do use `price` directly.
                                    Reading item.price here always rendered 0. */}
                                TZS {fmt(item.displayPrice ?? item.basePrice)}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <ClassifiedCard key={`c-${item.id}`} item={item}
                          onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ── DISCOVER (no search yet) ── */}
        {!searched && (
          <>
            {/* Quick categories */}
            <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
              padding:'14px 16px 16px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                {t('search.search_by_type')}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {CATEGORIES.map(c => (
                  <button key={c.q} onClick={() => { setQuery(c.label); handleSearch(c.label); }}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center',
                      gap:4, padding:'12px 4px', backgroundColor:'#F8FAFC',
                      border:'1px solid #F1F5F9', borderRadius:12, cursor:'pointer' }}>
                    <span style={{ fontSize:22 }}>{c.icon}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:DK }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Send Something — any authenticated user, not gated behind
                seller/business/transport-provider role. Kentexa's own
                transport network, not just a shortcut to someone else's
                store. */}
            <div onClick={() => onNavigate(isLoggedIn ? 'SendShipment' : 'PublicLogin')}
              style={{ margin:'8px 14px', background:'linear-gradient(135deg,#EA580C,#7C2D12)',
                borderRadius:14, padding:'14px 18px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                color:WH }}>
              <div>
                <div style={{ fontSize:14, fontWeight:900 }}>🚚 {t('search.send_shipment_title')}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.85)' }}>
                  {t('search.send_shipment_sub')}
                </div>
              </div>
              <span style={{ fontSize:20 }}>→</span>
            </div>

            {/* Flash Sales banner */}
            <div onClick={() => onNavigate('FlashSales')}
              style={{ margin:'8px 14px', background:'linear-gradient(135deg,#DC2626,#EA580C)',
                borderRadius:14, padding:'14px 18px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                color:WH }}>
              <div>
                <div style={{ fontSize:14, fontWeight:900 }}>{t('search.flash_sales_title')}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>
                  {t('search.flash_sales_sub')}
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={WH} strokeWidth="2.5">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </div>

            {/* Featured classifieds */}
            {loadingFeat ? (
              <div style={{ backgroundColor:WH, borderTop:'1px solid #F1F5F9',
                padding:'20px 16px', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:12 }}>
                  {t('search.new_products_title')}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ height:200, backgroundColor:'#F8FAFC',
                      borderRadius:14, animation:'pulse 1.5s infinite' }} />
                  ))}
                </div>
              </div>
            ) : featured.length > 0 ? (
              <Section title={t('search.new_products_title')}
                sub={t('search.new_products_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('Classifieds')}>
                <div style={{ display:'grid',
                  gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
                  {featured.slice(0,6).map(c => (
                    <ClassifiedCard key={c.id} item={c}
                      onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Suggested sellers */}
            {sellers.length > 0 && (
              <Section title={t('search.businesses_title')}
                sub={t('search.businesses_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('Stores')}
                hscroll>
                {sellers.map(s => (
                  <SellerCard key={s.id||s.userId} seller={s}
                    onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                ))}
              </Section>
            )}

            {/* Featured services */}
            {featSvc.length > 0 && (
              <Section title={t('search.services_title')}
                sub={t('search.services_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('Services')}>
                <div style={{ display:'grid',
                  gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
                  {featSvc.slice(0,4).map(s => (
                    <ServiceCard key={s.id} item={s} onNavigate={onNavigate} />
                  ))}
                </div>
              </Section>
            )}

            {/* Empty state if all failed */}
            {!loadingFeat && featured.length === 0 && sellers.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 24px' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
                <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                  {t('search.discover_empty_title')}
                </div>
                <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                  {t('search.discover_empty_desc')}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        ::-webkit-scrollbar { display:none }
      `}</style>
    </div>
  );
};

export default Search;