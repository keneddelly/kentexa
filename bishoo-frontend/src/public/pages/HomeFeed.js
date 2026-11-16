/**
 * HomeFeed.js — Instagram-style commerce feed
 * Place at: src/public/pages/HomeFeed.js
 *
 * Post types and their actions:
 *  classified  → Save | Ask | Share ↗ | Contact | Ship | Follow 
 *  product     → Save | Ask | Share ↗ | Buy Now | Cart | Follow 
 *  service     → Save | Ask | Share ↗ | Book | Contact | Follow 
 *
 * Engagement tracking:
 *  All saves/shares/views go to POST /engagements (entity-based, works on virtual IDs)
 *  Comments go to POST /comments (entity-based)
 */
import ExpandableText from '../components/ExpandableText';
import ArticlePost from '../components/ArticlePost';
import WriterOfWeek, { WriterBadge } from '../components/WriterOfWeek';
import HashtagText from '../components/HashtagText';
import { formatCaption, formatName, formatPrice, formatTitle, leadSeparator } from '../utils/kentexaText';
import { IdentityPill, DESKTOP_QUERY } from '../components/BottomNav';
import ShareSheet from '../components/ShareSheet';
import ShareNudge, { markNudge, nudgeSeen } from '../components/ShareNudge';
import { askToJoin, takeGuestDraft } from '../utils/guestJoin';
import { photoAspect, momentRoleLine, postShareUrl, postPhotos, formatTag, canEditPost, topicLabel } from '../utils/feedPresentation';
import PostPhotos from '../components/PostPhotos';
import PollBlock from '../components/PollBlock';
import PostSafetyMenu from '../components/PostSafetyMenu';
import TopicPicker from '../components/TopicPicker';
import LeoKwako from '../components/LeoKwako';
import NewcomerNudge from '../components/NewcomerNudge';
import ResaleStartCard from '../components/ResaleStartCard';
import CommunitiesPanel from '../components/CommunitiesPanel';
import SuggestedCommunities from '../components/SuggestedCommunities';
import KentexaDirectory, { DIRECTORY_KINDS } from '../components/KentexaDirectory';
import CreateMomentModal from '../components/CreateMomentModal';
import { actorProfileParams, isActorUnresolved, commenterIdentity } from '../utils/publicActor';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ProductTrail from '../components/ProductTrail';
import { buildTrailPool, createTrailRotation } from '../utils/productTrail';
import { TRAY_TABS, traySlots } from '../utils/feedTrays';
import { ArticleTray, HashtagTray, ListTray, PollTray, QuestionTray } from '../components/FeedTray';
import { useCart } from '../../context/CartContext';
import CommerceCommentSection from '../components/CommerceCommentSection';
import AiSearchBar from '../components/AiSearchBar';
import WhoToFollow from '../components/WhoToFollow';
import api             from '../../api/api';
import FeatureTour from '../../onboarding/FeatureTour';
import TourTrigger from '../../onboarding/TourTrigger';
import { listingUrl, listingWhatsAppHref } from '../utils/listingWhatsApp';

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

// Twitter-style feed tokens (owner 2026-10-26: "professional homefeed, no emoji").
const INK_TX = '#0f1419';
const MUTED_TX = '#536471';
const LINE_TX = '#eff3f4';
const LINE_BTN = '#cfd9de';
const pillTx = (dark) => ({ height:36, padding:'0 14px', borderRadius:18, border: dark ? 'none' : `1px solid ${LINE_BTN}`,
  background: dark ? INK_TX : '#ffffff', color: dark ? '#ffffff' : INK_TX, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' });
const VerifiedTick = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-label="Imethibitishwa" style={{ flexShrink:0 }}>
    <path fill="#1d4ed8" d="M12 1l2.6 2.1 3.3-.4 1.1 3.2 3 1.6-.9 3.2.9 3.2-3 1.6-1.1 3.2-3.3-.4L12 23l-2.6-2.1-3.3.4-1.1-3.2-3-1.6.9-3.2-.9-3.2 3-1.6 1.1-3.2 3.3.4z"/>
    <path d="M7.5 12.2l3 3 6-6" fill="none" stroke="#ffffff" strokeWidth="2.2"/>
  </svg>
);

const getFilters = t => [
  { key:'for_you',    label:t('home_feed.filter_for_you')       },
  { key:'following',  label:t('home_feed.filter_following') },
  // Social Home part 3 (owner approved 2026-11-02): communities.
  { key:'communities', label:'Jumuiya' },
  { key:'nearby',     label:t('home_feed.filter_nearby')      },
  // Owner 2026-11-02: the catalogue tabs show everything of their kind on KenteXa (not posts).
  { key:'products',    label:'Bidhaa'    },
  { key:'services',    label:'Huduma'    },
  { key:'hotels',      label:'Hoteli'    },
  { key:'classifieds', label:'Matangazo' },
  { key:'businesses',  label:'Biashara'  },
];

const getTypeMeta = t => ({
  classified:  { label:t('home_feed.type_listing'),   bg:'#fffbeb', color:'#d97706' },
  product:     { label:t('home_feed.type_products'),  bg:'#EFF6FF', color:B         },
  service:     { label:t('home_feed.type_services'),    bg:'#F0FDF4', color:'#16A34A' },
  new_product: { label:t('home_feed.type_products'),  bg:'#EFF6FF', color:B         },
  new_service: { label:t('home_feed.type_services'),    bg:'#F0FDF4', color:'#16A34A' },
  discount:    { label:t('home_feed.type_discount'),   bg:'#fffbeb', color:'#d97706' },
  announcement:{ label:t('home_feed.type_listing'),   bg:'#FEF3C7', color:'#D97706' },
  delivery_info:{ label:t('home_feed.type_transport'),  bg:'#FEF3C7', color:'#D97706' },
  looking_for: { label:t('home_feed.type_looking_for'), bg:'#f7f9f9', color:'#0f1419' },
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

// Phase C (2026-11-02): the chat keeps what it started from. A real post is the context
// ('moment'); a listing shown in the feed without a post is that listing. The server checks
// both belong to the seller and that the person may see them, else the chat opens untagged.
export const messageContextFor = (post, kind) => {
  if (/^\d+$/.test(String(post?.id ?? ''))) return { contextType: 'moment', contextId: Number(post.id) };
  const id = post?.entityId || post?.linkedEntityId;
  return id && /^\d+$/.test(String(id)) ? { contextType: kind, contextId: Number(id) } : {};
};

// ── Contact modal ─────────────────────────────────────────────────────────────
const ContactModal = ({ post, onClose, onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const biz   = post.business || {};
  const title = post.title || '';
  // The seller sees which listing and that the customer came from KenteXa.
  const kindOf = post.entityType || post.feedType || post.linkedEntityType || 'classified';
  const kind = kindOf === 'product' ? 'product' : (kindOf === 'service' || kindOf === 'new_service') ? 'service' : 'classified';
  const waHref = listingWhatsAppHref({
    phone: biz.storeWhatsApp || biz.phone, kind, title,
    price: post.price || post.data?.price || post.data?.basePrice,
    url: listingUrl(kind, post.entityId || post.linkedEntityId, undefined, post.title), shopName: biz.storeName || biz.name,
  });

  return (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)',
      zIndex:4000, display:'flex', alignItems:'flex-end' }}>
      <div style={{ width:'100%', backgroundColor:WH, borderRadius:'20px 20px 0 0',
        padding:'24px 20px 44px', animation:'slideUp 0.2s ease' }}>
        <div style={{ width:36, height:4, borderRadius:100, backgroundColor:'#E2E8F0',
          margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:800, color:DK, marginBottom:4 }}>
          {t('home_feed.contact_title', { name: biz.storeName || biz.name })}
        </div>
        <div style={{ fontSize:12, color:GR, marginBottom:20 }}>{t('home_feed.about_label', { title })}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button data-testid="contact-inbox" onClick={() => { if (isActorUnresolved(biz)) return; onNavigate(isLoggedIn ? `MessageSeller-${biz.id}` : 'PublicLogin', { ...actorProfileParams(biz), ...messageContextFor(post, kind) }); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'16px',
              backgroundColor:'#EFF6FF', borderRadius:14, border:'none', cursor:'pointer',
              textAlign:'left', width:'100%' }}>
            
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:DK }}>{t('home_feed.kentexa_inbox_label')}</div>
              <div style={{ fontSize:12, color:GR }}>{t('home_feed.send_in_app_desc')}</div>
            </div>
          </button>
          {waHref && (
            <a href={waHref}
              target="_blank" rel="noreferrer"
              onClick={onClose}
              style={{ display:'flex', alignItems:'center', gap:14, padding:'16px',
                backgroundColor:'#F0FDF4', borderRadius:14, textDecoration:'none' }}>
              
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:'#16A34A' }}>{t('home_feed.whatsapp_label')}</div>
                <div style={{ fontSize:12, color:GR }}>{t('home_feed.chat_directly_desc')}</div>
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
const HOME_COMMENTS = 3; // comments shown under a post on Home; the rest on the post page
const CommentSection = ({ post, isLoggedIn, onNavigate, currentUser, activeProfileId, detail = false, communityRole = null, onShare = null }) => {
  const { t } = useTranslation();
  const ago = getAgo(t);
  const [comments, setComments] = useState([]);
  const [body,     setBody]     = useState('');
  const [replyTo,  setReplyTo]  = useState(null); // { id: the comment the reply goes under, name }
  const [likes,    setLikes]    = useState({});
  const [restored, setRestored] = useState(false);
  // Viral engine B: back after registering, the reply written as a guest is ready to send.
  useEffect(() => {
    if (!isLoggedIn || !detail) return;
    const d = takeGuestDraft(post.id);
    if (!d) return;
    setBody(d.body || '');
    if (d.parentId) setReplyTo({ id: d.parentId, name: d.replyName || '' });
    setRestored(true);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [isLoggedIn, detail, post.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openThreads, setOpenThreads] = useState({});
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
  // Viral engine B (#381): a guest who wants to take part is invited to join right here, with the
  // real people in the discussion; a reply they wrote is kept and is ready after registering.
  const askGuest = (action, draft) => {
    const names = [];
    comments.forEach((c) => [c, ...(c.replies || [])].forEach((x) => {
      const n = formatName(commenterIdentity(x).name);
      if (n && !x.isDeleted && !names.includes(n)) names.push(n);
    }));
    const handled = askToJoin({
      action, destination: isRealPost ? `PostDetail-${post.id}` : null,
      people: names.slice(0, 2), others: Math.max(0, names.length - 2), replies: comments.length,
      draft: draft ? { postId: post.id, ...draft } : null,
    });
    if (!handled) onNavigate('PublicLogin');
  };
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
    if (!isLoggedIn) { askGuest('reply', { body, parentId: replyTo?.id || null, replyName: replyTo?.name || '' }); return; }
    if (!body.trim()) return;
    try {
      setSending(true);
      const payload = isRealPost
        // I2F: the server derives the acting identity from the authenticated context -- never sent.
        ? { body: body.trim(), parentId: replyTo?.id || undefined }
        : { body: body.trim(), entityType: post.entityType,
            entityId: post.entityId, parentId: replyTo?.id || undefined };
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
    if (!isLoggedIn) { askGuest('reply', { body: '' }); return; }
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
      });
      setComments(prev => [...prev, { ...res.data, replies: [] }]);
      setShowReply(false);
      setReplyItem(null);
    } catch {}
    finally { setReplySending(false); }
  };

  // ── #374 C: comments that work like a conversation (owner approved 2026-11-16) ──
  // Every action is a visible button. One level of replies under each comment, with a thin
  // line; "Onyesha majibu N zaidi" opens the rest. On the post page the reply box is fixed at
  // the bottom of the screen, above the bottom bar, and a "Jibu" box sits right under the post.
  const ownerId = post.businessId ?? post.business?.id ?? null;
  // #374 D: in a community, the writer (or a moderator) picks one reply as "Jibu bora";
  // a moderator can close replies.
  const communityId = post.community?.id || post.communityId || null;
  const [bestId, setBestId] = useState(post.bestCommentId || null);
  useEffect(() => { setBestId(post.bestCommentId || null); }, [post.bestCommentId]);
  const isModeratorHere = communityRole === 'admin' || communityRole === 'helper';
  const canChooseBest = !!communityId && isLoggedIn && (isModeratorHere || (currentUser?.id && Number(currentUser.id) === Number(ownerId)));
  const locked = !!post.repliesLocked;
  // Viral engine C11 (#381): once the writer picks "Jibu bora", one invitation to share the discussion.
  const [bestNudge, setBestNudge] = useState(false);
  const isWriter = currentUser?.id && Number(currentUser.id) === Number(ownerId);
  const chooseBest = async (commentId) => {
    const prev = bestId;
    setBestId(commentId);
    try {
      await api.post(`/communities/${communityId}/posts/${post.id}/best-answer`, { commentId });
      if (commentId && isWriter && onShare && !nudgeSeen(`best-${post.id}`)) setBestNudge(true);
    }
    catch { setBestId(prev); }
  };
  const replyName = (c) => formatName(commenterIdentity(c).name) || t('home_feed.user_fallback');
  const startReply = (c, root) => {
    if (!isLoggedIn) { askGuest('reply', { body: '', parentId: root.id, replyName: replyName(c) }); return; }
    setReplyTo({ id: root.id, name: replyName(c) });
    setOpenThreads((s) => ({ ...s, [root.id]: true }));
    inputRef.current?.focus();
  };
  const likeOf = (c) => likes[c.id] || { liked: !!c.likedByMe, count: Number(c.helpfulCount || 0) };
  const toggleLike = async (c) => {
    if (!isLoggedIn) { askGuest('like'); return; }
    const cur = likeOf(c);
    const next = { liked: !cur.liked, count: Math.max(0, cur.count + (cur.liked ? -1 : 1)) };
    setLikes((m) => ({ ...m, [c.id]: next }));
    try {
      const r = await api.post(`/comments/${c.id}/helpful`);
      setLikes((m) => ({ ...m, [c.id]: { liked: !!r.data?.helpful, count: Number(r.data?.helpfulCount ?? next.count) } }));
    } catch {
      setLikes((m) => ({ ...m, [c.id]: cur }));
    }
  };

  const chip = (extra = {}) => ({ display:'flex', alignItems:'center', gap:5, minHeight:32, padding:'0 12px', borderRadius:999,
    border:`1px solid ${LINE_BTN}`, background:WH, color:INK_TX, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', ...extra });
  const chipIcon = (d, fill) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={fill || 'none'} stroke={fill || INK_TX} strokeWidth="2" aria-hidden="true"><path d={d} /></svg>
  );
  const HEART = 'M12 21s-7.5-4.6-9.5-9.2C1 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 6 3.5 4.5 7.3C19.5 16.4 12 21 12 21z';
  const BUBBLE = 'M21 12a8 8 0 01-11.6 7.2L4 20l1-4.6A8 8 0 1121 12z';

  const renderOffer = (c) => c.offerCard && (
    <button type="button" onClick={() => {
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
      style={{ display:'flex', alignItems:'center', gap:10, marginTop:6, padding:8, borderRadius:12, border:`1px solid ${LINE_TX}`,
        backgroundColor:'#f7f9f9', cursor:'pointer', width:'100%', maxWidth:300, textAlign:'left', fontFamily:'inherit' }}>
      <div style={{ width:40, height:40, borderRadius:8, backgroundColor:LINE_TX, flexShrink:0, overflow:'hidden' }}>
        {c.offerCard.image && <img src={c.offerCard.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:INK_TX, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {formatTitle(c.offerCard.title)}
        </div>
        {c.offerCard.price != null && (
          <div style={{ fontSize:13, color:INK_TX }}>{formatPrice(c.offerCard.price) || 'Bure'}</div>
        )}
      </div>
      <span style={{ fontSize:13, fontWeight:700, color:INK_TX, flexShrink:0 }}>{t('home_feed.view_arrow')}</span>
    </button>
  );

  const renderComment = (c, root, isReply, hasThread) => {
    // Show whichever profile the commenter was actually acting as — not always their personal
    // account (commenterIdentity: never storeName/logo for a Personal comment).
    const identity = commenterIdentity(c);
    const name = formatName(identity.name) || t('home_feed.user_fallback');
    const size = isReply ? 28 : 36;
    const like = likeOf(c);
    const isAuthor = ownerId != null && c.authorId != null && Number(c.authorId) === Number(ownerId);
    return (
      <div key={c.id} data-testid={isReply ? 'comment-reply' : 'comment'} style={{ display:'flex', gap:10, padding: isReply ? '4px 0 0 46px' : '12px 0 0' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
          <div style={{ width:size, height:size, borderRadius:'50%', background:'#d6e4f0', overflow:'hidden', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize: isReply ? 12 : 14, fontWeight:700, color:INK_TX }}>
            {identity.photo ? <img src={identity.photo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : name.charAt(0).toUpperCase()}
          </div>
          {hasThread && <div aria-hidden="true" style={{ flex:1, width:2, background:LINE_BTN, marginTop:4, minHeight:12 }} />}
        </div>
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:3, paddingBottom:8 }}>
          <div style={{ fontSize:14, color:MUTED_TX, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            <b style={{ color:INK_TX }}>{name}</b>{isAuthor ? ' · mwandishi' : ''} · {ago(c.createdAt)}
          </div>
          <div style={{ fontSize:15, lineHeight:'21px', color: c.isDeleted ? MUTED_TX : INK_TX, fontStyle: c.isDeleted ? 'italic' : 'normal',
            whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>
            {c.isDeleted ? 'Jibu hili limefutwa' : <HashtagText text={c.body} onTag={onNavigate ? (key) => onNavigate(`Tag-${key}`) : null} />}
          </div>
          {renderOffer(c)}
          {!c.isDeleted && (
            <div style={{ display:'flex', gap:8, paddingTop:6, flexWrap:'wrap' }}>
              {!locked && (
                <button type="button" data-testid="comment-reply-btn" onClick={() => startReply(c, root)} style={chip()}>
                  {chipIcon(BUBBLE)}Jibu
                </button>
              )}
              {!isReply && canChooseBest && (
                <button type="button" data-testid={Number(bestId) === Number(c.id) ? 'comment-unbest' : 'comment-best'}
                  onClick={() => chooseBest(Number(bestId) === Number(c.id) ? null : c.id)}
                  style={chip({ borderColor:'#1d6b39', background:'#f2fbf5', color:'#1d6b39', fontWeight:700 })}>
                  {chipIcon('M5 12l5 5L20 7')}{Number(bestId) === Number(c.id) ? 'Ondoa jibu bora' : 'Jibu bora'}
                </button>
              )}
              <button type="button" data-testid="comment-like" aria-pressed={like.liked}
                aria-label={like.count ? `Penda, ${like.count}` : 'Penda'} onClick={() => toggleLike(c)}
                style={chip(like.liked ? { background:'#fdecef', borderColor:'#f4b4be', color:'#c4123c', fontWeight:700 } : {})}>
                {chipIcon(HEART, like.liked ? '#c4123c' : null)}{like.count > 0 ? like.count : 'Penda'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderThread = (c) => {
    const replies = c.replies || [];
    const open = !!openThreads[c.id];
    const shown = open ? replies : replies.slice(0, 1);
    const hidden = replies.length - shown.length;
    return (
      <div key={c.id} style={{ borderBottom:`1px solid ${LINE_TX}` }}>
        {renderComment(c, c, false, replies.length > 0)}
        {shown.map((r) => renderComment(r, c, true, false))}
        {hidden > 0 && (
          <button type="button" data-testid="comment-more-replies" onClick={() => setOpenThreads((s) => ({ ...s, [c.id]: true }))}
            style={{ margin:'4px 0 10px 46px', display:'flex', alignItems:'center', gap:6, minHeight:34, padding:'0 14px', borderRadius:999,
              border:'none', background:'#e8f5fd', color:'#1a6fb0', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {hidden === 1 ? 'Onyesha jibu 1 zaidi' : `Onyesha majibu ${hidden} zaidi`}
          </button>
        )}
        {hidden === 0 && <div style={{ height:4 }} />}
      </div>
    );
  };

  const visible = detail ? comments : comments.slice(0, HOME_COMMENTS);
  const best = bestId ? comments.find((c) => Number(c.id) === Number(bestId) && !c.isDeleted) || null : null;
  const lockedNote = (
    <div data-testid="replies-locked" style={{ padding:'12px 0', fontSize:14, color:MUTED_TX, borderBottom:`1px solid ${LINE_TX}` }}>
      Majibu ya chapisho hili yamefungwa na msimamizi.
    </div>
  );
  const placeholder = replyTo ? `Jibu kwa ${replyTo.name}…` : 'Andika jibu lako…'; // guests too: write first, join after
  const myInitial = (currentUser?.name || 'U').charAt(0).toUpperCase();

  const replyBar = (
    <div data-testid="reply-bar" {...(detail ? { 'data-fixed-bar': '' } : {})}
      // Signed in, the bottom bar is there and the reply bar sits on it; a guest has no bottom bar.
      className={detail && isLoggedIn ? 'kx-reply-bar' : undefined}
      style={detail
        ? { position:'fixed', left:0, right:0, zIndex:900, background:WH, borderTop:`1px solid ${LINE_TX}`,
            ...(isLoggedIn ? {} : { bottom:0, paddingBottom:'env(safe-area-inset-bottom, 0px)' }) }
        : { borderTop:`1px solid ${LINE_TX}` }}>
      <div style={{ maxWidth: detail ? 600 : undefined, margin:'0 auto', padding:'8px 12px', display:'flex', flexDirection:'column', gap:6 }}>
        {restored && body.trim() && (
          <div data-testid="reply-restored" role="status" style={{ fontSize:13, color:'#1d6b39' }}>Jibu lako liko tayari. Bonyeza Tuma kulituma.</div>
        )}
        {replyTo && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:MUTED_TX }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Unajibu <b style={{ color:INK_TX }}>{replyTo.name}</b></span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Acha kujibu"
              style={chip({ minHeight:28, padding:'0 10px', marginLeft:'auto' })}>Acha</button>
          </div>
        )}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <label htmlFor={`reply-${post.id}`} style={{ position:'absolute', left:-9999 }}>Andika jibu</label>
          <input id={`reply-${post.id}`} ref={inputRef} value={body} data-testid="reply-input"
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={placeholder}
            style={{ flex:1, minWidth:0, height:40, borderRadius:20, border:`1px solid ${LINE_BTN}`, background:'#f7f9f9',
              padding:'0 14px', fontSize:16, color:INK_TX, fontFamily:'inherit', outline:'none' }} />
          <button type="button" onClick={handleSend} disabled={sending || !body.trim()} aria-label="Tuma jibu" data-testid="reply-send"
            style={{ width:40, height:40, borderRadius:'50%', border:'none', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
              background: body.trim() ? '#1d9bf0' : '#8ecdf8', cursor: body.trim() ? 'pointer' : 'default' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WH} strokeWidth="2.2" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid="comment-section" style={{ background:WH }}>
      {/* The bottom bar is 60px on a phone; on a computer there is none (side menu). */}
      {detail && <style>{`.kx-reply-bar{bottom:calc(60px + env(safe-area-inset-bottom, 0px))}@media ${DESKTOP_QUERY}{.kx-reply-bar{bottom:0}}`}</style>}
      {locked && lockedNote}
      {bestNudge && (
        <ShareNudge testid="best-nudge" title="Jibu bora limechaguliwa" text="Shiriki mjadala huu ili wengine wanufaike na jibu hili."
          onShare={() => { markNudge(`best-${post.id}`); setBestNudge(false); onShare(); }} onDismiss={() => { markNudge(`best-${post.id}`); setBestNudge(false); }} />
      )}
      {detail && !locked && (
        <button type="button" data-testid="reply-under-post" onClick={() => { setReplyTo(null); inputRef.current?.focus(); }}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 0', border:'none', borderBottom:`1px solid ${LINE_TX}`,
            background:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
          <span style={{ width:32, height:32, borderRadius:'50%', background:'#d6e4f0', display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:700, fontSize:13, color:INK_TX, flexShrink:0 }}>{myInitial}</span>
          <span style={{ flex:1, fontSize:15, color:MUTED_TX }}>Andika jibu lako…</span>
          <span style={{ background:'#1d9bf0', color:WH, borderRadius:999, padding:'6px 14px', fontWeight:700, fontSize:14 }}>Jibu</span>
        </button>
      )}
      {!detail && !locked && replyBar}
      <div>
        {loading
          ? <div style={{ fontSize:14, color:MUTED_TX, padding:'12px 0' }}>{t('home_feed.loading_comments')}</div>
          : comments.length === 0
            ? <div data-testid="comments-empty" style={{ fontSize:14, color:MUTED_TX, padding:'12px 0' }}>{t('home_feed.be_first_to_ask')}</div>
            : <>
                {best && (
                  <div data-testid="best-answer" style={{ margin:'10px 0 4px', border:'1px solid #b7e1c4', background:'#f2fbf5', borderRadius:12, padding:'2px 12px 4px' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#1d6b39', paddingTop:8 }}>Jibu bora</div>
                    {renderComment(best, best, false, false)}
                  </div>
                )}
                {visible.filter((c) => !best || c.id !== best.id).map(renderThread)}
              </>}
      </div>
      {!detail && comments.length > visible.length && (
        <button type="button" data-testid="comments-all" onClick={() => onNavigate(`PostDetail-${post.id}-comments`)}
          style={{ margin:'10px 0', display:'flex', alignItems:'center', gap:6, minHeight:36, padding:'0 16px', borderRadius:999,
            border:'none', background:'#e8f5fd', color:'#1a6fb0', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {`Ona maoni yote ${comments.length}`}
        </button>
      )}
      {isLookingFor && (
        <div style={{ padding:'10px 0' }}>
          <button type="button" onClick={openReply}
            style={{ width:'100%', backgroundColor:'#f7f9f9', color:INK_TX, border:`1px solid ${LINE_BTN}`, borderRadius:999, minHeight:44,
              cursor:'pointer', fontSize:15, fontWeight:700, fontFamily:'inherit' }}>
            {t('home_feed.have_this_reply_button')}
          </button>
        </div>
      )}
      {/* The room under the last comment for the fixed reply bar is at the end of PostDetail, after Mijadala zaidi. */}
      {detail && !locked && replyBar}

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
              <div style={{ fontSize:15, fontWeight:800, color:DK }}>{t('home_feed.what_do_you_have_title')}</div>
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
                          ? '2px solid #0f1419' : '1px solid #E2E8F0',
                        backgroundColor: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '#f7f9f9' : WH,
                        cursor:'pointer', textAlign:'left' }}>
                      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9',
                        flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:14 }}>
                        {item.image
                          ? <img src={item.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                          : ''}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK, flex:1,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.title}
                      </div>
                      {replyItem?.type===item.type && replyItem?.id===item.id && (
                        <VerifiedTick />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
              borderTop:'1px solid #F1F5F9' }}>
              <button onClick={sendOffer} disabled={!replyItem || replySending}
                style={{ width:'100%', backgroundColor: replyItem ? '#0f1419' : '#E2E8F0',
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

/** The post page's time line: "10:20 · 2 Nov 2026" (owner 2026-11-02: a professional post page). */
const MONTHS_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
export const fullTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} · ${d.getDate()} ${MONTHS_SW[d.getMonth()]} ${d.getFullYear()}`;
};

// ── Post card ─────────────────────────────────────────────────────────────────
export const PostCard = ({ post: postProp, isLoggedIn, onNavigate, currentUser, savedIds, onSaveToggle, likedIds, onLikeToggle, repostedIds, onRepostToggle, activeProfileId, initialShowComments = false, detail = false, communityRole = null, detailExtra = null }) => {
  const { t } = useTranslation();
  // Phase D: an edit by the author updates this card in place (the server answers with the post).
  const [post, setPost] = useState(postProp);
  useEffect(() => { setPost(postProp); }, [postProp]);
  const [editing, setEditing] = useState(false);
  // Phase F: repost, the ··· menu (mute, report), and a card hidden after a mute.
  const [reposted, setReposted] = useState(repostedIds ? repostedIds.includes(postProp.id) : false);
  const [showMenu, setShowMenu] = useState(false);
  const [mutedNow, setMutedNow] = useState(false);
  const ago = getAgo(t);
  const TYPE_META = getTypeMeta(t);
  const [saved,        setSaved]        = useState(savedIds ? savedIds.includes(post.id) : !!post.isSaved);
  // Phase C (owner 2026-11-02): the heart is a like; the bookmark is a save.
  const [liked,        setLiked]        = useState(likedIds ? likedIds.includes(post.id) : !!post.isLiked);
  const [showComments, setShowComments] = useState(initialShowComments);
  const [showContact,  setShowContact]  = useState(false);
  const [followed,     setFollowed]     = useState(!!post.business?.isFollowing);
  const [imgErr,       setImgErr]       = useState(false);
  // Phase B (owner 2026-11-01): a photo keeps its own shape between portrait 4:5 and wide
  // 16:9; only what falls outside that range is trimmed, never forced into one crop.
  const [imgRatio,     setImgRatio]     = useState(null);
  const [shareMsg,     setShareMsg]     = useState('');
  const [counts,       setCounts]       = useState({
    saves:    post.saveCount    || 0,
    likes:    post.likeCount    || 0,
    reposts:  post.repostCount  || 0,
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
  const bizName = formatName(biz.storeName || biz.name) || t('home_feed.business_fallback');
  // When the backend resolved this post's commerceProfileId to a specific
  // CommerceProfile, nav must land there — not the owner's default/personal
  // profile, which is what a bare account id resolves to otherwise.
  const bizNavParams = actorProfileParams(biz);
  // I2B: a Moment whose actor the server could not resolve (never stamped) must not
  // navigate to a guessed profile -- a bare owner id lands on the owner's Personal profile.
  const actorUnresolved = isActorUnresolved(biz);
  const photos  = postPhotos(post);
  const image   = photos.length > 1 ? null : ((!imgErr && (post.imageUrl || post.data?.images?.[0])) || null);
  const tag     = formatTag(post.intent);
  const mayEdit = canEditPost(post, currentUser?.id);
  // One text per post: a Moment repeats its caption as title and body; a listing has a
  // name (headline) and a description. "Moment" is only the empty-caption placeholder.
  const rawTitle = (post.title || '').trim();
  const rawBody  = (post.body || '').trim();
  const sameText = !!rawBody && (rawTitle === rawBody || rawTitle === 'Moment');
  const headline = sameText || rawTitle === 'Moment' ? '' : rawTitle;
  const postText = sameText ? rawBody : (rawBody || (!headline ? rawTitle : ''));
  // Hashtags (owner 2026-11-15): a tag in the text opens its page.
  const openTag = (key) => onNavigate && onNavigate(`Tag-${key}`);
  // Badge: real, unambiguous post types (Moment, Looking For, Discount...)
  // always win over the entityType inference above, which is really about
  // what's tagged/for-sale, not what kind of post this is.
  const UNIQUE_BADGE_TYPES = ['moment','looking_for','discount','announcement','delivery_info','restock'];
  const typeInfo = UNIQUE_BADGE_TYPES.includes(post.type)
    ? (TYPE_META[post.type] || TYPE_META.classified)
    : (TYPE_META[entityType] || TYPE_META[post.type] || TYPE_META.classified);
  const price   = post.price || post.data?.price || post.data?.basePrice || 0;

  useEffect(() => { if (savedIds) setSaved(savedIds.includes(post.id)); }, [savedIds, post.id]);
  useEffect(() => { if (likedIds) setLiked(likedIds.includes(post.id)); }, [likedIds, post.id]);
  useEffect(() => { if (repostedIds) setReposted(repostedIds.includes(post.id)); }, [repostedIds, post.id]);
  useEffect(() => { setFollowed(!!post.business?.isFollowing); }, [post.business?.isFollowing]);

  // ── Impression tracking — mark a post "seen" once it's actually been
  // scrolled into view (not just opened), so the feed can rotate it out
  // instead of re-serving the same top post forever.
  const cardRef = useRef(null);
  const hasTrackedView = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || hasTrackedView.current || !cardRef.current) return;
    const el = cardRef.current;
    // IntersectionObserver is unavailable in some embedded webviews and test
    // environments; engagement actions must remain usable without impressions.
    if (typeof IntersectionObserver === 'undefined') return undefined;
    let timer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // A tall card (photos, long text) may never be 60% on a small screen; it also counts
        // as seen once it fills half the screen (owner 2026-11-02: seen posts kept returning).
        const viewportH = (typeof window !== 'undefined' && window.innerHeight) || 0;
        // Owner 2026-11-02 (again): the top post came back after scrolling past it quickly. Half
        // of the card, or a third of the screen, for half a second counts as seen.
        const seenEnough = entry.isIntersecting && (entry.intersectionRatio >= 0.5
          || (viewportH > 0 && entry.intersectionRect && entry.intersectionRect.height >= viewportH * 0.35));
        if (seenEnough) {
          if (timer) return;
          timer = setTimeout(() => {
            if (!hasTrackedView.current) {
              hasTrackedView.current = true;
              Engagement.track(post.id, entityType, entityId, 'view', isLoggedIn, onNavigate);
            }
            observer.disconnect();
          }, 500);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.8, 1] },
    );
    observer.observe(el);
    return () => { if (timer) clearTimeout(timer); observer.disconnect(); };
  }, [isLoggedIn, post.id, entityType, entityId, onNavigate]);

  // Viral engine B: a guest is invited to join (and comes back to this post).
  const askGuestHere = (action) => {
    const handled = askToJoin({ action, destination: /^\d+$/.test(String(post.id ?? '')) ? `PostDetail-${post.id}` : null, replies: counts.comments });
    if (!handled) onNavigate('PublicLogin');
  };
  const handleSave = async () => {
    if (!isLoggedIn) { askGuestHere('save'); return; }
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

  const sharedOnce = useRef(false);
  const isRealPost = /^\d+$/.test(String(post.id ?? ''));
  const canRepost = isRealPost && (!post.visibility || post.visibility === 'public');
  const handleRepost = async () => {
    if (!isLoggedIn) { askGuestHere('repost'); return; }
    const res = await Engagement.track(post.id, entityType, entityId, 'repost', isLoggedIn, onNavigate);
    if (res !== null && res !== undefined) {
      const toggled = res?.toggled ?? !reposted;
      setReposted(toggled);
      setCounts(c => ({ ...c, reposts: Math.max(0, c.reposts + (toggled ? 1 : -1)) }));
      onRepostToggle?.(post.id, toggled);
    }
  };
  const handleLike = async () => {
    if (!isLoggedIn) { askGuestHere('like'); return; }
    const res = await Engagement.track(post.id, entityType, entityId, 'like', isLoggedIn, onNavigate);
    if (res !== null) {
      const toggled = res?.toggled ?? !liked;
      setLiked(toggled);
      setCounts(c => ({ ...c, likes: Math.max(0, c.likes + (toggled ? 1 : -1)) }));
      onLikeToggle?.(post.id, toggled);
    }
  };

  // Phase C: share the post's own link; it is counted only once the share or the copy
  // really happened (a cancelled share sheet counts nothing).
  // Viral engine C10: a real post opens the smart share sheet (message, channels, cards).
  const [sheetOpen, setSheetOpen] = useState(false);
  const countShare = async () => {
    if (!isLoggedIn) return;
    const res = await Engagement.track(post.id, entityType, entityId, 'share', true, onNavigate);
    // The server counts one share per person; this card adds it once.
    if (res?.toggled && !sharedOnce.current) { sharedOnce.current = true; setCounts(c => ({ ...c, shares: c.shares + 1 })); }
  };
  const handleShare = async () => {
    const plain = postShareUrl(post, entityType, entityId);
    const isPost = /^\d+$/.test(String(post?.id ?? ''));
    if (isPost) { setSheetOpen(true); return; }
    // Listings without a post: the phone's own share sheet with the item's address.
    const url = plain;
    let done = false;
    if (navigator.share) {
      done = await navigator.share({ title: post.title || bizName, url }).then(() => true, () => false);
    } else if (navigator.clipboard?.writeText) {
      done = await navigator.clipboard.writeText(url).then(() => true, () => false);
      if (done) { setShareMsg(t('home_feed.link_copied')); setTimeout(() => setShareMsg(''), 2000); }
    }
    if (done) countShare();
  };

  const handleFollow = async () => {
    if (!isLoggedIn) { askGuestHere('follow'); return; }
    try {
      // Follow the exact public actor shown on the post. A Moment may be
      // Personal, Business, Hub, Agent, etc.; routing every button through
      // /stores/:userId silently toggled the owner's BUSINESS relationship.
      const endpoint = biz.commerceProfileId
        ? `/profiles/${biz.commerceProfileId}/follow`
        : `/stores/${bizId}/follow`;
      const res = await api.post(endpoint);
      setFollowed(res.data.following ?? !followed);
    } catch {}
  };

  const openComments = () => {
    // On the post's own page the comments always stay open (owner 2026-11-02).
    setShowComments(s => (detail ? true : !s));
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
    // Self-tagged Moment (CreateMomentModal.js's "My Business" option) —
    // entityId here IS a CommerceProfile id, never a classified id, same
    // fix as ViewMomentModal's goToListing() above.
    else if (entityType === 'business' && entityId) onNavigate(`CommerceProfile-${entityId}`, bizNavParams);
    else if (entityId) onNavigate(`ClassifiedDetail-${entityId}`);
    else if (bizId && !actorUnresolved) onNavigate(`CommerceProfile-${bizId}`, bizNavParams);
  };

  const kindLabel = typeInfo.label;
  // #374 B: a plain Moment needs no label; other kinds (a listing, Natafuta...) keep theirs.
  const kindText = post.type === 'moment' || post.postType === 'moment' || tag ? '' : kindLabel;
  const handle = biz.username ? `@${biz.username}` : '';
  const productName = headline || (isProduct || isService ? rawTitle : '');
  // One KenteXa text style (#374 part E): a title that is not a product's name becomes the bold
  // start of the caption ("Title: text"); the same words twice show once. Display only.
  const commerceBox = price > 0 || !!(entityId && (isProduct || isService));
  const caption = commerceBox ? { lead: '', text: postText } : formatCaption(headline, postText);
  const priceText = formatPrice(price);
  const icon = (d, filled) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled || 'none'} stroke={filled || INK_TX} strokeWidth="2" aria-hidden="true"><path d={d} /></svg>
  );
  // #374 C/B: every action is a visible button (icon, count, big enough to tap).
  const act = (on = false, onColor = INK_TX, onBg = '#f7f9f9') => (detail
    ? { display:'flex', alignItems:'center', justifyContent:'center', gap:6, minHeight:44, minWidth:44, padding:'0 12px', borderRadius:999,
        border:'none', background: on ? onBg : '#f7f9f9', color: on ? onColor : INK_TX, fontSize:14, fontWeight: on ? 700 : 600,
        cursor:'pointer', fontFamily:'inherit' }
    // #374 B: on Home too: a light pill with its icon and count, never text that looks unclickable.
    : { display:'flex', alignItems:'center', justifyContent:'center', gap:5, minHeight:36, minWidth:44, padding:'0 10px', borderRadius:999,
        border:'none', background: on ? onBg : '#f7f9f9', color: on ? onColor : INK_TX, fontSize:13, fontWeight: on ? 700 : 600,
        cursor:'pointer', fontFamily:'inherit' });
  const openProfile = () => bizId && !actorUnresolved && onNavigate(`CommerceProfile-${bizId}`, bizNavParams);
  const isOwnPost = !!currentUser?.id && Number(post.businessId ?? bizId) === Number(currentUser.id);

  // Phase F: after a mute the card steps aside, with a way to undo it.
  if (mutedNow) {
    return (
      <div data-testid="muted-note" style={{ padding:'12px 16px', borderBottom:`1px solid ${LINE_TX}`, fontSize:14, color:MUTED_TX, background:WH }}>
        Umemnyamazisha {bizName}. Machapisho yao hayataonekana kwako.{' '}
        <button type="button" onClick={async () => {
          try { const target = biz.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : { accountId: bizId };
            const r = await api.post('/feed/mute', target); if (r?.data?.muted === false) setMutedNow(false); } catch { /* stays muted */ }
        }} style={{ background:'none', border:'none', padding:0, color:B, fontWeight:700, cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>Tendua</button>
      </div>
    );
  }

  return (
    <article ref={cardRef} data-testid="feed-post" data-variant={detail ? 'detail' : 'feed'}
      style={{ display:'flex', flexDirection:'column', padding: detail ? '14px 16px 0' : '12px 16px', backgroundColor:WH, borderBottom: detail ? 'none' : `1px solid ${LINE_TX}` }}>
      {post.repostedBy?.name && (
        <div data-testid="reposted-by" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color:MUTED_TX, margin:'0 0 6px 52px' }}>
          {icon('M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3')}{post.repostedBy.name} amesambaza
        </div>
      )}
      <div style={{ display:'flex', gap:12 }}>
      {!detail && <button type="button" onClick={openProfile} aria-label={bizName}
        style={{ width:40, height:40, borderRadius: biz.actorType === 'PERSONAL' ? '50%' : 10, flexShrink:0, border:'none', padding:0, cursor:'pointer',
          overflow:'hidden', backgroundColor:INK_TX, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {biz.logo
          ? <img src={biz.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display = 'none'; }} />
          : <span style={{ fontSize:16, fontWeight:800, color:WH }}>{bizName.charAt(0).toUpperCase()}</span>}
      </button>}

      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap: detail ? 10 : 6 }}>
        <div style={{ display:'flex', alignItems:'center', gap: detail ? 10 : 4, fontSize:15, minWidth:0 }}>
          {detail && (
            <button type="button" onClick={openProfile} aria-label={bizName} data-testid="detail-avatar"
              style={{ width:48, height:48, borderRadius: biz.actorType === 'PERSONAL' ? '50%' : 12, flexShrink:0, border:'none', padding:0, cursor:'pointer',
                overflow:'hidden', backgroundColor:INK_TX, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {biz.logo
                ? <img src={biz.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                : <span style={{ fontSize:18, fontWeight:800, color:WH }}>{bizName.charAt(0).toUpperCase()}</span>}
            </button>
          )}
          <span style={{ display:'flex', flexDirection: detail ? 'column' : 'row', alignItems: detail ? 'flex-start' : 'center', gap: detail ? 0 : 4, minWidth:0 }}>
          <span style={{ display:'flex', alignItems:'center', gap:4, minWidth:0 }}>
          <button type="button" onClick={openProfile}
            style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontSize: detail ? 16 : 15, fontWeight:700, color:INK_TX,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'inherit' }}>{bizName}</button>
          {biz.isVerified && <VerifiedTick />}
          {post.writerOfWeek && <WriterBadge />}
          </span>
          <span data-testid="post-byline" style={{ color:MUTED_TX, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize: detail ? 14 : 15, minWidth:0 }}>
            {/* #374 B: name · @handle · time, the Twitter way; the post kind moves to the line below. */}
            {detail ? (handle || '') : `${handle ? ` ${handle}` : ''} · ${ago(post.createdAt)}${post.editedAt ? ' · imehaririwa' : ''}`}
          </span>
          </span>
          {bizId && !followed && !actorUnresolved && currentUser?.id !== bizId && (
            <button type="button" onClick={handleFollow}
              style={{ marginLeft:'auto', flexShrink:0, height:28, padding:'0 12px', borderRadius:14, border:`1px solid ${LINE_BTN}`,
                background:WH, color:INK_TX, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {t('home_feed.follow_button')}
            </button>
          )}
          {isLoggedIn && isRealPost && !isOwnPost && (
            <button type="button" aria-label="Chaguo zaidi" data-testid="post-more" onClick={() => setShowMenu(true)}
              style={{ marginLeft: (bizId && !followed && !actorUnresolved && currentUser?.id !== bizId) ? 4 : 'auto', flexShrink:0, width:28, height:28,
                border:'none', background:'none', color:MUTED_TX, cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={MUTED_TX} aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          )}
        </div>
        {/* #374 B: one quiet line under the name: what kind of post (never "Moment", the default),
            its topic and the place. */}
        {(tag || kindText || (post.topic && !post.community) || biz.businessLocation) && (
          <div data-testid="post-meta" style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:MUTED_TX, minWidth:0, marginTop: detail ? 0 : -2 }}>
            {tag && <span data-testid="post-tag" style={{ flexShrink:0, fontWeight:700, color:'#1a6fb0', background:'#e8f5fd', padding:'1px 6px', borderRadius:4 }}>{tag}</span>}
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
              {[
                kindText && { key:'kind', text:kindText },
                post.topic && !post.community && { key:'topic', text:topicLabel(post.topic) },
                biz.businessLocation && { key:'place', text:biz.businessLocation },
              ].filter(Boolean).map((x, i) => (
                <React.Fragment key={x.key}>{i > 0 && ' · '}<span data-testid={`post-${x.key}`}>{x.text}</span></React.Fragment>
              ))}
            </span>
          </div>
        )}
        {post.community?.id && post.intent !== 'article' && (
          <button type="button" data-testid="post-community" onClick={() => onNavigate(`Community-${post.community.id}`)}
            style={{ alignSelf:'flex-start', border:'none', background:'none', padding:0, cursor:'pointer', fontFamily:'inherit',
              fontSize:13, fontWeight:700, color:INK_TX }}>
            {formatName(post.community.name)}
          </button>
        )}
        {/* Makala (owner approved 2026-11-16): its own card in lists and its own reading layout. */}
        {post.intent === 'article' && (
          <ArticlePost post={post} detail={detail} onOpen={() => onNavigate(`PostDetail-${post.id}`)}
            onCommunity={post.community?.id ? () => onNavigate(`Community-${post.community.id}`) : undefined} />
        )}
        {post.intent !== 'article' && (caption.text || caption.lead) && (detail
          ? <div data-testid="detail-text" style={{ fontSize:17, lineHeight:'24px', color:INK_TX, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>
              {caption.lead && <><strong data-testid="post-lead" style={{ fontWeight:700 }}>{caption.lead}</strong>{caption.text ? leadSeparator(caption.lead) : ''}</>}
              <HashtagText text={caption.text} onTag={openTag} />
            </div>
          : <ExpandableText text={caption.text} lead={caption.lead} lines={image || photos.length > 1 ? 3 : 6} onTag={openTag}
              onMore={onNavigate && /^\d+$/.test(String(post.id ?? '')) ? () => onNavigate(`PostDetail-${post.id}`) : null} />)}

        {post.intent === 'poll' && /^\d+$/.test(String(post.id)) && (
          <PollBlock postId={post.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} />
        )}

        {post.intent !== 'article' && photos.length > 1 && (
          <PostPhotos photos={photos} price={price} priceLabel={priceText} title={post.title || bizName} />
        )}

        {post.intent !== 'article' && image && (
          <button type="button" onClick={goToDetail} aria-label={post.title || bizName}
            style={{ position:'relative', padding:0, border:`1px solid ${LINE_TX}`, borderRadius:16, overflow:'hidden', cursor:'pointer', background:'#f7f9f9',
              aspectRatio: photoAspect(imgRatio || (photos[0]?.width && photos[0]?.height ? photos[0].width / photos[0].height : null)) }}>
            <img src={image} alt="" data-testid="post-photo"
              style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', background:'#f1f5f9' }}
              onLoad={(e) => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h) setImgRatio(w / h); }}
              onError={() => setImgErr(true)} />
            {price > 0 && (
              <span data-testid="photo-price" style={{ position:'absolute', left:10, bottom:10, padding:'4px 10px', borderRadius:14,
                background:'rgba(15,20,25,0.78)', color:WH, fontSize:14, fontWeight:800 }}>{priceText}</span>
            )}
          </button>
        )}

        {(price > 0 || (entityId && (isProduct || isService))) && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'10px 12px',
            border:`1px solid ${LINE_TX}`, borderRadius:12 }}>
            <div style={{ minWidth:0 }}>
              {(productName || rawTitle) && (
                <div style={{ fontSize:15, fontWeight:700, color:INK_TX, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{productName ? formatName(productName) : formatTitle(rawTitle)}</div>
              )}
              {price > 0 && !image && photos.length < 2 && (
                <div style={{ fontSize:15, color: post.isFlashSale ? '#b91c1c' : INK_TX }}>
                  {priceText}{post.isNegotiable && !isProduct ? <span style={{ color:MUTED_TX }}> · {t('home_feed.negotiable_price')}</span> : null}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button type="button" style={pillTx(true)} onClick={() => {
                if (isClassified) { setShowContact(true); return; }
                if (isProduct) Engagement.track(post.id, entityType, entityId, 'purchase', isLoggedIn, onNavigate);
                goToDetail();
              }}>
                {isProduct ? t('home_feed.buy_button') : isService ? t('home_feed.request_service_button') : t('home_feed.contact_button')}
              </button>
            </div>
          </div>
        )}

        {detail && (
          <div data-testid="detail-time" style={{ fontSize:14, color:MUTED_TX, paddingTop:4 }}>
            {fullTime(post.createdAt)}{post.editedAt ? ' · imehaririwa' : ''}
          </div>
        )}
        {detail && detailExtra}
        <div data-testid="post-actions" style={{ display:'flex', alignItems:'center', justifyContent: detail ? 'space-between' : 'flex-start', gap:6, flexWrap:'wrap', color:MUTED_TX, fontSize:13, paddingTop: detail ? 0 : 2,
          ...(detail ? { borderTop:`1px solid ${LINE_TX}`, borderBottom:`1px solid ${LINE_TX}`, padding:'8px 4px' } : {}) }}>
          <button type="button" onClick={openComments} aria-label={t('home_feed.view_all_comments')} style={act()}>
            {icon('M4 5h16v11H8l-4 4z')}{counts.comments > 0 && counts.comments}
          </button>
          {canRepost && (
            <button type="button" onClick={handleRepost} aria-label="Sambaza" aria-pressed={reposted} data-testid="post-repost"
              style={act(reposted, '#00a676', '#e6f7f1')}>
              {icon('M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3')}
              {counts.reposts > 0 && counts.reposts}
            </button>
          )}
          <button type="button" onClick={handleLike} aria-label="Penda" aria-pressed={liked} data-testid="post-like" style={act(liked, '#c4123c', '#fdecef')}>
            {icon('M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 000-7.8z', liked ? '#c4123c' : null)}
            {counts.likes > 0 && counts.likes}
          </button>
          <button type="button" onClick={handleShare} aria-label="Shiriki" data-testid="post-share" style={act()}
>
            {icon('M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13')}{counts.shares > 0 && counts.shares}
          </button>
          <button type="button" onClick={handleSave} aria-label="Hifadhi" aria-pressed={saved} data-testid="post-save" style={act(saved, B, '#e8f0fe')}>
            {icon('M6 3h12v18l-6-4-6 4z', saved ? B : null)}
          </button>
          {mayEdit && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Hariri" data-testid="post-edit" style={act()}>
              {icon('M4 20h4L19 9l-4-4L4 16zM14 6l4 4')}
            </button>
          )}
          {entityId && (
            <button type="button" onClick={goToDetail} aria-label="Fungua" style={act()}>
              {icon('M14 4h6v6M20 4l-9 9M19 14v6H4V5h6')}
            </button>
          )}
        </div>
        {shareMsg && <div style={{ fontSize:13, color:'#166534' }}>{shareMsg}</div>}
        {sheetOpen && (
          <ShareSheet open onClose={() => setSheetOpen(false)} contentType="post" contentId={Number(post.id)}
            words={caption.lead || String(caption.text || '').split('\n')[0] || bizName}
            intent={post.intent} community={post.community?.name ? formatName(post.community.name) : ''}
            replies={counts.comments} plainUrl={postShareUrl(post, entityType, entityId)} onShared={countShare} />
        )}

        {showComments && (
          // A real Moment/post owns its own discussion thread, even when it
          // links to a product, service, or classified. Only virtual listing
          // cards without a persisted post ID use the commerce entity thread.
          isRealPost ? (
            <CommentSection post={post} isLoggedIn={isLoggedIn} detail={detail} communityRole={communityRole}
              onShare={/^\d+$/.test(String(post?.id ?? '')) ? () => setSheetOpen(true) : null}
              onNavigate={onNavigate} currentUser={currentUser}
              activeProfileId={activeProfileId} />
          ) : post.linkedEntityType && post.linkedEntityId ? (
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
            <CommentSection post={post} isLoggedIn={isLoggedIn} detail={detail} communityRole={communityRole}
              onShare={/^\d+$/.test(String(post?.id ?? '')) ? () => setSheetOpen(true) : null}
              onNavigate={onNavigate} currentUser={currentUser}
              activeProfileId={activeProfileId} />
          )
        )}
      </div>
      </div>

      {showContact && (
        <ContactModal post={post} onClose={() => setShowContact(false)}
          onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
      )}
      {showMenu && (
        <PostSafetyMenu postId={post.id} biz={biz} bizName={bizName} onClose={() => setShowMenu(false)} onMuted={() => setMutedNow(true)} />
      )}
      {editing && (
        <CreateMomentModal editPost={post} currentUser={currentUser} onNavigate={onNavigate}
          onClose={() => setEditing(false)}
          onEdited={(updated) => { if (updated && updated.id) setPost((p) => ({ ...p, ...updated })); }} />
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
  bus: 'Basi', courier: 'Courier', van: 'Van', truck: 'Lori', boda: 'Boda', rail: 'Treni', air: 'Ndege', boat: 'Boti',
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
        {TRANSPORT_ICONS[tr.vehicleType] || 'Usafiri'}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        {/* Company name + profile picture */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <div style={{ width:20, height:20, borderRadius:'50%', overflow:'hidden', flexShrink:0,
            backgroundColor:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {biz.logo
              ? <img src={biz.logo} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e => e.target.style.display='none'} />
              : <span style={{ fontSize:12, fontWeight:800, color:B }}>{(biz.name||'?').charAt(0).toUpperCase()}</span>}
          </div>
          <span style={{ fontSize:12, fontWeight:800, color:DK, overflow:'hidden',
            textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {biz.name || t('home_feed.business_fallback')}
          </span>
          {biz.isVerified && <VerifiedTick />}
        </div>

        {/* Route */}
        <div style={{ fontSize:14, fontWeight:800, color:DK, marginBottom:4,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {tr.routeLabel || post.title}
        </div>

        {/* Price + available space + location */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:12, color:GR }}>
          {priceLabel && <span style={{ color:B, fontWeight:800, fontSize:13 }}>{priceLabel}</span>}
          {tr.slotsAvailable != null && (
            <span style={{ fontWeight:700, color: tr.slotsAvailable > 0 ? '#16A34A' : '#DC2626' }}>
              {tr.slotsAvailable > 0
                ? t('home_feed.transport_slots_available', { count: tr.slotsAvailable })
                : t('home_feed.transport_full')}
            </span>
          )}
          {location && <span>{location}</span>}
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
      <div style={{ fontSize:12, fontWeight:800, color:DK,
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {p.title || p.business?.storeName}
      </div>
      <div style={{ fontSize:12, color:GR, marginTop:2, marginBottom:6 }}>{label}</div>
      {bizId && (
        followed ? (
          <span style={{ fontSize:12, color:'#16A34A', fontWeight:700 }}>{t('home_feed.following_badge')}</span>
        ) : (
          <button onClick={handleFollow} disabled={busy}
            style={{ fontSize:12, fontWeight:800, color:WH, backgroundColor:B,
              border:'none', borderRadius:100, padding:'3px 10px',
              cursor: busy ? 'wait' : 'pointer' }}>
            {t('home_feed.follow_button')}
          </button>
        )
      )}
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
                  : null}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:DK,
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
                  : null}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:DK, marginBottom:2,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.routeLabel}
              </div>
              {item.routeType && (
                <div style={{ fontSize:12, color:GR, marginBottom:2 }}>
                  {ROUTE_LABELS[item.routeType] || item.routeType}
                </div>
              )}
              {(item.pricePerKg || item.fixedFee || item.maxWeightKg) && (
                <div style={{ fontSize:12, fontWeight:800, color:B, marginBottom:2 }}>
                  {item.pricePerKg
                    ? t('home_feed.transport_price_per_kg', { amount: fmt(item.pricePerKg) })
                    : item.fixedFee ? `TZS ${fmt(item.fixedFee)}` : ''}
                  {item.maxWeightKg ? ` · ${t('home_feed.rail_transport_weight', { kg: fmt(item.maxWeightKg) })}` : ''}
                </div>
              )}
              {item.location && (
                <div style={{ fontSize:12, color:GR, marginBottom:2,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.location}
                </div>
              )}
              {/* Logistics company name, beneath everything else */}
              <div style={{ fontSize:12, fontWeight:700, color:DK,
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
                  : null}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:DK, marginBottom:2,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.title}
              </div>
              {item.price != null && (
                <div style={{ fontSize:12, fontWeight:800, color:B }}>
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
  // Owner 2026-11-02: the same trending post sat on top of Home every time. Each visit shows
  // a different one of the top three (the server already drops posts this person has seen).
  const [turn] = useState(() => Math.floor(Math.random() * 3));
  if (!trending) return null;
  const items = [
    { icon:'', label:t('home_feed.most_purchased_today'), posts: trending.topPurchased   },
    { icon:'', label:t('home_feed.growing_fast'),      posts: trending.fastestGrowing },
    { icon:'', label:t('home_feed.businesses_trending'),     posts: trending.topBusinesses  },
    { icon:'', label:t('home_feed.services_trending'),       posts: trending.topServices    },
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
        {items.map((item, i) => [item.posts.slice(0, 3)[turn % Math.min(3, item.posts.length)]].map(p => (
          <TrendingCard key={i} icon={item.icon} label={item.label} p={p}
            onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
        )))}
      </div>
    </div>
  );
};

// ── Create a Moment — photo + tag one listing + optional caption ─────────────
// ── View a Moment — full-screen, tap CTA to jump to the tagged listing ───────
const ViewMomentModal = ({ moment, onClose, onNavigate, isLoggedIn, currentUser, activeProfileId, initiallyLiked = false, onLikeToggle }) => {
  const { t } = useTranslation();
  const ago = getAgo(t);
  const [saved, setSaved] = useState(initiallyLiked);
  const biz = moment.business || {};

  // The modal is mounted from the story rail, not the main PostCard, so it
  // must hydrate the persisted engagement state explicitly. Without this,
  // every reopen started at false even though /feed/liked/ids still contained
  // the Moment — the heart appeared to "disappear" after a successful like.
  useEffect(() => { setSaved(initiallyLiked); }, [initiallyLiked, moment.momentId]);
  const bizName = biz.storeName || biz.name || t('home_feed.store_fallback');
  const isLookingFor = moment.postType === 'looking_for';
  const typeLabel = moment.linkedEntityType === 'product' ? t('home_feed.view_product_short')
    : moment.linkedEntityType === 'service' ? t('home_feed.view_service_short')
    : moment.linkedEntityType === 'route' ? t('home_feed.ship_this_route')
    : moment.linkedEntityType === 'business' ? t('home_feed.view_business_short')
    : t('home_feed.view_listing_short');

  const [showReply,   setShowReply]   = useState(false);
  const [myItems,     setMyItems]     = useState([]);
  const [loadingItems,setLoadingItems]= useState(false);
  const [replyItem,   setReplyItem]   = useState(null);
  const [replySending,setReplySending]= useState(false);
  const [replySent,   setReplySent]   = useState(false);

  const handleSave = async () => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    // Phase C: the heart on a Moment is a like, the same as on its feed card.
    const res = await Engagement.track(moment.momentId, 'moment', moment.momentId, 'like', isLoggedIn, onNavigate);
    if (res !== null) {
      const toggled = res.toggled ?? !saved;
      setSaved(toggled);
      onLikeToggle?.(moment.momentId, toggled);
    }
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
    // Self-tagged to the poster's own identity (CreateMomentModal.js's
    // always-available "My Business" option, for profile types with
    // nothing else taggable — e.g. a Super Agent hub) — linkedEntityId IS
    // the CommerceProfile id here, not a classified id, so this must not
    // fall into the classified branch below. Threading it as the explicit
    // commerceProfileId param (not just the page-string slug) is required
    // — CommerceProfile.js only resolves the CORRECT profile (rather than
    // silently defaulting to the poster's Personal one) when this param is
    // present, exactly like every other business-actor click in this file.
    else if (moment.linkedEntityType === 'business') onNavigate(`CommerceProfile-${moment.linkedEntityId}`, { commerceProfileId: moment.linkedEntityId });
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
          backgroundColor:'#0f1419', flexShrink:0, display:'flex', alignItems:'center',
          justifyContent:'center' }}>
          {biz.logo
            ? <img src={biz.logo} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : <span style={{ color:WH, fontSize:14, fontWeight:800 }}>{bizName.charAt(0).toUpperCase()}</span>}
        </div>
        <button onClick={() => { onClose(); biz.id && biz.actorResolved !== false && onNavigate(`CommerceProfile-${biz.id}`, biz.commerceProfileId ? { commerceProfileId: biz.commerceProfileId } : undefined); }}
          style={{ background:'none', border:'none', cursor:'pointer', textAlign:'left', flex:1 }}>
          <div style={{ color:WH, fontSize:13, fontWeight:800 }}>{bizName}</div>
          <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{ago(moment.createdAt)}</div>
        </button>
        {isLookingFor && (
          <span style={{ fontSize:12, fontWeight:800, color:WH, backgroundColor:'#0f1419',
            padding:'4px 10px', borderRadius:100, flexShrink:0, marginRight:6 }}>
            {moment.category || t('home_feed.looking_for_fallback')}
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
              fill={saved ? '#dc2626' : 'none'} stroke={saved ? '#dc2626' : WH} strokeWidth="2">
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
              style={{ flex:1, backgroundColor:'#0f1419', color:WH, border:'none',
                borderRadius:12, padding:'0 20px', cursor:'pointer',
                fontSize:14, fontWeight:800 }}>
              {t('home_feed.i_have_this_button')}
            </button>
          )}
          {isLookingFor && replySent && (
            <div style={{ flex:1, backgroundColor:'rgba(22,163,74,0.2)', color:'#16a34a',
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
              <div style={{ fontSize:15, fontWeight:800, color:DK }}>{t('home_feed.what_do_you_have_title')}</div>
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
                          ? '2px solid #0f1419' : '1px solid #E2E8F0',
                        backgroundColor: replyItem?.type===item.type && replyItem?.id===item.id
                          ? '#f7f9f9' : WH,
                        cursor:'pointer', textAlign:'left' }}>
                      <div style={{ width:32, height:32, borderRadius:8, backgroundColor:'#F1F5F9',
                        flexShrink:0, overflow:'hidden', display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:14 }}>
                        {item.image
                          ? <img src={item.image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                          : ''}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:DK, flex:1,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.title}
                      </div>
                      {replyItem?.type===item.type && replyItem?.id===item.id && (
                        <VerifiedTick />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flexShrink:0, padding:'12px 16px max(12px, env(safe-area-inset-bottom))',
              borderTop:'1px solid #F1F5F9' }}>
              <button onClick={sendOffer} disabled={!replyItem || replySending}
                style={{ width:'100%', backgroundColor: replyItem ? '#0f1419' : '#E2E8F0',
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
            ? '#1d4ed8'
            : '#1d4ed8' }}>
          <div style={{ width:52, height:52, borderRadius:'50%',
            backgroundColor:WH, padding:2, boxSizing:'border-box',
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {biz.logo
              ? <img src={biz.logo} alt={name}
                  style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', borderRadius:'50%',
                  backgroundColor:B, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:18, color:WH, fontWeight:800 }}>
                  {name.charAt(0).toUpperCase()}
                </div>}
          </div>
        </div>
        {isLookingFor && (
          <div style={{ position:'absolute', bottom:-2, right:-2, width:20, height:20,
            borderRadius:'50%', backgroundColor:'#0f1419', border:'2px solid #fff',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>
          </div>
        )}
      </div>
      <span style={{ fontSize:12, color:DK, fontWeight:700, textAlign:'center', lineHeight:'15px',
        width:66, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {name}
      </span>
      {momentRoleLine(moment) && (
        <span data-testid="moment-role" style={{ fontSize:12, color:'#536471', textAlign:'center', lineHeight:'13px',
          width:66, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {momentRoleLine(moment)}
        </span>
      )}
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
      <button onClick={() => seller.actorResolved !== false && onNavigate(`CommerceProfile-${sellerId}`,
        seller.commerceProfileId ? { commerceProfileId: seller.commerceProfileId } : undefined)}
        style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
        <div style={{ padding:2, borderRadius:'50%',
          background: followed
            ? '#E2E8F0'
            : '#1d4ed8' }}>
          <div style={{ width:52, height:52, borderRadius:'50%',
            backgroundColor:WH, padding:2, boxSizing:'border-box',
            overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {seller.logo
              ? <img src={seller.logo} alt={name}
                  style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', borderRadius:'50%',
                  backgroundColor:B, display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:18, color:WH, fontWeight:800 }}>
                  {name.charAt(0).toUpperCase()}
                </div>}
          </div>
        </div>
      </button>
      <span style={{ fontSize:12, color:DK, fontWeight:600, textAlign:'center',
        width:64, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {name.split(' ')[0]}
      </span>
      {followed ? (
        <span style={{ fontSize:12, color:'#16A34A', fontWeight:700 }}>{t('home_feed.following_badge')}</span>
      ) : (
        <button onClick={handleFollow} disabled={busy}
          style={{ fontSize:12, fontWeight:800, color:WH, backgroundColor:B,
            border:'none', borderRadius:100, padding:'2px 10px',
            cursor: busy ? 'wait' : 'pointer' }}>
          {t('home_feed.follow_button')}
        </button>
      )}
    </div>
  );
};

// ── Main HomeFeed ─────────────────────────────────────────────────────────────
const HomeFeed = ({ onNavigate, isLoggedIn, currentUser, onOpenMoment, momentRefreshKey, activeProfileId,
  activeProfile, activeContext, activeBusinessName, myProfiles, onOpenSwitcher }) => {
  const { t } = useTranslation();
  // The identity pill takes the wordmark's place in the top bar when there is a profile to switch to.
  const hasPill = !!(isLoggedIn && activeProfile && onOpenSwitcher && (myProfiles?.length || 0) > 1);
  const FILTERS = getFilters(t);
  const [filter,      setFilter]      = useState('for_you');
  // Social Home (owner approved 2026-11-02): topics. `topic` narrows the feed to one topic.
  const [topics,      setTopics]      = useState([]);
  const [topic,       setTopic]       = useState('');
  const [askTopics,   setAskTopics]   = useState(false);
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [discover,    setDiscover]    = useState(null);
  const [trending,    setTrending]    = useState(null);
  // Feed trays (owner approved 2026-11-16): conversation rows and directories, read once.
  const [trays,       setTrays]       = useState(null);
  const [dirs,        setDirs]        = useState({});
  useEffect(() => {
    let alive = true;
    const list = (r) => (Array.isArray(r?.data?.items) ? r.data.items : Array.isArray(r?.data) ? r.data : []);
    Promise.resolve().then(() => api.get('/feed-trays')).then((r) => { if (alive) setTrays(r?.data || null); }).catch(() => {});
    // Owner 2026-11-16: every tray starts with the newest.
    const dir = (type) => api.get('/profiles/directory/businesses', { params: { type, limit: 12, sort: 'newest' } });
    const newest = (arr) => [...arr].sort((x, y) => (Date.parse(y?.createdAt) || 0) - (Date.parse(x?.createdAt) || 0));
    Promise.allSettled([
      dir('hub'), dir('agent'), dir('service_provider'), api.get('/food/hotels'),
      dir('business'), api.get('/services', { params: { limit: 12 } }), api.get('/classifieds'),
    ]).then(([h, a, sp, ho, biz, sv, cl]) => {
      if (!alive) return;
      const ok = (x) => (x.status === 'fulfilled' ? list(x.value) : []);
      const ads = (x) => (x.status === 'fulfilled' ? (Array.isArray(x.value?.data?.ads) ? x.value.data.ads : list(x.value)) : []);
      setDirs({
        offices: ok(h), agents: ok(a), providers: ok(sp), hotels: ok(ho), businesses: ok(biz),
        services: newest(ads(sv)).slice(0, 12), classifieds: newest(ok(cl)).slice(0, 12),
      });
    });
    return () => { alive = false; };
  }, []);
  const [savedIds,    setSavedIds]    = useState([]);
  const [likedIds,    setLikedIds]    = useState([]);
  const [repostedIds, setRepostedIds] = useState([]);
  const [unread,      setUnread]      = useState(0);
  const [moments,     setMoments]     = useState([]);
  const [viewingMoment,    setViewingMoment]    = useState(null);
  const [trailPool,        setTrailPool]        = useState([]);
  const { addToCart } = useCart() || {};

  // Product trail: every listing (products + active classifieds), no approval step.
  useEffect(() => {
    Promise.allSettled([api.get('/products'), api.get('/classifieds')]).then(([p, c]) => {
      setTrailPool(buildTrailPool(
        p.status === 'fulfilled' ? p.value.data : [],
        c.status === 'fulfilled' ? c.value.data : [],
      ));
    });
  }, []);
  const trailRotation = useMemo(() => {
    let storage = null;
    try { storage = window.localStorage; } catch { /* blocked storage: rotation still works per session */ }
    return createTrailRotation(trailPool, { userKey: currentUser?.id, storage });
  }, [trailPool, currentUser?.id]);

  // Feed trays (owner approved 2026-11-16): which trays have something to show, and where they go.
  const railLists = useMemo(() => ({
    product: trending?.topProducts || [],
    classified: trending?.topClassifieds || [],
    service: trending?.topServices || [],
    store: (trending?.topBusinesses || []).map((b) => b.business).filter(Boolean),
    transport: [...(trending?.topRoutes || [])].sort((x, y) => (Date.parse(y?.createdAt) || 0) - (Date.parse(x?.createdAt) || 0)),
  }), [trending]);
  const profileCards = (list) => (list || []).map((p) => ({
    key: `cp${p.id}`, image: p.photoUrl, name: p.displayName, line: [p.location, p.isVerified ? 'Imethibitishwa' : ''].filter(Boolean).join(' · '),
    ownerId: p.ownerId, commerceProfileId: p.id,
  }));
  const openProfileCard = (it) => onNavigate(`CommerceProfile-${it.ownerId}`, { commerceProfileId: it.commerceProfileId });
  const hotelCards = (dirs.hotels || []).map((h) => ({
    key: `h${h.businessId}`, image: h.photoUrl, name: h.name, line: h.open ? 'Inapokea oda sasa' : 'Imefungwa kwa sasa', page: `HotelMenu-${h.businessId}`,
  }));
  const tzsLine = (n) => (Number(n) > 0 ? `TZS ${Math.round(Number(n)).toLocaleString('en-US')}` : '');
  const serviceCards = (dirs.services || []).map((s) => ({ key: `s${s.id}`, image: s.images?.[0], name: s.title, line: tzsLine(s.price) || 'Bei kwa makubaliano', page: `ServiceDetail-${s.id}` }));
  const classifiedCards = (dirs.classifieds || []).map((c) => ({ key: `c${c.id}`, image: c.images?.[0], name: c.title,
    line: tzsLine(c.isFlashSale && c.flashSalePrice ? c.flashSalePrice : c.price), page: `ClassifiedDetail-${c.id}` }));
  const trayAvailable = useMemo(() => {
    const has = {
      products: trailPool.length > 0,
      communities: true,
      services: !!dirs.services?.length,
      articles: !!trays?.articles?.length,
      classifieds: !!dirs.classifieds?.length,
      questions: !!trays?.questions?.length,
      stores: !!dirs.businesses?.length,
      transport: railLists.transport.length > 0,
      polls: !!trays?.polls?.length,
      offices: !!dirs.offices?.length,
      hotels: !!dirs.hotels?.length,
      agents: !!dirs.agents?.length,
      providers: !!dirs.providers?.length,
      hashtags: !!trays?.hashtags?.length,
    };
    return Object.keys(has).filter((k) => has[k]);
  }, [trailPool, railLists, trays, dirs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Owner 2026-11-16 ("new posts show for a second, then old posts replace them"): the list was
  // read again every time the profile was refreshed (sign-in, coming back to the app), and by then
  // the posts on screen counted as seen. The list now reads again only when the tab, topic or city
  // changes, and an older answer never replaces a newer one.
  const loadSeq = useRef(0);
  // The city only refines the order; when the profile arrives a moment after Home opened, the
  // list is not read again (that second read was what swapped the posts on screen). Nearby,
  // where the city decides what is shown, reads again.
  const cityRef = useRef(currentUser?.city || '');
  cityRef.current = currentUser?.city || '';
  const nearbyCity = filter === 'nearby' ? (currentUser?.city || '') : '';
  const loadPosts = useCallback(async (f, p = 1, append = false) => {
    const seq = ++loadSeq.current;
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ filter: f, page: String(p) });
      if (topic) params.set('topic', topic);
      // Lets the backend's "for_you" blend (city-match component) and the
      // "nearby" filter actually match against the viewer's own location —
      // neither had ever received it before.
      if (cityRef.current) params.set('city', cityRef.current);
      const res = await api.get(`/feed?${params}`);
      if (seq !== loadSeq.current) return; // a newer read has started: this answer is old
      const items = res.data?.items || res.data || [];
      if (append) setPosts(prev => [...prev, ...items]);
      else setPosts(items);
      setHasMore(items.length >= 15);
    } catch {}
    finally { if (seq === loadSeq.current) { setLoading(false); setLoadingMore(false); } }
  }, [topic, nearbyCity]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirectory = DIRECTORY_KINDS.includes(filter);
  const traySlotMap = useMemo(
    () => (TRAY_TABS.includes(filter) && !topic ? traySlots(posts.length, trayAvailable) : {}),
    [filter, topic, posts.length, trayAvailable]);
  /** How many trays of this kind came before post i (each product row shows different items). */
  const trayCount = (i, key) => Object.keys(traySlotMap).filter((k) => Number(k) < i && traySlotMap[k] === key).length;
  useEffect(() => {
    setPage(1);
    // A catalogue tab reads its own list (KentexaDirectory), not the feed.
    if (DIRECTORY_KINDS.includes(filter)) return;
    loadPosts(filter, 1, false);
  }, [filter, loadPosts]);

  useEffect(() => {
    let alive = true;
    api.get('/feed/topics').then((r) => {
      if (!alive) return;
      const list = Array.isArray(r.data) ? r.data : [];
      setTopics(list);
      // First visit: someone logged in who follows no topic is asked once on this device.
      let asked = false;
      try { asked = localStorage.getItem('kentexa_topics_asked') === '1'; } catch { /* storage blocked */ }
      if (isLoggedIn && list.length && !list.some((t) => t.following) && !asked) setAskTopics(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [isLoggedIn]);
  const closeTopicPicker = (updated) => {
    try { localStorage.setItem('kentexa_topics_asked', '1'); } catch { /* storage blocked */ }
    if (Array.isArray(updated)) setTopics(updated);
    setAskTopics(false);
    if (updated) loadPosts(filter, 1, false);
  };
  const followedTopics = topics.filter((t) => t.following);
  const topicChips = [...followedTopics, ...topics.filter((t) => !t.following)];

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
      isLoggedIn ? api.get('/feed/liked/ids')             : Promise.resolve({ data:[] }),
      isLoggedIn ? api.get('/feed/reposted/ids')          : Promise.resolve({ data:[] }),
    ]).then(([d, t, n, s, l, r]) => {
      if (d.status==='fulfilled') setDiscover(d.value.data);
      if (t.status==='fulfilled') setTrending(t.value.data);
      if (n.status==='fulfilled') setUnread(n.value.data?.count || n.value.data || 0);
      if (s.status==='fulfilled') setSavedIds(s.value.data || []);
      if (l.status==='fulfilled') setLikedIds(Array.isArray(l.value.data) ? l.value.data : []);
      if (r.status==='fulfilled') setRepostedIds(Array.isArray(r.value.data) ? r.value.data : []);
    });
    loadMoments();
  }, [isLoggedIn, loadMoments]);

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
      fontFamily:'inherit' }}>
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
          padding:'0 8px 0 10px', height:44, boxSizing:'border-box' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {/* Kazi (owner 2026-11-01): Profile left the bottom bar; it opens from your photo here. */}
          {isLoggedIn && (
            <button type="button" aria-label="Wasifu wangu" data-testid="home-profile" onClick={() => onNavigate('MyProfile')}
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
                background:'none', border:'none', cursor:'pointer', padding:0 }}>
              {(currentUser?.avatarUrl || currentUser?.logo)
                ? <img src={currentUser.avatarUrl || currentUser.logo} alt=""
                    style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} />
                : <span style={{ width:28, height:28, borderRadius:'50%', backgroundColor:'#cfd9de',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:DK }}>
                    {(currentUser?.name || 'U').charAt(0).toUpperCase()}
                  </span>}
            </button>
          )}
          {/* #374 C: who you are acting as, next to your photo (it no longer floats over the page). */}
          <IdentityPill activeProfile={activeProfile} activeContext={activeContext} activeBusinessName={activeBusinessName}
            myProfiles={myProfiles} onOpenSwitcher={onOpenSwitcher} isLoggedIn={isLoggedIn} />
          <button onClick={() => onNavigate('Home')} aria-label="KenteXa"
            style={{ display:'flex', alignItems:'center', gap:8, background:'none',
              border:'none', cursor:'pointer', padding:0 }}>
            <div style={{ width:24, height:24, backgroundColor:'#1d4ed8', borderRadius:7,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 2px 8px rgba(29,78,216,0.4)', flexShrink:0 }}>
              <svg width="15" height="15" viewBox="0 0 22 22" fill="none">
                <path d="M2 2 L7 8 L11 5 L11 20 L5 14 Z" fill="white"/>
                <path d="M20 2 L15 8 L11 5 L11 20 L17 14 Z" fill="#bfdbfe"/>
                <circle cx="7.5" cy="9.5" r="1" fill="#0f172a"/>
                <circle cx="14.5" cy="9.5" r="1" fill="#0f172a"/>
              </svg>
            </div>
            <div style={{ display: hasPill ? 'none' : 'flex', alignItems:'baseline', gap:0, lineHeight:1 }}>
              <span style={{ fontSize:17, fontWeight:800, color:DK,
                letterSpacing:-0.5, fontFamily:'Manrope,sans-serif' }}>Kente</span>
              <span style={{ fontSize:17, fontWeight:800, color:'#1d4ed8',
                letterSpacing:-0.5, fontFamily:'Manrope,sans-serif' }}>Xa</span>
            </div>
          </button>
          </div>
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
                  borderRadius:'50%', backgroundColor:'#dc2626', display:'flex',
                  alignItems:'center', justifyContent:'center',
                  fontSize:12, color:WH, fontWeight:800 }}>
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
        <div data-tour="hf-ai-search" style={{ padding:'2px 10px 6px' }}>
          <AiSearchBar onNavigate={onNavigate} compact />
        </div>

        {/* Feed filters */}
        <div data-tour="hf-filters" style={{ display:'flex', overflowX:'auto', scrollbarWidth:'none',
          padding:'0 8px', borderTop:'1px solid #F8FAFC' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ position:'relative', height:38, padding:'0 12px', border:'none', background:'none',
                cursor:'pointer', fontSize:14, fontWeight: filter===f.key ? 700 : 500, whiteSpace:'nowrap', fontFamily:'inherit',
                flexShrink:0, color: filter===f.key ? INK_TX : MUTED_TX }}>
              {f.label}
              <span aria-hidden="true" style={{ position:'absolute', left:12, right:12, bottom:0, height:3, borderRadius:2,
                background: filter===f.key ? B : 'transparent' }} />
            </button>
          ))}
          <span style={{ display:'flex', alignItems:'center', padding:'0 6px', flexShrink:0 }}>
            <TourTrigger tourKey="buyer_home_orientation" style={{ padding:'4px 10px' }} />
          </span>
        </div>

        {/* Social Home: topic chips (followed topics first). */}
        {topicChips.length > 0 && !isDirectory && (
          <div data-testid="topic-chips" style={{ display:'flex', gap:6, overflowX:'auto', scrollbarWidth:'none', padding:'6px 10px 8px' }}>
            {[{ key: '', label: 'Zote' }, ...topicChips].map((c) => {
              const on = topic === c.key;
              return (
                <button key={c.key || 'all'} type="button" aria-pressed={on} data-testid={`chip-${c.key || 'all'}`}
                  onClick={() => setTopic(c.key)}
                  style={{ flexShrink:0, height:30, padding:'0 12px', borderRadius:15, cursor:'pointer', fontFamily:'inherit',
                    fontSize:13, fontWeight:700, whiteSpace:'nowrap',
                    border:`1px solid ${on ? INK_TX : LINE_BTN}`, background: on ? INK_TX : WH, color: on ? WH : INK_TX }}>
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {askTopics && (
        <TopicPicker topics={topics} initial={[]} onDone={closeTopicPicker} onLater={() => closeTopicPicker(null)} />
      )}


      {/* Kazi (owner 2026-11-01): the office's parcels to send moved to Kazi, "Kinachohitaji wewe". */}

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
                    ? '#1d4ed8'
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
                          {isLoggedIn ? (currentUser?.name||'').charAt(0).toUpperCase()||'K' : 'K'}
                        </span>}
                  </div>
                </div>
                <span style={{ fontSize:12, color:DK, fontWeight:600 }}>
                  {isLoggedIn ? t('home_feed.you_label') : t('home_feed.join_label')}
                </span>
              </button>
              {isLoggedIn && (
                <button onClick={() => onOpenMoment?.()}
                  style={{ position:'absolute', bottom:14, right:4, width:18, height:18,
                    borderRadius:'50%', backgroundColor:B, border:'2px solid #fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, color:WH, fontWeight:800, cursor:'pointer', padding:0 }}>
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
          initiallyLiked={likedIds.includes(viewingMoment.momentId)}
          onLikeToggle={(id, liked) => setLikedIds(prev => liked
            ? (prev.includes(id) ? prev : [...prev, id])
            : prev.filter(x => x !== id))}
        />
      )}

      {/* ── Trending bar ── */}
      {/* Social Home part 3: the Jumuiya tab opens with the person's communities and ones to join. */}
      {filter === 'communities' && (
        <CommunitiesPanel isLoggedIn={isLoggedIn} onNavigate={onNavigate} topic={topic} />
      )}

      {/* Mwandishi wa Wiki (owner approved 2026-11-16): the gold card at the top of For You, for everyone. */}
      {filter === 'for_you' && !topic && <WriterOfWeek onNavigate={onNavigate} isLoggedIn={isLoggedIn} currentUser={currentUser} />}
      {/* Social Home part 2: "Leo kwako" opens For You (only real activity; empty = nothing). */}
      {isLoggedIn && filter === 'for_you' && !topic && (
        <>
          {/* The welcome keeps asking (owner 2026-11-02): photo, then the first post. */}
          <NewcomerNudge currentUser={currentUser} activeProfileId={activeProfileId} onNavigate={onNavigate} onOpenMoment={onOpenMoment} refreshKey={momentRefreshKey} />
          <LeoKwako onNavigate={onNavigate} refreshKey={momentRefreshKey} />
          {/* Chose "Uza tena" at the welcome, no offer yet (owner 2026-11-10). */}
          <ResaleStartCard currentUser={currentUser} onNavigate={onNavigate} />
        </>
      )}

      {/* Social Home (owner 2026-11-02): the "most purchased" strip no longer opens Home. */}
      {filter === 'trending' && (
        <TrendingBar trending={trending} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />
      )}

      {/* ── Not logged in hero ── */}
      {!isLoggedIn && filter === 'for_you' && (
        <div style={{ margin:'8px 12px', borderRadius:20,
          background:'#0f1419',
          padding:'22px 20px', color:WH }}>
          <div style={{ fontSize:18, fontWeight:800, lineHeight:1.3, marginBottom:8 }}>
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
                fontSize:13, fontWeight:800 }}>{t('home_feed.join_free_button')}</button>
            <button onClick={() => onNavigate('PublicLogin')}
              style={{ flex:1, backgroundColor:'rgba(255,255,255,0.15)',
                color:WH, border:'1.5px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'11px 0', cursor:'pointer',
                fontSize:13, fontWeight:700 }}>{t('home_feed.sign_in_button')}</button>
          </div>
        </div>
      )}

      {/* ── Feed posts ── */}
      {isDirectory ? (
        <KentexaDirectory kind={filter} onNavigate={onNavigate} />
      ) : loading ? (
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
        <>
        <WhoToFollow isLoggedIn={isLoggedIn} onNavigate={onNavigate} city={currentUser?.city || currentUser?.businessLocation} limit={5} />
        <div style={{ textAlign:'center', padding:'60px 24px' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>
            {''}
          </div>
          <div data-testid="feed-empty" style={{ fontSize:15, fontWeight:800, color:DK, marginBottom:8 }}>
            {topic
              ? t('home_feed.empty_topic', { topic: topicLabel(topic, topics) })
              : filter==='following'
              ? t('home_feed.empty_following')
              : filter==='transport'
              ? t('home_feed.empty_transport')
              : filter==='services'
              ? t('home_feed.empty_services')
              : t('home_feed.empty_default')}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16 }}>
            {topic && (
              <button type="button" data-testid="feed-all-topics" onClick={() => setTopic('')}
                style={{ backgroundColor:DK, color:WH, border:'none', borderRadius:12,
                  padding:'11px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {t('home_feed.all_topics_button')}
              </button>
            )}
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
        </>
      ) : (
        <>
          {posts.map((post, i) => {
            // Feed trays (owner approved 2026-11-16): one tray after every 2 posts, in the approved
            // order, skipping trays with nothing to show. See utils/feedTrays.js.
            const trayKey = traySlotMap[i] || null;
            const railType = trayKey === 'transport' ? 'transport' : null;
            const railItems = railType ? railLists[railType] : null;
            const trail = trayKey === 'products' ? trailRotation.trailAt(trayCount(i, 'products')) : null;

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
                    )}
                    likedIds={likedIds}
                    onLikeToggle={(id, liked) => setLikedIds(prev =>
                      liked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)
                    )}
                    repostedIds={repostedIds}
                    onRepostToggle={(id, on) => setRepostedIds(prev =>
                      on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)
                    )} />
                )}
                {trail && (
                  <ProductTrail trail={trail} onNavigate={onNavigate}
                    onAddToCart={addToCart} onSeen={trailRotation.markSeen} />
                )}
                {railType && (
                  <DiscoveryRail type={railType} items={railItems} onNavigate={onNavigate} />
                )}
                {trayKey === 'communities' && (
                  <SuggestedCommunities isLoggedIn={isLoggedIn} onNavigate={onNavigate} topic={topic} onSeeAll={() => setFilter('communities')} />
                )}
                {trayKey === 'services' && (
                  <ListTray testid="tray-services" title="Huduma mpya" sub="Zilizowekwa karibuni" items={serviceCards} onOpen={(it) => onNavigate(it.page)} onSeeAll={() => setFilter('services')} />
                )}
                {trayKey === 'classifieds' && (
                  <ListTray testid="tray-classifieds" title="Matangazo mapya" sub="Yaliyowekwa karibuni" items={classifiedCards} onOpen={(it) => onNavigate(it.page)} onSeeAll={() => setFilter('classifieds')} />
                )}
                {trayKey === 'stores' && (
                  <ListTray testid="tray-stores" title="Biashara mpya za kufuata" sub="Zilizojiunga karibuni" round items={profileCards(dirs.businesses)} onOpen={openProfileCard} onSeeAll={() => setFilter('businesses')} />
                )}
                {trayKey === 'articles' && <ArticleTray items={trays?.articles} onNavigate={onNavigate} />}
                {trayKey === 'questions' && <QuestionTray items={trays?.questions} onNavigate={onNavigate} />}
                {trayKey === 'polls' && <PollTray items={trays?.polls} onNavigate={onNavigate} />}
                {trayKey === 'hashtags' && <HashtagTray items={trays?.hashtags} onNavigate={onNavigate} />}
                {trayKey === 'offices' && (
                  <ListTray testid="tray-offices" title="Ofisi za KenteXa" sub="Tuma na pokea mizigo karibu nawe" round items={profileCards(dirs.offices)} onOpen={openProfileCard} />
                )}
                {trayKey === 'agents' && (
                  <ListTray testid="tray-agents" title="Mawakala" sub="Wanaokuchukulia na kukuletea mizigo" round items={profileCards(dirs.agents)} onOpen={openProfileCard} />
                )}
                {trayKey === 'providers' && (
                  <ListTray testid="tray-providers" title="Watoa huduma" sub="Mafundi na wataalamu kwenye KenteXa" round items={profileCards(dirs.providers)} onOpen={openProfileCard} />
                )}
                {trayKey === 'hotels' && (
                  <ListTray testid="tray-hotels" title="Hoteli na chakula" sub="Agiza kutoka kwenye menyu" items={hotelCards} onOpen={(it) => onNavigate(it.page)} onSeeAll={() => setFilter('hotels')} />
                )}
                {i === 0 && (filter === 'for_you' || filter === 'following') && (
                  <WhoToFollow isLoggedIn={isLoggedIn} onNavigate={onNavigate} city={currentUser?.city || currentUser?.businessLocation} />
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
            <div style={{ fontSize:12, color:GR, marginTop:2 }}>{t('home_feed.share_prompt_desc')}</div>
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