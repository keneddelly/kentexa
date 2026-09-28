/**
 * BusinessCommerceEntry.js — I2C: the simple "Anza kuuza / Start selling"
 * door for ONE exact Business.
 *
 * COMPLEX ENGINE, SIMPLE DOORS: the user sees one human state and at most one
 * action. Everything technical (workspace, capability, AccountRole, profile)
 * is resolved by the server; this component only
 *   - reads GET /business/:businessId/commerce-entry (server-derived state),
 *   - applies through the EXISTING generic engine
 *     POST /business/:businessId/capabilities/commerce/apply (no body ids),
 *   - and, once the server says 'active', opens selling through the SAME
 *     atomic switch flow the capability tiles use.
 * It never calls the legacy personal POST /seller/apply, never navigates to
 * BecomeSeller, never invents an 'active', and never shows a backend code.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import VerifyIdentityModal from './VerifyIdentityModal';
import { applyForBusinessCapability, getBusinessWorkspaces, getCommerceEntryState } from '../../api/business';
import { ENTRY_VIEW, commerceApplyFailureAction, commerceEntryView } from '../../context/commerceEntry';
import { TILE_STATE, isTileActionable, tilesForWorkspace } from '../../context/capabilityTiles';

const B = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const TONE = {
  [ENTRY_VIEW.START]: { icon: '🛍️', bg: WH, border: '#DBEAFE' },
  [ENTRY_VIEW.VERIFY]: { icon: '🪪', bg: '#FFFBEB', border: '#FDE68A' },
  [ENTRY_VIEW.PENDING]: { icon: '⏳', bg: '#EFF6FF', border: '#BFDBFE' },
  [ENTRY_VIEW.REJECTED]: { icon: '↩️', bg: '#FEF2F2', border: '#FECACA' },
  [ENTRY_VIEW.ACTIVE]: { icon: '✅', bg: '#F0FDF4', border: '#BBF7D0' },
  [ENTRY_VIEW.SUSPENDED]: { icon: '⏸️', bg: '#FFFBEB', border: '#FDE68A' },
  [ENTRY_VIEW.REVOKED]: { icon: '🚫', bg: '#F1F5F9', border: '#E2E8F0' },
  [ENTRY_VIEW.BLOCKED]: { icon: 'ℹ️', bg: '#F1F5F9', border: '#E2E8F0' },
};

const Button = ({ onClick, disabled, children, testId }) => (
  <button onClick={onClick} disabled={disabled} data-testid={testId}
    style={{ width: '100%', backgroundColor: B, color: WH, border: 'none', borderRadius: 12,
      padding: '12px 0', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 800, marginTop: 12,
      opacity: disabled ? 0.7 : 1 }}>
    {children}
  </button>
);

/**
 * props:
 *  - businessId (required): the EXACT Business this door is for.
 *  - businessName: presentation only.
 *  - hideWhenActive: BusinessHome already renders the Commerce tile once
 *    selling is active, so it asks this door to step aside; the dashboard
 *    keeps it (as "Open selling").
 *  - onNavigate / activeContext / roleOptions / onSwitchAccountRole: only to
 *    OPEN selling for an already-active Business via the existing switch flow.
 */
const BusinessCommerceEntry = ({
  businessId, businessName, hideWhenActive = false, onEntryLoaded, onNavigate, activeContext, roleOptions, onSwitchAccountRole,
}) => {
  const { t } = useTranslation();
  const [entry, setEntry] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [openTile, setOpenTile] = useState(undefined); // undefined = not resolved, null = none actionable

  const name = businessName || '';

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const next = await getCommerceEntryState(businessId);
      setEntry(next);
      onEntryLoaded?.(next);
    } catch {
      setEntry(null);
      setLoadError(true);
      onEntryLoaded?.(null); // unknown => callers must treat selling as NOT active
    }
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setEntry(null); setApplyError(false); setOpenTile(undefined); load(); }, [load]);

  const view = entry ? commerceEntryView(entry) : null;

  // Active + this door is visible: find the Commerce tile of this Business's
  // default workspace (server-issued role, switchable-now cross-check).
  useEffect(() => {
    if (!view || view.view !== ENTRY_VIEW.ACTIVE || hideWhenActive) return undefined;
    let cancelled = false;
    getBusinessWorkspaces(businessId)
      .then((workspaces) => {
        if (cancelled) return;
        const ws = workspaces.find((w) => w.isDefault) || workspaces[0];
        const tile = ws ? tilesForWorkspace(ws, activeContext?.accountRoleId, roleOptions || []).find((x) => x.key === 'commerce') : null;
        setOpenTile(tile && isTileActionable(tile) ? tile : null);
      })
      .catch(() => { if (!cancelled) setOpenTile(null); });
    return () => { cancelled = true; };
  }, [view?.view, hideWhenActive, businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    setSubmitting(true);
    setApplyError(false);
    try {
      await applyForBusinessCapability(businessId, 'commerce');
      await load();
    } catch (e) {
      const action = commerceApplyFailureAction(e);
      if (action === 'refresh') await load();
      else if (action === 'verify') setShowVerify(true);
      else setApplyError(true);
    } finally { setSubmitting(false); }
  };

  const handleOpen = () => {
    if (!openTile) return;
    if (openTile.state === TILE_STATE.ACTIVE) onNavigate?.(openTile.destination);
    else if (openTile.accountRoleId) onSwitchAccountRole?.(openTile.accountRoleId, openTile.destination);
  };

  if (loadError) {
    return (
      <div style={{ backgroundColor: WH, borderRadius: 16, padding: 16, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: GR }}>{t('business_commerce_entry.check_failed')}</div>
        <button onClick={load}
          style={{ marginTop: 10, background: B, color: WH, border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          {t('business_commerce_entry.try_again')}
        </button>
      </div>
    );
  }
  if (!view) return null; // loading: render nothing rather than flash a wrong door
  if (view.view === ENTRY_VIEW.ACTIVE && hideWhenActive) return null;

  const tone = TONE[view.view];
  const k = (suffix) => t(`business_commerce_entry.${suffix}`, { business: name });

  let title;
  let desc;
  let action = null;
  switch (view.view) {
    case ENTRY_VIEW.START:
      title = k('title_available'); desc = k('desc_available');
      action = view.canApply ? { label: submitting ? k('button_starting') : k('button_start'), onClick: handleApply, disabled: submitting, id: 'start' } : null;
      break;
    case ENTRY_VIEW.VERIFY:
      title = k('title_verify'); desc = view.verificationRejected ? k('desc_verify_rejected') : k('desc_verify');
      action = { label: k('button_verify'), onClick: () => setShowVerify(true), id: 'verify' };
      break;
    case ENTRY_VIEW.PENDING:
      title = k('title_pending'); desc = k('desc_pending');
      break;
    case ENTRY_VIEW.REJECTED:
      title = k('title_rejected'); desc = k('desc_rejected');
      action = view.canApply ? { label: submitting ? k('button_starting') : k('button_reapply'), onClick: handleApply, disabled: submitting, id: 'reapply' } : null;
      break;
    case ENTRY_VIEW.ACTIVE:
      title = k('title_active');
      desc = openTile === null ? k('desc_active_preparing') : k('desc_active');
      action = openTile ? { label: k('button_open'), onClick: handleOpen, id: 'open' } : null;
      break;
    case ENTRY_VIEW.SUSPENDED:
      title = k('title_suspended'); desc = k('desc_suspended');
      break;
    case ENTRY_VIEW.REVOKED:
      title = k('title_revoked'); desc = k('desc_revoked');
      break;
    default:
      title = k('title_blocked'); desc = view.ownerOnly ? k('desc_blocked_owner') : k('desc_blocked');
  }

  return (
    <div data-testid={`commerce-entry-${view.view}`}
      style={{ backgroundColor: tone.bg, border: `1.5px solid ${tone.border}`, borderRadius: 16, padding: 18, marginBottom: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 26, flexShrink: 0 }}>{tone.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: DK, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: GR, lineHeight: 1.5 }}>{desc}</div>
          {view.view === ENTRY_VIEW.REJECTED && view.rejectionReason && (
            <div style={{ fontSize: 12, color: DK, marginTop: 8 }}>
              <strong>{t('business_commerce_entry.reason_label')}</strong> {view.rejectionReason}
            </div>
          )}
        </div>
      </div>
      {applyError && (
        <div role="alert" style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 13 }}>
          {t('business_commerce_entry.apply_failed')}
        </div>
      )}
      {action && <Button onClick={action.onClick} disabled={action.disabled} testId={`commerce-entry-action-${action.id}`}>{action.label}</Button>}

      {showVerify && (
        <VerifyIdentityModal
          onClose={() => setShowVerify(false)}
          onVerified={() => { setShowVerify(false); load(); }}
        />
      )}
    </div>
  );
};

export default BusinessCommerceEntry;
