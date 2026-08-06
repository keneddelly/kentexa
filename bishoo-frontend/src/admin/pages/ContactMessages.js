import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const ContactMessages = ({ activePage, onNavigate, onLogout }) => {
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('all');
  const [error, setError]         = useState('');

  useEffect(() => { fetchMessages(); }, []);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const res = await api.get('/contact/admin/messages');
      setMessages(res.data || []);
    } catch { setError('Imeshindwa kupakia ujumbe'); }
    finally { setLoading(false); }
  };

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/contact/admin/messages/${id}/read`);
      setMessages(msgs => msgs.map(m => m.id === id ? { ...m, isRead: true } : m));
    } catch {}
  };

  const filtered = messages.filter(m =>
    filter === 'all' ||
    (filter === 'unread' && !m.isRead) ||
    (filter === 'read' && m.isRead)
  );

  const unreadCount = messages.filter(m => !m.isRead).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onNavigate('Dashboard')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>←</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Contact Messages</div>
      </div>
      <main style={{ flex: 1, padding: 32 }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>📬 Ujumbe wa Wateja</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Maswali na malalamiko kutoka kwa wateja</p>
        </div>

        {error && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>❌ {error}</div>}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { key: 'all',    label: `Yote (${messages.length})` },
            { key: 'unread', label: `📩 Hazijasome (${unreadCount})`, alert: unreadCount > 0 },
            { key: 'read',   label: `✅ Zimesomwa (${messages.length - unreadCount})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                backgroundColor: filter === tab.key ? (tab.alert ? '#dc2626' : '#6366f1') : '#fff',
                color: filter === tab.key ? '#fff' : '#64748b',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Inapakia...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <div>Hakuna ujumbe</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 20 }}>
            {/* List */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(msg => (
                <div key={msg.id}
                  onClick={() => { setSelected(msg); if (!msg.isRead) handleMarkRead(msg.id); }}
                  style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                    border: selected?.id === msg.id ? '2px solid #6366f1' : msg.isRead ? '1px solid #f1f5f9' : '2px solid #fde68a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {!msg.isRead && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#dc2626', marginRight: 6 }} />}
                      {msg.name || 'Asiyejulikana'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString('sw-TZ') : '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{msg.email || msg.phone || '—'}</div>
                  <div style={{ fontSize: 13, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.subject || msg.message?.slice(0, 60) || '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Detail */}
            {selected && (
              <div style={{ width: 380, backgroundColor: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: 'fit-content', position: 'sticky', top: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>📬 Ujumbe Kamili</div>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                </div>
                {[
                  { label: 'Jina', value: selected.name },
                  { label: 'Email', value: selected.email },
                  { label: 'Simu', value: selected.phone },
                  { label: 'Mada', value: selected.subject },
                  { label: 'Tarehe', value: selected.createdAt ? new Date(selected.createdAt).toLocaleString('sw-TZ') : null },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} style={{ marginBottom: 10, padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{f.label.toUpperCase()}</div>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{f.value}</div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: 14, backgroundColor: '#f8fafc', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>UJUMBE</div>
                  <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.message}</div>
                </div>
                {selected.email && (
                  <a href={`mailto:${selected.email}?subject=Re: ${selected.subject || 'Swali lako kwa KenteXa'}`}
                    style={{ display: 'block', marginTop: 14, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', padding: 12, borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                    📧 Jibu kwa Email
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ContactMessages;