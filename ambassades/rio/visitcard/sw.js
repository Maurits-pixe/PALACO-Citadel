'use strict';
const CACHE_NAME = 'palaco-rio-shell-v36-unified-preview';
const CACHE_PREFIX = 'palaco-rio-shell-';
const SHELL_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/rio-engine-web.mjs', '/engine.mjs', '/chat-preview.mjs', '/integration.mjs', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg', '/rio/reception/nova.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const path of SHELL_ASSETS) {
        const response = await fetch(new Request(path, { cache: 'reload', credentials: 'omit', redirect: 'error' }));
        if (!response.ok || response.type !== 'basic') throw new Error('SHELL_INSTALL_FAILED');
        await cache.put(path, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

// Let the browser wait for the old controlled pages to close before activating.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin
      || url.search || !SHELL_ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    return cached || fetch(event.request);
  })());
});
