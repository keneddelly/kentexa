import {
  computeEvidenceSeal,
  verifyEvidenceSeal,
  isValidEvidenceRow,
  sumValidEvidence,
  isEvidenceSufficient,
  isProviderAllowedForEvidence,
  buildEvidenceMetadata,
  EvidenceCandidateRow,
} from './payment-evidence';

const sealInput = (over: Partial<Parameters<typeof computeEvidenceSeal>[0]> = {}) => ({
  paymentId: 1,
  orderId: 100,
  invoiceNumber: null,
  amountMinor: 3600000,
  currency: 'TZS',
  provider: 'clickpesa',
  providerReference: 'CP-REF-1',
  purpose: 'COD_DEPOSIT',
  ...over,
});

describe('payment-evidence seal', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, PAYMENT_EVIDENCE_SEAL_KEY: 'test-seal-key-do-not-use-in-prod' };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('computeEvidenceSeal throws when the key is not configured (fail closed at startup, not silently)', () => {
    delete (process.env as any).PAYMENT_EVIDENCE_SEAL_KEY;
    expect(() => computeEvidenceSeal(sealInput())).toThrow(/PAYMENT_EVIDENCE_SEAL_KEY/);
  });

  it('a correctly computed seal verifies', () => {
    const seal = computeEvidenceSeal(sealInput());
    expect(verifyEvidenceSeal(sealInput(), seal)).toBe(true);
  });

  it('verifyEvidenceSeal is false, never throws, when the key is missing', () => {
    const seal = computeEvidenceSeal(sealInput());
    delete (process.env as any).PAYMENT_EVIDENCE_SEAL_KEY;
    expect(verifyEvidenceSeal(sealInput(), seal)).toBe(false);
  });

  it('changing ANY sealed field invalidates the seal (amount, order, provider, reference, purpose)', () => {
    const seal = computeEvidenceSeal(sealInput());
    expect(verifyEvidenceSeal(sealInput({ amountMinor: 3600001 }), seal)).toBe(false);
    expect(verifyEvidenceSeal(sealInput({ orderId: 999 }), seal)).toBe(false);
    expect(verifyEvidenceSeal(sealInput({ provider: 'selcom' }), seal)).toBe(false);
    expect(verifyEvidenceSeal(sealInput({ providerReference: 'OTHER' }), seal)).toBe(false);
    expect(verifyEvidenceSeal(sealInput({ purpose: 'ORDER_FULL' }), seal)).toBe(false);
  });

  it('a garbage/malformed seal never throws and is rejected', () => {
    expect(verifyEvidenceSeal(sealInput(), 'not-hex-garbage')).toBe(false);
    expect(verifyEvidenceSeal(sealInput(), '')).toBe(false);
    expect(verifyEvidenceSeal(sealInput(), null)).toBe(false);
    expect(verifyEvidenceSeal(sealInput(), undefined)).toBe(false);
  });

  it('buildEvidenceMetadata produces a metadata blob whose seal round-trips through isValidEvidenceRow', () => {
    const meta = buildEvidenceMetadata(sealInput());
    const row: EvidenceCandidateRow = {
      id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1',
      metadata: JSON.stringify(meta),
    };
    const result = isValidEvidenceRow(row, { orderId: 100, purpose: 'COD_DEPOSIT' });
    expect(result).toMatchObject({ ok: true, amountMinor: 3600000, providerReference: 'CP-REF-1' });
  });
});

describe('isProviderAllowedForEvidence', () => {
  const OLD_ENV = process.env;
  afterEach(() => { process.env = OLD_ENV; });

  it('clickpesa, selcom, admin_manual are always allowed', () => {
    expect(isProviderAllowedForEvidence('clickpesa')).toBe(true);
    expect(isProviderAllowedForEvidence('selcom')).toBe(true);
    expect(isProviderAllowedForEvidence('admin_manual')).toBe(true);
  });
  it('airtel/vodacom/anything else is never allowed', () => {
    expect(isProviderAllowedForEvidence('airtel')).toBe(false);
    expect(isProviderAllowedForEvidence('vodacom')).toBe(false);
    expect(isProviderAllowedForEvidence('whatever')).toBe(false);
  });
  it('mock is allowed ONLY outside production AND with explicit opt-in', () => {
    process.env = { ...OLD_ENV, NODE_ENV: 'production', PAYMENTS_ALLOW_MOCK: 'true' };
    expect(isProviderAllowedForEvidence('mock')).toBe(false);
    process.env = { ...OLD_ENV, NODE_ENV: 'test', PAYMENTS_ALLOW_MOCK: undefined };
    expect(isProviderAllowedForEvidence('mock')).toBe(false);
    process.env = { ...OLD_ENV, NODE_ENV: 'test', PAYMENTS_ALLOW_MOCK: 'true' };
    expect(isProviderAllowedForEvidence('mock')).toBe(true);
  });
});

describe('isValidEvidenceRow / sumValidEvidence / isEvidenceSufficient — the PaymentEvidence predicate', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, PAYMENT_EVIDENCE_SEAL_KEY: 'test-seal-key' };
  });
  afterAll(() => { process.env = OLD_ENV; });

  const ctx = { orderId: 100, purpose: 'COD_DEPOSIT' };
  const validRow = (over: Partial<EvidenceCandidateRow> = {}, metaOver: Record<string, unknown> = {}): EvidenceCandidateRow => {
    const meta = buildEvidenceMetadata(sealInput({ paymentId: over.id ?? 1, providerReference: (over.providerReference as string) ?? 'CP-REF-1', ...metaOver as any }));
    return {
      id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1',
      metadata: JSON.stringify({ ...meta, ...metaOver }),
      ...over,
    };
  };

  it('§1 a random Payment(status=success) with NO seal is NOT sufficient evidence', () => {
    const forged: EvidenceCandidateRow = {
      id: 99, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'FORGED-REF',
      metadata: JSON.stringify({ purpose: 'COD_DEPOSIT', currency: 'TZS', amountMinor: 3600000 }), // no seal field
    };
    expect(isValidEvidenceRow(forged, ctx)).toMatchObject({ ok: false, reason: 'SEAL_INVALID' });
    expect(isEvidenceSufficient([forged], ctx, 3600000)).toBe(false);
  });

  it('a genuinely sealed row for this exact order/purpose is sufficient once it meets the required amount', () => {
    const row = validRow();
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: true, amountMinor: 3600000 });
    expect(isEvidenceSufficient([row], ctx, 3600000)).toBe(true);
    expect(isEvidenceSufficient([row], ctx, 3600001)).toBe(false);
  });

  it('a row sealed for a DIFFERENT order is rejected even if the metadata orderId is spoofed', () => {
    const row = validRow({ orderId: 999 });
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'ORDER_MISMATCH' });
  });

  it('a row for a different purpose (e.g. ORDER_FULL sealed, but COD_DEPOSIT required) is rejected', () => {
    const otherPurposeMeta = buildEvidenceMetadata(sealInput({ purpose: 'ORDER_FULL' }));
    const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(otherPurposeMeta) };
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'PURPOSE_MISMATCH' });
  });

  it('a non-TZS currency is rejected even with a valid-looking seal for that currency', () => {
    const meta = buildEvidenceMetadata(sealInput({ currency: 'USD' }));
    const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'CURRENCY_MISMATCH' });
  });

  it('a reversed/refunded payment stops counting as evidence', () => {
    const meta = { ...buildEvidenceMetadata(sealInput()), reversedAt: new Date().toISOString() };
    const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'REVERSED' });
  });

  it('a pending/failed payment never counts, regardless of its metadata', () => {
    const meta = buildEvidenceMetadata(sealInput());
    const row: EvidenceCandidateRow = { id: 1, status: 'pending', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'NOT_SUCCESS' });
  });

  it('a disallowed provider (airtel) never counts even with a perfect seal', () => {
    const meta = buildEvidenceMetadata(sealInput({ provider: 'airtel' }));
    const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'airtel', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
    expect(isValidEvidenceRow(row, ctx)).toMatchObject({ ok: false, reason: 'PROVIDER_NOT_ALLOWED' });
  });

  it('two rows sharing the same providerReference are only counted once', () => {
    const rowA = validRow({ id: 1 });
    const rowB = validRow({ id: 2 }); // same providerReference 'CP-REF-1'
    const { totalMinor, validCount } = sumValidEvidence([rowA, rowB], ctx);
    expect(validCount).toBe(1);
    expect(totalMinor).toBe(3600000);
  });

  it('two rows with distinct references for the same order sum correctly', () => {
    const meta2 = buildEvidenceMetadata(sealInput({ paymentId: 2, providerReference: 'CP-REF-2', amountMinor: 1000000 }));
    const rowA = validRow({ id: 1 });
    const rowB: EvidenceCandidateRow = { id: 2, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-2', metadata: JSON.stringify(meta2) };
    const { totalMinor, validCount } = sumValidEvidence([rowA, rowB], ctx);
    expect(validCount).toBe(2);
    expect(totalMinor).toBe(4600000);
  });

  it('isEvidenceSufficient(requiredMinor<=0) is vacuously true (nothing owed)', () => {
    expect(isEvidenceSufficient([], ctx, 0)).toBe(true);
  });

  describe('C3 correction — exact invoice binding is actually enforced when an invoice is expected', () => {
    const ctxWithInvoice = { orderId: 100, purpose: 'COD_DEPOSIT', invoiceNumber: 'INV-100' };

    it('a row with NO invoiceNumber in its metadata is rejected once the caller expects one — previously this silently passed', () => {
      const meta = buildEvidenceMetadata(sealInput()); // sealed with invoiceNumber: null
      const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
      expect(isValidEvidenceRow(row, ctxWithInvoice)).toMatchObject({ ok: false, reason: 'INVOICE_MISMATCH' });
    });

    it('a row sealed for the CORRECT invoice number is valid evidence', () => {
      const meta = buildEvidenceMetadata(sealInput({ invoiceNumber: 'INV-100' }));
      const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
      expect(isValidEvidenceRow(row, ctxWithInvoice)).toMatchObject({ ok: true });
    });

    it('a row sealed for a DIFFERENT invoice number is rejected even though the order/purpose/amount all match', () => {
      const meta = buildEvidenceMetadata(sealInput({ invoiceNumber: 'INV-999' }));
      const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
      expect(isValidEvidenceRow(row, ctxWithInvoice)).toMatchObject({ ok: false, reason: 'INVOICE_MISMATCH' });
    });

    it('when the caller expects NO invoice (ctx.invoiceNumber null) a row with no invoiceNumber is still valid — this is the legitimate no-invoice case, not weakened', () => {
      const meta = buildEvidenceMetadata(sealInput());
      const row: EvidenceCandidateRow = { id: 1, status: 'success', provider: 'clickpesa', orderId: 100, providerReference: 'CP-REF-1', metadata: JSON.stringify(meta) };
      expect(isValidEvidenceRow(row, { orderId: 100, purpose: 'COD_DEPOSIT' })).toMatchObject({ ok: true });
    });
  });
});
