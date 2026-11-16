import React, { lazy } from 'react';

// Light first load (owner 2026-11-16): pages download when they are opened.
// If a page's file fails to arrive, try once more; if it is gone because a new KenteXa version
// replaced it, load the new version once (at most once a minute, so it can never loop).
const RELOAD_KEY = 'kx_chunk_reload_at';

export default function lazyPage(load) {
  return lazy(() => load()
    .catch(() => new Promise((resolve) => setTimeout(resolve, 1500)).then(load))
    .catch((err) => {
      try {
        const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 60000) {
          window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          return new Promise(() => {});
        }
      } catch { /* storage blocked: fall through to the page safety net */ }
      throw err;
    }));
}

/** What shows while a page downloads: KenteXa's name and a thin moving bar, never a blank screen. */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" data-testid="page-loading"
      style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#536471' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1419', letterSpacing: '-0.5px' }}>KenteXa</div>
      <div style={{ width: 120, height: 3, borderRadius: 2, background: '#eff3f4', overflow: 'hidden' }}>
        <div className="kx-loading-bar" style={{ width: '40%', height: '100%', background: '#1d9bf0', borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 14 }}>Inafungua…</div>
    </div>
  );
}
