/**
 * posApp.js — "one click to work" (owner 2026-11-03: "we need user to not navigating long to find pos";
 * "make it easy for even Ofisi/pos user to install it on their phone because they use it daily").
 * While the till (/pos) or the ofisi desk (/ofisi) is open, the address is that path and the page
 * offers its own manifest, so installing makes a separate "KenteXa POS" / "KenteXa Ofisi" icon that
 * opens straight there (the till also offline, public/service-worker.js keeps /pos). Leaving puts
 * the address and the main manifest back.
 */
export const WORK_APPS = {
  pos: { path: '/pos', manifest: '/manifest-pos.json', page: 'POS', name: 'KenteXa POS' },
  ofisi: { path: '/ofisi', manifest: '/manifest-ofisi.json', page: 'SuperAgentDashboard', name: 'KenteXa Ofisi' },
};
export const POS_PATH = WORK_APPS.pos.path;

/** The App page a work-app address opens on ('POS', 'SuperAgentDashboard'), or null. */
export const workAppPage = (pathname) => {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  const app = Object.values(WORK_APPS).find((a) => a.path === p);
  return app ? app.page : null;
};

export function enterWorkApp(kind) {
  const app = WORK_APPS[kind];
  if (!app || typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const link = document.querySelector('link[rel="manifest"]');
  const before = link ? link.getAttribute('href') : null;
  const moved = window.location.pathname !== app.path;
  try { if (moved) window.history.replaceState(window.history.state, '', `${app.path}${window.location.hash}`); } catch (_) { /* address bar stays */ }
  if (link) link.setAttribute('href', app.manifest);
  return () => {
    if (link && before) link.setAttribute('href', before);
    try { if (moved && window.location.pathname === app.path) window.history.replaceState(window.history.state, '', '/'); } catch (_) { /* ignore */ }
  };
}

export const enterPosApp = () => enterWorkApp('pos');
