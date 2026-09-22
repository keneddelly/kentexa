import * as crypto from 'crypto';

/**
 * ClickPesa payload checksum, exactly per docs.clickpesa.com/home/checksum:
 * recursively sort object keys, JSON-stringify compactly, HMAC-SHA256 under
 * the checksum key, hex digest. Used to verify an INCOMING webhook payload
 * when checksum is enabled on the ClickPesa dashboard — an additional
 * authenticity signal layered on top of (never instead of) the mandatory
 * server-to-server verifyPayment() query.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = canonicalize((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

/** payload must NOT include `checksum`/`checksumMethod` — strip them before calling this, per the docs' own warning. */
export function computeClickPesaChecksum(checksumKey: string, payload: Record<string, unknown>): string {
  const canonical = canonicalize(payload);
  const json = JSON.stringify(canonical);
  return crypto.createHmac('sha256', checksumKey).update(json).digest('hex');
}

export function verifyClickPesaChecksum(
  checksumKey: string,
  payload: Record<string, unknown>,
  checksum: string | undefined | null,
): boolean {
  if (!checksum) return false;
  const expected = computeClickPesaChecksum(checksumKey, payload);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(checksum, 'hex');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Strips checksum/checksumMethod, matching the docs' exclusion rule before recomputing. */
export function stripChecksumFields<T extends Record<string, unknown>>(payload: T): Omit<T, 'checksum' | 'checksumMethod'> {
  const { checksum, checksumMethod, ...rest } = payload as any;
  return rest;
}
