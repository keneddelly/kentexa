/**
 * Services.js — Browse service marketplace
 * Place at: src/public/pages/Services.js
 *
 * Primary discovery page — search, filter by category, browse providers
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api     from '../../api/api';

const getCategories = (t) => [
  { value: '',              icon: '🔍', label: t('services_page.cat_all')         },
  { value: 'ufundi',        icon: '🔧', label: t('services_page.cat_ufundi_short')       },
  { value: 'usafi',         icon: '🧹', label: t('services_page.cat_usafi_short')        },
  { value: 'elimu',         icon: '📚', label: t('services_page.cat_elimu_short')        },
  { value: 'upishi',        icon: '👨‍🍳', label: t('services_page.cat_upishi_short')      },
  { value: 'usafirishaji',  icon: '🚗', label: t('services_page.cat_usafirishaji_short') },
  { value: 'afya',          icon: '🏥', label: t('services_page.cat_afya_short')         },
  { value: 'ubunifu',       icon: '🎨', label: t('services_page.cat_ubunifu_short')      },
  { value: 'matengenezo',   icon: '🔨', label: t('services_page.cat_matengenezo_short')  },
  { value: 'biashara',      icon: '💼', label: t('services_page.cat_biashara_short')     },
  { value: 'kilimo',        icon: '🌱', label: t('services_page.cat_kilimo_short')       },
  { value: 'nyumbani',      icon: '🏠', label: t('services_page.cat_nyumbani_short')     },
  { value: 'mengineyo',     icon: '📋', label: t('services_page.cat_mengineyo')    },
];

const getPriceLabels = (t) => ({
  per_hour:   t('services_page.price_per_hour_suffix'),
  per_job:    t('services_page.price_per_job_suffix'),
  per_day:    t('services_page.price_per_day_suffix'),
  negotiate:  t('services_page.price_negotiate_suffix'),
  free_quote: t('services_page.price_free_quote_suffix'),
});

const fmt = n => Number(n||0).toLocaleString();

const StarRating = ({ rating, size = 13 }) => (
  <span style={{ color: '#f59e0b', fontSize: size }}>
    {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
    <span style={{ color: '#94a3b8', marginLeft: 3 }}>{Number(rating).toFixed(1)}</span>
  </span>
);

const ServiceCard = ({ ad, onClick }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const PRICE_LABELS = getPriceLabels(t);
  return (
  <div onClick={onClick}
    style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s' }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37,99,235,0.12)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}>

    {/* Image / placeholder */}
    <div style={{ height: 160, backgroundColor: '#f1f5f9', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {ad.images?.[0]
        ? <img src={ad.images[0]} alt={ad.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => e.target.style.display = 'none'} />
        : <span style={{ fontSize: 52 }}>
            {CATEGORIES.find(c => c.value === ad.category)?.icon || '🔧'}
          </span>
      }
      {/* Available now badge */}
      {ad.isAvailableNow && (
        <span style={{ position: 'absolute', top: 8, left: 8,
          backgroundColor: '#16a34a', color: '#fff', fontSize: 10,
          fontWeight: 700, padding: '3px 8px', borderRadius: 100 }}>
          {t('services_page.available_now_badge')}
        </span>
      )}
      {/* Verified badge */}
      {ad.isVerified && (
        <span style={{ position: 'absolute', top: 8, right: 8,
          backgroundColor: '#1d4ed8', color: '#fff', fontSize: 10,
          fontWeight: 700, padding: '3px 8px', borderRadius: 100 }}>
          {t('services_page.verified_badge')}
        </span>
      )}
    </div>

    <div style={{ padding: '14px 16px' }}>
      {/* Category chip */}
      <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8',
        backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: 100 }}>
        {CATEGORIES.find(c => c.value === ad.category)?.label || ad.category}
      </span>

      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a',
        margin: '8px 0 4px', lineHeight: 1.3 }}>
        {ad.title}
      </div>

      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {ad.description}
      </div>

      {/* Provider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%',
          backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#475569' }}>
          {ad.provider?.name?.charAt(0)?.toUpperCase() || 'P'}
        </div>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
          {ad.provider?.name || t('services_page.default_provider_name')}
        </span>
      </div>

      {/* Rating + jobs */}
      {ad.totalJobs > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <StarRating rating={ad.rating} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {t('services_page.jobs_count', { count: ad.totalJobs })}
          </span>
        </div>
      )}

      {/* Price + location */}
      {/* Transport availability link */}
      {ad.category === 'usafirishaji' && (
        <div style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: '6px 10px',
          marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#1d4ed8',
          display: 'flex', alignItems: 'center', gap: 4 }}>
          {t('services_page.transport_verified_note')}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#1d4ed8' }}>
          {ad.priceType === 'negotiate' || ad.priceType === 'free_quote'
            ? <span style={{ fontSize: 13, color: '#64748b' }}>{PRICE_LABELS[ad.priceType]}</span>
            : <>TZS {fmt(ad.price)}<span style={{ fontSize: 11, color: '#94a3b8' }}>{PRICE_LABELS[ad.priceType]}</span></>
          }
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>📍 {ad.coverageCity}</span>
      </div>
    </div>
  </div>
  );
};

const Services = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const [ads,       setAds]       = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [category,  setCategory]  = useState('');
  const [query,     setQuery]     = useState('');
  const [city,      setCity]      = useState('');
  const [available, setAvailable] = useState(false);

  const fetchAds = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category)  params.set('category',  category);
      if (query)     params.set('q',         query);
      if (city)      params.set('city',      city);
      if (available) params.set('available', 'true');
      const res = await api.get(`/services?${params}&limit=24`);
      setAds(res.data?.ads || res.data || []);
      setTotal(res.data?.total || 0);
    } catch { setAds([]); }
    finally { setLoading(false); }
  }, [category, query, city, available]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 90,
      backgroundColor: '#f8fafc', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 200, backgroundColor: '#fff',
        borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center',
        gap: 12, padding: '12px 16px' }}>
        <button onClick={() => onNavigate('back')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#0F172A" strokeWidth="2.5">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#0F172A' }}>{t('services_page.page_title')}</div>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#1d4ed8 60%,#0891b2 100%)',
        padding: 'clamp(32px,5vw,56px) 16px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(24px,5vw,42px)', fontWeight: 900, color: '#fff',
            margin: '0 0 12px', letterSpacing: -0.5 }}>
            {t('services_page.hero_title_line1')}<br/>{t('services_page.hero_title_line2')}
          </h1>
          <p style={{ fontSize: 'clamp(13px,2vw,16px)', color: 'rgba(255,255,255,0.75)',
            margin: '0 0 28px' }}>
            {t('services_page.hero_desc')}
          </p>

          {/* Search bar */}
          <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 14,
            overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <span style={{ padding: '14px 16px', fontSize: 20 }}>🔍</span>
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchAds()}
              placeholder={t('services_page.search_placeholder')}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14,
                padding: '14px 0', fontFamily: 'inherit' }} />
            <input value={city} onChange={e => setCity(e.target.value)}
              placeholder={t('services_page.city_placeholder')}
              style={{ width: 120, border: 'none', outline: 'none', fontSize: 14,
                padding: '14px 12px', borderLeft: '1px solid #f1f5f9',
                fontFamily: 'inherit' }} />
            <button onClick={fetchAds}
              style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                padding: '14px 20px', cursor: 'pointer', fontSize: 14,
                fontWeight: 700, whiteSpace: 'nowrap' }}>
              {t('services_page.search_button')}
            </button>
          </div>

          {/* Quick filters */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap',
            justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
              padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
              fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={available}
                onChange={e => setAvailable(e.target.checked)}
                style={{ accentColor: '#60a5fa' }} />
              {t('services_page.available_now_filter')}
            </label>
          </div>
        </div>
      </div>

      {/* Category pills */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #f1f5f9',
        padding: '12px 16px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 1200, margin: '0 auto',
          width: 'max-content' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setCategory(c.value)}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 100, border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700,
                backgroundColor: category === c.value ? '#1d4ed8' : '#f1f5f9',
                color: category === c.value ? '#fff' : '#475569',
                transition: 'all 0.15s' }}>
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, maxWidth: 1200, margin: '0 auto',
        padding: '24px 16px 48px', width: '100%', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            {loading ? t('services_page.searching') : t('services_page.services_found', { count: total })}
          </div>
          {isLoggedIn && (
            <button onClick={() => onNavigate('PostService')}
              style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
                fontSize: 13, fontWeight: 700 }}>
              {t('services_page.post_service_button')}
            </button>
          )}
        </div>

        {category === 'usafirishaji' && (
          <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: '10px 16px',
            marginBottom: 16, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', border: '1px solid #bfdbfe' }}>
            <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
              {t('services_page.transport_verified_banner')}
            </span>
            <button onClick={() => onNavigate('TransportProviderDashboard')}
              style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>
              {t('services_page.today_trips_button')}
            </button>
          </div>
        )}
        {loading ? (
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ height: 160, backgroundColor: '#f1f5f9',
                  animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ padding: 16 }}>
                  {[80,60,40].map((w, j) => (
                    <div key={j} style={{ height: 12, backgroundColor: '#f1f5f9',
                      borderRadius: 6, marginBottom: 8, width: `${w}%`,
                      animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>
              {t('services_page.no_services_title')}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              {t('services_page.no_services_desc')}
            </div>
            {isLoggedIn && (
              <button onClick={() => onNavigate('PostService')}
                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none',
                  borderRadius: 12, padding: '12px 28px', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700 }}>
                {t('services_page.be_first_button')}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
            {ads.map(ad => (
              <ServiceCard key={ad.id} ad={ad}
                onClick={() => onNavigate(`ServiceDetail-${ad.id}`)} />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
};

export default Services;