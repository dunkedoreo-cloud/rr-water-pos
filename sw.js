// ==========================================================================
// R&R Water Refilling Station - Service Worker (Offline-First PWA)
// ==========================================================================

const CACHE_NAME = 'rr-water-pos-v2.8.42';
const STATIC_ASSETS = [
  './',
  './index.html',
  './pos.html',
  './dev.html',
  './pos.css?v=2.8.42',
  './supabase_config.js?v=2.8.42',
  './pos.js?v=2.8.42',
  './manifest.json',
  './assets/droppy_happy.png',
  './assets/droppy_love.png',
  './assets/droppy_question.png',
  './assets/droppy_sad.png',
  './assets/droppy_sleep.png',
  './assets/droppy_winking.png',
  './assets/water_jug_3d_render.png',
  './assets/water_jug.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets v2.8.42');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle HTTP / HTTPS requests (ignore chrome-extension://, moz-extension://, etc.)
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  const url = new URL(event.request.url);

  // Network-only for API requests so transactions are always live
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return;
  }

  // Network-First for HTML, JS, CSS to guarantee fresh updates on deployment
  const isCodeAsset = event.request.mode === 'navigate' ||
                      url.pathname.endsWith('.html') ||
                      url.pathname.endsWith('.js') ||
                      url.pathname.endsWith('.css');

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith('http')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(event.request, responseToCache); } catch(e) {}
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
        });
      })
    );
    return;
  }

  // Cache-First with Network fallback for static images & fonts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith('http')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try { cache.put(event.request, responseToCache); } catch(e) {}
          });
        }
        return networkResponse;
      });
    })
  );
});
