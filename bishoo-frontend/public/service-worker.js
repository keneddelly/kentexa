const STATIC_CACHE = 'kentexa-static-v4';
// The till (/pos) must open without internet (owner 2026-10-27). Only that one page is kept:
// fetched from the network every time it can be, and the copy is used only when the
// network fails. No other page is ever served from a cache.
const POS_SHELL_CACHE = 'kentexa-pos-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('kentexa-api-') || (key.startsWith('kentexa-') && key !== STATIC_CACHE && key !== POS_SHELL_CACHE))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Phase B bearer responses are bound to one ActiveRoleSession. Protected
  // and API requests are deliberately network-only and never cached.
  if (request.headers.has('authorization')
      || url.hostname.includes('api.kentexa.com')
      || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (request.destination === 'document' && /^\/pos\/?$/.test(url.pathname)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const clone = response.clone();
        caches.open(POS_SHELL_CACHE).then((cache) => cache.put('/pos', clone));
      }
      return response;
    }).catch(() => caches.open(POS_SHELL_CACHE).then((cache) => cache.match('/pos')).then((cached) => cached || Response.error())));
    return;
  }
  // Never serve a stale document or cache a same-origin user image. Only
  // versioned build assets and the published Kentexa icon set are static.
  const isStatic = url.pathname.startsWith('/static/') ||
    /^\/(?:logo(?:192|512)\.png|favicon(?:-16|-32)?\.(?:png|ico)|icon-(?:source|maskable)\.svg)$/.test(url.pathname);
  if (!isStatic) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic' &&
          ['script', 'style', 'image', 'font'].includes(request.destination)) {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    })),
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || 'KenteXa', {
    body: data.body || '', icon: '/logo192.png', badge: '/favicon-32.png', data: data.url || '/',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data || '/', self.location.origin);
    if (target.origin !== self.location.origin) return;
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      try {
        // openWindow may only focus an already-running standalone app without
        // changing its route. Navigate that client explicitly first.
        const navigated = await existing.navigate(target.href);
        if (navigated) { await navigated.focus(); return; }
      } catch { /* Fall back to a new window if navigation is unavailable. */ }
    }
    await clients.openWindow(target.href);
  })());
});
