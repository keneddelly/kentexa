/**
 * BottomNav.js — Instagram-style 5-tab bottom navigation
 * Place at: src/public/components/BottomNav.js
 *
 * Tabs: Home | Explore | Post(+) | Activity | Profile
 * Role-aware: same tabs for everyone, profile content changes by role
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

const B = '#2563EB';

const BottomNav = ({ currentPage, onNavigate, isLoggedIn, userRole, currentUser, onPostClick }) => {
  const { t } = useTranslation();
  const tabs = [
    {
      key:   'Home',
      icon:  (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? B : 'none'}
          stroke={active ? B : '#64748b'} strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9,22 9,12 15,12 15,22"/>
        </svg>
      ),
      label: t('nav.home'),
    },
    {
      key:   'Search',
      icon:  (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke={active ? B : '#64748b'} strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
      label: t('common.search'),
    },
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
    {
      key:   'Activity',
      icon:  (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? B : 'none'}
          stroke={active ? B : '#64748b'} strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      ),
      label: t('bottom_nav.activity'),
    },
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

  return (
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
  );
};

export default BottomNav;