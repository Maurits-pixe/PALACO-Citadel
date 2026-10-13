# PALACO RIO start v0.1

A small first client for mobile and desktop. The single HTML download has inline code/styles, no dependencies and no external loading. Desktop users open PALACO-RIO-v0.1.html in a browser. Mobile users open the HTTPS /rio/ page and add/install the web app using their browser. This is an installable web client, not an APK, EXE or App Store package.

The first version stores at most 24 contacts locally and demonstrates the explicit local NOVA/contact route. The two participants and nine bilateral controls are a local exercise. Messages stay in memory and disappear on page reload; contacts have bounded device-local browser storage with a memory fallback. No content is sent to another account or device. The local trial does not connect the draft encrypted recovery/outbox engine or certify identity, guardian evidence, encryption or production safety.

Eleven languages follow the existing PALACO portal. App and install instructions are responsive. No real ambassador login, appointment or governance authority is granted.

The manifest has standalone display and scoped /rio/ identity. Public PNG icons, manifest and HTML are cached by a service worker strictly within /rio/. Its exact allowlist never caches authentication pages, protected API responses or downloads. Old RIO cache versions alone are removed. The ambassador server adds only exact public app assets and a fixed attachment download; private file serving stays denied. CSP hashes cover the app's inline scripts.

The server returns the same self-contained HTML as /rio/ and /rio/download. Browser tests verify mobile/desktop local contact/consent behavior, actual attachment bytes, local-file operation, offline reopen, scoped cache isolation, language/RTL, safe text rendering and responsive layout. Chromium evidence does not certify every mobile OS browser; installation uses the supported browser's own menu when no install prompt is available.

This client is the first downloadable software; a hosted authenticated relay, actual two-device messaging, real identities, reviewed messaging cryptography and integration of the encrypted kernel remain separate work.

## NOVA online reception

The hosted /rio/nova/ page is a real server component: test requests are received, listed, held, resumed and withdrawn within a random browser test session. Version 0.2 adds an explicit transfer to reception followed by a first acceptance or refusal. This is a browser user’s reception-only choice, not a verified recipient identity. Holding an accepted request clears that choice and resumes at reception for a fresh acceptance; refusal, withdrawal and expiry clear the text and acceptance. First acceptance never opens a contact room or starts guardian checks. Version 0.3 adds an explicit server control-gate assessment after first acceptance: current browser session, reception choice, scope and lifetime are checked locally; the nine canonical specialties remain UNKNOWN on both sender and receiver sides, with STEWARD UNKNOWN. The outcome is HOLD while authentic providers and bilateral identity/evidence are absent. The assessment binds the exact receipt, current revision, acceptance and fixed expiry, and is cleared by subsequent choices, waiting or closure. Reference fixtures are not used as production evidence. The start app links to it explicitly; downloaded local files do not silently send data. Requests expire after five minutes and sessions after fifteen minutes, with bounded volatile process-memory storage. A server restart or deployment clears them. This is not a personal login or a peer contact/chat. Test text is visible to the server; no end-to-end encryption is claimed. See [NOVA-ONLINE.md](NOVA-ONLINE.md).

Predeployment checks run the isolated HTTP and browser suites. The published checks compare real HTTPS assets and exercise temporary test sessions on the live service after deployment. Before a new version is published, its published-assets parity check can fail against the previous live version; only that failed postdeployment job is rerun after the tested app is live.

## Veiligheidsgoedkeuring voor accounts

Inloggen en accountaanmaak vereisen ook een afzonderlijke, actuele veiligheidsgoedkeuring. De bestaande server blokkeert de inlogroute, aanmeldroute, callback en privégegevens zolang de vertrouwde veiligheidsdienst ontbreekt. Een NOVA-testsessie of lokale receptiekeuze geeft geen accounttoegang. De interne goedkeuringsprovider in gecontroleerde proeven is uitsluitend testapparatuur; er is nog geen echte veiligheidsdienst aangesloten.
