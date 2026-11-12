/**
 * BusinessHome.js — Business-First Frontend Stage 1.
 *
 * "Bishoo Intelligence Systems / [Commerce] [POS] [Transport] ..." —
 * capability tiles for one Business, driven entirely by
 * GET /business/:id/workspaces (workspaces + server-issued capabilities +
 * the caller's own myAccountRole per workspace). Never infers capability
 * availability from the User's own role list -- only from what this
 * specific Business's workspace(s) actually report.
 *
 * Tapping an actionable tile calls the SAME atomic switchRole flow
 * (onSwitchAccountRole, passed down from App.js's handleSwitchProfile) --
 * never a separate switchBusiness(businessId) authority mechanism. A tile
 * with no server-issued switchable AccountRole is rendered inert with an
 * explicit state label (Requires activation / Coming soon) and never
 * calls switchRole at all.
 */
import { isLegacyPersonalSeller } from '../utils/publicActor';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getMyBusinesses, getBusinessWorkspaces, getBusinessCapabilityApplications } from '../../api/business';
import { isFoodBusiness } from '../../context/workspaceModel';
import { tilesForWorkspace, TILE_STATE, capabilityCtaState, CTA_STATE, CTA_CAPABILITIES, ctaDestination } from '../../context/capabilityTiles';
import { resolveBusinessEntry, BUSINESS_ENTRY } from '../../context/businessEntry';
import BusinessContextMismatch from '../components/BusinessContextMismatch';
import api from '../../api/api';

const B = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const STATE_LABEL_KEY = {
  [TILE_STATE.PENDING]: 'business_home.state_pending',
  [TILE_STATE.REQUIRES_ACTIVATION]: 'business_home.state_requires_activation',
  [TILE_STATE.COMING_SOON]: 'business_home.state_coming_soon',
};

const Tile = ({ tile, onTap, t }) => {
  const actionable = tile.state === TILE_STATE.AVAILABLE || tile.state === TILE_STATE.ACTIVE;
  const isActive = tile.state === TILE_STATE.ACTIVE;
  return (
    <button onClick={() => actionable && onTap(tile)} disabled={!actionable}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        width: 96, padding: '16px 8px', borderRadius: 16,
        border: isActive ? `2px solid ${B}` : '2px solid transparent',
        backgroundColor: isActive ? '#EFF6FF' : WH,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        cursor: actionable ? 'pointer' : 'default', opacity: actionable ? 1 : 0.6 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={B} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tile.iconPath} /></svg>
      <div style={{ fontSize: 12, fontWeight: 800, color: DK, textAlign: 'center' }}>{t(tile.labelKey)}</div>
      {isActive && <div style={{ fontSize: 9, fontWeight: 800, color: B }}>{t('profile_switcher.active_label')}</div>}
      {!actionable && (
        <div style={{ fontSize: 9, color: GR, textAlign: 'center' }}>{t(STATE_LABEL_KEY[tile.state] || 'business_home.state_pending')}</div>
      )}
    </button>
  );
};

const BusinessHome = ({ businessId, onNavigate, isLoggedIn, currentUser, activeContext, activeProfileId, roleOptions, onSwitchAccountRole, onRefreshContext, onOpenMoment }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [workspaces, setWorkspaces] = useState(null); // null = loading
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState(null);
  const [onboarding, setOnboarding] = useState({ profile: null, hasMoment: false, loading: true });

  const load = async (id) => {
    setMismatch(null);
    setError('');
    setWorkspaces(null);
    try {
      // I2D: which Business opens is decided by the canonical entry rules
      // (exact route id / canonical BUSINESS context / explicit chooser) --
      // never the first or oldest Business.
      const mine = await getMyBusinesses();
      const entry = resolveBusinessEntry({ activeContext, routeBusinessId: id, businesses: mine });
      if (entry.status === BUSINESS_ENTRY.MISMATCH) { setMismatch(entry); return; }
      if (entry.status !== BUSINESS_ENTRY.OK) { onNavigate('MyBusinesses'); return; }
      const resolvedId = entry.businessId;
      setBusiness(mine.find((b) => Number(b.id) === resolvedId) || { id: resolvedId });
      const ws = await getBusinessWorkspaces(resolvedId);
      setWorkspaces(ws);
      // Business onboarding is profile-scoped. Never select the first Business
      // profile belonging to this person: match the exact Business id.
      setOnboarding({ profile: null, hasMoment: false, loading: true });
      if (currentUser?.id) {
        try {
          const profiles = await api.get(`/profiles/for-user/${currentUser.id}`);
          const profile = (profiles.data || []).find((item) =>
            item.type === 'business' && Number(item.businessId) === Number(resolvedId));
          let hasMoment = false;
          if (profile?.id) {
            const feed = await api.get(`/feed/business/${currentUser.id}`, { params: { commerceProfileId: profile.id } });
            const posts = Array.isArray(feed.data) ? feed.data : (feed.data?.posts || feed.data?.items || []);
            hasMoment = posts.length > 0;
          }
          setOnboarding({ profile: profile || null, hasMoment, loading: false });
        } catch {
          setOnboarding({ profile: null, hasMoment: false, loading: false });
        }
      } else {
        setOnboarding({ profile: null, hasMoment: false, loading: false });
      }
      // I2C: application history for THIS exact Business, for the CTA state only.
      getBusinessCapabilityApplications(resolvedId).then(setApplications).catch(() => setApplications([]));
    } catch {
      setError(t('business_home.load_failed'));
    }
  };

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    // I2: an approval may have created a Business role since login -- rebuild roles/context
    // from the server once on entry (never derived locally).
    if (typeof onRefreshContext === 'function') Promise.resolve(onRefreshContext()).catch(() => {});
    load(businessId);
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTap = (tile) => {
    if (tile.state === TILE_STATE.ACTIVE) {
      onNavigate(tile.destination);
      return;
    }
    if (tile.accountRoleId) {
      onSwitchAccountRole(tile.accountRoleId, tile.destination);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('MyBusinesses')} title={business?.tradingName || business?.legalName || t('business_home.title')} top={0} />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
        {mismatch && <BusinessContextMismatch contextBusinessId={mismatch.contextBusinessId} onNavigate={onNavigate} />}

        {/* Each activity is independent. A business can apply for several; statuses remain server-derived. */}
        {workspaces && workspaces.length > 0 && CTA_CAPABILITIES.some((code) => capabilityCtaState(code, workspaces, applications) !== CTA_STATE.ACTIVE) && (
          <section data-testid="business-capability-choices" style={{ backgroundColor: WH, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: DK, marginBottom: 4 }}>{t('business_home.capabilities_title')}</div>
            <div style={{ fontSize: 14, color: GR, lineHeight: 1.45, marginBottom: 12 }}>{t('business_home.capabilities_intro')}</div>
            {(roleOptions || []).some(isLegacyPersonalSeller) && capabilityCtaState('commerce', workspaces, applications) !== CTA_STATE.ACTIVE && (
              <div style={{ fontSize: 12, color: GR, marginBottom: 10 }}>
                {t('apply_capability.legacy_seller_hint', { name: (roleOptions || []).find(isLegacyPersonalSeller)?.displayName })}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CTA_CAPABILITIES.map((code) => {
                const state = capabilityCtaState(code, workspaces, applications);
                if (state === CTA_STATE.ACTIVE) return null;
                const destination = ctaDestination(code, business?.id || businessId);
                const pending = state === CTA_STATE.PENDING;
                const rejected = state === CTA_STATE.REJECTED;
                return (
                  <div key={code} data-testid={`business-capability-${code}`}
                    style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: DK }}>{t(`business_home.capability_title_${code}`)}</div>
                    <div style={{ fontSize: 13, color: GR, lineHeight: 1.4 }}>{t(`business_home.capability_desc_${code}`)}</div>
                    {(pending || rejected) && <div style={{ fontSize: 13, color: pending ? '#92400E' : '#B42318', fontWeight: 600 }}>
                      {pending ? t('apply_capability.cta_pending') : t('apply_capability.cta_rejected')}
                    </div>}
                    <button type="button" disabled={pending} onClick={() => onNavigate(destination)}
                      style={{ alignSelf: 'flex-start', marginTop: 3, backgroundColor: pending ? '#F1F5F9' : B,
                        color: pending ? GR : WH, border: 'none', borderRadius: 8, padding: '9px 14px',
                        cursor: pending ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {t(`business_home.capability_action_${code}`)}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {business?.id && workspaces && !mismatch && (
          <div data-testid="business-onboarding" style={{ backgroundColor: WH, border: '1px solid #DBEAFE', borderRadius: 16,
            padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: DK, marginBottom: 4 }}>{t('business_home.onboarding_title')}</div>
            <div style={{ fontSize: 14, color: GR, lineHeight: 1.45, marginBottom: 14 }}>
              {t('business_home.onboarding_intro')}
            </div>
            {onboarding.loading ? (
              <div style={{ fontSize: 13, color: GR }}>{t('business_home.onboarding_loading')}</div>
            ) : !onboarding.profile ? (
              <div>
                <div style={{ fontSize: 13, color: GR, lineHeight: 1.45, marginBottom: 10 }}>
                  {t('business_home.profile_missing')}
                </div>
                <button type="button" onClick={() => load(businessId)}
                  style={{ border: '1px solid #BFDBFE', borderRadius: 10, background: '#EFF6FF', color: B,
                    padding: '9px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  {t('business_home.retry')}
                </button>
              </div>
            ) : (() => {
              const profile = onboarding.profile;
              const profileComplete = !!(profile.username && profile.photoUrl && profile.bio?.trim() && profile.location?.trim());
              const canPostAsBusiness = Number(activeContext?.businessId) === Number(business.id)
                && Number(activeProfileId) === Number(profile.id);
              const steps = [
                { key: 'profile', title: t('business_home.step_profile_title'), description: t('business_home.step_profile_desc'), done: profileComplete },
                { key: 'moment', title: t('business_home.step_moment_title'), description: t('business_home.step_moment_desc'), done: onboarding.hasMoment },
              ];
              const completed = steps.filter(step => step.done).length;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DK }}>{t('business_home.steps_label')}</span>
                    <span style={{ fontSize: 12, color: GR }}>{completed}/{steps.length}</span>
                  </div>
                  <div style={{ height: 6, backgroundColor: '#F1F5F9', borderRadius: 100, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: `${(completed / steps.length) * 100}%`, backgroundColor: B, borderRadius: 100 }} />
                  </div>
                  {steps.map((step) => (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                      borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: step.done ? '#DCFCE7' : '#EFF6FF', color: step.done ? '#166534' : B,
                        fontSize: 12, fontWeight: 800 }}>{step.done ? '✓' : ''}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: DK }}>{step.title}</div>
                        <div style={{ fontSize: 13, color: GR, lineHeight: 1.4, marginTop: 2 }}>{step.description}</div>
                        {!step.done && step.key === 'profile' && (
                          <button type="button" onClick={() => onNavigate('EditPublicProfile', { commerceProfileId: profile.id })}
                            style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                            {t('business_home.edit_profile')}
                          </button>
                        )}
                        {!step.done && step.key === 'moment' && (
                          canPostAsBusiness ? (
                            <button type="button" onClick={() => onOpenMoment?.('selling', { kind: 'moment' })}
                              disabled={!onOpenMoment}
                              style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                              {t('business_home.create_first_moment')}
                            </button>
                          ) : (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 12, color: GR, lineHeight: 1.4, marginBottom: 6 }}>
                                {t('business_home.post_as_business_hint')}
                              </div>
                              <button type="button" onClick={() => onNavigate('Workspace')}
                                style={{ padding: 0, border: 'none', background: 'none', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                {t('business_home.open_workspace')}
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => onNavigate('CommerceProfile-' + currentUser?.id, { commerceProfileId: profile.id })}
                    style={{ width: '100%', marginTop: 10, minHeight: 42, border: '1px solid #DBEAFE', borderRadius: 10,
                      background: '#EFF6FF', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {t('business_home.view_public_profile')}
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {business?.id && workspaces && !mismatch && (
          <button type="button" data-testid="business-integrations" onClick={() => onNavigate('Business{t('business_home.integrations_title')}', { businessId: business.id })}
            style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '0 16px', margin: '4px 0 18px', border: '1px solid #dbeafe', borderRadius: 14,
              background: '#fff', color: DK, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ fontSize: 15 }}>Integrations</strong>
              <span style={{ fontSize: 13, color: GR }}>{t('business_home.integrations_desc')}</span>
            </span>
            <span aria-hidden="true" style={{ color: B, fontSize: 22 }}>›</span>
          </button>
        )}

        {workspaces === null && !error && !mismatch && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: GR }}>{t('common.loading')}</div>
        )}

        {error && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: GR }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => load(businessId)}
                style={{ background: B, color: WH, border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('common.try_again')}
              </button>
            </div>
          </div>
        )}

        {workspaces && workspaces.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: GR, fontSize: 13 }}>
            {t('business_home.no_workspaces')}
          </div>
        )}

        {workspaces && workspaces.map((ws) => {
          const tiles = tilesForWorkspace(ws, activeContext?.accountRoleId, roleOptions || []);
          return (
            <div key={ws.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: GR, marginBottom: 10 }}>{ws.name}</div>
              {tiles.length === 0 ? (
                <div style={{ fontSize: 12, color: GR }}>{t('business_home.no_capabilities')}</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {tiles.map((tile) => <Tile key={tile.key} tile={tile} onTap={handleTap} t={t} />)}
                </div>
              )}
            </div>
          );
        })}

        {/* Hotel food ordering (owner 2026-10-27): a food business runs its kitchen and menu from here.
            Capability-based: only businesses in the food category see it. */}
        {business?.id && isFoodBusiness(business.category) && (
          <div data-testid="business-hotel-card" style={{ backgroundColor: WH, borderRadius: 16, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 16, color: '#0f1419' }}>Hoteli: oda za chakula</strong>
            <span style={{ fontSize: 14, color: GR, lineHeight: 1.4 }}>Wateja wanaagiza kutoka menyu yako au QR ya meza; jikoni mnaona oda papo hapo.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => onNavigate('HotelKitchen', { businessId: business.id })}
                style={{ flex: 1, height: 44, borderRadius: 22, border: 'none', background: '#0f1419', color: WH, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Oda za jikoni</button>
              <button type="button" onClick={() => onNavigate('HotelMenuManager', { businessId: business.id })}
                style={{ flex: 1, height: 44, borderRadius: 22, border: '1px solid #cfd9de', background: WH, color: '#0f1419', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Menyu yangu</button>
            </div>
          </div>
        )}
        {/* Owner 2026-11-02: any other business can still switch its food menu on (the server
            checks only that the person owns the business). */}
        {business?.id && !isFoodBusiness(business.category) && (
          <button type="button" data-testid="business-hotel-start" onClick={() => onNavigate('HotelMenuManager', { businessId: business.id })}
            style={{ width: '100%', backgroundColor: WH, color: '#0f1419', border: '1px solid #cfd9de', borderRadius: 12, padding: '12px 14px',
              cursor: 'pointer', fontSize: 14, fontWeight: 700, marginBottom: 12, textAlign: 'left' }}>
            Una hoteli au mgahawa? Weka menyu ya chakula
          </button>
        )}


      </div>
    </div>
  );
};

export default BusinessHome;
