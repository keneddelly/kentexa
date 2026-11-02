/**
 * RoleActivation.js — Guided flow for users to activate new roles
 * Place at: src/public/pages/RoleActivation.js
 *
 * Every user starts as Buyer. This page guides them to activate:
 * Seller, Agent, Super Agent, or Transport Provider.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApplyPage, K, InfoRows, Note, Section, pillStyle } from '../components/ApplyKit';
import VerifyIdentityModal from '../components/VerifyIdentityModal';
import api from '../../api/api';
import { needsIdentityStep, afterIdentitySent } from '../../utils/identityState';
import useIdentityRefresh from '../../utils/useIdentityRefresh';

// Roles that make someone an operational Kentexa participant (sells,
// ships, transports, or provides a service on behalf of themselves or
// others) — per the 2026-08-28 identity-verification architecture audit,
// choosing one of these must check identity verification immediately,
// here at the single hub every activation path already passes through,
// rather than being discovered later as a raw 403 deep inside each
// role's own apply/register/post-ad flow. 'business' is excluded: it's a
// tier upgrade for an ALREADY-active seller (who cleared this gate to
// become a seller in the first place), not a fresh operational role.
// Super Agent follows the logistics operating model: registration creates an
// active hub immediately. Identity verification is not a prerequisite for
// opening the hub; operational logistics controls apply inside the hub flow.
const OPERATIONAL_ROLE_KEYS = ['seller', 'agent', 'transport_provider', 'service_provider'];

const getRoles = (t) => [
  {
    key:      'seller',
    title:    t('role_activation.seller_title'),
    tagline:  t('role_activation.seller_tagline'),
    desc:     t('role_activation.seller_desc'),
    perks:    [t('role_activation.seller_perk1'), t('role_activation.seller_perk2'), t('role_activation.seller_perk3'), t('role_activation.seller_perk4')],
    needs:    [t('role_activation.seller_need1'), t('role_activation.seller_need2'), t('role_activation.seller_need3')],
    page:     'BecomeSellerInfo',
  },
  {
    key:      'business',
    title:    t('role_activation.business_title'),
    tagline:  t('role_activation.business_tagline'),
    desc:     t('role_activation.business_desc'),
    perks:    [t('role_activation.business_perk1'), t('role_activation.business_perk2'), t('role_activation.business_perk3'), t('role_activation.business_perk4')],
    needs:    [t('role_activation.business_need1'), t('role_activation.business_need2'), t('role_activation.business_need3')],
    page:     'BecomeBusiness',
  },
  {
    key:      'agent',
    title:    t('role_activation.agent_title'),
    tagline:  t('role_activation.agent_tagline'),
    desc:     t('role_activation.agent_desc'),
    perks:    [t('role_activation.agent_perk1'), t('role_activation.agent_perk2'), t('role_activation.agent_perk3'), t('role_activation.agent_perk4')],
    needs:    [t('role_activation.agent_need1'), t('role_activation.agent_need2'), t('role_activation.agent_need3')],
    page:     'BecomeAgent',
  },
  {
    key:      'super_agent',
    title:    t('role_activation.super_agent_title'),
    tagline:  t('role_activation.super_agent_tagline'),
    desc:     t('role_activation.super_agent_desc'),
    perks:    [t('role_activation.super_agent_perk1'), t('role_activation.super_agent_perk2'), t('role_activation.super_agent_perk3'), t('role_activation.super_agent_perk4')],
    needs:    [t('role_activation.super_agent_need1'), t('role_activation.super_agent_need2'), t('role_activation.super_agent_need3')],
    page:     'BecomeSuperAgentInfo',
  },
  {
    key:      'transport_provider',
    title:    t('role_activation.transport_provider_title'),
    tagline:  t('role_activation.transport_provider_tagline'),
    desc:     t('role_activation.transport_provider_desc'),
    perks:    [t('role_activation.transport_provider_perk1'), t('role_activation.transport_provider_perk2'), t('role_activation.transport_provider_perk3'), t('role_activation.transport_provider_perk4')],
    needs:    [t('role_activation.transport_provider_need1'), t('role_activation.transport_provider_need2'), t('role_activation.transport_provider_need3')],
    page:     'BecomeTransportProvider',
  },
  {
    key:      'service_provider',
    title:    t('role_activation.service_provider_title'),
    tagline:  t('role_activation.service_provider_tagline'),
    desc:     t('role_activation.service_provider_desc'),
    perks:    [t('role_activation.service_provider_perk1'), t('role_activation.service_provider_perk2'), t('role_activation.service_provider_perk3'), t('role_activation.service_provider_perk4')],
    needs:    [t('role_activation.service_provider_need1'), t('role_activation.service_provider_need2'), t('role_activation.service_provider_need3')],
    page:     'PostService',
  },
];

const RoleActivation = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser, availableRoles = [] }) => {
  const { t } = useTranslation();
  const ROLES = getRoles(t);
  const [selected, setSelected] = useState(null);
  const [hasBusiness, setHasBusiness] = useState(false);
  const [identityStatus, setIdentityStatus] = useState(null);
  useIdentityRefresh(setIdentityStatus, isLoggedIn);
  const [showVerifyIdentity, setShowVerifyIdentity] = useState(false);

  // Business isn't tracked on User.activeRoles — it's its own entity
  // (multi-role architecture Phase 1) — so its "already have it" state
  // is derived from a lightweight lookup instead.
  useEffect(() => {
    if (!isLoggedIn) return;
    api.get('/business/mine')
      .then(res => setHasBusiness(!!res.data))
      .catch(() => {});
  }, [isLoggedIn]);

  // Same identity check BecomeSeller.js already does — mirrored here so
  // it fires ONCE at the shared hub every role picks through, for every
  // operational role, not just Seller.
  useEffect(() => {
    if (!isLoggedIn) { setIdentityStatus({ status: 'not_submitted', level: 0 }); return; }
    api.get('/identity/me')
      .then(r => setIdentityStatus(r.data))
      .catch(() => setIdentityStatus({ status: 'not_submitted', level: 0 }));
  }, [isLoggedIn]);

  const handleActivate = (targetPage) => {
    const needsVerification =
      OPERATIONAL_ROLE_KEYS.includes(selected) &&
      needsIdentityStep(identityStatus);
    if (needsVerification) {
      setShowVerifyIdentity(true);
      return;
    }
    onNavigate(targetPage);
  };

  const role  = selected ? ROLES.find(r => r.key === selected) : null;
  const activeRoles = availableRoles.filter(r => r.status === 'active').map(r => r.roleType);

  const roleName = (r) => (r === 'user' ? t('role_activation.role_user') : r === 'seller' ? t('role_activation.role_seller') : r === 'agent' ? t('role_activation.role_agent') : r === 'super_agent' ? t('role_activation.role_super_agent') : r === 'transport_provider' ? t('role_activation.role_transport_provider') : r);
  const strip = (x) => String(x || '').replace(/^\s*(←|→)\s*|\s*(←|→)\s*$/g, '');

  return (
    <ApplyPage onBack={() => (selected ? setSelected(null) : onNavigate('CommerceProfile'))} backTitle={t('role_activation.page_title')}
      title={selected ? role.title : t('role_activation.hero_title')} desc={selected ? role.desc : t('role_activation.hero_desc')}>
      {!selected ? (
        <>
          {activeRoles.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {activeRoles.map((r) => (
                <span key={r} style={{ fontSize: 13, fontWeight: 700, background: '#ecfdf3', color: K.GREEN, padding: '4px 10px', borderRadius: 999 }}>{roleName(r)}</span>
              ))}
            </div>
          )}
          <Section title={t('role_activation.choose_role')}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ROLES.map((r) => {
                const isActive = r.key === 'business' ? hasBusiness : activeRoles.includes(r.key);
                return (
                  <button key={r.key} type="button" data-testid={`role-${r.key}`} disabled={isActive} onClick={() => setSelected(r.key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: 'none', borderBottom: `1px solid ${K.LINE}`, background: 'none',
                      padding: '14px 0', cursor: isActive ? 'default' : 'pointer', fontFamily: 'inherit', color: K.INK, opacity: isActive ? 0.6 : 1 }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 16 }}>{r.title}</b>
                        {isActive && <span style={{ fontSize: 12, background: '#ecfdf3', color: K.GREEN, padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{t('role_activation.already_have_role')}</span>}
                      </span>
                      <span style={{ fontSize: 14, color: K.MUTED }}>{r.tagline}</span>
                    </span>
                    {!isActive && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={K.MUTED} strokeWidth="2.2" aria-hidden="true"><polyline points="9,18 15,12 9,6" /></svg>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section title={t('role_activation.perks_title')}>
            <InfoRows items={role.perks.map((p) => ({ title: p }))} />
          </Section>
          <Section title={t('role_activation.needs_title')}>
            <Note>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {role.needs.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </Note>
          </Section>
          <button type="button" data-testid="role-activate" onClick={() => handleActivate(role.page)} style={pillStyle()}>
            {t('role_activation.activate_button', { title: role.title })}
          </button>
          <button type="button" onClick={() => setSelected(null)} style={pillStyle(false)}>{strip(t('role_activation.back'))}</button>
        </>
      )}

      {showVerifyIdentity && (
        <VerifyIdentityModal
          onClose={() => setShowVerifyIdentity(false)}
          onVerified={() => {
            setShowVerifyIdentity(false);
            setIdentityStatus((prev) => afterIdentitySent(prev));
            onNavigate(role.page);
          }}
        />
      )}
    </ApplyPage>
  );
};

export default RoleActivation;
