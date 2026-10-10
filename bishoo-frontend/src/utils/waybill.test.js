import { luhnCheckDigit, normalizeWaybill, formatWaybill } from './waybill';

const valid = (body) => 'KTX' + body + luhnCheckDigit(body);

test('accepts a valid waybill typed in any common way', () => {
  const wb = valid('482910375');
  expect(normalizeWaybill(wb)).toBe(wb);
  expect(normalizeWaybill(wb.toLowerCase())).toBe(wb);
  expect(normalizeWaybill(formatWaybill(wb))).toBe(wb);
  expect(normalizeWaybill('KTX-' + wb.slice(3, 7) + '-' + wb.slice(7))).toBe(wb);
  expect(normalizeWaybill(wb.slice(3))).toBe(wb);
});

test('refuses a mistyped digit and every old number format', () => {
  const wb = valid('482910375');
  const wrong = wb.slice(0, -1) + String((Number(wb.slice(-1)) + 1) % 10);
  expect(normalizeWaybill(wrong)).toBeNull();
  for (const old of ['KTX-ORD-12', 'KTX-SHP-1', 'KTX-PCL-9', 'KTX-OFFLINE-1-2', 'KTX-BATCH-3-4', '42', '', null]) {
    expect(normalizeWaybill(old)).toBeNull();
  }
});

test('prints in groups and leaves other numbers alone', () => {
  expect(formatWaybill('KTX4829103752')).toBe('KTX 4829 1037 52');
  expect(formatWaybill('KTX-ORD-12')).toBe('KTX-ORD-12');
  expect(formatWaybill(null)).toBe('');
});
