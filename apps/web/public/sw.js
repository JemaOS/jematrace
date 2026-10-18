/**
 * Service worker minimal : garde la coquille de l'application et les données du
 * monde en cache pour un démarrage instantané, et laisse passer les appels à
 * l'API (ils dépendent du réseau).
 */
const CACHE = 'geotrace-v1';
const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest', '/world/world-110m.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Réseau d'abord pour les données du monde (elles changent rarement),
  // cache en secours hors ligne.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
  );
});
