# Unified static RIO browser regressions

Run with the repository's pinned Playwright and Chromium revision 1243:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '..\browser-runtime'
npx playwright test --config tests/rio-unified-preview/playwright.config.mjs
```

The suite builds the 22-file public bundle before each project's worker starts.
Its HTTP fixture serves only that generated directory, including the explicit
download file; it never runs the authentication server or exposes repository
sources. The normal fixture uses the builder's exported CSP. No public online
trial is opened and no external request is expected.

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
v36 worker must then reach the real `waiting` state without reloading its open
client. Closing the root client allows activation while the app remains open.
The test proves migration from this fixed old worker/cache state; it does not
reconstruct the historical HTML or claim that the old cleanup was safe.

No test grants identity, verifies a real phone or email, starts a chat service,
contacts a person, deploys, or merges. Test output goes to
`artifacts/rio-unified-preview`.
