import { createHash } from 'crypto';
import { hashPin } from './pos-cashier.service';

// "Badilisha mhudumu" (owner approved 2026-11-03): the till checks a PIN offline with the same hash.
describe('cashier PIN', () => {
  it('is SHA-256 of salt + PIN (what the till computes with SubtleCrypto)', () => {
    expect(hashPin('a1b2', '1234')).toBe(createHash('sha256').update('a1b21234').digest('hex'));
    expect(hashPin('a1b2', '1234')).not.toBe(hashPin('a1b3', '1234'));
  });
});
