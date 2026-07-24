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
import Navbar        from '../components/Navbar';
import BackBar       from '../components/BackBar';
import Footer        from '../components/Footer';
import WishlistHeart from '../components/WishlistHeart';
import ReputationBadge from '../components/ReputationBadge';
import api           from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const fmt = n => Number(n||0).toLocaleString();

const CATEGORIES = [
  { icon:'📱', label:'Simu',      q:'simu'       },
  { icon:'👗', label:'Nguo',      q:'nguo'       },
  { icon:'🏠', label:'Nyumba',    q:'nyumba'     },
  { icon:'🚗', label:'Magari',    q:'gari'       },
  { icon:'🍔', label:'Chakula',   q:'chakula'    },
  { icon:'🔨', label:'Vifaa',     q:'vifaa'      },
  { icon:'🛋️', label:'Samani',   q:'samani'     },
  { icon:'💄', label:'Urembo',    q:'urembo'     },
  { icon:'💊', label:'Afya',      q:'dawa'       },
  { icon:'📚', label:'Elimu',     q:'vitabu'     },
  { icon:'🌾', label:'Kilimo',    q:'kilimo'     },
  { icon:'🔧', label:'Services',    q:'fundi'      },
];

const TABS = [
  { key:'all',        label:'All'        },
  { key:'classifieds',label:'🏷️ Products'  },
  { key:'products',   label:'🛍️ Store'   },
  { key:'services',   label:'🔧 Services'  },
];

// ── Classified card ───────────────────────────────────────────────────────────
const ClassifiedCard = ({ item, onNavigate, isLoggedIn }) => (
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
        📍 {item.location || 'Tanzania'}
      </div>
    </div>
  </div>
);

// ── Service card ──────────────────────────────────────────────────────────────
const ServiceCard = ({ item, onNavigate }) => (
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
      {item.priceType==='negotiate' ? 'Bei kwa mazungumzo'
       : item.priceType==='free_quote' ? 'Omba bei'
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

// ── Seller card ───────────────────────────────────────────────────────────────
const SellerCard = ({ seller, onNavigate, isLoggedIn }) => {
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
    <div onClick={() => onNavigate(`CommerceProfile-${id}`)}
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
          📍 {seller.businessLocation || 'Tanzania'}
        </div>
        <button onClick={handleFollow}
          style={{ width:'100%', padding:'6px 0', border:'none',
            borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:800,
            backgroundColor: following ? '#F1F5F9' : B,
            color: following ? GR : WH }}>
          {following ? '✓ Unafuata' : '+ Fuata'}
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

// ── Main ──────────────────────────────────────────────────────────────────────
const Search = ({ onNavigate, isLoggedIn, onLogout, userRole, initialQuery }) => {
  const [query,     setQuery]     = useState(initialQuery || '');
  const [tab,       setTab]       = useState('all');
  const [searched,  setSearched]  = useState(false);
  const [loading,   setLoading]   = useState(false);

  // Search results
  const [classifieds, setClassifieds] = useState([]);
  const [products,    setProducts]    = useState([]);
  const [services,    setServices]    = useState([]);

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
  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
    inputRef.current?.focus();
  }, [initialQuery]); // eslint-disable-line

  const handleSearch = useCallback(async (q) => {
    const trimmed = (q || query).trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    setTab('all');
    try {
      const params = new URLSearchParams({ q: trimmed, limit: '20' });
      const [cRes, pRes, sRes] = await Promise.allSettled([
        api.get(`/classifieds/search?${params}`),
        api.get(`/products/search?${params}`),
        api.get(`/services/search?q=${encodeURIComponent(trimmed)}`),
      ]);
      if (cRes.status === 'fulfilled') setClassifieds(cRes.value.data?.classifieds || cRes.value.data || []);
      if (pRes.status === 'fulfilled') setProducts(pRes.value.data?.products || pRes.value.data || []);
      if (sRes.status === 'fulfilled') setServices(sRes.value.data || []);
    } catch {}
    finally { setLoading(false); }
  }, [query]);

  const total = classifieds.length + products.length + services.length;

  const tabItems = {
    all:        [...classifieds, ...products.map(p => ({...p, _type:'product'})),
                 ...services.map(s => ({...s, _type:'service'}))],
    classifieds: classifieds,
    products:    products,
    services:    services,
  };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#F8FAFC',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif', display:'flex', flexDirection:'column' }}>
      <Navbar currentPage="Search" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

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
              placeholder="Search products, services, businesses..."
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
            Search
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
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ padding:'10px 14px', border:'none', background:'none',
                    cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                    color: tab===t.key ? B : GR,
                    borderBottom:`2px solid ${tab===t.key ? B : 'transparent'}` }}>
                  {t.label}
                  {t.key !== 'all' && tabItems[t.key]?.length > 0 && (
                    <span style={{ marginLeft:4, fontSize:10, color:GR }}>
                      ({tabItems[t.key].length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding:'14px' }}>
              {loading ? (
                <div style={{ textAlign:'center', padding:'60px 0', color:GR }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                  <div style={{ fontSize:13 }}>Inatafuta "{query}"...</div>
                </div>
              ) : total === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
                  <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
                    No results found kwa "{query}"
                  </div>
                  <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                    Jaribu maneno mengine au angalia bidhaa zetu
                  </div>
                  <button onClick={() => { setSearched(false); setQuery(''); }}
                    style={{ backgroundColor:B, color:WH, border:'none',
                      borderRadius:12, padding:'11px 24px', cursor:'pointer',
                      fontSize:13, fontWeight:700 }}>
                    Back Discover
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:12, color:GR, marginBottom:12, fontWeight:600 }}>
                    Matokeo {total} kwa "{query}"
                  </div>
                  <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
                    {(tab === 'all' ? tabItems.all : tabItems[tab]).map((item, i) => {
                      if (item._type === 'service') {
                        return <ServiceCard key={`s-${item.id}`} item={item} onNavigate={onNavigate} />;
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
                                TZS {fmt(item.price)}
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
                🗂️ Search kwa Aina
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

            {/* Flash Sales banner */}
            <div onClick={() => onNavigate('FlashSales')}
              style={{ margin:'8px 14px', background:'linear-gradient(135deg,#DC2626,#EA580C)',
                borderRadius:14, padding:'14px 18px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                color:WH }}>
              <div>
                <div style={{ fontSize:14, fontWeight:900 }}>🔥 Flash Sales</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>
                  Discount kubwa · Muda mfupi
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
                  🏷️ Products New
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ height:200, backgroundColor:'#F8FAFC',
                      borderRadius:14, animation:'pulse 1.5s infinite' }} />
                  ))}
                </div>
              </div>
            ) : featured.length > 0 ? (
              <Section title="🏷️ Products New"
                sub="Zilizoongezwa hivi karibuni"
                action="See All" onAction={() => onNavigate('Classifieds')}>
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
              <Section title="🏪 Businesses za Kufuata"
                sub="Wauzaji waliohakikiwa Tanzania nzima"
                action="See All" onAction={() => onNavigate('Stores')}
                hscroll>
                {sellers.map(s => (
                  <SellerCard key={s.id||s.userId} seller={s}
                    onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                ))}
              </Section>
            )}

            {/* Featured services */}
            {featSvc.length > 0 && (
              <Section title="🔧 Services Zinazopatikana"
                sub="Mafundi, wasafi, walimu na zaidi"
                action="See All" onAction={() => onNavigate('Services')}>
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
                  Discover bidhaa na biashara
                </div>
                <div style={{ fontSize:13, color:GR, marginBottom:20 }}>
                  Andika kitu unachotafuta kwenye kisanduku hapo juu
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
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default Search;