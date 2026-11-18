/* PALACO Atlas offline shell v1.0 RC. No user content, credentials or API caching. */
const CACHE = "palaco-atlas-shell-v1-rc16";
const PREFIX = "palaco-atlas-shell-";
const ASSETS = [
  "./",
  "./index.html",
  "./kaartkamer.html",
  "./dossierinspectie.html",
  "./wereldregister.html",
  "./atlas-archief.html",
  "./atlas-verificatie.html",
  "./atlas-bewijs.html",
  "./atlas-provenance.html",
  "./atlas-trust-gateway.html",
  "./atlas-integratie.html",
  "./atlas-acceptatie.html",
  "./atlas-release-review.html",
  "./atlas-readiness.html",
  "./atlas-release-control.html",
  "./atlas-release-integrity.html",
  "./atlas-package-audit.html",
  "./atlas-security-audit.html",
  "./atlas-traceability.html",
  "./atlas-attestation.html",
  "./atlas-consolidatie.html",
  "./atlas-device-acceptance.html",
  "./atlas-device-handover.html",
  "./atlas-device-retest.html",
  "./atlas-contract.mjs",
  "./wereldregister.mjs",
  "./atlas-archief.mjs",
  "./atlas-verificatie.mjs",
  "./atlas-bewijs.mjs",
  "./atlas-provenance.mjs",
  "./atlas-trust-gateway.mjs",
  "./atlas-integratie.mjs",
  "./atlas-acceptatie.mjs",
  "./atlas-acceptatie-dossier.mjs",
  "./atlas-release-review.mjs",
  "./atlas-readiness.mjs",
  "./atlas-release-control.mjs",
  "./atlas-release-integrity.mjs",
  "./atlas-package-audit.mjs",
  "./atlas-security-audit.mjs",
  "./atlas-traceability.mjs",
  "./atlas-attestation.mjs",
  "./atlas-consolidatie.mjs",
  "./atlas-device-acceptance.mjs",
  "./atlas-device-handover.mjs",
  "./atlas-device-retest.mjs"
];
const urls = ASSETS.map(asset => new URL(asset, self.registration.scope));
const allowed = new Set(urls.map(url => url.pathname));
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(urls.map(url => url.href));
    } catch (error) {
      await caches.delete(CACHE);
      throw error; // Fail closed: no partial offline claim.
    }
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const existing = await caches.keys();
    await Promise.all(existing.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !allowed.has(url.pathname)) return;
  // No cache of query-bearing requests: only known static URLs are supported.
  if (url.search && !((url.pathname.endsWith("/index.html") || url.pathname.endsWith("/wereldatlas/")) && /^\?world=W-[0-9]{4}$/.test(url.search))) return;
  event.respondWith((async () => {
    const cached = await caches.match(new URL(url.pathname, self.location.origin).href, {ignoreSearch: true});
    if (cached) return cached;
    return fetch(request);
  })());
});
