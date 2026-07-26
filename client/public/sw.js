// KinGuard Service Worker
// Strategy:
//   - Static assets (JS, CSS, images): Cache-first with network fallback
//   - HTML shell (index.html):          Network-first with cache fallback
//   - API calls (/api/*):               Network-only (never serve stale financial data)
//   - Offline fallback:                 Show cached index.html so the React app can render

const CACHE_NAME   = 'kinguard-v1';
const SHELL_ROUTES = ['/', '/login', '/change-password', '/profile'];

// Install: pre-cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['/', '/favicon.svg', '/favicon.png']))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: apply caching strategy based on request type
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET requests or API calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Static hashed assets (Vite bundles: filenames contain content hash)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation requests — network first, cache fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/').then(r => r || new Response('Offline — please reconnect to use KinGuard', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })))
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
