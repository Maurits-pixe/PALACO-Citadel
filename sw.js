const CACHE_NAME = 'palaco-rio-shell-v13';
const SHELL_ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/assets/icon-192.svg', '/assets/icon-512.svg',
  '/atelier/wizard.html', '/atelier/wizard.css', '/atelier/wizard.js',
  '/DOCS/levensader-readonly/', '/DOCS/levensader-readonly/index.html',
  '/citadel/iii6v9/', '/citadel/iii6v9/index.html',
  '/citadel/iii6v9/iii6v9.css', '/citadel/iii6v9/iii6v9.js',
  '/citadel/bastion/', '/citadel/bastion/index.html',
  '/citadel/bastion/bastion.css', '/citadel/bastion/bastion.js',
  '/citadel/aegis/', '/citadel/aegis/index.html',
  '/citadel/aegis/aegis.css', '/citadel/aegis/aegis.js',
  '/citadel/bastion-app/', '/citadel/bastion-app/index.html',
  '/citadel/bastion-app/assets/bastion.css', '/citadel/bastion-app/assets/bastion.js',
  '/citadel/', '/citadel/index.html',
  '/citadel/assets/launcher.css', '/citadel/launcher.js'
];

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
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !SHELL_ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(new Request(event.request, { cache: 'no-cache' }));
      if (response.ok) {
        await cache.put(url.pathname, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      throw error;
    }
  })());
});
