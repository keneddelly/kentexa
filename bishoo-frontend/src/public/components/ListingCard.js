import React from 'react';
import { useTranslation } from 'react-i18next';
import WishlistHeart from './WishlistHeart';

/**
 * ListingCard.js — the marketplace card look (owner 2026-10-26: professional,
 * Twitter-style, no emoji). Square photo, price, two-line title, and the seller
 * under it, so every listing leads back to the identity behind it (CLAUDE.md §8).
 * Used by Soko (Search) and the listings page.
 */
export const B    = '#1d4ed8';
export const DK   = '#0f1419';
export const GR   = '#536471';
export const WH   = '#ffffff';
export const LINE = '#eff3f4';
export const fmt = n => Number(n||0).toLocaleString('en-US');

// ── Small shared pieces (line icons, never emoji) ────────────────────────────
export const Icon = ({ d, size = 16, color = GR, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink:0 }}><path d={d} /></svg>
);
export const I = {
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  pin:    'M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  photo:  'M4 6h16v12H4zM8 14l3-3 3 3 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z',
  truck:  'M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  office: 'M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2',
  tool:   'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5z',
  spark:  'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  right:  'M9 6l6 6-6 6',
};
export const Star = ({ value }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:2 }}>
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="#f59e0b"/></svg>
    {Number(value).toFixed(1)}
  </span>
);
export const Verified = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink:0 }}>
    <circle cx="12" cy="12" r="10" fill={B}/><path d="M8 12.5l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
  </svg>
);
export const Avatar = ({ src, name, size = 18, round = true }) => (
  <span style={{ width:size, height:size, borderRadius: round ? size/2 : 10, overflow:'hidden', flexShrink:0,
    backgroundColor:'#cfd9de', color:WH, fontSize: Math.max(9, size*0.42), fontWeight:800,
    display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
    {src
      ? <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
      : (name || '?').trim().charAt(0).toUpperCase()}
  </span>
);
export const Photo = ({ src, alt, children }) => (
  <div style={{ aspectRatio:'1 / 1', borderRadius:14, overflow:'hidden', backgroundColor:'#f7f9f9', position:'relative',
    display:'flex', alignItems:'center', justifyContent:'center' }}>
    {src
      ? <img src={src} alt={alt || ''} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
      : <Icon d={I.photo} size={28} color="#cfd9de" />}
    {children}
  </div>
);
/** Who sells this: the identity behind every listing (CLAUDE.md §8). */
export const sellerOf = (item) => {
  const p = item?.commerceProfile;
  if (p?.displayName) return { name: p.displayName, photo: p.photoUrl, verified: !!p.isVerified };
  const s = item?.seller || item?.business || item?.provider;
  // The account's own isVerified only means its phone passed OTP: the tick needs an official store.
  if (s && (s.storeName || s.name)) return { name: s.storeName || s.name, photo: s.logo || s.photoUrl, verified: !!s.isOfficialStore };
  return null;
};
export const SellerLine = ({ item, place }) => {
  const s = sellerOf(item);
  if (!s && !place) return null;
  return (
    <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:GR, minWidth:0 }}>
      {s && <Avatar src={s.photo} name={s.name} />}
      <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {[s?.name, place].filter(Boolean).join(' · ')}
      </span>
      {s?.verified && <Verified />}
    </span>
  );
};
export const Badge = ({ children, tone = 'light' }) => (
  <span style={{ position:'absolute', left:8, top:8, height:22, padding:'0 8px', borderRadius:6,
    backgroundColor: tone === 'red' ? '#b91c1c' : WH, color: tone === 'red' ? WH : DK,
    fontSize:12, fontWeight:700, display:'flex', alignItems:'center' }}>{children}</span>
);
export const cardBtn = { display:'flex', flexDirection:'column', gap:6, textAlign:'left', padding:0, border:'none',
  background:'none', cursor:'pointer', color:DK, fontFamily:'inherit', minWidth:0, width:'100%' };
export const titleStyle = { fontSize:14, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' };
export const tile = { backgroundColor:WH, border:`1px solid ${LINE}`, borderRadius:16, padding:14, cursor:'pointer',
  textAlign:'left', fontFamily:'inherit', color:DK, display:'flex', flexDirection:'column', gap:8, minWidth:0 };

// ── Classified card ───────────────────────────────────────────────────────────
export const ClassifiedCard = ({ item, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  return (
    <div style={{ position:'relative', minWidth:0 }}>
      <button type="button" onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)} style={cardBtn}>
        <Photo src={item.images?.[0]} alt={item.title}>
          {item.isFlashSale && <Badge tone="red">Punguzo</Badge>}
        </Photo>
        <span style={{ fontSize:16, fontWeight:800, color: item.isFlashSale ? '#b91c1c' : DK }}>
          TZS {fmt(item.flashSalePrice || item.price)}
        </span>
        <span style={titleStyle}>{item.title}</span>
        <SellerLine item={item} place={item.location || t('search.location_fallback')} />
      </button>
      <div style={{ position:'absolute', top:6, right:6, zIndex:2 }}>
        <WishlistHeart classifiedId={item.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
      </div>
    </div>
  );
};

// ── Product (shop) card ──────────────────────────────────────────────────────
export const ProductCard = ({ item, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={() => onNavigate(`ProductDetail-${item.id}`)} style={cardBtn}>
      <Photo src={item.images?.[0]} alt={item.name}>
        {item.codEnabled && <Badge>{t('search.cod_badge')}</Badge>}
      </Photo>
      {/* Product has no plain `price` field — it's displayPrice/basePrice. */}
      <span style={{ fontSize:16, fontWeight:800 }}>TZS {fmt(item.displayPrice ?? item.basePrice)}</span>
      <span style={titleStyle}>{item.name}</span>
      <SellerLine item={item} place={item.seller?.businessLocation} />
    </button>
  );
};

