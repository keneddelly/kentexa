import { generateProviderReference, isCompliantProviderReference } from './provider-reference';

describe('provider-reference', () => {
  it('generates an alphanumeric reference of at most 20 characters (ClickPesa orderReference limit)', () => {
    for (let i = 0; i < 50; i++) {
      const ref = generateProviderReference();
      expect(ref.length).toBeLessThanOrEqual(20);
      expect(ref).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('generates distinct references on successive calls', () => {
    const a = generateProviderReference();
    const b = generateProviderReference();
    expect(a).not.toBe(b);
  });

  it('isCompliantProviderReference rejects too-long or non-alphanumeric strings', () => {
    expect(isCompliantProviderReference('KNT-CUST-1-1234567890')).toBe(false); // hyphens
    expect(isCompliantProviderReference('A'.repeat(21))).toBe(false); // too long
    expect(isCompliantProviderReference('ABC123')).toBe(true);
  });
});
