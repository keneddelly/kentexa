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

test('the ofisi desk lives at /ofisi with its own KenteXa Ofisi app (owner 2026-11-03)', () => {
  const { enterWorkApp, workAppPage } = require('./posApp');
  expect(workAppPage('/ofisi')).toBe('SuperAgentDashboard');
  expect(workAppPage('/pos/')).toBe('POS');
  expect(workAppPage('/')).toBe(null);
  const link = document.createElement('link');
  link.rel = 'manifest'; link.setAttribute('href', '/manifest.json');
  document.head.appendChild(link);
  window.history.replaceState(null, '', '/');
  const leave = enterWorkApp('ofisi');
  expect(window.location.pathname).toBe('/ofisi');
  expect(link.getAttribute('href')).toBe('/manifest-ofisi.json');
  leave();
  expect(window.location.pathname).toBe('/');
  link.remove();
});
