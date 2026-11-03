/**
 * posApp.js — "one click to the till" (owner 2026-11-03: "we need user to not navigating long to find pos").
 * While the till is open its address is /pos and the page offers manifest-pos.json, so Chrome's
 * "Install" makes a separate "KenteXa POS" icon that opens straight on the till (also offline,
 * public/service-worker.js keeps /pos). Leaving the till puts the address and the main manifest back.
 */
export const POS_PATH = '/pos';
const POS_MANIFEST = '/manifest-pos.json';

export function enterPosApp() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const link = document.querySelector('link[rel="manifest"]');
  const before = link ? link.getAttribute('href') : null;
  const moved = window.location.pathname !== POS_PATH;
  try { if (moved) window.history.replaceState(window.history.state, '', `${POS_PATH}${window.location.hash}`); } catch (_) { /* address bar stays */ }
  if (link) link.setAttribute('href', POS_MANIFEST);
  return () => {
    if (link && before) link.setAttribute('href', before);
    try { if (moved && window.location.pathname === POS_PATH) window.history.replaceState(window.history.state, '', '/'); } catch (_) { /* ignore */ }
  };
}
