import React, { useEffect, useState } from 'react';

import api from '../../api/api';

import WishlistHeart   from '../components/WishlistHeart';
import ReputationBadge from '../components/ReputationBadge';
import CommerceCommentSection from '../components/CommerceCommentSection';
import { useTranslation } from 'react-i18next';

// Simple countdown for ClassifiedDetail
const FlashCountdown = ({ endsAt }) => {
  const [t, setT] = React.useState(() => {
    const d = new Date(endsAt) - Date.now();
    return d > 0 ? d : 0;
  });
  React.useEffect(() => {
    const id = setInterval(() => setT(prev => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  if (t <= 0) return <span style={{ fontSize:11, color:'#DC2626', fontWeight:700 }}>Imekwisha</span>;
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const pad = n => String(n).padStart(2,'0');
  return (
    <span style={{ fontSize:14, fontWeight:900, color:'#DC2626',
      fontFamily:'monospace' }}>
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
};


const CAT_ICONS = {
  electronics: '📱', vehicles: '🚗', property: '🏢', fashion: '👗',
  services: '🔧', home_garden: '🏠', health_beauty: '💄', food: '🍎',
  agriculture: '🌾', security: '🔒', baby_kids: '🧸', sports: '⚽',
  books: '📚', arts: '🎨', general: '📦',
};

const ClassifiedDetail = ({ onNavigate, isLoggedIn, onLogout, userRole, classifiedId, currentUser, onOpenMoment, openComments, activeProfileId }) => {
  const { t } = useTranslation();
  const [classified, setClassified]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showContact, setShowContact]   = useState(false);
  const [contactInfo, setContactInfo]   = useState(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState(null);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm]   = useState({ buyerName: '', buyerPhone: '', deliveryAddress: '', message: '' });
  const [showOffer,   setShowOffer]     = useState(false);
  const [offerAmount, setOfferAmount]   = useState('');
  const [offerNote,   setOfferNote]     = useState('');
  const [offerSent,   setOfferSent]     = useState(false);
  const [offerLoading,setOfferLoading]  = useState(false);
  const [message, setMessage]           = useState(''); // eslint-disable-line no-unused-vars
  const [showMenu, setShowMenu]         = useState(false);
  const [related, setRelated]           = useState([]);
  const [error, setError]               = useState('');
  const [wishlist, setWishlist]         = useState(false);
  const commentsRef = React.useRef(null);

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

  const handleShowContact = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      setLoadingContact(true);
      const res = await api.get(`/classifieds/${classifiedId}/contact`);
      setContactInfo(res.data); setShowContact(true);
    } catch { setError('Failed to load contact info'); }
    finally { setLoadingContact(false); }
  };

  const handleRequestInvoice = async () => {
    if (!invoiceForm.buyerName.trim()) { setError(t('classified_detail.name_required')); return; }
    if (!invoiceForm.buyerPhone.trim()) { setError(t('classified_detail.phone_required')); return; }
    if (!invoiceForm.deliveryAddress.trim()) { setError(t('classified_detail.address_required')); return; }
    try {
      setSendingInvoice(true); setError('');
      const res = await api.post(`/classifieds/${classifiedId}/request-invoice`, {
        buyerName:       invoiceForm.buyerName.trim(),
        buyerPhone:      invoiceForm.buyerPhone.trim(),
        deliveryAddress: invoiceForm.deliveryAddress.trim(),
        message:         invoiceForm.message.trim(),
      });
      setInvoiceResult(res.data); setShowInvoiceForm(false);
      setInvoiceForm({ buyerName: '', buyerPhone: '', deliveryAddress: '', message: '' });
    } catch (err) { setError(err?.response?.data?.message || 'Failed to send request'); }
    finally { setSendingInvoice(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('ClassifiedsPublic')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ textAlign: 'center', padding: '80px 16px', color: '#64748b' }}><div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>{t('classified_detail.loading')}</div>
    </div>
  );

  if (!classified) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('ClassifiedsPublic')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ textAlign: 'center', padding: '80px 16px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <p style={{ color: '#64748b' }}>{t('classified_detail.not_found')}</p>
        <button onClick={() => onNavigate('ClassifiedsPublic')} style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', marginTop: 16, fontWeight: 700 }}>{t('classified_detail.back_to_classifieds')}</button>
      </div>
    </div>
  );

  const hasSpecs = classified.specs && Object.keys(classified.specs).filter(k => classified.specs[k]).length > 0;
  const catIcon  = CAT_ICONS[classified.category] || '📋';
  // Prefer the BUSINESS CommerceProfile's own identity — same fix as
  // ProductDetail.js. Falls back to the seller's personal fields when
  // they have no business profile yet.
  const sellerName = classified.commerceProfile?.displayName || classified.seller?.storeName || classified.seller?.businessName || classified.seller?.name || 'Seller';
  const sellerPhoto = classified.commerceProfile?.photoUrl || classified.seller?.logo;
  const sellerFollowers = classified.commerceProfile?.followersCount ?? classified.seller?.followersCount;
  const sellerNavParams = classified.commerceProfile?.id ? { commerceProfileId: classified.commerceProfile.id } : undefined;
  const isVerifiedSeller = ['seller','admin','manager'].includes(classified.seller?.role);

  const handleMakeOffer = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!offerAmount || Number(offerAmount) <= 0) {
      alert('Enter your offer price'); return;
    }
    try {
      setOfferLoading(true);
      await api.post('/offers', {
        classifiedId: classified.id,
        offerAmount:  Number(offerAmount),
        buyerNote:    offerNote || undefined,
      });
      setOfferSent(true);
      setShowOffer(false);
      alert('✅ Your offer was sent to the seller!');
    } catch (e) {
      alert(e.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setOfferLoading(false);
    }
  };


  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <style>{`
        .cd-root { max-width: 480px; margin: 0 auto; width: 100%; padding: 0 0 24px; }
        .cd-grid { display: block; }
        .cd-left { width: 100%; }
        .cd-right { width: 100%; }
        @media (min-width: 768px) {
          .cd-root { max-width: 1100px; padding: 0 16px 32px; }
          .cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; margin-top: 16px; }
          .cd-left > *, .cd-right > * { border-radius: 12px !important; }
        }
        @media (min-width: 1024px) {
          .cd-grid { grid-template-columns: 1.1fr 0.9fr; gap: 36px; }
        }
      `}</style>

      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('ClassifiedsPublic')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A', overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'left' }}>{classified.title}</span>
        </button>
        <button onClick={handleShare} title={t('share.button')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, color: '#0F172A', padding: '4px 8px', flexShrink:0, marginLeft:8 }}>
          🔗
        </button>
        {isLoggedIn && currentUser?.id === classified.seller?.id && (
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
                  <button onClick={() => { setShowMenu(false); onNavigate(`EditClassified-${classified.id}`); }}
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

      {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>✅ {message}</div>}

      <div className="cd-root">
        <div className="cd-grid">

        <div className="cd-left">

        <div style={{ position: 'relative', backgroundColor: '#fff' }}>
          <div style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', position: 'relative', maxHeight: 500 }}>
            {classified.images?.[selectedImage] ? (
              <img src={classified.images[selectedImage]} alt={classified.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', fontSize: 80 }}>📋</div>
            )}
            <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              backgroundColor: classified.status === 'active' ? '#dcfce7' : classified.status === 'sold' ? '#fee2e2' : '#fef9c3',
              color: classified.status === 'active' ? '#16a34a' : classified.status === 'sold' ? '#dc2626' : '#ca8a04',
            }}>{classified.status?.toUpperCase()}</span>
            <button onClick={() => setWishlist(w => !w)}
              style={{ position: 'absolute', top: 10, right: 12, width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
              {wishlist ? '❤️' : '🤍'}
            </button>
            {classified.images?.length > 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                {classified.images.map((_, i) => (
                  <div key={i} onClick={() => setSelectedImage(i)}
                    style={{ width: i === selectedImage ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === selectedImage ? '#7c3aed' : 'rgba(255,255,255,0.7)', cursor: 'pointer', transition: 'all 0.2s' }} />
                ))}
              </div>
            )}
          </div>
          {classified.images?.length > 1 && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid #f1f5f9' }}>
              {classified.images.map((img, i) => (
                <img key={i} src={img} alt="" onClick={() => setSelectedImage(i)}
                  style={{ width: 54, height: 54, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: i === selectedImage ? '2px solid #7c3aed' : '2px solid #e2e8f0', cursor: 'pointer' }} />
              ))}
            </div>
          )}
        </div>

        </div>

        <div className="cd-right">

        <div style={{ backgroundColor: '#fff', padding: '14px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff' }}>
              {catIcon} {classified.category?.replace(/_/g,' ')}
            </span>
            {classified.subcategory && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                {classified.subcategory?.replace(/_/g,' ')}
              </span>
            )}
            {classified.condition && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                {classified.condition}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 10px', lineHeight: 1.4 }}>{classified.title}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: classified.isFlashSale ? '#DC2626' : '#7c3aed' }}>
              {classified.isFlashSale && classified.flashSalePrice
                ? <>TZS {Number(classified.flashSalePrice).toLocaleString()}
                    <span style={{ fontSize:13, textDecoration:'line-through', color:'#94A3B8',
                      marginLeft:8, fontWeight:600 }}>
                      TZS {Number(classified.originalPrice||classified.price).toLocaleString()}
                    </span>
                  </>
                : <>TZS {Number(classified.price).toLocaleString()}</>
              }
            </span>
            {classified.isFlashSale && classified.flashSaleEndsAt &&
              new Date(classified.flashSaleEndsAt) > new Date() && (
              <div style={{ backgroundColor:'#FFF5F5', border:'1px solid #FCA5A5',
                borderRadius:10, padding:'10px 14px', marginTop:8,
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#DC2626' }}>
                  ⏰ Flash Sale inaisha:
                </span>
                <FlashCountdown endsAt={classified.flashSaleEndsAt} />
              </div>
            )}
            <WishlistHeart classifiedId={classified.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={26} />
            {classified.isNegotiable && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>· {t('classified_detail.negotiable')}</span>}
          </div>
          {classified.location && (
            <div style={{ fontSize: 13, color: '#64748b' }}>📍 {classified.location}</div>
          )}
        </div>

        <div style={{ backgroundColor: '#fff', padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div onClick={() => classified.seller?.id && onNavigate(`CommerceProfile-${classified.seller.id}`, sellerNavParams)}
              style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}>
              {sellerPhoto ? <img src={sellerPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sellerName[0]}
            </div>
            <div>
              <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                <span onClick={() => classified.seller?.id && onNavigate(`CommerceProfile-${classified.seller.id}`, sellerNavParams)}
                  style={{ fontSize:13,fontWeight:800,color:'#1d4ed8',cursor:'pointer' }}>
                  {sellerName}
                </span>
                {classified.seller?.reputationScore > 0 && (
                  <ReputationBadge score={classified.seller.reputationScore} size="xs" />
                )}
                {sellerFollowers != null && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>· {sellerFollowers.toLocaleString()} {t('commerce_profile.stat_followers')}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t('classified_detail.listed')} {new Date(classified.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
          </div>
        </div>

        {isLoggedIn && currentUser?.id === classified.seller?.id && (
          <div style={{ backgroundColor: '#fff', padding: '0 16px 12px' }}>
            <button onClick={() => onOpenMoment?.('selling', {
                type: 'classified', id: classified.id, title: classified.title,
                image: classified.images?.[0] || null,
              })}
              style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                color:'#2563EB', fontSize:12, fontWeight:700 }}>
              📸 Share as Moment
            </button>
          </div>
        )}

        {hasSpecs && (
          <div style={{ backgroundColor: '#fff', padding: '14px 16px', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>📋 {t('classified_detail.details')}</h3>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {Object.entries(classified.specs).filter(([,v]) => v).map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                  <div style={{ flex: '0 0 45%', padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>{k}</div>
                  <div style={{ flex: 1, padding: '10px 14px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ backgroundColor: '#fff', padding: '14px 16px', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>📄 {t('classified_detail.description')}</h3>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.8, margin: 0 }}>
            {classified.description || t('classified_detail.no_description')}
          </p>
        </div>

        <div style={{ backgroundColor: '#fef9c3', borderRadius: 14, padding: 16, margin: '0 0 8px', border: '1px solid #fde68a' }}>
          <h4 style={{ color: '#92400e', fontSize: 13, fontWeight: 800, margin: '0 0 8px' }}>⚠️ {t('classified_detail.safety_tips')}</h4>
          <ul style={{ margin: 0, paddingLeft: 16, color: '#92400e', fontSize: 12, lineHeight: 2 }}>
            <li>{t('classified_detail.tip1')}</li>
            <li>{t('classified_detail.tip2')}</li>
            <li>{t('classified_detail.tip3')}</li>
            <li>{t('classified_detail.tip4')}</li>
          </ul>
        </div>

        {classified.status === 'active' && (
          <div style={{ padding: '0 0 16px' }}>

            {isVerifiedSeller && (
              <>
                <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { icon: '🛡️', text: t('classified_detail.kentexa_protection') },
                      { icon: '✅', text: t('classified_detail.verified_store') },
                      { icon: '↩️', text: t('classified_detail.return_policy') },
                      { icon: '🤝', text: t('classified_detail.pay_via_agent') },
                    ].map(b => (
                      <div key={b.text} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        {b.icon} {b.text}
                      </div>
                    ))}
                  </div>
                </div>

                {invoiceResult && (
                  <div style={{ backgroundColor: '#dcfce7', borderRadius: 14, padding: 18, marginBottom: 10, border: '2px solid #86efac', textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                    <h3 style={{ fontSize: 15, fontWeight: 900, color: '#15803d', margin: '0 0 6px' }}>{t('classified_detail.request_sent')}</h3>
                    <p style={{ fontSize: 13, color: '#166534', margin: '0 0 12px' }}>{t('classified_detail.request_sent_desc')}</p>
                    <button onClick={() => onNavigate('MyOrders')} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>📋 {t('classified_detail.view_orders')}</button>
                  </div>
                )}

                {!invoiceResult && (
                  <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 10, border: '2px solid #7c3aed', boxShadow: '0 4px 16px rgba(124,58,237,0.1)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>🧾</span>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', margin: 0 }}>{t('classified_detail.pay_via_kentexa')}</h3>
                        <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{t('classified_detail.secure_payment_desc')}</p>
                      </div>
                    </div>
                    {!showInvoiceForm ? (
                      <button onClick={() => { if (!isLoggedIn) { onNavigate('PublicLogin'); return; } setShowInvoiceForm(true); }}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                        📄 {t('classified_detail.request_invoice')}
                      </button>
                    ) : (
                      <div>
                        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>❌ {error}<button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>×</button></div>}
                        {[
                          { label: t('classified_detail.your_name'), key: 'buyerName', placeholder: 'e.g. Amina Hassan', type: 'text' },
                          { label: t('classified_detail.your_phone'), key: 'buyerPhone', placeholder: '255712345678', type: 'tel' },
                          { label: t('classified_detail.delivery_address'), key: 'deliveryAddress', placeholder: 'e.g. Mwanza, Ilemela', type: 'text' },
                        ].map(f => (
                          <div key={f.key} style={{ marginBottom: 10 }}>
                            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{f.label}</label>
                            <input type={f.type} placeholder={f.placeholder} value={invoiceForm[f.key]}
                              onChange={e => setInvoiceForm({ ...invoiceForm, [f.key]: e.target.value })}
                              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                              onFocus={e => e.target.style.border = '2px solid #7c3aed'}
                              onBlur={e => e.target.style.border = '2px solid #e2e8f0'} />
                          </div>
                        ))}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>{t('classified_detail.message_to_seller')}</label>
                          <textarea placeholder={t('classified_detail.message_placeholder')} rows={2} value={invoiceForm.message}
                            onChange={e => setInvoiceForm({ ...invoiceForm, message: e.target.value })}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setShowInvoiceForm(false); setError(''); }} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('classified_detail.cancel')}</button>
                          <button onClick={handleRequestInvoice} disabled={sendingInvoice}
                            style={{ flex: 2, background: sendingInvoice ? '#a5b4fc' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', padding: 11, borderRadius: 8, cursor: sendingInvoice ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                            {sendingInvoice ? `⏳ ${t('classified_detail.sending')}` : `📤 ${t('classified_detail.send_request')}`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {!isVerifiedSeller && (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 14, padding: '12px 14px', marginBottom: 10, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>
                  ℹ️ {t('classified_detail.individual_seller_note')}
                </div>
              </div>
            )}

            {!showContact ? (
              <button onClick={handleShowContact} disabled={loadingContact}
                style={{ width: '100%', backgroundColor: '#fff', color: '#1e293b', border: '2px solid #e2e8f0', padding: 13, borderRadius: 12, cursor: loadingContact ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                {loadingContact ? '⏳...' : isLoggedIn ? `📞 ${t('classified_detail.contact_seller')}` : `🔐 ${t('classified_detail.login_to_contact')}`}
              </button>
            ) : (
              <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{contactInfo?.sellerName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {isVerifiedSeller ? `✅ ${t('classified_detail.verified_store')}` : 'Individual Seller'}
                    </div>
                  </div>
                </div>
                {!contactInfo?.sellerPhone && !contactInfo?.sellerEmail ? (
                  <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                    ⚠️ {t('classified_detail.no_contact_info')}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {classified.seller?.id && (
                      <button onClick={() => onNavigate(`MessageSeller-${classified.seller.id}`, sellerNavParams)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        💬 {t('classified_detail.message_seller')}
                      </button>
                    )}
                    {contactInfo?.sellerPhone && (
                      <a href={`https://wa.me/${contactInfo.sellerPhone?.replace('+','')}?text=${encodeURIComponent(`Hi, I'm interested in: ${classified.title}`)}`} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, backgroundColor: '#25D366', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 800 }}>
                        💬 WhatsApp
                      </a>
                    )}
                    {classified?.isNegotiable && !offerSent && (
                      <button onClick={() => setShowOffer(true)}
                        style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:11,backgroundColor:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:800,width:'100%' }}>
                        💰 Remove Price Yako
                      </button>
                    )}
                    {contactInfo?.sellerPhone && (
                      <a href={`tel:${contactInfo.sellerPhone}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, backgroundColor: '#3b82f6', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 800 }}>
                        📞 Call
                      </a>
                    )}
                    {contactInfo?.sellerEmail && (
                      <a href={`mailto:${contactInfo.sellerEmail}?subject=Inquiry: ${classified.title}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, backgroundColor: '#f59e0b', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 800, gridColumn: '1/-1' }}>
                        📧 Email Seller
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {classified.status === 'sold' && (
          <div style={{ backgroundColor: '#fee2e2', borderRadius: 14, padding: 24, textAlign: 'center', border: '2px solid #fecaca', margin: '0 0 16px' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏷️</div>
            <p style={{ color: '#dc2626', fontWeight: 800, margin: 0, fontSize: 15 }}>{t('classified_detail.item_sold')}</p>
          </div>
        )}

        <button onClick={() => onNavigate('ClassifiedsPublic')} style={{ width: '100%', backgroundColor: 'transparent', color: '#7c3aed', border: '2px solid #7c3aed', padding: 12, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
          ← {t('classified_detail.back_to_classifieds')}
        </button>

        {/* Comments/questions from the wider engagement system — this
            listing had nowhere at all to show them before, so a "New
            comment" notification about it landed here with no way to
            actually see or reply to it. */}
        {classified && (
          <div ref={commentsRef} style={{ marginTop: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
              💬 Comments & Questions
            </div>
            <CommerceCommentSection
              entityType="classified" entityId={classified.id}
              entityTitle={classified.title} sellerId={classified.seller?.id}
              isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate}
              activeProfileId={activeProfileId} />
          </div>
        )}

        </div>
        </div>
      </div>


      {/* Recommendations */}
      {related.length > 0 && (
        <div style={{ padding: '0 16px 32px', maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', marginBottom: 14 }}>
            🛍️ Bidhaa Kama Hii
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            {related.map(r => (
              <div key={r.id} onClick={() => onNavigate(`ClassifiedDetail-${r.id}`)}
                style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
                  cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ height: 120, backgroundColor: '#f8fafc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {r.images?.[0]
                    ? <img src={r.images[0]} alt={r.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => e.target.style.display = 'none'} />
                    : <span style={{ fontSize: 36 }}>🏷️</span>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#1d4ed8', marginTop: 2 }}>
                    TZS {Number(r.price||0).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offer Modal */}
      {showOffer && (
        <div style={{ position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',
          zIndex:3000,display:'flex',alignItems:'flex-end' }}>
          <div style={{ width:'100%',backgroundColor:'#fff',
            borderRadius:'20px 20px 0 0',padding:'24px 20px 40px' }}>
            <div style={{ fontSize:16,fontWeight:900,color:'#1e293b',marginBottom:4 }}>
              💰 Toa Bei Yako
            </div>
            <div style={{ fontSize:12,color:'#64748b',marginBottom:16 }}>
              Price ya muuzaji: TZS {Number(classified.price||0).toLocaleString()}
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12,fontWeight:700,color:'#64748b',
                display:'block',marginBottom:6 }}>Price Unayotoa (TZS) *</label>
              <input type="number"
                style={{ width:'100%',padding:'12px 14px',borderRadius:10,
                  border:'1.5px solid #e2e8f0',fontSize:16,fontWeight:800,
                  boxSizing:'border-box',outline:'none',color:'#1d4ed8' }}
                placeholder="e.g. 45000"
                value={offerAmount}
                onChange={e => setOfferAmount(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12,fontWeight:700,color:'#64748b',
                display:'block',marginBottom:6 }}>Message (hiari)</label>
              <textarea
                style={{ width:'100%',padding:'10px 14px',borderRadius:10,
                  border:'1px solid #e2e8f0',fontSize:13,resize:'vertical',
                  minHeight:70,boxSizing:'border-box',outline:'none',fontFamily:'inherit' }}
                placeholder="e.g. Naweza kuja leo..."
                value={offerNote}
                onChange={e => setOfferNote(e.target.value)} />
            </div>
            <div style={{ display:'flex',gap:10 }}>
              <button onClick={() => setShowOffer(false)}
                style={{ flex:1,backgroundColor:'#f1f5f9',color:'#64748b',
                  border:'none',borderRadius:10,padding:'13px 0',
                  cursor:'pointer',fontSize:14,fontWeight:700 }}>
                Funga
              </button>
              <button onClick={handleMakeOffer} disabled={offerLoading}
                style={{ flex:2,background:'linear-gradient(135deg,#16a34a,#15803d)',
                  color:'#fff',border:'none',borderRadius:10,padding:'13px 0',
                  cursor:offerLoading?'not-allowed':'pointer',
                  fontSize:14,fontWeight:800 }}>
                {offerLoading ? '⏳...' : '✅ Send Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 90 }} />
    </div>
  );
};

export default ClassifiedDetail;