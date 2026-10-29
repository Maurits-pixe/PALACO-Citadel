/* PALACO OFFLINE-001 — public shell only. Never cache authority, identity or private API responses. */
const CACHE_NAME = 'palaco-rio-shell-v6';
const OFFLINE_PAGE = '/offline.html';
const SHELL_ASSETS = [
  '/', '/index.html', '/offline.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/assets/icon-192.svg', '/assets/icon-512.svg',
  '/atelier/wizard.html', '/atelier/wizard.css', '/atelier/wizard.js',
  '/DOCS/levensader-readonly/', '/DOCS/levensader-readonly/index.html'
];
const GUARDED_PREFIXES = [
  '/api/', '/auth/', '/account/', '/admin/', '/private/', '/registration/',
  '/rio/', '/login/', '/logout/', '/session/', '/oauth/', '/token/',
  '/permissions/', '/revoke/', '/identity/', '/users/', '/profile/', '/.well-known/'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Failure to cache the complete public shell aborts installation; do not claim offline readiness.
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('palaco-rio-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (GUARDED_PREFIXES.some((prefix) => url.pathname === prefix.slice(0, -1) || url.pathname.startsWith(prefix))) return;

  const isNavigation = request.mode === 'navigate';
  const isPublicShell = SHELL_ASSETS.includes(url.pathname);
  if (!isPublicShell && !isNavigation) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(new Request(request, { cache: 'no-cache' }));
      const control = response.headers.get('cache-control') || '';
      // Cache only allowlisted, non-redirected, non-private responses from this origin.
      if (isPublicShell && response.ok && !response.redirected &&
          response.type === 'basic' && !/\b(?:private|no-store)\b/i.test(control)) {
        await cache.put(url.pathname, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      if (isPublicShell) {
        const stored = await cache.match(url.pathname);
        if (stored) return stored;
      }
      if (isNavigation) {
        const fallback = await cache.match(OFFLINE_PAGE);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
