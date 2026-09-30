import React from 'react';
import { useTranslation } from 'react-i18next';

const actions = [
  { key: 'listing', destination: 'CreateClassified', icon: '📦' },
  { key: 'service', destination: 'PostService', icon: '🛠️' },
  { key: 'business', destination: 'BecomeBusiness', icon: '🏪' },
];

export default function HomeQuickActions({ onNavigate, isLoggedIn = false }) {
  const { t } = useTranslation();
  const open = destination => {
    if (!isLoggedIn) {
      try { localStorage.setItem('kentexa_after_login', destination); } catch { /* storage unavailable */ }
      onNavigate('PublicLogin');
      return;
    }
    onNavigate(destination);
  };
  return (
    <nav aria-label={t('home_quick_actions.label')}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, width: '100%', boxSizing: 'border-box' }}>
      {actions.map(action => (
        <button key={action.key} type="button" onClick={() => open(action.destination)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, minHeight: 84, minWidth: 0, padding: '12px 6px', border: '1px solid #dbeafe',
            borderRadius: 14, background: '#eff6ff', color: '#1d4ed8', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 800, lineHeight: 1.35, cursor: 'pointer', overflowWrap: 'anywhere' }}>
          <span aria-hidden="true" style={{ fontSize: 24 }}>{action.icon}</span>
          <span>{t(`home_quick_actions.${action.key}`)}</span>
        </button>
      ))}
    </nav>
  );
}
