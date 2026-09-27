import { getCheckoutRequestKey, clearCheckoutRequestKey } from './checkoutRequestKey';

jest.mock('./tokenStore', () => ({ getAccessToken: () => `x.${btoa(JSON.stringify({ sub: 42 }))}.x` }));

let sequence = 0;
beforeEach(() => {
  localStorage.clear();
  clearCheckoutRequestKey(7);
  sequence = 0;
  Object.defineProperty(window, 'crypto', {
    configurable: true, value: {
      randomUUID: jest.fn(() => '00539a79-7cc1-4332-bf88-' + String(++sequence).padStart(12, '0')),
    },
  });
});

test('a lost response uses the same request key after retry', () => {
  const key = getCheckoutRequestKey(7);
  expect(getCheckoutRequestKey(7)).toBe(key);
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(localStorage.getItem('kentexa_checkout_request_42_7')).not.toContain('productId');
});

test('the key changes only after the completed order is cleared', () => {
  const first = getCheckoutRequestKey(7);
  expect(getCheckoutRequestKey(7)).toBe(first);
  clearCheckoutRequestKey(7);
  expect(getCheckoutRequestKey(7)).not.toBe(first);
});
