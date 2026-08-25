import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import VerifyIdentityModal from '../components/VerifyIdentityModal';

// Fallback only — the real list is fetched from the backend's canonical
// TANZANIA_CITIES (GET /super-agents/cities) so this page doesn't carry
// its own copy that can drift out of sync.
const FALLBACK_CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Moshi','Dodoma','Mbeya','Tanga','Morogoro',
  'Kigoma','Tabora','Songea','Iringa','Zanzibar','Lindi','Mtwara','Shinyanga',
  'Singida','Musoma','Bukoba','Sumbawanga','Babati','Kibaha','Njombe','Kasulu',
  'Mpanda','Masasi','Korogwe','Geita','Bariadi','Chato','Sengerema',
];

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const BecomeSuperAgentInfo = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [step, setStep]                   = useState('info');  // 'info' | 'form' | 'done'
  const [existingProfile, setExistingProfile] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [form, setForm] = useState({
    businessName: '', city: '', address: '', phone: '',
  });
  const [cities, setCities] = useState(FALLBACK_CITIES);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);

  useEffect(() => {
    api.get('/super-agents/cities')
      .then(res => { if (Array.isArray(res.data?.cities) && res.data.cities.length) setCities(res.data.cities); })
      .catch(() => {});
  }, []);

  // Pre-fill from profile — the platform already knows this person's
  // phone/city/store name if they've set them elsewhere; don't make them
  // re-type it.
  useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      phone:        prev.phone        || currentUser.phone           || '',
      city:         prev.city         || currentUser.city             || '',
      address:      prev.address      || currentUser.businessLocation || '',
      businessName: prev.businessName || currentUser.storeName        || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/super-agents/my-profile')
      .then(res => setExistingProfile(res.data))
      .catch(() => setExistingProfile(null))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.businessName.trim()) { setError(t('become_super_agent_info.business_name_required')); return; }
    if (!form.city) { setError(t('become_super_agent_info.city_required')); return; }
    if (!form.phone.trim()) { setError(t('become_super_agent_info.phone_required')); return; }
    if (!form.address.trim()) { setError(t('become_super_agent_info.address_required')); return; }
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo');
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true); setError('');
      await api.post('/super-agents/apply', form);
      setStep('done');
    } catch (err) {
      // Applying requires Level 1 identity verification — show the inline
      // flow instead of a plain error so the filled-in form is never lost.
      if (err?.response?.data?.code === 'VERIFICATION_REQUIRED') {
        setShowVerifyIdentity(true);
        return;
      }
      setError(err?.response?.data?.message || t('become_super_agent_info.submit_failed'));
    } finally { setLoading(false); }
  };

  const statusInfo = existingProfile ? {
    pending:   { icon: '⏳', color: '#f59e0b', title: t('become_super_agent_info.status_pending_title'), desc: t('become_super_agent_info.status_pending_desc') },
    active:    { icon: '✅', color: '#16a34a', title: t('become_super_agent_info.status_active_title'), desc: t('become_super_agent_info.status_active_desc', { code: existingProfile.agentCode || '—', city: existingProfile.city }) },
    suspended: { icon: '🚫', color: '#dc2626', title: t('become_super_agent_info.status_suspended_title'), desc: existingProfile.rejectionReason || t('become_super_agent_info.status_default_desc') },
    blocked:   { icon: '⛔', color: '#dc2626', title: t('become_super_agent_info.status_blocked_title'), desc: existingProfile.rejectionReason || t('become_super_agent_info.status_default_desc') },
  }[existingProfile.status] : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <BackBar onBack={() => onNavigate('Home')} title={t('become_super_agent_info.page_title')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🏢</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>
          {t('become_super_agent_info.hero_title')}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
          {t('become_super_agent_info.hero_desc')}
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {/* Show existing profile status */}
        {!checkingStatus && existingProfile && statusInfo && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{statusInfo.icon}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>{statusInfo.title}</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>{statusInfo.desc}</p>
            {existingProfile.status === 'active' && (
              <button onClick={() => onNavigate('SuperAgentDashboard')}
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                {t('become_super_agent_info.go_to_dashboard_button')}
              </button>
            )}
          </div>
        )}

        {/* Benefits */}
        {(!existingProfile || step === 'info') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_super_agent_info.benefits_title')}</h3>
            {[
              { icon: '💰', title: t('become_super_agent_info.benefit1_title'), desc: t('become_super_agent_info.benefit1_desc') },
              { icon: '🌍', title: t('become_super_agent_info.benefit2_title'), desc: t('become_super_agent_info.benefit2_desc') },
              { icon: '📱', title: t('become_super_agent_info.benefit3_title'), desc: t('become_super_agent_info.benefit3_desc') },
              { icon: '🚀', title: t('become_super_agent_info.benefit4_title'), desc: t('become_super_agent_info.benefit4_desc') },
              { icon: '🤝', title: t('become_super_agent_info.benefit5_title'), desc: t('become_super_agent_info.benefit5_desc') },
            ].map(b => (
              <div key={b.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, flexShrink: 0, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{b.desc}</div>
                </div>
              </div>
            ))}

            {/* Earnings example */}
            <div style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>{t('become_super_agent_info.earnings_example_title')}</div>
              {[
                [t('become_super_agent_info.earnings_line1_label'), t('become_super_agent_info.earnings_line1_value')],
                [t('become_super_agent_info.earnings_line2_label'), t('become_super_agent_info.earnings_line2_value')],
                [t('become_super_agent_info.earnings_line3_label'), t('become_super_agent_info.earnings_line3_value')],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{v}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #bfdbfe', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 13 }}>
                <span style={{ color: '#1e293b' }}>{t('become_super_agent_info.earnings_total_label')}</span>
                <span style={{ color: '#16a34a' }}>{t('become_super_agent_info.earnings_total_value')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Requirements */}
        {(!existingProfile || step === 'info') && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>{t('become_super_agent_info.requirements_title')}</h3>
            {[
              t('become_super_agent_info.req1'),
              t('become_super_agent_info.req2'),
              t('become_super_agent_info.req3'),
              t('become_super_agent_info.req4'),
              t('become_super_agent_info.req5'),
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: '#475569' }}>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Application form */}
        {step === 'done' ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', margin: '0 0 8px' }}>{t('become_super_agent_info.done_title')}</h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>
              {t('become_super_agent_info.done_desc')}
            </p>
            <button onClick={() => onNavigate('Home')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
              {t('become_super_agent_info.back_home_button')}
            </button>
          </div>
        ) : !existingProfile ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_super_agent_info.form_title')}</h3>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('become_super_agent_info.business_name_label')}</label>
                <input type="text" placeholder="e.g. Geita Express Hub"
                  value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })}
                  style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('become_super_agent_info.city_label')}</label>
                <select value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} style={inputStyle}>
                  <option value="">{t('become_super_agent_info.select_city_placeholder')}</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {t('become_super_agent_info.city_hint')}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('become_super_agent_info.address_label')}</label>
                <textarea rows={2} placeholder={t('become_super_agent_info.address_placeholder')}
                  value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('become_super_agent_info.phone_label')}</label>
                <input type="tel" placeholder="255712345678"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  style={inputStyle} />
              </div>

              {!isLoggedIn && (
                <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                  💡 {t('become_super_agent_info.login_required_pre')}{' '}
                  <span onClick={() => { localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo'); onNavigate('PublicLogin'); }}
                    style={{ color: '#d97706', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}>
                    {t('become_super_agent_info.login_required_link')}
                  </span>
                  {' '}{t('become_super_agent_info.login_required_post')}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                style={{ width: '100%', background: loading ? '#64748b' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, boxShadow: '0 4px 12px rgba(29,78,216,0.3)' }}>
                {loading ? t('become_super_agent_info.submitting') : t('become_super_agent_info.submit_button')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showVerifyIdentity && (
        <VerifyIdentityModal
          onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); handleSubmit(); }}
        />
      )}
    </div>
  );
};

export default BecomeSuperAgentInfo;