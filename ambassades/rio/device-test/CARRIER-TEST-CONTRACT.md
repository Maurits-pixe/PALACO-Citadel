# RIO carrierproef — Youfone → Lebara → Youfone

### Status
DRAFT ENGINEERING CANDIDATE · SYNTHETIC TEST CODES ONLY · PHYSICAL CARRIER ACCEPTANCE NOT RUN · DO NOT DEPLOY.

### Last Updated
2026-10-14

## Goal and validity
A self-operated first field test with physical phone **A on Youfone** and physical phone **B on Lebara** in the Netherlands. Both are different retail providers using the **KPN mobile network**. This tests a two-provider handoff over mobile data, **not** independence between two radio access networks. It does not compare carrier latency, internet routes or prove physical SIM identity. RIO cannot inspect or prove wifi state, cellular data, tethering or SIM operator from the web browser.

The existing two-browser challenge/response relay is used. The source of the temporary challenge code remains the server, and **the server can read it**; end-to-end encryption is not implemented. No real account, NOVA contact, personal message, paid service, invitation to a real identity or governance authority is granted. The service remains `TEST_ONLY`, `ACCOUNT-1 HOLD`, `accountActive=false`, `canOpenContact=false`.

## Operator procedure (two different physical phones)
On phone A (Youfone) and B (Lebara), separately:
1. Turn wifi **off**, turn mobile data **on**, turn hotspot/tethering **off** and confirm the other device uses the different provider. Check these four points manually on **each** device; the UI cannot verify them.
2. Start a new test pair on A and open the single-use invitation on B using their own mobile-data connection; no shared wifi or hotspot. Check identical pair ID on both displays.
3. Confirm participation on both, then separately check the four carrier boxes and press **Bevestig mijn toestelverklaring** on each phone. The server stores only one Boolean declaration per role for this pair, not phone numbers, SIM identifiers or radio information.
4. A sends the server-generated challenge; B explicitly acknowledges it, sends the same code back, and A acknowledges the reply. A successful two-way receipt requires both recipient acknowledgements.
5. Close the test on one device. **Only the device receiving the matching CLOSED server reply for that exact pair** can download a JSON result. The downloadable record contains pair ID, closed revision/time, declared brands/KPN, A/B consent and A/B self-declaration states, receipt Booleans and fixed `HOLD` gates. It **never** includes challenge codes, invitation token, session cookie, CSRF token, arbitrary text, IP addresses or phone numbers.
6. Keep the downloaded local result under owner-controlled storage if necessary. Losing it is not grounds to reopen the expired pair or retrieve old codes. The other phone has no separate download entitlement just from having seen the pair.

## State, evidence and failure semantics
- `WAITING_PEER → WAITING_ACCEPT → ACTIVE_TEST → CLOSED` remains the single server-controlled state sequence. Carrier mode is optional, preserving the original generic device test.
- Once carrier mode is entered by A or B, sending a new challenge is denied until **both** local role-bound declarations exist. No role may declare for the other role; all four fields must be Boolean `true` and the exact checked set.
- A temporary server receipt is generated **before** purging message content, then bound to the actual closed pair ID. Server close erases codes, removes the pair from volatile memory, and retains only the short-lived idempotent close receipt in the invoking guest session; no external reporting service or durable account storage.
- Client creates a JSON download **only after** matching `CLOSED` state, pair ID and strict known fields. A foreign/stale/malformed close response does not authorize an export. A retry with the same idempotency key may recover the exact closure receipt, never a new pair.
- Pending responses or out-of-order GETs must not redraw messages after close or expiry. A client lifecycle epoch invalidates previously outstanding refreshes; on close, code display stops immediately.
- Flags `challengeReceived`, `replyReceived` and `roundTripConfirmed` reflect **application-level acknowledged messages**, not independently witnessed delivery over a particular carrier. The file states `physicalCarrierVerified:false`.

## Acceptance boundaries and tests
Pre-publication automated checks: **22 server cases** (original 16 + 6 carrier tests), **18 browser cases** (nine cases × mobile-emulated/desktop), plus auth, runtime and container checks in the existing `ambassador-auth.yml`. Counts are test inventory, **not test results** until CI completes on this exact commit. Browser emulation is not a physical Youfone/Lebara test.

A physical field acceptance record requires actual independent observations of wifi-off, data-on, hotspot-off, carrier brand on each phone, exact pair ID, completion of both acknowledgements, downloadable redacted evidence and code disappearance after close. Any lost/late response, mismatched pair or uncertain radio path is `HOLD/FAIL`, not a silent success. Keep registration/contact/deployment decisions separate.

## Deployment gate
The old public RIO device-test service might be hosted at `https://palaco-ambassades.onrender.com/rio/device-test/`. This candidate is **not** a claim that the new carrier variant is deployed there. A deployment requires a separate human publication decision, passing exact-head CI and a reviewed runtime configuration. No merge, live test session or hosting change is part of creating the candidate.
