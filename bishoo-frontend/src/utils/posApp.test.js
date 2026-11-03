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

test('the iPhone icon, name and colour follow the open work app (owner 2026-11-03, logo option B)', () => {
  const { enterWorkApp } = require('./posApp');
  const tags = [['link', { rel: 'apple-touch-icon', href: '/logo512.png' }], ['meta', { name: 'apple-mobile-web-app-title', content: 'Kentexa' }], ['meta', { name: 'theme-color', content: '#1d4ed8' }]]
    .map(([tag, attrs]) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.head.appendChild(el); return el; });
  window.history.replaceState(null, '', '/');
  const leave = enterWorkApp('pos');
  expect(tags.map((el) => el.getAttribute(el.tagName === 'LINK' ? 'href' : 'content'))).toEqual(['/icon-pos-512.png', 'KenteXa POS', '#0f1419']);
  leave();
  expect(tags.map((el) => el.getAttribute(el.tagName === 'LINK' ? 'href' : 'content'))).toEqual(['/logo512.png', 'Kentexa', '#1d4ed8']);
  tags.forEach((el) => el.remove());
});
