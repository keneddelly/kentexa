import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import { getPhonePosition } from '../../utils/phoneLocation';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const BecomeSuperAgentInfo = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole, onRefreshContext }) => {
  const { t } = useTranslation();
  const step = 'info';
  const [existingProfile, setExistingProfile] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  // The account's ID (utils/identityState): sent in = may apply; the admin
  // approves the office only once it is verified.
  const [identityStatus, setIdentityStatus] = useState(null);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn) return;
    api.get('/identity/me').then((r) => setIdentityStatus(r.data)).catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
  }, [isLoggedIn]);
  const needsId = isLoggedIn && needsIdentityStep(identityStatus);
  const idWaiting = isLoggedIn && identityState(identityStatus) === 'waiting';
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  // The office's place comes from the place list and its map point from the
  // phone's GPS (both required); the phone is the account's, not asked again.
  const [form, setForm] = useState({ businessName: '', address: '' });
  const [placeText, setPlaceText] = useState('');
  const [place, setPlace] = useState(null);       // picked place (placeRef + regionName)
  const [point, setPoint] = useState(null);       // { latitude, longitude, accuracyM }
  const [locating, setLocating] = useState(false);
  const accountPhone = currentUser?.phone || '';

  // Pre-fill the name/landmark the platform already knows.
  useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      address:      prev.address      || currentUser.businessLocation || '',
      businessName: prev.businessName || currentUser.storeName        || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const takePoint = async () => {
    setLocating(true); setError('');
    try { setPoint(await getPhonePosition()); }
    catch (err) { setError(err?.code ? t(`pickup_pin.error_${err.code}`) : t('pickup_pin.error_unavailable')); }
    finally { setLocating(false); }
  };

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/super-agents/my-profile')
      .then(res => setExistingProfile(res.data))
      .catch(() => setExistingProfile(null))
      .finally(() => setCheckingStatus(false));
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.businessName.trim()) { setError(t('become_super_agent_info.business_name_required')); return; }
    if (!place?.placeRef) { setError(t('office_signup.place_required')); return; }
    if (!point) { setError(t('office_signup.point_required')); return; }
    if (!isLoggedIn) {
      localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo');
      onNavigate('PublicLogin');
      return;
    }
    try {
      setLoading(true); setError('');
      const res = await api.post('/super-agents/apply', {
        businessName: form.businessName.trim(),
        address: form.address.trim(),
        place: { providerKey: place.placeRef.providerKey, providerPlaceId: place.placeRef.providerPlaceId },
        officePoint: { latitude: point.latitude, longitude: point.longitude, accuracyM: point.accuracyM },
      });
      // A new office waits for admin approval: show its "pending" status here
      // instead of opening an office dashboard it cannot use yet.
      await onRefreshContext?.();
      setExistingProfile({ ...(res.data || {}), status: res.data?.status || 'pending' });
    } catch (err) {
      setError(err?.response?.data?.message || t('become_super_agent_info.submit_failed'));
    } finally { setLoading(false); }
  };

  const statusInfo = existingProfile ? {
    // Waiting for the owner's ID comes first: say so instead of "24-48 hours".
    pending:   identityState(identityStatus) !== 'verified'
      ? { icon: '⏳', color: '#f59e0b', title: t('work_roles.status_waiting_id'), desc: t('office_signup.status_waiting_id_desc') }
      : { icon: '⏳', color: '#f59e0b', title: t('become_super_agent_info.status_pending_title'), desc: t('become_super_agent_info.status_pending_desc') },
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
        ) : !existingProfile && needsId ? (
          <div data-testid="office-identity-step" style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{t('office_signup.identity_title')}</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
              {identityState(identityStatus) === 'rejected' ? t('agent_signup.identity_rejected') : t('office_signup.identity_desc')}
            </div>
            <button onClick={() => setShowVerifyIdentity(true)}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
              {t('agent_signup.identity_button')}
            </button>
          </div>
        ) : !existingProfile ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_super_agent_info.form_title')}</h3>
            {idWaiting && (
              <div role="status" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
                <strong>{t('identity_state.waiting_title')}</strong><br />{t('office_signup.identity_waiting_note')}
              </div>
            )}

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
                <IntelligentLocationInput label={t('office_signup.place_label')} value={placeText} onTextChange={setPlaceText}
                  onResolved={setPlace} placeholder={t('office_signup.place_placeholder')} required />
                {place?.regionName && <div style={{ fontSize: 12, color: '#16a34a', marginTop: -6 }}>✔ {place.regionName}</div>}
              </div>

              <div data-testid="office-signup-point">
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>{t('office_point.explain')}</div>
                <button type="button" onClick={takePoint} disabled={locating}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 800,
                    background: point ? '#ecfdf5' : '#ea580c', color: point ? '#065f46' : '#fff' }}>
                  {locating ? t('pickup_pin.locating') : point ? `✔ ${t('office_signup.point_taken', { m: Math.round(point.accuracyM || 0) })}` : t('office_point.button')}
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{t('office_signup.landmark_label')}</label>
                <textarea rows={2} placeholder={t('become_super_agent_info.address_placeholder')}
                  value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {isLoggedIn && (
                <div style={{ fontSize: 12, color: '#475569' }}>📞 {t('office_signup.phone_from_account', { phone: accountPhone || '—' })}</div>
              )}

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
        <VerifyIdentityModal onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); setIdentityStatus((p) => afterIdentitySent(p)); }} />
      )}

    </div>
  );
};

export default BecomeSuperAgentInfo;