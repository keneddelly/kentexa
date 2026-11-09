/**
 * Admin: inbox chats between users (owner 2026-11-09: "kentexa should see what is chatting between
 * users"; owner chose that admin reads all chats). The list shows who talks with whom; a chat opens
 * with all its messages. Each opened chat is recorded on the server with who opened it.
 * GET /activity/admin/chats, GET /activity/admin/chats/:id. Read-only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import SendMessageButton from '../components/SendMessageButton';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BLUE = '#1d4ed8';
const when = (d) => (d ? new Date(d).toLocaleString('sw-TZ', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const CHANNEL = { kentexa: 'KenteXa', whatsapp: 'WhatsApp', instagram: 'Instagram' };
const linkBtn = { background: 'none', border: 'none', padding: 0, color: BLUE, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 };

export default function AdminChats({ activePage, onNavigate, onLogout, userId }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { conversation, messages }
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async (before) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/activity/admin/chats', { params: { q: q.trim() || undefined, userId: userId || undefined, before } });
      setItems((prev) => (before ? [...prev, ...(data.items || [])] : data.items || []));
      setNext(data.nextBefore || null);
    } catch (e) { setError(e?.response?.data?.message || 'Imeshindwa kupakia mazungumzo'); }
    finally { setLoading(false); }
  }, [q, userId]);
  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps -- search runs on submit

  const openChat = async (id) => {
    setOpenId(id); setOpen(null);
    try { setOpen((await api.get(`/activity/admin/chats/${id}`)).data); } catch (e) { setError(e?.response?.data?.message || 'Haikufunguka'); }
  };

  const c = open?.conversation;
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', color: INK }}>
      <Sidebar activePage={activePage || 'AdminChats'} onNavigate={onNavigate} onLogout={onLogout} />
      <main style={{ marginLeft: 250, flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Mazungumzo</h1>
          <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>Mazungumzo ya inbox kati ya wateja na biashara. Kila mazungumzo unayofungua yanarekodiwa na jina lako.</p>
        </header>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 8 }}>
          <input aria-label="Tafuta mazungumzo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jina, simu au neno kwenye ujumbe wa mwisho"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, fontFamily: 'inherit' }} />
          <button type="submit" style={{ border: 'none', background: INK, color: '#fff', borderRadius: 20, padding: '0 18px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Tafuta</button>
        </form>
        {userId && <div style={{ fontSize: 14 }}>Mazungumzo ya mtumiaji #{userId} · <button type="button" style={linkBtn} onClick={() => onNavigate('AdminChats', {})}>Ona yote</button></div>}
        {error && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 2fr) minmax(0, 3fr)', gap: 14, alignItems: 'start' }}>
          <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
            {items.length === 0 && !loading && <p style={{ color: MUTED, padding: 16, margin: 0 }}>Hakuna mazungumzo.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="chat-list">
              {items.map((it) => (
                <li key={it.id}>
                  <button type="button" data-testid={`chat-${it.id}`} onClick={() => openChat(it.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${LINE}`, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: INK, background: openId === it.id ? '#eff6ff' : '#fff' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{it.customerName || 'Mteja'} <span style={{ color: MUTED, fontWeight: 500 }}>na</span> {it.sellerName || `#${it.sellerId}`}</div>
                    <div style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.lastMessagePreview || '—'}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{[CHANNEL[it.channel] || it.channel, `ujumbe ${it.messageCount || 0}`, when(it.lastMessageAt || it.createdAt)].join(' · ')}</div>
                  </button>
                </li>
              ))}
            </ul>
            {next && <button type="button" onClick={() => load(next)} disabled={loading} style={{ ...linkBtn, display: 'block', padding: 14 }}>Onyesha zaidi</button>}
          </section>

          <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, minHeight: 300 }} data-testid="chat-thread">
            {!openId && <p style={{ color: MUTED, margin: 0 }}>Chagua mazungumzo kuona ujumbe wake.</p>}
            {openId && !open && !error && <p style={{ color: MUTED, margin: 0 }}>Inafungua...</p>}
            {c && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${LINE}`, paddingBottom: 12, marginBottom: 12 }}>
                  {[['Mteja', c.customerUserId, c.customerName, c.customerPhone], ['Biashara', c.sellerId, c.sellerName, c.sellerPhone]].map(([role, id, name, phone]) => (
                    <div key={role} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                      <span style={{ color: MUTED, width: 64 }}>{role}</span>
                      {id ? <button type="button" style={linkBtn} onClick={() => onNavigate('AdminPerson', { userId: id })}>{name || `#${id}`}</button> : <b>{name || '—'}</b>}
                      {phone && <span style={{ color: MUTED }}>{phone}</span>}
                      <SendMessageButton small userId={id} name={name} />
                    </div>
                  ))}
                  <div style={{ fontSize: 13, color: MUTED }}>{[CHANNEL[c.channel] || c.channel, c.linkedOrderId ? `Oda #${c.linkedOrderId}` : null, `ilianza ${when(c.createdAt)}`].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {open.messages.length === 0 && <p style={{ color: MUTED, margin: 0 }}>Hakuna ujumbe.</p>}
                  {open.messages.map((m) => {
                    const system = m.senderType === 'system';
                    const fromCustomer = m.senderType === 'customer';
                    return (
                      <div key={m.id} data-testid={`message-${m.id}`} style={{ alignSelf: system ? 'center' : fromCustomer ? 'flex-start' : 'flex-end', maxWidth: '78%' }}>
                        <div style={{ padding: '8px 12px', borderRadius: 14, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                          background: system ? '#f1f5f9' : m.isNote ? '#fef3c7' : fromCustomer ? '#f1f5f9' : '#dbeafe', color: INK }}>
                          {m.isNote && <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Maelezo ya ndani ya biashara</div>}
                          {m.content || (m.imageUrl ? '' : `[${m.type}]`)}
                          {m.imageUrl && <a href={m.imageUrl} target="_blank" rel="noreferrer" style={{ display: 'block', color: BLUE, fontWeight: 700 }}>Picha</a>}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2, textAlign: fromCustomer || system ? 'left' : 'right' }}>
                          {[m.senderName || (fromCustomer ? c.customerName : system ? 'KenteXa' : c.sellerName), when(m.createdAt)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
