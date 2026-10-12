import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/**
 * Walk-in claim credentials. A receipt secret is handed only to the sender
 * at intake; the OTP is delivered only to the stored sender phone.
 * Neither credential may be logged or stored in plaintext.
 */
// Release C: 12 characters from 31 that cannot be confused when read from paper
// (no 0/O, 1/I/L): about 59 bits, behind the SMS code to the sender phone,
// 3 tries per hour and a 30-day expiry. Printed upper case in 3 groups of 4.
export const CLAIM_SECRET_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const NEW_SECRET = /^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/i;
const OLD_SECRET = /^[a-f0-9]{36}$/i; // receipts issued before Release C keep working

export function newReceiptSecret(): string {
  let secret = '';
  for (let i = 0; i < 12; i++) secret += CLAIM_SECRET_ALPHABET[randomInt(0, CLAIM_SECRET_ALPHABET.length)];
  return secret;
}

/** A receipt secret in either format (new 12-character or old 36-hex). */
export function isReceiptSecretFormat(value: unknown): value is string {
  return typeof value === 'string' && (NEW_SECRET.test(value) || OLD_SECRET.test(value));
}

export function newClaimOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function claimDigest(secret: string, purpose: 'receipt' | 'otp', shipmentId: number, value: string): string {
  if (!secret || secret.length < 32) throw new Error('SHIPMENT_CLAIM_HMAC_KEY must contain at least 32 characters');
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) throw new Error('Invalid shipment id');
  return createHmac('sha256', secret)
    .update(JSON.stringify([purpose, shipmentId, value]))
    .digest('hex');
}

export function matchesClaimDigest(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHex) || !/^[a-f0-9]{64}$/.test(actualHex)) return false;
  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}
