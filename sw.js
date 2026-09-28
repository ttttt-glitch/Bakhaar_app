const CACHE_NAME = 'bakhaar-cache-v5';
const urlsToCache = [
  '/Bakhaar_app/',
  '/Bakhaar_app/index.html',
  '/Bakhaar_app/manifest.json'
];

// Install Event - Cache core files and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate Event - Clean up old cache versions immediately
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
    })
  );
  self.clientsClaim();
});

// Fetch Event - Serve from cache first, fallback to network, with offline navigation safety
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).catch(() => {
          // If offline and navigating pages, safely fallback to the cached app shell
          if (event.request.mode === 'navigate') {
            return caches.match('/Bakhaar_app/');
          }
        });
      })
  );
});
