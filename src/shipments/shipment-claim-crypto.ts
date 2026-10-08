import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Walk-in claim credentials. A receipt secret is handed only to the sender
 * at intake; the OTP is delivered only to the stored sender phone.
 * Neither credential may be logged or stored in plaintext.
 */
export function newReceiptSecret(): string {
  return randomBytes(18).toString('hex');
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
