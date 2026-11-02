import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApplyPage, InfoRows, K, Note, Section, pillStyle } from '../components/ApplyKit';
import api from '../../api/api';
import AgentSignupSteps from '../components/AgentSignupSteps';
import { identityState } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';
import { openRolePage } from '../../utils/workRoles';

// Become an agent (audit B step 3): the form (or the request's status) comes
// first, right under the header; commission tiers and benefits follow below.
const BecomeAgent = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole, availableRoles, onSwitchAccountRole }) => {
  const { t } = useTranslation();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existingProfile, setExistingProfile] = useState(null);
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn) { setCheckingStatus(false); return; }
    api.get('/agents/my-profile')
      .then(res => setExistingProfile(res.data))
      .catch(() => setExistingProfile(null))
      .finally(() => setCheckingStatus(false));
    api.get('/identity/me').then((r) => setIdentityStatus(r.data)).catch(() => {});
  }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const goLogin = () => { localStorage.setItem('kentexa_after_login', 'BecomeAgent'); onNavigate('PublicLogin'); };
  // A waiting request whose ID is not verified yet says so (same words as the profile section).
  const waitingForId = existingProfile?.status === 'pending' && identityState(identityStatus) !== 'verified';

  const statusTitle = existingProfile?.status === 'approved' ? t('become_agent.status_approved_title')
    : existingProfile?.status === 'pending' ? (waitingForId ? t('work_roles.status_waiting_id') : t('become_agent.status_pending_title'))
    : existingProfile?.status === 'suspended' ? t('become_agent.status_suspended_title') : '';
  const statusDesc = existingProfile?.status === 'approved' ? t('become_agent.status_approved_desc', { code: existingProfile.agentCode || '—' })
    : existingProfile?.status === 'pending' ? (waitingForId ? t('agent_signup.status_waiting_id_desc') : t('become_agent.status_pending_desc'))
    : existingProfile?.status === 'suspended' ? (existingProfile.rejectionReason || t('become_agent.status_suspended_desc_default')) : '';

  return (
    <ApplyPage onBack={() => onNavigate('back')} backTitle={t('become_agent.page_title')}
      title={t('become_agent.hero_title')} desc={t('become_agent.hero_subtitle')}>
      {/* Application form / status, first (room above the bottom menu so the last button can be tapped) */}
      <div style={{ paddingBottom: 92, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {checkingStatus ? (
          <p style={{ color: K.MUTED, margin: 0 }}>{t('become_agent.checking_status')}</p>
        ) : existingProfile && existingProfile.status !== 'rejected' ? (
          <Section testId="agent-status">
            <Note tone={existingProfile.status === 'approved' ? 'green' : existingProfile.status === 'suspended' ? 'amber' : 'grey'}>
              <b style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>{statusTitle}</b>{statusDesc}
            </Note>
            {existingProfile.status === 'approved' && (
              <button type="button" onClick={() => openRolePage({ roleType: 'agent', page: 'AgentDashboard', availableRoles, onNavigate, onSwitchAccountRole })} style={pillStyle()}>
                {t('become_agent.go_dashboard_button')}
              </button>
            )}
          </Section>
        ) : (
          <Section title={t('become_agent.form_title')}>
            {existingProfile?.status === 'rejected' && (
              <Note tone="amber">{t('become_agent.rejected_notice_prefix')}{existingProfile.rejectionReason ? `: ${existingProfile.rejectionReason}` : '.'} {t('become_agent.rejected_notice_suffix')}</Note>
            )}
            {!isLoggedIn ? (
              <>
                <p style={{ margin: 0, fontSize: 15, color: K.MUTED }}>{t('become_agent.login_required_prefix')} {t('become_agent.login_required_link')} {t('become_agent.login_required_suffix')}</p>
                <button type="button" onClick={goLogin} style={pillStyle()}>{t('become_agent.login_required_link')}</button>
              </>
            ) : (
              // Sent: show this request's "waiting" status here (no dashboard until approved).
              <AgentSignupSteps currentUser={currentUser}
                onSubmitted={(_m, data) => { setExistingProfile({ ...(data || {}), status: data?.status || 'pending' }); window.scrollTo(0, 0); }} />
            )}
          </Section>
        )}

        {/* Benefits (the old commission tiers are gone: agents earn the delivery fee the customer pays them) */}
        <Section title={t('become_agent.benefits_title')}>
          <InfoRows items={[1, 2, 3, 4, 5].map((n) => ({ title: t(`become_agent.benefit${n}_title`), desc: t(`become_agent.benefit${n}_desc`) }))} />
        </Section>
      </div>
    </ApplyPage>
  );
};

export default BecomeAgent;
