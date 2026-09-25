const STATIC_CACHE = 'kentexa-static-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('kentexa-api-') || (key.startsWith('kentexa-') && key !== STATIC_CACHE))
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
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
