// ── Service Worker — CAR Garantia CFMOTO ─────────────────────
const CACHE_NAME = 'car-garantia-v13';

// Apenas assets estáticos que raramente mudam
const STATIC_ASSETS = [
  '/CAR-CLAIM-CKD/',
  '/CAR-CLAIM-CKD/index.html',
  '/CAR-CLAIM-CKD/css/app.css',
  '/CAR-CLAIM-CKD/logo.png',
  '/CAR-CLAIM-CKD/manifest.json',
];

// Ficheiros JS — nunca pre-cached, sempre rede primeiro
const JS_PATTERN = /\/CAR-CLAIM-CKD\/js\/.*\.js$/;

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())  // activa imediatamente
  );
});

// ── Activate — limpa caches antigos e notifica clientes ───────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
});

// ── Mensagem do cliente para aplicar update ───────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Serviços externos — sempre da rede (nunca cachear)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('fonts.google') ||
    url.hostname.includes('railway.app')
  ) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // Ficheiros JS — rede primeiro, cache como fallback offline
  // Garante que o JS mais recente é sempre servido
  if (JS_PATTERN.test(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CSS / HTML / imagens — cache first, actualiza em background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
