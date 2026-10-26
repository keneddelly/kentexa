import React, { useEffect, useState } from 'react';
import { buildProductMomentPayload } from '../utils/publicActor';
import api from '../../api/api';
import { trackProductView, trackAddToCart } from '../hooks/useAnalytics';
import { useCart } from '../../context/CartContext';
import WishlistHeart from '../components/WishlistHeart';
import CommerceCommentSection from '../components/CommerceCommentSection';
import { Spinner, PageLoading } from '../components/Loading';
import { useTranslation } from 'react-i18next';

/**
 * ProductDetail — one shop product (owner 2026-10-26 redesign): photo, price and
 * facts, then the business behind it (identity first), tabs, and a bottom bar
 * with quantity, cart and "Agiza". No emoji; only real numbers (no invented
 * "was" price, rating, free delivery or guarantees KenteXa does not give).
 */
const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const WH = '#ffffff';
const LINE = '#eff3f4';

const IC = {
  back: 'M15 6l-6 6 6 6',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  bag: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
  bagPlus: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0M12 11v6M9 14h6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chat: 'M4 5h16v11H8l-4 4z',
  check: 'M5 12.5l4.5 4.5L19 7',
  right: 'M9 6l6 6-6 6',
  photo: 'M4 6h16v12H4zM8 14l3-3 3 3 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z',
};
const Icon = ({ d, size = 18, color = GR }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const IconBtn = ({ label, onClick, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick}
    style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    {children}
  </button>
);
const Avatar = ({ src, name, size = 40 }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexShrink: 0, backgroundColor: '#cfd9de', color: WH,
    fontWeight: 800, fontSize: size * 0.4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name || '?').trim().charAt(0).toUpperCase()}
  </span>
);
const Verified = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" fill={B} /><path d="M8 12.5l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);
const CHIP = { green: ['#ecfdf3', '#166534'], red: ['#fef2f2', '#b91c1c'], blue: ['#eff6ff', '#1e40af'], grey: ['#f7f9f9', GR] };
const Chip = ({ tone = 'grey', children }) => (
  <span style={{ height: 28, padding: '0 10px', borderRadius: 14, backgroundColor: CHIP[tone][0], color: CHIP[tone][1], fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>{children}</span>
);
const pill = (bg, color = WH) => ({ height: 44, padding: '0 18px', borderRadius: 22, border: 'none', backgroundColor: bg, color, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 });
const linkBtn = { alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const variantStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #cfd9de', backgroundColor: WH, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: DK };
const stepBtn = { width: 40, height: 46, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700, color: DK, fontFamily: 'inherit' };

const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';
const Stars = ({ rating, size = 12, interactive = false, onRate }) => (
  <span style={{ display: 'inline-flex', gap: 2 }} role={interactive ? 'radiogroup' : 'img'} aria-label={interactive ? 'Nyota' : `${rating} / 5`}>
    {[1, 2, 3, 4, 5].map(i => {
      const svg = <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={i <= Math.round(rating) ? '#f59e0b' : '#e2e8f0'} /></svg>;
      return interactive
        ? <button type="button" key={i} role="radio" aria-checked={i === rating} aria-label={`${i}`} onClick={() => onRate && onRate(i)}
            style={{ padding: 2, border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0 }}>{svg}</button>
        : <span key={i} style={{ lineHeight: 0 }}>{svg}</span>;
    })}
  </span>
);

const ProductDetail = ({ onNavigate, isLoggedIn, onLogout, userRole, productId, track, currentUser, onOpenMoment, initialTab, activeProfileId, activeProfile }) => {
  const { t } = useTranslation();
  const [product, setProduct]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity]         = useState(1);
  const [tab, setTab]                   = useState(initialTab || 'features');
  const [message, setMessage]           = useState('');
  const [related, setRelated]           = useState([]);
  const [recommended, setRecommended]   = useState([]);
  const [sharingMoment, setSharingMoment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const [reviews, setReviews]           = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewOk, setReviewOk] = useState(false);

  const { addToCart, isInCart } = useCart();
  // Category attribute schema (GET /categories) — used only to render the
  // specs tab in the seller-defined displayOrder with proper labels/units
  // instead of an unordered raw key dump. Never blocks anything: a spec
  // key that doesn't match the schema (e.g. a pre-existing listing) still
  // renders, just unordered with its raw key as the label.
  const [categorySchema, setCategorySchema] = useState({});
  useEffect(() => {
    api.get('/categories').then(res => {
      const tree = {};
      (res.data || []).forEach(cat => {
        const subcategories = {};
        (cat.subcategories || []).forEach(sub => { subcategories[sub.key] = sub.attributes || []; });
        tree[cat.key] = subcategories;
      });
      setCategorySchema(tree);
    }).catch(() => {});
  }, []);

  useEffect(() => { if (productId) fetchProduct(); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a "New comment"/"New save" notification — land on the
  // reviews/comments tab instead of the default tab.
  useEffect(() => { setTab(initialTab || 'features'); }, [productId, initialTab]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/products/${productId}`);
      setProduct(res.data);
      if (track) trackProductView(track, res.data);
      // Fire and forget — track view for social proof, don't block rendering
      api.post(`/products/${productId}/view`).catch(() => {});

      try {
        const rel = await api.get(`/products/seller/${res.data.seller?.id}`).catch(() => ({ data: [] }));
        setRelated((rel.data || []).filter(p => p.id !== res.data.id).slice(0, 6));
      } catch { setRelated([]); }

      try {
        const rec = await api.get(`/products?category=${res.data.category}`).catch(() => ({ data: [] }));
        setRecommended((rec.data || []).filter(p => p.id !== res.data.id).slice(0, 8));
      } catch { setRecommended([]); }

      try {
        const revRes = await api.get(`/products/${productId}/reviews`).catch(() => ({ data: [] }));
        setReviews(revRes.data || []);
      } catch { setReviews([]); }

      const d = res.data;
      const autoF = (d.features && d.features.length > 0) ||
        (d.description && d.description.split('\n').some(l => l.trim().startsWith('-')));
      const autoS = d.specs && Object.keys(d.specs).length > 0;
      if (autoF) setTab('features');
      else if (autoS) setTab('specs');
      else setTab('description');
    } catch (err) { console.error('Failed to load product', err); }
    finally { setLoading(false); }
  };

  // Stock is checked again at the moment of adding: a product that sold out
  // since the page opened answers 404 and is not added.
  const handleAddToCart = async () => {
    if (!product?.isAvailable) return;
    let current = product;
    try {
      current = (await api.get(`/products/${product.id}`)).data || product;
    } catch (err) {
      if (err?.response?.status === 404) current = { ...product, stock: 0 };
    }
    if (!addToCart(current, Math.min(quantity, Math.max(Number(current.stock), 1)))) {
      setProduct(p => ({ ...p, stock: 0, isAvailable: false }));
      setMessage(`${product.name}: ${t('commerce_profile.out_of_stock')}`);
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    if (track) trackAddToCart(track, product);
    setMessage(`${product.name} ${t('product_detail.added_to_cart')}`);
    setTimeout(() => setMessage(''), 3000);
  };

  // Shareable link to the standalone /share backend route (not the SPA path
  // directly) so a pasted link into WhatsApp/Facebook shows a real preview
  // card — social crawlers don't execute JS, so only a server-rendered
  // response can carry the right og:title/og:image for this specific product.
  const handleShare = () => {
    if (!product) return;
    const url = `${api.defaults.baseURL}/share/product/${product.id}`;
    if (navigator.share) {
      navigator.share({ title: product.name, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      setMessage(t('share.link_copied'));
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // One click — we already know the product, its image, and its title, so
  // there's nothing left for the user to fill in. No modal, just publish.
  const handleShareMoment = async () => {
    if (!product || sharingMoment) return;
    try {
      setSharingMoment(true);
      // I2 correction: the acting profile is the canonical context profile, never the
      // legacy activeProfile.id (a stale Business profile for a legacy unbound Seller).
      await api.post('/feed/publish', buildProductMomentPayload(product, activeProfile));
      setMessage('Imeshirikiwa kwenye Moments zako.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Imeshindikana kushiriki. Jaribu tena.');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSharingMoment(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!reviewComment.trim()) { setReviewOk(false); setReviewMessage(t('product_detail.write_comment_first')); return; }
    try {
      setSubmittingReview(true);
      await api.post(`/products/${productId}/reviews`, { rating: reviewRating, comment: reviewComment.trim() });
      setReviewOk(true);
      setReviewMessage(t('product_detail.review_submitted'));
      setReviewComment('');
      setReviewRating(5);
      const revRes = await api.get(`/products/${productId}/reviews`).catch(() => ({ data: [] }));
      setReviews(revRes.data || []);
    } catch (err) {
      setReviewOk(false);
      setReviewMessage(err?.response?.data?.message || t('product_detail.review_failed'));
    } finally { setSubmittingReview(false); }
  };


  const backBar = (
    <div style={{ height:52, display:'flex', alignItems:'center', padding:'0 8px', backgroundColor:WH, borderBottom:`1px solid ${LINE}` }}>
      <IconBtn label={t('common.back')} onClick={() => onNavigate('back')}><Icon d={IC.back} size={22} color={DK} /></IconBtn>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight:'100vh', backgroundColor:WH }}>
      {backBar}
      <PageLoading label={t('product_detail.loading')} />
    </div>
  );

  if (!product) return (
    <div style={{ minHeight:'100vh', backgroundColor:WH }}>
      {backBar}
      <div style={{ textAlign:'center', padding:'72px 24px', color:GR, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <span style={{ width:56, height:56, borderRadius:28, backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon d={IC.bag} size={26} /></span>
        <p style={{ margin:0, fontSize:16, color:DK, fontWeight:700 }}>{t('product_detail.not_found')}</p>
        <button type="button" onClick={() => onNavigate('Search')} style={pill(DK)}>{t('product_detail.back_to_stores')}</button>
      </div>
    </div>
  );

  // Only real numbers: no invented "was" price, rating or free delivery (CLAUDE.md: never invent activity).
  const displayPrice  = Number(product.displayPrice || product.basePrice || product.price || 0);
  const hasSpecs      = product.specs && Object.keys(product.specs).length > 0;

  // Orders/labels the specs using the category's AttributeDef schema
  // (displayOrder + label + unit); unknown keys still render, at the end.
  const orderedSpecEntries = (() => {
    if (!hasSpecs) return [];
    const attrs = categorySchema[product.category]?.[product.subcategory] || [];
    const attrByKey = new Map(attrs.map(a => [a.key, a]));
    const entries = Object.entries(product.specs).filter(([, v]) => v);
    return entries
      .map(([k, v]) => {
        const attr = attrByKey.get(k);
        return {
          key: k,
          label: attr ? `${attr.label}${attr.unit ? ` (${attr.unit})` : ''}` : k,
          value: v,
          order: attr ? (attr.displayOrder ?? 999) : 1000,
        };
      })
      .sort((a, b) => a.order - b.order);
  })();

  const autoFeatures = (() => {
    if (product.features && product.features.length > 0) return product.features;
    if (!product.description) return [];
    return product.description.split('\n')
      .map(l => l.trim()).filter(l => l.startsWith('-'))
      .map(l => l.substring(1).trim()).slice(0, 8);
  })();
  const hasFeatures = autoFeatures.length > 0;
  // The BUSINESS CommerceProfile's identity first; the seller's personal
  // fields only when they have no business profile yet.
  const sellerRating = Number(product.commerceProfile?.rating || product.seller?.rating || 0);
  const sellerName   = product.commerceProfile?.displayName || product.seller?.storeName || product.seller?.businessName || product.seller?.name || 'Muuzaji';
  const sellerFollowers = product.commerceProfile?.followersCount ?? product.seller?.followersCount;
  const sellerPhoto = product.commerceProfile?.photoUrl || product.seller?.logo;
  const sellerVerified = !!(product.commerceProfile?.isVerified || product.seller?.isVerified);
  const sellerPlace = product.commerceProfile?.location || product.seller?.businessLocation;
  const sellerNavParams = product.commerceProfile?.id ? { commerceProfileId: product.commerceProfile.id } : undefined;
  // Tags the conversation to this exact product (ConversationService context).
  const messageSellerNavParams = { ...sellerNavParams, contextType: 'product', contextId: product.id };
  const openSeller = () => product.seller?.id && onNavigate(`CommerceProfile-${product.seller.id}`, sellerNavParams);
  const isOwner = isLoggedIn && currentUser?.id === product.seller?.id;
  const lowStock = product.isAvailable && Number(product.stock) > 0 && Number(product.stock) <= 10;

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const tabs = [
    hasFeatures && { key: 'features',    label: t('product_detail.features') },
    hasSpecs    && { key: 'specs',       label: t('product_detail.specs') },
    { key: 'description', label: t('product_detail.details') },
    { key: 'reviews',     label: `${t('product_detail.reviews')}${reviews.length > 0 ? ` (${reviews.length})` : ''}` },
    { key: 'recommended', label: t('product_detail.you_may_like') },
  ].filter(Boolean);

  const MiniCard = ({ p }) => (
    <button type="button" onClick={() => onNavigate(`ProductDetail-${p.id}`)}
      style={{ display:'flex', flexDirection:'column', gap:6, padding:0, border:'none', background:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:DK, minWidth:0 }}>
      <span style={{ aspectRatio:'1 / 1', borderRadius:12, overflow:'hidden', backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {p.images?.[0] ? <img src={p.images[0]} alt={p.name} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <Icon d={IC.photo} size={24} color="#cfd9de" />}
      </span>
      <span style={{ fontSize:15, fontWeight:800 }}>TZS {Number(p.displayPrice || p.basePrice || 0).toLocaleString('en-US')}</span>
      <span style={{ fontSize:13, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.name}</span>
    </button>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:WH, color:DK, fontFamily:'inherit' }}>
      <style>{`
        .pd-root { max-width: 480px; margin: 0 auto; width: 100%; padding-bottom: 168px; }
        .pd-grid { display: block; }
        .pd-sticky-bar { position: fixed; bottom: calc(60px + env(safe-area-inset-bottom)); left: 0; right: 0; background: #fff; border-top: 1px solid ${LINE}; padding: 10px 16px; display: flex; gap: 10px; align-items: center; z-index: 2000; }
        .pd-scroll { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px 10px; }
        @media (min-width: 768px) {
          .pd-root { max-width: 1100px; padding: 16px 16px 0; }
          .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
          .pd-media { border-radius: 16px; overflow: hidden; }
          .pd-sticky-bar { position: static; border: none; padding: 0 16px; margin: 16px auto 24px; max-width: 1100px; width: 100%; box-sizing: border-box; }
        }
        @media (min-width: 1024px) { .pd-grid { grid-template-columns: 1.1fr 0.9fr; gap: 36px; } }
      `}</style>

      <div style={{ height:52, backgroundColor:'rgba(255,255,255,0.96)', backdropFilter:'blur(8px)', borderBottom:`1px solid ${LINE}`,
        display:'flex', alignItems:'center', padding:'0 8px', position:'sticky', top:0, zIndex:100 }}>
        <IconBtn label={t('common.back')} onClick={() => onNavigate('back')}><Icon d={IC.back} size={22} color={DK} /></IconBtn>
        <span style={{ flex:1, minWidth:0, fontSize:16, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'0 4px' }}>{product.name}</span>
        <IconBtn label={t('share.button')} onClick={handleShare}><Icon d={IC.share} size={20} color={DK} /></IconBtn>
        <IconBtn label={t('product_detail.cart')} onClick={() => onNavigate('Cart')}><Icon d={IC.bag} size={20} color={DK} /></IconBtn>
        {isOwner && (
          <div style={{ position:'relative' }}>
            <IconBtn label="Zaidi" onClick={() => setShowMenu(s => !s)}><Icon d={IC.more} size={20} color={DK} /></IconBtn>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
                <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, backgroundColor:WH, borderRadius:12,
                  boxShadow:'0 4px 20px rgba(0,0,0,0.15)', overflow:'hidden', zIndex:151, minWidth:160 }}>
                  <button type="button" onClick={() => { setShowMenu(false); onNavigate(`EditProduct-${product.id}`); }}
                    style={{ width:'100%', textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:'14px 16px', fontSize:15, fontWeight:600, color:DK, fontFamily:'inherit' }}>
                    Hariri bidhaa
                  </button>
                  <button type="button" onClick={() => { setShowMenu(false); handleShareMoment(); }} disabled={sharingMoment}
                    style={{ width:'100%', textAlign:'left', background:'none', border:'none', borderTop:`1px solid ${LINE}`, cursor:'pointer', padding:'14px 16px', fontSize:15, fontWeight:600, color:DK, fontFamily:'inherit' }}>
                    Shiriki kama Moment
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {message && (
        <div role="status" style={{ backgroundColor:DK, color:WH, padding:'12px 16px', fontSize:14, fontWeight:600, textAlign:'center' }}>
          {message}
        </div>
      )}

      <div className="pd-root">
        <div className="pd-grid">

          {/* ── Photos ── */}
          <div className="pd-media" style={{ position:'relative', backgroundColor:'#f7f9f9' }}>
            <div style={{ width:'100%', aspectRatio:'1/1', overflow:'hidden', position:'relative' }}>
              {product.images?.[selectedImage] ? (
                <img src={product.images[selectedImage]} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              ) : (
                <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon d={IC.photo} size={56} color="#cfd9de" /></div>
              )}
              <div style={{ position:'absolute', top:12, right:12, width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.92)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <WishlistHeart entityType="product" entityId={product.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
              </div>
              {product.images?.length > 1 && (
                <span style={{ position:'absolute', right:12, bottom:12, height:26, padding:'0 10px', borderRadius:13, backgroundColor:'rgba(15,20,25,0.7)',
                  color:WH, fontSize:13, display:'flex', alignItems:'center' }}>{selectedImage + 1} / {product.images.length}</span>
              )}
            </div>
            {product.images?.length > 1 && (
              <div style={{ padding:'8px 12px', display:'flex', gap:8, overflowX:'auto', backgroundColor:WH }}>
                {product.images.map((img, i) => (
                  <button type="button" key={i} aria-label={`Picha ${i + 1}`} onClick={() => setSelectedImage(i)}
                    style={{ width:56, height:56, padding:0, borderRadius:10, overflow:'hidden', flexShrink:0, cursor:'pointer',
                      border: i === selectedImage ? `2px solid ${B}` : `2px solid ${LINE}`, background:'none' }}>
                    <img src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {/* ── Price, name, facts ── */}
            <section style={{ padding:16, borderBottom:`1px solid ${LINE}`, display:'flex', flexDirection:'column', gap:8 }}>
              <div data-testid="pd-price" style={{ fontSize:28, fontWeight:800, letterSpacing:-0.3 }}>TZS {displayPrice.toLocaleString('en-US')}</div>
              <h1 style={{ fontSize:18, fontWeight:600, margin:0, lineHeight:1.35 }}>{product.name}</h1>
              {(product.brand || product.model) && (
                <div style={{ fontSize:14, color:GR }}>
                  {[product.brand?.name, product.model && `${t('product_detail.model_label')}: ${product.model}`].filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', fontSize:13, color:GR }}>
                {[product.category?.replace(/_/g,' '), product.subcategory?.replace(/_/g,' '),
                  Number(product.salesCount) > 0 && `${product.salesCount} ${t('product_detail.sold')}`,
                  avgRating && `${avgRating} (${reviews.length})`].filter(Boolean).map((x, i, a) => (
                  <React.Fragment key={i}><span style={{ textTransform:'capitalize' }}>{x}</span>{i < a.length - 1 && <span>·</span>}</React.Fragment>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                {product.isAvailable
                  ? <Chip tone="green">{t('product_detail.in_stock')}{Number(product.stock) > 0 ? `: ${product.stock}` : ''}</Chip>
                  : <Chip tone="red">{t('product_detail.out_of_stock')}</Chip>}
                {product.codEnabled && <Chip tone="blue">{t('product_detail.cod_badge')}</Chip>}
                {product.estimatedDelivery && <Chip>{product.estimatedDelivery}</Chip>}
                {product.brandAuthorizationBadge === 'brand_authorized' && <Chip tone="blue">{t('product_detail.brand_authorized_badge', { brand: product.brand?.name || '' })}</Chip>}
                {product.brandAuthorizationBadge === 'kentexa_verified' && <Chip tone="green">{t('product_detail.kentexa_verified_badge')}</Chip>}
              </div>
              {lowStock && <div style={{ fontSize:13, color:'#b45309', fontWeight:600 }}>{t('product_detail.only_left')} {product.stock}</div>}
              {product.codEnabled && <div style={{ fontSize:13, color:GR }}>{t('product_detail.cod_terms_hint')}</div>}
              {/* Registered serials exist for this listing (spec §14). */}
              {product.hasRegisteredSerials && (
                <button type="button" onClick={() => onNavigate('VerifyProduct')} style={linkBtn}>{t('product_detail.supports_serial_verification')}</button>
              )}
              {/* Variants: each is its own real Product page (own price/stock). */}
              {product.variants?.length > 0 && (
                <div style={{ marginTop:6 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:GR, marginBottom:6 }}>{t('product_detail.variants_label')}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span style={{ ...variantStyle, border:`2px solid ${DK}` }}>
                      {Object.values(product.variantAttributes || {}).join(' / ') || t('product_detail.this_option')}
                    </span>
                    {product.variants.map(v => {
                      const off = !v.isAvailable || v.stock <= 0;
                      return (
                        <button type="button" key={v.id} onClick={() => onNavigate(`ProductDetail-${v.id}`)} disabled={off}
                          style={{ ...variantStyle, cursor: off ? 'not-allowed' : 'pointer', color: off ? '#94a3b8' : DK, textDecoration: off ? 'line-through' : 'none' }}>
                          {Object.values(v.variantAttributes || {}).join(' / ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Compare offers: other sellers' listings of the same official product. */}
            {product.otherOffers?.length > 0 && (
              <section style={{ padding:'12px 16px', borderBottom:`1px solid ${LINE}` }}>
                <div style={{ fontSize:13, fontWeight:700, color:GR, marginBottom:6 }}>{t('product_detail.other_offers_label', { count: product.otherOffers.length })}</div>
                {product.otherOffers.map(offer => (
                  <button type="button" key={offer.productId} onClick={() => onNavigate(`ProductDetail-${offer.productId}`)}
                    style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'10px 0', border:'none',
                      borderTop:`1px solid ${LINE}`, background:'none', cursor:'pointer', fontFamily:'inherit', color:DK }}>
                    <span style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                      <Avatar src={offer.commerceProfile?.photoUrl} name={offer.commerceProfile?.displayName} size={28} />
                      <span style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{offer.commerceProfile?.displayName || t('product_detail.another_seller')}</span>
                    </span>
                    <strong style={{ fontSize:14, flexShrink:0 }}>TZS {Number(offer.displayPrice || offer.basePrice || 0).toLocaleString('en-US')}</strong>
                  </button>
                ))}
              </section>
            )}

            {/* ── The business behind the product (identity first) ── */}
            <section data-testid="pd-seller" style={{ margin:16, padding:14, border:`1px solid ${LINE}`, borderRadius:16, display:'flex', flexDirection:'column', gap:12 }}>
              <button type="button" onClick={openSeller}
                style={{ display:'flex', alignItems:'center', gap:12, padding:0, border:'none', background:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:DK }}>
                <Avatar src={sellerPhoto} name={sellerName} size={48} />
                <span style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:16, fontWeight:800, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sellerName}</span>
                    {sellerVerified && <Verified />}
                  </span>
                  <span style={{ fontSize:13, color:GR }}>
                    {[sellerPlace, sellerFollowers != null && `${Number(sellerFollowers).toLocaleString('en-US')} ${t('commerce_profile.stat_followers')}`,
                      sellerRating > 0 && `${sellerRating.toFixed(1)} / 5`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Icon d={IC.right} size={18} />
              </button>
              <div style={{ display:'flex', gap:8 }}>
                {product.seller?.id && !isOwner && (
                  <button type="button" onClick={() => onNavigate(`MessageSeller-${product.seller.id}`, messageSellerNavParams)}
                    style={{ ...pill(WH, DK), flex:1, border:'1px solid #cfd9de' }}>
                    <Icon d={IC.chat} size={16} color={DK} />{t('product_detail.message_seller')}
                  </button>
                )}
                <button type="button" onClick={openSeller} style={{ ...pill(WH, DK), flex:1, border:'1px solid #cfd9de' }}>{t('product_detail.visit_store')}</button>
              </div>
            </section>

            {/* ── Tabs ── */}
            <div role="tablist" style={{ display:'flex', overflowX:'auto', borderBottom:`1px solid ${LINE}`, scrollbarWidth:'none', padding:'0 8px' }}>
              {tabs.map(tb => {
                const on = tab === tb.key;
                return (
                  <button type="button" role="tab" aria-selected={on} key={tb.key} onClick={() => setTab(tb.key)}
                    style={{ position:'relative', flexShrink:0, height:48, padding:'0 12px', border:'none', background:'none', cursor:'pointer', fontFamily:'inherit',
                      fontSize:15, fontWeight: on ? 700 : 500, color: on ? DK : GR, whiteSpace:'nowrap' }}>
                    {tb.label}
                    {on && <span style={{ position:'absolute', left:12, right:12, bottom:0, height:4, borderRadius:2, backgroundColor:B }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ padding:16 }}>
              {tab === 'features' && hasFeatures && (
                <ul style={{ listStyle:'none', margin:0, padding:0, display:'flex', flexDirection:'column', gap:10 }}>
                  {autoFeatures.map((f, i) => (
                    <li key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:15, lineHeight:1.45 }}>
                      <Icon d={IC.check} size={18} color={B} /><span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'specs' && hasSpecs && (
                <div style={{ border:`1px solid ${LINE}`, borderRadius:12, overflow:'hidden' }}>
                  {orderedSpecEntries.map(({ key, label, value }, i) => (
                    <div key={key} style={{ display:'flex', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
                      <div style={{ flex:'0 0 45%', padding:'12px 14px', fontSize:14, color:GR }}>{label}</div>
                      <div style={{ flex:1, padding:'12px 14px', fontSize:14, fontWeight:600 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'description' && (
                product.description ? (
                  <div style={{ fontSize:15, lineHeight:1.6 }}>
                    {product.description.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={i} style={{ height:8 }} />;
                      if (trimmed.endsWith(':') && !trimmed.startsWith('-')) return <div key={i} style={{ fontWeight:800, marginTop:12, marginBottom:4 }}>{trimmed}</div>;
                      if (trimmed.startsWith('-')) {
                        return (
                          <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:4 }}>
                            <span style={{ color:GR, flexShrink:0 }}>•</span><span>{trimmed.substring(1).trim()}</span>
                          </div>
                        );
                      }
                      return <p key={i} style={{ margin:'0 0 8px' }}>{trimmed}</p>;
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize:14, color:GR, margin:0 }}>{t('product_detail.no_description')}</p>
                )
              )}

              {tab === 'recommended' && (
                recommended.length === 0
                  ? <p style={{ fontSize:14, color:GR, textAlign:'center', padding:'20px 0', margin:0 }}>{t('product_detail.no_recommendations')}</p>
                  : <div className="pd-scroll">{recommended.map(p => <MiniCard key={p.id} p={p} />)}</div>
              )}

              {tab === 'reviews' && (
                <div>
                  {reviews.length > 0 && (
                    <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:20 }}>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:36, fontWeight:800 }}>{avgRating}</div>
                        <Stars rating={Number(avgRating)} size={16} />
                        <div style={{ fontSize:13, color:GR, marginTop:2 }}>{reviews.length} {t('product_detail.reviews')}</div>
                      </div>
                      <div style={{ flex:1 }}>
                        {[5,4,3,2,1].map(star => {
                          const count = reviews.filter(r => r.rating === star).length;
                          const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                          return (
                            <div key={star} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, fontSize:12, color:GR }}>
                              <span style={{ width:8 }}>{star}</span>
                              <div style={{ flex:1, height:6, backgroundColor:LINE, borderRadius:3, overflow:'hidden' }}>
                                <div style={{ width:`${pct}%`, height:'100%', backgroundColor:'#f59e0b' }} />
                              </div>
                              <span style={{ width:16, textAlign:'right' }}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ border:`1px solid ${LINE}`, borderRadius:16, padding:14, marginBottom:16 }}>
                    <div style={{ fontSize:15, fontWeight:800, marginBottom:10 }}>
                      {isLoggedIn ? t('product_detail.write_review') : t('product_detail.login_to_review')}
                    </div>
                    {isLoggedIn ? (
                      <>
                        {reviewMessage && (
                          <div role="status" style={{ fontSize:14, color: reviewOk ? '#166534' : '#b91c1c', marginBottom:8, fontWeight:600 }}>{reviewMessage}</div>
                        )}
                        <div style={{ fontSize:13, color:GR, marginBottom:4 }}>{t('product_detail.your_rating')}</div>
                        <Stars rating={reviewRating} size={28} interactive onRate={setReviewRating} />
                        <label htmlFor="pd-review" style={{ display:'block', fontSize:13, color:GR, margin:'10px 0 4px' }}>{t('product_detail.your_comment')}</label>
                        <textarea id="pd-review" placeholder={t('product_detail.comment_placeholder')} value={reviewComment}
                          onChange={e => setReviewComment(e.target.value)} rows={3}
                          style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid #cfd9de', fontSize:15, boxSizing:'border-box', resize:'none', outline:'none', fontFamily:'inherit' }} />
                        <button type="button" onClick={handleSubmitReview} disabled={submittingReview}
                          style={{ ...pill(B), width:'100%', marginTop:10, opacity: submittingReview ? 0.8 : 1, cursor: submittingReview ? 'not-allowed' : 'pointer' }}>
                          {submittingReview ? <><Spinner size={16} color={WH} />{t('product_detail.submitting')}</> : t('product_detail.submit_review')}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => onNavigate('PublicLogin')} style={{ ...pill(DK), width:'100%' }}>{t('product_detail.login_to_review_btn')}</button>
                    )}
                  </div>

                  {reviews.length === 0 ? (
                    <p style={{ fontSize:14, color:GR, textAlign:'center', padding:'12px 0', margin:0 }}>{t('product_detail.no_reviews')}</p>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column' }}>
                      {reviews.map((r, i) => (
                        <div key={i} style={{ padding:'12px 0', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, gap:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                              <Avatar name={r.reviewer?.name || r.reviewer?.email} size={32} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:14, fontWeight:700, display:'flex', gap:6, alignItems:'center' }}>
                                  {r.reviewer?.name || 'Mteja'}
                                  {r.isVerifiedPurchase && <span style={{ fontSize:12, fontWeight:600, color:'#166534' }}>Amenunua</span>}
                                </div>
                                <Stars rating={r.rating} size={12} />
                              </div>
                            </div>
                            <span style={{ fontSize:12, color:GR, flexShrink:0 }}>{new Date(r.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
                          </div>
                          <p style={{ fontSize:15, margin:0, lineHeight:1.5 }}>{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comments/questions from the wider engagement system (e.g. a Moment tagged to this product). */}
                  <div style={{ marginTop:20 }}>
                    <div style={{ fontSize:15, fontWeight:800, marginBottom:10 }}>Maoni na maswali</div>
                    <CommerceCommentSection
                      entityType="product" entityId={product.id}
                      entityTitle={product.name} sellerId={product.seller?.id}
                      isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate}
                      activeProfileId={activeProfileId} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section style={{ padding:16, borderTop:`1px solid ${LINE}` }}>
            <h2 style={{ fontSize:18, fontWeight:800, margin:'0 0 12px' }}>Zaidi kutoka {sellerName}</h2>
            <div className="pd-scroll">{related.map(p => <MiniCard key={p.id} p={p} />)}</div>
          </section>
        )}
      </div>

      <div className="pd-sticky-bar">
        {product.isAvailable && (
          <div style={{ display:'flex', alignItems:'center', border:'1px solid #cfd9de', borderRadius:24, height:48, flexShrink:0 }}>
            <button type="button" aria-label={t('checkout.qty_less')} onClick={() => setQuantity(q => Math.max(1, q - 1))} style={stepBtn}>−</button>
            <span style={{ width:24, textAlign:'center', fontWeight:700, fontSize:15 }}>{quantity}</span>
            <button type="button" aria-label={t('checkout.qty_more')} onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} style={stepBtn}>+</button>
          </div>
        )}
        <button type="button" aria-label={t('product_detail.add_to_cart')} title={t('product_detail.add_to_cart')}
          onClick={handleAddToCart} disabled={!product.isAvailable}
          style={{ width:48, height:48, flexShrink:0, borderRadius:24, cursor: product.isAvailable ? 'pointer' : 'not-allowed',
            border: isInCart(product.id) ? 'none' : '1px solid #cfd9de', backgroundColor: isInCart(product.id) ? '#ecfdf3' : WH,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon d={isInCart(product.id) ? IC.check : IC.bagPlus} size={20} color={isInCart(product.id) ? '#166534' : DK} />
        </button>
        <button type="button" onClick={() => { handleAddToCart(); onNavigate('Checkout'); }} disabled={!product.isAvailable}
          style={{ ...pill(product.isAvailable ? B : '#cfd9de', product.isAvailable ? WH : GR), flex:1, height:48, fontSize:16, fontWeight:800,
            cursor: product.isAvailable ? 'pointer' : 'not-allowed' }}>
          {product.isAvailable ? `Agiza · TZS ${(displayPrice * quantity).toLocaleString('en-US')}` : t('product_detail.unavailable')}
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;
