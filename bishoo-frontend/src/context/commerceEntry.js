/**
 * commerceEntry.js — I2C: the ONE place the frontend turns the server's
 * canonical COMMERCE entry state (GET /business/:id/commerce-entry) into a
 * simple human view, and turns an apply failure into either a state refresh
 * or a generic message.
 *
 * The server owns every decision. This module never grants anything, never
 * assumes 'active', and never shows a backend code as copy: unknown/absent
 * state falls back to the safest view (BLOCKED / generic message).
 */

export const ENTRY_VIEW = Object.freeze({
  START: 'start', // not selling yet: the simple "Anza kuuza" door
  VERIFY: 'verify', // eligible, but identity verification must come first
  PENDING: 'pending',
  REJECTED: 'rejected', // reapply allowed by the server
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
  BLOCKED: 'blocked',
});

/**
 * `entry` is the server response:
 *   { state, canApply, verification: 'ok'|'required'|'rejected', rejectionReason, blockedReason }
 * Returns { view, canApply, verificationRejected, rejectionReason, ownerOnly }.
 * canApply is only ever true when the server said so.
 */
export const commerceEntryView = (entry) => {
  const state = entry && typeof entry.state === 'string' ? entry.state : null;
  const verification = entry?.verification;
  const needsVerification = verification === 'required' || verification === 'rejected';
  const base = {
    canApply: false,
    verificationRejected: verification === 'rejected',
    rejectionReason: null,
    ownerOnly: false,
  };
  switch (state) {
    case 'available':
      return { ...base, view: needsVerification ? ENTRY_VIEW.VERIFY : ENTRY_VIEW.START, canApply: entry.canApply === true };
    case 'rejected':
      return {
        ...base,
        view: needsVerification ? ENTRY_VIEW.VERIFY : ENTRY_VIEW.REJECTED,
        canApply: entry.canApply === true,
        rejectionReason: typeof entry.rejectionReason === 'string' && entry.rejectionReason.trim() ? entry.rejectionReason : null,
      };
    case 'pending':
      return { ...base, view: ENTRY_VIEW.PENDING };
    case 'active':
      return { ...base, view: ENTRY_VIEW.ACTIVE };
    case 'suspended':
      return { ...base, view: ENTRY_VIEW.SUSPENDED };
    case 'revoked':
      return { ...base, view: ENTRY_VIEW.REVOKED };
    default: // 'blocked' and anything unknown: fail closed
      return { ...base, view: ENTRY_VIEW.BLOCKED, ownerOnly: entry?.blockedReason === 'owner_required' };
  }
};

/**
 * What to do after POST /business/:id/capabilities/commerce/apply fails.
 * `refresh` = the server already knows the truth (pending/active/suspended/
 * revoked/...): re-read the state instead of showing an error. `verify` =
 * open the identity flow. Everything else is a generic, non-technical message.
 */
export const commerceApplyFailureAction = (error) => {
  const code = error?.response?.data?.code ?? error?.response?.data?.message?.code;
  switch (code) {
    case 'CAPABILITY_APPLICATION_ALREADY_PENDING':
    case 'CAPABILITY_ALREADY_ACTIVE':
    case 'CAPABILITY_SUSPENDED':
    case 'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION':
    case 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION':
    case 'SELLER_APPLICATION_STATE_INCONSISTENT':
    case 'BUSINESS_NOT_ACTIVE':
    case 'WORKSPACE_NOT_ACTIVE':
    case 'BUSINESS_WORKSPACE_UNRESOLVED':
    case 'BUSINESS_OWNER_REQUIRED':
      return 'refresh';
    case 'VERIFICATION_REQUIRED':
    case 'VERIFICATION_REJECTED':
      return 'verify';
    default:
      return 'generic';
  }
};
