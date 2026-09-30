import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const CITIES = ['Dar es Salaam','Mwanza','Arusha','Mbeya','Dodoma','Tanga','Morogoro','Zanzibar','Kigoma','Shinyanga','Tabora','Iringa','Mtwara','Lindi','Musoma','Bukoba','Sumbawanga','Songea','Kahama','Moshi','Geita','Singida'];
const button = { border: 'none', borderRadius: 12, padding: '14px 18px', fontSize: 16, fontWeight: 800, cursor: 'pointer', background: '#2563eb', color: '#fff', minHeight: 48 };

const Onboarding = ({ onNavigate, currentUser, onUserUpdated }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [city, setCity] = useState(currentUser?.city || '');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/profiles/onboarding/suggestions', { params: { city } })
      .then(res => { if (!cancelled) setProfiles(res.data || []); })
      .catch(() => { if (!cancelled) setError(t('onboarding.suggestions_error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [step, city, reload, t]);

  const follow = async profile => {
    if (pending !== null) return;
    setPending(profile.id); setError('');
    try {
      const res = await api.post(`/profiles/${profile.id}/follow`);
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, isFollowing: !!res.data.following } : p));
    } catch { setError(t('onboarding.follow_error')); }
    finally { setPending(null); }
  };

  const finish = async () => {
    if (saving || pending !== null) return;
    setSaving(true); setError('');
    try {
      const res = await api.patch(`/users/${currentUser.id}`, { onboardingCompleted: true, ...(city ? { city } : {}) });
      onUserUpdated?.({ ...currentUser, ...res.data, onboardingCompleted: true });
      const intended = localStorage.getItem('kentexa_after_login');
      if (intended) localStorage.removeItem('kentexa_after_login');
      onNavigate(intended || 'Home');
    } catch { setError(t('onboarding.finish_error')); }
    finally { setSaving(false); }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif', color: '#0f172a' }}>
      <div style={{ height: 4, background: '#dbeafe' }}>
        <div style={{ height: '100%', width: `${step * 50}%`, background: '#2563eb' }} />
      </div>
      <div style={{ maxWidth: 480, padding: '24px 20px', margin: 'auto' }}>
        <p style={{ fontSize: 14, color: '#64748b' }}>{t('onboarding.step_indicator', { step, total: 2 })}</p>
        {step === 1 ? (
          <>
            <h1 style={{ fontSize: 26 }}>{t('onboarding.greeting', { name: currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : '' })}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.6 }}>{t('onboarding.local_city_desc')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CITIES.map(value => (
                <button key={value} type="button" onClick={() => setCity(value)} aria-pressed={city === value}
                  style={{ ...button, background: city === value ? '#eff6ff' : '#fff', color: city === value ? '#2563eb' : '#0f172a', border: `2px solid ${city === value ? '#2563eb' : '#e2e8f0'}`, textAlign: 'left' }}>
                  {value}
                </button>
              ))}
            </div>
            <button type="button" disabled={!city} onClick={() => setStep(2)} style={{ ...button, width: '100%', marginTop: 24, opacity: city ? 1 : 0.5 }}>{t('onboarding.continue_button')}</button>
            <button type="button" onClick={() => { setCity(''); setStep(2); }} style={{ ...button, width: '100%', marginTop: 8, background: 'transparent', color: '#64748b' }}>{t('onboarding.skip_for_now')}</button>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26 }}>{t('onboarding.curated_title')}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.6 }}>{t('onboarding.curated_desc')}</p>
            <button type="button" onClick={() => setStep(1)} disabled={pending !== null || saving} style={{ ...button, background: 'transparent', color: '#2563eb', paddingLeft: 0 }}>{city || t('onboarding.choose_city')} · {t('onboarding.change_city')}</button>
            {loading && <p role="status">{t('onboarding.loading_sellers')}</p>}
            {!loading && profiles.map(profile => (
              <div key={profile.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #dbeafe', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#eff6ff', overflow: 'hidden', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 900, color: '#2563eb' }}>
                  {profile.photoUrl ? <img src={profile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : profile.displayName?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{profile.displayName}</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                    {profile.isOfficialPlatformProfile ? t('onboarding.official_page') : profile.location || `@${profile.username}`}
                  </div>
                  {profile.isLocalSuggestion && <div style={{ fontSize: 14, color: '#2563eb', marginTop: 4 }}>{t('onboarding.in_your_city')}</div>}
                </div>
                <button type="button" disabled={pending !== null || saving} onClick={() => follow(profile)}
                  style={{ ...button, padding: '12px', background: profile.isFollowing ? '#eff6ff' : '#2563eb', color: profile.isFollowing ? '#2563eb' : '#fff', opacity: pending !== null ? 0.6 : 1 }}>
                  {pending === profile.id ? '…' : t(profile.isFollowing ? 'onboarding.following_button' : 'onboarding.follow_button')}
                </button>
              </div>
            ))}
            {!loading && !profiles.some(p => p.isLocalSuggestion) && <p style={{ fontSize: 14, color: '#64748b' }}>{t('onboarding.no_local_business')}</p>}
            {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 16 }}>{error}<button type="button" onClick={() => setReload(n => n + 1)} style={{ ...button, margin: 8, background: '#fff', color: '#2563eb' }}>{t('onboarding.retry')}</button></div>}
            <button type="button" onClick={finish} disabled={saving || pending !== null} style={{ ...button, width: '100%', marginTop: 24 }}>
              {t(saving ? 'onboarding.saving_button' : 'onboarding.finish_button')}
            </button>
          </>
        )}
      </div>
    </main>
  );
};
export default Onboarding;
