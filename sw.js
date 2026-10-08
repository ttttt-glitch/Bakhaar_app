// Service Worker for Xisaabta Ganacsigaaga
const CACHE_NAME = 'bakhaar-cache-v51';

// Must exist or the app will not install offline
const CORE_ASSETS = [
  '/Bakhaar_app/',
  '/Bakhaar_app/index.html',
  '/Bakhaar_app/manifest.json'
];

// Cached separately so a missing icon can never break the install
const OPTIONAL_ASSETS = [
  '/Bakhaar_app/icon-192.png',
  '/Bakhaar_app/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).then(() => {
        return Promise.all(
          OPTIONAL_ASSETS.map((url) => cache.add(url).catch(() => {}))
        );
      });
    })
  );
  // Forces the waiting service worker to become active immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Takes control of all open pages immediately without waiting for a restart
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/Bakhaar_app/index.html');
      }
    })
  );
});
