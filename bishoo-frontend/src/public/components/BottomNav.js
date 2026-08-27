/**
 * BottomNav.js — Instagram-style 5-tab bottom navigation
 * Place at: src/public/components/BottomNav.js
 *
 * Tab 1 is always Home — a real-time feed of OTHER people's/businesses'
 * content, reachable no matter which CommerceProfile is active. Tabs 2/4
 * reconfigure per the currently ACTIVE profile's type (a business profile
 * gets Orders/Inbox, a hub gets Manifest/Settings, and so on) — those are
 * quick-access shortcuts to that identity's own management surfaces, not
 * a replacement for discovery. Post(+) and Profile (tab 5, always the
 * account hub where you switch profiles) stay constant across every type.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const B = '#2563EB';

const HomeIcon = (active) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? B : 'none'}
    stroke={active ? B : '#64748b'} strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
);
const SearchIcon = (active) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke={active ? B : '#64748b'} strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const ActivityIcon = (active) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? B : 'none'}
    stroke={active ? B : '#64748b'} strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);
const emojiIcon = (emoji) => (active) => (
  <span style={{ fontSize: 21, opacity: active ? 1 : 0.55 }}>{emoji}</span>
);

const PROFILE_TYPE_ICON = {
  personal: '👤', business: '🏪', hub: '🏢',
  transport_provider: '🚌', agent: '🏍️', service_provider: '🔧',
};

// Position 1 is fixed to Home (discovery, every type). Position 2 is that
// profile's own Dashboard — the real management hub for the identity
// that's active, one tap past discovery. Position 4 stays a quick-jump to
// whichever single sub-page is used most for that type (Orders, Settings,
// etc.) — a shortcut past the dashboard's own navigation, not a duplicate
// of it.
const TYPE_TABS = (t) => {
  const first = { page: 'Home', icon: HomeIcon, label: t('nav.home') };
  return {
    personal: {
      first,
      second: { page: 'Search',   icon: SearchIcon,   label: t('common.search') },
      fourth: { page: 'Activity', icon: ActivityIcon, label: t('bottom_nav.activity') },
    },
    business: {
      first,
      second: { page: 'SellerDashboard', icon: emojiIcon('📊'), label: t('bottom_nav.dashboard') },
      fourth: { page: 'SellerInbox',     icon: emojiIcon('💬'), label: t('bottom_nav.inbox') },
    },
    hub: {
      first,
      second: { page: 'SuperAgentDashboard', icon: emojiIcon('🏢'), label: t('bottom_nav.dashboard') },
      // Was SuperAgentSettings — a Super Agent talks to customers about
      // shipments constantly, same as a Business talks to buyers, so Inbox
      // earns the dedicated bottom-nav slot the same way it already does
      // for `business` above. Settings stays one tap away via the ⚙️ icon
      // already in SuperAgentDashboard's own header, matching how
      // BusinessDashboard.js already has BOTH a bottom-nav Inbox tab AND
      // its own in-page Messages row — not a new inconsistency.
      fourth: { page: 'SellerInbox', icon: emojiIcon('💬'), label: t('bottom_nav.inbox') },
    },
    transport_provider: {
      first,
      second: { page: 'TransportProviderDashboard', icon: emojiIcon('🚌'), label: t('bottom_nav.dashboard') },
      // RouteCoverageMap (the routes network map) used to sit in this slot
      // before tab 2 became the Dashboard — it was silently dropped, not
      // reachable from the bottom nav at all otherwise, and generic Search
      // defaults to showing marketplace classifieds, not transport routes.
      fourth: { page: 'RouteCoverageMap', icon: emojiIcon('🗺️'), label: t('bottom_nav.routes') },
    },
    agent: {
      first,
      second: { page: 'AgentDashboard', icon: emojiIcon('🏍️'), label: t('bottom_nav.dashboard') },
      fourth: { page: 'AgentEarnings',  icon: emojiIcon('💰'), label: t('bottom_nav.earnings') },
    },
    // No dedicated service-provider dashboard/inbox page exists yet (no
    // operational entity behind this type — see services.service.ts) —
    // MyServices (manage own ads) is the closest thing to their own
    // dashboard, since it's the one surface that's actually theirs to run.
    service_provider: {
      first,
      second: { page: 'MyServices', icon: emojiIcon('🔧'), label: t('bottom_nav.my_services') },
      fourth: { page: 'Activity',   icon: ActivityIcon,    label: t('bottom_nav.activity') },
    },
  };
};

const BottomNav = ({ currentPage, onNavigate, isLoggedIn, currentUser, onPostClick,
  activeProfile, onOpenSwitcher, myProfiles, inboxUnread }) => {
  const { t } = useTranslation();
  let cfg = TYPE_TABS(t)[activeProfile?.type] || TYPE_TABS(t).personal;

  // Multi-role architecture Phase 2: a BUSINESS-type profile only gets the
  // Seller dashboard/inbox tabs once it has actually activated Seller
  // (activeProfile.sellerProfileId set) -- a Business created via
  // POST /business/create with no Seller must never get a one-tap path to
  // Ship Item/Products/Payouts just for being a Business (spec: "Ship
  // Product must never appear merely because someone is a Business").
  // Tab 4 routes to SellerInbox — the same page BusinessDashboard.js's own
  // Messages row uses — not back to BusinessDashboard itself. It used to
  // duplicate `second`'s destination, which produced two tabs sharing one
  // React key (the exact "must never have two tabs with the same key"
  // regression this component now guards against below) and made the
  // messages tab visibly do nothing when tapped from the dashboard.
  if (activeProfile?.type === 'business' && !activeProfile?.sellerProfileId) {
    cfg = {
      ...cfg,
      second: { page: 'BusinessDashboard', icon: emojiIcon('🏢'), label: t('bottom_nav.dashboard') },
      fourth: { page: 'SellerInbox', icon: emojiIcon('💬'), label: t('bottom_nav.messages') },
    };
  }

  // Built fresh from `cfg` (itself freshly selected from activeProfile.type
  // above) on every render — no useState, no accumulation possible by
  // construction. The dedupe pass below is a defensive safeguard only, in
  // case a future edit to TYPE_TABS/the override above reintroduces a
  // collision like the BusinessDashboard one just fixed.
  const rawTabs = [
    { key: cfg.first.page,  icon: cfg.first.icon,  label: cfg.first.label },
    { key: cfg.second.page, icon: cfg.second.icon, label: cfg.second.label },
    {
      key:   '__POST__',
      icon:  () => (
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: `linear-gradient(135deg, ${B}, #7C3AED)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
          marginTop: -8,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      ),
      label: '',
    },
    { key: cfg.fourth.page, icon: cfg.fourth.icon, label: cfg.fourth.label },
    {
      key:   'MyProfile',
      icon:  (active) => (currentUser?.avatarUrl || currentUser?.logo)
        ? <img src={currentUser.avatarUrl || currentUser.logo} alt=""
            style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover',
              border: active ? `2px solid ${B}` : '2px solid #e2e8f0' }} />
        : (
          <div style={{ width:26, height:26, borderRadius:'50%',
            backgroundColor: active ? B : '#e2e8f0',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 12, fontWeight: 900,
            color: active ? '#fff' : '#64748b',
            border: active ? `2px solid ${B}` : '2px solid #e2e8f0' }}>
            {(currentUser?.name || currentUser?.storeName || 'U').charAt(0).toUpperCase()}
          </div>
        ),
      label: t('nav.profile'),
    },
  ];

  const seenKeys = new Set();
  const tabs = rawTabs.filter(tab => {
    if (seenKeys.has(tab.key)) return false;
    seenKeys.add(tab.key);
    return true;
  });

  // Active-profile pill — the switcher's ONLY entry point, so it must show
  // whenever there's actually something to switch BETWEEN, regardless of
  // which profile happens to be active right now. Gating this on
  // "activeProfile.type !== 'personal'" (an earlier version) made the
  // switcher undiscoverable for anyone starting from — or currently on —
  // their personal profile, which is the default for every account and
  // where most people are most of the time. Sits just above the tab row
  // so it never competes with the 5 fixed tap targets below it.
  const showPill = isLoggedIn && activeProfile && (myProfiles?.length || 0) > 1;

  return (
    <>
      {showPill && (
        <button onClick={onOpenSwitcher}
          style={{
            position: 'fixed', bottom: 66, left: '50%', transform: 'translateX(-50%)',
            zIndex: 999, display: 'flex', alignItems: 'center', gap: 6,
            backgroundColor: '#0F172A', color: '#fff', border: 'none',
            borderRadius: 100, padding: '6px 14px 6px 8px', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)', maxWidth: '80vw',
          }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            backgroundColor: '#1E293B', overflow: 'hidden', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
            {activeProfile.photoUrl
              ? <img src={activeProfile.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : (PROFILE_TYPE_ICON[activeProfile.type] || '👤')}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeProfile.displayName}
          </span>
          <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
        </button>
      )}
      <div style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        zIndex:          1000,
        backgroundColor: '#fff',
        borderTop:       '1px solid #f1f5f9',
        boxShadow:       '0 -4px 20px rgba(0,0,0,0.06)',
        display:         'flex',
        alignItems:      'center',
        height:          60,
        paddingBottom:   'env(safe-area-inset-bottom)',
      }}>
        {tabs.map(tab => {
          const isActive = currentPage === tab.key;
          const isPost   = tab.key === '__POST__';

          return (
            <button
              key={tab.key}
              onClick={() => {
                if (isPost) {
                  if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
                  onPostClick?.();
                } else if (tab.key === 'MyProfile') {
                  onNavigate(isLoggedIn ? 'MyProfile' : 'PublicLogin');
                } else if (tab.key === 'Activity') {
                  onNavigate(isLoggedIn ? 'Activity' : 'PublicLogin');
                } else {
                  onNavigate(tab.key);
                }
              }}
              style={{
                flex:            1,
                border:          'none',
                background:      'none',
                cursor:          'pointer',
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             2,
                padding:         isPost ? '0 0 8px' : '8px 0',
                position:        'relative',
              }}
            >
              {tab.icon(isActive)}
              {/* Sourced from App.js's inboxUnread — GET /business/inbox/unread-count,
                  the same combined seller+buyer conversation count SellerInbox.js
                  itself reflects, never the unrelated generic notifications count
                  other badges in the app read (see that endpoint's own comment for
                  why those two numbers were never the same thing). */}
              {tab.key === 'SellerInbox' && inboxUnread > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: '28%',
                  minWidth: 15, height: 15, padding: '0 3px', borderRadius: 100,
                  backgroundColor: '#DC2626', color: '#fff',
                  fontSize: 9, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
                }}>
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
              {tab.label ? (
                <span style={{
                  fontSize:   9,
                  fontWeight: isActive ? 800 : 600,
                  color:      isActive ? B : '#94a3b8',
                  letterSpacing: 0.3,
                }}>
                  {tab.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default BottomNav;
