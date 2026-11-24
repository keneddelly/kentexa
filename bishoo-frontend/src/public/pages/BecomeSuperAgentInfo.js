import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApplyPage, ErrorText, Field, InfoRows, K, Note, Section, inputStyle, pillStyle } from '../components/ApplyKit';
import api from '../../api/api';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import { identityState, needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import { openRolePage } from '../../utils/workRoles';


const BecomeSuperAgentInfo = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole, onRefreshContext, availableRoles, onSwitchAccountRole }) => {
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
  // The office's place comes from the place list. Its GPS point is not asked here: the
  // office sets it later, at the office, from the dashboard banner. The phone is the account's.
  const [form, setForm] = useState({ businessName: '', address: '' });
  const [placeText, setPlaceText] = useState('');
  const [place, setPlace] = useState(null);       // picked place (placeRef + regionName)
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
      ? { title: t('work_roles.status_waiting_id'), desc: t('office_signup.status_waiting_id_desc') }
      : { title: t('become_super_agent_info.status_pending_title'), desc: t('become_super_agent_info.status_pending_desc') },
    active:    { title: t('become_super_agent_info.status_active_title'), desc: t('become_super_agent_info.status_active_desc', { code: existingProfile.agentCode || '—', city: existingProfile.city }) },
    suspended: { title: t('become_super_agent_info.status_suspended_title'), desc: existingProfile.rejectionReason || t('become_super_agent_info.status_default_desc') },
    blocked:   { title: t('become_super_agent_info.status_blocked_title'), desc: existingProfile.rejectionReason || t('become_super_agent_info.status_default_desc') },
  }[existingProfile.status] : null;

  return (
    <ApplyPage onBack={() => onNavigate('Home')} backTitle={t('become_super_agent_info.page_title')}
      title={t('become_super_agent_info.hero_title')} desc={t('become_super_agent_info.hero_desc')}>

      {/* The office's own status */}
      {!checkingStatus && existingProfile && statusInfo && (
        <Section>
          <Note tone={existingProfile.status === 'active' ? 'green' : existingProfile.status === 'pending' ? 'grey' : 'amber'}>
            <b style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>{statusInfo.title}</b>{statusInfo.desc}
          </Note>
          {existingProfile.status === 'active' && (
            <button type="button" onClick={() => openRolePage({ roleType: 'super_agent', page: 'SuperAgentDashboard', availableRoles, onNavigate, onSwitchAccountRole })} style={pillStyle()}>
              {t('become_super_agent_info.go_to_dashboard_button')}
            </button>
          )}
        </Section>
      )}

      {/* Application form first */}
      {step === 'done' ? (
        <Section>
          <Note tone="green"><b style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>{t('become_super_agent_info.done_title')}</b>{t('become_super_agent_info.done_desc')}</Note>
          <button type="button" onClick={() => onNavigate('Home')} style={pillStyle()}>{t('become_super_agent_info.back_home_button')}</button>
        </Section>
      ) : !existingProfile && needsId ? (
        <Section title={t('office_signup.identity_title')} testId="office-identity-step">
          <p style={{ margin: 0, fontSize: 15, color: K.MUTED, lineHeight: 1.45 }}>
            {identityState(identityStatus) === 'rejected' ? t('agent_signup.identity_rejected') : t('office_signup.identity_desc')}
          </p>
          <button type="button" onClick={() => setShowVerifyIdentity(true)} style={pillStyle()}>{t('agent_signup.identity_button')}</button>
        </Section>
      ) : !existingProfile ? (
        <Section title={t('become_super_agent_info.form_title')}>
          {idWaiting && (
            <Note tone="amber"><b>{t('identity_state.waiting_title')}</b><br />{t('office_signup.identity_waiting_note')}</Note>
          )}
          <Field label={t('become_super_agent_info.business_name_label')}>
            <input type="text" placeholder="mf. Geita Express Hub" value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} style={inputStyle} />
          </Field>
          <div>
            <IntelligentLocationInput label={t('office_signup.place_label')} value={placeText} onTextChange={setPlaceText}
              onResolved={setPlace} placeholder={t('office_signup.place_placeholder')} required />
            {place?.regionName && <div style={{ fontSize: 13, color: K.GREEN, marginTop: -6 }}>{place.regionName}</div>}
          </div>
          <Field label={t('office_signup.landmark_label')}>
            <textarea rows={2} placeholder={t('become_super_agent_info.address_placeholder')} value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          {isLoggedIn && <span style={{ fontSize: 14, color: K.MUTED }}>{t('office_signup.phone_from_account', { phone: accountPhone || '—' })}</span>}
          {!isLoggedIn && (
            <Note tone="amber">
              {t('become_super_agent_info.login_required_pre')}{' '}
              <button type="button" onClick={() => { localStorage.setItem('kentexa_after_login', 'BecomeSuperAgentInfo'); onNavigate('PublicLogin'); }}
                style={{ border: 'none', background: 'none', padding: 0, color: K.BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                {t('become_super_agent_info.login_required_link')}
              </button>
              {' '}{t('become_super_agent_info.login_required_post')}
            </Note>
          )}
          <ErrorText>{error}</ErrorText>
          <button type="button" onClick={handleSubmit} disabled={loading} style={pillStyle(true, loading)}>
            {loading ? t('become_super_agent_info.submitting') : t('become_super_agent_info.submit_button')}
          </button>
        </Section>
      ) : null}

      {/* Benefits and requirements (the old "earnings example" figures are gone: no invented numbers) */}
      {(!existingProfile || step === 'info') && (
        <Section title={t('become_super_agent_info.benefits_title')}>
          <InfoRows items={[1, 2, 3, 4, 5].map((n) => ({ title: t(`become_super_agent_info.benefit${n}_title`), desc: t(`become_super_agent_info.benefit${n}_desc`) }))} />
        </Section>
      )}
      {(!existingProfile || step === 'info') && (
        <Section title={t('become_super_agent_info.requirements_title')}>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
            {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`become_super_agent_info.req${n}`)}</li>)}
          </ul>
        </Section>
      )}

      {showVerifyIdentity && (
        <VerifyIdentityModal onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => { setShowVerifyIdentity(false); setIdentityStatus((p) => afterIdentitySent(p)); }} />
      )}
    </ApplyPage>
  );
};

export default BecomeSuperAgentInfo;