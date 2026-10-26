/**
 * Search.js — Soko: discover (no query) + search everything.
 *
 * Owner 2026-10-26: the marketplace must look professional (Twitter-style, no
 * emoji, no emoji loading spinner) and every product leads back to the business
 * behind it, so each card shows its seller.
 *
 * On load (no query): category chips, businesses to follow, new listings, services.
 * On search: All | Listings | Shops | Services | Moments | Transport | Offices | People | Authorized.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReputationBadge from '../components/ReputationBadge';
import { Spinner, SkeletonGrid } from '../components/Loading';
import { B, DK, GR, WH, LINE, fmt, Icon, I, Star, Verified, Avatar, Photo, sellerOf, cardBtn, titleStyle, tile, ClassifiedCard, ProductCard } from '../components/ListingCard';
import { trackSearch } from '../hooks/useAnalytics';
import { isAppleMobile } from '../utils/isAppleMobile';
import api           from '../../api/api';
import { listingUrl, listingWhatsAppHref } from '../utils/listingWhatsApp';


const getCategories = t => [
  { label:t('search.cat_phones'),      q:'simu'    },
  { label:t('search.cat_clothes'),     q:'nguo'    },
  { label:t('search.cat_house'),       q:'nyumba'  },
  { label:t('search.cat_cars'),        q:'gari'    },
  { label:t('search.cat_food'),        q:'chakula' },
  { label:t('search.cat_tools'),       q:'vifaa'   },
  { label:t('search.cat_furniture'),   q:'samani'  },
  { label:t('search.cat_beauty'),      q:'urembo'  },
  { label:t('search.cat_health'),      q:'dawa'    },
  { label:t('search.cat_education'),   q:'vitabu'  },
  { label:t('search.cat_agriculture'), q:'kilimo'  },
  { label:t('search.cat_services'),    q:'fundi'   },
];

const getTabs = t => [
  { key:'all',        label:t('search.tab_all')         },
  { key:'classifieds',label:t('search.tab_classifieds')  },
  { key:'products',   label:t('search.tab_products')    },
  { key:'services',   label:t('search.tab_services')     },
  { key:'moments',    label:'Moments'                    },
  { key:'transport',  label:t('search.tab_transport')    },
  { key:'hub',        label:t('search.tab_hub')          },
  { key:'people',     label:t('search.tab_people')       },
  { key:'business',   label:t('search.tab_business')     },
];

// ── Service card ──────────────────────────────────────────────────────────────
const ServiceCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  const s = sellerOf(item);
  return (
    <button type="button" onClick={() => onNavigate(`ServiceDetail-${item.id}`)} style={tile}>
      {item.category && (
        <span style={{ alignSelf:'flex-start', fontSize:12, fontWeight:700, color:'#166534', backgroundColor:'#ecfdf3',
          padding:'3px 8px', borderRadius:100 }}>{item.category}</span>
      )}
      <span style={{ ...titleStyle, fontWeight:700, fontSize:15 }}>{item.title}</span>
      <span style={{ fontSize:15, fontWeight:800 }}>
        {item.priceType==='negotiate' ? t('search.negotiate_price')
         : item.priceType==='free_quote' ? t('search.request_quote')
         : `TZS ${fmt(item.price)}`}
      </span>
      {s && (
        <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:GR }}>
          <Avatar src={s.photo} name={s.name} />
          <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</span>
          {(item.provider?.reputationScore||0) > 0 && <ReputationBadge score={item.provider.reputationScore} size="xs" />}
        </span>
      )}
    </button>
  );
};

// ── Transport provider card ─────────────────────────────────────────────────
const TransportCard = ({ item, isLoggedIn, onNavigate }) => {
  const { t } = useTranslation();
  const contactHref = item.whatsappPhone
    ? listingWhatsAppHref({ phone: item.whatsappPhone, kind: 'transport', url: listingUrl('store', item.userId), shopName: item.name })
    : item.contactPhone ? `tel:${item.contactPhone}` : null;
  // The card opens the provider's public profile; contact stays a secondary action.
  return (
    <div role="button" tabIndex={0} onClick={() => item.userId && onNavigate(`CommerceProfile-${item.userId}-transport`)}
      onKeyDown={e => { if (e.key === 'Enter' && item.userId) onNavigate(`CommerceProfile-${item.userId}-transport`); }}
      style={{ ...tile, cursor: item.userId ? 'pointer' : 'default' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {item.logoUrl ? <Avatar src={item.logoUrl} name={item.name} size={40} round={false} />
          : <span style={{ width:40, height:40, borderRadius:10, backgroundColor:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon d={I.truck} size={20} color={B} /></span>}
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
          <div style={{ fontSize:12, color:GR, textTransform:'capitalize', display:'flex', gap:6 }}>
            <span>{item.type}</span>{item.rating > 0 && <Star value={item.rating} />}
          </div>
        </div>
      </div>
      {contactHref ? (
        <a href={contactHref} target="_blank" rel="noopener noreferrer"
          onClick={e => { e.stopPropagation(); if (!isLoggedIn) { e.preventDefault(); onNavigate('PublicLogin'); } }}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', height:40, borderRadius:20,
            backgroundColor:DK, color:WH, fontSize:14, fontWeight:700, textDecoration:'none' }}>
          {t('search.transport_contact_button')}
        </a>
      ) : (
        <div style={{ fontSize:12, color:GR }}>{t('search.transport_no_contact')}</div>
      )}
    </div>
  );
};

// ── Office (hub) card ─────────────────────────────────────────────────────────
const HubCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={() => item.userId && onNavigate(`CommerceProfile-${item.userId}-hub`)} style={tile}>
      <span style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ width:40, height:40, borderRadius:10, backgroundColor:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon d={I.office} size={20} color={B} /></span>
        <span style={{ minWidth:0, display:'flex', flexDirection:'column' }}>
          <span style={{ fontSize:15, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.businessName}</span>
          <span style={{ fontSize:12, color:GR, display:'flex', gap:6 }}><span>{item.city}</span>{item.rating > 0 && <Star value={item.rating} />}</span>
        </span>
      </span>
      {item.address && (
        <span style={{ fontSize:12, color:GR, display:'flex', gap:4, alignItems:'center', minWidth:0 }}>
          <Icon d={I.pin} size={13} /><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.address}</span>
        </span>
      )}
      <span style={{ fontSize:14, fontWeight:700, color:B }}>{t('search.hub_view_button')}</span>
    </button>
  );
};

// ── Profile card (people/business search results) ──────────────────────────
const ProfileResultCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={() => onNavigate(`CommerceProfile-${item.ownerId}`, { commerceProfileId: item.id })}
      style={{ ...tile, alignItems:'center', textAlign:'center' }}>
      <Avatar src={item.photoUrl} name={item.displayName} size={56} />
      <span style={{ fontSize:15, fontWeight:800, display:'flex', alignItems:'center', gap:4, maxWidth:'100%' }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.displayName}</span>
        {item.isVerified && <Verified />}
      </span>
      <span style={{ fontSize:12, color:GR, textTransform:'capitalize' }}>{(item.type||'').replace(/_/g,' ')}</span>
      <span style={{ fontSize:12, color:GR, display:'flex', gap:6 }}>
        <span>{fmt(item.followersCount||0)} {t('commerce_profile.stat_followers')}</span>
        {Number(item.rating||0) > 0 && <Star value={item.rating} />}
      </span>
    </button>
  );
};

// ── Business card (authorized brand dealers, spec §23) ──────────────────────
const BusinessCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={() => onNavigate(`CommerceProfile-${item.ownerId}`, { commerceProfileId: item.commerceProfileId })}
      style={{ ...tile, alignItems:'center', textAlign:'center' }}>
      <Avatar src={item.photoUrl} name={item.displayName} size={56} />
      <span style={{ fontSize:15, fontWeight:800, display:'flex', alignItems:'center', gap:4 }}>{item.displayName}{item.isVerified && <Verified />}</span>
      {item.location && <span style={{ fontSize:12, color:GR }}>{item.location}</span>}
      <span style={{ fontSize:12, fontWeight:700, color:B, backgroundColor:'#eff6ff', borderRadius:20, padding:'3px 10px' }}>
        {item.coverage?.length ? t('search.business_covers', { area: item.coverage.join(', ') }) : t('search.business_authorized_badge')}
      </span>
    </button>
  );
};

// ── Seller card (businesses to follow) ───────────────────────────────────────
const SellerCard = ({ seller, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [following, setFollowing] = useState(!!seller.isFollowing);
  const id = seller.userId || seller.id;
  const name = seller.storeName || seller.name;

  useEffect(() => { setFollowing(!!seller.isFollowing); }, [seller.isFollowing]);

  const handleFollow = async e => {
    e.stopPropagation();
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const r = await api.post(`/stores/${id}/follow`);
      setFollowing(r.data.following ?? !following);
    } catch {}
  };
  const open = () => onNavigate(`CommerceProfile-${id}`, seller.commerceProfileId ? { commerceProfileId: seller.commerceProfileId } : undefined);

  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open(); }}
      style={{ flexShrink:0, width:140, border:`1px solid ${LINE}`, borderRadius:16, padding:12, cursor:'pointer',
        display:'flex', flexDirection:'column', alignItems:'center', gap:6, backgroundColor:WH, boxSizing:'border-box' }}>
      <Avatar src={seller.logo} name={name} size={52} />
      <span style={{ fontSize:14, fontWeight:700, display:'flex', alignItems:'center', gap:4, maxWidth:'100%' }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
        {seller.isVerified && <Verified />}
      </span>
      <span style={{ fontSize:12, color:GR, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {seller.businessLocation || t('search.location_fallback')}
      </span>
      <button type="button" onClick={handleFollow}
        style={{ marginTop:4, height:32, padding:'0 16px', borderRadius:16, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit',
          border: following ? '1px solid #cfd9de' : 'none', backgroundColor: following ? WH : DK, color: following ? DK : WH }}>
        {following ? t('search.unfollow_button') : t('search.follow_button')}
      </button>
    </div>
  );
};

// ── Section ───────────────────────────────────────────────────────────────────
const Section = ({ title, sub, action, onAction, children, hscroll }) => (
  <section style={{ backgroundColor:WH, borderTop:`1px solid ${LINE}`, padding:'16px 0' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'0 16px 12px', gap:12 }}>
      <div>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:DK }}>{title}</h2>
        {sub && <div style={{ fontSize:13, color:GR, marginTop:2 }}>{sub}</div>}
      </div>
      {action && (
        <button type="button" onClick={onAction}
          style={{ background:'none', border:'none', cursor:'pointer', color:B, fontSize:14, fontWeight:600, fontFamily:'inherit', flexShrink:0 }}>{action}</button>
      )}
    </div>
    {hscroll ? (
      <div style={{ display:'flex', gap:10, overflowX:'auto', padding:'0 16px 4px', scrollbarWidth:'none' }}>{children}</div>
    ) : (
      <div style={{ padding:'0 16px' }}>{children}</div>
    )}
  </section>
);

const EmptyState = ({ icon = I.search, title, desc, children }) => (
  <div style={{ textAlign:'center', padding:'56px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
    <span style={{ width:56, height:56, borderRadius:28, backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 }}>
      <Icon d={icon} size={26} color={GR} />
    </span>
    <div style={{ fontSize:17, fontWeight:800, color:DK }}>{title}</div>
    {desc && <div style={{ fontSize:14, color:GR, maxWidth:320, lineHeight:1.45 }}>{desc}</div>}
    {children}
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
const AI_DOMAIN_TO_TAB = { product: 'products', classified: 'classifieds', service: 'services', moment: 'moments', transport: 'transport', hub: 'hub', people: 'people', business: 'business', all: 'all' };

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
  const [moments,     setMoments]     = useState([]);
  const [semanticRoutes, setSemanticRoutes] = useState([]);
  // AI/NL brand query integration (spec §23) — "which businesses sell
  // genuine LG products near me" etc. Same structured, domain-exclusive
  // shape as transports/hubs above, calling /brands/authorized-businesses
  // directly rather than a search-specific endpoint.
  const [businesses,  setBusinesses]  = useState([]);
  const [transportNeedsCities, setTransportNeedsCities] = useState(false);
  const [hubNeedsCity, setHubNeedsCity] = useState(false);
  const [businessNeedsBrand, setBusinessNeedsBrand] = useState(false);

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
    if (!isAppleMobile()) inputRef.current?.focus();
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
      intent?.domain === 'transport' || intent?.domain === 'people' || intent?.domain === 'hub' || intent?.domain === 'business'
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
    setMoments([]);
    setSemanticRoutes([]);
    setBusinesses([]);
    setTransportNeedsCities(false);
    setHubNeedsCity(false);
    setBusinessNeedsBrand(false);

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
      moment:     semanticResults.filter(r => r._type === 'moment'),
      transport_route: semanticResults.filter(r => r._type === 'transport_route'),
    };
    const mergedProfiles = [
      ...profileResults,
      ...semanticByType.profile.filter(sp => !profileResults.some(p => p.id === sp.id)),
    ];
    setProfiles(mergedProfiles);
    setMoments(semanticByType.moment);
    setSemanticRoutes(semanticByType.transport_route);

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
        (mergedProfiles.length - profileResults.length) +
        semanticByType.moment.length + semanticByType.transport_route.length;

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

    // Business (spec §23 — "which shops sell genuine LG products near
    // me") is the same structured shape as hub/transport above — a real
    // brand name is required (city is optional; an unscoped authorization
    // covers everywhere), and it calls the brand network's own endpoint
    // directly rather than joining the classifieds/products/services
    // fan-out below.
    if (tabForDomain === 'business') {
      if (!intent?.brand) {
        setBusinessNeedsBrand(true);
        finish(0, { skipExplain: true });
        return;
      }
      try {
        const res = await api.get('/brands/authorized-businesses', {
          params: { brand: intent.brand, city: intent.location || undefined },
        });
        const businessList = res.data?.businesses || [];
        setBusinesses(businessList);
        finish(businessList.length, {
          domainCounts: { business: businessList.length },
          topItems: businessList.slice(0, 3).map(b => ({
            type: 'business', name: b.displayName, subtitle: b.location,
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

  const total = classifieds.length + products.length + services.length + transports.length + hubs.length + profiles.length + businesses.length + moments.length + semanticRoutes.length;

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
                 ...profiles.map(p => ({...p, _type:'profile'})),
                 ...moments.map(m => ({...m, _type:'moment'})),
                 ...semanticRoutes.map(r => ({...r, _type:'transport_route'}))],
    classifieds: classifieds.map(c => ({...c, _type:'classified'})),
    products:    products.map(p => ({...p, _type:'product'})),
    services:    services.map(s => ({...s, _type:'service'})),
    moments:     moments.map(m => ({...m, _type:'moment'})),
    transport:   transports.map(tr => ({...tr, _type:'transport'})),
    hub:         hubs.map(h => ({...h, _type:'hub'})),
    people:      profiles.map(p => ({...p, _type:'profile'})),
    business:    businesses.map(b => ({...b, _type:'business'})),
  };

  const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:'16px 12px' };
  const chip = (active) => ({ flexShrink:0, height:36, padding:'0 14px', borderRadius:18, cursor:'pointer', fontFamily:'inherit',
    fontSize:14, fontWeight: active ? 700 : 600, whiteSpace:'nowrap',
    border: active ? 'none' : '1px solid #cfd9de', backgroundColor: active ? DK : WH, color: active ? WH : DK });
  const runCategory = (label) => { setQuery(label); handleSearch(label); };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:WH, color:DK, fontFamily:'inherit' }}>

      {/* ── Header: title, search, categories (sticky) ── */}
      <header style={{ position:'sticky', top:0, zIndex:200, backgroundColor:'rgba(255,255,255,0.96)',
        backdropFilter:'blur(8px)', borderBottom:`1px solid ${LINE}`, padding:'10px 16px' }}>
        <h1 style={{ margin:'2px 0 10px', fontSize:20, fontWeight:800 }}>Soko</h1>
        <form role="search" onSubmit={e => { e.preventDefault(); handleSearch(query); }}
          style={{ display:'flex', alignItems:'center', gap:10, height:44, borderRadius:22, backgroundColor:LINE, padding:'0 6px 0 16px' }}>
          <Icon d={I.search} size={18} />
          <input ref={inputRef} type="search" aria-label={t('search.search_placeholder')}
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('search.search_placeholder')}
            style={{ flex:1, minWidth:0, border:'none', background:'none', outline:'none', fontSize:15, color:DK, fontFamily:'inherit' }} />
          {query && (
            <button type="button" aria-label="Futa" onClick={() => { setQuery(''); setSearched(false); }}
              style={{ width:32, height:32, borderRadius:16, border:'none', background:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon d="M6 6l12 12M18 6L6 18" size={16} />
            </button>
          )}
          {query.trim() && (
            <button type="submit" style={{ height:34, padding:'0 14px', borderRadius:17, border:'none', backgroundColor:B, color:WH,
              fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{t('search.search_button')}</button>
          )}
        </form>
        {!searched && (
          <nav aria-label={t('search.search_by_type')} style={{ display:'flex', gap:8, overflowX:'auto', scrollbarWidth:'none', marginTop:10 }}>
            <button type="button" style={chip(false)} onClick={() => onNavigate('FlashSales')}>{t('search.flash_sales_title')}</button>
            {CATEGORIES.map(c => (
              <button type="button" key={c.q} style={chip(false)} onClick={() => runCategory(c.label)}>{c.label}</button>
            ))}
          </nav>
        )}
      </header>

      <div style={{ paddingBottom:96 }}>

        {/* ── SEARCH RESULTS ── */}
        {searched && (
          <>
            <div role="tablist" style={{ display:'flex', borderBottom:`1px solid ${LINE}`, overflowX:'auto', scrollbarWidth:'none', padding:'0 8px' }}>
              {TABS.map(tabItem => {
                const on = tab === tabItem.key;
                const n = tabItem.key !== 'all' ? tabItems[tabItem.key]?.length : 0;
                return (
                  <button type="button" role="tab" aria-selected={on} key={tabItem.key} onClick={() => setTab(tabItem.key)}
                    style={{ position:'relative', height:48, padding:'0 12px', border:'none', background:'none', cursor:'pointer', fontFamily:'inherit',
                      fontSize:15, fontWeight: on ? 700 : 500, whiteSpace:'nowrap', color: on ? DK : GR }}>
                    {tabItem.label}{n > 0 ? ` ${n}` : ''}
                    {on && <span style={{ position:'absolute', left:12, right:12, bottom:0, height:4, borderRadius:2, backgroundColor:B }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ padding:16 }}>
              {/* AI summary: a short explanation of what was found, plus follow-ups.
                  Never blocks the results, which render as soon as they're back. */}
              {(aiExplaining || aiSummary) && (
                <div style={{ display:'flex', gap:10, border:`1px solid ${LINE}`, borderRadius:16, padding:'12px 14px', marginBottom:16 }}>
                  <Icon d={I.spark} size={18} color={B} />
                  <div style={{ flex:1, minWidth:0 }}>
                    {!aiSummary ? (
                      <div style={{ fontSize:14, color:GR, display:'flex', alignItems:'center', gap:8 }}>
                        <Spinner size={14} color={B} />{t('search.ai_thinking')}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize:15, color:DK, lineHeight:1.5 }}>{aiSummary}</div>
                        {aiSuggestions.length > 0 && (
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
                            {aiSuggestions.map(s => (
                              <button type="button" key={s} onClick={() => { setQuery(s); handleSearch(s); }}
                                style={{ fontSize:13, fontWeight:600, color:B, backgroundColor:WH, border:'1px solid #bfdbfe',
                                  borderRadius:100, padding:'6px 12px', cursor:'pointer', fontFamily:'inherit' }}>{s}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {loading ? (
                <>
                  <div role="status" style={{ fontSize:14, color:GR, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
                    <Spinner size={16} color={B} />{t('search.searching', { query })}
                  </div>
                  <SkeletonGrid count={6} />
                </>
              ) : transportNeedsCities ? (
                <EmptyState icon={I.truck} title={t('search.transport_needs_cities_title')} desc={t('search.transport_needs_cities_desc')} />
              ) : hubNeedsCity ? (
                <EmptyState icon={I.office} title={t('search.hub_needs_city_title')} desc={t('search.hub_needs_city_desc')} />
              ) : businessNeedsBrand ? (
                <EmptyState title={t('search.business_needs_brand_title')} desc={t('search.business_needs_brand_desc')} />
              ) : total === 0 ? (
                <EmptyState title={t('search.no_results_title', { query })} desc={t('search.no_results_desc')}>
                  <button type="button" onClick={() => { setSearched(false); setQuery(''); }}
                    style={{ marginTop:12, height:44, padding:'0 22px', borderRadius:22, border:'none', backgroundColor:DK, color:WH,
                      fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    {t('search.back_discover_button')}
                  </button>
                </EmptyState>
              ) : (
                <>
                  <div style={{ fontSize:14, color:GR, marginBottom:14 }}>{t('search.results_count', { count: total, query })}</div>
                  <div style={grid}>
                    {(tab === 'all' ? tabItems.all : tabItems[tab]).map((item) => {
                      if (item._type === 'service') return <ServiceCard key={`s-${item.id}`} item={item} onNavigate={onNavigate} />;
                      if (item._type === 'moment') {
                        return (
                          <button type="button" key={`m-${item.id}`} onClick={() => onNavigate(item.intentRef?.destination || 'Home', { momentId: item.id })} style={cardBtn}>
                            <Photo src={item.imageUrl} />
                            <span style={{ fontSize:12, fontWeight:700, color:B }}>Moment</span>
                            <span style={titleStyle}>{item.title || item.body || 'Moment'}</span>
                            {item.locationLabel && <span style={{ fontSize:12, color:GR }}>{item.locationLabel}</span>}
                          </button>
                        );
                      }
                      if (item._type === 'transport_route') {
                        return (
                          <button type="button" key={`tr-${item.id}`} onClick={() => onNavigate(isLoggedIn ? 'SendShipment' : 'PublicLogin')} style={tile}>
                            <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:B }}><Icon d={I.truck} size={14} color={B} />Njia</span>
                            <span style={{ fontSize:15, fontWeight:800 }}>{item.originCity || item.coverageCity || item.loopStops?.[0] || 'Njia'} → {item.destinationCity || item.loopStops?.[item.loopStops.length-1] || 'Mwisho'}</span>
                            <span style={{ fontSize:13, color:GR }}>Tuma mzigo kwa njia hii</span>
                          </button>
                        );
                      }
                      if (item._type === 'transport') return <TransportCard key={`t-${item.id}`} item={item} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />;
                      if (item._type === 'hub') return <HubCard key={`h-${item.id}`} item={item} onNavigate={onNavigate} />;
                      if (item._type === 'profile') return <ProfileResultCard key={`pr-${item.id}`} item={item} onNavigate={onNavigate} />;
                      if (item._type === 'business') return <BusinessCard key={`b-${item.commerceProfileId}`} item={item} onNavigate={onNavigate} />;
                      if (item._type === 'product') return <ProductCard key={`p-${item.id}`} item={item} onNavigate={onNavigate} />;
                      return <ClassifiedCard key={`c-${item.id}`} item={item} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />;
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
            {/* Businesses first: the identity behind the products (CLAUDE.md §15). */}
            {sellers.length > 0 && (
              <Section title={t('search.businesses_title')} sub={t('search.businesses_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('Stores')} hscroll>
                {sellers.map(s => (
                  <SellerCard key={s.id||s.userId} seller={s} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                ))}
              </Section>
            )}

            {loadingFeat ? (
              <Section title={t('search.new_products_title')}>
                <SkeletonGrid count={4} />
              </Section>
            ) : featured.length > 0 ? (
              <Section title={t('search.new_products_title')} sub={t('search.new_products_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('ClassifiedsPublic')}>
                <div style={grid}>
                  {featured.slice(0,6).map(c => (
                    <ClassifiedCard key={c.id} item={c} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                  ))}
                </div>
              </Section>
            ) : null}

            {featSvc.length > 0 && (
              <Section title={t('search.services_title')} sub={t('search.services_sub')}
                action={t('search.see_all')} onAction={() => onNavigate('Services')}>
                <div style={{ ...grid, gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))' }}>
                  {featSvc.slice(0,4).map(s => <ServiceCard key={s.id} item={s} onNavigate={onNavigate} />)}
                </div>
              </Section>
            )}

            {!loadingFeat && featured.length === 0 && sellers.length === 0 && (
              <EmptyState title={t('search.discover_empty_title')} desc={t('search.discover_empty_desc')} />
            )}
          </>
        )}
      </div>

      <style>{`::-webkit-scrollbar { display:none }`}</style>
    </div>
  );
};

export default Search;
