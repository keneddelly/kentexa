import { claimDigest, matchesClaimDigest, newClaimOtp, newReceiptSecret } from './shipment-claim-crypto';

describe('walk-in claim credentials', () => {
  const key = 'a-private-server-key-at-least-32-characters-long';

  it('generates receipt secrets with 144 bits of randomness', () => {
    const a = newReceiptSecret();
    expect(a).toMatch(/^[a-f0-9]{36}$/);
    expect(newReceiptSecret()).not.toEqual(a);
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
