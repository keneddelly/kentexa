/**
 * StoreFront.js — the "Duka" tab of a shop's page (owner approved 2026-11-18, store-mock).
 *
 * Built only from what the shop really has:
 *  - search inside this shop;
 *  - category chips with counts, made from the products' own categories (side list on a computer,
 *    together with the owner's collections and price ranges);
 *  - the owner's collections (store_collection) as banners/shelves;
 *  - automatic shelves: Ofa (a real old price above the price), Zinazouzwa zaidi (salesCount),
 *    Mpya dukani (newest);
 *  - then every product in a grid, with price, old price, sold count, stock left and delivery;
 *  - a cart bar when the cart has something.
 * Nothing is invented: a shelf with no products is not shown.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import { useCart } from '../../context/CartContext';
import LineIcon from './LineIcon';

const INK = '#0f1419';
const MUTED = '#536471';
const FAINT = '#8b98a5';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const RED = '#be123c';

const money = (n) => `TSh ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const priceOf = (p) => Number(p.displayPrice || p.basePrice || 0);
const oldPriceOf = (p) => {
  const c = Number(p.compareAtPrice);
  return c > priceOf(p) ? c : 0;
};
const inStock = (p) => p.isAvailable !== false && Number(p.stock) > 0;
const catKey = (p) => p.subcategory || p.category || 'general';
const PRICE_BANDS = [
  ['lt20', 'Chini ya 20K', (v) => v < 20000],
  ['20to100', '20K - 100K', (v) => v >= 20000 && v <= 100000],
  ['gt100', 'Zaidi ya 100K', (v) => v > 100000],
];

let categoryLabels = null;
const loadLabels = () => {
  if (categoryLabels) return Promise.resolve(categoryLabels);
  return Promise.resolve().then(() => api.get('/categories')).then((r) => {
    const map = {};
    (Array.isArray(r?.data) ? r.data : []).forEach((c) => {
      map[c.key] = c.label;
      (c.subcategories || []).forEach((s) => { map[s.key] = s.label; });
    });
    categoryLabels = map;
    return map;
  }).catch(() => ({}));
};

const isWide = () => (typeof window !== 'undefined' ? window.innerWidth >= 900 : false);
const useWide = () => {
  const [wide, setWide] = useState(isWide);
  useEffect(() => {
    const on = () => setWide(isWide());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return wide;
};

export function ProductTile({ p, onNavigate, width }) {
  const old = oldPriceOf(p);
  const off = old ? Math.round((1 - priceOf(p) / old) * 100) : 0;
  const sold = Number(p.salesCount) || 0;
  const stock = Number(p.stock) || 0;
  const meta = [
    sold > 0 ? `Zimeuzwa ${sold.toLocaleString('en-US')}` : null,
    !inStock(p) ? 'Imeisha' : (stock > 0 && stock <= 5 ? `Zimebaki ${stock}` : null),
    p.estimatedDelivery || null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" data-testid="store-product" onClick={() => onNavigate(`ProductDetail-${p.id}`)}
      style={{ width: width || '100%', flexShrink: 0, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', background: '#f1f5f9' }}>
        {p.images?.[0]
          ? <img src={p.images[0]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LineIcon name="cart" size={28} color="#94a3b8" /></span>}
        {off > 0 && <span style={{ position: 'absolute', left: 8, top: 8, background: RED, color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 7px', borderRadius: 6 }}>-{off}%</span>}
        {!inStock(p) && <span style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>Imeisha</span>}
      </div>
      <div style={{ fontSize: 14, lineHeight: '18px', color: INK, marginTop: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36 }}>{p.name}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 4 }}>
        {money(priceOf(p))}
        {old > 0 && <span style={{ fontSize: 12, color: FAINT, textDecoration: 'line-through', fontWeight: 500, marginLeft: 6 }}>{Math.round(old).toLocaleString('en-US')}</span>}
      </div>
      {meta && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{meta}</div>}
    </button>
  );
}

function Shelf({ title, note, items, onNavigate, onAll, wide, tone }) {
  if (!items.length) return null;
  return (
    <section style={{ padding: '14px 0 4px' }} data-testid="store-shelf">
      {tone ? (
        <div style={{ margin: '0 0 12px', borderRadius: 16, padding: '16px 18px', color: '#fff', background: tone }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, opacity: 0.9 }}>MKUSANYIKO WA DUKA</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{title}</div>
          {note && <div style={{ fontSize: 13, opacity: 0.9 }}>{note}</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <b style={{ fontSize: 18, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>{title}</b>
          {onAll && <button type="button" onClick={onAll} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Ona zote</button>}
        </div>
      )}
      <div style={wide
        ? { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '18px 14px' }
        : { display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
        {items.slice(0, wide ? 10 : 12).map((p) => <ProductTile key={p.id} p={p} onNavigate={onNavigate} width={wide ? undefined : 150} />)}
      </div>
    </section>
  );
}

const TONES = ['linear-gradient(120deg,#be123c,#f43f5e)', 'linear-gradient(120deg,#1d4ed8,#60a5fa)', 'linear-gradient(120deg,#0f766e,#14b8a6)', 'linear-gradient(120deg,#7c3aed,#a78bfa)'];

export default function StoreFront({ profile, products, collections = [], isOwn, onNavigate, onManage }) {
  const wide = useWide();
  const { cartCount, cartTotal } = useCart() || {};
  const [labels, setLabels] = useState(categoryLabels || {});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [band, setBand] = useState('');
  const [col, setCol] = useState(null);

  useEffect(() => { let alive = true; loadLabels().then((m) => { if (alive) setLabels(m); }); return () => { alive = false; }; }, []);

  const visible = useMemo(() => (isOwn ? products : products.filter(inStock)), [products, isOwn]);
  const byId = useMemo(() => new Map(visible.map((p) => [Number(p.id), p])), [visible]);
  const cats = useMemo(() => {
    const m = new Map();
    visible.forEach((p) => m.set(catKey(p), (m.get(catKey(p)) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [visible]);
  const shelves = useMemo(() => ({
    deals: visible.filter((p) => oldPriceOf(p) > 0 && inStock(p)),
    best: [...visible].filter((p) => Number(p.salesCount) > 0 && inStock(p)).sort((a, b) => Number(b.salesCount) - Number(a.salesCount)),
    fresh: [...visible].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  }), [visible]);
  const own = useMemo(() => collections
    .map((c, i) => ({ ...c, items: (c.productIds || []).map((id) => byId.get(Number(id))).filter(Boolean), tone: TONES[i % TONES.length] }))
    .filter((c) => c.items.length), [collections, byId]);

  const filtering = Boolean(q.trim() || cat || band || col);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bandFn = PRICE_BANDS.find((b) => b[0] === band)?.[2];
    const inCol = col ? new Set((own.find((c) => c.id === col)?.items || []).map((p) => p.id)) : null;
    return visible.filter((p) => (!cat || catKey(p) === cat)
      && (!bandFn || bandFn(priceOf(p)))
      && (!inCol || inCol.has(p.id))
      && (!needle || `${p.name} ${p.description || ''} ${labels[catKey(p)] || ''}`.toLowerCase().includes(needle)));
  }, [visible, q, cat, band, col, own, labels]);

  const clear = () => { setQ(''); setCat(''); setBand(''); setCol(null); };
  const name = profile?.displayName || 'duka hili';

  if (!visible.length) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: MUTED }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>Bado hakuna bidhaa dukani</div>
        {isOwn && <button type="button" onClick={() => onNavigate('SellerProducts')} style={pill(true)}>Weka bidhaa ya kwanza</button>}
      </div>
    );
  }

  const chip = (key, label, count, on, onClick) => (
    <button key={key} type="button" onClick={onClick} data-testid="store-chip"
      style={{ flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 17, border: `1px solid ${on ? INK : '#cfd9de'}`, background: on ? INK : '#fff',
        color: on ? '#fff' : INK, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label}{count != null && <small style={{ color: on ? '#cbd5e1' : FAINT, fontWeight: 500, fontSize: 12 }}>{count}</small>}
    </button>
  );
  const sideItem = (key, label, count, on, onClick) => (
    <button key={key} type="button" onClick={onClick}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
        background: on ? '#eff6ff' : 'transparent', color: on ? BLUE : INK, fontWeight: on ? 700 : 400, textAlign: 'left' }}>
      <span>{label}</span>{count != null && <span style={{ color: FAINT }}>{count}</span>}
    </button>
  );

  const search = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, background: '#f7f9f9', padding: '0 16px', flex: wide ? '0 1 360px' : undefined }}>
      <LineIcon name="search" size={18} color={FAINT} />
      <input data-testid="store-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tafuta ndani ya ${name}`} aria-label="Tafuta dukani"
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit', color: INK, flex: 1, minWidth: 0 }} />
    </label>
  );

  const body = filtering ? (
    <section style={{ paddingTop: 8 }} data-testid="store-results">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 12px' }}>
        <b style={{ fontSize: 16, color: INK }}>{results.length ? `Bidhaa ${results.length}` : 'Hakuna bidhaa inayolingana'}</b>
        <button type="button" onClick={clear} style={{ border: 'none', background: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>Ondoa vichujio</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 5 : 2}, minmax(0, 1fr))`, gap: '16px 10px' }}>
        {results.map((p) => <ProductTile key={p.id} p={p} onNavigate={onNavigate} />)}
      </div>
    </section>
  ) : (
    <>
      {own.map((c) => <Shelf key={c.id} title={c.title} note={c.note} items={c.items} onNavigate={onNavigate} wide={wide} tone={c.tone} />)}
      {own.length === 0 && <Shelf title="Ofa" items={shelves.deals} onNavigate={onNavigate} wide={wide} />}
      <Shelf title="Zinazouzwa zaidi" items={shelves.best} onNavigate={onNavigate} wide={wide} />
      <Shelf title="Mpya dukani" items={shelves.fresh.slice(0, 12)} onNavigate={onNavigate} wide={wide} />
      <section style={{ padding: '14px 0 4px' }}>
        <b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: INK, letterSpacing: -0.3, marginBottom: 10 }}>Bidhaa zote <span style={{ color: FAINT, fontWeight: 500, fontSize: 15 }}>{visible.length}</span></b>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 5 : 2}, minmax(0, 1fr))`, gap: '16px 10px' }}>
          {visible.map((p) => <ProductTile key={p.id} p={p} onNavigate={onNavigate} />)}
        </div>
      </section>
    </>
  );

  const ownerBar = isOwn && (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: `1px dashed ${LINE}`, borderRadius: 12, padding: '10px 12px', margin: '4px 0 8px', fontSize: 14 }}>
      <span style={{ color: MUTED }}>Panga duka lako: mikusanyiko, saa za kufungua, aina ya ukurasa</span>
      <button type="button" data-testid="store-manage" onClick={onManage} style={pill(true)}>Panga duka</button>
    </div>
  );

  const cart = cartCount > 0 && (
    <button type="button" data-testid="store-cart" onClick={() => onNavigate('Cart')}
      style={{ position: 'sticky', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', zIndex: 20, width: '100%', marginTop: 16, height: 52, borderRadius: 26, border: 'none', background: INK, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 20px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 24px rgba(15,20,25,0.28)' }}>
      <span>Kikapu · bidhaa {cartCount}</span>
      <span style={{ background: BLUE, height: 38, borderRadius: 19, padding: '0 16px', display: 'flex', alignItems: 'center' }}>Lipa {money(cartTotal)}</span>
    </button>
  );

  if (wide) {
    return (
      <div data-testid="storefront" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr)', gap: 22 }}>
        <aside style={{ borderRight: `1px solid ${LINE}`, paddingRight: 14 }}>
          <div style={side}>AINA</div>
          {sideItem('all', 'Zote', visible.length, !cat, () => setCat(''))}
          {cats.map(([k, n]) => sideItem(k, labels[k] || k, n, cat === k, () => setCat(cat === k ? '' : k)))}
          {own.length > 0 && <div style={{ ...side, marginTop: 18 }}>MIKUSANYIKO</div>}
          {own.map((c) => sideItem(`c${c.id}`, c.title, null, col === c.id, () => setCol(col === c.id ? null : c.id)))}
          <div style={{ ...side, marginTop: 18 }}>BEI</div>
          {PRICE_BANDS.map(([k, label]) => sideItem(k, label, null, band === k, () => setBand(band === k ? '' : k)))}
        </aside>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>{search}</div>
          {ownerBar}
          {body}
          {cart}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="storefront">
      {search}
      {ownerBar}
      {cats.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '12px 0 4px' }}>
          {chip('all', 'Zote', visible.length, !cat, () => setCat(''))}
          {cats.map(([k, n]) => chip(k, labels[k] || k, n, cat === k, () => setCat(cat === k ? '' : k)))}
        </div>
      )}
      {body}
      {cart}
    </div>
  );
}

const side = { fontSize: 13, color: MUTED, letterSpacing: 0.4, fontWeight: 700, margin: '4px 0 8px' };
const pill = (dark) => ({ height: 34, padding: '0 14px', borderRadius: 17, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff', color: dark ? '#fff' : INK,
  fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });

/** "Wazi sasa · hadi 20:00" / "Imefungwa · inafungua 08:00", in Tanzania time. */
export const openState = (hours, now = new Date()) => {
  if (!hours || !hours.open || !hours.close) return null;
  const eat = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
  const mins = eat.getHours() * 60 + eat.getMinutes();
  const toM = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
  const o = toM(hours.open);
  const c = toM(hours.close);
  const closedToday = (hours.closedDays || []).includes(eat.getDay());
  const within = c > o ? mins >= o && mins < c : mins >= o || mins < c;
  if (!closedToday && within) return { open: true, text: `Wazi sasa · hadi ${hours.close}` };
  return { open: false, text: closedToday ? 'Imefungwa leo' : `Imefungwa · inafungua ${hours.open}` };
};
