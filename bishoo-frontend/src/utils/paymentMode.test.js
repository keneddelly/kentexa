import { isDirectPaymentOrder, normalizePaymentMode } from './paymentMode';

jest.mock('../api/api', () => ({ get: jest.fn() }));

test('unknown or missing payment mode counts as cod_lipa (old screens never shown by mistake)', () => {
  expect(normalizePaymentMode(undefined)).toBe('cod_lipa');
  expect(normalizePaymentMode('weird')).toBe('cod_lipa');
  expect(normalizePaymentMode('online')).toBe('online');
});

test('only an order stamped cod_lipa is a direct-payment order', () => {
  expect(isDirectPaymentOrder({ paymentMode: 'cod_lipa' })).toBe(true);
  expect(isDirectPaymentOrder({ paymentMode: null })).toBe(false);
  expect(isDirectPaymentOrder(null)).toBe(false);
});
