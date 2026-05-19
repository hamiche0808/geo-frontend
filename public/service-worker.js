// GeoLoc PWA Service Worker — version mp167mdf-vh57vp
// Mise à jour : ce commentaire change à chaque déploiement pour forcer la détection de mise à jour
const CACHE_NAME = 'geoloc-v1';
const TIMESTAMP = 'mp167mdf-vh57vp';

self.addEventListener('install', event => {
  // Ne PAS skipWaiting immédiatement → on laisse le client décider via le bouton "Mettre à jour"
  // Le client envoie 'SKIP_WAITING' via postMessage, géré plus bas
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

// Stratégie : Network First (site frais en ligne) / Stale-while-revalidate (assets)
self.addEventListener('fetch', event => {
  const { request } = event;
  // Ne pas intercepter les appels vers l'API (Railway + Render)
  if (request.url.includes('/api/') || request.url.includes('railway.app') || request.url.includes('render.com')) {
    return;
  }
  // Navigation (pages HTML) : Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }
  // Autres ressources : Stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(cached => {
        const fetchPromise = fetch(request).then(networkResp => {
          // Mettre en cache la réponse réseau si valide
          if (networkResp && networkResp.ok) {
            cache.put(request, networkResp.clone());
          }
          return networkResp;
        }).catch(() => cached);
        return cached || fetchPromise;
      });
    })
  );
});

// Recevoir l'ordre du client de passer en attente → actif
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
