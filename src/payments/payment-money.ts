/**
 * S0 — canonical money normalization for payment verification.
 *
 * Every amount that crosses a trust boundary (a provider's response, our own
 * DB decimal columns, a frontend-supplied number) gets parsed through here
 * into an integer "minor unit" (amount * 100, since every TZS column in this
 * schema is decimal(_, 2)) before it is ever compared. Never compare
 * currency as JS floats — 36000.10 * 3 style drift is exactly how a
 * generous rounding bug becomes a silent amount-mismatch bypass.
 *
 * An unparseable/ambiguous amount ("36,000", "TZS 36000", NaN, Infinity)
 * returns null rather than guessing — callers must treat null as "reject",
 * never as zero.
 */

const STRICT_DECIMAL = /^-?\d+(\.\d{1,2})?$/;

/** Parses a provider/DB amount (string or number) into integer minor units, or null if unparseable/ambiguous. */
export function parseAmountToMinor(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!STRICT_DECIMAL.test(trimmed)) return null; // rejects "36,000", "TZS 36000", "", etc.
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }
  return null;
}

/** Converts an already-computed minor-unit integer back to a decimal string for display/DB writes. */
export function minorToDecimalString(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function minorToNumber(minor: number): number {
  return Math.round(minor) / 100;
}

/** Strict integer-minor-unit equality — never `===` on raw decimals/floats. */
export function minorEquals(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Number.isInteger(a) && Number.isInteger(b) && a === b;
}

export const CURRENCY_TZS = 'TZS';

export function isSupportedCurrency(currency: unknown): currency is 'TZS' {
  return currency === CURRENCY_TZS;
}
