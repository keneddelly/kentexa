import * as crypto from 'crypto';
import { CURRENCY_TZS } from './payment-money';

/**
 * S0 — PaymentEvidence: what makes a Payment row trustworthy proof that
 * money actually moved for a specific Order/Invoice obligation.
 *
 * The seal is the load-bearing piece. Only PaymentConfirmationService knows
 * PAYMENT_EVIDENCE_SEAL_KEY, so a `Payment` row inserted by a future bug (or
 * a direct DB write, or a copy-pasted `status: 'success'`) is NOT evidence —
 * it has no valid seal, so isValidEvidenceRow() rejects it. This is the
 * concrete answer to "a random Payment(status=success) must not be
 * sufficient financial authority" (see PaymentEvidence.md / Issue #10).
 *
 * Missing/misconfigured key = nothing can ever be sealed or verified =
 * nothing counts as evidence. Fail closed, not fail open.
 */

export type EvidenceProvider = 'clickpesa' | 'selcom' | 'admin_manual' | 'mock';

export const PROVIDER_EVIDENCE_ALLOWLIST: ReadonlySet<string> = new Set([
  'clickpesa',
  'selcom',
  'admin_manual',
]);

/** mock is evidence-eligible only outside production AND with an explicit opt-in — never by default, never in prod. */
export function isProviderAllowedForEvidence(provider: string): boolean {
  if (PROVIDER_EVIDENCE_ALLOWLIST.has(provider)) return true;
  if (provider === 'mock') {
    return process.env.NODE_ENV !== 'production' && process.env.PAYMENTS_ALLOW_MOCK === 'true';
  }
  return false;
}

export interface EvidenceSealInput {
  paymentId: number;
  orderId: number | null;
  invoiceNumber: string | null;
  amountMinor: number;
  currency: string;
  provider: string;
  providerReference: string | null;
  purpose: string;
}

function sealPayload(input: EvidenceSealInput): string {
  return [
    input.paymentId,
    input.orderId ?? '',
    input.invoiceNumber ?? '',
    input.amountMinor,
    input.currency,
    input.provider,
    input.providerReference ?? '',
    input.purpose,
  ].join('|');
}

/** Throws if PAYMENT_EVIDENCE_SEAL_KEY is not configured — sealing must never silently no-op. */
export function computeEvidenceSeal(input: EvidenceSealInput): string {
  const key = process.env.PAYMENT_EVIDENCE_SEAL_KEY;
  if (!key) {
    throw new Error('PAYMENT_EVIDENCE_SEAL_KEY is not configured — cannot seal payment evidence');
  }
  return crypto.createHmac('sha256', key).update(sealPayload(input)).digest('hex');
}

/** Never throws — a missing key or a malformed seal is simply "not valid evidence". */
export function verifyEvidenceSeal(input: EvidenceSealInput, seal: string | null | undefined): boolean {
  if (!seal || typeof seal !== 'string') return false;
  const key = process.env.PAYMENT_EVIDENCE_SEAL_KEY;
  if (!key) return false;
  let expected: string;
  try {
    expected = computeEvidenceSeal(input);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(seal, 'hex');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface EvidenceMetadata {
  purpose: string;
  currency: string;
  amountMinor: number;
  invoiceNumber?: string | null;
  invoiceType?: string;
  orderId?: number | null;
  seal: string;
  reversedAt?: string | null;
  [key: string]: unknown;
}

export function buildEvidenceMetadata(input: EvidenceSealInput, extra: Record<string, unknown> = {}): EvidenceMetadata {
  return {
    ...extra,
    purpose: input.purpose,
    currency: input.currency,
    amountMinor: input.amountMinor,
    invoiceNumber: input.invoiceNumber,
    orderId: input.orderId,
    seal: computeEvidenceSeal(input),
  };
}

/** A minimal shape of a `payment` row — kept structural so tests can pass plain objects, not entities. */
export interface EvidenceCandidateRow {
  id: number;
  status: string;
  provider: string;
  orderId: number | null;
  providerReference: string | null;
  metadata: string | null;
}

export interface EvidenceContext {
  orderId: number;
  purpose: string;
  invoiceNumber?: string | null;
}

/**
 * The core PaymentEvidence predicate (Decision 6): a Payment row counts as
 * evidence for `ctx` only if EVERY one of these holds — status success,
 * provider on the evidence allow-list, orderId bound to this exact order,
 * metadata parses and matches purpose/currency/invoice, amount is a real
 * positive integer minor amount, not reversed, and — the part nothing else
 * here can forge — the row carries a seal that verifies against its own
 * fields under our secret key.
 */
export function isValidEvidenceRow(
  row: EvidenceCandidateRow,
  ctx: EvidenceContext,
): { ok: true; amountMinor: number; providerReference: string } | { ok: false; reason: string } {
  if (row.status !== 'success') return { ok: false, reason: 'NOT_SUCCESS' };
  if (!isProviderAllowedForEvidence(row.provider)) return { ok: false, reason: 'PROVIDER_NOT_ALLOWED' };
  if (row.orderId !== ctx.orderId) return { ok: false, reason: 'ORDER_MISMATCH' };
  if (!row.providerReference) return { ok: false, reason: 'NO_PROVIDER_REFERENCE' };

  let meta: Partial<EvidenceMetadata>;
  try {
    meta = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    return { ok: false, reason: 'METADATA_UNPARSEABLE' };
  }

  if (meta.purpose !== ctx.purpose) return { ok: false, reason: 'PURPOSE_MISMATCH' };
  if (ctx.invoiceNumber && meta.invoiceNumber && meta.invoiceNumber !== ctx.invoiceNumber) {
    return { ok: false, reason: 'INVOICE_MISMATCH' };
  }
  if (meta.currency !== CURRENCY_TZS) return { ok: false, reason: 'CURRENCY_MISMATCH' };
  if (meta.reversedAt) return { ok: false, reason: 'REVERSED' };

  const amountMinor = Number(meta.amountMinor);
  if (!Number.isFinite(amountMinor) || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, reason: 'AMOUNT_INVALID' };
  }

  const sealOk = verifyEvidenceSeal(
    {
      paymentId: row.id,
      orderId: ctx.orderId,
      invoiceNumber: (meta.invoiceNumber as string | null) ?? null,
      amountMinor,
      currency: CURRENCY_TZS,
      provider: row.provider,
      providerReference: row.providerReference,
      purpose: ctx.purpose,
    },
    meta.seal ?? null,
  );
  if (!sealOk) return { ok: false, reason: 'SEAL_INVALID' };

  return { ok: true, amountMinor, providerReference: row.providerReference };
}

/**
 * Sums the distinct-by-providerReference valid evidence rows for an order
 * and reports whether it meets `requiredMinor`. Pure — callers fetch the
 * candidate rows (typically every Payment with this orderId, any status)
 * from wherever is convenient (repo, raw SQL, test fixture).
 */
export function sumValidEvidence(
  rows: EvidenceCandidateRow[],
  ctx: EvidenceContext,
): { totalMinor: number; validCount: number } {
  const seenReferences = new Set<string>();
  let totalMinor = 0;
  let validCount = 0;
  for (const row of rows) {
    const result = isValidEvidenceRow(row, ctx);
    if (!result.ok) continue;
    if (seenReferences.has(result.providerReference)) continue; // never double-count a reused reference
    seenReferences.add(result.providerReference);
    totalMinor += result.amountMinor;
    validCount += 1;
  }
  return { totalMinor, validCount };
}

export function isEvidenceSufficient(
  rows: EvidenceCandidateRow[],
  ctx: EvidenceContext,
  requiredMinor: number,
): boolean {
  if (requiredMinor <= 0) return true; // nothing owed — see deriveOrderPaymentObligation's caller for the zero-upfront-COD exception
  return sumValidEvidence(rows, ctx).totalMinor >= requiredMinor;
}
