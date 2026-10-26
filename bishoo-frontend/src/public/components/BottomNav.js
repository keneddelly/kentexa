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

// Instagram-style tab icons (owner 2026-10-26: "more bold and professional, like
// Instagram"): one bold set, always ink; the tab you are on is drawn SOLID (filled),
// the others as a 2px outline. Shapes are closed so the solid version reads well. No emoji.
const B = '#1d4ed8';
const INK = '#0f1419';

// d: the shape (outline when idle, filled when active). cut: detail drawn in white on
// top of the filled shape (a door, windows) so the solid icon keeps its meaning.
const ICONS = {
  home:      { d: 'M3.5 10.2L12 3.3l8.5 6.9V20a1 1 0 01-1 1h-5v-6.5h-5V21h-5a1 1 0 01-1-1z' },
  search:    { d: 'M10.8 18.1a7.3 7.3 0 100-14.6 7.3 7.3 0 000 14.6zM16.2 16.2L21 21', stroke: true },
  inbox:     { d: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z' },
  dashboard: { d: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z' },
  agent:     { d: 'M12 21.5s-7-6.3-7-11.8a7 7 0 0114 0c0 5.5-7 11.8-7 11.8z', cut: 'M12 12.4a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z' },
  hub:       { d: 'M4 21V6.2L12 3l8 3.2V21h-6v-5h-4v5z', cut: 'M8 9h2M14 9h2M8 12.5h2M14 12.5h2' },
  transport: { d: 'M2.5 6.5h11.5v9.5H2.5zM14 9.5h4l3.5 3.5V16H14z', cut: null, wheels: true },
  services:  { d: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5z' },
  admin:     { d: 'M12 3l7.5 3v5.2c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V6z', cut: 'M8.8 12l2.2 2.2 4.2-4.4' },
  dot:       { d: 'M12 14a2 2 0 100-4 2 2 0 000 4z' },
};
const boldIcon = (name) => (active) => {
  const ic = ICONS[name] || ICONS.dot;
  const solid = active && !ic.stroke;
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={ic.d} fill={solid ? INK : 'none'} stroke={INK} strokeWidth={ic.stroke && active ? 3 : 2} />
      {ic.wheels && (
        <>
          <circle cx="6.5" cy="18" r="2" fill={active ? INK : '#fff'} stroke={INK} strokeWidth="2" />
          <circle cx="17.5" cy="18" r="2" fill={active ? INK : '#fff'} stroke={INK} strokeWidth="2" />
        </>
      )}
      {ic.cut && <path d={ic.cut} stroke={solid ? '#fff' : INK} strokeWidth="2" fill="none" />}
    </svg>
  );
};

const ICON_PATHS = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, v.d]));

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
    home: boldIcon('home'), search: boldIcon('search'), inbox: boldIcon('inbox'), dashboard: boldIcon('dashboard'),
    agent: boldIcon('agent'), hub: boldIcon('hub'), transport: boldIcon('transport'),
    services: boldIcon('services'), admin: boldIcon('admin'),
  };
  const rawTabs = itemsForRole(activeContext?.roleType).map(entry => {
    if (entry.destination === '__POST__') return {
      key: '__POST__', icon: () => (
        <svg width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5.5" />
          <path d="M12 8v8M8 12h8" />
        </svg>
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
    return { key: entry.destination, icon: semanticIcon[entry.iconId] || boldIcon('dot'), label: t(entry.labelKey) };
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
                  backgroundColor: '#ff3040', color: '#fff', border: '2px solid #fff',
                  fontSize: 10, fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                }}>
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
              {/* Small words under the bold icons (owner 2026-10-26: "keep small words"). */}
              {tab.label ? (
                <span style={{ fontSize: 11, lineHeight: '13px', fontWeight: isActive ? 700 : 500, color: INK, opacity: isActive ? 1 : 0.75 }}>
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
