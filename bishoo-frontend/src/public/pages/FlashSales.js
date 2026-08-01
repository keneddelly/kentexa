/**
 * FlashSales.js — Browse active flash sales with countdown timers
 * Place at: src/public/pages/FlashSales.js
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar        from '../components/Navbar';
import BackBar       from '../components/BackBar';
import Footer        from '../components/Footer';
import WishlistHeart from '../components/WishlistHeart';
import api           from '../../api/api';

const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const fmt = n => Number(n||0).toLocaleString();

// ── Countdown timer hook ──────────────────────────────────────────────────────
const useCountdown = (endsAt) => {
  const calc = () => {
    const diff = new Date(endsAt) - Date.now();
    if (diff <= 0) return { h:0, m:0, s:0, expired:true };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, expired:false };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [endsAt]); // eslint-disable-line
  return time;
};

// ── Countdown display ─────────────────────────────────────────────────────────
const Countdown = ({ endsAt, size = 'md' }) => {
  const { t } = useTranslation();
  const { h, m, s, expired } = useCountdown(endsAt);
  const big  = size === 'lg';
  const pad  = n => String(n).padStart(2, '0');

  if (expired) return (
    <span style={{ fontSize: big ? 14 : 11, fontWeight: 800, color: '#DC2626' }}>
      {t('flash_sales.expired')}
    </span>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: big ? 6 : 4 }}>
      {[
        { val: h, label: t('flash_sales.hours_label') },
        { val: m, label: t('flash_sales.minutes_label') },
        { val: s, label: t('flash_sales.seconds_label') },
      ].map(({ val, label }, i) => (
        <React.Fragment key={label}>
          {i > 0 && <span style={{ color: '#DC2626', fontWeight: 900,
            fontSize: big ? 18 : 13 }}>:</span>}
          <div style={{ textAlign: 'center' }}>
            <div style={{ backgroundColor: '#DC2626', color: WH,
              borderRadius: big ? 8 : 6, padding: big ? '6px 10px' : '3px 7px',
              fontSize: big ? 20 : 14, fontWeight: 900, lineHeight: 1,
              minWidth: big ? 40 : 28 }}>
              {pad(val)}
            </div>
            {big && (
              <div style={{ fontSize: 9, color: GR, marginTop: 3, fontWeight: 700 }}>
                {label}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Flash sale card ───────────────────────────────────────────────────────────
const FlashCard = ({ item, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const discount = item.originalPrice && item.flashSalePrice
    ? Math.round((1 - item.flashSalePrice / item.originalPrice) * 100)
    : 0;
  const sold     = item.flashSaleSold || 0;
  const total    = item.flashSaleQuantity || 0;
  const pctSold  = total > 0 ? Math.min(100, Math.round(sold / total * 100)) : 0;
  const remaining = total > 0 ? total - sold : null;

  return (
    <div style={{ backgroundColor: WH, borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)', position: 'relative' }}>

      {/* Discount badge */}
      {discount > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10,
          backgroundColor: '#DC2626', color: WH,
          fontSize: 13, fontWeight: 900, padding: '4px 10px', borderRadius: 100 }}>
          -{discount}%
        </div>
      )}

      {/* Wishlist */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
        <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn}
          onNavigate={onNavigate} size={24}
          style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '50%' }} />
      </div>

      {/* Image */}
      <div onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}
        style={{ height: 160, backgroundColor: '#F8FAFC', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden' }}>
        {item.images?.[0]
          ? <img src={item.images[0]} alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => e.target.style.display = 'none'} />
          : <span style={{ fontSize: 40 }}>🔥</span>}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        {/* Title */}
        <div style={{ fontSize: 13, fontWeight: 700, color: DK, marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </div>

        {/* Prices */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: '#DC2626' }}>
            TZS {fmt(item.flashSalePrice || item.price)}
          </span>
          {item.originalPrice && (
            <span style={{ fontSize: 12, color: GR, textDecoration: 'line-through' }}>
              TZS {fmt(item.originalPrice)}
            </span>
          )}
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: GR, fontWeight: 700 }}>{t('flash_sales.ends_in')}</span>
          <Countdown endsAt={item.flashSaleEndsAt} />
        </div>

        {/* Stock progress bar */}
        {total > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: GR }}>
                {remaining !== null ? t('flash_sales.remaining_count', { count: remaining }) : t('flash_sales.few_remaining')}
              </span>
              <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 700 }}>
                {t('flash_sales.percent_sold', { percent: pctSold })}
              </span>
            </div>
            <div style={{ height: 5, backgroundColor: '#F1F5F9', borderRadius: 100 }}>
              <div style={{ height: '100%', borderRadius: 100,
                backgroundColor: pctSold > 75 ? '#DC2626' : pctSold > 50 ? '#D97706' : '#16A34A',
                width: `${pctSold}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Buy button */}
        <button onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)}
          style={{ width: '100%', backgroundColor: '#DC2626', color: WH,
            border: 'none', borderRadius: 10, padding: '10px 0',
            cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
          {t('flash_sales.buy_now')}
        </button>
      </div>
    </div>
  );
};

// ── Main FlashSales page ──────────────────────────────────────────────────────
const FlashSales = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  const CATEGORIES = [
    { key:'all',         label:t('flash_sales.cat_all')       },
    { key:'electronics', label:t('flash_sales.cat_electronics')  },
    { key:'fashion',     label:t('flash_sales.cat_fashion')     },
    { key:'food',        label:t('flash_sales.cat_food')     },
    { key:'hardware',    label:t('flash_sales.cat_hardware')       },
    { key:'furniture',   label:t('flash_sales.cat_furniture')     },
  ];

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ flashSale: 'true' });
      if (filter !== 'all') params.set('category', filter);
      const res = await api.get(`/classifieds/search?${params}`);
      const all = res.data || [];
      // Filter to only active flash sales with future end time
      const active = all.filter(c =>
        c.isFlashSale &&
        c.flashSaleEndsAt &&
        new Date(c.flashSaleEndsAt) > new Date()
      );
      setItems(active);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFF5F5',
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <Navbar currentPage="FlashSales" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title={t('flash_sales.page_title')} />

      {/* Hero banner */}
      <div style={{ background: 'linear-gradient(135deg,#DC2626,#EA580C)',
        padding: '20px 16px', color: WH }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
          marginBottom: 4 }}>{t('flash_sales.eyebrow')}</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
          {t('flash_sales.hero_title')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {t('flash_sales.hero_desc')}
        </div>
        {isLoggedIn && (
          <button onClick={() => onNavigate('SellerClassifieds')}
            style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)',
              color: WH, border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700 }}>
            {t('flash_sales.post_flash_sale_button')}
          </button>
        )}
      </div>

      {/* Category filter */}
      <div style={{ backgroundColor: WH, borderBottom: '1px solid #F1F5F9',
        display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
        padding: '0 8px' }}>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            style={{ padding: '10px 14px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              whiteSpace: 'nowrap', flexShrink: 0,
              color: filter === c.key ? '#DC2626' : GR,
              borderBottom: `2px solid ${filter === c.key ? '#DC2626' : 'transparent'}` }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 14px 80px', maxWidth: 900,
        margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ backgroundColor: WH, borderRadius: 16,
                height: 280, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔥</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: DK, marginBottom: 8 }}>
              {t('flash_sales.no_sales_title')}
            </div>
            <div style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
              {t('flash_sales.no_sales_desc')}
            </div>
            {isLoggedIn && (
              <button onClick={() => onNavigate('SellerClassifieds')}
                style={{ backgroundColor: '#DC2626', color: WH, border: 'none',
                  borderRadius: 12, padding: '12px 28px', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700 }}>
                {t('flash_sales.start_flash_sale_button')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: DK, marginBottom: 14 }}>
              {t('flash_sales.active_count', { count: items.length })}
            </div>
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
              {items.map(item => (
                <FlashCard key={item.id} item={item}
                  onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default FlashSales;