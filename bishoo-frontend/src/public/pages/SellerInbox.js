/**
 * SellerInbox.js — Unified Commerce Inbox
 * Place at: src/public/pages/SellerInbox.js
 *
 * Seller sees all customer conversations.
 * Can: reply, share products, create orders, send invoices.
 * Converting conversations into transactions.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import BackBar from '../components/BackBar';
import api from '../../api/api';

const STATUS_COLORS = {
  open:     { bg: '#dbeafe', color: '#1d4ed8', label: 'Wazi' },
  pending:  { bg: '#fef9c3', color: '#ca8a04', label: 'Inasubiri' },
  resolved: { bg: '#dcfce7', color: '#16a34a', label: 'Imekamilika' },
  closed:   { bg: '#f1f5f9', color: '#64748b', label: 'Imefungwa' },
};

const ConversationItem = ({ convo, isActive, onClick }) => {
  const sc = STATUS_COLORS[convo.status] || STATUS_COLORS.open;
  const name = convo.customer?.name || 'Mteja';
  const initial = name[0].toUpperCase();
  const time = convo.lastMessageAt
    ? new Date(convo.lastMessageAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })
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
        {convo.unreadCount > 0 && (
          <div style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16,
            backgroundColor: '#dc2626', borderRadius: '50%', fontSize: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900 }}>
            {convo.unreadCount}
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
      </div>
    </div>
  );
};

const MessageBubble = ({ msg, sellerId }) => {
  const isSeller = msg.senderType === 'seller' || msg.senderType === 'employee';
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
      <div style={{ display: 'flex', justifyContent: isSeller ? 'flex-end' : 'flex-start',
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
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>📦 AGIZO LIMEUNDWA</div>
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

  return (
    <div style={{ display: 'flex', justifyContent: isSeller ? 'flex-end' : 'flex-start',
      margin: '4px 0' }}>
      <div style={{
        maxWidth: '78%',
        backgroundColor: isNote ? '#fef3c7' : isSeller ? '#1d4ed8' : '#f1f5f9',
        color: isNote ? '#92400e' : isSeller ? '#fff' : '#1e293b',
        padding: '9px 14px', borderRadius: 16,
        borderBottomRightRadius: isSeller ? 4 : 16,
        borderBottomLeftRadius:  isSeller ? 16 : 4,
        fontSize: 13, lineHeight: 1.5,
      }}>
        {isNote && <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>📝 KUMBUKA (ya ndani)</div>}
        {msg.content}
      </div>
    </div>
  );
};

const SellerInbox = ({ onNavigate, initialCustomerId }) => {
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
  const messagesEndRef = useRef(null);

  const fetchInbox = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/business/inbox?status=${filter}&limit=30`);
      setConversations(res.data.conversations || []);
      // Auto-open if initialCustomerId passed — always, even if inbox is empty
      if (initialCustomerId) {
        const match = (res.data.conversations || []).find(
          c => c.customerId === Number(initialCustomerId)
        );
        if (match) {
          openConversation(match);
        } else {
          // No existing conversation — start one
          try {
            const r = await api.post('/business/inbox/start', {
              customerId: Number(initialCustomerId)
            });
            setActive(r.data);
            setConversations(prev => [r.data, ...prev]);
            fetchMessages(r.data.id);
          } catch (err) {
            setError('Imeshindwa kuanza mazungumzo. Hakikisha mteja yupo.');
          }
        }
      }
    } catch {} finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, initialCustomerId]);

  const fetchMessages = async (convoId) => {
    try {
      setMsgLoading(true);
      const res = await api.get(`/business/inbox/${convoId}/messages`);
      setMessages(res.data.messages || []);
      setActive(res.data.conversation);
    } catch {} finally { setMsgLoading(false); }
  };

  const openConversation = (convo) => {
    setActive(convo);
    fetchMessages(convo.id);
  };

  useEffect(() => { fetchInbox(); }, [fetchInbox]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    api.get('/seller/products').then(r => setProducts(r.data?.products || [])).catch(() => {});
  }, []);

  const handleCreateOrder = async () => {
    if (!active || !orderForm.productName.trim()) return;
    setCreatingOrder(true);
    try {
      const res = await api.post('/super-agents/shipments', {
        recipientName:   active.customer?.name || 'Mteja',
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
        content: `📦 Agizo limeundwa: ${orderForm.productName}`,
        type: 'order',
        metadata: {
          orderId:        res.data?.id,
          trackingNumber: res.data?.trackingNumber,
          orderStatus:    'preparing',
        },
      });
      setMessages(prev => [...prev, {
        id: Date.now(), senderType: 'system', type: 'order',
        content: `Agizo limeundwa: ${orderForm.productName}`,
        metadata: { orderId: res.data?.id, trackingNumber: res.data?.trackingNumber, orderStatus: 'preparing' },
        createdAt: new Date().toISOString(),
      }]);
      setShowOrderForm(false);
      setOrderForm({ productName: '', qty: 1, price: '', phone: '', address: '' });
    } catch (err) {
      console.error('Order creation failed:', err);
    } finally { setCreatingOrder(false); }
  };

  const handleSend = async () => {
    if (!text.trim() || !active) return;
    setSending(true);
    try {
      const res = await api.post(`/business/inbox/${active.id}/messages`, {
        content: text.trim(), isNote,
      });
      setMessages(prev => [...prev, res.data]);
      setText(''); setIsNote(false);
    } catch {} finally { setSending(false); }
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

  const handleStatusChange = async (status) => {
    if (!active) return;
    await api.patch(`/business/inbox/${active.id}/status`, { status });
    setActive(a => ({ ...a, status }));
    setConversations(prev => prev.map(c =>
      c.id === active.id ? { ...c, status } : c
    ));
  };

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column',
      backgroundColor: '#f8fafc' }}>
      <BackBar title="Inbox ya Wateja" onBack={() => onNavigate('back')} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', maxWidth: 480,
        margin: '0 auto', width: '100%' }}>

        {/* Conversation list — hidden when active on mobile */}
        {!active && (
          <div style={{ width: '100%', overflowY: 'auto', backgroundColor: '#fff' }}>
            {/* Filter tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
              {['open','pending','resolved'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  style={{ flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                    backgroundColor: filter === s ? '#eff6ff' : '#fff',
                    color: filter === s ? '#1d4ed8' : '#64748b',
                    fontSize: 12, fontWeight: 700,
                    borderBottom: filter === s ? '2px solid #1d4ed8' : '2px solid transparent' }}>
                  {s === 'open' ? '🟢 Wazi' : s === 'pending' ? '🟡 Inasubiri' : '✅ Imekamilika'}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Inapakia...</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                  Hakuna mazungumzo
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Nenda kwa mteja na ubonyeze "Anza Mazungumzo"
                </div>
                <button onClick={() => onNavigate('SellerCustomers')}
                  style={{ marginTop: 16, backgroundColor: '#1d4ed8', color: '#fff',
                    border: 'none', padding: '10px 20px', borderRadius: 10,
                    cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  👥 Ona Wateja
                </button>
              </div>
            ) : conversations.map(c => (
              <ConversationItem key={c.id} convo={c}
                isActive={active?.id === c.id}
                onClick={() => openConversation(c)} />
            ))}
          </div>
        )}

        {/* Chat window */}
        {active && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column',
            height: '100%' }}>
            {/* Chat header */}
            <div style={{ backgroundColor: '#fff', padding: '12px 16px',
              borderBottom: '1px solid #f1f5f9', display: 'flex',
              alignItems: 'center', gap: 12 }}>
              <button onClick={() => { setActive(null); setMessages([]); }}
                style={{ background: 'none', border: 'none', fontSize: 20,
                  cursor: 'pointer', color: '#64748b' }}>←</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>
                  {active.customer?.name || 'Mteja'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {active.customer?.phone || ''}
                </div>
              </div>
              {/* Status dropdown */}
              <select value={active.status}
                onChange={e => handleStatusChange(e.target.value)}
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8,
                  border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <option value="open">🟢 Wazi</option>
                <option value="pending">🟡 Inasubiri</option>
                <option value="resolved">✅ Imekamilika</option>
                <option value="closed">⛔ Imefungwa</option>
              </select>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px',
              backgroundColor: '#f8fafc' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 36 }}>👋</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
                    Anza mazungumzo
                  </div>
                </div>
              ) : messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Order Form */}
            {showOrderForm && (
              <div style={{ backgroundColor: '#f0fdf4', borderTop: '1px solid #86efac',
                padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', marginBottom: 10 }}>
                  🚀 Unda Agizo Haraka
                </div>
                <input placeholder="Jina la Bidhaa *" value={orderForm.productName}
                  onChange={e => setOrderForm(p => ({...p, productName: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 6,
                    boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <input placeholder="Bei (TZS)" type="number" value={orderForm.price}
                    onChange={e => setOrderForm(p => ({...p, price: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #86efac', fontSize: 12, outline: 'none' }} />
                  <input placeholder="Idadi" type="number" value={orderForm.qty}
                    onChange={e => setOrderForm(p => ({...p, qty: e.target.value}))}
                    style={{ padding: '8px 10px', borderRadius: 8,
                      border: '1px solid #86efac', fontSize: 12, outline: 'none' }} />
                </div>
                <input placeholder="Simu ya Mpokeaji" value={orderForm.phone}
                  onChange={e => setOrderForm(p => ({...p, phone: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 6,
                    boxSizing: 'border-box', outline: 'none' }} />
                <input placeholder="Anwani ya Uwasilishaji" value={orderForm.address}
                  onChange={e => setOrderForm(p => ({...p, address: e.target.value}))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #86efac', fontSize: 12, marginBottom: 8,
                    boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateOrder} disabled={creatingOrder || !orderForm.productName.trim()}
                    style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none',
                      padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800 }}>
                    {creatingOrder ? '⏳...' : '✅ Unda Agizo'}
                  </button>
                  <button onClick={() => setShowOrderForm(false)}
                    style={{ flex: 1, backgroundColor: '#fff', color: '#64748b',
                      border: '1px solid #e2e8f0', padding: '9px 12px', borderRadius: 8,
                      cursor: 'pointer', fontSize: 12 }}>
                    Funga
                  </button>
                </div>
              </div>
            )}

            {/* Product picker */}
            {showProducts && (
              <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
                padding: 12, maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                  Chagua Bidhaa
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
                    <span style={{ fontSize: 11, color: '#1d4ed8' }}>Tuma →</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div style={{ backgroundColor: '#fff', padding: '10px 12px',
              borderTop: '1px solid #f1f5f9' }}>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setShowProducts(!showProducts)}
                  title="Shiriki Bidhaa"
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showProducts ? '#eff6ff' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>
                  📦 Bidhaa
                </button>
                <button onClick={() => setShowOrderForm(!showOrderForm)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: showOrderForm ? '#f0fdf4' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                  🚀 Agizo
                </button>
                <button onClick={() => onNavigate('SellerShipment', {
                    name:     active?.customer?.name    || '',
                    phone:    active?.customer?.phone   || '',
                    address:  active?.customer?.address || '',
                    district: active?.customer?.district || '',
                    region:   active?.customer?.region   || '',
                  })}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>
                  📦 Tuma
                </button>
                <button onClick={() => setIsNote(!isNote)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
                    backgroundColor: isNote ? '#fef3c7' : '#fff', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                  📝 {isNote ? 'Kumbuka ✓' : 'Kumbuka'}
                </button>
              </div>

              {isNote && (
                <div style={{ fontSize: 10, color: '#92400e', backgroundColor: '#fef3c7',
                  padding: '4px 8px', borderRadius: 6, marginBottom: 6 }}>
                  📝 Kumbuka ya ndani — mteja hataona
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={isNote ? 'Andika kumbuka ya ndani...' : 'Andika ujumbe...'}
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
    </div>
  );
};

export default SellerInbox;