// ==========================================================================
// R&R Water Refilling Station - Service Worker (Offline-First PWA)
// ==========================================================================

const CACHE_NAME = 'rr-water-pos-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pos.html',
  '/pos.css',
  '/pos.js',
  '/manifest.json',
  '/assets/droppy_happy.png',
  '/assets/droppy_love.png',
  '/assets/droppy_question.png',
  '/assets/droppy_sad.png',
  '/assets/droppy_sleep.png',
  '/assets/droppy_winking.png',
  '/assets/water_jug_3d_render.png',
  '/assets/water_jug.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[ServiceWorker] Some assets could not be cached immediately:', err);
      });
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
  const url = new URL(event.request.url);

  // Network-only for API requests so transactions are always live with SQLite
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Stale-While-Revalidate for app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for navigation when completely offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
