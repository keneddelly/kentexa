import { CLAIM_SECRET_ALPHABET, claimDigest, isReceiptSecretFormat, matchesClaimDigest, newClaimOtp, newReceiptSecret } from './shipment-claim-crypto';

describe('walk-in claim credentials', () => {
  const key = 'a-private-server-key-at-least-32-characters-long';

  it('Release C: new receipt secrets are 12 characters that cannot be confused (no 0/O, 1/I/L)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const s = newReceiptSecret();
      expect(s).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/);
      expect(s).not.toMatch(/[01ilo]/);
      seen.add(s);
    }
    expect(seen.size).toBe(500);
    expect(CLAIM_SECRET_ALPHABET).toHaveLength(31);
  });

  it('accepts the new format and the old 36-hex receipts; refuses anything else', () => {
    expect(isReceiptSecretFormat('k7mr2xq9pb4h')).toBe(true);
    expect(isReceiptSecretFormat('K7MR2XQ9PB4H')).toBe(true);
    expect(isReceiptSecretFormat('a'.repeat(36))).toBe(true);
    expect(isReceiptSecretFormat('k7mr2xq9pb4')).toBe(false);
    expect(isReceiptSecretFormat('k7mr2xq9pb4o')).toBe(false);
    expect(isReceiptSecretFormat('k7mr 2xq9 pb4h')).toBe(false);
    expect(isReceiptSecretFormat(undefined)).toBe(false);
  });
  it('generates fixed-length numeric OTPs', () => {
    expect(newClaimOtp()).toMatch(/^\d{6}$/);
  });

  it('binds digests to purpose and shipment', () => {
    const digest = claimDigest(key, 'receipt', 10, 'secret');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(matchesClaimDigest(digest, claimDigest(key, 'receipt', 10, 'secret'))).toBe(true);
    expect(matchesClaimDigest(digest, claimDigest(key, 'otp', 10, 'secret'))).toBe(false);
    expect(matchesClaimDigest(digest, claimDigest(key, 'receipt', 11, 'secret'))).toBe(false);
    expect(matchesClaimDigest(digest, claimDigest(key, 'receipt', 10, 'wrong'))).toBe(false);
  });

  it('rejects attempts to reuse the same code against a different shipment', () => {
    const code = '123456';
    const expected = claimDigest(key, 'otp', 101, code);
    expect(matchesClaimDigest(expected, claimDigest(key, 'otp', 102, code))).toBe(false);
  });

  it('rejects weak keys and malformed digests', () => {
    expect(() => claimDigest('short', 'otp', 1, '123456')).toThrow();
    expect(matchesClaimDigest('invalid', 'invalid')).toBe(false);
  });
});
