import { linkPageFromAddress } from './urlSync';

// A shared link opened while signed in opens that page, not the role home (2026-11-10).
test('the page a shared link points to', () => {
  expect(linkPageFromAddress({ pathname: '/uza-tena' })).toBe('UzaTena');
  expect(linkPageFromAddress({ pathname: '/product/42-simu-samsung' })).toBe('ProductDetail-42');
  expect(linkPageFromAddress({ pathname: '/privacy' })).toBe('PrivacyPolicy');
  expect(linkPageFromAddress({ pathname: '/' })).toBeNull();
  expect(linkPageFromAddress({ pathname: '/pos' })).toBeNull();
  expect(linkPageFromAddress(null)).toBeNull();
});
