import React from 'react';
import { useTranslation } from 'react-i18next';

// The auth-first entry screen — App.js's `case 'Home':` renders this instead
// of HomeFeed for a logged-out visitor. Pure routing into the existing
// PublicLogin.js/Register.js pages, no auth logic of its own.
const Welcome = ({ onNavigate }) => {
  const { t } = useTranslation();

  const btnPrimary = {
    width: '100%', padding: 15,
    background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(29,78,216,0.35)',
  };

  const btnSecondary = {
    width: '100%', padding: 15,
    backgroundColor: '#fff', color: '#1d4ed8',
    border: '2px solid #dbeafe', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4ff', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'Inter','Segoe UI',sans-serif",
      paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
      paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>

      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 28 }}>

        {/* Logo + icon badge — same treatment used across Navbar/Sidebar/PublicLogin */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, backgroundColor: '#1d4ed8', borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(29,78,216,0.4)' }}>
            <svg width="36" height="36" viewBox="0 0 22 22" fill="none">
              <path d="M3 3 L9 11 L3 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M9 3 L3 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <path d="M12 3 L19 11 L12 19" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M19 3 L12 11" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 34, fontWeight: 900, color: '#1d4ed8', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
        </div>

        {/* Pitch */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', lineHeight: 1.3 }}>
            {t('welcome.headline')}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            {t('welcome.subheadline')}
          </p>
        </div>

        {/* Actions */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => onNavigate('Register')} style={btnPrimary}>
            {t('welcome.create_account_button')}
          </button>
          <button onClick={() => onNavigate('PublicLogin')} style={btnSecondary}>
            {t('welcome.log_in_button')}
          </button>
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
          {t('welcome.made_in_tanzania')}
        </div>
      </div>
    </div>
  );
};

export default Welcome;
