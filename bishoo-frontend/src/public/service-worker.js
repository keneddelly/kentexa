/**
 * service-worker.js — KenteXa PWA Service Worker
 * Place at: public/service-worker.js
 *
 * Provides:
 * - Offline fallback page
 * - Cache-first for published static assets only
 * - Network-only for APIs, documents, and authenticated requests
 */

const CACHE_NAME    = 'kentexa-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/offline.html',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('bundle')))
        .catch(() => {}); // Don't fail install if some assets missing
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // The API lives on another origin in staging and production. Let the
  // browser handle it directly; never cache a transactional response as a
  // static asset merely because its hostname differs from api.kentexa.com.
  if (url.origin !== self.location.origin) return;

  // Authenticated and transactional responses must never enter a shared cache.
  if (request.headers.has('authorization')) {
    event.respondWith(fetch(request));
    return;
  }

  // Same-origin API requests, if any, are network-only.
  if (url.hostname.includes('api.kentexa.com') || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  const isStatic = url.pathname.startsWith('/static/') || url.pathname.startsWith('/icons/');
  if (!isStatic) return;
  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'KenteXa', {
      body:    data.body   || 'Una arifa mpya',
      icon:    '/icons/icon-192x192.png',
      badge:   '/icons/icon-72x72.png',
      data:    data.url    || '/',
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: 'Fungua' },
        { action: 'dismiss', title: 'Funga'  },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});
