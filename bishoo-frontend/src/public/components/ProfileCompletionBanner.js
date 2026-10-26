import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Seller profile completion progress nudge.
 * Psychology: Zeigarnik effect — incomplete progress bars create
 * a mental "open loop" that pulls people back to finish.
 *
 * Usage in SellerDashboard.js:
 *   import ProfileCompletionBanner from '../components/ProfileCompletionBanner';
 *   ...
 *   <ProfileCompletionBanner profile={profile} onNavigate={onNavigate} />
 */
const ProfileCompletionBanner = ({ profile, onNavigate }) => {
  const { t } = useTranslation();
  if (!profile) return null;

  const checks = [
    { key: 'storeName',        label: t('profile_completion_banner.check_store_name'),     done: !!profile.storeName },
    { key: 'logo',             label: t('profile_completion_banner.check_logo'),    done: !!profile.logo },
    { key: 'storeDescription', label: t('profile_completion_banner.check_description'),  done: !!(profile.storeDescription || profile.businessDescription) },
    { key: 'phone',            label: t('profile_completion_banner.check_phone'),  done: !!(profile.storeWhatsApp || profile.phone) },
    { key: 'address',          label: t('profile_completion_banner.check_address'),           done: !!(profile.businessLocation || profile.address) },
  ];

  const completedCount = checks.filter(c => c.done).length;
  const percent = Math.round((completedCount / checks.length) * 100);

  // Fully complete — don't show the nudge at all
  if (percent === 100) return null;

  const nextStep = checks.find(c => !c.done);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1.5px solid #e0e7ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>
          {t('profile_completion_banner.title', { percent })}
        </div>
        <div style={{ fontSize: 12, fontWeight:800, color: percent >= 75 ? '#16a34a' : percent >= 40 ? '#f59e0b' : '#ef4444' }}>
          {percent}%
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{
          width: `${percent}%`, height: '100%', borderRadius: 8,
          background: percent >= 75 ? 'linear-gradient(90deg,#16a34a,#22c55e)' : percent >= 40 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f87171)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Checklist - compact dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {checks.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: c.done ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 8, flexShrink: 0, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.done ? '#1d4ed8' : 'transparent', border: c.done ? 'none' : '2px solid #cfd9de' }}>{c.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      {nextStep && (
        <button onClick={() => onNavigate('StoreSettings')}
          style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '10px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
          {t('profile_completion_banner.add_next_step', { label: nextStep.label })}
        </button>
      )}
    </div>
  );
};

export default ProfileCompletionBanner;