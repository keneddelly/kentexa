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

// Owner 2026-11-17: the office / transporter invitation opens the application, also when signed in.
test('an invitation link (?join=) opens the application', () => {
  expect(linkPageFromAddress({ pathname: '/', search: '?join=office' })).toBe('BecomeSuperAgentInfo');
  expect(linkPageFromAddress({ pathname: '/', search: '?join=transport' })).toBe('BecomeTransportProvider');
  expect(linkPageFromAddress({ pathname: '/', search: '?join=other' })).toBeNull();
});

// Owner 2026-11-17: reloading on the login page while signed in never reopens it.
test('the login and sign-up pages are never reopened as a shared link', () => {
  expect(linkPageFromAddress({ pathname: '/p/PublicLogin' })).toBeNull();
  expect(linkPageFromAddress({ pathname: '/p/Register' })).toBeNull();
});
