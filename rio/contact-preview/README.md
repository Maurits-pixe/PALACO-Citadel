# RIO contact windows — local reference v0.1

Two separated browser test contexts can now follow the complete request/reception/confirmation route into the durable SQLite reference outbox and local synthetic inbox. No real accounts, live bodyguards, E2EE transport, hosted relay, merge/release authority or production activation are created.

## Visible route

1. The sender enters artificial test text and explicitly starts a request. A synthetic INITIATED receipt is created for that action only.
2. The receiver sees a notification and the route **MELDING RIO (BINNEN)**, but no message content. NOVA_ADMIT admits the request into an isolated review preview; it does not open contact.
3. The host simulates the eighteen checks (nine specialties on both sides). The UI labels every result as simulated. After admission the exact text and its digests are available for review.
4. Each side separately selects FINAL_ACCEPT, bound to the current revision, full contract digest and evidence-set digest. Only both choices can commit the exact message to SQLite.
5. The queued sender explicitly requests delivery. A new challenge/round and a new sender initiation are created. The receiver explicitly admits NOVA for this delivery round.
6. New simulated checks and two new exact final choices are required. Only then can the existing outbox atomically insert the message into its **local synthetic inbox**.

The controller creates fresh Ed25519 keys, empty rounds and current timestamps. It does not call the old complete-consent fixtures or fabricate both final receipts automatically. Only the corresponding explicit action signs a human-stage reference receipt. A reference signature proves the test issuer and binding, not a physical human identity or the truth of a real safety service.

## Stops and changed choices

HOLD clears both pending final choices and disables final acceptance until the checks are explicitly refreshed. Refreshing checks changes the evidence digest/revision and discards both older choices. Changing checkpoint similarly requires new admission and choices. Stale revisions, old digests, role-forged bodies and conflicting action IDs are rejected. Identical repeats acknowledge the historical action without adding a fresh choice.

DECLINE and REVOKE return a generic closed outcome without private reasons. The controller invalidates both local choices immediately when revocation is attempted. If SQLite is temporarily busy, the request remains on HOLD and only a renewed decline/revoke action is allowed until the durable tombstone succeeds. A simulated FAIL follows the same closure rule; an UNKNOWN cannot provide final acceptance.

Expiration prevents new agreement. Already delivered records remain historical; the controller never claims to unsend them. Delivered recipient text is read from the validated SQLite inbox rather than presented as a made-up successful delivery.

## Separate sessions and loopback boundary

`startRioContactPreview({databasePath, classification:'SYNTHETIC_ONLY', now, simulateGuards, port:0})` starts only on 127.0.0.1. Its in-process return object contains the controller, origin, clean sender/receiver URLs, and caller-owned credentials for the two fixed test roles. The host provisions each separate cookie jar; there is no public bootstrap or real login endpoint. Session capabilities never appear in URLs, HTTP JSON, logs or artifacts.

The browser receives HttpOnly/SameSite=Strict role cookies and a session-scoped CSRF value in its authenticated state response. Requests must match the cookie-owned role. The body cannot select an account or role. POST additionally requires the exact same Origin, CSRF, JSON and bounded valid UTF-8. Unexpected Host values are rejected to resist DNS rebinding. GET only reads state/assets. There is no CORS or third-party resource dependency.

The local HTTP cookie cannot claim production HTTPS security or authenticate real people. Real account/identity provision and consent issuance remain separate future integrations.

The UI uses server-owned allowed actions, safe textContent, a restrictive Content Security Policy, keyboard focus management, an accessible notification/status area and a responsive layout. Polling reads every two seconds and never posts agreement. The client preserves an action ID for uncertain manual retries and does not automatically retry confirmations.

## Storage and restart limits

The outbox is file-backed and durable; the controller's signing keys, session capabilities, request list and pending choices are deliberately ephemeral. A restart invalidates those grants and does not restore conversation cards or automatically deliver existing queued records. Manual recovery/reconfirmation is future work; the storage API separately retains its queue, inbox, deduplication and revocation records.

Test text is stored as base64url opaque bytes, **not encryption**. Use artificial test content. Neither the database nor this preview is an E2EE message service.

The local controller retains at most 64 requests and 1024 action IDs per process. Existing outbox bounds apply separately. In-process host callbacks cannot reenter mutations while a choice is being processed.

## Verification and running the harness

Node 24 is required. Existing repository dependencies provide Playwright; no external account or API key is required.

```sh
npm run test:rio:contact
npm run test:rio:contact:browser
```

The browser suite provisions two separate HttpOnly cookie contexts through the trusted host API, verifies the entire route, tests safe text handling, decline, revocation and refreshed evidence, and records desktop/mobile screenshots. Traces, videos and cookie/session storage are not exported.

The workflow checks the source commit directly and uploads screenshots plus existing source/gate/outbox/kernel evidence. The UI is a local review harness; it is not deployed to the embassy website.

See [durable outbox](../REFERENCE-OUTBOX.md) and [signed evidence gate](../BRIGADE-EVIDENCE.md) for the lower-layer contracts and production integration limits.


Optional SYNTHETIC_ONLY OPAQUE_TRANSPORT hosts can supply a synchronous transportAuthority callback. It must return exactly true for the canonical payload at initiation and pending action/commit/delivery boundaries. Explicit invalid configuration rejects. The supplied [recovery registry](../encrypted-reference/RECOVERY.md) checks current public pins, exact send digest/context, expiry and sender signature. Stale payloads invalidate choices and durably close, or remain HOLD while closure is blocked. The existing TEXT preview does not use this gate.
