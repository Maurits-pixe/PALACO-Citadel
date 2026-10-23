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
text, including wrapping mobile navigation. The complete suite now has 78 browser
cases, including worker migration, departure and independent exercise-reset checks.

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
v42 worker must then reach the real `waiting` state without reloading its open
client. Closing the root client allows activation while the app remains open.
The test proves migration from this fixed old worker/cache state; it does not
reconstruct the historical HTML or claim that the old cleanup was safe.

`language-worker-update.spec.mjs` also installs fixed root v37 and generated app
v5 workers from the previous bf6d865 preview. Both new workers must reach the
actual waiting state while their old pages remain open. Closing only the app
activates v7 while root v42 keeps waiting; closing the root then activates v42.
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

`departure-choice.spec.mjs` protects temporary VisitCard chat drafts, visitor
messages, selected subjects and separate Engine drafts/dossiers. Only the two
RIO route links and three fixed external taskbar links are guarded. A native
dialog offers staying here or opening the checked public destination in a
noopener/noreferrer tab. Empty/welcome-only/cleared chats keep direct navigation;
same-page anchors, downloads and modified clicks retain browser behavior.
The app's existing `?lang=` parser receives only one of the seven public root
language codes in that new-tab link; NOVA keeps its existing language fragment.
No message, draft, subject or dossier is copied. Seven languages, Arabic RTL,
keyboard/Escape/backdrop/focus and 320px double-text layout are exercised.
Public destination responses are intercepted locally, never contacted.
These departure checks use the actual portable review server. Its unit test
accepts only `/rio/?lang=<known code>` as an additional raw public route;
other query fields, duplicates, encodings and path aliases remain closed.

`engine-clear.spec.mjs` adds six cases on each surface for independently emptying
the temporary Engine exercise. Its native confirmation starts on keeping the
exercise. Cancel, Escape and backdrop preserve all content; confirmation clears
memory/question drafts, consent, answers and the active dossier without a reload,
chat loss or subject loss. With the chat open, focus returns to its visible close
control; otherwise it returns to the memory field after clearing or the trigger
after cancellation. Center-point hit checks cover narrow and double-text layouts.
Successful memory replacement also hides and empties the previous answer before
the next question. Reset completes in the activation turn; a later native close event cannot steal
the next action's focus. Fresh consent/new IDs, seven languages/RTL, offline cache,
the departure guard and zero added API/storage writes are checked in isolated
profiles. Without scripts the reset control stays disabled.

`engine-session.test.mjs` adds four core tests, making 15 Node build/HTTP/core cases
in CI (one file-symlink case is skipped on Windows). Disposal replaces the current
serialized private snapshot with a content-free tombstone. The opaque ID remains
reserved; stale snapshots cannot perform any of the six mutations or recreate the
same ID. Other dossiers remain usable. Unknown, stale, altered and throwing inputs
fail closed. This is local runtime cleanup, not formal consent revocation or a
promise to erase caller-held copies, browser memory or historical screenshots.

`large-text-layout.spec.mjs` adds two cases per surface for seven-language chat
headers and all three confirmation dialogs. Narrow 320px and compact desktop
panels with actual 32px root/body text must give the title its full row and place
actions below it; a French word-range check detects the former split of
"bonjour". Ordinary 390px/1440px layouts and the expanded chat remain usable.
Each dialog must use its available width up to the existing cap, preserve vertical
scroll, and keep both native keyboard actions reachable. The checks preserve a
synthetic draft/subject and reject added storage, API or external traffic.
The earlier layout run proved containment/focus; the saved screenshot and raw
geometry are counterevidence to any broader claim that its title was readable.

No test grants identity, verifies a real phone or email, starts a chat service,
contacts a person, deploys, or merges. Test output goes to
`artifacts/rio-unified-preview`.
