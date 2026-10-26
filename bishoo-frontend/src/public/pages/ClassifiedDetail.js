import React, { useEffect, useState } from 'react';

import api from '../../api/api';

import WishlistHeart   from '../components/WishlistHeart';
import ReputationBadge from '../components/ReputationBadge';
import CommerceCommentSection from '../components/CommerceCommentSection';
import { PageLoading } from '../components/Loading';
import { useTranslation } from 'react-i18next';
import { listingUrl, listingWhatsAppHref } from '../utils/listingWhatsApp';

/**
 * ClassifiedDetail — one listing (owner 2026-10-26 redesign, same look as the
 * product page): photos, price and facts, then the person or business behind it
 * with their contact shown straight away, details, safety tips, comments.
 * No emoji anywhere.
 */
const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const WH = '#ffffff';
const LINE = '#eff3f4';

// Simple countdown for a flash sale.
const FlashCountdown = ({ endsAt }) => {
  const [t, setT] = React.useState(() => {
    const d = new Date(endsAt) - Date.now();
    return d > 0 ? d : 0;
  });
  React.useEffect(() => {
    const id = setInterval(() => setT(prev => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  if (t <= 0) return <span style={{ fontSize:13, color:'#b91c1c', fontWeight:700 }}>Imekwisha</span>;
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const pad = n => String(n).padStart(2,'0');
  return <span style={{ fontSize:15, fontWeight:800, color:'#b91c1c', fontVariantNumeric:'tabular-nums' }}>{pad(h)}:{pad(m)}:{pad(s)}</span>;
};

const IC = {
  back: 'M15 6l-6 6 6 6',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  photo: 'M4 6h16v12H4zM8 14l3-3 3 3 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z',
  right: 'M9 6l6 6-6 6',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
};
const Icon = ({ d, size = 18, color = GR }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const IconBtn = ({ label, onClick, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick}
    style={{ width:44, height:44, borderRadius:22, border:'none', background:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
    {children}
  </button>
);
const Avatar = ({ src, name, size = 40 }) => (
  <span style={{ width:size, height:size, borderRadius:size/2, overflow:'hidden', flexShrink:0, backgroundColor:'#cfd9de', color:WH,
    fontWeight:800, fontSize:size*0.4, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
    {src ? <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (name || '?').trim().charAt(0).toUpperCase()}
  </span>
);
const Verified = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink:0 }}>
    <circle cx="12" cy="12" r="10" fill={B} /><path d="M8 12.5l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);
const CHIP = { green: ['#ecfdf3', '#166534'], red: ['#fef2f2', '#b91c1c'], blue: ['#eff6ff', '#1e40af'], grey: ['#f7f9f9', GR] };
const Chip = ({ tone = 'grey', children }) => (
  <span style={{ height:28, padding:'0 10px', borderRadius:14, backgroundColor:CHIP[tone][0], color:CHIP[tone][1], fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', textTransform:'capitalize' }}>{children}</span>
);

const contactBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, padding: '0 12px',
  borderRadius: 22, border: '1px solid #cfd9de', backgroundColor: '#fff', color: '#0f1419', textDecoration: 'none',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' };

const ClassifiedDetail = ({ onNavigate, isLoggedIn, onLogout, userRole, classifiedId, currentUser, onOpenMoment, openComments, activeProfileId }) => {
  const { t } = useTranslation();
  const [classified, setClassified]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [contactInfo, setContactInfo]   = useState(null);
  const [message, setMessage]           = useState(''); // eslint-disable-line no-unused-vars
  const [showMenu, setShowMenu]         = useState(false);
  const [related, setRelated]           = useState([]);
  const [, setError]                    = useState('');
  const commentsRef = React.useRef(null);
  // Category attribute schema — same purpose as ProductDetail.js's: order
  // the specs list using the seller-defined displayOrder/label/unit
  // instead of an unordered raw key dump, without ever hiding a spec whose
  // key doesn't match (legacy data still renders, just unordered).
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

  useEffect(() => { if (classifiedId) fetchClassified(); }, [classifiedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-linked from a "New comment"/"New save" notification — scroll to
  // the comments section instead of leaving it wherever it falls on the page.
  useEffect(() => {
    if (!openComments || !classified || !commentsRef.current) return;
    commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openComments, classified]);

  useEffect(() => {
    if (!classified?.category) return;
    api.get(`/classifieds/search?q=${encodeURIComponent(classified.category)}`)
      .then(r => setRelated((r.data || []).filter(c => c.id !== classified.id).slice(0, 4)))
      .catch(() => {});
  }, [classified?.category]); // eslint-disable-line

  // Links to the standalone /share backend route so a pasted link into
  // WhatsApp/Facebook shows a real preview card — crawlers don't execute
  // JS, so only a server-rendered response can carry this listing's actual
  // title/image.
  const handleShare = () => {
    if (!classified) return;
    const url = `${api.defaults.baseURL}/share/classified/${classified.id}`;
    if (navigator.share) {
      navigator.share({ title: classified.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      setMessage(t('share.link_copied'));
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const fetchClassified = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/classifieds/${classifiedId}`);
      setClassified(res.data);
    } catch { setError(t('classified_detail.not_found')); }
    finally { setLoading(false); }
  };

  // Logged in: the seller's contact loads with the page (read-only lookup).
  useEffect(() => {
    if (!isLoggedIn || !classifiedId) return;
    api.get(`/classifieds/${classifiedId}/contact`).then(r => setContactInfo(r.data)).catch(() => {});
  }, [isLoggedIn, classifiedId]);


  const goBack = () => onNavigate('back');
  const backBar = (
    <div style={{ height:52, display:'flex', alignItems:'center', padding:'0 8px', backgroundColor:WH, borderBottom:`1px solid ${LINE}` }}>
      <IconBtn label={t('common.back')} onClick={goBack}><Icon d={IC.back} size={22} color={DK} /></IconBtn>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight:'100vh', backgroundColor:WH }}>
      {backBar}
      <PageLoading label={t('classified_detail.loading')} />
    </div>
  );

  if (!classified) return (
    <div style={{ minHeight:'100vh', backgroundColor:WH }}>
      {backBar}
      <div style={{ textAlign:'center', padding:'72px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <span style={{ width:56, height:56, borderRadius:28, backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon d={IC.photo} size={26} /></span>
        <p style={{ margin:0, fontSize:16, fontWeight:700, color:DK }}>{t('classified_detail.not_found')}</p>
        <button type="button" onClick={() => onNavigate('Search')}
          style={{ height:44, padding:'0 22px', borderRadius:22, border:'none', backgroundColor:DK, color:WH, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {t('classified_detail.back_to_classifieds')}
        </button>
      </div>
    </div>
  );

  const hasSpecs = classified.specs && Object.keys(classified.specs).filter(k => classified.specs[k]).length > 0;
  const orderedSpecEntries = (() => {
    if (!hasSpecs) return [];
    const attrs = categorySchema[classified.category]?.[classified.subcategory] || [];
    const attrByKey = new Map(attrs.map(a => [a.key, a]));
    return Object.entries(classified.specs)
      .filter(([, v]) => v)
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
  // The BUSINESS CommerceProfile's identity first; the seller's personal fields
  // only when they have no business profile yet.
  const sellerName = classified.commerceProfile?.displayName || classified.seller?.storeName || classified.seller?.businessName || classified.seller?.name || 'Muuzaji';
  const sellerPhoto = classified.commerceProfile?.photoUrl || classified.seller?.logo;
  const sellerFollowers = classified.commerceProfile?.followersCount ?? classified.seller?.followersCount;
  const sellerNavParams = classified.commerceProfile?.id ? { commerceProfileId: classified.commerceProfile.id } : undefined;
  // Tags the conversation to this exact classified, so the inbox shows it.
  const messageSellerNavParams = { ...sellerNavParams, contextType: 'classified', contextId: classified.id };
  const isVerifiedSeller = ['seller','admin','manager'].includes(classified.seller?.role);
  const openSeller = () => classified.seller?.id && onNavigate(`CommerceProfile-${classified.seller.id}`, sellerNavParams);
  const isOwner = isLoggedIn && currentUser?.id === classified.seller?.id;
  const flashOn = classified.isFlashSale && classified.flashSalePrice;
  const flashEnds = classified.isFlashSale && classified.flashSaleEndsAt && new Date(classified.flashSaleEndsAt) > new Date();
  const listed = new Date(classified.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:WH, color:DK, fontFamily:'inherit' }}>
      <style>{`
        .cd-root { max-width: 480px; margin: 0 auto; width: 100%; padding: 0 0 24px; }
        .cd-grid { display: block; }
        @media (min-width: 768px) {
          .cd-root { max-width: 1100px; padding: 16px 16px 32px; }
          .cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
          .cd-media { border-radius: 16px; overflow: hidden; }
        }
        @media (min-width: 1024px) { .cd-grid { grid-template-columns: 1.1fr 0.9fr; gap: 36px; } }
      `}</style>

      <div style={{ height:52, backgroundColor:'rgba(255,255,255,0.96)', backdropFilter:'blur(8px)', borderBottom:`1px solid ${LINE}`,
        display:'flex', alignItems:'center', padding:'0 8px', position:'sticky', top:0, zIndex:100 }}>
        <IconBtn label={t('common.back')} onClick={goBack}><Icon d={IC.back} size={22} color={DK} /></IconBtn>
        <span style={{ flex:1, minWidth:0, fontSize:16, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'0 4px' }}>{classified.title}</span>
        <IconBtn label={t('share.button')} onClick={handleShare}><Icon d={IC.share} size={20} color={DK} /></IconBtn>
        {isOwner && (
          <div style={{ position:'relative' }}>
            <IconBtn label="Zaidi" onClick={() => setShowMenu(s => !s)}><Icon d={IC.more} size={20} color={DK} /></IconBtn>
            {showMenu && (
              <>
                <div onClick={() => setShowMenu(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />
                <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, backgroundColor:WH, borderRadius:12,
                  boxShadow:'0 4px 20px rgba(0,0,0,0.15)', overflow:'hidden', zIndex:151, minWidth:180 }}>
                  <button type="button" onClick={() => { setShowMenu(false); onNavigate(`EditClassified-${classified.id}`); }} style={menuItem}>Hariri tangazo</button>
                  <button type="button" style={{ ...menuItem, borderTop:`1px solid ${LINE}` }}
                    onClick={() => { setShowMenu(false); onOpenMoment?.('selling', { type: 'classified', id: classified.id, title: classified.title, image: classified.images?.[0] || null }); }}>
                    Shiriki kama Moment
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {message && <div role="status" style={{ backgroundColor:DK, color:WH, padding:'12px 16px', fontSize:14, fontWeight:600, textAlign:'center' }}>{message}</div>}

      <div className="cd-root">
        <div className="cd-grid">

          {/* ── Photos ── */}
          <div className="cd-media" style={{ position:'relative', backgroundColor:'#f7f9f9' }}>
            <div style={{ width:'100%', aspectRatio:'4/3', overflow:'hidden', position:'relative', maxHeight:500 }}>
              {classified.images?.[selectedImage] ? (
                <img src={classified.images[selectedImage]} alt={classified.title} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              ) : (
                <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon d={IC.photo} size={56} color="#cfd9de" /></div>
              )}
              {classified.status && classified.status !== 'active' && (
                <span style={{ position:'absolute', top:12, left:12, height:26, padding:'0 10px', borderRadius:13, fontSize:13, fontWeight:700,
                  display:'flex', alignItems:'center', backgroundColor: classified.status === 'sold' ? '#b91c1c' : DK, color:WH }}>
                  {classified.status === 'sold' ? t('classified_detail.item_sold') : classified.status}
                </span>
              )}
              <div style={{ position:'absolute', top:12, right:12, width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.92)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <WishlistHeart classifiedId={classified.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
              </div>
              {classified.images?.length > 1 && (
                <span style={{ position:'absolute', right:12, bottom:12, height:26, padding:'0 10px', borderRadius:13, backgroundColor:'rgba(15,20,25,0.7)',
                  color:WH, fontSize:13, display:'flex', alignItems:'center' }}>{selectedImage + 1} / {classified.images.length}</span>
              )}
            </div>
            {classified.images?.length > 1 && (
              <div style={{ padding:'8px 12px', display:'flex', gap:8, overflowX:'auto', backgroundColor:WH }}>
                {classified.images.map((img, i) => (
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
            {/* ── Price, title, facts ── */}
            <section style={{ padding:16, borderBottom:`1px solid ${LINE}`, display:'flex', flexDirection:'column', gap:8 }}>
              <div data-testid="cd-price" style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                <span style={{ fontSize:28, fontWeight:800, letterSpacing:-0.3, color: flashOn ? '#b91c1c' : DK }}>
                  TZS {Number(flashOn ? classified.flashSalePrice : classified.price).toLocaleString('en-US')}
                </span>
                {flashOn && <span style={{ fontSize:15, color:GR, textDecoration:'line-through' }}>TZS {Number(classified.originalPrice || classified.price).toLocaleString('en-US')}</span>}
                {classified.isNegotiable && <span style={{ fontSize:14, color:GR }}>{t('classified_detail.negotiable')}</span>}
              </div>
              {flashEnds && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #fecaca', backgroundColor:'#fef2f2', borderRadius:12, padding:'10px 12px' }}>
                  <span style={{ fontSize:14, fontWeight:600, color:'#b91c1c' }}>Punguzo linaisha baada ya</span>
                  <FlashCountdown endsAt={classified.flashSaleEndsAt} />
                </div>
              )}
              <h1 style={{ fontSize:18, fontWeight:600, margin:0, lineHeight:1.35 }}>{classified.title}</h1>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', fontSize:13, color:GR }}>
                {classified.location && <><Icon d={IC.pin} size={14} /><span>{classified.location}</span><span>·</span></>}
                <span>{t('classified_detail.listed')} {listed}</span>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                {classified.condition && <Chip tone="blue">{classified.condition}</Chip>}
                {classified.category && <Chip>{classified.category.replace(/_/g,' ')}</Chip>}
                {classified.subcategory && <Chip>{classified.subcategory.replace(/_/g,' ')}</Chip>}
              </div>
            </section>

            {/* ── Who sells it, and how to reach them (shown straight away) ── */}
            <section data-testid="cd-seller" style={{ margin:16, padding:14, border:`1px solid ${LINE}`, borderRadius:16, display:'flex', flexDirection:'column', gap:12 }}>
              <button type="button" onClick={openSeller}
                style={{ display:'flex', alignItems:'center', gap:12, padding:0, border:'none', background:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:DK }}>
                <Avatar src={sellerPhoto} name={sellerName} size={48} />
                <span style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:16, fontWeight:800, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{contactInfo?.sellerName || sellerName}</span>
                    {isVerifiedSeller && <Verified />}
                  </span>
                  <span style={{ fontSize:13, color:GR, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    <span>{isVerifiedSeller ? t('classified_detail.verified_store') : 'Muuzaji binafsi'}</span>
                    {sellerFollowers != null && <span>· {Number(sellerFollowers).toLocaleString('en-US')} {t('commerce_profile.stat_followers')}</span>}
                    {classified.seller?.reputationScore > 0 && <ReputationBadge score={classified.seller.reputationScore} size="xs" />}
                  </span>
                </span>
                <Icon d={IC.right} size={18} />
              </button>

              {classified.status === 'active' && (
                !isLoggedIn ? (
                  <button type="button" onClick={() => onNavigate('PublicLogin')}
                    style={{ ...contactBtn, backgroundColor:DK, color:WH, border:'none' }}>
                    {t('classified_detail.login_to_contact')}
                  </button>
                ) : (
                  <div data-testid="seller-contact" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8 }}>
                    {classified.seller?.id && !isOwner && (
                      <button type="button" onClick={() => onNavigate(`MessageSeller-${classified.seller.id}`, messageSellerNavParams)}
                        style={{ ...contactBtn, backgroundColor:DK, color:WH, border:'none', gridColumn: contactInfo?.sellerPhone ? 'auto' : '1 / -1' }}>
                        {t('classified_detail.message_seller')}
                      </button>
                    )}
                    {contactInfo?.sellerPhone && listingWhatsAppHref({ phone: contactInfo.sellerPhone }) && (
                      <a href={listingWhatsAppHref({
                        phone: contactInfo.sellerPhone, kind: 'classified', title: classified.title, price: classified.price,
                        url: listingUrl('classified', classified.id), shopName: sellerName,
                      })} target="_blank" rel="noreferrer"
                        style={{ ...contactBtn, backgroundColor:'#25D366', color:WH, border:'none' }}>
                        WhatsApp
                      </a>
                    )}
                    {contactInfo?.sellerPhone && (
                      <a href={`tel:${contactInfo.sellerPhone}`} style={{ ...contactBtn, gridColumn:'1 / -1' }}>
                        Piga simu · {contactInfo.sellerPhone}
                      </a>
                    )}
                    {contactInfo?.sellerEmail && (
                      <a href={`mailto:${contactInfo.sellerEmail}?subject=${encodeURIComponent(classified.title)}`} style={{ ...contactBtn, gridColumn:'1 / -1' }}>
                        Barua pepe
                      </a>
                    )}
                  </div>
                )
              )}
              {classified.status === 'sold' && (
                <div style={{ fontSize:15, fontWeight:700, color:'#b91c1c' }}>{t('classified_detail.item_sold')}</div>
              )}
            </section>

            {hasSpecs && (
              <section style={{ padding:'0 16px 16px' }}>
                <h2 style={sectionTitle}>{t('classified_detail.details')}</h2>
                <div style={{ border:`1px solid ${LINE}`, borderRadius:12, overflow:'hidden' }}>
                  {orderedSpecEntries.map(({ key, label, value }, i) => (
                    <div key={key} style={{ display:'flex', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
                      <div style={{ flex:'0 0 45%', padding:'12px 14px', fontSize:14, color:GR }}>{label}</div>
                      <div style={{ flex:1, padding:'12px 14px', fontSize:14, fontWeight:600 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section style={{ padding:'0 16px 16px' }}>
              <h2 style={sectionTitle}>{t('classified_detail.description')}</h2>
              <p style={{ fontSize:15, lineHeight:'22px', margin:0, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>
                {classified.description || t('classified_detail.no_description')}
              </p>
            </section>

            <section style={{ margin:'0 16px 16px', padding:14, borderRadius:16, border:'1px solid #fde68a', backgroundColor:'#fffbeb' }}>
              <h2 style={{ ...sectionTitle, display:'flex', alignItems:'center', gap:8, color:'#92400e', margin:'0 0 8px' }}>
                <Icon d={IC.shield} size={18} color="#92400e" />{t('classified_detail.safety_tips')}
              </h2>
              <ul style={{ margin:0, paddingLeft:18, color:'#78350f', fontSize:14, lineHeight:1.7 }}>
                <li>{t('classified_detail.tip1')}</li>
                <li>{t('classified_detail.tip2')}</li>
                <li>{t('classified_detail.tip3')}</li>
                <li>{t('classified_detail.tip4')}</li>
              </ul>
            </section>

            {/* Comments/questions from the wider engagement system. */}
            <section ref={commentsRef} style={{ padding:'0 16px 16px' }}>
              <h2 style={sectionTitle}>Maoni na maswali</h2>
              <CommerceCommentSection
                entityType="classified" entityId={classified.id}
                entityTitle={classified.title} sellerId={classified.seller?.id}
                isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate}
                activeProfileId={activeProfileId} />
            </section>
          </div>
        </div>

        {related.length > 0 && (
          <section style={{ padding:16, borderTop:`1px solid ${LINE}` }}>
            <h2 style={{ ...sectionTitle, fontSize:18 }}>Matangazo kama haya</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:'14px 10px' }}>
              {related.map(r => (
                <button type="button" key={r.id} onClick={() => onNavigate(`ClassifiedDetail-${r.id}`)}
                  style={{ display:'flex', flexDirection:'column', gap:6, padding:0, border:'none', background:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit', color:DK, minWidth:0 }}>
                  <span style={{ aspectRatio:'1 / 1', borderRadius:12, overflow:'hidden', backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {r.images?.[0]
                      ? <img src={r.images[0]} alt={r.title} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                      : <Icon d={IC.photo} size={24} color="#cfd9de" />}
                  </span>
                  <span style={{ fontSize:15, fontWeight:800 }}>TZS {Number(r.price||0).toLocaleString('en-US')}</span>
                  <span style={{ fontSize:13, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{r.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div style={{ height:90 }} />
    </div>
  );
};

const menuItem = { width:'100%', textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:'14px 16px', fontSize:15, fontWeight:600, color:DK, fontFamily:'inherit' };
const sectionTitle = { fontSize:16, fontWeight:800, margin:'0 0 10px', color:DK };

export default ClassifiedDetail;
