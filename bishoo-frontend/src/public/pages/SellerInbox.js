/**
 * SellerInbox.js — Ujumbe: one inbox, WhatsApp style (owner 2026-10-26).
 *
 * The list holds the business conversations of the active role (seller, service
 * provider, office/transport/agent) AND the chats this person started with shops
 * ("Nimewaandikia"), in every role. A chat shows date separators, read ticks,
 * product/order/invoice cards; a seller's tools (product, invoice, parcel, internal
 * note, status) live behind one + button. No emoji anywhere.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LocationPicker from '../components/LocationPicker';
import { Spinner } from '../components/Loading';
import api from '../../api/api';
import { useSocket } from '../../context/SocketProvider';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const TICK = '#1d9bf0';
const CHAT_BG = '#f3efe9';
const MINE_BG = '#dbeafe';

const DAY_SW = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysAgo = (date) => Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (date) => { const d = new Date(date); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** List time, WhatsApp style: today 14:05 · Jana · weekday · 24/10/26. */
export const listTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const n = daysAgo(d);
  if (n <= 0) return hhmm(d);
  if (n === 1) return 'Jana';
  if (n < 7) return DAY_SW[d.getDay()];
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
/** Separator inside a chat: Leo · Jana · weekday · 24 Okt 2026. */
const MONTH_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
export const dayLabel = (value) => {
  const d = new Date(value);
  const n = daysAgo(d);
  if (n <= 0) return 'Leo';
  if (n === 1) return 'Jana';
  if (n < 7) return DAY_SW[d.getDay()];
  return `${d.getDate()} ${MONTH_SW[d.getMonth()]} ${d.getFullYear()}`;
};

// "Mine" = my own outgoing messages: flips with the side of the chat I am on.
const isMineMsg = (msg, mode) => (mode === 'buyer'
  ? msg.senderType === 'customer'
  : (msg.senderType === 'seller' || msg.senderType === 'employee'));

const Icon = ({ d, size = 20, color = MUTED, sw = 2, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const IC = {
  back: 'M15 6l-6 6 6 6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z',
  bag: 'M6 7h12l1 13H5zM9 7a3 3 0 016 0',
  invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  truck: 'M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  note: 'M5 4h14v12l-4 4H5zM15 16v4M9 9h6M9 13h3',
  check: 'M5 12.5l4.5 4.5L19 7',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  mute: 'M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  chat: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z',
};
const Ticks = ({ read }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={read ? TICK : MUTED} strokeWidth="2.2" strokeLinecap="round"
    role="img" aria-label={read ? 'Imesomwa' : 'Imetumwa'} style={{ flexShrink: 0 }}>
    <path d={read ? 'M2 12.5l4 4L14 8M10 16.5l1 1L22 8' : 'M5 12.5l4.5 4.5L19 7'} />
  </svg>
);
const TINTS = ['#0f766e', '#9a3412', '#7c3aed', '#334155', '#1d4ed8', '#b45309', '#0e7490', '#be123c'];
const Avatar = ({ photo, name, size = 52 }) => {
  const tint = TINTS[(name || '?').charCodeAt(0) % TINTS.length];
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, overflow: 'hidden', backgroundColor: tint, color: '#fff',
      fontSize: size * 0.38, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
};

/** Who is on the other side of this chat, from my side of it. */
const otherParty = (convo, t) => {
  const iAmBuyer = convo._mode === 'buyer';
  const name = iAmBuyer
    ? (convo.commerceProfile?.displayName || convo.seller?.storeName || convo.seller?.name || t('seller_inbox.seller_fallback'))
    : (convo.customer?.name || t('seller_inbox.customer_fallback'));
  return { name, photo: iAmBuyer ? convo.commerceProfile?.photoUrl : null };
};

const ConversationRow = ({ convo, onClick, t, menuOpen, onOpenMenu, onCloseMenu, onPin, onMute, onArchive }) => {
  const { name, photo } = otherParty(convo, t);
  const iAmBuyer = convo._mode === 'buyer';
  const unread = (iAmBuyer ? convo.buyerUnreadCount : convo.unreadCount) || 0;
  const pinned = iAmBuyer ? convo.buyerPinned : convo.sellerPinned;
  const muted = iAmBuyer ? convo.buyerMuted : convo.sellerMuted;
  return (
    <div data-testid={`convo-${convo._mode}-${convo.id}`} style={{ position: 'relative' }}>
      <button type="button" onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); onOpenMenu(); }}
        style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', border: 'none',
          background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK }}>
        <Avatar photo={photo} name={name} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, borderBottom: `1px solid ${LINE}`, paddingBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: unread ? 700 : 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontSize: 12, color: unread ? BLUE : MUTED, fontWeight: unread ? 700 : 400, flexShrink: 0 }}>{listTime(convo.lastMessageAt)}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, color: MUTED, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {convo.lastMessagePreview || '...'}
            </span>
            {muted && <Icon d={IC.mute} size={15} />}
            {pinned && <Icon d={IC.pin} size={15} />}
            {unread > 0 && (
              <span data-testid="unread-badge" style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 10, backgroundColor: BLUE,
                color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>
            )}
          </span>
          {convo.linkedContextTitle && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, minWidth: 0 }}>
              {convo.linkedContextImage
                ? <img src={convo.linkedContextImage} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                : <Icon d={IC.bag} size={14} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convo.linkedContextTitle}</span>
            </span>
          )}
        </span>
      </button>
      <button type="button" aria-label="Chaguo" onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu(); }}
        style={{ position: 'absolute', right: 6, top: 8, width: 32, height: 32, borderRadius: 16, border: 'none', background: 'none', cursor: 'pointer', opacity: 0.6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={MUTED} aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {menuOpen && (
        <div role="menu" onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 40, right: 12, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 10, minWidth: 180, overflow: 'hidden' }}>
          {[
            { label: pinned ? t('seller_inbox.unpin_action') : t('seller_inbox.pin_action'), onClick: onPin },
            { label: muted ? t('seller_inbox.unmute_action') : t('seller_inbox.mute_action'), onClick: onMute },
            { label: t('seller_inbox.archive_action'), onClick: onArchive },
          ].map(item => (
            <button type="button" role="menuitem" key={item.label} onClick={item.onClick}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', fontSize: 15, color: INK, border: 'none',
                background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const cardBox = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' };

const MessageBubble = ({ msg, mode, t, onRetry, onNavigate }) => {
  const isMine = isMineMsg(msg, mode);
  const isSystem = msg.senderType === 'system';
  const isNote = msg.isNote;

  if (isSystem && msg.type !== 'invoice' && msg.type !== 'order') return (
    <div style={{ textAlign: 'center', margin: '6px 0' }}>
      <span style={{ fontSize: 12, backgroundColor: '#fff', color: MUTED, padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>{msg.content}</span>
    </div>
  );

  // Product/listing card: opens the right detail page (itemType missing = an older Product card).
  if (msg.type === 'product' && msg.metadata) {
    const goToItem = () => {
      if (!msg.metadata.productId) return;
      onNavigate?.(msg.metadata.itemType === 'classified' ? `ClassifiedDetail-${msg.metadata.productId}` : `ProductDetail-${msg.metadata.productId}`);
    };
    return (
      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
        <button type="button" onClick={goToItem} style={{ ...cardBox, width: 240, padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
          {msg.metadata.productImage && <img src={msg.metadata.productImage} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{msg.metadata.productName}</span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>TZS {Number(msg.metadata.productPrice || 0).toLocaleString('en-US')}</span>
            <span style={{ fontSize: 13, color: BLUE, fontWeight: 600 }}>Tazama bidhaa</span>
          </span>
        </button>
      </div>
    );
  }

  // Order card: each side has its own order page with a deep link by id.
  if (msg.type === 'order' && msg.metadata) {
    const goToOrder = () => msg.metadata.orderId && onNavigate?.(mode === 'buyer' ? `MyOrders-${msg.metadata.orderId}` : `SellerOrders-${msg.metadata.orderId}`);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
        <button type="button" onClick={goToOrder} style={{ ...cardBox, width: 260, padding: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK,
          display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#166534' }}><Icon d={IC.box} size={16} color="#166534" />{t('seller_inbox.order_card_label')}</span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>#{msg.metadata.orderId}</span>
          {msg.metadata.trackingNumber && <span style={{ fontSize: 13, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{msg.metadata.trackingNumber}</span>}
        </button>
      </div>
    );
  }

  // Invoice card: awaiting payment or paid, same card either way.
  if (msg.type === 'invoice' && msg.metadata) {
    const paid = !!msg.metadata.invoicePaid;
    const goToInvoice = () => {
      if (msg.metadata.orderId) onNavigate?.(mode === 'buyer' ? `MyOrders-${msg.metadata.orderId}` : `SellerOrders-${msg.metadata.orderId}`);
      else onNavigate?.(mode === 'buyer' ? 'MyOrders' : 'SellerInvoices');
    };
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
        <div data-testid="invoice-card" style={{ ...cardBox, width: 260, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, borderColor: paid ? '#bbf7d0' : '#fde68a' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: paid ? '#166534' : '#92400e' }}>
            <Icon d={IC.invoice} size={16} color={paid ? '#166534' : '#92400e'} />{t('seller_inbox.invoice_card_label')} {msg.metadata.invoiceNumber}
          </span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>TZS {Number(msg.metadata.invoiceAmount || 0).toLocaleString('en-US')}</span>
          <span style={{ fontSize: 13, color: paid ? '#166534' : MUTED }}>{paid ? t('seller_inbox.invoice_paid_label') : t('seller_inbox.invoice_pending_label')}</span>
          <button type="button" onClick={!paid && mode === 'buyer' ? () => onNavigate?.(msg.metadata.orderId ? `MyOrders-${msg.metadata.orderId}` : 'MyOrders') : goToInvoice}
            style={{ marginTop: 6, height: 40, borderRadius: 20, border: 'none', backgroundColor: INK, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {!paid && mode === 'buyer' ? t('seller_inbox.invoice_pay_now') : 'Fungua ankara'}
          </button>
        </div>
      </div>
    );
  }

  const isSending = msg._status === 'sending';
  const isFailed = msg._status === 'failed';
  const bg = isNote ? '#fef3c7' : isMine ? MINE_BG : '#fff';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', margin: '2px 0' }}>
      <div data-testid="bubble" style={{ maxWidth: '78%', backgroundColor: bg, color: INK,
        padding: msg.imageUrl && !msg.content ? 4 : '7px 10px 5px', borderRadius: 12,
        borderBottomRightRadius: isMine ? 4 : 12, borderBottomLeftRadius: isMine ? 12 : 4,
        fontSize: 15, lineHeight: 1.4, boxShadow: '0 1px 0.5px rgba(11,20,26,0.13)', opacity: isSending ? 0.7 : 1, overflowWrap: 'anywhere' }}>
        {isNote && <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 2 }}>{t('seller_inbox.internal_note_label')}</div>}
        {msg.imageUrl && <img src={msg.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 10, display: 'block', marginBottom: msg.content ? 4 : 0 }} />}
        {msg.content && <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
        <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, fontSize: 11, color: MUTED, marginTop: 2,
          ...(msg.imageUrl && !msg.content ? { padding: '0 4px 2px' } : {}) }}>
          {msg.createdAt ? hhmm(msg.createdAt) : ''}
          {isMine && !isNote && (isSending ? <Spinner size={12} color={MUTED} /> : !isFailed && <Ticks read={!!(msg.isRead || msg.readAt)} />)}
        </span>
      </div>
      {isFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 12 }}>
          <span style={{ color: '#b91c1c' }}>{t('seller_inbox.status_failed')}</span>
          <button type="button" onClick={() => onRetry?.(msg)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLUE, fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
            {t('seller_inbox.retry_button')}
          </button>
        </div>
      )}
    </div>
  );
};

// The active RoleContext decides which BUSINESS inbox shows: seller/admin/manager
// and service providers get the business inbox (/business/inbox), offices,
// transporters and agents the operational inbox. Every role also gets the chats this
// person started with shops (/business/my-conversations) - owner 2026-10-26.
const resolveInboxMode = (userRole) => {
  if (userRole === 'seller' || userRole === 'admin' || userRole === 'manager' || userRole === 'service_provider') return 'seller';
  if (userRole === 'agent' || userRole === 'super_agent' || userRole === 'transport_provider') return 'operational';
  return 'buyer';
};

// The three backend route families; `_mode` on each conversation picks one.
const API_BASE_FOR_MODE = {
  seller: '/business/inbox',
  buyer: '/business/my-conversations',
  operational: '/business/operational-inbox',
};

const CHIPS = [
  { key: 'all', label: 'Zote' },
  { key: 'unread', label: 'Hazijasomwa' },
  { key: 'customers', label: 'Wateja', business: true },
  { key: 'started', label: 'Nimewaandikia', business: true },
  { key: 'assigned', label: 'Nilizopewa', seller: true },
  { key: 'archived', label: 'Zilizohifadhiwa', seller: true },
];

const SellerInbox = ({ onNavigate, initialCustomerId, sellerId, messageTargetType, messageTargetId, userRole, messageCommerceProfileId, messageContextType, messageContextId, currentUser, activeProfileId, contextEpoch }) => {
  const { t } = useTranslation();
  // Deep links carry their own implied mode regardless of the bare-inbox
  // default for the active role — "message this specific seller" is always
  // a buyer action, "open this specific CRM customer thread" is always a
  // seller action. Both remain fail-closed server-side (wrong active role
  // still 403s there); this only decides which endpoint family and which UI
  // this component renders while the deep link resolves. Communication
  // canonicality fix: messageTargetType/messageTargetId (from
  // MessageOperational-{type}-{commerceProfileId}) is the same kind of
  // deep link as sellerId (MessageSeller-{userId}), just targeting a
  // specific operational identity instead of always the Seller one.
  const inboxMode = (sellerId || messageTargetType) ? 'buyer' : initialCustomerId ? 'seller' : resolveInboxMode(userRole);
  const [conversations, setConversations]   = useState([]);
  const [active,        setActive]          = useState(null);
  const [messages,      setMessages]        = useState([]);
  const [loading,       setLoading]         = useState(true);
  const [msgLoading,    setMsgLoading]      = useState(false);
  const [text,          setText]            = useState('');
  const [isNote,        setIsNote]          = useState(false);
  const [sending,       setSending]         = useState(false);
  const [products,      setProducts]        = useState([]);
  const [showProducts,  setShowProducts]    = useState(false);
  const [showOrderForm, setShowOrderForm]   = useState(false);
  const [orderForm,     setOrderForm]       = useState({ recipientName: '', productName: '', qty: 1, price: '', phone: '', address: '', classifiedId: null });
  // Structured delivery location — was missing entirely, address was
  // free text only. Same fields SellerInvoices.js/ClassifiedDetail.js now use.
  const [orderLocation, setOrderLocation]   = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [creatingOrder, setCreatingOrder]   = useState(false);
  // List chips (owner 2026-10-26, WhatsApp style): all | unread | customers | started | archived | assigned
  const [chip,          setChip]            = useState('all');
  const [showTools,     setShowTools]       = useState(false);
  const [error,         setError]           = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [search,        setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [menuForId,     setMenuForId]       = useState(null); // which conversation's menu is open ('<mode>-<id>')
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Deep-linked straight into a chat with one specific target -- either a
  // Seller (MessageSeller-{userId}) or a specific operational identity
  // (MessageOperational-{type}-{commerceProfileId}).
  const buyerDeepLink = !!sellerId || !!messageTargetType;

  // Debounced — a search endpoint that hits the DB per keystroke doesn't
  // scale, and it doesn't need to: conversation lists are small, a 300ms
  // pause after the user stops typing is imperceptible.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      setError('');


      // ── Deep-linked: open/start a single conversation as the buyer ──────
      if (buyerDeepLink) {
        try {
          const r = await api.post('/business/my-conversations/start', {
            ...(messageTargetType
              ? { targetType: messageTargetType, targetId: Number(messageTargetId) }
              : { sellerId: Number(sellerId), commerceProfileId: messageCommerceProfileId ? Number(messageCommerceProfileId) : undefined }),
            contextType: messageContextType || undefined,
            contextId: messageContextId ? Number(messageContextId) : undefined,
          });
          const convo = { ...r.data, _mode: 'buyer' };
          setConversations([convo]);
          openConversation(convo);
        } catch (err) {
          setError(err?.response?.data?.message || t('seller_inbox.start_failed'));
        }
        return;
      }

      // ── Existing seller-side deep link (from SellerCustomers) ───────────
      if (initialCustomerId) {
        const res = await api.get('/business/inbox?limit=30');
        const list = (res.data.conversations || []).map(c => ({ ...c, _mode: 'seller' }));
        setConversations(list);
        const match = list.find(c => c.customerId === Number(initialCustomerId));
        if (match) {
          openConversation(match);
        } else {
          try {
            const r = await api.post('/business/inbox/start', {
              customerId: Number(initialCustomerId),
            });
            const convo = { ...r.data, _mode: 'seller' };
            setActive(convo);
            setConversations(prev => [convo, ...prev]);
            fetchMessages(convo);
          } catch (err) {
            setError(t('seller_inbox.start_customer_failed'));
          }
        }
        return;
      }

      // ── Bare inbox — exactly one side, whichever the active RoleContext
      // authorizes right now. Previously this fired BOTH /business/inbox
      // and /business/my-conversations via Promise.allSettled and merged
      // whatever survived — meaning a Buyer-active account silently ate a
      // 403 from the seller-scoped call every time, an Agent/SuperAgent/
      // TransportProvider got a merge of two 403s (an empty inbox with no
      // explanation), and a Seller-active account with old buyer threads
      // could still see them mixed into their business inbox. Only one
      // request now fires, for only the mode this role is actually
      // authorized for.
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
      // Owner 2026-10-26: the chats you STARTED with shops (my-conversations) are
      // yours in every role, shown beside your business inbox ("Nimewaandikia").
      const mine = api.get(`/business/my-conversations?limit=30${searchParam}`)
        .then(r => (r.data.conversations || []).map(c => ({ ...c, _mode: 'buyer' })));
      const business = inboxMode === 'seller'
        ? api.get(`/business/inbox?limit=30${searchParam}`).then(r => (r.data.conversations || []).map(c => ({ ...c, _mode: 'seller' })))
        : inboxMode === 'operational'
          ? api.get(`/business/operational-inbox?limit=30${searchParam}`).then(r => (r.data.conversations || []).map(c => ({ ...c, _mode: 'operational' })))
          : Promise.resolve([]);
      const [biz, own] = await Promise.allSettled([business, mine]);
      setConversations([
        ...(biz.status === 'fulfilled' ? biz.value : []),
        ...(own.status === 'fulfilled' ? own.value : []),
      ]);
    } catch {} finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxMode, initialCustomerId, sellerId, messageTargetType, messageTargetId, messageCommerceProfileId, messageContextType, messageContextId, debouncedSearch]);

  const fetchMessages = async (convo) => {
    try {
      setMsgLoading(true);
      const res = await api.get(`${API_BASE_FOR_MODE[convo._mode] || API_BASE_FOR_MODE.seller}/${convo.id}/messages`);
      setMessages(res.data.messages || []);
      setHasMoreMessages(!!res.data.hasMore);
      setActive({ ...res.data.conversation, _mode: convo._mode });
    } catch {} finally { setMsgLoading(false); }
  };

  // Fetches the next page of OLDER messages (before the oldest one
  // currently shown) and prepends them — the initial fetchMessages() call
  // above only ever gets the most recent 50 (ConversationService's
  // MESSAGE_PAGE_SIZE); any conversation with more history than that needs
  // this to reach it at all.
  const loadOlderMessages = async () => {
    if (!active || loadingMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingMore(true);
    try {
      const res = await api.get(
        `${API_BASE_FOR_MODE[active._mode] || API_BASE_FOR_MODE.seller}/${active.id}/messages`,
        { params: { before: oldestId } },
      );
      setMessages(prev => [...(res.data.messages || []), ...prev]);
      setHasMoreMessages(!!res.data.hasMore);
    } catch {} finally { setLoadingMore(false); }
  };

  const openConversation = (convo) => {
    setActive(convo);
    fetchMessages(convo);
  };

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    // Seller-only CRM tool (the share-product/quick-invoice picker) — no
    // point fetching a business's catalog for a buyer or an unsupported
    // role that will never see the picker UI at all.
    if (!currentUser?.id || inboxMode !== 'seller') return;
    // Was '/seller/products' — that route has never existed (the real
    // product-list endpoints all live under /products/*, e.g.
    // CreateMomentModal.js's own /products/profile/:id and
    // /products/seller/:id) — every call 404'd, so this tab always
    // rendered empty regardless of how many products the seller had.
    const productsCall = api.get('/products/my/products', {
      params: activeProfileId ? { commerceProfileId: activeProfileId } : undefined,
    });
    // Classifieds are now shareable/attachable here too — same endpoints
    // CreateMomentModal.js already uses, same profile-scoping reasoning
    // (a business profile must only ever see its own listings).
    const classifiedsCall = activeProfileId
      ? api.get(`/classifieds/profile/${activeProfileId}`)
      : api.get(`/classifieds/seller/${currentUser.id}`);
    Promise.allSettled([productsCall, classifiedsCall]).then(([pr, cl]) => {
      const items = [];
      if (pr.status === 'fulfilled') {
        (pr.value.data || []).forEach(p => items.push({
          type: 'product', id: p.id, name: p.name,
          price: p.basePrice || p.displayPrice, image: p.images?.[0],
        }));
      }
      if (cl.status === 'fulfilled') {
        (cl.value.data || []).forEach(c => items.push({
          type: 'classified', id: c.id, name: c.title,
          price: c.price, image: c.images?.[0],
        }));
      }
      setProducts(items);
    });
  }, [activeProfileId, currentUser?.id, inboxMode]);

  // ── Real-time — purely additive over the REST calls above. If the socket
  // never connects (offline, blocked, server restart), every send/receive
  // still works exactly as before this existed: fetch-on-open, fetch-on-
  // reopen. The connection itself is now owned by SocketProvider (a single
  // shared instance for the whole app, torn down and reopened on every
  // contextEpoch change) rather than by this component — this just
  // attaches/detaches its own 'newMessage' listener on whatever the current
  // context's socket is.
  const { socket } = useSocket();
  // The listener below re-registers whenever `socket` itself changes (a new
  // instance after a context switch) but must still read the CURRENT
  // `active` conversation, not whatever it was when the listener was
  // attached — this ref is the live pointer it reads instead.
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!socket) return undefined;

    const onNewMessage = ({ conversationId, message }) => {
      if (activeRef.current?.id === conversationId) {
        setMessages(prev =>
          // Dedupe against the sender's own optimistic append in
          // handleSend() — the REST response and this socket event
          // deliver the same persisted row.
          prev.some(m => m.id === message.id) ? prev : [...prev, message]
        );
      }
      // Bump the relevant conversation's own preview/unread in the LIST too,
      // even when it isn't the open thread — mirrors what a fresh
      // fetchInbox() would show, without a full refetch. Only counts as
      // "unread" when it's from the OTHER side of this specific view
      // (a seller's own outgoing message never marks their own list unread)
      // and the thread isn't the one currently open (that case is already
      // handled by the open-thread branch above, which appends but doesn't
      // need a badge).
      setConversations(prev => prev.map(c => {
        if (c.id !== conversationId) return c;
        const isFromOtherSide = c._mode === 'buyer'
          ? message.senderType === 'seller'
          : message.senderType === 'customer';
        const shouldBumpUnread = isFromOtherSide && c.id !== activeRef.current?.id;
        return {
          ...c,
          lastMessageAt: message.createdAt,
          lastMessagePreview: message.content || (message.imageUrl ? 'Picha' : c.lastMessagePreview),
          ...(shouldBumpUnread
            ? (c._mode === 'buyer'
                ? { buyerUnreadCount: (c.buyerUnreadCount || 0) + 1 }
                : { unreadCount: (c.unreadCount || 0) + 1 })
            : {}),
        };
      }));
    };

    // Read receipts: the other side opened the thread, so my messages are read.
    const onMessagesRead = ({ conversationId, readerSide }) => {
      const open = activeRef.current;
      if (!open || open.id !== conversationId) return;
      const iAmSeller = open._mode !== 'buyer';
      if ((readerSide === 'seller') === iAmSeller) return; // my own read, not theirs
      setMessages(prev => prev.map(m => (isMineMsg(m, open._mode) ? { ...m, isRead: true } : m)));
    };

    socket.on('newMessage', onNewMessage);
    socket.on('messagesRead', onMessagesRead);
    return () => { socket.off('newMessage', onNewMessage); socket.off('messagesRead', onMessagesRead); };
  }, [socket]);

  // Joins/leaves the conversation:{id} room as the open thread changes —
  // the server re-verifies participation on every join, so this can't be
  // used to eavesdrop by guessing ids.
  useEffect(() => {
    if (!socket || !active?.id) return;
    socket.emit('joinConversation', active.id);
    return () => socket.emit('leaveConversation', active.id);
  }, [socket, active?.id]);

  // Was calling POST /super-agents/shipments (createSellerShipment) — a
  // Super Agent LOGISTICS endpoint requiring originCity/transportMethod/
  // a real deliveryAddress, none of which this quick form ever collected,
  // so every real submission either failed outright or wrote garbage
  // shipment data (destinationCity was being set from the free-text
  // address field). It also swallowed every failure silently
  // (catch { console.error }, no setError) — a seller who hit the
  // missing-field failure saw nothing happen and had no way to tell why,
  // which read as "it keeps asking me to fill the form in again."
  //
  // The quick-order form's actual fields (free-text item, price, buyer
  // phone/address, no city/shipping-method) match the manual classified
  // invoice flow, not a shipment — POST /classifieds/invoices/manual —
  // exactly, and that's already the correct, identity-gated, verified
  // entry point for "seller quotes a customer an amount for something not
  // necessarily in the catalog" (see the 2026-08-28 identity-verification
  // and classified-invoice-orders audits). This creates a real invoice
  // the buyer can pay; it does NOT create a shippable Order or tracking
  // number immediately (that only happens once the invoice is paid and a
  // shipping method is chosen) — the success card/message below reflects
  // that honestly instead of claiming a tracking number that doesn't
  // exist yet.
  const handleCreateOrder = async () => {
    if (!active || !orderForm.productName.trim()) return;
    setCreatingOrder(true);
    setError('');
    try {
      const res = await api.post('/classifieds/invoices/manual', {
        buyerName:       orderForm.recipientName.trim() || active.customer?.name || t('seller_inbox.customer_fallback'),
        buyerPhone:      orderForm.phone || active.customer?.phone,
        deliveryAddress: orderForm.address || undefined,
        productName:     orderForm.productName,
        classifiedId:    orderForm.classifiedId || undefined,
        amount:          (Number(orderForm.price) || 0) * (Number(orderForm.qty) || 1),
        regionId: orderLocation.regionId || undefined, regionName: orderLocation.regionName || undefined,
        districtId: orderLocation.districtId || undefined, districtName: orderLocation.districtName || undefined,
        wardId: orderLocation.wardId || undefined, wardName: orderLocation.wardName || undefined,
      });
      // Add invoice card to conversation — same MessageType.INVOICE shape
      // SellerInbox.js's own MessageBubble already renders for invoices
      // created through the normal (non-chat) flow.
      const metadata = {
        invoiceNumber: res.data?.invoiceNumber,
        invoiceAmount: res.data?.amount,
        invoicePaid:   false,
      };
      await api.post(`/business/inbox/${active.id}/messages`, {
        content: t('seller_inbox.invoice_sent_msg', { name: orderForm.productName }),
        type: 'invoice',
        metadata,
      });
      setMessages(prev => [...prev, {
        id: Date.now(), senderType: 'system', type: 'invoice',
        content: t('seller_inbox.invoice_sent_system_msg', { name: orderForm.productName }),
        metadata,
        createdAt: new Date().toISOString(),
      }]);
      setShowOrderForm(false);
      setOrderForm({ recipientName: '', productName: '', qty: 1, price: '', phone: '', address: '', classifiedId: null });
      setOrderLocation({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_inbox.order_create_failed'));
    } finally { setCreatingOrder(false); }
  };

  // Optimistic send with a real failed/retry state — a prior version just
  // silently swallowed a failed POST (catch {}), losing the typed message
  // with no indication anything went wrong. `retryMsg` re-sends an existing
  // failed bubble in place rather than appending a second one. Temp ids are
  // strings ("temp-...") specifically so they can never collide with a real
  // numeric message id — the socket's own dedup-by-id logic depends on that.
  const handleSend = async (retryMsg) => {
    const content = retryMsg ? retryMsg.content : text.trim();
    if (!content || !active) return;
    const tempId = retryMsg ? retryMsg.id : `temp-${Date.now()}`;
    const noteFlag = retryMsg ? retryMsg.isNote : isNote;

    if (retryMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'sending' } : m));
    } else {
      setMessages(prev => [...prev, {
        id: tempId,
        conversationId: active.id,
        senderType: active._mode === 'buyer' ? 'customer' : 'seller',
        type: 'text',
        content,
        imageUrl: null,
        isNote: noteFlag,
        createdAt: new Date().toISOString(),
        _status: 'sending',
      }]);
      setText(''); setIsNote(false);
    }

    setSending(true);
    try {
      const res = active._mode === 'buyer'
        ? await api.post(`/business/my-conversations/${active.id}/messages`, { content })
        : await api.post(`${API_BASE_FOR_MODE[active._mode] || API_BASE_FOR_MODE.seller}/${active.id}/messages`, { content, isNote: noteFlag });
      setMessages(prev => prev.map(m => m.id === tempId ? res.data : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m));
    } finally { setSending(false); }
  };

  // Image attach — the upload step (to Cloudinary via /upload/images) and
  // the message-send step are separate requests; either can fail
  // independently, so both need to be retryable together. The original
  // File object is kept on the optimistic bubble (`_file`, JS-memory only,
  // never sent to the server) specifically so a retry can redo the actual
  // upload instead of resending a local-only blob: preview URL that would
  // be meaningless outside this browser tab.
  const handleAttachImage = async (file, existingTempId) => {
    if (!file || !active) return;
    const tempId = existingTempId || `temp-${Date.now()}`;
    if (existingTempId) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'sending' } : m));
    } else {
      setMessages(prev => [...prev, {
        id: tempId,
        conversationId: active.id,
        senderType: active._mode === 'buyer' ? 'customer' : 'seller',
        type: 'text',
        content: null,
        imageUrl: URL.createObjectURL(file),
        isNote: false,
        createdAt: new Date().toISOString(),
        _status: 'sending',
        _file: file,
      }]);
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      const up = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const imageUrl = up.data?.urls?.[0];
      if (!imageUrl) throw new Error('upload failed');
      const res = active._mode === 'buyer'
        ? await api.post(`/business/my-conversations/${active.id}/messages`, { imageUrl })
        : await api.post(`${API_BASE_FOR_MODE[active._mode] || API_BASE_FOR_MODE.seller}/${active.id}/messages`, { imageUrl, isNote: false });
      setMessages(prev => prev.map(m => m.id === tempId ? res.data : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m));
    } finally { setUploadingImage(false); }
  };

  const handleRetry = (msg) => msg._file ? handleAttachImage(msg._file, msg.id) : handleSend(msg);

  // `item` is already normalized to {type, id, name, price, image} by the
  // products+classifieds fetch above, regardless of which listing type it
  // came from — share-product itself doesn't care (see its own comment),
  // it just stamps whatever {id, name, price, image} it's given onto a
  // product-card message.
  const handleShareProduct = async (item) => {
    if (!active) return;
    try {
      const res = await api.post(`/business/inbox/${active.id}/share-product`, {
        id: item.id, name: item.name, price: item.price, image: item.image,
        itemType: item.type,
      });
      setMessages(prev => [...prev, res.data]);
      setShowProducts(false);
    } catch {}
  };

  const handleStatusChange = async (status) => {
    if (!active) return;
    await api.patch(`/business/inbox/${active.id}/status`, { status });
    setActive(a => ({ ...a, status }));
    setConversations(prev => prev.map(c =>
      c.id === active.id ? { ...c, status } : c
    ));
  };

  // Pin/mute — one conversation object serves both list rows (buyer-mode
  // and seller-mode), so which field to flip/read (sellerPinned vs
  // buyerPinned) depends on which side THIS row is being viewed as, not on
  // any single flag — matches how unreadCount/buyerUnreadCount already work
  // on the same object.
  const handleTogglePin = async (convo) => {
    setMenuForId(null);
    const path = convo._mode === 'buyer'
      ? `/business/my-conversations/${convo.id}/pin`
      : `/business/inbox/${convo.id}/pin`;
    const field = convo._mode === 'buyer' ? 'buyerPinned' : 'sellerPinned';
    try {
      const res = await api.patch(path);
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, [field]: res.data.pinned } : c));
    } catch {}
  };

  const handleToggleMute = async (convo) => {
    setMenuForId(null);
    const path = convo._mode === 'buyer'
      ? `/business/my-conversations/${convo.id}/mute`
      : `/business/inbox/${convo.id}/mute`;
    const field = convo._mode === 'buyer' ? 'buyerMuted' : 'sellerMuted';
    try {
      const res = await api.patch(path);
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, [field]: res.data.muted } : c));
    } catch {}
  };

  // "Archive" reuses the existing status field rather than a new concept —
  // 'closed' already means "done, out of the active list" for the seller
  // side; buyer-side conversations don't have their own status column
  // (status is seller-owned), so archiving there is represented as muting
  // instead, the closest existing buyer-controllable equivalent.
  const handleArchive = async (convo) => {
    setMenuForId(null);
    if (convo._mode === 'buyer') { await handleToggleMute(convo); return; }
    try {
      await api.patch(`/business/inbox/${convo.id}/status`, { status: 'closed' });
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, status: 'closed' } : c));
    } catch {}
  };

  // ── List: newest first, pinned on top; chips filter client-side ───────────
  const unreadOf = (c) => ((c._mode === 'buyer' ? c.buyerUnreadCount : c.unreadCount) || 0);
  const pinnedOf = (c) => !!(c._mode === 'buyer' ? c.buyerPinned : c.sellerPinned);
  const hasBusiness = inboxMode !== 'buyer';
  const visible = conversations
    .filter((c) => {
      const archived = c._mode !== 'buyer' && c.status === 'closed';
      if (chip === 'archived') return archived;
      if (archived) return false;
      if (chip === 'unread') return unreadOf(c) > 0;
      if (chip === 'customers') return c._mode !== 'buyer';
      if (chip === 'started') return c._mode === 'buyer';
      if (chip === 'assigned') return c._mode === 'seller' && (c.assignedToId === currentUser?.id || c.assignedTo?.id === currentUser?.id);
      return true;
    })
    .sort((a, b) => (pinnedOf(b) - pinnedOf(a)) || (new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)));
  const unreadTotal = conversations.reduce((n, c) => n + (unreadOf(c) > 0 ? 1 : 0), 0);
  const chips = CHIPS.filter((c) => (!c.business || hasBusiness) && (!c.seller || inboxMode === 'seller'));

  // ── Chat: messages grouped under day separators ───────────────────────────
  const groups = [];
  messages.forEach((m) => {
    const label = m.createdAt ? dayLabel(m.createdAt) : '';
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(m);
  });
  const isSellerSide = active && active._mode !== 'buyer';
  const isBusinessSeller = active && active._mode === 'seller';
  const party = active ? otherParty(active, t) : null;
  const STATUS_LABEL = { open: t('seller_inbox.status_open'), pending: t('seller_inbox.status_pending'), resolved: t('seller_inbox.status_resolved'), closed: t('seller_inbox.status_closed') };
  const closeChat = () => { if (buyerDeepLink) onNavigate('back'); else { setActive(null); setMessages([]); setShowTools(false); setShowProducts(false); setShowOrderForm(false); } };
  const field = { width: '100%', height: 44, padding: '0 12px', borderRadius: 12, border: '1px solid #cfd9de', fontSize: 15, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff' };
  const sheet = { backgroundColor: '#fff', borderTop: `1px solid ${LINE}`, borderRadius: '16px 16px 0 0', padding: '12px 16px', boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' };
  const pillBtn = (bg, fg = '#fff') => ({ height: 44, padding: '0 18px', borderRadius: 22, border: 'none', backgroundColor: bg, color: fg, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 });

  const TOOLS = [
    { key: 'photo', label: 'Picha', icon: IC.camera, bg: '#eff6ff', fg: BLUE, run: () => { setShowTools(false); fileInputRef.current?.click(); } },
    isBusinessSeller && { key: 'product', label: 'Tuma bidhaa', icon: IC.bag, bg: '#ecfdf3', fg: '#166534', run: () => { setShowTools(false); setShowOrderForm(false); setShowProducts(true); } },
    isBusinessSeller && { key: 'invoice', label: 'Tuma ankara', icon: IC.invoice, bg: '#fffbeb', fg: '#92400e', run: () => {
      setShowTools(false); setShowProducts(false);
      setOrderForm(p => ({ ...p, recipientName: p.recipientName || active.customer?.name || '', phone: p.phone || active.customer?.phone || '' }));
      setShowOrderForm(true);
    } },
    isBusinessSeller && { key: 'ship', label: 'Tuma mzigo', icon: IC.truck, bg: '#f5f3ff', fg: '#6d28d9', run: () => onNavigate('SellerShipment', {
      name: active?.customer?.name || '', phone: active?.customer?.phone || '', address: active?.customer?.address || '',
      regionId: active?.customer?.regionId || null, region: active?.customer?.region || '',
      districtId: active?.customer?.districtId || null, district: active?.customer?.district || '',
      wardId: active?.customer?.wardId || null, ward: active?.customer?.ward || '',
    }) },
    isSellerSide && { key: 'note', label: isNote ? 'Ujumbe wa kawaida' : 'Kumbukumbu ya ndani', icon: IC.note, bg: isNote ? '#fef3c7' : '#f7f9f9', fg: INK, run: () => { setShowTools(false); setIsNote(v => !v); } },
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', height: '100dvh', flexDirection: 'column', backgroundColor: '#fff', color: INK, fontFamily: 'inherit' }}>
      <input ref={fileInputRef} type="file" accept="image/*" hidden data-testid="image-input"
        onChange={e => { const file = e.target.files?.[0]; if (file) handleAttachImage(file); e.target.value = ''; }} />

      {error && (
        <div role="alert" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: '10px 16px', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>{error}</span>
          <button type="button" aria-label="Funga" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 18 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', maxWidth: 640, margin: '0 auto', width: '100%' }}>

        {/* ── Conversation list ── */}
        {!active && (
          <div style={{ width: '100%', overflowY: 'auto' }}>
            <header style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: 'rgba(255,255,255,0.97)', padding: '6px 16px 0' }}>
              <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" aria-label={t('common.back')} onClick={() => onNavigate('back')}
                  style={{ width: 40, height: 40, marginLeft: -8, borderRadius: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={IC.back} size={22} color={INK} sw={2.2} />
                </button>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{t('seller_inbox.title')}</h1>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, borderRadius: 20, backgroundColor: LINE, padding: '0 14px' }}>
                <Icon d={IC.search} size={18} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('seller_inbox.search_placeholder')} aria-label={t('seller_inbox.search_placeholder')}
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 15, fontFamily: 'inherit' }} />
              </label>
              <nav aria-label="Chuja" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '10px 0' }}>
                {chips.map((c) => {
                  const on = chip === c.key;
                  return (
                    <button type="button" key={c.key} aria-pressed={on} onClick={() => setChip(c.key)}
                      style={{ flexShrink: 0, height: 32, padding: '0 14px', borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        backgroundColor: on ? '#e8f0fe' : '#f7f9f9', color: on ? BLUE : INK, fontSize: 14, fontWeight: on ? 700 : 600 }}>
                      {c.label}{c.key === 'unread' && unreadTotal > 0 ? ` ${unreadTotal}` : ''}
                    </button>
                  );
                })}
              </nav>
            </header>

            {loading ? (
              <div role="status" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, color: MUTED, fontSize: 15 }}>
                <Spinner size={20} color={BLUE} />{t('seller_inbox.loading')}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f7f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={IC.chat} size={30} />
                </span>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{t('seller_inbox.no_conversations')}</div>
                <div style={{ fontSize: 14, color: MUTED, maxWidth: 300, lineHeight: 1.45 }}>
                  {inboxMode === 'seller' ? t('seller_inbox.go_to_customer_hint') : t('seller_inbox.no_conversations_hint')}
                </div>
                {inboxMode === 'seller' && (
                  <button type="button" onClick={() => onNavigate('SellerCustomers')} style={{ ...pillBtn(INK), marginTop: 8 }}>{t('seller_inbox.view_customers')}</button>
                )}
              </div>
            ) : visible.map(c => (
              <ConversationRow key={`${c._mode}-${c.id}`} convo={c} t={t}
                onClick={() => openConversation(c)}
                menuOpen={menuForId === `${c._mode}-${c.id}`}
                onOpenMenu={() => setMenuForId(`${c._mode}-${c.id}`)}
                onCloseMenu={() => setMenuForId(null)}
                onPin={() => handleTogglePin(c)}
                onMute={() => handleToggleMute(c)}
                onArchive={() => handleArchive(c)} />
            ))}
          </div>
        )}

        {/* ── Chat ── */}
        {active && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, backgroundColor: CHAT_BG }}>
            <header style={{ height: 60, backgroundColor: '#fff', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', flexShrink: 0 }}>
              <button type="button" aria-label={t('common.back')} onClick={closeChat}
                style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={IC.back} size={22} color={INK} sw={2.2} />
              </button>
              <Avatar photo={party.photo} name={party.name} size={40} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span data-testid="chat-name" style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{party.name}</span>
                <span style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isSellerSide ? [t('seller_inbox.customer_fallback'), active.customer?.phone].filter(Boolean).join(' · ') : 'Biashara'}
                </span>
              </span>
              {isSellerSide && active.customer?.phone && (
                <a href={`tel:${active.customer.phone}`} aria-label="Piga simu"
                  style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon d={IC.phone} size={20} color={INK} />
                </a>
              )}
              {isBusinessSeller && (
                <select aria-label="Hali ya mazungumzo" value={active.status || 'open'} onChange={e => handleStatusChange(e.target.value)}
                  style={{ height: 32, padding: '0 8px', borderRadius: 16, border: '1px solid #cfd9de', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: INK }}>
                  {['open', 'pending', 'resolved', 'closed'].map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              )}
            </header>

            {active.linkedContextTitle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: '#fff', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
                {active.linkedContextImage
                  ? <img src={active.linkedContextImage} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <span style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#f7f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={IC.bag} size={18} /></span>}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: MUTED }}>Kuhusu</span>
                  <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.linkedContextTitle}</span>
                </span>
              </div>
            )}

            {/* minHeight:0 keeps this scroll area inside the column, so the composer stays on screen. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
              {msgLoading ? (
                <div role="status" style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} color={BLUE} label={t('seller_inbox.loading')} /></div>
              ) : messages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 16px' }}>
                  <span style={{ fontSize: 13, color: MUTED, backgroundColor: '#fff', padding: '8px 12px', borderRadius: 10, textAlign: 'center', maxWidth: 280 }}>
                    {t('seller_inbox.start_conversation_prompt')}
                  </span>
                </div>
              ) : (
                <>
                  {hasMoreMessages && (
                    <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
                      <button type="button" onClick={loadOlderMessages} disabled={loadingMore}
                        style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: BLUE, cursor: loadingMore ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                        {loadingMore ? t('seller_inbox.loading') : t('seller_inbox.load_older_messages')}
                      </button>
                    </div>
                  )}
                  {groups.map((g, gi) => (
                    <React.Fragment key={`${g.label}-${gi}`}>
                      {g.label && (
                        <div style={{ textAlign: 'center', margin: '8px 0' }}>
                          <span data-testid="day-separator" style={{ fontSize: 12, color: MUTED, backgroundColor: '#fff', padding: '4px 10px', borderRadius: 8 }}>{g.label}</span>
                        </div>
                      )}
                      {g.items.map(msg => <MessageBubble key={msg.id} msg={msg} mode={active._mode} t={t} onRetry={handleRetry} onNavigate={onNavigate} />)}
                    </React.Fragment>
                  ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick invoice (business seller) ── */}
            {isBusinessSeller && showOrderForm && (
              <div style={{ ...sheet, maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{t('seller_inbox.quick_order_title')}</span>
                  <button type="button" aria-label={t('seller_inbox.close_button')} onClick={() => setShowOrderForm(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: MUTED }}>×</button>
                </div>
                {/* Pre-filled from the conversation's customer record, editable. */}
                <input aria-label={t('seller_inbox.recipient_name_placeholder')} placeholder={t('seller_inbox.recipient_name_placeholder')} value={orderForm.recipientName}
                  onChange={e => setOrderForm(p => ({ ...p, recipientName: e.target.value }))} style={field} />
                <input aria-label={t('seller_inbox.product_name_placeholder')} placeholder={t('seller_inbox.product_name_placeholder')} value={orderForm.productName}
                  onChange={e => setOrderForm(p => ({ ...p, productName: e.target.value }))} style={field} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <input aria-label={t('seller_inbox.price_tzs_placeholder')} placeholder={t('seller_inbox.price_tzs_placeholder')} inputMode="numeric" value={orderForm.price}
                    onChange={e => setOrderForm(p => ({ ...p, price: e.target.value.replace(/[^0-9]/g, '') }))} style={field} />
                  <input aria-label={t('seller_inbox.qty_placeholder')} placeholder={t('seller_inbox.qty_placeholder')} inputMode="numeric" value={orderForm.qty}
                    onChange={e => setOrderForm(p => ({ ...p, qty: e.target.value.replace(/[^0-9]/g, '') }))} style={field} />
                </div>
                <input aria-label={t('seller_inbox.recipient_phone_placeholder')} placeholder={t('seller_inbox.recipient_phone_placeholder')} inputMode="tel" value={orderForm.phone}
                  onChange={e => setOrderForm(p => ({ ...p, phone: e.target.value }))} style={field} />
                <LocationPicker label={t('seller_inbox.delivery_location_label')} value={orderLocation} onChange={setOrderLocation} />
                <input aria-label={t('seller_inbox.delivery_address_placeholder')} placeholder={t('seller_inbox.delivery_address_placeholder')} value={orderForm.address}
                  onChange={e => setOrderForm(p => ({ ...p, address: e.target.value }))} style={field} />
                <button type="button" onClick={handleCreateOrder} disabled={creatingOrder || !orderForm.productName.trim()}
                  style={{ ...pillBtn(creatingOrder || !orderForm.productName.trim() ? '#cfd9de' : INK), width: '100%' }}>
                  {creatingOrder ? <><Spinner size={16} color="#fff" />{t('seller_inbox.create_order_button')}</> : t('seller_inbox.create_order_button')}
                </button>
              </div>
            )}

            {/* ── Product picker (business seller) ── */}
            {isBusinessSeller && showProducts && (
              <div style={{ ...sheet, maxHeight: '50vh', overflowY: 'auto', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{t('seller_inbox.choose_product_title')}</span>
                  <button type="button" aria-label={t('seller_inbox.close_button')} onClick={() => setShowProducts(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: MUTED }}>×</button>
                </div>
                {products.length === 0 && <div style={{ fontSize: 14, color: MUTED, padding: '8px 0' }}>Bado huna bidhaa au matangazo.</div>}
                {products.slice(0, 20).map(p => (
                  <div key={`${p.type}-${p.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
                    {p.image
                      ? <img src={p.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#f7f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={IC.bag} size={18} /></span>}
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontSize: 13, color: MUTED }}>TZS {Number(p.price || 0).toLocaleString('en-US')}</span>
                    </span>
                    <button type="button" onClick={() => handleShareProduct(p)} style={{ ...pillBtn(INK), height: 34, padding: '0 14px', fontSize: 13 }}>{t('seller_inbox.send_arrow')}</button>
                    {/* Attaches this listing to the quick invoice instead of just sharing a card. */}
                    <button type="button" title={t('seller_inbox.use_for_invoice_title')} aria-label={t('seller_inbox.use_for_invoice_title')}
                      onClick={() => {
                        setOrderForm(f => ({ ...f, recipientName: f.recipientName || active.customer?.name || '', phone: f.phone || active.customer?.phone || '',
                          productName: p.name, price: p.price || '', classifiedId: p.type === 'classified' ? p.id : null }));
                        setShowProducts(false); setShowOrderForm(true);
                      }}
                      style={{ width: 34, height: 34, borderRadius: 17, border: '1px solid #cfd9de', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon d={IC.invoice} size={16} color={INK} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tools sheet behind + (photo for everyone; seller tools on the seller side) ── */}
            {showTools && (
              <div role="dialog" aria-label="Zana" style={{ ...sheet, flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 8px', padding: '4px 0 8px' }}>
                  {TOOLS.map(tl => (
                    <button type="button" key={tl.key} onClick={tl.run}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                      <span style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tl.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon d={tl.icon} size={22} color={tl.fg} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{tl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Composer (BottomNav is hidden on this page, so it carries its own safe-area padding) ── */}
            <div style={{ backgroundColor: CHAT_BG, padding: '6px 8px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
              {isNote && (
                <div style={{ fontSize: 13, color: '#92400e', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: 10, margin: '0 4px 6px' }}>
                  {t('seller_inbox.internal_note_hint')}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ flex: 1, minHeight: 46, backgroundColor: isNote ? '#fffbeb' : '#fff', borderRadius: 23, display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
                  <button type="button" aria-label="Zana" aria-expanded={showTools} onClick={() => { setShowTools(v => !v); setShowProducts(false); setShowOrderForm(false); }}
                    style={{ width: 38, height: 38, borderRadius: 19, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transform: showTools ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }}>
                    <Icon d={IC.plus} size={22} sw={2.2} />
                  </button>
                  <input value={text} onChange={e => setText(e.target.value)} aria-label={t('seller_inbox.message_placeholder')}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    onFocus={() => setShowTools(false)}
                    placeholder={isNote ? t('seller_inbox.note_placeholder') : t('seller_inbox.message_placeholder')}
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 16, background: 'transparent', fontFamily: 'inherit', color: INK }} />
                  <button type="button" aria-label={t('seller_inbox.attach_image_title')} onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                    style={{ width: 38, height: 38, borderRadius: 19, border: 'none', background: 'none', cursor: uploadingImage ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {uploadingImage ? <Spinner size={18} color={MUTED} /> : <Icon d={IC.camera} size={21} />}
                  </button>
                </div>
                <button type="button" aria-label="Tuma" onClick={() => handleSend()} disabled={sending || !text.trim()}
                  style={{ width: 46, height: 46, borderRadius: 23, border: 'none', flexShrink: 0, cursor: text.trim() ? 'pointer' : 'default',
                    backgroundColor: text.trim() ? BLUE : '#cfd9de', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M3 20.5l18-8.5L3 3.5l2.2 7L14 12l-8.8 1.5z" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SellerInbox;
