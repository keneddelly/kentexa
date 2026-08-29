import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { trackProductView, trackAddToCart } from '../hooks/useAnalytics';
import { useCart } from '../../context/CartContext';
import SocialProofBadge from '../components/SocialProofBadge';
import WishlistHeart from '../components/WishlistHeart';
import CommerceCommentSection from '../components/CommerceCommentSection';
import { useTranslation } from 'react-i18next';

const CATEGORIES = {
  electronics: { icon: '📱' }, fashion: { icon: '👗' }, home_garden: { icon: '🏠' },
  health_beauty: { icon: '💄' }, food: { icon: '🍎' }, baby_kids: { icon: '🧸' },
  sports: { icon: '⚽' }, agriculture: { icon: '🌾' }, security: { icon: '🔒' },
  vehicles: { icon: '🚗' }, books: { icon: '📚' }, arts: { icon: '🎨' }, general: { icon: '📦' },
  property: { icon: '🏡' }, services: { icon: '🧾' }, pets: { icon: '🐾' },
  construction: { icon: '🧱' }, industrial: { icon: '🏭' },
  appliances: { icon: '🧊' }, musical_instruments: { icon: '🎸' }, flowers: { icon: '🌸' },
  jobs: { icon: '💼' }, energy: { icon: '☀️' }, tools_hardware: { icon: '🔧' },
  weddings_events: { icon: '💍' }, water_sanitation: { icon: '🚰' },
  office_supplies: { icon: '🖇️' }, collectibles: { icon: '🏺' },
  tickets_vouchers: { icon: '🎟️' }, free_giveaway: { icon: '🎁' },
  ebooks: { icon: '📖' }, software: { icon: '💻' }, online_courses: { icon: '🎓' },
  digital_services: { icon: '🛠️' }, music_media: { icon: '🎵' }, digital_general: { icon: '🗂️' },
};

const Stars = ({ rating, size = 12, interactive = false, onRate }) => (
  <span style={{ fontSize: size }}>
    {[1,2,3,4,5].map(i => (
      <span key={i}
        onClick={() => interactive && onRate && onRate(i)}
        style={{ color: i <= Math.round(rating) ? '#f59e0b' : '#e2e8f0', cursor: interactive ? 'pointer' : 'default' }}>★</span>
    ))}
  </span>
);

const ProductDetail = ({ onNavigate, isLoggedIn, onLogout, userRole, productId, track, currentUser, onOpenMoment, initialTab, activeProfileId }) => {
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

  const handleAddToCart = () => {
    if (!product?.isAvailable) return;
    addToCart(product, quantity);
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
      await api.post('/feed/publish', {
        type: 'moment',
        title: product.name,
        body: null,
        imageUrl: product.images?.[0] || null,
        linkedEntityType: 'product',
        linkedEntityId: product.id,
        commerceProfileId: activeProfileId || undefined,
      });
      setMessage('📸 Shared to your Moments!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(err?.response?.data?.message || 'Could not share — try again');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSharingMoment(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!reviewComment.trim()) { setReviewMessage(t('product_detail.write_comment_first')); return; }
    try {
      setSubmittingReview(true);
      await api.post(`/products/${productId}/reviews`, { rating: reviewRating, comment: reviewComment.trim() });
      setReviewMessage(`✅ ${t('product_detail.review_submitted')}`);
      setReviewComment('');
      setReviewRating(5);
      const revRes = await api.get(`/products/${productId}/reviews`).catch(() => ({ data: [] }));
      setReviews(revRes.data || []);
    } catch (err) {
      setReviewMessage(err?.response?.data?.message || t('product_detail.review_failed'));
    } finally { setSubmittingReview(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ textAlign: 'center', padding: '80px 16px', color: '#64748b' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>{t('product_detail.loading')}
      </div>
    </div>
  );

  if (!product) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ textAlign: 'center', padding: '80px 16px', color: '#64748b' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <p>{t('product_detail.not_found')}</p>
        <button onClick={() => onNavigate('Stores')} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', marginTop: 16 }}>{t('product_detail.back_to_stores')}</button>
      </div>
    </div>
  );

  const displayPrice  = Number(product.displayPrice || product.basePrice || product.price || 0);
  const basePrice     = Number(product.basePrice || product.price || 0);
  const originalPrice = basePrice > 0 ? Math.round(basePrice * 1.2) : 0;
  const discount      = originalPrice > displayPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;
  const catIcon       = CATEGORIES[product.category]?.icon || '📦';
  const hasSpecs      = product.specs && Object.keys(product.specs).length > 0;

  // Orders/labels the specs tab using the category's own AttributeDef
  // schema (displayOrder + label + unit) instead of an unordered raw key
  // dump. A spec whose key doesn't match any known attribute (legacy data,
  // or a category the schema fetch hasn't loaded yet) still renders —
  // just appended at the end, using its raw key as the label.
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
  // Prefer the BUSINESS CommerceProfile's own identity/numbers — falls
  // back to the seller's personal fields only when they have no business
  // profile yet, same as before this fix.
  const sellerRating = product.commerceProfile?.rating || product.seller?.rating || 4.5;
  const sellerName   = product.commerceProfile?.displayName || product.seller?.storeName || product.seller?.businessName || product.seller?.name || 'KenteXa Store';
  const sellerFollowers = product.commerceProfile?.followersCount ?? product.seller?.followersCount;
  const sellerPhoto = product.commerceProfile?.photoUrl || product.seller?.logo;
  const sellerNavParams = product.commerceProfile?.id ? { commerceProfileId: product.commerceProfile.id } : undefined;
  // Message-button-only variant — tags the resulting conversation to this
  // exact product (see ConversationService.getOrCreateConversationAsBuyer's
  // context param) so it shows up in the inbox with the product attached,
  // not just the business identity. Kept separate from sellerNavParams
  // above since that one is also used for plain "visit business profile"
  // navigation, where a product context wouldn't mean anything.
  const messageSellerNavParams = { ...sellerNavParams, contextType: 'product', contextId: product.id };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const tabs = [
    hasFeatures && { key: 'features',    label: `✨ ${t('product_detail.features')}` },
    hasSpecs    && { key: 'specs',       label: `📋 ${t('product_detail.specs')}` },
    { key: 'description', label: `📄 ${t('product_detail.details')}` },
    { key: 'recommended', label: `🔥 ${t('product_detail.you_may_like')}` },
    { key: 'reviews',     label: `⭐ ${t('product_detail.reviews')}${reviews.length > 0 ? ` (${reviews.length})` : ''}` },
  ].filter(Boolean);

  const ProductCard = ({ p }) => (
    <div onClick={() => onNavigate(`ProductDetail-${p.id}`)}
      style={{ minWidth: 0, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ width: '100%', height: 100, backgroundColor: '#f1f5f9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.images?.[0] ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>📦</span>}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#1d4ed8' }}>TZS {Number(p.displayPrice || p.basePrice || 0).toLocaleString()}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`
        .pd-root { max-width: 480px; margin: 0 auto; width: 100%; padding-bottom: 160px; }
        .pd-grid { display: block; }
        .pd-left { width: 100%; }
        .pd-right { width: 100%; }
        .pd-sticky-bar { position: fixed; bottom: calc(60px + env(safe-area-inset-bottom)); left: 0; right: 0; background: #fff; border-top: 1px solid #e2e8f0; padding: 10px 14px; display: flex; gap: 10px; align-items: center; z-index: 2000; box-shadow: 0 -4px 20px rgba(0,0,0,0.1); }
        .pd-scroll { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
        @media (min-width: 768px) {
          .pd-root { max-width: 1100px; padding-bottom: 0; }
          .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
          .pd-sticky-bar { position: static; box-shadow: none; border-top: none; padding: 0; margin: 16px auto 0; max-width: 1100px; width: 100%; box-sizing: border-box; flex-direction: column; }
          .pd-sticky-bar button { width: 100%; }
        }
        @media (min-width: 1024px) {
          .pd-grid { grid-template-columns: 1.1fr 0.9fr; gap: 36px; }
        }
      `}</style>

      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A', overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left' }}>{product.name}</span>
        </button>
        <button onClick={handleShare} title={t('share.button')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: '#0F172A', padding: '4px 8px', flexShrink:0, marginLeft:8 }}>
          🔗
        </button>
        <button onClick={() => onNavigate('Cart')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#1d4ed8', padding: '4px 0', flexShrink:0, marginLeft:12 }}>
          🛒 {t('product_detail.cart')}
        </button>
        {isLoggedIn && currentUser?.id === product.seller?.id && (
          <div style={{ position:'relative', flexShrink:0, marginLeft:8 }}>
            <button onClick={() => setShowMenu(s => !s)}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:18,
                color:'#0F172A', padding:'4px 6px' }}>
              ⋯
            </button>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)}
                  style={{ position:'fixed', inset:0, zIndex:150 }} />
                <div style={{ position:'absolute', top:'100%', right:0, marginTop:4,
                  backgroundColor:'#fff', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.15)',
                  overflow:'hidden', zIndex:151, minWidth:140 }}>
                  <button onClick={() => { setShowMenu(false); onNavigate(`EditProduct-${product.id}`); }}
                    style={{ width:'100%', textAlign:'left', background:'none', border:'none',
                      cursor:'pointer', padding:'12px 16px', fontSize:13, fontWeight:700,
                      color:'#0F172A' }}>
                    ✏️ Edit
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {message && (
        <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          ✅ {message}
        </div>
      )}

      <div className="pd-root" style={{ padding: '16px' }}>
        <div className="pd-grid">

          <div className="pd-left">
            <div style={{ position: 'relative', backgroundColor: '#fff' }}>
              <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', position: 'relative' }}>
                {product.images?.[selectedImage] ? (
                  <img src={product.images[selectedImage]} alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', fontSize: 80 }}>📦</div>
                )}
                {discount > 0 && (
                  <div style={{ position: 'absolute', top: 12, left: 12, backgroundColor: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20 }}>
                    -{discount}% {t('product_detail.off')}
                  </div>
                )}
                <div style={{ position: 'absolute', top: 10, right: 12, width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WishlistHeart entityType="product" entityId={product.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
                </div>
                {product.images?.length > 1 && (
                  <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                    {product.images.map((_, i) => (
                      <div key={i} onClick={() => setSelectedImage(i)}
                        style={{ width: i === selectedImage ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === selectedImage ? '#1d4ed8' : 'rgba(255,255,255,0.7)', cursor: 'pointer', transition: 'all 0.2s' }} />
                    ))}
                  </div>
                )}
              </div>
              {product.images?.length > 1 && (
                <div style={{ padding: '8px 12px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid #f1f5f9' }}>
                  {product.images.map((img, i) => (
                    <img key={i} src={img} alt="" onClick={() => setSelectedImage(i)}
                      style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: i === selectedImage ? '2px solid #1d4ed8' : '2px solid #e2e8f0', cursor: 'pointer' }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pd-right">

            <div style={{ backgroundColor: '#fff', padding: '14px 16px', marginBottom: 8, borderRadius: 12 }}>
              <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                  {catIcon} {product.category?.replace(/_/g,' ')}
                </span>
                {product.subcategory && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                    {product.subcategory?.replace(/_/g,' ')}
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', lineHeight: 1.5 }}>{product.name}</h1>
              {product.model && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                  {t('product_detail.model_label')}: {product.model}
                </div>
              )}
              <SocialProofBadge viewsToday={product.viewsToday} salesCount={product.salesCount} createdAt={product.createdAt} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Stars rating={avgRating || sellerRating} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{avgRating || sellerRating}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>· {product.salesCount || 0} {t('product_detail.sold')}</span>
                {reviews.length > 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>· {reviews.length} {t('product_detail.reviews')}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: '#1d4ed8' }}>TZS {displayPrice.toLocaleString()}</span>
                {discount > 0 && <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through' }}>TZS {originalPrice.toLocaleString()}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🚚 {t('product_detail.free_delivery')}</span>
                {product.estimatedDelivery && (
                  <span style={{ backgroundColor: '#f8fafc', color: '#64748b', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⏱ {product.estimatedDelivery}</span>
                )}
                {product.codEnabled && (
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, border: '1px solid #bfdbfe' }}>💵 {t('product_detail.cod_badge')}</span>
                )}
              </div>
              {product.codEnabled && (
                <div style={{ fontSize: 11, color: '#1d4ed8', marginBottom: 6 }}>
                  {t('product_detail.cod_terms_hint')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, backgroundColor: product.isAvailable ? '#dcfce7' : '#fee2e2', color: product.isAvailable ? '#16a34a' : '#dc2626' }}>
                  {product.isAvailable ? `✅ ${t('product_detail.in_stock')}` : `❌ ${t('product_detail.out_of_stock')}`}
                </span>
                {product.stock <= 10 && product.isAvailable && (
                  <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 700 }}>⚠️ {t('product_detail.only_left')} {product.stock}</span>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '12px 16px', marginBottom: 8, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <div onClick={() => product.seller?.id && onNavigate(`CommerceProfile-${product.seller.id}`, sellerNavParams)}
                  style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}>
                  {sellerPhoto ? <img src={sellerPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sellerName[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sellerName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Stars rating={sellerRating} size={10} />
                    {sellerFollowers != null && (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>· {sellerFollowers.toLocaleString()} {t('commerce_profile.stat_followers')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {product.seller?.id && currentUser?.id !== product.seller.id && (
                  <button onClick={() => onNavigate(`MessageSeller-${product.seller.id}`, messageSellerNavParams)}
                    style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0', padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    💬 {t('product_detail.message_seller')}
                  </button>
                )}
                <button onClick={() => product.seller?.id && onNavigate(`CommerceProfile-${product.seller.id}`, sellerNavParams)}
                  style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe', padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {t('product_detail.visit_store')}
                </button>
              </div>
            </div>

            {isLoggedIn && currentUser?.id === product.seller?.id && (
              <div style={{ backgroundColor: '#fff', padding: '0 16px 12px' }}>
                <button onClick={handleShareMoment} disabled={sharingMoment}
                  style={{ background:'none', border:'none', cursor: sharingMoment ? 'default' : 'pointer', padding:0,
                    color:'#2563EB', fontSize:12, fontWeight:700, opacity: sharingMoment ? 0.6 : 1 }}>
                  {sharingMoment ? '⏳ Sharing...' : '📸 Share as Moment'}
                </button>
              </div>
            )}

            <div style={{ backgroundColor: '#fff', padding: '12px 16px', marginBottom: 8, borderRadius: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { icon: '🛡️', text: t('product_detail.buyer_protection') },
                  { icon: '✅', text: t('product_detail.verified_seller') },
                  { icon: '↩️', text: t('product_detail.returns_policy') },
                  { icon: '💯', text: t('product_detail.genuine_product') },
                ].map(b => (
                  <div key={b.text} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: '#475569' }}>
                    {b.icon} {b.text}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', marginBottom: 8, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '2px solid #f1f5f9', scrollbarWidth: 'none' }}>
                {tabs.map(tb => (
                  <button key={tb.key} onClick={() => setTab(tb.key)}
                    style={{ flexShrink: 0, padding: '11px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: tab === tb.key ? '#1d4ed8' : '#64748b', borderBottom: tab === tb.key ? '3px solid #1d4ed8' : '3px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
                    {tb.label}
                  </button>
                ))}
              </div>

              <div style={{ padding: 16 }}>

                {tab === 'features' && hasFeatures && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {autoFeatures.map((f, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 12px', border: '1px solid #bfdbfe' }}>
                        <span style={{ fontSize: 16, flexShrink: 0, color: '#1d4ed8', fontWeight: 900 }}>✓</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'specs' && hasSpecs && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    {orderedSpecEntries.map(({ key, label, value }, i) => (
                      <div key={key} style={{ display: 'flex', backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <div style={{ flex: '0 0 45%', padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>{label}</div>
                        <div style={{ flex: 1, padding: '11px 14px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'description' && (
                  <div>
                    {product.description ? (
                      <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.8 }}>
                        {product.description.split('\n').map((line, i) => {
                          const trimmed = line.trim();
                          if (!trimmed) return <div key={i} style={{ height: 8 }} />;
                          if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
                            return <div key={i} style={{ fontWeight: 800, color: '#0f172a', fontSize: 13, marginTop: 14, marginBottom: 4 }}>{trimmed}</div>;
                          }
                          if (trimmed.startsWith('-')) {
                            return (
                              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                                <span style={{ color: '#1d4ed8', fontWeight: 900, flexShrink: 0, marginTop: 1 }}>•</span>
                                <span>{trimmed.substring(1).trim()}</span>
                              </div>
                            );
                          }
                          return <p key={i} style={{ margin: '0 0 8px' }}>{trimmed}</p>;
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>{t('product_detail.no_description')}</p>
                    )}
                  </div>
                )}

                {tab === 'recommended' && (
                  <div>
                    {recommended.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>{t('product_detail.no_recommendations')}</p>
                    ) : (
                      <div className="pd-scroll">
                        {recommended.map(p => <ProductCard key={p.id} p={p} />)}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'reviews' && (
                  <div>
                    {reviews.length > 0 && (
                      <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a' }}>{avgRating}</div>
                          <Stars rating={Number(avgRating)} size={16} />
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{reviews.length} {t('product_detail.reviews')}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          {[5,4,3,2,1].map(star => {
                            const count = reviews.filter(r => r.rating === star).length;
                            const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                            return (
                              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: '#64748b', width: 8 }}>{star}</span>
                                <span style={{ fontSize: 10, color: '#f59e0b' }}>★</span>
                                <div style={{ flex: 1, height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#f59e0b', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 10, color: '#94a3b8', width: 16 }}>{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                        ✍️ {isLoggedIn ? t('product_detail.write_review') : t('product_detail.login_to_review')}
                      </div>
                      {isLoggedIn ? (
                        <>
                          {reviewMessage && (
                            <div style={{ fontSize: 12, color: reviewMessage.startsWith('✅') ? '#16a34a' : '#dc2626', marginBottom: 8, fontWeight: 600 }}>
                              {reviewMessage}
                            </div>
                          )}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('product_detail.your_rating')}</div>
                            <Stars rating={reviewRating} size={28} interactive onRate={setReviewRating} />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{t('product_detail.your_comment')}</div>
                            <textarea
                              placeholder={t('product_detail.comment_placeholder')}
                              value={reviewComment}
                              onChange={e => setReviewComment(e.target.value)}
                              rows={3}
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                            />
                          </div>
                          <button onClick={handleSubmitReview} disabled={submittingReview}
                            style={{ width: '100%', padding: '10px', background: submittingReview ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: submittingReview ? 'not-allowed' : 'pointer' }}>
                            {submittingReview ? `⏳ ${t('product_detail.submitting')}` : `⭐ ${t('product_detail.submit_review')}`}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => onNavigate('PublicLogin')}
                          style={{ width: '100%', padding: 10, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          🔐 {t('product_detail.login_to_review_btn')}
                        </button>
                      )}
                    </div>

                    {reviews.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>{t('product_detail.no_reviews')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {reviews.map((r, i) => (
                          <div key={i} style={{ backgroundColor: '#fff', borderRadius: 10,
                            padding: '12px 14px',
                            border: r.isVerifiedPurchase ? '1px solid #86efac' : '1px solid #f1f5f9' }}>
                            {r.isVerifiedPurchase && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#16a34a',
                                backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: 100,
                                marginBottom: 6, display: 'inline-block' }}>
                                ✅ Manunuzi Halisi
                              </span>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>
                                  {r.reviewer?.name?.[0] || r.reviewer?.email?.[0] || '?'}
                                </div>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{r.reviewer?.name || 'Customer'}</div>
                                  <Stars rating={r.rating} size={11} />
                                </div>
                              </div>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                            <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.6 }}>{r.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comments/questions from the wider engagement system —
                        e.g. left via a Moment tagged to this product. This
                        used to have nowhere to show at all, so a "New
                        comment" notification about this product landed here
                        with no way to actually see or reply to it. */}
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                        💬 Comments & Questions
                      </div>
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
        </div>

        {related.length > 0 && (
          <div style={{ backgroundColor: '#fff', padding: 16, marginBottom: 8, borderRadius: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>🛍️ {t('product_detail.more_from_store')}</h3>
            <div className="pd-scroll">
              {related.map(p => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        )}
      </div>

      <div className="pd-sticky-bar">
        {product.isAvailable && (
          <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: 36, height: 44, background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>−</button>
            <span style={{ width: 36, textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} style={{ width: 36, height: 44, background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>+</button>
          </div>
        )}
        <button onClick={handleAddToCart} disabled={!product.isAvailable}
          style={{ flex: 1, background: !product.isAvailable ? '#e2e8f0' : isInCart(product.id) ? '#16a34a' : '#eff6ff', color: !product.isAvailable ? '#94a3b8' : isInCart(product.id) ? '#fff' : '#1d4ed8', border: isInCart(product.id) ? 'none' : '1.5px solid #bfdbfe', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: product.isAvailable ? 'pointer' : 'not-allowed' }}>
          {!product.isAvailable ? t('product_detail.out_of_stock') : isInCart(product.id) ? `✅ ${t('product_detail.added_to_cart')}` : `🛒 ${t('product_detail.add_to_cart')}`}
        </button>
        <button onClick={() => { handleAddToCart(); onNavigate('Checkout'); }} disabled={!product.isAvailable}
          style={{ flex: product.isAvailable ? 2 : 1, background: !product.isAvailable ? '#e2e8f0' : 'linear-gradient(135deg,#ea580c,#f97316)', color: product.isAvailable ? '#fff' : '#94a3b8', border: 'none', padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: product.isAvailable ? 'pointer' : 'not-allowed', boxShadow: product.isAvailable ? '0 4px 12px rgba(234,88,12,0.35)' : 'none' }}>
          {product.isAvailable ? `⚡ ${t('product_detail.buy_now')} · TZS ${(displayPrice * quantity).toLocaleString()}` : t('product_detail.unavailable')}
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;