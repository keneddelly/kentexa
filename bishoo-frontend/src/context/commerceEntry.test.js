import { ENTRY_VIEW, commerceApplyFailureAction, commerceEntryView } from './commerceEntry';

const entry = (o = {}) => ({ businessId: 7, state: 'available', canApply: true, verification: 'ok', rejectionReason: null, blockedReason: null, ...o });

describe('commerceEntryView — the server state becomes one simple human view', () => {
  test('available + eligible => START, and canApply mirrors the server', () => {
    expect(commerceEntryView(entry())).toMatchObject({ view: ENTRY_VIEW.START, canApply: true });
    expect(commerceEntryView(entry({ canApply: false }))).toMatchObject({ view: ENTRY_VIEW.START, canApply: false });
  });

  test('identity verification comes first (required or rejected) and never offers the apply door', () => {
    expect(commerceEntryView(entry({ verification: 'required', canApply: false }))).toMatchObject({ view: ENTRY_VIEW.VERIFY, canApply: false, verificationRejected: false });
    expect(commerceEntryView(entry({ verification: 'rejected', canApply: false }))).toMatchObject({ view: ENTRY_VIEW.VERIFY, verificationRejected: true });
    expect(commerceEntryView(entry({ state: 'rejected', verification: 'required', canApply: false }))).toMatchObject({ view: ENTRY_VIEW.VERIFY });
  });

  test('pending / active / suspended / revoked map 1:1 and never grant canApply', () => {
    expect(commerceEntryView(entry({ state: 'pending', canApply: false })).view).toBe(ENTRY_VIEW.PENDING);
    expect(commerceEntryView(entry({ state: 'active', canApply: false })).view).toBe(ENTRY_VIEW.ACTIVE);
    expect(commerceEntryView(entry({ state: 'suspended' })).view).toBe(ENTRY_VIEW.SUSPENDED);
    expect(commerceEntryView(entry({ state: 'revoked' })).view).toBe(ENTRY_VIEW.REVOKED);
    for (const s of ['pending', 'active', 'suspended', 'revoked']) expect(commerceEntryView(entry({ state: s, canApply: true })).canApply).toBe(false);
  });

  test('rejected keeps the reason and allows reapply only when the server says so', () => {
    expect(commerceEntryView(entry({ state: 'rejected', canApply: true, rejectionReason: 'Photo unclear' })))
      .toMatchObject({ view: ENTRY_VIEW.REJECTED, canApply: true, rejectionReason: 'Photo unclear' });
    expect(commerceEntryView(entry({ state: 'rejected', canApply: false })).canApply).toBe(false);
    expect(commerceEntryView(entry({ state: 'rejected', canApply: true, rejectionReason: '   ' })).rejectionReason).toBeNull();
  });

  test('blocked, unknown, missing or garbage state FAILS CLOSED (never START/ACTIVE, never canApply)', () => {
    expect(commerceEntryView(entry({ state: 'blocked', canApply: false, blockedReason: 'authority_inconsistent' }))).toMatchObject({ view: ENTRY_VIEW.BLOCKED, canApply: false, ownerOnly: false });
    expect(commerceEntryView(entry({ state: 'blocked', blockedReason: 'owner_required' })).ownerOnly).toBe(true);
    for (const bad of [null, undefined, {}, { state: 'ACTIVE' }, { state: 'weird', canApply: true }, { state: 5 }]) {
      const v = commerceEntryView(bad);
      expect(v.view).toBe(ENTRY_VIEW.BLOCKED);
      expect(v.canApply).toBe(false);
    }
  });
});

describe('commerceApplyFailureAction — a refusal is a state refresh, a generic message, or identity — never a raw code', () => {
  const err = (code) => ({ response: { data: { code, message: code } } });
  test.each([
    'CAPABILITY_APPLICATION_ALREADY_PENDING', 'CAPABILITY_ALREADY_ACTIVE', 'CAPABILITY_SUSPENDED',
    'CAPABILITY_REVOKED_REQUIRES_RECONCILIATION', 'LEGACY_PENDING_COMMERCE_REQUIRES_RECONCILIATION',
    'SELLER_APPLICATION_STATE_INCONSISTENT', 'BUSINESS_NOT_ACTIVE', 'WORKSPACE_NOT_ACTIVE',
    'BUSINESS_WORKSPACE_UNRESOLVED', 'BUSINESS_OWNER_REQUIRED',
  ])('%s => refresh (the server already knows the truth)', (code) => {
    expect(commerceApplyFailureAction(err(code))).toBe('refresh');
  });
  test.each(['VERIFICATION_REQUIRED', 'VERIFICATION_REJECTED'])('%s => identity flow', (code) => {
    expect(commerceApplyFailureAction(err(code))).toBe('verify');
  });
  test('anything else (network, 500, unknown code, no response) => generic', () => {
    for (const e of [err('SOMETHING_NEW'), new Error('Network Error'), {}, null, undefined, { response: {} }]) {
      expect(commerceApplyFailureAction(e)).toBe('generic');
    }
  });
});
