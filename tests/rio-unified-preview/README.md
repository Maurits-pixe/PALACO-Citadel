# Unified static RIO browser regressions

Run with the repository's pinned Playwright and Chromium revision 1243:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '..\browser-runtime'
npx playwright test --config tests/rio-unified-preview/playwright.config.mjs
```

The suite builds the 22-file public bundle before each project's worker starts.
`language-continuity.spec.mjs` adds seven scenarios per surface: all eleven NOVA
explanations without storage/API access; plain-HTML fallback without scripts;
shared session language; safe app-only/invalid preferences; denied/quota storage;
real offline language navigation; and query precedence with a file-mode download
that never reads the new session-language preference. Contexts inherit the mobile
or desktop project settings. `nova-routes.spec.mjs` adds four scenarios per
surface: eleven translated route choices without background traffic or storage,
the script-free Dutch fallback, native keyboard popups intercepted locally to
verify destination/referrer/opener boundaries, and 320px layout with actual 200%
root text. `nova-language-handoff.spec.mjs` adds five cases per surface for
local-only language fragments, exact validation, keyboard focus, browser fallback,
script-free fallback, file-mode isolation and narrow layout. A sixth case per
surface checks all 18 source-language choices at 320px with actual 32px root/body
text, including wrapping mobile navigation. The complete suite now has 48 browser
cases, including the two worker migration cases below.

Run the build/HTTP tests and this suite sequentially: both rebuild the same fixed
generated directory. Do not rebuild it while a running fixture is serving it.
Its HTTP fixture serves only that generated directory, including the explicit
download file; it never runs the authentication server or exposes repository
sources. The normal fixture uses the builder's exported CSP. Only the popup
scenario issues the two fixed trial navigations, fulfilled entirely by a local
interception; no request is sent to the public trial service. Other cases expect
zero external requests.

Six scenarios run on mobile and desktop: mutual navigation and the seven
VisitCard translations; a read-only static NOVA page with PHONE-or-EMAIL design
explanation; eleven app translations and the actual downloaded file offline;
root-worker cache exclusions; an actual waiting worker update with both
the root and `/rio/` service workers active. The last scenario also reloads both
applications genuinely offline and checks preserved fictitious contacts. A sixth
scenario opens the local illustration and ELIXER dossier, explicitly consents to
one fictitious Engine memory, checks its cited answer, and exercises the separate
local chat without private API traffic or persisted memory/message content.

The cross-origin exclusion scenario uses a second local HTTP origin. Only that
isolated fixture extends `connect-src` to loopback so that CSP does not stop the
request before the service worker can be exercised. This is a cache-behaviour
probe, not a claim about production CSP accepting other origins. A sentinel in
the root CSS cache also detects query requests accidentally mutating an existing
cache entry.

`fixtures/root-v35-sw.js` preserves the worker source from commit
`efda74f0b8f2e91bd694c770564d29ca669ab846`, with line endings normalized.
It intentionally includes its old broad fetch handler and destructive cache
cleanup. It first activates in an empty, isolated profile; only afterward are the
app worker, app cache, unrelated cache and fictitious contact created. The current
v39 worker must then reach the real `waiting` state without reloading its open
client. Closing the root client allows activation while the app remains open.
The test proves migration from this fixed old worker/cache state; it does not
reconstruct the historical HTML or claim that the old cleanup was safe.

`language-worker-update.spec.mjs` also installs fixed root v37 and generated app
v5 workers from the previous bf6d865 preview. Both new workers must reach the
actual waiting state while their old pages remain open. Closing only the app
activates v7 while root v39 keeps waiting; closing the root then activates v39.
The fictitious contact, unrelated cache, separate registrations, new local
language links and genuine offline reloads remain intact. The existing app
worker keeps its scoped clients.claim; the root has neither clients.claim nor
skipWaiting. The fixture uses current generated HTML/assets, so this proves the
worker/cache transition rather than reconstructing every historical UI byte.

Fixed fixture provenance (LF bytes pinned by .gitattributes):
- root-v37-sw.js: bf6d8652e0785377325c78d219fb6f31e276533d:ambassades/rio/visitcard/sw.js,
  SHA256 a44e3295e908c92d83e7d92e9c32e89ae42079a6a7a8c9ca32f6d1a3c80bf742.
- app-v5-sw.js: generated render-dist/rio/sw.js from that same verified preview,
  SHA256 4af7f56c4ae3d4616d701ba697b2bee1a28aaf015f230b231c71c604753fac9f.

No test grants identity, verifies a real phone or email, starts a chat service,
contacts a person, deploys, or merges. Test output goes to
`artifacts/rio-unified-preview`.
