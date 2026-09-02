/**
 * service-worker.js — KenteXa PWA Service Worker
 * Place at: public/service-worker.js
 *
 * Provides:
 * - Offline fallback page
 * - Cache-first for static assets
 * - Network-first for API calls
 * - Background sync for failed requests
 */

const CACHE_NAME    = 'kentexa-v1';
const API_CACHE     = 'kentexa-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
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
        keys.filter(k => k !== CACHE_NAME && k !== API_CACHE)
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

  // A bearer response belongs to one server-side role session. Never place it
  // in a shared service-worker cache where another context could replay it.
  if (request.headers.has('authorization')) {
    event.respondWith(fetch(request));
    return;
  }

  // API requests: network-first, cache as fallback
  if (url.hostname.includes('api.kentexa.com') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful GET API responses briefly
          if (response.ok && url.pathname.includes('/products')) {
            const clone = response.clone();
            caches.open(API_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('/') || new Response(
            '<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>📦 KenteXa</h2><p>Hakuna mtandao sasa hivi. Tafadhali angalia muunganisho wako.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
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
