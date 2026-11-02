/**
 * KentexaDirectory.js — Home's catalogue tabs (owner 2026-11-02: "if business then all
 * business in KenteXa, if product then all products in KenteXa"). Each tab lists every
 * item of its kind from the server's own public lists, newest or best first; a tap opens
 * the item. For You, Jumuiya and Karibu nawe stay social feeds.
 *
 *   products     GET /products                          -> ProductDetail
 *   services     GET /services?limit=40                 -> ServiceDetail
 *   hotels       GET /food/hotels                       -> HotelMenu (the hotel's menu)
 *   classifieds  GET /classifieds                       -> ClassifiedDetail
 *   businesses   GET /profiles/directory/businesses     -> the business profile
 *
 * Paging (owner 2026-11-02, "do as you recommend"): 30 at a time, more as the person
 * scrolls (or taps "Ona zaidi"). Services and businesses ask the server for the next
 * page; the other lists come whole from the server and are shown 30 at a time.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/api';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const PAGE = 30;

const tzs = (n) => (Number(n) > 0 ? `TZS ${Math.round(Number(n)).toLocaleString('en-US')}` : '');

/** Per kind: where to read, how to turn a record into a card, and what a tap opens. */
export const DIRECTORY = Object.freeze({
  products: {
    title: 'Bidhaa zote kwenye KenteXa', empty: 'Bado hakuna bidhaa.',
    load: () => api.get('/products').then((r) => ({ list: Array.isArray(r.data) ? r.data : [], more: false })),
    card: (p) => ({ key: `p${p.id}`, image: p.images?.[0], name: p.name, line: tzs(p.displayPrice || p.basePrice),
      sub: p.seller?.storeName || p.seller?.name || '', page: `ProductDetail-${p.id}` }),
  },
  services: {
    title: 'Huduma zote kwenye KenteXa', empty: 'Bado hakuna huduma.',
    load: (offset) => api.get('/services', { params: { limit: PAGE, offset } }).then((r) => {
      const list = Array.isArray(r.data?.ads) ? r.data.ads : Array.isArray(r.data) ? r.data : [];
      return { list, more: Number(r.data?.total) > offset + list.length };
    }),
    card: (s) => ({ key: `s${s.id}`, image: s.images?.[0], name: s.title, line: tzs(s.price) || 'Bei kwa makubaliano',
      sub: s.provider?.name || s.city || '', page: `ServiceDetail-${s.id}` }),
  },
  hotels: {
    title: 'Hoteli na migahawa yenye menyu', empty: 'Bado hakuna hoteli yenye menyu.',
    load: () => api.get('/food/hotels').then((r) => ({ list: Array.isArray(r.data) ? r.data : [], more: false })),
    card: (h) => ({ key: `h${h.businessId}`, image: h.photoUrl, name: h.name, line: h.open ? 'Inapokea oda sasa' : 'Imefungwa kwa sasa',
      sub: [h.location, h.items ? `Vyakula ${h.items}` : ''].filter(Boolean).join(' · '), page: `HotelMenu-${h.businessId}` }),
  },
  classifieds: {
    title: 'Matangazo yote kwenye KenteXa', empty: 'Bado hakuna matangazo.',
    load: () => api.get('/classifieds').then((r) => ({ list: Array.isArray(r.data) ? r.data : [], more: false })),
    card: (c) => ({ key: `c${c.id}`, image: c.images?.[0], name: c.title, line: tzs(c.isFlashSale && c.flashSalePrice ? c.flashSalePrice : c.price),
      sub: c.location || '', page: `ClassifiedDetail-${c.id}` }),
  },
  businesses: {
    title: 'Biashara zote kwenye KenteXa', empty: 'Bado hakuna biashara.', list: true,
    load: (offset) => api.get('/profiles/directory/businesses', { params: { limit: PAGE, offset } }).then((r) => {
      const list = Array.isArray(r.data?.items) ? r.data.items : [];
      return { list, more: Number(r.data?.total) > offset + list.length };
    }),
    card: (b) => ({ key: `b${b.id}`, image: b.photoUrl, name: b.displayName, verified: b.isVerified,
      line: [b.category, b.location].filter(Boolean).join(' · '),
      sub: `Wanaofuata ${Number(b.followersCount || 0).toLocaleString('en-US')}${b.reviewsCount ? ` · ${Number(b.rating || 0).toFixed(1)} (maoni ${b.reviewsCount})` : ''}`,
      page: `CommerceProfile-${b.ownerId}`, params: { commerceProfileId: b.id } }),
  },
});

export const DIRECTORY_KINDS = Object.keys(DIRECTORY);

export default function KentexaDirectory({ kind, onNavigate }) {
  const spec = DIRECTORY[kind];
  const [items, setItems] = useState(null);   // every card loaded so far
  const [shown, setShown] = useState(PAGE);    // how many are on screen
  const [more, setMore] = useState(false);     // the server has another page
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);

  useEffect(() => {
    if (!spec) return undefined;
    let alive = true;
    setItems(null); setShown(PAGE); setMore(false);
    spec.load(0)
      .then(({ list, more: next }) => { if (alive) { setItems(list.map(spec.card)); setMore(next); } })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMore = !!items && (shown < items.length || more);
  const showMore = useCallback(() => {
    if (!items || loadingMore) return;
    if (shown < items.length) { setShown((n) => n + PAGE); return; }
    if (!more) return;
    setLoadingMore(true);
    spec.load(items.length)
      .then(({ list, more: next }) => {
        setItems((prev) => {
          const seen = new Set((prev || []).map((c) => c.key));
          return [...(prev || []), ...list.map(spec.card).filter((c) => !seen.has(c.key))];
        });
        setShown((n) => n + PAGE);
        setMore(next && list.length > 0);
      })
      .catch(() => setMore(false))
      .finally(() => setLoadingMore(false));
  }, [items, shown, more, loadingMore, spec]);

  // More as the person scrolls near the end (the button stays for browsers without it).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined;
    const io = new window.IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) showMore(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, showMore]);

  const visible = items ? items.slice(0, shown) : null;

  if (!spec) return null;
  return (
    <section data-testid={`directory-${kind}`} aria-label={spec.title} style={{ background: '#fff' }}>
      <div style={{ padding: '12px 16px 6px', fontSize: 15, fontWeight: 800, color: INK }}>{spec.title}</div>
      {items === null ? (
        <div style={{ padding: 20, color: MUTED, fontSize: 15 }}>Inapakia...</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 24, color: MUTED, fontSize: 15, textAlign: 'center' }}>{spec.empty}</div>
      ) : spec.list ? (
        <div>
          {visible.map((c) => (
            <button key={c.key} type="button" data-testid="directory-item" onClick={() => onNavigate(c.page, c.params)}
              style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '10px 16px', border: 'none', borderTop: `1px solid ${LINE}`,
                background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: INK, color: '#fff', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.image ? <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : String(c.name || '?').charAt(0).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}{c.verified ? (
                    <svg aria-label="Imethibitishwa" width="14" height="14" viewBox="0 0 24 24" style={{ marginLeft: 4, verticalAlign: '-2px' }}>
                      <circle cx="12" cy="12" r="10" fill="#2563EB" /><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2.2" fill="none" />
                    </svg>
                  ) : null}
                </span>
                {c.line && <span style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.line}</span>}
                {c.sub && <span style={{ fontSize: 12, color: MUTED }}>{c.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, padding: '6px 12px 16px' }}>
          {visible.map((c) => (
            <button key={c.key} type="button" data-testid="directory-item" onClick={() => onNavigate(c.page, c.params)}
              style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden', padding: 0,
                background: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minWidth: 0 }}>
              <span style={{ aspectRatio: '1 / 1', width: '100%', background: '#f1f5f9', display: 'block', overflow: 'hidden' }}>
                {c.image && <img src={c.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              </span>
              <span style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.line && <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{c.line}</span>}
                {c.sub && <span style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {hasMore && (
        <div ref={sentinel} style={{ padding: '4px 16px 20px', display: 'flex', justifyContent: 'center' }}>
          <button type="button" data-testid="directory-more" onClick={showMore} disabled={loadingMore}
            style={{ height: 38, padding: '0 20px', borderRadius: 19, border: `1px solid ${LINE}`, background: '#fff', color: INK,
              fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loadingMore ? 'Inapakia...' : 'Ona zaidi'}
          </button>
        </div>
      )}
    </section>
  );
}
