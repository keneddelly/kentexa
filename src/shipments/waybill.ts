/**
 * Waybill numbers (marketplace-basic step 2): one number per parcel from
 * pickup to delivery, whatever way the parcel started.
 *
 * Stored form: KTX + 9 random digits + 1 Luhn check digit (KTX4829103752).
 * The database generates it (migration 1791600000000); this file only reads
 * what people type and prints it nicely. The check digit lets a mistyped
 * number be refused before any lookup.
 */

export const WAYBILL_PATTERN = /^KTX\d{10}$/;

export function luhnCheckDigit(body: string): number {
  let total = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let digit = Number(body[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
    double = !double;
  }
  return (10 - (total % 10)) % 10;
}

/**
 * The stored waybill for whatever a person typed ("ktx 4829 1037 52",
 * "KTX-4829-1037-52", or the 10 digits alone), or null when it is not a
 * valid waybill. Old numbers (KTX-ORD-…, KTX-SHP-…) always return null.
 */
export function normalizeWaybill(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{10}$/.test(value)) value = 'KTX' + value;
  if (!WAYBILL_PATTERN.test(value)) return null;
  const digits = value.slice(3);
  return luhnCheckDigit(digits.slice(0, 9)) === Number(digits[9]) ? value : null;
}

/** "KTX4829103752" -> "KTX 4829 1037 52". Anything else is returned as given. */
export function formatWaybill(value: string | null | undefined): string {
  if (!value || !WAYBILL_PATTERN.test(value)) return value ?? '';
  return `KTX ${value.slice(3, 7)} ${value.slice(7, 11)} ${value.slice(11)}`;
}
