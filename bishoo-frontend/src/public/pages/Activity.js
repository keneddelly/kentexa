/**
 * Activity.js — "Taarifa": the account's alerts (new look, owner 2026-11-03: "activity page is old").
 * Twitter-style rows: a plain line icon by kind, bold title when new, the text, the time.
 *
 * Shows: new orders, new followers, wishlist updates,
 * notifications, business updates — all in one place
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

/** Notification pages the server names differently: the agent's job list is his dashboard. */
export const SERVER_PAGES = { 'agent-pickups': 'AgentDashboard' };
const ago  = (d, t) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return t('comment_section.just_now');
  if (m < 60) return t('comment_section.minutes_ago', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('comment_section.hours_ago', { count: h });
  const day = Math.floor(h / 24);
  return t('comment_section.days_ago', { count: day });
};

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d9bf0';
const noEmoji = (v) => String(v ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();

// One plain line icon per kind of alert (no emoji), picked from the alert's type.
const P = {
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2',
  money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  parcel: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  chat: 'M4 5h16v11H8l-4 4z',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
};
const iconFor = (type = '') => {
  const t = String(type).toLowerCase();
  if (/fee|invoice|receipt|lipa|payment_proof/.test(t)) return P.receipt;
  if (/paid|payout|payment|money|cod|earning/.test(t)) return P.money;
  if (/ship|parcel|pickup|delivery|dispatch|shehena|transport|agent|office|shift/.test(t)) return P.parcel;
  if (/order|sale|checkout|food/.test(t)) return P.bag;
  if (/save|like|wish/.test(t)) return P.heart;
  if (/comment|message|reply|mention|chat|question/.test(t)) return P.chat;
  if (/follow|join|member|invite|partner/.test(t)) return P.person;
  return P.bell;
};

const Activity = ({ onNavigate, isLoggedIn, currentUser, contextEpoch }) => {
  const { t } = useTranslation();
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('all');
  const [linkError, setLinkError] = useState(false);

  // GET /notifications/my is already server-scoped to the caller's current
  // active role/workspace (RoleContextGuard + CurrentRoleContext, see
  // notification.controller.ts) — refetching on every contextEpoch change is
  // what actually surfaces the newly-scoped list after a role switch. This
  // page also fully remounts via ContextEpochBoundary's key={context-...}
  // wrapper in App.js, so in practice this effect already reruns from a
  // clean slate either way; the explicit dependency is defensive so a role
  // switch is never silently missed if that remount boundary ever changes.
  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setLoading(true);
    api.get('/notifications/my')
      .then(r => setNotifs(r.data?.items || r.data || []))
      .catch(() => setNotifs([]))
      .finally(() => setLoading(false));
  }, [isLoggedIn, contextEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const openNotification = (notification) => {
    markRead(notification.id);
    // Server pages with another name here (owner 2026-11-08: a pickup job notice opened Home).
    const alias = SERVER_PAGES[notification.actionPage];
    if (alias) { onNavigate(alias); return; }
    if (notification.actionPage) onNavigate(
      notification.actionParam
        ? `${notification.actionPage}-${notification.actionParam}` : notification.actionPage,
      notification.actionCommerceProfileId
        ? { commerceProfileId: notification.actionCommerceProfileId } : undefined,
    );
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('notificationId');
    if (!isLoggedIn || !id || !/^\d+$/.test(id)) return;
    let cancelled = false;
    api.get(`/notifications/${id}`).then(({ data }) => {
      if (cancelled) return;
      // Consume this one-shot link before navigating so reloads cannot
      // redirect again. The server already checked user and active audience.
      window.history.replaceState(window.history.state, '', window.location.pathname);
      openNotification(data);
    }).catch(() => { if (!cancelled) setLinkError(true); });
    return () => { cancelled = true; };
  }, [isLoggedIn, contextEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = notifs.filter(n => !n.isRead).length;

  const filtered = tab === 'unread'
    ? notifs.filter(n => !n.isRead)
    : notifs;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: INK, paddingBottom: 80 }}>
      <div style={{ maxWidth: 600, margin: '0 auto', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, minHeight: '100vh' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 4px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{noEmoji(t('activity.page_title'))}</h1>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLUE, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
                {noEmoji(t('activity.mark_all_read'))}
              </button>
            )}
          </div>
          <nav role="tablist" style={{ display: 'flex' }}>
            {[
              { key: 'all', label: noEmoji(t('activity.tab_all', { count: notifs.length })) },
              { key: 'unread', label: noEmoji(t('activity.tab_new', { count: unreadCount })) },
            ].map(tabItem => {
              const on = tab === tabItem.key;
              return (
                <button key={tabItem.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(tabItem.key)}
                  style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 15, fontWeight: on ? 800 : 600, color: on ? INK : MUTED }}>
                  {tabItem.label}
                  <span style={{ marginTop: 10, height: 4, width: 48, borderRadius: 2, background: on ? BLUE : 'transparent' }} />
                </button>
              );
            })}
          </nav>
        </header>

        {linkError && (
          <div role="alert" style={{ padding: 14, margin: 12, background: '#fffbeb', borderRadius: 12, color: '#92400e', fontSize: 14 }}>
            Taarifa hii ni ya kazi nyingine ya akaunti yako au haipo tena. Badilisha kazi iliyoipokea, kisha uifungue tena.
          </div>
        )}
        {loading ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: MUTED, fontSize: 15 }}>{noEmoji(t('activity.loading'))}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P.bell} /></svg>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{noEmoji(t('activity.no_activity_title'))}</div>
            <div style={{ fontSize: 15, color: MUTED }}>{noEmoji(t('activity.no_activity_desc'))}</div>
            <button type="button" onClick={() => onNavigate('Home')}
              style={{ marginTop: 12, background: INK, color: '#fff', border: 'none', borderRadius: 22, height: 44, padding: '0 22px', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
              {noEmoji(t('activity.discover_products_button'))}
            </button>
          </div>
        ) : (
          <ul data-testid="activity-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {filtered.map(n => (
              <li key={n.id}>
                <button type="button" data-testid={`activity-${n.id}`} onClick={() => openNotification(n)}
                  style={{ display: 'flex', gap: 12, width: '100%', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                    background: n.isRead ? '#fff' : '#f5fafe', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={n.isRead ? MUTED : BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}><path d={iconFor(n.type)} /></svg>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {n.type === 'kentexa_message' && <span data-testid={`from-kentexa-${n.id}`} style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>Kutoka KenteXa</span>}
                    <span style={{ fontSize: 15, fontWeight: n.isRead ? 600 : 800 }}>{noEmoji(n.title)}</span>
                    {n.body && <span style={{ fontSize: 15, color: MUTED, lineHeight: 1.4 }}>{noEmoji(n.body)}</span>}
                    <span style={{ fontSize: 13, color: MUTED }}>{ago(n.createdAt, t)}</span>
                  </span>
                  {!n.isRead && <span aria-label="Mpya" style={{ width: 8, height: 8, borderRadius: 4, background: BLUE, flexShrink: 0, marginTop: 8 }} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Activity;
