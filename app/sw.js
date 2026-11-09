// Service worker: de app werkt ook zonder internet (met de prijzen van de laatste keer).
//  - app-bestanden: meteen uit de cache, op de achtergrond bijwerken
//  - prijzen (../data/*.json): eerst van internet, anders uit de cache
const CACHE = 'boodschappen-v3';
const SCHIL = [
  './', './index.html', './style.css', './app.js', './zoeken.js', './suggesties.js', './manifest.webmanifest',
  './icoon.svg', './icoon-192.png', './icoon-512.png', './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(request)
        .then((antwoord) => {
          if (antwoord.ok) {
            const kopie = antwoord.clone();
            caches.open(CACHE).then((c) => c.put(request, kopie));
          }
          return antwoord;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((c) => c ?? Response.error())),
    );
    return;
  }

  const lettertype = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin === location.origin || lettertype) {
    e.respondWith(
      caches.match(request).then((uitCache) => {
        const vers = fetch(request)
          .then((antwoord) => {
            if (antwoord.ok || antwoord.type === 'opaque') {
              const kopie = antwoord.clone();
              caches.open(CACHE).then((c) => c.put(request, kopie));
            }
            return antwoord;
          })
          .catch(() => uitCache ?? Response.error());
        return uitCache ?? vers;
      }),
    );
  }
});
