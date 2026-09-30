import React from 'react';
import { useTranslation } from 'react-i18next';

const actions = [
  { key: 'listing', destination: 'CreateClassified' },
  { key: 'service', destination: 'PostService' },
  { key: 'business', destination: 'BecomeBusiness' },
];

const ActionIcon = ({ type }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    {type === 'listing' && <><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" /><path d="M16 2v6m-3-3h6M7 11h7M7 15h10" /></>}
    {type === 'service' && <><path d="M14.5 6.5a5 5 0 0 0-6-4l3 3-3 3-3-3a5 5 0 0 0 4 6L18 20a2 2 0 0 0 3-3l-8.5-8.5" /></>}
    {type === 'business' && <><path d="M3 10l2-7h14l2 7M4 13v8h16v-8M9 21v-6h6v6" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 3v7m6-7v7" /></>}
  </svg>
);

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
            gap: 5, minHeight: 56, minWidth: 0, padding: '8px 4px', border: 'none',
            borderRadius: 8, background: 'transparent', color: '#1d4ed8', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 700, lineHeight: 1.35, cursor: 'pointer', overflowWrap: 'anywhere' }}>
          <ActionIcon type={action.key} />
          <span>{t(`home_quick_actions.${action.key}`)}</span>
        </button>
      ))}
    </nav>
  );
}
