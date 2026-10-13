import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import AgentSignupSteps from '../components/AgentSignupSteps';
import { identityState } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';

// Become an agent (audit B step 3): the form (or the request's status) comes
// first, right under the header; commission tiers and benefits follow below.
const BecomeAgent = ({ onNavigate, isLoggedIn, currentUser, onLogout, userRole }) => {
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <BackBar onBack={() => onNavigate('back')} title={t('become_agent.page_title')} top={0} />

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', padding: '28px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🤝</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', margin: '0 0 6px', fontFamily: 'Manrope,sans-serif' }}>{t('become_agent.hero_title')}</h1>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.7)', margin: 0 }}>{t('become_agent.hero_subtitle')}</p>
      </div>

      <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 140 }}>{/* room above the bottom menu + profile chip, so the last button can be tapped */}

        {/* Application form / status */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 }}>

          {checkingStatus ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>{t('become_agent.checking_status')}</div>

          ) : existingProfile && existingProfile.status !== 'rejected' ? (
            <div data-testid="agent-status" style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>
                {existingProfile.status === 'approved' ? '✅' : existingProfile.status === 'suspended' ? '🚫' : '⏳'}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', margin: '0 0 8px' }}>
                {existingProfile.status === 'approved'  && t('become_agent.status_approved_title')}
                {existingProfile.status === 'pending'   && (waitingForId ? t('work_roles.status_waiting_id') : t('become_agent.status_pending_title'))}
                {existingProfile.status === 'suspended' && t('become_agent.status_suspended_title')}
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
                {existingProfile.status === 'approved'  && t('become_agent.status_approved_desc', { code: existingProfile.agentCode || '—' })}
                {existingProfile.status === 'pending'   && (waitingForId ? t('agent_signup.status_waiting_id_desc') : t('become_agent.status_pending_desc'))}
                {existingProfile.status === 'suspended' && (existingProfile.rejectionReason || t('become_agent.status_suspended_desc_default'))}
              </p>
              {existingProfile.status === 'approved' && (
                <button onClick={() => onNavigate('AgentDashboard')}
                  style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                  {t('become_agent.go_dashboard_button')}
                </button>
              )}
            </div>

          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: '0 0 16px' }}>{t('become_agent.form_title')}</h2>

              {existingProfile?.status === 'rejected' && (
                <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  ❌ {t('become_agent.rejected_notice_prefix')}{existingProfile.rejectionReason ? `: ${existingProfile.rejectionReason}` : '.'} {t('become_agent.rejected_notice_suffix')}
                </div>
              )}

              {!isLoggedIn ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
                    {t('become_agent.login_required_prefix')} {t('become_agent.login_required_link')} {t('become_agent.login_required_suffix')}
                  </p>
                  <button type="button" onClick={goLogin}
                    style={{ background: 'linear-gradient(135deg,#f7971e,#ffd200)', color: '#1e293b', border: 'none', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                    {t('become_agent.login_required_link')}
                  </button>
                </div>
              ) : (
                // Sent: show this request's "waiting" status here (no dashboard until approved).
                <AgentSignupSteps currentUser={currentUser}
                  onSubmitted={(_m, data) => { setExistingProfile({ ...(data || {}), status: data?.status || 'pending' }); window.scrollTo(0, 0); }} />
              )}
            </>
          )}
        </div>

        {/* Commission tiers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { tier: t('become_agent.tier_basic'),  icon: '🥉', commission: '2.5%', transactions: '0–50',   color: '#64748b', bg: '#f1f5f9' },
            { tier: t('become_agent.tier_silver'), icon: '🥈', commission: '3.5%', transactions: '51–200',  color: '#475569', bg: '#e2e8f0' },
            { tier: t('become_agent.tier_gold'),   icon: '🥇', commission: '5.0%', transactions: '200+',    color: '#d97706', bg: '#fef9c3' },
          ].map(tierItem => (
            <div key={tierItem.tier} style={{ backgroundColor: tierItem.bg, borderRadius: 12, padding: '14px 8px', textAlign: 'center', border: `2px solid ${tierItem.color}40` }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{tierItem.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: tierItem.color }}>{tierItem.tier}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b' }}>{tierItem.commission}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{t('become_agent.tier_orders', { range: tierItem.transactions })}</div>
            </div>
          ))}
        </div>

        {/* Benefits */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>{t('become_agent.benefits_title')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '💵', title: t('become_agent.benefit1_title'), desc: t('become_agent.benefit1_desc') },
              { icon: '📱', title: t('become_agent.benefit2_title'), desc: t('become_agent.benefit2_desc') },
              { icon: '📊', title: t('become_agent.benefit3_title'), desc: t('become_agent.benefit3_desc') },
              { icon: '🏆', title: t('become_agent.benefit4_title'), desc: t('become_agent.benefit4_desc') },
              { icon: '🎯', title: t('become_agent.benefit5_title'), desc: t('become_agent.benefit5_desc') },
            ].map(b => (
              <div key={b.title} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, flexShrink: 0, background: 'linear-gradient(135deg,#f7971e,#ffd200)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  {b.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BecomeAgent;
