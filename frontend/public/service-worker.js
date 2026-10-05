/* FashionHub service worker
 *
 * Strategy:
 *   - precache the HTML shell (tolerantly — one missing file must not fail install)
 *   - network-first for navigations, falling back to cache when offline
 *   - stale-while-revalidate for same-origin assets
 *   - never cache /api/* (prices and stock must always be fresh)
 *   - never intercept cross-origin requests (Unsplash, Google Fonts)
 */
const VERSION = 'fashionhub-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './shop.html',
  './product.html',
  './checkout.html',
  './lookbook.html',
  './order-success.html',
  './favicon.svg',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // allSettled: a single 404 must not abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed) console.warn(`[sw] ${failed} precache entr(y/ies) failed`);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

async function networkFirst(request, fallbackUrl) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = (await caches.match(request)) || (await caches.match(fallbackUrl));
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch other origins or the API.
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// Let pages force a cache refresh after a deploy.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
