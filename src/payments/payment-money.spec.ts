import { parseAmountToMinor, minorEquals, minorToDecimalString, isSupportedCurrency } from './payment-money';

describe('payment-money', () => {
  describe('parseAmountToMinor', () => {
    it('parses a plain number', () => {
      expect(parseAmountToMinor(36000)).toBe(3600000);
      expect(parseAmountToMinor(36000.5)).toBe(3600050);
    });
    it('parses a clean decimal string', () => {
      expect(parseAmountToMinor('36000')).toBe(3600000);
      expect(parseAmountToMinor('36000.00')).toBe(3600000);
      expect(parseAmountToMinor('36000.5')).toBe(3600050);
    });
    it('rejects a comma-grouped string ("36,000")', () => {
      expect(parseAmountToMinor('36,000')).toBeNull();
    });
    it('rejects a currency-prefixed string ("TZS 36000")', () => {
      expect(parseAmountToMinor('TZS 36000')).toBeNull();
    });
    it('rejects more than 2 decimal places', () => {
      expect(parseAmountToMinor('36000.123')).toBeNull();
    });
    it('rejects NaN/Infinity/empty/garbage', () => {
      expect(parseAmountToMinor(NaN)).toBeNull();
      expect(parseAmountToMinor(Infinity)).toBeNull();
      expect(parseAmountToMinor('')).toBeNull();
      expect(parseAmountToMinor('abc')).toBeNull();
      expect(parseAmountToMinor(null)).toBeNull();
      expect(parseAmountToMinor(undefined)).toBeNull();
      expect(parseAmountToMinor({})).toBeNull();
    });
    it('never uses float equality internally: 0.1+0.2-style amounts round to the cent', () => {
      expect(parseAmountToMinor(19.99)).toBe(1999);
      expect(parseAmountToMinor('19.99')).toBe(1999);
    });
  });

  describe('minorEquals', () => {
    it('is true only for equal, defined integers', () => {
      expect(minorEquals(3600000, 3600000)).toBe(true);
      expect(minorEquals(3600000, 3600001)).toBe(false);
      expect(minorEquals(null, 3600000)).toBe(false);
      expect(minorEquals(3600000, null)).toBe(false);
    });
  });

  it('minorToDecimalString round-trips', () => {
    expect(minorToDecimalString(3600050)).toBe('36000.50');
  });

  it('isSupportedCurrency only accepts TZS', () => {
    expect(isSupportedCurrency('TZS')).toBe(true);
    expect(isSupportedCurrency('USD')).toBe(false);
    expect(isSupportedCurrency('tzs')).toBe(false);
  });
});
