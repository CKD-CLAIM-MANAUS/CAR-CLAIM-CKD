// ── Service Worker — CAR Garantia CFMOTO ─────────────────────
const CACHE_NAME = 'car-garantia-v66';

// Assets estáticos — caminhos RELATIVOS ao scope do SW, para funcionar tanto
// no GitHub Pages (/CAR-CLAIM-CKD/) como no Cloudflare Pages (raiz /).
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/desktop.css',
  './logo.png',
  './manifest.json',
];

// Extensões tratadas como imagem (cache primeiro).
const IMG_PATTERN = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

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

  // ── Recursos externos passam DIRETO para a rede ──────────────
  // Firebase, Firestore, Cloudinary, backend Render, CDNs e fontes NÃO passam
  // pelo fetch() do SW — senão ficariam presos ao `connect-src` da CSP (em vez
  // de script-src/img-src/font-src) e seriam bloqueados no pages.dev.
  if (url.origin !== self.location.origin) return;

  // Só tratamos GET.
  if (event.request.method !== 'GET') return;

  // ── Imagens locais: CACHE PRIMEIRO ───────────────────────────
  // Rápido e seguro — imagens não afetam a lógica do app.
  if (IMG_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // ── App shell (HTML + CSS + JS): REDE PRIMEIRO ───────────────
  // Serve sempre a MESMA versão de HTML, CSS e JS juntos → elimina o
  // "version skew" (JS novo a correr sobre HTML/CSS antigos em cache) que
  // causava bugs de carregamento a cada deploy. O cache é só reserva offline.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.mode === 'navigate'
            ? caches.match('./index.html')
            : undefined)
        )
      )
  );
});
