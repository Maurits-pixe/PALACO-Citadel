const CACHE_NAME = 'palaco-rio-shell-v5';
const SHELL_ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/assets/icon-192.svg', '/assets/icon-512.svg',
  '/atelier/wizard.html', '/atelier/wizard.css', '/atelier/wizard.js',
  '/DOCS/levensader-readonly/', '/DOCS/levensader-readonly/index.html'
];
const SHELL_PATHS = new Set(SHELL_ASSETS);

const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const requestUrl = new URL(request.url);
  const cacheKey = requestUrl.pathname;
  const cacheable = SHELL_PATHS.has(cacheKey);

  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (response.ok && cacheable) {
      await cache.put(cacheKey, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    if (request.mode === 'navigate' && (cacheKey === '/' || cacheKey === '/index.html')) {
      const fallback = await cache.match('/index.html');
      if (fallback) return fallback;
    }

    throw new Error(`Request failed for ${request.url}`);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('palaco-rio-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!isSameOrigin(event.request)) {
    return;
  }

  const requestPath = new URL(event.request.url).pathname;
  if (!SHELL_PATHS.has(requestPath)) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
