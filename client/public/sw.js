// KinGuard Service Worker — production only (not registered in development)
//
// Caching strategy:
//   /assets/*  — cache-first (Vite hashes filenames; safe to cache permanently)
//   HTML nav   — network-first, cached index.html as offline fallback
//   /api/*     — network-only (never serve stale financial data from cache)
//   everything else — network-first, no cache

const CACHE_NAME = 'kinguard-v2';

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['/', '/favicon.svg', '/favicon.png']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // don't block install on cache failure
  );
});

// ── Activate: remove stale caches ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline — KinGuard</title>
     <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;background:#0f172a;color:#f1f5f9;text-align:center}
     h1{color:#dc2626;font-size:24px;margin-bottom:8px}p{color:#94a3b8;font-size:14px}</style></head>
     <body><div><h1>You are offline</h1><p>Please reconnect to use KinGuard.</p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

// ── Fetch: route-based caching strategy ───────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET — let POST/PATCH/DELETE pass through untouched
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // malformed URL — ignore
  }

  // ── API calls: always network, never cache ─────────────────────────────────
  if (url.pathname.startsWith('/api/')) return;

  // ── Vite-hashed assets: cache-first ───────────────────────────────────────
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(response => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
      })
    );
    return;
  }

  // ── HTML navigation: network-first, offline fallback ──────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            // Cache a copy of the shell for offline use
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put('/', clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Network failed — try the cached shell, fall back to inline offline page
          try {
            const cached = await caches.match('/');
            return cached || offlinePage();
          } catch {
            return offlinePage();
          }
        })
    );
    return;
  }

  // ── Everything else: network-first, no cache (favicons, manifests, etc.) ──
  event.respondWith(
    fetch(request).catch(() => new Response('', { status: 408, statusText: 'Offline' }))
  );
});
