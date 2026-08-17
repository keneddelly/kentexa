/**
 * Stores.js — Discover Businesses (KenteXa social-commerce directory)
 * Place at: src/public/pages/Stores.js
 *
 * Same visual language as HomeFeed/Search: cover+avatar cards, reputation
 * badges, inline Follow buttons with real state, category pills, featured
 * row up top. Replaces the old plain marketplace grid.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReputationBadge from '../components/ReputationBadge';
import api              from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const fmt = n => Number(n||0).toLocaleString();

const getCategories = (t) => [
  { key: 'all',         label: t('stores.cat_all'),         icon: '🏪' },
  { key: 'electronics', label: t('stores.cat_electronics'), icon: '📱' },
  { key: 'fashion',     label: t('stores.cat_fashion'),     icon: '👗' },
  { key: 'food',        label: t('stores.cat_food'),        icon: '🍽️' },
  { key: 'hardware',    label: t('stores.cat_hardware'),    icon: '🔧' },
  { key: 'beauty',      label: t('stores.cat_beauty'),      icon: '💄' },
  { key: 'furniture',   label: t('stores.cat_furniture'),   icon: '🛋️' },
  { key: 'wholesale',   label: t('stores.cat_wholesale'),   icon: '📦' },
  { key: 'services',    label: t('stores.cat_services'),    icon: '⚙️' },
];

const REGIONS = [
  'All Regions', 'Dar es Salaam', 'Arusha', 'Mwanza', 'Dodoma', 'Morogoro',
  'Tanga', 'Mbeya', 'Songwe', 'Kilimanjaro', 'Kagera',
  'Pwani', 'Iringa', 'Ruvuma', 'Mtwara', 'Lindi',
];

// ── Store card (feed-style: cover, avatar overlap, inline Follow) ─────────────
const StoreCard = ({ seller, onNavigate, isLoggedIn, large }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const name     = seller.storeName || seller.businessName || 'Store';
  const initial  = name[0]?.toUpperCase() || '?';
  const rating   = Number(seller.rating || 0);
  const repScore = seller.reputationScore || 0;

  const [followed, setFollowed] = useState(!!seller.isFollowing);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => { setFollowed(!!seller.isFollowing); }, [seller.isFollowing]);

  const sellerId = seller.userId || seller.id;

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      setBusy(true);
      const res = await api.post(`/stores/${sellerId}/follow`);
      setFollowed(res.data.following ?? !followed);
    } catch {}
    finally { setBusy(false); }
  };

  return (
    <div onClick={() => sellerId && onNavigate(`CommerceProfile-${sellerId}`)}
      style={{ backgroundColor: WH, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.07)', cursor: 'pointer',
        border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column' }}>

      {/* Cover */}
      <div style={{ height: large ? 96 : 72, position: 'relative',
        background: seller.coverImage
          ? `url(${seller.coverImage}) center/cover`
          : 'linear-gradient(135deg,#1E1B4B,#1D4ED8,#7C3AED)',
        flexShrink: 0 }}>
        {seller.isOfficialStore && (
          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 9,
            backgroundColor: '#FBBF24', color: '#1E293B', padding: '2px 8px',
            borderRadius: 100, fontWeight: 800 }}>✓ OFFICIAL</span>
        )}
        <div style={{ position: 'absolute', bottom: -20, left: 12,
          width: large ? 52 : 44, height: large ? 52 : 44, borderRadius: 14,
          border: '3px solid #fff', backgroundColor: WH, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          {seller.logo ? (
            <img src={seller.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => e.target.style.display = 'none'} />
          ) : (
            <div style={{ width: '100%', height: '100%',
              background: `linear-gradient(135deg,${B},#7C3AED)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: large ? 22 : 18, fontWeight: 900, color: WH }}>
              {initial}
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '28px 12px 14px', flex: 1, display: 'flex',
        flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: DK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          {seller.isVerified && (
            <span style={{ fontSize: 11, color: B, fontWeight: 900, flexShrink: 0 }}>✓</span>
          )}
        </div>

        {seller.storeTagline && (
          <div style={{ fontSize: 11, color: GR, marginBottom: 6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {seller.storeTagline}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {seller.businessCategory && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
              borderRadius: 100, backgroundColor: '#EFF6FF', color: B }}>
              {CATEGORIES.find(c => c.key === seller.businessCategory)?.icon || '🏪'}{' '}
              {seller.businessCategory}
            </span>
          )}
          {(seller.city || seller.district || seller.region) && (
            <span style={{ fontSize: 9, color: GR, padding: '2px 8px',
              borderRadius: 100, backgroundColor: '#F8FAFC' }}>
              📍 {seller.district || seller.city || seller.region}
            </span>
          )}
          {seller.verificationTier === 'verified_business' && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
              borderRadius: 100, backgroundColor: '#FEF3C7', color: '#B45309' }}>
              🏆 {t('stores.tier_verified_business')}
            </span>
          )}
          {seller.verificationTier === 'verified_seller' && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
              borderRadius: 100, backgroundColor: '#DCFCE7', color: '#16A34A' }}>
              ✅ {t('stores.tier_verified_seller')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {rating > 0 && (
              <span style={{ fontSize: 11, color: '#D97706', fontWeight: 700 }}>
                ⭐ {rating.toFixed(1)}
              </span>
            )}
            {repScore > 0 && <ReputationBadge score={repScore} size="xs" />}
          </div>
          {seller.completedOrders > 0 && (
            <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 700 }}>
              ✅ {fmt(seller.completedOrders)} {t('stores.sold_suffix')}
            </div>
          )}
        </div>

        {/* Inline Follow — pushed to bottom of card */}
        <button onClick={handleFollow} disabled={busy}
          style={{ marginTop: 'auto', width: '100%', padding: '8px 0', border: 'none',
            borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
            fontSize: 12, fontWeight: 800,
            backgroundColor: followed ? '#F1F5F9' : B,
            color: followed ? DK : WH, transition: 'all 0.15s' }}>
          {followed ? t('stores.following_button') : t('stores.follow_button')}
        </button>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Stores = ({ onNavigate, isLoggedIn, userRole }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('all');
  const [region,   setRegion]   = useState('all');
  const [sortBy,   setSortBy]   = useState('newest');

  useEffect(() => {
    api.get('/seller/public/all')
      .then(r => setSellers(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = sellers.filter(s => {
    const name = (s.storeName || s.businessName || '').toLowerCase();
    const tag  = (s.storeTagline || '').toLowerCase();
    const cat  = (s.businessCategory || '').toLowerCase();
    const q    = search.toLowerCase();

    const matchSearch   = !search || name.includes(q) || tag.includes(q) || cat.includes(q);
    const matchCategory = category === 'all' || s.businessCategory === category;
    const matchRegion   = region === 'all' ||
      (s.region   || '').toLowerCase().includes(region.toLowerCase()) ||
      (s.city     || '').toLowerCase().includes(region.toLowerCase()) ||
      (s.district || '').toLowerCase().includes(region.toLowerCase());

    return matchSearch && matchCategory && matchRegion;
  }).sort((a, b) => {
    if (sortBy === 'rating')  return (b.rating || 0) - (a.rating || 0);
    if (sortBy === 'orders')  return (b.completedOrders || 0) - (a.completedOrders || 0);
    return 0; // newest — API returns newest first
  });

  // Featured row: top 6 by reputation, only shown on the unfiltered default view
  const isDefaultView = !search && category === 'all' && region === 'all';
  const featured = [...sellers]
    .sort((a, b) => (b.reputationScore || 0) - (a.reputationScore || 0))
    .slice(0, 6);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAFA',
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 200, backgroundColor: WH,
        borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center',
        gap: 12, padding: '12px 16px' }}>
        <button onClick={() => onNavigate('back')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={DK} strokeWidth="2.5">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 900, color: DK }}>{t('stores.page_title')}</div>
      </div>

      {/* Header banner */}
      <div style={{ background: 'linear-gradient(135deg,#1E1B4B,#1D4ED8,#7C3AED)',
        padding: '22px 16px 20px', color: WH }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
          marginBottom: 4 }}>{t('stores.directory_eyebrow')}</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
          {t('stores.page_title')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {t('stores.verified_stores_count', { count: sellers.length })}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 90px',
        boxSizing: 'border-box' }}>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%',
            transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
          <input type="text"
            placeholder={t('stores.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 14,
              border: '1px solid #E2E8F0', fontSize: 14, outline: 'none',
              boxSizing: 'border-box', backgroundColor: WH,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }} />
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto',
          marginBottom: 10, paddingBottom: 2, scrollbarWidth: 'none' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 100,
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                backgroundColor: category === c.key ? B : WH,
                color: category === c.key ? WH : GR,
                boxShadow: category === c.key ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'all 0.15s' }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Region + sort row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <select value={region} onChange={e => setRegion(e.target.value === 'All Regions' ? 'all' : e.target.value)}
            style={{ flex: 1, padding: '9px 10px', borderRadius: 10,
              border: '1px solid #E2E8F0', fontSize: 12, outline: 'none',
              backgroundColor: WH, color: region === 'all' ? '#94A3B8' : DK }}>
            {REGIONS.map(r => (
              <option key={r} value={r}>{r === 'All Regions' ? `📍 ${t('stores.all_regions')}` : r}</option>
            ))}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ flexShrink: 0, fontSize: 12, padding: '9px 10px', borderRadius: 10,
              border: '1px solid #E2E8F0', outline: 'none', color: GR, backgroundColor: WH }}>
            <option value="newest">{t('stores.sort_newest')}</option>
            <option value="rating">{t('stores.sort_rating')}</option>
            <option value="orders">{t('stores.sort_orders')}</option>
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: 220, backgroundColor: WH,
                borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} />
            ))}
          </div>
        ) : sellers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: DK, marginBottom: 8 }}>
              {t('stores.no_stores_title')}
            </div>
            <div style={{ fontSize: 13, color: GR }}>
              {t('stores.no_stores_desc')}
            </div>
          </div>
        ) : (
          <>
            {/* Featured row — only on default/unfiltered view */}
            {isDefaultView && featured.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: DK, marginBottom: 12 }}>
                  {t('stores.top_rated_title')}
                </div>
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto',
                  paddingBottom: 4, scrollbarWidth: 'none' }}>
                  {featured.map(s => (
                    <div key={s.id} style={{ width: 200, flexShrink: 0 }}>
                      <StoreCard seller={s} onNavigate={onNavigate} isLoggedIn={isLoggedIn} large />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full grid */}
            <div style={{ fontSize: 13, fontWeight: 800, color: DK, marginBottom: 12 }}>
              {isDefaultView ? t('stores.all_businesses') : t('stores.results_count', { count: filtered.length })}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: DK, marginBottom: 8 }}>
                  {t('stores.no_matches_title')}
                </div>
                <div style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
                  {t('stores.no_matches_desc')}
                </div>
                <button onClick={() => { setSearch(''); setCategory('all'); setRegion('all'); }}
                  style={{ backgroundColor: B, color: WH, border: 'none',
                    padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 13, fontWeight: 700 }}>
                  {t('stores.show_all_button')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
                {filtered.map(s => (
                  <StoreCard key={s.id} seller={s} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`::-webkit-scrollbar { display: none }`}</style>
    </div>
  );
};

export default Stores;