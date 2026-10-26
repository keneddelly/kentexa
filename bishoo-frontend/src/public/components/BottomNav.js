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
import { personalOperationalText } from '../utils/publicActor';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { itemsForRole } from '../../navigation/navigationRegistry';
import { isAppleMobile } from '../utils/isAppleMobile';

/**
 * Space a page must leave at its bottom so nothing sits under the bottom menu: the
 * 60px bar, the profile pill above it (bottom 66px, ~34px tall) and the phone's own
 * bottom area (safe-area inset). A long form's last button stays reachable on every phone.
 */
export const BOTTOM_NAV_CLEARANCE = 'calc(124px + env(safe-area-inset-bottom, 0px))';

// Twitter-style tab icons (owner 2026-10-26: "the bottom nav icons look like emoji"):
// one line-icon set, ink when active (and a little bolder), grey otherwise. No emoji.
const B = '#1d4ed8';
const INK = '#0f1419';
const MUTED = '#536471';

const ICON_PATHS = {
  home:      'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
  search:    'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  inbox:     'M4 5h16v11H8l-4 4z',
  dashboard: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  agent:     'M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM8 15h6l3-5h-4M10 7h3l1 3',
  hub:       'M4 21V5l8-2 8 2v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2',
  transport: 'M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  services:  'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5z',
  admin:     'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  dot:       'M12 13a1 1 0 100-2 1 1 0 000 2z',
};
const lineIcon = (name) => (active) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke={active ? INK : MUTED} strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={ICON_PATHS[name]} />
  </svg>
);

// The profile pill shows the active profile's kind as a small line icon.
const PROFILE_TYPE_ICON = {
  personal: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  business: ICON_PATHS.hub, hub: ICON_PATHS.hub,
  transport_provider: ICON_PATHS.transport, agent: ICON_PATHS.agent,
  service_provider: ICON_PATHS.services, brand: 'M20 12l-8 8-9-9V3h8zM7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
};

const CAPABILITY_LABEL_BY_ROLE = {
  seller: 'business_home.tile_commerce',
  transport_provider: 'business_home.tile_transport',
  super_agent: 'business_home.tile_super_agent',
  // I2A: was missing entirely, so an organizationally-bound Service
  // Provider role fell through to the generic 'profile_switcher.type_business'
  // label instead of "Washing Machine TZ · Services" -- matches
  // businessGrouping.js's own CAPABILITY_LABEL_BY_ROLE, which already had
  // this entry for the profile-switcher sheet.
  service_provider: 'profile_switcher.type_service',
};

const BottomNav = ({ currentPage, onNavigate, isLoggedIn, currentUser, onPostClick,
  activeProfile, activeContext, activeBusinessName, onOpenSwitcher, myProfiles, inboxUnread }) => {
  const { t } = useTranslation();
  const semanticIcon = {
    home: lineIcon('home'), search: lineIcon('search'), inbox: lineIcon('inbox'), dashboard: lineIcon('dashboard'),
    agent: lineIcon('agent'), hub: lineIcon('hub'), transport: lineIcon('transport'),
    services: lineIcon('services'), admin: lineIcon('admin'),
  };
  const rawTabs = itemsForRole(activeContext?.roleType).map(entry => {
    if (entry.destination === '__POST__') return {
      key: '__POST__', icon: () => (
        <div style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: B,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      ),
      label: '',
    };
    if (entry.destination === 'MyProfile') return {
      key: 'MyProfile', icon: (active) => (currentUser?.avatarUrl || currentUser?.logo)
        ? <img src={currentUser.avatarUrl || currentUser.logo} alt=""
            style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', boxSizing:'border-box',
              border: active ? `2px solid ${INK}` : '2px solid transparent' }} />
        : (
          <div style={{ width:28, height:28, borderRadius:'50%', boxSizing:'border-box',
            backgroundColor: active ? INK : '#cfd9de',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 13, fontWeight:800, color: '#fff' }}>
            {(currentUser?.name || currentUser?.storeName || 'U').charAt(0).toUpperCase()}
          </div>
        ),
      label: t(entry.labelKey),
    };
    return { key: entry.destination, icon: semanticIcon[entry.iconId] || lineIcon('dot'), label: t(entry.labelKey) };
  });

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
            position: 'fixed', bottom: isAppleMobile() ? 'calc(66px + env(safe-area-inset-bottom, 0px))' : 66,
            left: '50%', transform: 'translateX(-50%)',
            zIndex: 999, display: 'flex', alignItems: 'center', gap: 6,
            backgroundColor: INK, color: '#fff', border: 'none',
            borderRadius: 100, padding: '6px 14px 6px 8px', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)', maxWidth: '80vw',
          }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            backgroundColor: '#1E293B', overflow: 'hidden', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
            {activeProfile.photoUrl
              ? <img src={activeProfile.photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={PROFILE_TYPE_ICON[activeProfile.type] || PROFILE_TYPE_ICON.personal} />
                </svg>
              )}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {/* Business-First Frontend Stage 1: "Bishoo Intelligence
                Systems · Commerce" once the active AccountRole is
                organizationally bound, instead of just "Seller" --
                presentation only, activeBusinessName is resolved
                server-side (roleOptions), never asserted here. */}
            {activeBusinessName
              ? `${activeBusinessName} · ${t(CAPABILITY_LABEL_BY_ROLE[activeContext?.roleType] || 'profile_switcher.type_business')}`
              : personalOperationalText(activeProfile, t)}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ opacity: 0.8 }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
      <div style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        zIndex:          1000,
        backgroundColor: '#fff',
        borderTop:       '1px solid #eff3f4',
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
              data-tour={tab.key === 'MyProfile' ? 'bottomnav-profile' : undefined}
              aria-label={isPost ? 'Tengeneza' : tab.label || undefined}
              aria-current={isActive ? 'page' : undefined}
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
                padding:         '6px 0',
                minHeight:       52,
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
                  position: 'absolute', top: 2, right: '26%',
                  minWidth: 18, height: 18, padding: '0 4px', borderRadius: 100, boxSizing: 'border-box',
                  backgroundColor: B, color: '#fff', border: '2px solid #fff',
                  fontSize: 10, fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                }}>
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
              {tab.label ? (
                <span style={{
                  fontSize:   11,
                  fontWeight: isActive ? 700 : 500,
                  color:      isActive ? INK : MUTED,
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
