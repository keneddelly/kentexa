/**
 * SellerInbox.js — Unified Commerce Inbox
 * Place at: src/public/pages/SellerInbox.js
 *
 * Seller sees all customer conversations.
 * Can: reply, share products, create orders, send invoices.
 * Converting conversations into transactions.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import { hasAnyRole } from '../utils/roles';

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };
const SOCKET_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const ConversationItem = ({ convo, isActive, onClick, t, dateLocale, menuOpen, onOpenMenu, onCloseMenu, onPin, onMute, onArchive }) => {
  const STATUS_COLORS = {
    open:     { bg: '#dbeafe', color: '#1d4ed8', label: t('seller_inbox.status_open') },
    pending:  { bg: '#fef9c3', color: '#ca8a04', label: t('seller_inbox.status_pending') },
    resolved: { bg: '#dcfce7', color: '#16a34a', label: t('seller_inbox.status_resolved') },
    closed:   { bg: '#f1f5f9', color: '#64748b', label: t('seller_inbox.status_closed') },
  };
  const sc = STATUS_COLORS[convo.status] || STATUS_COLORS.open;
  const isBuyerSide = convo._mode === 'buyer';
  // Buyer side of the table shows the SELLER (who I'm talking to); seller
  // side shows the CUSTOMER — same component, other party's name either way.
  // convo.commerceProfile (resolved from the conversation's own stored
  // commerceProfileId) wins over the seller's raw account fields when
  // present — a conversation about a personal-profile classified shouldn't
  // show the seller's business brand, or vice versa. Customers don't run
  // commerce profiles, so the seller-side name is unaffected.
  const name = isBuyerSide
    ? (convo.commerceProfile?.displayName || convo.seller?.storeName || convo.seller?.name || t('seller_inbox.seller_fallback'))
    : (convo.customer?.name || t('seller_inbox.customer_fallback'));
  const photo = isBuyerSide ? convo.commerceProfile?.photoUrl : null;
  const initial = name[0].toUpperCase();
  const unread = isBuyerSide ? convo.buyerUnreadCount : convo.unreadCount;
  const pinned = isBuyerSide ? convo.buyerPinned : convo.sellerPinned;
  const muted = isBuyerSide ? convo.buyerMuted : convo.sellerMuted;
  const time = convo.lastMessageAt
    ? new Date(convo.lastMessageAt).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div onClick={onClick}
      style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex',
        gap: 12, alignItems: 'flex-start', position: 'relative',
        backgroundColor: pinned ? '#fafaf5' : isActive ? '#eff6ff' : '#fff',
        borderBottom: '1px solid #f1f5f9',
        borderLeft: isActive ? '3px solid #1d4ed8' : '3px solid transparent' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 900, color: '#fff', position: 'relative',
        overflow: 'hidden' }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
        {unread > 0 && (
          <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16,
            backgroundColor: '#dc2626', borderRadius: '50%', fontSize: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900 }}>
            {unread}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            {pinned && <span style={{ fontSize: 11 }}>📌</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {muted && <span style={{ fontSize: 11, color: '#94a3b8' }}>🔕</span>}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{time}</div>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {convo.lastMessagePreview || '...'}
        </div>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100,
          backgroundColor: sc.bg, color: sc.color, fontWeight: 700, marginTop: 4,
          display: 'inline-block' }}>
          {sc.label}
        </span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); menuOpen ? onCloseMenu() : onOpenMenu(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
          fontSize: 18, padding: '2px 6px', flexShrink: 0, alignSelf: 'flex-start' }}>
        ⋮
      </button>
      {menuOpen && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 38, right: 12, backgroundColor: '#fff',
            borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 10,
            minWidth: 150, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
          {[
            { label: pinned ? t('seller_inbox.unpin_action') : t('seller_inbox.pin_action'), onClick: onPin },
            { label: muted ? t('seller_inbox.unmute_action') : t('seller_inbox.mute_action'), onClick: onMute },
            { label: t('seller_inbox.archive_action'), onClick: onArchive },
          ].map(item => (
            <div key={item.label} onClick={item.onClick}
              style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: '#1e293b',
                cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageBubble = ({ msg, mode, t, onRetry, onNavigate }) => {
  // "Mine" = my own outgoing messages, aligned right — flips depending on
  // which side of the conversation the current viewer is on.
  const isMine = mode === 'buyer'
    ? msg.senderType === 'customer'
    : (msg.senderType === 'seller' || msg.senderType === 'employee');
  const isSystem = msg.senderType === 'system';
  const isNote   = msg.isNote;

  if (isSystem) return (
    <div style={{ textAlign: 'center', margin: '8px 0' }}>
      <span style={{ fontSize: 11, backgroundColor: '#f1f5f9', color: '#64748b',
        padding: '4px 12px', borderRadius: 100 }}>
        {msg.content}
      </span>
    </div>
  );

  // Product card
  if (msg.type === 'product' && msg.metadata) {
    return (
      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start',
        margin: '6px 0' }}>
        <div style={{ maxWidth: '75%', backgroundColor: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          {msg.metadata.productImage && (
            <img src={msg.metadata.productImage} alt=""
              style={{ width: '100%', height: 120, objectFit: 'cover' }} />
          )}
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{msg.metadata.productName}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
              TZS {Number(msg.metadata.productPrice || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Order card
  if (msg.type === 'order' && msg.metadata) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 12, padding: 12, maxWidth: '85%', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>📦 {t('seller_inbox.order_card_label')}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
            #{msg.metadata.orderId}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
            {msg.metadata.trackingNumber}
          </div>
        </div>
      </div>
    );
  }

  // Invoice card — created (awaiting payment) or paid, same card either way
  if (msg.type === 'invoice' && msg.metadata) {
    const paid = !!msg.metadata.invoicePaid;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div style={{
          backgroundColor: paid ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${paid ? '#86efac' : '#fde68a'}`,
          borderRadius: 12, padding: 12, maxWidth: '85%', textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: paid ? '#16a34a' : '#b45309', fontWeight: 700 }}>
            🧾 {t('seller_inbox.invoice_card_label')}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', marginTop: 4 }}>
            #{msg.metadata.invoiceNumber}
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b', marginTop: 2 }}>
            TZS {Number(msg.metadata.invoiceAmount || 0).toLocaleString()}
          </div>
          <div style={{
            display: 'inline-block', marginTop: 6, padding: '2px 10px', borderRadius: 100,
            fontSize: 10, fontWeight: 800,
            backgroundColor: paid ? '#16a34a' : '#f59e0b', color: '#fff',
          }}>
            {paid ? t('seller_inbox.invoice_paid_label') : t('seller_inbox.invoice_pending_label')}
          </div>
          {!paid && mode === 'buyer' && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => onNavigate?.('MyOrders')}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none',
                  backgroundColor: '#1d4ed8', color: '#fff', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer' }}>
                {t('seller_inbox.invoice_pay_now')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isSending = msg._status === 'sending';
  const isFailed  = msg._status === 'failed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column',
      alignItems: isMine ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
      <div style={{
        maxWidth: '78%',
        backgroundColor: isNote ? '#fef3c7' : isMine ? '#1d4ed8' : '#f1f5f9',
        color: isNote ? '#92400e' : isMine ? '#fff' : '#1e293b',
        padding: msg.imageUrl && !msg.content ? 4 : '9px 14px', borderRadius: 16,
        borderBottomRightRadius: isMine ? 4 : 16,
        borderBottomLeftRadius:  isMine ? 16 : 4,
        fontSize: 13, lineHeight: 1.5,
        opacity: isSending ? 0.6 : isFailed ? 0.85 : 1,
      }}>
        {isNote && <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>📝 {t('seller_inbox.internal_note_label')}</div>}
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 12, display: 'block',
            marginBottom: msg.content ? 6 : 0 }} />
        )}
        {msg.content}
      </div>
      {(isSending || isFailed) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10 }}>
          {isSending && <span style={{ color: '#94a3b8' }}>{t('seller_inbox.status_sending')}</span>}
          {isFailed && (
            <>
              <span style={{ color: '#dc2626' }}>{t('seller_inbox.status_failed')}</span>
              <button onClick={() => onRetry?.(msg)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: '#1d4ed8', fontWeight: 700, fontSize: 10, textDecoration: 'underline' }}>
                {t('seller_inbox.retry_button')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SellerInbox = ({ onNavigate, initialCustomerId, sellerId, userRole, messageCommerceProfileId, currentUser }) => {
  const { t, i18n } = useTranslation();
  const canSell = hasAnyRole(userRole, currentUser, ['seller', 'admin', 'manager']);
  const dateLocale = DATE_LOCALE_MAP[i18n.language] || 'sw-TZ';
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
  const [orderForm,     setOrderForm]       = useState({ productName: '', qty: 1, price: '', phone: '', address: '' });
  const [creatingOrder, setCreatingOrder]   = useState(false);
  const [filter,        setFilter]          = useState('open');
  const [error,         setError]           = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [search,        setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mineOnly,      setMineOnly]        = useState(false);
  const [menuForId,     setMenuForId]       = useState(null); // which conversation's ⋮ menu is open
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Deep-linked straight into a chat with one specific seller (MessageSeller-{id}).
  const buyerDeepLink = !!sellerId;

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
            sellerId: Number(sellerId),
            commerceProfileId: messageCommerceProfileId ? Number(messageCommerceProfileId) : undefined,
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
        const res = await api.get(`/business/inbox?status=${filter}&limit=30`);
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

      // ── Bare inbox — merge both sides: my conversations as seller AND as buyer ──
      // "Assigned to me" only means something on the seller side (it's a
      // team-member working filter over the shared business inbox) — a
      // buyer-side thread where I'm messaging some other seller has no
      // assignment concept, so that fetch is skipped entirely while active
      // rather than fetched and then discarded.
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
      const mineParam = mineOnly ? '&mine=true' : '';
      const [sellerRes, buyerRes] = await Promise.allSettled([
        api.get(`/business/inbox?status=${filter}&limit=30${searchParam}${mineParam}`),
        mineOnly ? Promise.resolve({ data: { conversations: [] } }) : api.get(`/business/my-conversations?limit=30${searchParam}`),
      ]);
      const sellerList = sellerRes.status === 'fulfilled'
        ? (sellerRes.value.data.conversations || []).map(c => ({ ...c, _mode: 'seller' }))
        : [];
      const buyerList = buyerRes.status === 'fulfilled'
        ? (buyerRes.value.data.conversations || []).map(c => ({ ...c, _mode: 'buyer' }))
        : [];
      // Each side arrives already pin-sorted from the backend; merging by
      // date alone would flatten that (a pinned older thread on one side
      // could land below an unpinned newer one from the other side) — pin
      // status wins first, exactly matching what a single-side view already
      // shows, before falling back to recency.
      const merged = [...sellerList, ...buyerList].sort((a, b) => {
        const aPinned = a._mode === 'buyer' ? a.buyerPinned : a.sellerPinned;
        const bPinned = b._mode === 'buyer' ? b.buyerPinned : b.sellerPinned;
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt);
      });
      setConversations(merged);
    } catch {} finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, initialCustomerId, sellerId, messageCommerceProfileId, debouncedSearch, mineOnly]);

  const fetchMessages = async (convo) => {
    try {
      setMsgLoading(true);
      const res = await api.get(
        convo._mode === 'buyer'
          ? `/business/my-conversations/${convo.id}/messages`
          : `/business/inbox/${convo.id}/messages`
      );
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
        active._mode === 'buyer'
          ? `/business/my-conversations/${active.id}/messages`
          : `/business/inbox/${active.id}/messages`,
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
    api.get('/seller/products').then(r => setProducts(r.data?.products || [])).catch(() => {});
  }, []);

  // ── Real-time — purely additive over the REST calls above. If the socket
  // never connects (offline, blocked, server restart), every send/receive
  // still works exactly as before this existed: fetch-on-open, fetch-on-
  // reopen. This component is always rendered behind requireLogin() in
  // App.js, so a token is guaranteed to exist whenever this mounts.
  const socketRef = useRef(null);
  // The socket effect below mounts once ([] deps) so it can't read `active`
  // fresh via closure — this ref is the live pointer it reads instead.
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('newMessage', ({ conversationId, message }) => {
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
          lastMessagePreview: message.content || (message.imageUrl ? '📷 Picha' : c.lastMessagePreview),
          ...(shouldBumpUnread
            ? (c._mode === 'buyer'
                ? { buyerUnreadCount: (c.buyerUnreadCount || 0) + 1 }
                : { unreadCount: (c.unreadCount || 0) + 1 })
            : {}),
        };
      }));
    });

    return () => socket.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Joins/leaves the conversation:{id} room as the open thread changes —
  // the server re-verifies participation on every join, so this can't be
  // used to eavesdrop by guessing ids.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !active?.id) return;
    socket.emit('joinConversation', active.id);
    return () => socket.emit('leaveConversation', active.id);
  }, [active?.id]);

  const handleCreateOrder = async () => {
    if (!active || !orderForm.productName.trim()) return;
    setCreatingOrder(true);
    try {
      const res = await api.post('/super-agents/shipments', {
        recipientName:   active.customer?.name || t('seller_inbox.customer_fallback'),
        recipientPhone:  orderForm.phone || active.customer?.phone,
        destinationCity: orderForm.address,
        description:     orderForm.productName,
        weightKg:        1,
        totalValue:      Number(orderForm.price) || 0,
        quantity:        Number(orderForm.qty) || 1,
        source:          'seller_shipment',
      });
      // Add order card to conversation
      await api.post(`/business/inbox/${active.id}/messages`, {
        content: t('seller_inbox.order_created_msg', { name: orderForm.productName }),
        type: 'order',
        metadata: {
          orderId:        res.data?.id,
          trackingNumber: res.data?.trackingNumber,
          orderStatus:    'preparing',
        },
      });
      setMessages(prev => [...prev, {
        id: Date.now(), senderType: 'system', type: 'order',
        content: t('seller_inbox.order_created_system_msg', { name: orderForm.productName }),
        metadata: { orderId: res.data?.id, trackingNumber: res.data?.trackingNumber, orderStatus: 'preparing' },
        createdAt: new Date().toISOString(),
      }]);
      setShowOrderForm(false);
      setOrderForm({ productName: '', qty: 1, price: '', phone: '', address: '' });
    } catch (err) {
      console.error('Order creation failed:', err);
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
        : await api.post(`/business/inbox/${active.id}/messages`, { content, isNote: noteFlag });
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
        : await api.post(`/business/inbox/${active.id}/messages`, { imageUrl, isNote: false });
      setMessages(prev => prev.map(m => m.id === tempId ? res.data : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m));
    } finally { setUploadingImage(false); }
  };

  const handleRetry = (msg) => msg._file ? handleAttachImage(msg._file, msg.id) : handleSend(msg);

  const handleShareProduct = async (product) => {
    if (!active) return;
    try {
      const res = await api.post(`/business/inbox/${active.id}/share-product`, {
        id: product.id, name: product.name,
        price: product.basePrice || product.displayPrice,
        image: product.images?.[0],
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

  return (
    <div style={{ display: 'flex', height: '100dvh', flexDirection: 'column',
      backgroundColor: '#f8fafc' }}>
      <BackBar title={t('seller_inbox.title')} onBack={() => onNavigate('back')} />

      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 16px',
          fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>❌ {error}</span>
          <button onClick={() => setError('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#dc2626', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', maxWidth: 480,
        margin: '0 auto', width: '100%' }}>

        {/* Conversation list — hidden when active on mobile */}
        {!active && (
          <div style={{ width: '100%', overflowY: 'auto', backgroundColor: '#fff' }}>
            {/* Search — debounced 300ms, see the effect above; searches by
                person/business name (seller side: customer name/phone;
                buyer side: the seller's own name/store name). */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94a3b8' }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t('seller_inbox.search_placeholder')}
                  style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10,
                    border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
              </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {['open','pending','resolved'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                    backgroundColor: filter === s ? '#eff6ff' : '#fff',
                    color: filter === s ? '#1d4ed8' : '#64748b',
                    fontSize: 12, fontWeight: 700,
                    borderBottom: filter === s ? '2px solid #1d4ed8' : '2px solid transparent' }}>
                  {s === 'open' ? t('seller_inbox.filter_open') : s === 'pending' ? t('seller_inbox.filter_pending') : t('seller_inbox.filter_resolved')}
                </button>
              ))}
            </div>

            {/* "Assigned to me" — a team member's own working view over the
                shared business inbox (same conversations, filtered), not a
                separate inbox. Meaningless on the buyer side, so toggling
                this on skips that fetch entirely rather than showing an
                always-empty buyer section. */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
              <button onClick={() => setMineOnly(v => !v)}
                style={{ padding: '5px 12px', borderRadius: 100, cursor: 'pointer',
                  border: mineOnly ? '1.5px solid #1d4ed8' : '1.5px solid #e2e8f0',
                  backgroundColor: mineOnly ? '#eff6ff' : '#fff',
                  color: mineOnly ? '#1d4ed8' : '#64748b',
                  fontSize: 11.5, fontWeight: 700 }}>
                {t('seller_inbox.mine_only_toggle')}
              </button>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{t('seller_inbox.loading')}</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                  {t('seller_inbox.no_conversations')}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {canSell ? t('seller_inbox.go_to_customer_hint') : t('seller_inbox.no_conversations_hint')}
                </div>
                {canSell && (
                  <button onClick={() => onNavigate('SellerCustomers')}
                    style={{ marginTop: 16, backgroundColor: '#1d4ed8', color: '#fff',
                      border: 'none', padding: '10px 20px', borderRadius: 10,
                      cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {t('seller_inbox.view_customers')}
                  </button>
                )}
              </div>
            ) : conversations.map(c => (
              <ConversationItem key={c.id} convo={c} t={t} dateLocale={dateLocale}
                isActive={active?.id === c.id}
                onClick={() => openConversation(c)}
                menuOpen={menuForId === c.id}
                onOpenMenu={() => setMenuForId(c.id)}
                onCloseMenu={() => setMenuForId(null)}
                onPin={() => handleTogglePin(c)}
                onMute={() => handleToggleMute(c)}
                onArchive={() => handleArchive(c)} />
            ))}
          </div>
        )}

        {/* Chat window */}
        {active && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column',
            height: '100%', minHeight: 0 }}>
            {/* Chat header */}
            <div style={{ backgroundColor: '#fff', padding: '12px 16px',
              borderBottom: '1px solid #f1f5f9', display: 'flex',
              alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => buyerDeepLink
                  ? onNavigate('back')
                  : (setActive(null), setMessages([]))}
                style={{ background: 'none', border: 'none', fontSize: 20,
                  cursor: 'pointer', color: '#64748b' }}>←</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                  {active._mode === 'buyer'
                    ? (active.commerceProfile?.displayName || active.seller?.storeName || active.seller?.name || t('seller_inbox.seller_fallback'))
                    : (active.customer?.name || t('seller_inbox.customer_fallback'))}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {active._mode === 'buyer' ? '' : (active.customer?.phone || '')}
                </div>
              </div>
              {/* Status dropdown — seller-only CRM control */}
              {active._mode !== 'buyer' && (
              <select value={active.status}
                onChange={e => handleStatusChange(e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8,
                  border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <option value="open">{t('seller_inbox.filter_open')}</option>
                <option value="pending">{t('seller_inbox.filter_pending')}</option>
                <option value="resolved">{t('seller_inbox.filter_resolved')}</option>
                <option value="closed">⛔ {t('seller_inbox.status_closed')}</option>
              </select>
              )}
            </div>

            {/* Messages — minHeight:0 is required here: without it this
                flex:1 scroll area sizes to its content instead of clamping
                to the flex column, which pushes the input bar below out
                of the visible viewport on mobile (looked like overlapping
                content, and made the input impossible to reach/type in). */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px',
              backgroundColor: '#f8fafc' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 36 }}>👋</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
                    {t('seller_inbox.start_conversation_prompt')}
                  </div>
                </div>
              ) : (
              <>
                {hasMoreMessages && (
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <button onClick={loadOlderMessages} disabled={loadingMore}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 100,
                        padding: '6px 16px', fontSize: 11, fontWeight: 700, color: '#1d4ed8',
                        cursor: loadingMore ? 'default' : 'pointer' }}>
                      {loadingMore ? t('seller_inbox.loading') : t('seller_inbox.load_older_messages')}
                    </button>
                  </div>
                )}
                {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} mode={active._mode} t={t} onRetry={handleRetry} onNavigate={onNavigate} />
              ))}
              </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Order Form — seller-only CRM tool */}
            {active._mode !== 'buyer' && showOrderForm && (
              <div style={{ backgroundColor: '#f0fdf4', borderTop: '1px solid #86efac',
                padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 10 }}>
                  {t('seller_inbox.quick_order_title')}
                </div>
                <input placeholder={t('seller_inbox.product_name_placeholder')} value={orderForm.productName}
                  onChange={e => setOrderForm(p => ({...p, productName: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 6,
                    boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <input placeholder={t('seller_inbox.price_tzs_placeholder')} type="number" value={orderForm.price}
                    onChange={e => setOrderForm(p => ({...p, price: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #86efac', fontSize: 12, outline: 'none' }} />
                  <input placeholder={t('seller_inbox.qty_placeholder')} type="number" value={orderForm.qty}
                    onChange={e => setOrderForm(p => ({...p, qty: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #86efac', fontSize: 12, outline: 'none' }} />
                </div>
                <input placeholder={t('seller_inbox.recipient_phone_placeholder')} value={orderForm.phone}
                  onChange={e => setOrderForm(p => ({...p, phone: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 6,
                    boxSizing: 'border-box', outline: 'none' }} />
                <input placeholder={t('seller_inbox.delivery_address_placeholder')} value={orderForm.address}
                  onChange={e => setOrderForm(p => ({...p, address: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 8,
                    boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateOrder} disabled={creatingOrder || !orderForm.productName.trim()}
                    style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none',
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800 }}>
                    {creatingOrder ? '⏳...' : t('seller_inbox.create_order_button')}
                  </button>
                  <button onClick={() => setShowOrderForm(false)}
                    style={{ flex: 1, backgroundColor: '#fff', color: '#64748b',
                      border: '1px solid #e2e8f0', padding: '9px 12px', borderRadius: 8,
                      cursor: 'pointer', fontSize: 12 }}>
                    {t('seller_inbox.close_button')}
                  </button>
                </div>
              </div>
            )}

            {/* Product picker — seller-only CRM tool */}
            {active._mode !== 'buyer' && showProducts && (
              <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
                padding: 12, maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                  {t('seller_inbox.choose_product_title')}
                </div>
                {products.slice(0, 20).map(p => (
                  <div key={p.id} onClick={() => handleShareProduct(p)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer' }}>
                    {p.images?.[0] && (
                      <img src={p.images[0]} alt=""
                        style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#16a34a' }}>
                        TZS {Number(p.basePrice || 0).toLocaleString()}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#1d4ed8' }}>{t('seller_inbox.send_arrow')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div style={{ backgroundColor: '#fff', padding: '10px 12px',
              borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
              {/* Action buttons — seller-only CRM tools, hidden for the buyer side.
                  overflowX:'auto' + flexShrink:0 per button so all four stay
                  reachable via horizontal scroll on narrow phones instead of
                  the row silently clipping the last one or two off-screen. */}
              {active._mode !== 'buyer' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto',
                paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
                <button onClick={() => setShowProducts(!showProducts)}
                  title={t('seller_inbox.share_product_title')}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showProducts ? '#eff6ff' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                  {t('seller_inbox.products_button')}
                </button>
                <button onClick={() => setShowOrderForm(!showOrderForm)}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showOrderForm ? '#f0fdf4' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                  {t('seller_inbox.order_button')}
                </button>
                <button onClick={() => onNavigate('SellerShipment', {
                    name:       active?.customer?.name       || '',
                    phone:      active?.customer?.phone      || '',
                    address:    active?.customer?.address    || '',
                    regionId:   active?.customer?.regionId   || null,
                    region:     active?.customer?.region     || '',
                    districtId: active?.customer?.districtId || null,
                    district:   active?.customer?.district   || '',
                    wardId:     active?.customer?.wardId     || null,
                    ward:       active?.customer?.ward       || '',
                  })}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                  {t('seller_inbox.ship_button')}
                </button>
                <button onClick={() => setIsNote(!isNote)}
                  style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: isNote ? '#fef3c7' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>
                  📝 {isNote ? t('seller_inbox.note_button_checked') : t('seller_inbox.note_button')}
                </button>
              </div>
              )}

              {isNote && (
                <div style={{ fontSize: 10, color: '#92400e', backgroundColor: '#fef3c7',
                  padding: '4px 8px', borderRadius: 6, marginBottom: 6 }}>
                  {t('seller_inbox.internal_note_hint')}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileInputRef} type="file" accept="image/*" hidden
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleAttachImage(file);
                    e.target.value = '';
                  }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                  title={t('seller_inbox.attach_image_title')}
                  style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    border: '1.5px solid #e2e8f0', backgroundColor: '#fff',
                    cursor: uploadingImage ? 'default' : 'pointer', fontSize: 16 }}>
                  {uploadingImage ? '⏳' : '📎'}
                </button>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={isNote ? t('seller_inbox.note_placeholder') : t('seller_inbox.message_placeholder')}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 24,
                    border: `2px solid ${isNote ? '#fde68a' : '#e2e8f0'}`,
                    fontSize: 13, outline: 'none',
                    backgroundColor: isNote ? '#fffbeb' : '#f8fafc' }} />
                <button onClick={() => handleSend()} disabled={sending || !text.trim()}
                  style={{ width: 44, height: 44, borderRadius: '50%',
                    backgroundColor: text.trim() ? '#1d4ed8' : '#e2e8f0',
                    border: 'none', cursor: text.trim() ? 'pointer' : 'default',
                    fontSize: 18, color: '#fff', flexShrink: 0 }}>
                  {sending ? '⏳' : '➤'}
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