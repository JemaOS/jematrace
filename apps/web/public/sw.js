/**
 * Service worker minimal : garde la coquille de l'application et les données du
 * monde en cache pour un démarrage instantané, et laisse toujours passer les
 * appels à l'API (ils dépendent du réseau et de l'IP du visiteur).
 *
 * Stratégie : réseau d'abord, cache en secours hors ligne. Un changement de
 * réseau (5G ↔ Wi-Fi) ne doit jamais servir une réponse périmée.
 */
const CACHE = 'jematrace-v2';
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
  // L'API n'est jamais mise en cache : la position du visiteur change avec le
  // réseau, et une réponse périmée donnerait une ville fausse.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
  );
});