import { enterPosApp } from './posApp';

test('the open till lives at /pos and offers the KenteXa POS app; leaving puts both back (owner 2026-11-03)', () => {
  const link = document.createElement('link');
  link.rel = 'manifest'; link.setAttribute('href', '/manifest.json');
  document.head.appendChild(link);
  window.history.replaceState(null, '', '/');
  const leave = enterPosApp();
  expect(window.location.pathname).toBe('/pos');
  expect(link.getAttribute('href')).toBe('/manifest-pos.json');
  leave();
  expect(window.location.pathname).toBe('/');
  expect(link.getAttribute('href')).toBe('/manifest.json');
  link.remove();
});
