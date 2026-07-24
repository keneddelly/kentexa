/**
 * Activity.js — Social commerce activity feed
 * Place at: src/public/pages/Activity.js
 *
 * Shows: new orders, new followers, wishlist updates,
 * notifications, business updates — all in one place
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const fmt  = n => Number(n||0).toLocaleString();
const ago  = d => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `Dakika ${m}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Saa ${h}`;
  const day = Math.floor(h / 24);
  return `Siku ${day}`;
};

const B = '#2563EB';

const NOTIF_ICON = {
  order_placed:   { icon: '🛒', color: B,        bg: '#EFF6FF' },
  order_paid:     { icon: '💰', color: '#16A34A', bg: '#F0FDF4' },
  order_confirmed:{ icon: '🎉', color: '#7C3AED', bg: '#F5F3FF' },
  shipment_created:{ icon:'📦', color: '#D97706', bg: '#FEF3C7' },
  save:           { icon: '❤️', color: '#EF4444', bg: '#FEF2F2' },
  comment:        { icon: '💬', color: B,          bg: '#EFF6FF' },
  default:        { icon: '🔔', color: '#64748b', bg: '#F8FAFC' },
};

const Activity = ({ onNavigate, isLoggedIn, currentUser }) => {
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('all');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    api.get('/notifications/my')
      .then(r => setNotifs(r.data?.items || r.data || []))
      .catch(() => setNotifs([]))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const unreadCount = notifs.filter(n => !n.isRead).length;

  const filtered = tab === 'unread'
    ? notifs.filter(n => !n.isRead)
    : notifs;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa', paddingBottom: 80,
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ backgroundColor: '#fff', padding: '16px 16px 0',
        borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: 0 }}>
            Activity {unreadCount > 0 && (
              <span style={{ fontSize: 14, backgroundColor: '#ef4444', color: '#fff',
                borderRadius: 100, padding: '2px 8px', marginLeft: 8 }}>
                {unreadCount}
              </span>
            )}
          </h1>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: B, fontSize: 13, fontWeight: 700 }}>
              Mark All Read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {[
            { key: 'all',    label: `All (${notifs.length})`       },
            { key: 'unread', label: `New (${unreadCount})`         },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                color: tab === t.key ? B : '#64748b',
                borderBottom: `2px solid ${tab === t.key ? B : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❤️</div>
            <div>Inapakia shughuli...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔔</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
              No activity yet
            </div>
            <div style={{ fontSize: 13 }}>
              Ufuataji wa bidhaa, maagizo na wateja utaonekana hapa
            </div>
            <button onClick={() => onNavigate('Home')}
              style={{ marginTop: 24, backgroundColor: B, color: '#fff', border: 'none',
                borderRadius: 12, padding: '12px 28px', cursor: 'pointer',
                fontSize: 14, fontWeight: 700 }}>
              Discover Products
            </button>
          </div>
        ) : filtered.map(n => {
          const style = NOTIF_ICON[n.type] || NOTIF_ICON.default;
          return (
            <div key={n.id}
              onClick={() => {
                markRead(n.id);
                if (n.actionPage) onNavigate(
                  n.actionParam ? `${n.actionPage}-${n.actionParam}` : n.actionPage
                );
              }}
              style={{
                display: 'flex', gap: 14, padding: '14px 16px',
                backgroundColor: n.isRead ? '#fff' : '#eff6ff',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = n.isRead ? '#fff' : '#eff6ff'}
            >
              {/* Icon */}
              <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                backgroundColor: style.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22 }}>
                {n.icon || style.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: n.isRead ? 600 : 800,
                  color: '#1e293b', marginBottom: 2 }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                  {n.body}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {ago(n.createdAt)}
                </div>
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div style={{ width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: B, flexShrink: 0, marginTop: 6 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Activity;