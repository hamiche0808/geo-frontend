/* Service Worker for GeoLoc PWA - cache statique + mise à jour automatique */
const CACHE_NAME = 'geoloc-v1';
const STATIC_URLS = [
  '/',
  '/static/js/main.d8052f2a.js',
  '/static/css/main.97edd661.css',
  '/static/js/453.ae5edcc7.chunk.js',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_URLS);
    })
  );
  // Ne pas skipWaiting immédiatement → on laisse le client décider
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// Recevoir l'ordre du client de passer en attente → actif
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
