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

const SOCKET_URL = process.env.REACT_APP_API_URL || 'https://api.kentexa.com';

const DATE_LOCALE_MAP = { en: 'en-GB', sw: 'sw-TZ', fr: 'fr-FR' };

const ConversationItem = ({ convo, isActive, onClick, t, dateLocale }) => {
  const STATUS_COLORS = {
    open:     { bg: '#dbeafe', color: '#1d4ed8', label: t('seller_inbox.status_open') },
    pending:  { bg: '#fef9c3', color: '#ca8a04', label: t('seller_inbox.status_pending') },
    resolved: { bg: '#dcfce7', color: '#16a34a', label: t('seller_inbox.status_resolved') },
    closed:   { bg: '#f1f5f9', color: '#64748b', label: t('seller_inbox.status_closed') },
  };
  const sc = STATUS_COLORS[convo.status] || STATUS_COLORS.open;
  const isWhatsapp = convo.channel === 'whatsapp';
  const isBuyerSide = convo._mode === 'buyer';
  // Buyer side of the table shows the SELLER (who I'm talking to); seller
  // side shows the CUSTOMER — same component, other party's name either way.
  const name = isBuyerSide
    ? (convo.seller?.storeName || convo.seller?.name || t('seller_inbox.seller_fallback'))
    : (convo.customer?.name || t('seller_inbox.customer_fallback'));
  const initial = name[0].toUpperCase();
  const unread = isBuyerSide ? convo.buyerUnreadCount : convo.unreadCount;
  const time = convo.lastMessageAt
    ? new Date(convo.lastMessageAt).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div onClick={onClick}
      style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex',
        gap: 12, alignItems: 'flex-start',
        backgroundColor: isActive ? '#eff6ff' : '#fff',
        borderBottom: '1px solid #f1f5f9',
        borderLeft: isActive ? '3px solid #1d4ed8' : '3px solid transparent' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 900, color: '#fff', position: 'relative' }}>
        {initial}
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
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{name}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{time}</div>
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
        {isWhatsapp && (
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100,
            backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: 700, marginTop: 4,
            marginLeft: 5, display: 'inline-block' }}>
            📱 WhatsApp
          </span>
        )}
      </div>
    </div>
  );
};

const MessageBubble = ({ msg, mode, t, onNavigate }) => {
  // Hooks must run unconditionally on every render of this component
  // instance — declared here even though only the job-card branch below
  // uses it, since several other branches `return` early before reaching it.
  const [responding, setResponding] = useState(false);

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
        <div onClick={() => msg.metadata.productId && onNavigate(`ProductDetail-${msg.metadata.productId}`)}
          style={{ maxWidth: '75%', backgroundColor: '#fff', cursor: msg.metadata.productId ? 'pointer' : 'default',
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
    const payable = mode === 'buyer' && !isMine && msg.metadata.orderStatus === 'pending_payment';
    const goToPay = () => payable && onNavigate(`MyOrders-pay-${msg.metadata.orderId}`);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div onClick={goToPay} style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 12, padding: 12, maxWidth: '85%', textAlign: 'center',
          cursor: payable ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>📦 {t('seller_inbox.order_card_label')}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
            #{msg.metadata.orderId}
          </div>
          {msg.metadata.trackingNumber && (
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
              {msg.metadata.trackingNumber}
            </div>
          )}
          {payable && (
            <button onClick={goToPay}
              style={{ marginTop: 8, backgroundColor: '#16a34a', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
              {t('seller_inbox.pay_now_button')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Invoice card — classified-listing invoice, verified sellers only
  if (msg.type === 'invoice' && msg.metadata) {
    const payable = mode === 'buyer' && !isMine && !!msg.metadata.invoiceNumber;
    const goToPay = () => payable && onNavigate(`PayInvoice-inv-${msg.metadata.invoiceNumber}`);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div onClick={goToPay} style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: 12, padding: 12, maxWidth: '85%', textAlign: 'center',
          cursor: payable ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 11, color: '#ea580c', fontWeight: 700 }}>🧾 {t('seller_inbox.invoice_card_label')}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
            {msg.metadata.classifiedTitle}
          </div>
          {msg.metadata.amount != null && (
            <div style={{ fontSize: 14, fontWeight: 900, color: '#ea580c', marginTop: 2 }}>
              TZS {Number(msg.metadata.amount).toLocaleString()}
            </div>
          )}
          {msg.metadata.invoiceNumber && (
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
              {msg.metadata.invoiceNumber}
            </div>
          )}
          {payable && (
            <button onClick={goToPay}
              style={{ marginTop: 8, backgroundColor: '#ea580c', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
              {t('seller_inbox.pay_now_button')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Service card — view-only listing shared in chat
  if (msg.type === 'service' && msg.metadata) {
    return (
      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start',
        margin: '6px 0' }}>
        <div onClick={() => msg.metadata.serviceId && onNavigate(`ServiceDetail-${msg.metadata.serviceId}`)}
          style={{ maxWidth: '75%', backgroundColor: '#fff', cursor: msg.metadata.serviceId ? 'pointer' : 'default',
          border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          {msg.metadata.serviceImage && (
            <img src={msg.metadata.serviceImage} alt=""
              style={{ width: '100%', height: 120, objectFit: 'cover' }} />
          )}
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>🔧 {msg.metadata.serviceTitle}</div>
            {msg.metadata.servicePrice > 0 && (
              <div style={{ fontSize: 14, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                TZS {Number(msg.metadata.servicePrice).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Job card — service booking request / accept / decline
  if (msg.type === 'job' && msg.metadata) {
    const canRespond = mode !== 'buyer' && !isMine && msg.metadata.status === 'pending';

    const respond = async (accept) => {
      if (!msg.metadata.jobRequestId) return;
      setResponding(true);
      try {
        await api.patch(`/services/jobs/${msg.metadata.jobRequestId}/respond`, { accept });
        // The follow-up message arrives via the live socket — no local
        // state update needed here.
      } catch {} finally { setResponding(false); }
    };

    const statusColors = {
      pending:  { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c' },
      accepted: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a' },
      declined: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    };
    const sc = statusColors[msg.metadata.status] || statusColors.pending;

    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <div style={{ backgroundColor: sc.bg, border: `1px solid ${sc.border}`,
          borderRadius: 12, padding: 12, maxWidth: '85%', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: sc.color, fontWeight: 700 }}>
            🔧 {t('seller_inbox.job_card_label')}
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
            {msg.metadata.serviceTitle}
          </div>
          {msg.metadata.description && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {msg.metadata.description}
            </div>
          )}
          {msg.metadata.agreedPrice != null && (
            <div style={{ fontSize: 14, fontWeight: 900, color: sc.color, marginTop: 4 }}>
              TZS {Number(msg.metadata.agreedPrice).toLocaleString()}
            </div>
          )}
          {canRespond ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => respond(true)} disabled={responding}
                style={{ flex: 1, backgroundColor: '#16a34a', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                {t('seller_inbox.accept_button')}
              </button>
              <button onClick={() => respond(false)} disabled={responding}
                style={{ flex: 1, backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fecaca',
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                {t('seller_inbox.decline_button')}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 700, color: sc.color, marginTop: 6 }}>
              {t(`seller_inbox.job_status_${msg.metadata.status}`)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start',
      margin: '4px 0' }}>
      <div style={{
        maxWidth: '78%',
        backgroundColor: isNote ? '#fef3c7' : isMine ? '#1d4ed8' : '#f1f5f9',
        color: isNote ? '#92400e' : isMine ? '#fff' : '#1e293b',
        padding: '9px 14px', borderRadius: 16,
        borderBottomRightRadius: isMine ? 4 : 16,
        borderBottomLeftRadius:  isMine ? 16 : 4,
        fontSize: 13, lineHeight: 1.5,
      }}>
        {isNote && <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>📝 {t('seller_inbox.internal_note_label')}</div>}
        {msg.content}
      </div>
    </div>
  );
};

// ── WhatsApp connection settings — connect this seller's own WhatsApp
// Business number so customer messages there flow into this same inbox. ────
const WhatsappConnectionModal = ({ status, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken,   setAccessToken]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    if (!phoneNumberId.trim() || !accessToken.trim()) {
      setError(t('seller_inbox.whatsapp_fields_required'));
      return;
    }
    try {
      setSaving(true); setError('');
      await api.patch('/business/whatsapp-connection', {
        phoneNumberId: phoneNumberId.trim(),
        accessToken: accessToken.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_inbox.whatsapp_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setSaving(true); setError('');
      await api.post('/business/whatsapp-connection/disconnect');
      onSaved();
    } catch {
      setError(t('seller_inbox.whatsapp_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
      zIndex: 5000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, backgroundColor: '#fff',
          borderRadius: '20px 20px 0 0', padding: '20px 16px max(20px, env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>
            📱 {t('seller_inbox.whatsapp_modal_title')}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
        </div>

        {status?.connected ? (
          <>
            <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: 10,
              padding: 12, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
              ✅ {t('seller_inbox.whatsapp_connected_desc', { id: status.phoneNumberId })}
            </div>
            {error && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</div>
            )}
            <button onClick={handleDisconnect} disabled={saving}
              style={{ width: '100%', backgroundColor: '#fee2e2', color: '#dc2626',
                border: 'none', borderRadius: 10, padding: 13, cursor: saving ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 800 }}>
              {saving ? t('seller_inbox.whatsapp_saving') : t('seller_inbox.whatsapp_disconnect_button')}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
              {t('seller_inbox.whatsapp_modal_desc')}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                {t('seller_inbox.whatsapp_phone_number_id_label')}
              </label>
              <input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 109876543210987"
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10,
                  border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
                {t('seller_inbox.whatsapp_access_token_label')}
              </label>
              <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)}
                placeholder={t('seller_inbox.whatsapp_access_token_placeholder')}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10,
                  border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            {error && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{error}</div>
            )}
            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)',
                color: '#fff', border: 'none', borderRadius: 10, padding: 13,
                cursor: saving ? 'wait' : 'pointer', fontSize: 14, fontWeight: 800 }}>
              {saving ? t('seller_inbox.whatsapp_saving') : t('seller_inbox.whatsapp_connect_button')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const SellerInbox = ({ onNavigate, initialCustomerId, sellerId, currentUser }) => {
  const { t, i18n } = useTranslation();
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
  const [classifieds,   setClassifieds]     = useState([]);
  const [services,      setServices]        = useState([]);
  const [showServices,  setShowServices]    = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm,   setInvoiceForm]     = useState({ classifiedId: null, classifiedTitle: '', amount: '', notes: '', dueDays: 3 });
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [showProducts,  setShowProducts]    = useState(false);
  const [showOrderForm, setShowOrderForm]   = useState(false);
  const [orderForm,     setOrderForm]       = useState({ productName: '', productId: null, qty: 1, price: '', phone: '', address: '' });
  const [creatingOrder, setCreatingOrder]   = useState(false);
  const [filter,        setFilter]          = useState('open');
  const [error,         setError]           = useState('');
  const [waStatus,      setWaStatus]        = useState(null);
  const [showWaModal,   setShowWaModal]     = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Deep-linked straight into a chat with one specific seller (MessageSeller-{id}).
  const buyerDeepLink = !!sellerId;
  // Mirrors the backend's assertVerifiedSeller() in classifieds.service.ts —
  // invoices are seller/admin/manager only, and sellers must be verified.
  const isVerifiedSeller = !!currentUser && (
    ['admin', 'manager'].includes(currentUser.role) ||
    (currentUser.role === 'seller' && currentUser.isVerified)
  );

  // Only the seller viewing their own inbox can connect a WhatsApp number —
  // not relevant when this page is opened as a buyer messaging someone else.
  const showWhatsappSettings = !buyerDeepLink && currentUser?.role === 'seller';

  const fetchWaStatus = useCallback(() => {
    if (!showWhatsappSettings) return;
    api.get('/business/whatsapp-connection')
      .then(r => setWaStatus(r.data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWhatsappSettings]);

  useEffect(() => { fetchWaStatus(); }, [fetchWaStatus]);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // ── Deep-linked: open/start a single conversation as the buyer ──────
      if (buyerDeepLink) {
        try {
          const r = await api.post('/business/my-conversations/start', {
            sellerId: Number(sellerId),
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
      const [sellerRes, buyerRes] = await Promise.allSettled([
        api.get(`/business/inbox?status=${filter}&limit=30`),
        api.get('/business/my-conversations?limit=30'),
      ]);
      const sellerList = sellerRes.status === 'fulfilled'
        ? (sellerRes.value.data.conversations || []).map(c => ({ ...c, _mode: 'seller' }))
        : [];
      const buyerList = buyerRes.status === 'fulfilled'
        ? (buyerRes.value.data.conversations || []).map(c => ({ ...c, _mode: 'buyer' }))
        : [];
      const merged = [...sellerList, ...buyerList].sort((a, b) =>
        new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)
      );
      setConversations(merged);
    } catch {} finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, initialCustomerId, sellerId]);

  const fetchMessages = async (convo) => {
    try {
      setMsgLoading(true);
      const res = await api.get(
        convo._mode === 'buyer'
          ? `/business/my-conversations/${convo.id}/messages`
          : `/business/inbox/${convo.id}/messages`
      );
      setMessages(res.data.messages || []);
      setActive({ ...res.data.conversation, _mode: convo._mode });
    } catch {} finally { setMsgLoading(false); }
  };

  const openConversation = (convo) => {
    setActive(convo);
    fetchMessages(convo);
    socketRef.current?.emit('joinConversation', convo.id);
  };

  // ── Real-time updates — purely additive on top of the REST flow above.
  // If the socket never connects, the inbox still works exactly as before
  // (fetch on open/reopen), just without live push. ──────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('newMessage', ({ conversationId, message }) => {
      const current = activeRef.current;
      if (current && current.id === conversationId) {
        setMessages(prev =>
          prev.some(m => m.id === message.id) ? prev : [...prev, message]
        );
      }
      setConversations(prev => prev.map(c =>
        c.id === conversationId
          ? {
              ...c,
              lastMessageAt: message.createdAt,
              lastMessagePreview: message.content?.slice(0, 100) || '[Picha]',
              unreadCount: (current && current.id === conversationId && current._mode !== 'buyer')
                ? c.unreadCount : (c._mode !== 'buyer' ? (c.unreadCount || 0) + 1 : c.unreadCount),
              buyerUnreadCount: (current && current.id === conversationId && current._mode === 'buyer')
                ? c.buyerUnreadCount : (c._mode === 'buyer' ? (c.buyerUnreadCount || 0) + 1 : c.buyerUnreadCount),
            }
          : c
      ));
    });

    return () => socket.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-join the active conversation's room if the socket connects/reconnects
  // after it was already opened (e.g. token wasn't ready on first mount).
  useEffect(() => {
    if (active) socketRef.current?.emit('joinConversation', active.id);
  }, [active]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    api.get('/products/my/products').then(r => setProducts(r.data || [])).catch(() => {});
    api.get('/classifieds/user/mine').then(r => setClassifieds(r.data || [])).catch(() => {});
    api.get('/services/my/ads').then(r => setServices(r.data || [])).catch(() => {});
  }, []);

  const handleCreateOrder = async () => {
    if (!active || !orderForm.productName.trim()) return;

    // Registered buyer → real online order, paid through KenteXa
    // (mobile money/agent). Manual/WhatsApp customers with no account
    // have no way to pay online, so they keep the existing "already paid
    // outside KenteXa" shipment flow below, unchanged.
    const isOnlineBuyer = !!active.customer?.userId;
    if (isOnlineBuyer && !orderForm.productId) {
      setError(t('seller_inbox.pick_real_product_error'));
      return;
    }

    setCreatingOrder(true);
    try {
      let res, messageMetadata, systemMsgContent;
      if (isOnlineBuyer) {
        res = await api.post('/orders/create-for-buyer', {
          buyerId:         active.customer.userId,
          productId:       orderForm.productId,
          quantity:        Number(orderForm.qty) || 1,
          deliveryAddress: orderForm.address || active.customer?.address || undefined,
          phone:           orderForm.phone || active.customer?.phone || undefined,
        });
        messageMetadata = {
          orderId:     res.data?.id,
          orderStatus: 'pending_payment',
        };
        systemMsgContent = t('seller_inbox.order_created_system_msg', { name: orderForm.productName });
      } else {
        res = await api.post('/super-agents/shipments', {
          originCity:      currentUser?.businessLocation?.split(',')[0]?.trim() || 'Dar es Salaam',
          recipientName:   active.customer?.name || t('seller_inbox.customer_fallback'),
          recipientPhone:  orderForm.phone || active.customer?.phone,
          destinationCity: orderForm.address,
          description:     orderForm.productName,
          weightKg:        1,
          totalValue:      Number(orderForm.price) || 0,
          quantity:        Number(orderForm.qty) || 1,
          source:          'seller_shipment',
        });
        messageMetadata = {
          orderId:        res.data?.id,
          trackingNumber: res.data?.trackingNumber,
          orderStatus:    'preparing',
        };
        systemMsgContent = t('seller_inbox.order_created_system_msg', { name: orderForm.productName });
      }

      // Add order card to conversation
      await api.post(`/business/inbox/${active.id}/messages`, {
        content: t('seller_inbox.order_created_msg', { name: orderForm.productName }),
        type: 'order',
        metadata: messageMetadata,
      });
      setMessages(prev => [...prev, {
        id: Date.now(), senderType: 'system', type: 'order',
        content: systemMsgContent,
        metadata: messageMetadata,
        createdAt: new Date().toISOString(),
      }]);
      setShowOrderForm(false);
      setOrderForm({ productName: '', productId: null, qty: 1, price: '', phone: '', address: '' });
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_inbox.order_create_failed'));
    } finally { setCreatingOrder(false); }
  };

  const handleSend = async () => {
    if (!text.trim() || !active) return;
    setSending(true);
    try {
      const res = active._mode === 'buyer'
        ? await api.post(`/business/my-conversations/${active.id}/messages`, {
            content: text.trim(),
          })
        : await api.post(`/business/inbox/${active.id}/messages`, {
            content: text.trim(), isNote,
          });
      setMessages(prev => [...prev, res.data]);
      setText(''); setIsNote(false);
    } catch {} finally { setSending(false); }
  };

  const handleCreateInvoice = async () => {
    if (!active || !invoiceForm.classifiedId || !invoiceForm.amount) return;
    setCreatingInvoice(true);
    try {
      const res = await api.post('/classifieds/invoices/manual', {
        buyerName:       active.customer?.name || t('seller_inbox.customer_fallback'),
        buyerPhone:      active.customer?.phone || '',
        buyerId:         active.customer?.userId || undefined,
        deliveryAddress: active.customer?.address || '',
        productName:     invoiceForm.classifiedTitle,
        classifiedId:    invoiceForm.classifiedId,
        amount:          Number(invoiceForm.amount),
        notes:           invoiceForm.notes,
        dueDays:         Number(invoiceForm.dueDays) || 3,
      });
      const messageMetadata = {
        invoiceNumber: res.data?.invoiceNumber,
        amount:        res.data?.amount,
        classifiedTitle: invoiceForm.classifiedTitle,
      };
      await api.post(`/business/inbox/${active.id}/messages`, {
        content: t('seller_inbox.invoice_created_msg', { name: invoiceForm.classifiedTitle }),
        type: 'invoice',
        metadata: messageMetadata,
      });
      setMessages(prev => [...prev, {
        id: Date.now(), senderType: 'system', type: 'invoice',
        content: t('seller_inbox.invoice_created_msg', { name: invoiceForm.classifiedTitle }),
        metadata: messageMetadata,
        createdAt: new Date().toISOString(),
      }]);
      setShowInvoiceForm(false);
      setInvoiceForm({ classifiedId: null, classifiedTitle: '', amount: '', notes: '', dueDays: 3 });
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_inbox.invoice_create_failed'));
    } finally { setCreatingInvoice(false); }
  };

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

  const handleShareService = async (service) => {
    if (!active) return;
    try {
      const res = await api.post(`/business/inbox/${active.id}/share-service`, {
        id: service.id, title: service.title,
        price: service.price,
        image: service.images?.[0],
      });
      setMessages(prev => [...prev, res.data]);
      setShowServices(false);
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

  return (
    <div style={{ display: 'flex', height: '100dvh', minHeight: '100vh', flexDirection: 'column',
      backgroundColor: '#f8fafc' }}>
      <BackBar title={t('seller_inbox.title')} onBack={() => onNavigate('back')}
        right={showWhatsappSettings ? (
          <button onClick={() => setShowWaModal(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
              color: waStatus?.connected ? '#16a34a' : '#64748b' }}>
            📱 {waStatus?.connected ? t('seller_inbox.whatsapp_connected_badge') : t('seller_inbox.whatsapp_connect_badge')}
          </button>
        ) : undefined} />

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
          <div style={{ width: '100%', overflowY: 'auto', backgroundColor: '#fff',
            paddingBottom: 60 }}>
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

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{t('seller_inbox.loading')}</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                  {t('seller_inbox.no_conversations')}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {t('seller_inbox.go_to_customer_hint')}
                </div>
                <button onClick={() => onNavigate('SellerCustomers')}
                  style={{ marginTop: 16, backgroundColor: '#1d4ed8', color: '#fff',
                    border: 'none', padding: '10px 20px', borderRadius: 10,
                    cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {t('seller_inbox.view_customers')}
                </button>
              </div>
            ) : conversations.map(c => (
              <ConversationItem key={c.id} convo={c} t={t} dateLocale={dateLocale}
                isActive={active?.id === c.id}
                onClick={() => openConversation(c)} />
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
                    ? (active.seller?.storeName || active.seller?.name || t('seller_inbox.seller_fallback'))
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

            {/* Messages */}
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
              ) : messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} mode={active._mode} t={t} onNavigate={onNavigate} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Order Form — seller-only CRM tool */}
            {active._mode !== 'buyer' && showOrderForm && (
              <div style={{ backgroundColor: '#f0fdf4', borderTop: '1px solid #86efac',
                padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 10 }}>
                  {t('seller_inbox.quick_order_title')}
                </div>
                {products.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                      {t('seller_inbox.pick_product_label')}
                    </div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                      {products.slice(0, 20).map(p => (
                        <button key={p.id}
                          onClick={() => setOrderForm(f => ({
                            ...f,
                            productName: p.name,
                            productId: p.id,
                            price: String(p.basePrice ?? p.displayPrice ?? ''),
                          }))}
                          style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 100,
                            border: orderForm.productName === p.name ? '2px solid #16a34a' : '1px solid #e2e8f0',
                            backgroundColor: orderForm.productName === p.name ? '#f0fdf4' : '#fff',
                            color: orderForm.productName === p.name ? '#16a34a' : '#1e293b',
                            cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

            {/* Invoice Form — verified sellers only, for classified listings */}
            {active._mode !== 'buyer' && isVerifiedSeller && showInvoiceForm && (
              <div style={{ backgroundColor: '#fff7ed', borderTop: '1px solid #fed7aa',
                padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ea580c', marginBottom: 10 }}>
                  {t('seller_inbox.create_invoice_title')}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                    {t('seller_inbox.pick_listing_label')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                    {classifieds.slice(0, 20).map(c => (
                      <button key={c.id}
                        onClick={() => setInvoiceForm(f => ({
                          ...f,
                          classifiedId: c.id,
                          classifiedTitle: c.title,
                          amount: String(c.price ?? ''),
                        }))}
                        style={{ flexShrink: 0, padding: '5px 10px', borderRadius: 100,
                          border: invoiceForm.classifiedId === c.id ? '2px solid #ea580c' : '1px solid #e2e8f0',
                          backgroundColor: invoiceForm.classifiedId === c.id ? '#fff7ed' : '#fff',
                          color: invoiceForm.classifiedId === c.id ? '#ea580c' : '#1e293b',
                          cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {c.title}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <input placeholder={t('seller_inbox.price_tzs_placeholder')} type="number" value={invoiceForm.amount}
                    onChange={e => setInvoiceForm(p => ({...p, amount: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #fed7aa', fontSize: 12, outline: 'none' }} />
                  <input placeholder={t('seller_inbox.due_days_placeholder')} type="number" value={invoiceForm.dueDays}
                    onChange={e => setInvoiceForm(p => ({...p, dueDays: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #fed7aa', fontSize: 12, outline: 'none' }} />
                </div>
                <input placeholder={t('seller_inbox.invoice_notes_placeholder')} value={invoiceForm.notes}
                  onChange={e => setInvoiceForm(p => ({...p, notes: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #fed7aa', fontSize: 12, marginBottom: 8,
                    boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateInvoice} disabled={creatingInvoice || !invoiceForm.classifiedId || !invoiceForm.amount}
                    style={{ flex: 2, backgroundColor: '#ea580c', color: '#fff', border: 'none',
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800 }}>
                    {creatingInvoice ? '⏳...' : t('seller_inbox.create_invoice_button')}
                  </button>
                  <button onClick={() => setShowInvoiceForm(false)}
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

            {/* Service picker — seller-only CRM tool */}
            {active._mode !== 'buyer' && showServices && (
              <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
                padding: 12, maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                  {t('seller_inbox.choose_service_title')}
                </div>
                {services.slice(0, 20).map(s => (
                  <div key={s.id} onClick={() => handleShareService(s)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer' }}>
                    {s.images?.[0] && (
                      <img src={s.images[0]} alt=""
                        style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: '#16a34a' }}>
                        TZS {Number(s.price || 0).toLocaleString()}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#1d4ed8' }}>{t('seller_inbox.send_arrow')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input bar — bottom padding clears the fixed 60px BottomNav
                that renders on top of every logged-in page (App.js) */}
            <div style={{ backgroundColor: '#fff', padding: '10px 12px',
              paddingBottom: 70, borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
              {/* Action buttons — seller-only CRM tools, hidden for the buyer side */}
              {active._mode !== 'buyer' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setShowProducts(!showProducts)}
                  title={t('seller_inbox.share_product_title')}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showProducts ? '#eff6ff' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>
                  {t('seller_inbox.products_button')}
                </button>
                {services.length > 0 && (
                  <button onClick={() => setShowServices(!showServices)}
                    title={t('seller_inbox.share_service_title')}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                      backgroundColor: showServices ? '#eff6ff' : '#fff', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>
                    {t('seller_inbox.services_button')}
                  </button>
                )}
                <button onClick={() => {
                    if (!showOrderForm) {
                      // Pull in whatever's already known — the customer's
                      // contact info from CRM, and the last product shared
                      // in this conversation — instead of asking the seller
                      // to retype it all.
                      const lastProduct = [...messages].reverse()
                        .find(m => m.type === 'product' && m.metadata);
                      setOrderForm(f => ({
                        ...f,
                        phone:       f.phone       || active?.customer?.phone   || '',
                        address:     f.address     || active?.customer?.address || '',
                        productName: f.productName || lastProduct?.metadata?.productName || '',
                        price:       f.price       || (lastProduct?.metadata?.productPrice ?? ''),
                      }));
                    }
                    setShowOrderForm(!showOrderForm);
                  }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showOrderForm ? '#f0fdf4' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
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
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>
                  {t('seller_inbox.ship_button')}
                </button>
                {isVerifiedSeller && classifieds.length > 0 && (
                  <button onClick={() => setShowInvoiceForm(!showInvoiceForm)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                      backgroundColor: showInvoiceForm ? '#fff7ed' : '#fff', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, color: '#ea580c' }}>
                    {t('seller_inbox.invoice_button')}
                  </button>
                )}
                <button onClick={() => setIsNote(!isNote)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: isNote ? '#fef3c7' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#92400e' }}>
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

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={isNote ? t('seller_inbox.note_placeholder') : t('seller_inbox.message_placeholder')}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 24,
                    border: `2px solid ${isNote ? '#fde68a' : '#e2e8f0'}`,
                    fontSize: 13, outline: 'none',
                    backgroundColor: isNote ? '#fffbeb' : '#f8fafc' }} />
                <button onClick={handleSend} disabled={sending || !text.trim()}
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

      {showWaModal && (
        <WhatsappConnectionModal
          status={waStatus}
          onClose={() => setShowWaModal(false)}
          onSaved={() => { setShowWaModal(false); fetchWaStatus(); }}
        />
      )}
    </div>
  );
};

export default SellerInbox;