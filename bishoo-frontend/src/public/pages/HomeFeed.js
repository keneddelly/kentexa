/**
 * HomeFeed.js — Instagram-style commerce feed
 * Place at: src/public/pages/HomeFeed.js
 *
 * Post types and their actions:
 *  classified  → Save ❤️ | Ask 💬 | Share ↗ | Contact 📞 | Ship 📦 | Follow 👤
 *  product     → Save ❤️ | Ask 💬 | Share ↗ | Buy Now 🛒 | Cart 🛍️ | Follow 👤
 *  service     → Save ❤️ | Ask 💬 | Share ↗ | Book 📅 | Contact 📞 | Follow 👤
 *
 * Engagement tracking:
 *  All saves/shares/views go to POST /engagements (entity-based, works on virtual IDs)
 *  Comments go to POST /comments (entity-based)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReputationBadge from '../components/ReputationBadge';
import CommerceCommentSection from '../components/CommerceCommentSection';
import AiSearchBar from '../components/AiSearchBar';
import api             from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';

const B   = '#2563EB';
const DK  = '#0F172A';
const GR  = '#64748B';
const WH  = '#FFFFFF';
const fmt = n => Number(n||0).toLocaleString();
const getAgo = t => d => {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return t('home_feed.just_now');
  if (s < 3600)  return t('home_feed.minutes_ago', { count: Math.floor(s/60) });
  if (s < 86400) return t('home_feed.hours_ago', { count: Math.floor(s/3600) });
  return t('home_feed.days_ago', { count: Math.floor(s/86400) });
};

const getFilters = t => [
  { key:'for_you',    label:t('home_feed.filter_for_you')       },
  { key:'following',  label:t('home_feed.filter_following') },
  { key:'nearby',     label:t('home_feed.filter_nearby')      },
  { key:'trending',   label:t('home_feed.filter_trending')     },
  { key:'products',   label:t('home_feed.filter_products')    },
  { key:'services',   label:t('home_feed.filter_services')      },
  { key:'transport',  label:t('home_feed.filter_transport')     },
  { key:'businesses', label:t('home_feed.filter_businesses')    },
];

const getTypeMeta = t => ({
  classified:  { label:t('home_feed.type_listing'),   bg:'#FFF7ED', color:'#EA580C' },
  product:     { label:t('home_feed.type_products'),  bg:'#EFF6FF', color:B         },
  service:     { label:t('home_feed.type_services'),    bg:'#F0FDF4', color:'#16A34A' },
  new_product: { label:t('home_feed.type_products'),  bg:'#EFF6FF', color:B         },
  new_service: { label:t('home_feed.type_services'),    bg:'#F0FDF4', color:'#16A34A' },
  discount:    { label:t('home_feed.type_discount'),   bg:'#FFF7ED', color:'#EA580C' },
  announcement:{ label:t('home_feed.type_listing'),   bg:'#FEF3C7', color:'#D97706' },
  delivery_info:{ label:t('home_feed.type_transport'),  bg:'#FEF3C7', color:'#D97706' },
  looking_for: { label:t('home_feed.type_looking_for'), bg:'#F5F3FF', color:'#7C3AED' },
  moment:      { label:t('home_feed.type_moment'),      bg:'#EFF6FF', color:B         },
});

// ── Engagement service (works on virtual + real post IDs) ─────────────────────
const Engagement = {
  async track(postId, entityType, entityId, type, isLoggedIn, onNavigate) {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return null; }
    try {
      // For real feed posts use /feed/:id/engage
      // For virtual posts (cls/prd/svc) use /engagements
      if (typeof postId === 'number' || /^\d+$/.test(String(postId))) {
        const res = await api.post(`/feed/${postId}/engage`, { type });
        return res.data;
      } else {
        // Virtual post - store engagement by entity
        const res = await api.post('/engagements', { entityType, entityId, type });
        return res.data;
      }
    } catch { return null; }
  },
};

// ── Contact modal ─────────────────────────────────────────────────────────────
const ContactModal = ({ post, onClose, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const biz   = post.business || {};
  const phone = (biz.storeWhatsApp || biz.phone || '').replace(/^0/,'255').replace(/[^0-9]/g,'');
  const title = post.title || '';
  const waMsg = encodeURIComponent(`Hi! I have a question about: ${title}`);

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)',
      zIndex:4000, display:'flex', alignItems:'flex-end' }}>
      <div style={{ width:'100%', backgroundColor:WH, borderRadius:'20px 20px 0 0',
        padding:'24px 20px 44px', animation:'slideUp 0.2s ease' }}>
        <div style={{ width:36, height:4, borderRadius:100, backgroundColor:'#E2E8F0',
          margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:900, color:DK, marginBottom:4 }}>
          {t('home_feed.contact_title', { name: biz.storeName || biz.name })}
        </div>
        <div style={{ fontSize:12, color:GR, marginBottom:20 }}>{t('home_feed.about_label', { title })}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={() => { onNavigate(isLoggedIn ? `MessageSeller-${biz.id}` : 'PublicLogin'); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'16px',
              backgroundColor:'#EFF6FF', borderRadius:14, border:'none', cursor:'pointer',
              textAlign:'left', width:'100%' }}>
            <span style={{ fontSize:28 }}>📨</span>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:DK }}>{t('home_feed.kentexa_inbox_label')}</div>
              <div style={{ fontSize:11, color:GR }}>{t('home_feed.send_in_app_desc')}</div>
            </div>
          </button>
          {phone && (
            <a href={`https://wa.me/${phone}?text=${waMsg}`}
              target="_blank" rel="noreferrer"
              onClick={onClose}
              style={{ display:'flex', alignItems:'center', gap:14, padding:'16px',
                backgroundColor:'#F0FDF4', borderRadius:14, textDecoration:'none' }}>
              <span style={{ fontSize:28 }}>📲</span>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:'#16A34A' }}>{t('home_feed.whatsapp_label')}</div>
                <div style={{ fontSize:11, color:GR }}>{t('home_feed.chat_directly_desc')}</div>
              </div>
            </a>
          )}
          <button onClick={onClose}
            style={{ padding:'13px', backgroundColor:'#F1F5F9', border:'none',
              borderRadius:12, cursor:'pointer', fontSize:14, fontWeight:700, color:GR }}>
            {t('home_feed.close_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Comments section ──────────────────────────────────────────────────────────
const CommentSection = ({ post, isLoggedIn, onNavigate, currentUser, activeProfileId }) => {
  const { t } = useTranslation();
  const ago = getAgo(t);
  const [comments, setComments] = useState([]);
  const [body,     setBody]     = useState('');
  const [replyTo,  setReplyTo]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [sending,  setSending]  = useState(false);
  const [showReply,    setShowReply]    = useState(false);
  const [myItems,       setMyItems]      = useState([]);
  const [loadingItems,  setLoadingItems] = useState(false);
  const [replyItem,     setReplyItem]    = useState(null);
  const [replySending,  setReplySending] = useState(false);
  const inputRef = useRef(null);

  const isLookingFor = post.type === 'looking_for';

  // Determine endpoint based on post type
  const isRealPost = typeof post.id === 'number' || /^\d+$/.test(String(post.id));
  const commentsUrl = isRealPost
    ? `/feed/${post.id}/comments`
    : `/comments?entityType=${post.entityType}&entityId=${post.entityId}`;
  const postCommentUrl = isRealPost
    ? `/feed/${post.id}/comments`
    : `/comments`;

  useEffect(() => {
    setLoading(true);
    api.get(commentsUrl)
      .then(r => setComments(r.data || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [commentsUrl]);

  const handleSend = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!body.trim()) return;
    try {
      setSending(true);
      const payload = isRealPost
        ? { body: body.trim(), parentId: replyTo?.id || undefined, commerceProfileId: activeProfileId || undefined }
        : { body: body.trim(), entityType: post.entityType,
            entityId: post.entityId, parentId: replyTo?.id || undefined,
            commerceProfileId: activeProfileId || undefined };
      const res = await api.post(postCommentUrl, payload);
      const newComment = { ...res.data, replies: [] };
      if (replyTo) {
        setComments(prev => prev.map(c =>
          c.id === replyTo.id
            ? { ...c, replies: [...(c.replies||[]), newComment] }
            : c
        ));
      } else {
        setComments(prev => [...prev, newComment]);
      }
      setBody('');
      setReplyTo(null);
    } catch {}
    finally { setSending(false); }
  };

  const openReply = () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setShowReply(true);
    if (myItems.length || loadingItems) return;
    const uid = currentUser?.id;
    if (!uid) return;
    setLoadingItems(true);
    // Scoped to the active profile — see CreateMomentModal.js's identical
    // fix for why (Kened's Personal profile must not offer Bishoo
    // Intelligence Systems' products, and vice versa).
    const productsCall = activeProfileId
      ? api.get(`/products/profile/${activeProfileId}`)
      : api.get(`/products/seller/${uid}`);
    const classifiedsCall = activeProfileId
      ? api.get(`/classifieds/profile/${activeProfileId}`)
      : api.get(`/classifieds/seller/${uid}`);
    const servicesCall = api.get('/services/my/ads', {
      params: activeProfileId ? { commerceProfileId: activeProfileId } : undefined,
    });
    Promise.allSettled([classifiedsCall, productsCall, servicesCall]).then(([cl, pr, sv]) => {
      const items = [];
      if (cl.status === 'fulfilled') {
        (cl.value.data || []).forEach(c => items.push({
          type: 'classified', id: c.id, title: c.title, image: c.images?.[0],
        }));
      }
      if (pr.status === 'fulfilled') {
        (pr.value.data || []).forEach(p => items.push({
          type: 'product', id: p.id, title: p.name, image: p.images?.[0],
        }));
      }
      if (sv.status === 'fulfilled') {
        (sv.value.data?.ads || sv.value.data || []).forEach(s => items.push({
          type: 'service', id: s.id, title: s.title, image: s.images?.[0],
        }));
      }
      setMyItems(items);
    }).finally(() => setLoadingItems(false));
  };

  const sendOffer = async () => {
    if (!replyItem) return;
    try {
      setReplySending(true);
      const res = await api.post(postCommentUrl, {
        body: `I have this — ${replyItem.title}`,
        offer: { entityType: replyItem.type, entityId: replyItem.id },
        commerceProfileId: activeProfileId || undefined,
      });
      setComments(prev => [...prev, { ...res.data, replies: [] }]);
      setShowReply(false);
      setReplyItem(null);
    } catch {}
    finally { setReplySending(false); }
  };

  const Comment = ({ c, isReply = false }) => {
    // Show whichever profile the commenter was actually acting as — not
    // always their personal account. Falls back to the account identity
    // for comments predating this (commerceProfile null).
    const commenterName = c.commerceProfile?.displayName || c.author?.storeName || c.author?.name || t('home_feed.user_fallback');
    const commenterPhoto = c.commerceProfile?.photoUrl || c.author?.avatarUrl || c.author?.logo;
    return (
    <div style={{ display:'flex', gap:8,
      padding: isReply ? '6px 0 4px 36px' : '10px 0',
      borderBottom: isReply ? 'none' : '1px solid #F8FAFC' }}>
      <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
        backgroundColor:B, display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:11, color:WH, fontWeight:900, overflow:'hidden' }}>
        {commenterPhoto
          ? <img src={commenterPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : commenterName.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ fontSize:12, fontWeight:800, color:DK }}>
            {commenterName}
          </span>
          <span style={{ fontSize:10, color:GR }}>{ago(c.createdAt)}</span>
        </div>
        <div style={{ fontSize:13, color: c.isDeleted ? GR : DK,
          lineHeight:1.4, fontStyle: c.isDeleted ? 'italic' : 'normal' }}>
          {c.body}
        </div>
        {c.offerCard && (
          <button onClick={() => {
              const entType = c.offerCard.entityType;
              const id = c.offerCard.entityId;
              if (entType === 'product') onNavigate(`ProductDetail-${id}`);
              else if (entType === 'service') onNavigate(`ServiceDetail-${id}`);
              else if (entType === 'route') {
                const pid = c.offerCard.providerUserId;
                if (pid) onNavigate(`CommerceProfile-${pid}-transport`);
                else onNavigate('SendShipment');
              }
              else onNavigate(`ClassifiedDetail-${id}`);
            }}
            style={{ display:'flex', alignItems:'center', gap:10, marginTop:8,
              padding:8, borderRadius:10, border:'1px solid #E9D5FF',
              backgroundColor:'#F5F3FF', cursor:'pointer', width:'100%',
              maxWidth:280, textAlign:'left' }}>
            <div style={{ width:36, height:36, borderRadius:8, backgroundColor:'#EDE9FE',
              flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:16 }}>
              {c.offerCard.image
                ? <img src={c.offerCard.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                : '🛍️'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:800, color:DK,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {c.offerCard.title}
              </div>
              {c.offerCard.price != null && (
                <div style={{ fontSize:12, fontWeight:900, color:'#7C3AED' }}>
                  TZS {fmt(c.offerCard.price)}
                </div>
              )}
            </div>
            <span style={{ fontSize:10, fontWeight:800, color:'#7C3AED', flexShrink:0 }}>
              {t('home_feed.view_arrow')}
            </span>
          </button>
        )}
        {!c.isDeleted && !isReply && (
          <button onClick={() => {
            if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
            setReplyTo(c); inputRef.current?.focus();
          }}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:GR, fontSize:11, fontWeight:700, padding:'4px 0 0' }}>
            {t('home_feed.reply_button')}
          </button>
        )}
        {c.replies?.map(r => <Comment key={r.id} c={r} isReply />)}
      </div>
    </div>
    );
  };

  return (
    <div style={{ backgroundColor:'#F8FAFC', borderTop:'1px solid #F1F5F9' }}>
      <div style={{ padding:'8px 14px', maxHeight:260, overflowY:'auto' }}>
        {loading
          ? <div style={{ fontSize:12, color:GR, padding:'8px 0' }}>{t('home_feed.loading_comments')}</div>
          : comments.length === 0
            ? <div style={{ fontSize:12, color:GR, padding:'8px 0' }}>
                {t('home_feed.be_first_to_ask')}
              </div>
            : comments.map(c => <Comment key={c.id} c={c} />)
        }
      </div>
      {isLookingFor && (
        <div style={{ padding:'0 14px 10px' }}>
          <button onClick={openReply}
            style={{ width:'100%', backgroundColor:'#F5F3FF', color:'#7C3AED',
              border:'1px solid #E9D5FF', borderRadius:10, padding:'10px 0',
              cursor:'pointer', fontSize:13, fontWeight:800 }}>
            {t('home_feed.have_this_reply_button')}
          </button>
        </div>
      )}
      <div style={{ display:'flex', gap:8, padding:'10px 14px',
        borderTop:'1px solid #F1F5F9', backgroundColor:WH }}>
        <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
          backgroundColor:B, display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:11, color:WH, fontWeight:900 }}>
          {(currentUser?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex:1, backgroundColor:'#F1F5F9', borderRadius:20,
          display:'flex', alignItems:'center', padding:'0 12px', gap:6 }}>
          {replyTo && (
            <span style={{ fontSize:11, color:B, fontWeight:700 }}>
              @{replyTo.author?.name?.split(' ')[0]}
            </span>
          )}
          <input ref={inputRef} value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            onClick={() => !isLoggedIn && onNavigate('PublicLogin')}
            placeholder={isLoggedIn
              ? (replyTo ? t('home_feed.reply_to_placeholder', { name: replyTo.author?.name?.split(' ')[0] }) : t('home_feed.ask_question_placeholder'))
              : t('home_feed.sign_in_to_comment_placeholder')}
            style={{ flex:1, border:'none', background:'none', outline:'none',
              fontSize:13, padding:'8px 0', color:DK, fontFamily:'inherit' }}
          />
          {replyTo && (
            <button onClick={() => setReplyTo(null)}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:GR, fontSize:16, padding:0 }}>×</button>
          )}
        </div>
        <button onClick={handleSend} disabled={sending || !body.trim()}
          style={{ width:32, height:32, borderRadius:'50%',
            backgroundColor: body.trim() ? B : '#E2E8F0',
            border:'none', cursor: body.trim() ? 'pointer' : 'default',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={body.trim() ? WH : GR} strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>

      {/* ── Reply picker — choose which of your items you're offering ── */}
      {showReply && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)',
          zIndex:5100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setShowReply(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:'100%', maxWidth:480, backgroundColor:WH,
              borderRadius:'20px 20px 0 0', maxHeight:'70vh', display:'flex',
              flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'16px 16px 12px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:900, color:DK }}>{t('home_feed.what_do_you_have_title')}</div>
              <button onClick={() => setShowReply(false)} style={{ background:'none',
                border:'none', cursor:'pointer', fontSize:20, color:GR }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {loadingItems ? (
                <div style={{ fontSize:12, color:GR, padding:'12px 0' }}>{t('home_feed.loading_your_items')}</div>
              ) : myItems.length === 0 ? (
                <div style={{ fontSize:12, color:GR, backgroundColor:'#F8FAFC',
                  borderRadius:10, padding:14 }}>
                  {t('home_feed.no_items_to_offer')}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {myItems.map(item => (
                    <button key={`${item.type}-${item.id}`}
                      onClick={() => setReplyItem(item)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                        borderRadius:10, border: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                        backgroundColor: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '#F5F3FF' : WH,
                        cursor:'pointer', textAlign:'left' }}>
                      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9',
                        flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:14 }}>
                        {item.image
                          ? <img src={item.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                          : (item.type==='product'?'🛍️':item.type==='service'?'🔧':'🏷️')}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK, flex:1,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.title}
                      </div>
                      {replyItem?.type===item.type && replyItem?.id===item.id && (
                        <span style={{ color:'#7C3AED', fontWeight:900 }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
              borderTop:'1px solid #F1F5F9' }}>
              <button onClick={sendOffer} disabled={!replyItem || replySending}
                style={{ width:'100%', backgroundColor: replyItem ? '#7C3AED' : '#E2E8F0',
                  color: replyItem ? WH : GR, border:'none', borderRadius:12, padding:'13px 0',
                  cursor: replyItem && !replySending ? 'pointer' : 'not-allowed',
                  fontSize:14, fontWeight:800 }}>
                {replySending ? t('home_feed.sending_button') : t('home_feed.send_reply_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Post card ─────────────────────────────────────────────────────────────────
const PostCard = ({ post, isLoggedIn, onNavigate, currentUser, savedIds, onSaveToggle, activeProfileId }) => {
  const { t } = useTranslation();
  const ago = getAgo(t);
  const TYPE_META = getTypeMeta(t);
  const [saved,        setSaved]        = useState(savedIds?.includes(post.id));
  const [showComments, setShowComments] = useState(false);
  const [showContact,  setShowContact]  = useState(false);
  const [followed,     setFollowed]     = useState(!!post.business?.isFollowing);
  const [imgErr,       setImgErr]       = useState(false);
  const [shareMsg,     setShareMsg]     = useState('');
  const [counts,       setCounts]       = useState({
    saves:    post.saveCount    || 0,
    comments: post.commentCount || 0,
    shares:   post.shareCount   || 0,
  });

  // Determine entity type for proper actions — falls back through virtual-post
  // fields, then to whatever the post is tagged/linked to (Moments, Looking For)
  const entityType = post.entityType || post.feedType || post.linkedEntityType || 'classified';
  const entityId   = post.entityId   || post.linkedEntityId;
  const isProduct  = entityType === 'product';
  const isService  = entityType === 'service' || entityType === 'new_service';
  const isClassified = entityType === 'classified' || (!isProduct && !isService);

  const biz     = post.business || {};
  const bizId   = biz.id;
  const bizName = biz.storeName || biz.name || t('home_feed.business_fallback');
  // When the backend resolved this post's commerceProfileId to a specific
  // CommerceProfile, nav must land there — not the owner's default/personal
  // profile, which is what a bare account id resolves to otherwise.
  const bizNavParams = biz.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : undefined;
  const repScore= biz.reputationScore || 0;
  const image   = (!imgErr && (post.imageUrl || post.data?.images?.[0])) || null;
  // Badge: real, unambiguous post types (Moment, Looking For, Discount...)
  // always win over the entityType inference above, which is really about
  // what's tagged/for-sale, not what kind of post this is.
  const UNIQUE_BADGE_TYPES = ['moment','looking_for','discount','announcement','delivery_info','restock'];
  const typeInfo = UNIQUE_BADGE_TYPES.includes(post.type)
    ? (TYPE_META[post.type] || TYPE_META.classified)
    : (TYPE_META[entityType] || TYPE_META[post.type] || TYPE_META.classified);
  const price   = post.price || post.data?.price || post.data?.basePrice || 0;

  useEffect(() => { setSaved(savedIds?.includes(post.id)); }, [savedIds, post.id]);
  useEffect(() => { setFollowed(!!post.business?.isFollowing); }, [post.business?.isFollowing]);

  // ── Impression tracking — mark a post "seen" once it's actually been
  // scrolled into view (not just opened), so the feed can rotate it out
  // instead of re-serving the same top post forever.
  const cardRef = useRef(null);
  const hasTrackedView = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || hasTrackedView.current || !cardRef.current) return;
    const el = cardRef.current;
    let timer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (!hasTrackedView.current) {
              hasTrackedView.current = true;
              Engagement.track(post.id, entityType, entityId, 'view', isLoggedIn, onNavigate);
            }
            observer.disconnect();
          }, 800);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => { if (timer) clearTimeout(timer); observer.disconnect(); };
  }, [isLoggedIn, post.id, entityType, entityId, onNavigate]);

  const handleSave = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    const res = await Engagement.track(
      post.id, entityType, entityId, 'save', isLoggedIn, onNavigate
    );
    if (res !== null) {
      const toggled = res?.toggled ?? !saved;
      setSaved(toggled);
      setCounts(c => ({ ...c, saves: c.saves + (toggled ? 1 : -1) }));
      onSaveToggle?.(post.id, toggled);
    }
  };

  const handleShare = async () => {
    await Engagement.track(post.id, entityType, entityId, 'share', true, onNavigate);
    setCounts(c => ({ ...c, shares: c.shares + 1 }));
    if (navigator.share) {
      navigator.share({ title: post.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href).catch(() => {});
      setShareMsg(t('home_feed.link_copied'));
      setTimeout(() => setShareMsg(''), 2000);
    }
  };

  const handleFollow = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    try {
      const res = await api.post(`/stores/${bizId}/follow`);
      setFollowed(res.data.following ?? !followed);
    } catch {}
  };

  const openComments = () => {
    setShowComments(s => !s);
    // Track view
    Engagement.track(post.id, entityType, entityId, 'view', true, onNavigate);
  };

  // Navigate to detail page based on type
  const goToDetail = () => {
    if (isProduct)    onNavigate(`ProductDetail-${entityId}`);
    else if (isService) onNavigate(`ServiceDetail-${entityId}`);
    // Was a hardcoded 'SellerShipment' that ignored entityId entirely — see
    // the same fix in ViewMomentModal's goToListing() above. The provider's
    // own transport tab (real routes, working ship button) is the correct
    // landing spot, not a generic unrelated seller page.
    else if (entityType === 'route') {
      if (bizId) onNavigate(`CommerceProfile-${bizId}-transport`);
      else onNavigate('SendShipment');
    }
    else if (entityId) onNavigate(`ClassifiedDetail-${entityId}`);
    else if (bizId)   onNavigate(`CommerceProfile-${bizId}`, bizNavParams);
  };

  return (
    <article ref={cardRef} style={{ backgroundColor:WH, marginBottom:2,
      borderTop:'1px solid #F1F5F9', borderBottom:'1px solid #F1F5F9' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px' }}>
        <button onClick={() => bizId && onNavigate(`CommerceProfile-${bizId}`, bizNavParams)}
          style={{ width:40, height:40, borderRadius:'50%', flexShrink:0,
            border:'none', padding:0, cursor:'pointer', overflow:'hidden',
            backgroundColor:'#F1F5F9', display:'flex', alignItems:'center',
            justifyContent:'center' }}>
          {biz.logo
            ? <img src={biz.logo} alt={bizName}
                style={{ width:'100%', height:'100%', objectFit:'cover' }}
                onError={e => e.target.style.display='none'} />
            : <span style={{ fontSize:17, fontWeight:900, color:B }}>
                {bizName.charAt(0).toUpperCase()}
              </span>}
        </button>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <button onClick={() => bizId && onNavigate(`CommerceProfile-${bizId}`, bizNavParams)}
              style={{ background:'none', border:'none', padding:0, cursor:'pointer',
                fontSize:13, fontWeight:800, color:DK }}>
              {bizName}
            </button>
            {biz.isVerified && (
              <span style={{ fontSize:10, color:B, fontWeight:800 }}>✓</span>
            )}
            {repScore > 0 && <ReputationBadge score={repScore} size="xs" />}
          </div>
          <div style={{ fontSize:10, color:GR, marginTop:1 }}>
            {biz.businessLocation && `📍 ${biz.businessLocation} · `}{ago(post.createdAt)}
          </div>
        </div>

        <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:100,
          backgroundColor:typeInfo.bg, color:typeInfo.color, flexShrink:0 }}>
          {typeInfo.label}
        </span>
      </div>

      {/* ── Image ── */}
      {image && (
        <div onClick={goToDetail}
          style={{ width:'100%', backgroundColor:'#F8FAFC', overflow:'hidden',
            cursor:'pointer', maxHeight:420 }}>
          <img src={image} alt={post.title}
            style={{ width:'100%', objectFit:'cover' }}
            onError={() => setImgErr(true)} />
        </div>
      )}

      {/* Text-only */}
      {!image && post.body && (
        <div onClick={goToDetail}
          style={{ padding:'16px 14px', backgroundColor:'#F8FAFC',
            fontSize:15, color:DK, lineHeight:1.6, cursor:'pointer', minHeight:60 }}>
          {post.body}
        </div>
      )}

      {/* ── Price + primary action ── */}
      {price > 0 && (
        <div style={{ display:'flex', gap:8, padding:'10px 14px 0',
          alignItems:'center' }}>
          <div style={{ fontSize:18, fontWeight:900,
            color: post.isFlashSale ? '#DC2626' : DK }}>
            TZS {fmt(price)}
          </div>
          {post.isNegotiable && !isProduct && (
            <span style={{ fontSize:10, color:GR, fontWeight:600 }}>{t('home_feed.negotiable_price')}</span>
          )}

          {/* ── Action buttons based on type ── */}
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            {isProduct && (
              <button onClick={() => {
                onNavigate(`ProductDetail-${entityId}`);
                Engagement.track(post.id, entityType, entityId, 'purchase', isLoggedIn, onNavigate);
              }}
                style={{ backgroundColor:B, color:WH, border:'none', borderRadius:10,
                  padding:'8px 14px', cursor:'pointer', fontSize:12, fontWeight:800 }}>
                {t('home_feed.buy_button')}
              </button>
            )}
            {isService && (
              <button onClick={() => onNavigate(`ServiceDetail-${entityId}`)}
                style={{ backgroundColor:'#F0FDF4', color:'#16A34A', border:'none',
                  borderRadius:10, padding:'8px 14px', cursor:'pointer',
                  fontSize:12, fontWeight:800 }}>
                {t('home_feed.request_service_button')}
              </button>
            )}
            {isClassified && (
              <button onClick={() => setShowContact(true)}
                style={{ backgroundColor:'#F8FAFC', color:DK, border:'1px solid #E2E8F0',
                  borderRadius:10, padding:'8px 14px', cursor:'pointer',
                  fontSize:12, fontWeight:700 }}>
                {t('home_feed.contact_button')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Engagement bar ── */}
      <div style={{ padding:'8px 14px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:2, marginBottom:8 }}>

          {/* ❤️ Save (Save) */}
          <button onClick={handleSave}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none',
              border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8,
              backgroundColor: saved ? '#FEF2F2' : 'transparent' }}>
            <svg width="20" height="20" viewBox="0 0 24 24"
              fill={saved ? '#EF4444' : 'none'}
              stroke={saved ? '#EF4444' : GR} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            {counts.saves > 0 && (
              <span style={{ fontSize:11, color: saved ? '#EF4444' : GR, fontWeight:700 }}>
                {counts.saves}
              </span>
            )}
          </button>

          {/* 💬 Ask (Comment/Ask) */}
          <button onClick={openComments}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none',
              border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8,
              backgroundColor: showComments ? '#EFF6FF' : 'transparent' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={showComments ? B : GR} strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            {counts.comments > 0 && (
              <span style={{ fontSize:11, color: showComments ? B : GR, fontWeight:700 }}>
                {counts.comments}
              </span>
            )}
          </button>

          {/* ↗ Share (Share) */}
          <button onClick={handleShare}
            style={{ display:'flex', alignItems:'center', gap:4, background:'none',
              border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={GR} strokeWidth="2">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
              <polyline points="16,6 12,2 8,6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            {counts.shares > 0 && (
              <span style={{ fontSize:11, color:GR, fontWeight:700 }}>{counts.shares}</span>
            )}
          </button>
          {shareMsg && (
            <span style={{ fontSize:11, color:'#16A34A', fontWeight:700 }}>{shareMsg}</span>
          )}

          {/* Spacer */}
          <div style={{ flex:1 }} />

          {/* 📦 Ship (classifieds only) */}
          {isClassified && entityId && (
            <button onClick={() => {
              onNavigate('SellerShipment');
              Engagement.track(post.id, entityType, entityId, 'shipment', isLoggedIn, onNavigate);
            }}
              style={{ display:'flex', alignItems:'center', gap:4, background:'none',
                border:'none', cursor:'pointer', padding:'6px 8px', borderRadius:8,
                backgroundColor:'#F0FDF4' }}>
              <span style={{ fontSize:14 }}>📦</span>
              <span style={{ fontSize:11, color:'#16A34A', fontWeight:700 }}>{t('home_feed.ship_label')}</span>
            </button>
          )}

          {/* 👤 Follow */}
          {bizId && (
            <button onClick={handleFollow}
              style={{ backgroundColor: followed ? '#F1F5F9' : B,
                color: followed ? DK : WH, border:'none', borderRadius:8,
                padding:'6px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>
              {followed ? t('home_feed.following_badge') : t('home_feed.follow_button')}
            </button>
          )}
        </div>

        {/* Social-proof summary — "22 liked · 4 comments" */}
        {(counts.saves > 0 || counts.comments > 0) && (
          <div style={{ fontSize:13, fontWeight:800, color:DK, marginBottom:6 }}>
            {counts.saves > 0 && t('home_feed.liked_count', { count: counts.saves })}
            {counts.saves > 0 && counts.comments > 0 && '  ·  '}
            {counts.comments > 0 && t('home_feed.comment_count', { count: counts.comments })}
          </div>
        )}

        {/* Caption — product/post title, not the store name again */}
        {post.title && (
          <div style={{ fontSize:13, fontWeight:700, color:DK, lineHeight:1.5, marginBottom:4 }}>
            {post.title}
          </div>
        )}
        {post.body && post.title && (
          <div style={{ fontSize:12, color:GR, lineHeight:1.4, marginBottom:4 }}>
            {post.body.slice(0,120)}{post.body.length > 120 ? '...' : ''}
          </div>
        )}

        {/* Comment count link */}
        {counts.comments > 0 && (
          <button onClick={openComments}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:GR, fontSize:12, padding:'2px 0' }}>
            {t('home_feed.view_all_comments')}
          </button>
        )}

        {/* View detail link */}
        {entityId && (
          <div>
            <button onClick={goToDetail}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:B, fontSize:12, fontWeight:700, padding:0 }}>
              {isProduct ? t('home_feed.view_product')
               : isService ? t('home_feed.view_service')
               : t('home_feed.view_listing')}
            </button>
          </div>
        )}
      </div>

      {/* ── Comments ── */}
      {showComments && (
        post.linkedEntityType && post.linkedEntityId ? (
          // Tagged to a real product/classified/service — show THAT entity's
          // own unified comment thread, so a review posted here is the exact
          // same review shown on the entity's own detail page, not a
          // separate copy tied to this specific post.
          <CommerceCommentSection
            entityType={post.linkedEntityType}
            entityId={post.linkedEntityId}
            entityTitle={post.title}
            sellerId={bizId}
            isLoggedIn={isLoggedIn}
            currentUser={currentUser}
            onNavigate={onNavigate}
            activeProfileId={activeProfileId}
          />
        ) : (
          // No linked entity (e.g. a Looking For request) — keep the
          // existing post-specific thread, including the "I Have This"
          // reply flow, which only makes sense without a tagged item.
          <CommentSection post={post} isLoggedIn={isLoggedIn}
            onNavigate={onNavigate} currentUser={currentUser}
            activeProfileId={activeProfileId} />
        )
      )}

      {/* ── Contact modal ── */}
      {showContact && (
        <ContactModal post={post} onClose={() => setShowContact(false)}
          onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
      )}
    </article>
  );
};

// ── Transport card — horizontal, distinct from the generic PostCard ─────────
// Products/classifieds/services all had a card; a route post had none — it
// just fell through into the same photo-post layout, which doesn't fit a
// route (no photo, and "price" alone means nothing without the route and
// available space next to it). Reuses the same CommerceProfile-{id}-transport
// destination as every other route link fixed this session.
const TRANSPORT_ICONS = {
  bus: '🚌', courier: '📦', van: '🚐', truck: '🚚', boda: '🏍️', rail: '🚆', air: '✈️', boat: '🛥️',
};
const TransportPostCard = ({ post, onNavigate }) => {
  const { t } = useTranslation();
  const biz = post.business || {};
  const bizId = biz.id;
  const tr = post.transport || {};
  const location = tr.originCity || tr.coverageCity || biz.businessLocation || null;
  const priceLabel = tr.pricePerKg
    ? t('home_feed.transport_price_per_kg', { amount: fmt(tr.pricePerKg) })
    : tr.fixedFee
      ? `TZS ${fmt(tr.fixedFee)}`
      : null;

  return (
    <article style={{ backgroundColor:WH, marginBottom:2, borderTop:'1px solid #F1F5F9',
      borderBottom:'1px solid #F1F5F9', padding:14, display:'flex', gap:12,
      cursor: bizId ? 'pointer' : 'default' }}
      onClick={() => bizId && onNavigate(`CommerceProfile-${bizId}-transport`)}>

      {/* Vehicle-type image/icon */}
      <div style={{ width:64, height:64, borderRadius:14, backgroundColor:'#EFF6FF',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:30,
        flexShrink:0 }}>
        {TRANSPORT_ICONS[tr.vehicleType] || '🚚'}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {/* Company name + profile picture */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <div style={{ width:20, height:20, borderRadius:'50%', overflow:'hidden', flexShrink:0,
            backgroundColor:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {biz.logo
              ? <img src={biz.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e => e.target.style.display='none'} />
              : <span style={{ fontSize:10, fontWeight:900, color:B }}>{(biz.name||'?').charAt(0).toUpperCase()}</span>}
          </div>
          <span style={{ fontSize:12, fontWeight:800, color:DK, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {biz.name || t('home_feed.business_fallback')}
          </span>
          {biz.isVerified && <span style={{ fontSize:10, color:B, fontWeight:800 }}>✓</span>}
        </div>

        {/* Route */}
        <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:4,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {tr.routeLabel || post.title}
        </div>

        {/* Price + available space + location */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:11, color:GR }}>
          {priceLabel && <span style={{ color:B, fontWeight:800, fontSize:13 }}>{priceLabel}</span>}
          {tr.slotsAvailable != null && (
            <span style={{ fontWeight:700, color: tr.slotsAvailable > 0 ? '#16A34A' : '#DC2626' }}>
              {tr.slotsAvailable > 0
                ? t('home_feed.transport_slots_available', { count: tr.slotsAvailable })
                : t('home_feed.transport_full')}
            </span>
          )}
          {location && <span>📍 {location}</span>}
        </div>
      </div>
    </article>
  );
};

// ── Trending card (with inline Follow) ────────────────────────────────────────
const TrendingCard = ({ icon, label, p, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const bizId = p.businessId || p.business?.id;
  const [followed, setFollowed] = useState(!!p.business?.isFollowing);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => { setFollowed(!!p.business?.isFollowing); }, [p.business?.isFollowing]);

  const handleFollow = async (e) => {
    e.stopPropagation();
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    if (!bizId) return;
    try {
      setBusy(true);
      const res = await api.post(`/stores/${bizId}/follow`);
      setFollowed(res.data.following ?? !followed);
    } catch {}
    finally { setBusy(false); }
  };

  return (
    <div onClick={() => bizId && onNavigate(`CommerceProfile-${bizId}`,
      p.business?.commerceProfileId ? { commerceProfileId: p.business.commerceProfileId } : undefined)}
      style={{ backgroundColor:'#F8FAFC', borderRadius:12, padding:'10px 14px',
        flexShrink:0, cursor:'pointer', border:'1px solid #F1F5F9', minWidth:160 }}>
      <div style={{ fontSize:16, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:11, fontWeight:800, color:DK,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {p.title || p.business?.storeName}
      </div>
      <div style={{ fontSize:10, color:GR, marginTop:2, marginBottom:6 }}>{label}</div>
      {bizId && (
        followed ? (
          <span style={{ fontSize:9, color:'#16A34A', fontWeight:700 }}>{t('home_feed.following_badge')}</span>
        ) : (
          <button onClick={handleFollow} disabled={busy}
            style={{ fontSize:9, fontWeight:800, color:WH, backgroundColor:B,
              border:'none', borderRadius:100, padding:'3px 10px',
              cursor: busy ? 'wait' : 'pointer' }}>
            {t('home_feed.follow_button')}
          </button>
        )
      )}
    </div>
  );
};

// ── Super Agent work tray — this hub's own parcels needing action ──────────
// Not a content-discovery rail like the ones below (those browse OTHER
// people's listings) — this is the Super Agent's own actionable queue:
// parcels sitting at their hub (received/verified/ready-to-dispatch) that
// haven't moved yet. Reuses GET /super-agents/bulk-shipments/candidates,
// which already scopes to "this agent's own hub, not yet dispatched or
// bundled" — exactly "work waiting for you," no new backend concept.
const PARCEL_STATUS_BADGE = {
  received_at_hub:    { emoji: '📥', key: 'status_received_at_hub' },
  verified:           { emoji: '✅', key: 'status_verified' },
  ready_for_dispatch: { emoji: '📦', key: 'status_ready_for_dispatch' },
};

const SuperAgentWorkTray = ({ items, onNavigate }) => {
  const { t } = useTranslation();
  if (!items?.length) return null;

  return (
    <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9', padding:'12px 0 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px 10px' }}>
        <div style={{ fontSize:13, fontWeight:800, color:DK }}>
          🏢 {t('home_feed.super_agent_work_title')} ({items.length})
        </div>
        <button onClick={() => onNavigate('SuperAgentDashboard')}
          style={{ background:'none', border:'none', cursor:'pointer', padding:0,
            fontSize:12, fontWeight:700, color:B }}>
          {t('home_feed.see_all')} →
        </button>
      </div>
      <div style={{ display:'flex', gap:10, overflowX:'auto', padding:'0 14px', scrollbarWidth:'none' }}>
        {items.slice(0, 10).map(p => {
          const badge = PARCEL_STATUS_BADGE[p.status] || {};
          return (
            <div key={p.id} onClick={() => onNavigate('SuperAgentDashboard')}
              style={{ flexShrink:0, width:140, cursor:'pointer', backgroundColor:'#FFFBEB',
                border:'1px solid #FDE68A', borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:800, color:DK, marginBottom:4,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p.trackingNumber || `#${p.id}`}
              </div>
              <div style={{ fontSize:10, color:GR, marginBottom:6,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                📍 {p.destinationCity}
              </div>
              <div style={{ fontSize:10, fontWeight:700, color:'#B45309' }}>
                {badge.emoji} {badge.key ? t(`home_feed.${badge.key}`) : p.status}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Discovery rail — small horizontal-scroll row interleaved between posts ──
// A sample only — like an advertisement strip, not the full catalogue.
// "See All" is how a user actually compares every option; each destination
// is the same real browse page Search/navigation already uses elsewhere,
// never a second listing system built just for this rail.
const getRailConfig = t => ({
  product:    { title: t('home_feed.rail_products_title'),    detailPage: 'ProductDetail',    seeAllPage: 'Listings-products' },
  classified: { title: t('home_feed.rail_classifieds_title'), detailPage: 'ClassifiedDetail',  seeAllPage: 'ClassifiedsPublic' },
  service:    { title: t('home_feed.rail_services_title'),    detailPage: 'ServiceDetail',     seeAllPage: 'Services' },
  store:      { title: t('home_feed.rail_stores_title'),      detailPage: null,                seeAllPage: 'Stores' }, // navigates to CommerceProfile
  transport:  { title: t('home_feed.rail_transport_title'),   detailPage: null,                seeAllPage: 'RouteCoverageMap' }, // navigates to the provider's transport profile
});

const ROUTE_TYPE_LABELS = t => ({
  intercity:  t('home_feed.route_type_intercity'),
  local_loop: t('home_feed.route_type_local_loop'),
  last_mile:  t('home_feed.route_type_last_mile'),
});

const DiscoveryRail = ({ type, items, onNavigate }) => {
  const { t } = useTranslation();
  const RAIL_CONFIG = getRailConfig(t);
  const ROUTE_LABELS = ROUTE_TYPE_LABELS(t);
  if (!items?.length) return null;
  const cfg = RAIL_CONFIG[type];

  const goTo = (item) => {
    if (type === 'store') {
      const bizId = item.id || item.userId;
      // getTrending() already resolves and attaches item.commerceProfileId
      // for exactly this reason (see its own comment) — this was the one
      // caller in this file that still navigated on the bare account id,
      // which CommerceProfile.js then defaults to resolving as that
      // account's PERSONAL profile instead of the business actually shown
      // on the card (e.g. "Bishoo" opening "Kened").
      if (bizId) onNavigate(`CommerceProfile-${bizId}`,
        item.commerceProfileId ? { commerceProfileId: item.commerceProfileId } : undefined);
      return;
    }
    if (type === 'transport') {
      if (item.provider?.id) onNavigate(`CommerceProfile-${item.provider.id}-transport`);
      return;
    }
    onNavigate(`${cfg.detailPage}-${item.entityId}`);
  };

  return (
    <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9', padding:'12px 0 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px 10px' }}>
        <div style={{ fontSize:13, fontWeight:800, color:DK }}>{cfg.title}</div>
        {cfg.seeAllPage && (
          <button onClick={() => onNavigate(cfg.seeAllPage)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:0,
              fontSize:12, fontWeight:700, color:B }}>
            {t('home_feed.see_all')} →
          </button>
        )}
      </div>
      <div style={{ display:'flex', gap:10, overflowX:'auto', padding:'0 14px', scrollbarWidth:'none' }}>
        {items.slice(0, 10).map(item => (
          type === 'store' ? (
            <div key={item.id} onClick={() => goTo(item)}
              style={{ flexShrink:0, width:88, cursor:'pointer', textAlign:'center' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', margin:'0 auto 6px',
                backgroundColor:'#F1F5F9', overflow:'hidden', display:'flex',
                alignItems:'center', justifyContent:'center', border:'1px solid #F1F5F9' }}>
                {item.logo
                  ? <img src={item.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <span style={{ fontSize:22 }}>🏪</span>}
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:DK,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.storeName || item.name}
              </div>
            </div>
          ) : type === 'transport' ? (
            <div key={item.id} onClick={() => goTo(item)}
              style={{ flexShrink:0, width:150, cursor:'pointer' }}>
              <div style={{ width:150, height:100, borderRadius:12, backgroundColor:'#F1F5F9',
                overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
                marginBottom:6 }}>
                {/* Real image the company uploaded at registration — never
                    a generic vehicle-type icon when a real photo exists. */}
                {item.provider?.logoUrl
                  ? <img src={item.provider.logoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <span style={{ fontSize:28 }}>🚚</span>}
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:DK, marginBottom:2,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.routeLabel}
              </div>
              {item.routeType && (
                <div style={{ fontSize:10, color:GR, marginBottom:2 }}>
                  {ROUTE_LABELS[item.routeType] || item.routeType}
                </div>
              )}
              {(item.pricePerKg || item.fixedFee || item.maxWeightKg) && (
                <div style={{ fontSize:11, fontWeight:800, color:B, marginBottom:2 }}>
                  {item.pricePerKg
                    ? t('home_feed.transport_price_per_kg', { amount: fmt(item.pricePerKg) })
                    : item.fixedFee ? `TZS ${fmt(item.fixedFee)}` : ''}
                  {item.maxWeightKg ? ` · ${t('home_feed.rail_transport_weight', { kg: fmt(item.maxWeightKg) })}` : ''}
                </div>
              )}
              {item.location && (
                <div style={{ fontSize:10, color:GR, marginBottom:2,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  📍 {item.location}
                </div>
              )}
              {/* Logistics company name, beneath everything else */}
              <div style={{ fontSize:10, fontWeight:700, color:DK,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.provider?.name}
              </div>
            </div>
          ) : (
            <div key={item.id} onClick={() => goTo(item)}
              style={{ flexShrink:0, width:120, cursor:'pointer' }}>
              <div style={{ width:120, height:120, borderRadius:12, backgroundColor:'#F1F5F9',
                overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center',
                marginBottom:6 }}>
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <span style={{ fontSize:28 }}>{type==='service' ? '🔧' : type==='classified' ? '🏷️' : '📦'}</span>}
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:DK, marginBottom:2,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.title}
              </div>
              {item.price != null && (
                <div style={{ fontSize:11, fontWeight:800, color:B }}>
                  TZS {Number(item.price).toLocaleString()}
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  );
};

// ── Trending bar ──────────────────────────────────────────────────────────────
const TrendingBar = ({ trending, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  if (!trending) return null;
  const items = [
    { icon:'🔥', label:t('home_feed.most_purchased_today'), posts: trending.topPurchased   },
    { icon:'📈', label:t('home_feed.growing_fast'),      posts: trending.fastestGrowing },
    { icon:'🏪', label:t('home_feed.businesses_trending'),     posts: trending.topBusinesses  },
    { icon:'🔧', label:t('home_feed.services_trending'),       posts: trending.topServices    },
  ].filter(item => item.posts?.length > 0);
  if (!items.length) return null;

  return (
    <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
      padding:'10px 0 8px' }}>
      <div style={{ fontSize:12, fontWeight:800, color:DK, padding:'0 14px 8px' }}>
        {t('home_feed.trending_now_title')}
      </div>
      <div style={{ display:'flex', gap:10, overflowX:'auto',
        padding:'0 14px', scrollbarWidth:'none' }}>
        {items.map((item, i) => item.posts.slice(0,1).map(p => (
          <TrendingCard key={i} icon={item.icon} label={item.label} p={p}
            onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
        )))}
      </div>
    </div>
  );
};

// ── Create a Moment — photo + tag one listing + optional caption ─────────────
// ── View a Moment — full-screen, tap CTA to jump to the tagged listing ───────
const ViewMomentModal = ({ moment, onClose, onNavigate, isLoggedIn, currentUser, activeProfileId }) => {
  const { t } = useTranslation();
  const ago = getAgo(t);
  const [saved, setSaved] = useState(false);
  const biz = moment.business || {};
  const bizName = biz.storeName || biz.name || t('home_feed.store_fallback');
  const isLookingFor = moment.postType === 'looking_for';
  const typeLabel = moment.linkedEntityType === 'product' ? t('home_feed.view_product_short')
    : moment.linkedEntityType === 'service' ? t('home_feed.view_service_short')
    : moment.linkedEntityType === 'route' ? t('home_feed.ship_this_route') : t('home_feed.view_listing_short');

  const [showReply,   setShowReply]   = useState(false);
  const [myItems,     setMyItems]     = useState([]);
  const [loadingItems,setLoadingItems]= useState(false);
  const [replyItem,   setReplyItem]   = useState(null);
  const [replySending,setReplySending]= useState(false);
  const [replySent,   setReplySent]   = useState(false);

  const handleSave = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    const res = await Engagement.track(moment.momentId, 'moment', moment.momentId, 'save', isLoggedIn, onNavigate);
    if (res !== null) setSaved(res.toggled ?? !saved);
  };

  const goToListing = () => {
    onClose();
    if (moment.linkedEntityType === 'product') onNavigate(`ProductDetail-${moment.linkedEntityId}`);
    else if (moment.linkedEntityType === 'service') onNavigate(`ServiceDetail-${moment.linkedEntityId}`);
    else if (moment.linkedEntityType === 'route') {
      // Was a hardcoded 'SellerShipment' — a generic, unrelated seller page
      // that ignored moment.linkedEntityId entirely, so tapping a shared
      // route always landed you nowhere near that route. The moment only
      // carries the provider's user id and the route id, not the route's
      // own origin/destination cities, so the correct landing spot is the
      // provider's public transport tab — it already lists their real
      // routes with a working "Ship" button per route (CommerceProfile.js),
      // rather than guessing at a SendShipment prefill with incomplete data.
      if (biz.id) onNavigate(`CommerceProfile-${biz.id}-transport`);
      else onNavigate('SendShipment');
    }
    else onNavigate(`ClassifiedDetail-${moment.linkedEntityId}`);
  };

  const openReply = () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setShowReply(true);
    if (myItems.length || loadingItems) return;
    const uid = currentUser?.id;
    if (!uid) return;
    setLoadingItems(true);
    // Scoped to the active profile — see CreateMomentModal.js's identical
    // fix for why (Kened's Personal profile must not offer Bishoo
    // Intelligence Systems' products, and vice versa).
    const productsCall = activeProfileId
      ? api.get(`/products/profile/${activeProfileId}`)
      : api.get(`/products/seller/${uid}`);
    const classifiedsCall = activeProfileId
      ? api.get(`/classifieds/profile/${activeProfileId}`)
      : api.get(`/classifieds/seller/${uid}`);
    const servicesCall = api.get('/services/my/ads', {
      params: activeProfileId ? { commerceProfileId: activeProfileId } : undefined,
    });
    Promise.allSettled([classifiedsCall, productsCall, servicesCall]).then(([cl, pr, sv]) => {
      const items = [];
      if (cl.status === 'fulfilled') {
        (cl.value.data || []).forEach(c => items.push({
          type: 'classified', id: c.id, title: c.title, image: c.images?.[0],
        }));
      }
      if (pr.status === 'fulfilled') {
        (pr.value.data || []).forEach(p => items.push({
          type: 'product', id: p.id, title: p.name, image: p.images?.[0],
        }));
      }
      if (sv.status === 'fulfilled') {
        (sv.value.data?.ads || sv.value.data || []).forEach(s => items.push({
          type: 'service', id: s.id, title: s.title, image: s.images?.[0],
        }));
      }
      setMyItems(items);
    }).finally(() => setLoadingItems(false));
  };

  const sendOffer = async () => {
    if (!replyItem) return;
    try {
      setReplySending(true);
      await api.post(`/feed/${moment.momentId}/comments`, {
        body: `I have this — ${replyItem.title}`,
        offer: { entityType: replyItem.type, entityId: replyItem.id },
        commerceProfileId: activeProfileId || undefined,
      });
      setReplySent(true);
      setShowReply(false);
    } catch {}
    finally { setReplySending(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'#000',
      zIndex:5000, display:'flex', flexDirection:'column' }}>

      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10,
        padding:'16px 14px', position:'relative', zIndex:2 }}>
        <div style={{ width:34, height:34, borderRadius:'50%', overflow:'hidden',
          backgroundColor:'#333', flexShrink:0, display:'flex', alignItems:'center',
          justifyContent:'center' }}>
          {biz.logo
            ? <img src={biz.logo} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : <span style={{ color:WH, fontSize:14, fontWeight:900 }}>{bizName.charAt(0).toUpperCase()}</span>}
        </div>
        <button onClick={() => { onClose(); biz.id && onNavigate(`CommerceProfile-${biz.id}`, biz.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : undefined); }}
          style={{ background:'none', border:'none', cursor:'pointer', textAlign:'left', flex:1 }}>
          <div style={{ color:WH, fontSize:13, fontWeight:800 }}>{bizName}</div>
          <div style={{ color:'rgba(255,255,255,0.6)', fontSize:10 }}>{ago(moment.createdAt)}</div>
        </button>
        {isLookingFor && (
          <span style={{ fontSize:10, fontWeight:800, color:WH, backgroundColor:'#7C3AED',
            padding:'4px 10px', borderRadius:100, flexShrink:0, marginRight:6 }}>
            🙋 {moment.category || t('home_feed.looking_for_fallback')}
          </span>
        )}
        <button onClick={onClose} style={{ background:'none', border:'none',
          cursor:'pointer', color:WH, fontSize:24, padding:4 }}>×</button>
      </div>

      {/* Image */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', position:'relative' }}>
        {moment.imageUrl && (
          <img src={moment.imageUrl} alt="" style={{ maxWidth:'100%', maxHeight:'100%',
            objectFit:'contain' }} />
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ padding:'14px 16px max(14px, env(safe-area-inset-bottom))',
        background:'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
        {moment.caption && (
          <div style={{ color:WH, fontSize:13, marginBottom:12, lineHeight:1.5 }}>
            {moment.caption}
          </div>
        )}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={handleSave}
            style={{ width:44, height:44, borderRadius:12, flexShrink:0,
              backgroundColor:'rgba(255,255,255,0.15)', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24"
              fill={saved ? '#EF4444' : 'none'} stroke={saved ? '#EF4444' : WH} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>
          {moment.linkedEntityId && (
            <button onClick={goToListing}
              style={{ flex:1, backgroundColor:B, color:WH, border:'none',
                borderRadius:12, padding:'0 20px', cursor:'pointer',
                fontSize:14, fontWeight:800 }}>
              {typeLabel} →
            </button>
          )}
          {isLookingFor && !replySent && (
            <button onClick={openReply}
              style={{ flex:1, backgroundColor:'#7C3AED', color:WH, border:'none',
                borderRadius:12, padding:'0 20px', cursor:'pointer',
                fontSize:14, fontWeight:800 }}>
              {t('home_feed.i_have_this_button')}
            </button>
          )}
          {isLookingFor && replySent && (
            <div style={{ flex:1, backgroundColor:'rgba(22,163,74,0.2)', color:'#4ADE80',
              border:'1px solid #16A34A', borderRadius:12, padding:'0 20px',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:800 }}>
              {t('home_feed.you_replied_label')}
            </div>
          )}
        </div>
      </div>

      {/* ── Reply picker — choose which of your items you're offering ── */}
      {showReply && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)',
          zIndex:5100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setShowReply(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:'100%', maxWidth:480, backgroundColor:WH,
              borderRadius:'20px 20px 0 0', maxHeight:'70vh', display:'flex',
              flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'16px 16px 12px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
              <div style={{ fontSize:15, fontWeight:900, color:DK }}>{t('home_feed.what_do_you_have_title')}</div>
              <button onClick={() => setShowReply(false)} style={{ background:'none',
                border:'none', cursor:'pointer', fontSize:20, color:GR }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>
              {loadingItems ? (
                <div style={{ fontSize:12, color:GR, padding:'12px 0' }}>{t('home_feed.loading_your_items')}</div>
              ) : myItems.length === 0 ? (
                <div style={{ fontSize:12, color:GR, backgroundColor:'#F8FAFC',
                  borderRadius:10, padding:14 }}>
                  {t('home_feed.no_items_to_offer')}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {myItems.map(item => (
                    <button key={`${item.type}-${item.id}`}
                      onClick={() => setReplyItem(item)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
                        borderRadius:10, border: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                        backgroundColor: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '#F5F3FF' : WH,
                        cursor:'pointer', textAlign:'left' }}>
                      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9',
                        flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:14 }}>
                        {item.image
                          ? <img src={item.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                          : (item.type==='product'?'🛍️':item.type==='service'?'🔧':'🏷️')}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK, flex:1,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.title}
                      </div>
                      {replyItem?.type===item.type && replyItem?.id===item.id && (
                        <span style={{ color:'#7C3AED', fontWeight:900 }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
              borderTop:'1px solid #F1F5F9' }}>
              <button onClick={sendOffer} disabled={!replyItem || replySending}
                style={{ width:'100%', backgroundColor: replyItem ? '#7C3AED' : '#E2E8F0',
                  color: replyItem ? WH : GR, border:'none', borderRadius:12, padding:'13px 0',
                  cursor: replyItem && !replySending ? 'pointer' : 'not-allowed',
                  fontSize:14, fontWeight:800 }}>
                {replySending ? t('home_feed.sending_button') : t('home_feed.send_reply_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Story ring item for a real Moment ─────────────────────────────────────────
const MomentStory = ({ moment, onView }) => {
  const { t } = useTranslation();
  const biz = moment.business || {};
  const name = biz.storeName || biz.name || t('home_feed.store_fallback');
  const isLookingFor = moment.postType === 'looking_for';
  return (
    <button onClick={() => onView(moment)}
      style={{ display:'flex', flexDirection:'column', alignItems:'center',
        gap:4, cursor:'pointer', flexShrink:0, width:66,
        background:'none', border:'none', padding:0, position:'relative' }}>
      <div style={{ position:'relative' }}>
        <div style={{ padding:2, borderRadius:'50%',
          background: isLookingFor
            ? 'linear-gradient(135deg,#7C3AED,#A21CAF,#EC4899)'
            : 'linear-gradient(135deg,#F59E0B,#EF4444,#8B5CF6,#2563EB)' }}>
          <div style={{ width:52, height:52, borderRadius:'50%',
            backgroundColor:WH, padding:2, boxSizing:'border-box',
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {biz.logo
              ? <img src={biz.logo} alt={name}
                  style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', borderRadius:'50%',
                  backgroundColor:B, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:18, color:WH, fontWeight:900 }}>
                  {name.charAt(0).toUpperCase()}
                </div>}
          </div>
        </div>
        {isLookingFor && (
          <div style={{ position:'absolute', bottom:-2, right:-2, width:20, height:20,
            borderRadius:'50%', backgroundColor:'#7C3AED', border:'2px solid #fff',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>
            🙋
          </div>
        )}
      </div>
      <span style={{ fontSize:9, color:DK, fontWeight:600, textAlign:'center',
        width:64, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {name.split(' ')[0]}
      </span>
    </button>
  );
};

// ── Story circle (with inline Follow) ─────────────────────────────────────────
const Story = ({ seller, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const name = seller.storeName || seller.name || t('home_feed.store_fallback');
  const sellerId = seller.userId || seller.id;
  const [followed, setFollowed] = useState(!!seller.isFollowing);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => { setFollowed(!!seller.isFollowing); }, [seller.isFollowing]);

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
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:4, flexShrink:0, width:66 }}>
      <button onClick={() => onNavigate(`CommerceProfile-${sellerId}`,
        seller.commerceProfileId ? { commerceProfileId: seller.commerceProfileId } : undefined)}
        style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
        <div style={{ padding:2, borderRadius:'50%',
          background: followed
            ? '#E2E8F0'
            : 'linear-gradient(135deg,#F59E0B,#EF4444,#8B5CF6,#2563EB)' }}>
          <div style={{ width:52, height:52, borderRadius:'50%',
            backgroundColor:WH, padding:2, boxSizing:'border-box',
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {seller.logo
              ? <img src={seller.logo} alt={name}
                  style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', borderRadius:'50%',
                  backgroundColor:B, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:18, color:WH, fontWeight:900 }}>
                  {name.charAt(0).toUpperCase()}
                </div>}
          </div>
        </div>
      </button>
      <span style={{ fontSize:9, color:DK, fontWeight:600, textAlign:'center',
        width:64, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {name.split(' ')[0]}
      </span>
      {followed ? (
        <span style={{ fontSize:8, color:'#16A34A', fontWeight:700 }}>{t('home_feed.following_badge')}</span>
      ) : (
        <button onClick={handleFollow} disabled={busy}
          style={{ fontSize:9, fontWeight:800, color:WH, backgroundColor:B,
            border:'none', borderRadius:100, padding:'2px 10px',
            cursor: busy ? 'wait' : 'pointer' }}>
          {t('home_feed.follow_button')}
        </button>
      )}
    </div>
  );
};

// ── Main HomeFeed ─────────────────────────────────────────────────────────────
const HomeFeed = ({ onNavigate, isLoggedIn, currentUser, onOpenMoment, momentRefreshKey, activeProfileId }) => {
  const { t } = useTranslation();
  const FILTERS = getFilters(t);
  const [filter,      setFilter]      = useState('for_you');
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [discover,    setDiscover]    = useState(null);
  const [trending,    setTrending]    = useState(null);
  const [savedIds,    setSavedIds]    = useState([]);
  const [unread,      setUnread]      = useState(0);
  const [moments,     setMoments]     = useState([]);
  const [viewingMoment,    setViewingMoment]    = useState(null);
  const [pendingParcels,   setPendingParcels]   = useState([]);

  const loadPosts = useCallback(async (f, p = 1, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ filter: f, page: String(p) });
      // Lets the backend's "for_you" blend (city-match component) and the
      // "nearby" filter actually match against the viewer's own location —
      // neither had ever received it before.
      if (currentUser?.city) params.set('city', currentUser.city);
      const res = await api.get(`/feed?${params}`);
      const items = res.data?.items || res.data || [];
      if (append) setPosts(prev => [...prev, ...items]);
      else setPosts(items);
      setHasMore(items.length >= 15);
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }, [currentUser]);

  useEffect(() => {
    setPage(1);
    loadPosts(filter, 1, false);
  }, [filter, loadPosts]);

  const loadMoments = useCallback(() => {
    api.get('/feed/moments/stories')
      .then(r => setMoments(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.get('/feed/discover'),
      api.get('/feed/trending'),
      isLoggedIn ? api.get('/notifications/unread-count') : Promise.resolve({ data:0 }),
      isLoggedIn ? api.get('/feed/saved/ids')             : Promise.resolve({ data:[] }),
    ]).then(([d, t, n, s]) => {
      if (d.status==='fulfilled') setDiscover(d.value.data);
      if (t.status==='fulfilled') setTrending(t.value.data);
      if (n.status==='fulfilled') setUnread(n.value.data?.count || n.value.data || 0);
      if (s.status==='fulfilled') setSavedIds(s.value.data || []);
    });
    loadMoments();
  }, [isLoggedIn, loadMoments]);

  useEffect(() => {
    if (currentUser?.role !== 'super_agent') { setPendingParcels([]); return; }
    api.get('/super-agents/bulk-shipments/candidates')
      .then(r => setPendingParcels(r.data || []))
      .catch(() => {});
  }, [currentUser]);

  // Refresh stories + feed after a Moment is posted from anywhere in the app
  // (the modal itself now lives at the App.js level, not just on this page).
  useEffect(() => {
    if (!momentRefreshKey) return;
    loadMoments();
    loadPosts(filter, 1, false);
  }, [momentRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sellers   = discover?.suggestedSellers || [];
  const myMoment  = currentUser ? moments.find(m => m.business?.id === currentUser.id) : null;
  const otherMoments = moments.filter(m => m.business?.id !== currentUser?.id);

  return (
    <div style={{ backgroundColor:'#FAFAFA', minHeight:'100vh',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif' }}>
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        ::-webkit-scrollbar { display:none }
      `}</style>
      <FeatureTour tourKey="buyer_home_orientation" autoStart />

      {/* Instagram-style desktop layout: the feed stays a fixed-width
          centered column against the gray backdrop instead of stretching
          full-bleed on wide screens (which is what was blowing up
          mobile-sized post images on laptop/desktop viewports). */}
      <div style={{ maxWidth:630, margin:'0 auto', backgroundColor:WH,
        minHeight:'100vh', paddingBottom:80,
        boxShadow:'0 0 0 1px rgba(15,23,42,0.05)' }}>

      {/* ── Top bar ── */}
      <div style={{ position:'sticky', top:0, zIndex:200, backgroundColor:WH,
        borderBottom:'1px solid #F1F5F9', paddingTop:'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 14px', height:50, boxSizing:'border-box' }}>
          <button onClick={() => onNavigate('Home')}
            style={{ display:'flex', alignItems:'center', gap:8, background:'none',
              border:'none', cursor:'pointer', padding:0 }}>
            <div style={{ width:30, height:30, backgroundColor:'#1d4ed8', borderRadius:8,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 2px 8px rgba(29,78,216,0.4)', flexShrink:0 }}>
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                <path d="M2 2 L7 8 L11 5 L11 20 L5 14 Z" fill="white"/>
                <path d="M20 2 L15 8 L11 5 L11 20 L17 14 Z" fill="#60a5fa"/>
                <circle cx="7.5" cy="9.5" r="1" fill="#0f172a"/>
                <circle cx="14.5" cy="9.5" r="1" fill="#0f172a"/>
              </svg>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:0, lineHeight:1 }}>
              <span style={{ fontSize:18, fontWeight:900, color:DK,
                letterSpacing:-0.5, fontFamily:'Manrope,sans-serif' }}>Kente</span>
              <span style={{ fontSize:18, fontWeight:900, color:'#1d4ed8',
                letterSpacing:-0.5, fontFamily:'Manrope,sans-serif' }}>Xa</span>
            </div>
          </button>
          <div style={{ display:'flex', gap:2 }}>
            <button onClick={() => onNavigate('Search')}
              style={{ background:'none', border:'none', cursor:'pointer', padding:8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={DK} strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
            <button onClick={() => onNavigate(isLoggedIn?'Activity':'PublicLogin')}
              style={{ background:'none', border:'none', cursor:'pointer',
                padding:8, position:'relative' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={DK} strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {unread > 0 && (
                <div style={{ position:'absolute', top:4, right:4, width:15, height:15,
                  borderRadius:'50%', backgroundColor:'#EF4444', display:'flex',
                  alignItems:'center', justifyContent:'center',
                  fontSize:8, color:WH, fontWeight:900 }}>
                  {unread > 9 ? '9+' : unread}
                </div>
              )}
            </button>
            <button onClick={() => onNavigate(isLoggedIn?'SellerInbox':'PublicLogin')}
              style={{ background:'none', border:'none', cursor:'pointer', padding:8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={DK} strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* AI front door — the primary way to find anything on Kentexa */}
        <div data-tour="hf-ai-search" style={{ padding:'8px 14px 0' }}>
          <AiSearchBar onNavigate={onNavigate} />
        </div>
        <div style={{ padding:'6px 14px 8px', display:'flex', justifyContent:'flex-end' }}>
          <TourTrigger tourKey="buyer_home_orientation" />
        </div>

        {/* Feed filters */}
        <div data-tour="hf-filters" style={{ display:'flex', overflowX:'auto', scrollbarWidth:'none',
          padding:'0 8px', borderTop:'1px solid #F8FAFC' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding:'8px 12px', border:'none', background:'none',
                cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                flexShrink:0, color: filter===f.key ? B : GR,
                borderBottom:`2px solid ${filter===f.key ? B : 'transparent'}` }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {currentUser?.role === 'super_agent' && (
        <SuperAgentWorkTray items={pendingParcels} onNavigate={onNavigate} />
      )}

      {/* ── Stories ── */}
      {(moments.length > 0 || sellers.length > 0) && (
        <div style={{ backgroundColor:WH, borderBottom:'1px solid #F1F5F9',
          padding:'10px 0 10px 12px' }}>
          <div style={{ display:'flex', gap:10, overflowX:'auto',
            paddingRight:12, scrollbarWidth:'none' }}>

            {/* Own avatar — ring if you have a Moment, tap to view/create */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <button onClick={() => {
                  if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
                  if (myMoment) setViewingMoment(myMoment);
                  else onOpenMoment?.();
                }}
                style={{ display:'flex', flexDirection:'column', alignItems:'center',
                  gap:4, cursor:'pointer', width:66,
                  background:'none', border:'none', padding:0 }}>
                <div style={{ padding: myMoment ? 2 : 0, borderRadius:'50%',
                  background: myMoment
                    ? 'linear-gradient(135deg,#F59E0B,#EF4444,#8B5CF6,#2563EB)'
                    : 'transparent' }}>
                  <div style={{ width:54, height:54, borderRadius:'50%',
                    border: myMoment ? 'none' : '2px solid #E2E8F0',
                    backgroundColor:'#F8FAFC', display:'flex', alignItems:'center',
                    justifyContent:'center', overflow:'hidden',
                    padding: myMoment ? 2 : 0, boxSizing:'border-box' }}>
                    {(currentUser?.avatarUrl || currentUser?.logo)
                      ? <img src={currentUser.avatarUrl || currentUser.logo} alt="me"
                          style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                      : <span style={{ fontSize:20 }}>
                          {isLoggedIn ? (currentUser?.name||'').charAt(0).toUpperCase()||'👤' : '👤'}
                        </span>}
                  </div>
                </div>
                <span style={{ fontSize:9, color:DK, fontWeight:600 }}>
                  {isLoggedIn ? t('home_feed.you_label') : t('home_feed.join_label')}
                </span>
              </button>
              {isLoggedIn && (
                <button onClick={() => onOpenMoment?.()}
                  style={{ position:'absolute', bottom:14, right:4, width:18, height:18,
                    borderRadius:'50%', backgroundColor:B, border:'2px solid #fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, color:WH, fontWeight:900, cursor:'pointer', padding:0 }}>
                  +
                </button>
              )}
            </div>

            {/* Real Moments from other sellers */}
            {otherMoments.map(m => (
              <MomentStory key={m.momentId} moment={m} onView={setViewingMoment} />
            ))}

            {/* Fallback: suggested sellers to follow (shown alongside or instead,
                so the row is never empty while Moments adoption is still growing) */}
            {otherMoments.length === 0 && sellers.map(s => (
              <Story key={s.id||s.userId} seller={s} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
            ))}
          </div>
        </div>
      )}

      {/* ── View Moment modal ── */}
      {viewingMoment && (
        <ViewMomentModal
          moment={viewingMoment}
          onClose={() => setViewingMoment(null)}
          onNavigate={onNavigate}
          isLoggedIn={isLoggedIn}
          currentUser={currentUser}
          activeProfileId={activeProfileId}
        />
      )}

      {/* ── Trending bar ── */}
      {(filter === 'for_you' || filter === 'trending') && (
        <TrendingBar trending={trending} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
      )}

      {/* ── Not logged in hero ── */}
      {!isLoggedIn && filter === 'for_you' && (
        <div style={{ margin:'8px 12px', borderRadius:20,
          background:'linear-gradient(135deg,#1E1B4B,#1D4ED8,#7C3AED)',
          padding:'22px 20px', color:WH }}>
          <div style={{ fontSize:18, fontWeight:900, lineHeight:1.3, marginBottom:8 }}>
            {t('home_feed.hero_title_line1')}<br/>{t('home_feed.hero_title_line2')}
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)',
            marginBottom:16, lineHeight:1.6 }}>
            {t('home_feed.hero_desc')}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => onNavigate('Register')}
              style={{ flex:1, backgroundColor:WH, color:B, border:'none',
                borderRadius:10, padding:'11px 0', cursor:'pointer',
                fontSize:13, fontWeight:900 }}>{t('home_feed.join_free_button')}</button>
            <button onClick={() => onNavigate('PublicLogin')}
              style={{ flex:1, backgroundColor:'rgba(255,255,255,0.15)',
                color:WH, border:'1.5px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'11px 0', cursor:'pointer',
                fontSize:13, fontWeight:700 }}>{t('home_feed.sign_in_button')}</button>
          </div>
        </div>
      )}

      {/* ── Feed posts ── */}
      {loading ? (
        [1,2,3].map(i => (
          <div key={i} style={{ backgroundColor:WH, marginBottom:2,
            borderTop:'1px solid #F1F5F9' }}>
            <div style={{ display:'flex', gap:10, padding:'12px 14px', alignItems:'center' }}>
              <div style={{ width:40, height:40, borderRadius:'50%',
                backgroundColor:'#F1F5F9', flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ height:12, backgroundColor:'#F1F5F9',
                  borderRadius:6, marginBottom:6, width:'55%' }} />
                <div style={{ height:10, backgroundColor:'#F1F5F9',
                  borderRadius:6, width:'35%' }} />
              </div>
            </div>
            <div style={{ height:260, backgroundColor:'#F8FAFC' }} />
          </div>
        ))
      ) : posts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 24px' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>
            {filter==='following' ? '👥' : filter==='nearby' ? '📍' : '🛍️'}
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
            {filter==='following'
              ? t('home_feed.empty_following')
              : filter==='transport'
              ? t('home_feed.empty_transport')
              : filter==='services'
              ? t('home_feed.empty_services')
              : t('home_feed.empty_default')}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16 }}>
            <button onClick={() => onNavigate('Stores')}
              style={{ backgroundColor:B, color:WH, border:'none', borderRadius:12,
                padding:'11px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
              {t('home_feed.discover_businesses_button')}
            </button>
            <button onClick={() => setFilter('for_you')}
              style={{ backgroundColor:'#F1F5F9', color:DK, border:'none',
                borderRadius:12, padding:'11px 20px', cursor:'pointer',
                fontSize:13, fontWeight:700 }}>
              {t('home_feed.for_you_button')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {posts.map((post, i) => {
            const railTypes = ['product', 'classified', 'service', 'store', 'transport'];
            // Every 4th post for a normal-sized feed — but also guarantee at
            // least one rail shows even in a thin feed (e.g. a fresh launch
            // with limited posts seeded yet), where "every 4th" might never
            // be reached at all.
            const isLastPost = i === posts.length - 1;
            const thinFeed = posts.length < 4 && posts.length > 0;
            const showRailAfter = (i + 1) % 4 === 0 || (thinFeed && isLastPost);
            const railIndex = Math.floor(i / 4) % railTypes.length;
            const railType  = railTypes[railIndex];
            const railItems = trending && {
              product:    trending.topProducts,
              classified: trending.topClassifieds,
              service:    trending.topServices,
              store:      trending.topBusinesses?.map(b => b.business).filter(Boolean),
              transport:  trending.topRoutes,
            }[railType];

            // Individual route posts only get the full-width transport card
            // on the dedicated Transport tab (a deliberate browse action).
            // On the general feed, transport is a sample — the rail above
            // (with its own "See All") is that sample; a route landing in
            // the general feed's real-post fallback just renders as a
            // normal post rather than a second, redundant full-width ad.
            const isTransportPost = filter === 'transport' &&
              (post.entityType === 'route' || post.feedType === 'route' || post.linkedEntityType === 'route');

            return (
              <React.Fragment key={post.id || i}>
                {isTransportPost ? (
                  <TransportPostCard post={post} onNavigate={onNavigate} />
                ) : (
                  <PostCard post={post}
                    isLoggedIn={isLoggedIn} onNavigate={onNavigate}
                    currentUser={currentUser} savedIds={savedIds}
                    activeProfileId={activeProfileId}
                    onSaveToggle={(id, saved) => setSavedIds(prev =>
                      saved ? [...prev, id] : prev.filter(x => x !== id)
                    )} />
                )}
                {showRailAfter && (
                  <DiscoveryRail type={railType} items={railItems} onNavigate={onNavigate} />
                )}
              </React.Fragment>
            );
          })}
          {hasMore && (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <button onClick={() => {
                const np = page+1; setPage(np);
                loadPosts(filter, np, true);
              }} disabled={loadingMore}
                style={{ backgroundColor:'#F1F5F9', color:DK, border:'none',
                  borderRadius:12, padding:'11px 32px', cursor:'pointer',
                  fontSize:13, fontWeight:700 }}>
                {loadingMore ? t('home_feed.loading_ellipsis') : t('home_feed.load_more_button')}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Post nudge ── */}
      {!loading && (
        <div style={{ margin:'8px 12px 16px', backgroundColor:WH, borderRadius:16,
          padding:'14px 18px', boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:DK }}>{t('home_feed.share_prompt_title')}</div>
            <div style={{ fontSize:11, color:GR, marginTop:2 }}>{t('home_feed.share_prompt_desc')}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => onNavigate(isLoggedIn?'SellerClassifieds':'Register')}
              style={{ backgroundColor:B, color:WH, border:'none',
                borderRadius:8, padding:'8px 12px', cursor:'pointer',
                fontSize:12, fontWeight:700 }}>{t('home_feed.list_item_button')}</button>
            <button onClick={() => onNavigate(isLoggedIn?'PostService':'Register')}
              style={{ backgroundColor:'#F0FDF4', color:'#16A34A', border:'none',
                borderRadius:8, padding:'8px 12px', cursor:'pointer',
                fontSize:12, fontWeight:700 }}>{t('home_feed.services_button')}</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default HomeFeed;