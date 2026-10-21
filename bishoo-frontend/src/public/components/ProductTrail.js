import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// A 2×2 grid of 4 listing cards between home feed posts (see utils/productTrail.js).
// Same cards as the "Bidhaa za Duka" grid on ListingsPage, laid out vertically inside a
// 16px gutter, so nothing scrolls sideways.
const ProductTrail = ({ trail, onNavigate, onAddToCart, onSeen }) => {
  const { t } = useTranslation();
  const ref = useRef(null);

  // "Seen" means at least half the row was on screen once.
  useEffect(() => {
    if (!trail?.items?.length || !onSeen) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { onSeen(trail); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { onSeen(trail); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [trail, onSeen]);

  if (!trail?.items?.length) return null;

  const open = (item) => onNavigate(`${item.entityType === 'product' ? 'ProductDetail' : 'ClassifiedDetail'}-${item.id}`);

  return (
    <section ref={ref} data-testid="product-trail" data-slot-source={trail.slot_source}
      aria-label={t('product_trail.title')}
      style={{ backgroundColor: '#fff', borderBottom: '1px solid #F1F5F9', padding: '12px 0', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 10px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{t('product_trail.title')}</div>
        <button type="button" onClick={() => onNavigate('Listings')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
          {t('home_feed.see_all')} →
        </button>
      </div>
      <div data-testid="product-trail-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: '0 16px 4px' }}>
        {trail.items.map((item) => (
          <div key={item.key} role="link" tabIndex={0} onClick={() => open(item)}
            onKeyDown={(e) => { if (e.key === 'Enter') open(item); }}
            style={{ minWidth: 0, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <div style={{ width: '100%', aspectRatio: '1/1', backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
              {item.image
                ? <img src={item.image} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>{item.entityType === 'product' ? '📦' : '📋'}</div>}
              <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, color: '#fff',
                backgroundColor: item.entityType === 'product' ? '#1d4ed8' : '#db2777' }}>
                {item.entityType === 'product' ? t('product_trail.store') : t('product_trail.ad')}
              </span>
              {item.codEnabled && (
                <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  {t('product_trail.cod')}
                </span>
              )}
            </div>
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{item.name}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#1d4ed8', marginBottom: 4 }}>TZS {item.price.toLocaleString()}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.freeDelivery ? t('product_trail.free_delivery') : item.codEnabled || item.delivery ? t('product_trail.delivery') : ''}
                </span>
                {item.cartable ? (
                  <button type="button" aria-label={t('product_trail.add_to_cart')}
                    onClick={(e) => { e.stopPropagation(); onAddToCart?.(item.raw); }}
                    style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                    🛒
                  </button>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', flexShrink: 0 }}>{t('product_trail.view')} →</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductTrail;
