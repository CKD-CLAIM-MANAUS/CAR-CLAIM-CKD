// ── Service Worker — CAR Garantia CFMOTO ─────────────────────
const CACHE_NAME = 'car-garantia-v3';

// Ficheiros essenciais para funcionar offline
const STATIC_ASSETS = [
  '/CAR-CLAIM-CKD/',
  '/CAR-CLAIM-CKD/index.html',
  '/CAR-CLAIM-CKD/css/app.css',
  '/CAR-CLAIM-CKD/js/app.js',
  '/CAR-CLAIM-CKD/js/auth.js',
  '/CAR-CLAIM-CKD/js/camera.js',
  '/CAR-CLAIM-CKD/js/car.js',
  '/CAR-CLAIM-CKD/js/firebase.js',
  '/CAR-CLAIM-CKD/js/incidents.js',
  '/CAR-CLAIM-CKD/js/packList.js',
  '/CAR-CLAIM-CKD/js/qr.js',
  '/CAR-CLAIM-CKD/js/ui.js',
  '/CAR-CLAIM-CKD/logo.png',
  '/CAR-CLAIM-CKD/manifest.json',
];

// ── Install — guarda assets em cache ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate — limpa caches antigos ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch — serve do cache, actualiza em background ──────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase, Cloudinary, CDNs — sempre da rede
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('fonts.google')
  ) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // Assets estáticos — cache first, actualiza em background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
