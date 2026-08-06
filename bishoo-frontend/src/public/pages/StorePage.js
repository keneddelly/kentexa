import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import api from '../../api/api';
import BackBar          from '../components/BackBar';
import ReputationBadge from '../components/ReputationBadge';

const StorePage = ({ onNavigate, isLoggedIn, onLogout, userRole, sellerId }) => {
  const { t } = useTranslation();
  const [seller, setSeller]     = useState(null);
  const [products, setProducts] = useState([]);
  const [storeClassifieds, setStoreClassifieds] = useState([]);
  const [loading, setLoading]   = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [error, setError]       = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy]     = useState('newest');
  const [following, setFollowing] = useState(false);

  useEffect(() => { fetchStore(); }, [sellerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStore = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/stores/${sellerId}`);
      setSeller({ ...res.data.seller, reviews: res.data.reviews });
      setProducts(res.data.products || []);
      setStoreClassifieds(res.data.classifieds || []);
      setFollowing(res.data.isFollowing || false);
    } catch (err) {
      setError(t('store_page.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    const url = window.location.origin + `/Store-${sellerId}`;
    if (navigator.share) {
      navigator.share({ title: seller?.name || t('store_page.default_share_title'), url });
    } else {
      navigator.clipboard.writeText(url);
      alert(t('store_page.link_copied'));
    }
  };

  const handleFollow = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const res = await api.post(`/stores/${sellerId}/follow`);
      setFollowing(res.data.following);
    } catch (err) {
      console.error('Follow failed', err);
    }
  };

  // Derived stats (placeholders where backend data not yet tracked)
  const stats = {
    totalProducts:  products.length,
    followers:      seller?.followersCount ?? 0,
    ordersCompleted: seller?.completedOrders ?? 0,
    rating:         seller?.rating ?? 0,
    reviewsCount:   seller?.reviewsCount ?? 0,
    responseRate:   seller?.responseRate ?? 95,
    memberSince:    seller?.createdAt ? new Date(seller.createdAt).getFullYear() : '—',
  };

  const isOfficial = seller?.isOfficialStore || false;
  const isVerified = seller?.isVerified || false;

  // Categories from products
  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];

  // Filter + sort
  let visibleProducts = category === 'all' ? products : products.filter(p => p.category === category);
  visibleProducts = [...visibleProducts].sort((a, b) => {
    if (sortBy === 'price_low')  return Number(a.displayPrice || a.basePrice) - Number(b.displayPrice || b.basePrice);
    if (sortBy === 'price_high') return Number(b.displayPrice || b.basePrice) - Number(a.displayPrice || a.basePrice);
    if (sortBy === 'popular')    return (b.salesCount || 0) - (a.salesCount || 0);
    return new Date(b.createdAt) - new Date(a.createdAt); // newest
  });

  const featuredProducts = products.filter(p => p.isFeatured || p.isBestSeller || p.isNewArrival || p.isRecommended);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentPage="Store" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>⏳ {t('store_page.loading')}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="Store" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      <BackBar onBack={() => onNavigate('Stores')} title={seller?.storeName || seller?.name || t('store_page.default_store_name')} />

      {/* ===================== COVER BANNER ===================== */}
      <div style={{
        height: 'clamp(140px, 22vw, 280px)',
        background: isOfficial
          ? 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#3b82f6)'
          : 'linear-gradient(135deg,#334155,#1e293b)',
        backgroundImage: seller?.coverImage ? `url(${seller.coverImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {isOfficial && (
          <div style={{ position: 'absolute', top: 12, right: 12, backgroundColor: '#f59e0b', color: '#fff', padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 900, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            {t('store_page.official_badge')}
          </div>
        )}
      </div>

      {/* ===================== STORE HEADER ===================== */}
      <div style={{ backgroundColor: '#fff', padding: '0 16px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', maxWidth: '100%' }}>
        <div style={{ display: 'flex', gap: 14, marginTop: -36 }}>
          {/* Logo */}
          <div style={{
            width: 80, height: 80, borderRadius: 16, backgroundColor: '#fff',
            border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 900, color: '#1d4ed8', flexShrink: 0,
            overflow: 'hidden', position: 'relative',
          }}>
            {seller?.logo
              ? <img src={seller.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4, boxSizing: 'border-box', backgroundColor: '#fff' }} />
              : (seller?.name?.[0] || '🏪')
            }
          </div>

          <div style={{ flex: 1, paddingTop: 40, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 19, fontWeight: 900, color: '#0f172a', margin: 0, fontFamily: 'Manrope,sans-serif' }}>
                {seller?.storeName || seller?.name || t('store_page.default_store_name')}
              </h1>
              {isVerified && <span title={t('store_page.verified_seller_title')} style={{ fontSize: 16 }}>✅</span>}
              {seller?.reputationScore > 0 && (
                <ReputationBadge score={seller.reputationScore} size="sm" />
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {seller?.storeTagline || (isOfficial ? t('store_page.official_tagline') : t('store_page.marketplace_tagline'))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={handleFollow}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: following ? '2px solid #1d4ed8' : 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, backgroundColor: following ? '#fff' : '#1d4ed8', color: following ? '#1d4ed8' : '#fff' }}>
            {following ? t('store_page.following_button') : t('store_page.follow_button')}
          </button>
          <button onClick={handleShare}
            style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid #e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 700, backgroundColor: '#fff', color: '#64748b' }}>
            {t('store_page.share_button')}
          </button>
          {isLoggedIn && (
            <button onClick={() => {
              // Create conversation with this seller's store
              // Navigate to a public message form
              onNavigate(`MessageSeller-${seller?.id}`);
            }}
              style={{ padding: '10px 16px', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 800,
                backgroundColor: '#1d4ed8', color: '#fff' }}>
              {t('store_page.message_button')}
            </button>
          )}
          {seller?.phone && (
            <a href={`https://wa.me/${seller.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
              style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, backgroundColor: '#16a34a', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('store_page.whatsapp_button')}
            </a>
          )}
        </div>

        {/* Categories chips (product type) */}
        {products.length > 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12 }}>
            {[...new Set(products.map(p => p.category).filter(Boolean))].map(c => c.replace(/_/g,' ')).join(' • ')}
          </div>
        )}
      </div>

      {/* ===================== TRUST BADGES ===================== */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {isVerified && <Badge icon="✅" label={t('store_page.badge_verified')} color="#16a34a" />}
          {isOfficial && <Badge icon="🏆" label={t('store_page.badge_official')} color="#f59e0b" />}
          {stats.ordersCompleted > 100 && <Badge icon="⭐" label={t('store_page.badge_top_seller')} color="#7c3aed" />}
          {seller?.fastShipping && <Badge icon="🚀" label={t('store_page.badge_fast_shipping')} color="#0284c7" />}
          <Badge icon="🛡️" label={t('store_page.badge_protected')} color="#1d4ed8" />
        </div>
      </div>

      {/* ===================== STATS ROW ===================== */}
      <div style={{ padding: '4px 16px 14px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4, textAlign: 'center' }}>
          <Stat value={stats.totalProducts} label={t('store_page.stat_products')} />
          <Stat value={stats.followers} label={t('store_page.stat_followers')} />
          <Stat value={stats.ordersCompleted} label={t('store_page.stat_orders')} />
          <Stat value={stats.reviewsCount} label={t('store_page.stat_reviews')} />
          <Stat value={stats.rating ? `${stats.rating}★` : '—'} label={t('store_page.stat_rating')} />
        </div>
      </div>

      {/* ===================== STORE INFO ===================== */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>{t('store_page.store_info_title')}</h3>
          {seller?.storeDescription && (
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 12px' }}>{seller.storeDescription}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#475569' }}>
            {seller?.businessLocation && <InfoRow icon="📍" text={seller.businessLocation} />}
            {seller?.businessHours    && <InfoRow icon="🕐" text={t('store_page.open_prefix', { hours: seller.businessHours })} />}
            <InfoRow icon="🚚" text={t('store_page.ships_nationwide')} />
            {seller?.pickupAvailable && <InfoRow icon="🏬" text={t('store_page.pickup_available')} />}
            <InfoRow icon="📅" text={t('store_page.member_since', { year: stats.memberSince })} />
            <InfoRow icon="💬" text={t('store_page.response_rate', { rate: stats.responseRate })} />
          </div>
        </div>
      </div>

      {/* ===================== DELIVERY ===================== */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, border: '1px solid #bfdbfe' }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>{t('store_page.delivery_title')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#1e40af' }}>
            <div>{t('store_page.ships_nationwide_check')}</div>
            <div>{t('store_page.buyer_protection_check')}</div>
            {seller?.freeDelivery     && <div>{t('store_page.free_delivery_check')}</div>}
            {seller?.pickupAvailable  && <div>{t('store_page.pickup_available_check')}</div>}
          </div>
        </div>
      </div>

      {/* ===================== FEATURED PRODUCTS ===================== */}
      {featuredProducts.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>{t('store_page.featured_title')}</h3>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {featuredProducts.map(p => (
              <ProductCard key={p.id} product={p} onNavigate={onNavigate} featured />
            ))}
          </div>
        </div>
      )}

      {/* ===================== PROMOTIONS ===================== */}
      {seller?.activePromotion && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ background: 'linear-gradient(135deg,#dc2626,#ea580c)', borderRadius: 14, padding: 16, color: '#fff' }}>
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>🔥 {seller.activePromotion.title}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{seller.activePromotion.description}</div>
          </div>
        </div>
      )}

      {/* ===================== PRODUCT FILTERS ===================== */}
      <div style={{ padding: '0 16px 10px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>
          {t('store_page.all_products_title', { count: visibleProducts.length })}
        </h3>

        {/* Category chips */}
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', backgroundColor: category === c ? '#1d4ed8' : '#fff', color: category === c ? '#fff' : '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {c === 'all' ? t('store_page.category_all') : c.replace(/_/g,' ')}
              </button>
            ))}
          </div>
        )}

        {/* Sort */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', backgroundColor: '#fff' }}>
            <option value="newest">{t('store_page.sort_newest')}</option>
            <option value="price_low">{t('store_page.sort_price_low')}</option>
            <option value="price_high">{t('store_page.sort_price_high')}</option>
            <option value="popular">{t('store_page.sort_popular')}</option>
          </select>
        </div>
      </div>

      {/* ===================== PRODUCT GRID ===================== */}
      <div style={{ padding: '0 16px 20px' }}>
        {visibleProducts.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            {t('store_page.no_products')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {visibleProducts.map(p => <ProductCard key={p.id} product={p} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* ===================== GALLERY ===================== */}
      {seller?.galleryImages?.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>{t('store_page.gallery_title')}</h3>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
            {seller.galleryImages.map((img, i) => (
              <img key={i} src={img} alt={`gallery-${i}`} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
            ))}
          </div>
        </div>
      )}

      
      {/* ===================== CLASSIFIEDS ===================== */}
      {storeClassifieds && storeClassifieds.length > 0 && (
        <div style={{ margin: '0 16px 16px', backgroundColor: '#fff',
          borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginBottom: 14 }}>
            {t('store_page.classifieds_title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {storeClassifieds.map(c => (
              <div key={c.id} onClick={() => onNavigate(`ClassifiedDetail-${c.id}`)}
                style={{ display: 'flex', gap: 12, cursor: 'pointer',
                  padding: '10px 0', borderBottom: '1px solid #f1f5f9',
                  alignItems: 'center' }}>
                {c.images?.[0] ? (
                  <img src={c.images[0]} alt=""
                    style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 10,
                    backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📦</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.title}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
                    TZS {Number(c.price).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>📍 {c.location || '—'}</div>
                </div>
                <span style={{ fontSize: 20, color: '#94a3b8' }}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

{/* ===================== REVIEWS ===================== */}
      <div style={{ padding: '0 16px 24px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 10px', fontFamily: 'Manrope,sans-serif' }}>
          {t('store_page.reviews_title')}{stats.reviewsCount > 0 && t('store_page.reviews_count', { count: stats.reviewsCount })}
        </h3>
        {(!seller?.reviews || seller.reviews.length === 0) ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            {t('store_page.no_reviews')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seller.reviews.slice(0, 5).map((r, i) => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#f59e0b', fontSize: 13 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(r.date).toLocaleDateString()}</span>
                </div>
                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 6px' }}>{r.comment}</p>
                {r.verified && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>{t('store_page.verified_purchase')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

// ===================== Helper components =====================

const Badge = ({ icon, label, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 20, backgroundColor: `${color}15`, color, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
    <span>{icon}</span>{label}
  </div>
);

const Stat = ({ value, label }) => (
  <div>
    <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{value}</div>
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{label}</div>
  </div>
);

const InfoRow = ({ icon, text }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>{icon}</span><span>{text}</span>
  </div>
);

const ProductCard = ({ product, onNavigate, featured }) => {
  const { t } = useTranslation();
  const price = Number(product.displayPrice || product.basePrice || 0);
  const badge =
    product.isBestSeller ? { label: t('store_page.badge_best_seller'), color: '#dc2626' } :
    product.isNewArrival ? { label: t('store_page.badge_new'), color: '#16a34a' } :
    product.isRecommended ? { label: t('store_page.badge_recommended'), color: '#1d4ed8' } :
    product.isFeatured ? { label: t('store_page.badge_featured'), color: '#f59e0b' } : null;

  return (
    <div onClick={() => onNavigate(`ProductDetail-${product.id}`)}
      style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: 'pointer', flexShrink: featured ? 0 : undefined, width: featured ? 140 : undefined, position: 'relative' }}>
      {badge && (
        <div style={{ position: 'absolute', top: 6, left: 6, backgroundColor: badge.color, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, zIndex: 1 }}>
          {badge.label}
        </div>
      )}
      <div style={{ width: '100%', paddingTop: featured ? '75%' : '100%', backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
        {product.images?.[0]
          ? <img src={product.images[0]} alt={product.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', top: 0, left: 0 }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, position: 'absolute', top: 0, left: 0 }}>📦</div>
        }
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8', marginTop: 2 }}>TZS {price.toLocaleString()}</div>
        {Number(product.deliveryFee) === 0 && <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>{t('store_page.free_delivery_label')}</div>}
      </div>
    </div>
  );
};

export default StorePage;