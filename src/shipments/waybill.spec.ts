import { formatWaybill, luhnCheckDigit, normalizeWaybill } from './waybill';

const valid = (body: string) => 'KTX' + body + luhnCheckDigit(body);

describe('waybill', () => {
  it('accepts a valid waybill typed in any common way', () => {
    const wb = valid('482910375');
    expect(normalizeWaybill(wb)).toBe(wb);
    expect(normalizeWaybill(wb.toLowerCase())).toBe(wb);
    expect(normalizeWaybill(formatWaybill(wb))).toBe(wb);
    expect(normalizeWaybill(`KTX-${wb.slice(3, 7)}-${wb.slice(7)}`)).toBe(wb);
    expect(normalizeWaybill(wb.slice(3))).toBe(wb);
  });

  it('refuses any single mistyped digit', () => {
    const wb = valid('482910375');
    for (let i = 3; i < wb.length; i++) {
      const d = Number(wb[i]);
      const typo = wb.slice(0, i) + String((d + 1) % 10) + wb.slice(i + 1);
      expect(normalizeWaybill(typo)).toBeNull();
    }
  });

  it('never mistakes an old number for a waybill', () => {
    for (const old of ['KTX-ORD-12', 'KTX-SHP-1', 'KTX-PCL-9', 'KTX-OFFLINE-1-2', 'KTX-BATCH-3-4',
      'BULK-DAR-MZA-20261010-X7Q', 'Order #5', '42', '', undefined, null, 123]) {
      expect(normalizeWaybill(old)).toBeNull();
    }
  });

  it('prints in groups and leaves other numbers alone', () => {
    expect(formatWaybill('KTX4829103752')).toBe('KTX 4829 1037 52');
    expect(formatWaybill('KTX-ORD-12')).toBe('KTX-ORD-12');
    expect(formatWaybill(null)).toBe('');
  });

  it('uses the same check digit as the database function (known Luhn values)', () => {
    // 7992739871 -> check digit 3 is the standard Luhn example.
    expect(luhnCheckDigit('7992739871')).toBe(3);
    expect(luhnCheckDigit('000000000')).toBe(0);
  });
});
