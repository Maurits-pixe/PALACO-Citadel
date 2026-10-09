# Personal login verification boundaries

Run `npm ci --ignore-scripts` and `npm test` in this directory with Node 24.

The backend suite contains 41 checks:
- 9 membership policy checks;
- 17 HTTP/configuration checks, including the actual OIDC middleware rejecting unsigned and incorrectly signed session IDs;
- 7 callback-admission checks against the incoming SDK-validated token;
- 8 server session-store checks, including logout replay, stale response writes, expiry and capacity.

The browser suite has five scenarios on each of mobile and desktop Chromium. Run `npx playwright test tests/browser/ambassades-auth.spec.mjs` from the repository root after installing the existing browser dependencies and Chromium.

## What the checks establish

Configuration fails closed. Unauthenticated, unknown, wrong-seat, suspended, expired and revoked memberships do not receive protected application metadata. Public serving excludes backend sources and private records. Signed session IDs are required; destroyed sessions cannot be restored by a late response. The access page closes its personal display when current status denies access.

## What remains to verify against a real provider

A real enrolled account must complete provider login, exact callback, signed session creation, own-seat access and logout over HTTPS. A different enrolled person must be denied that seat. Confirm the issuer/subject mapping from the provider's verified identity, and test actual provider recovery/MFA as configured.

Most identity fixtures assume the upstream SDK has already validated a token. They are application authorization tests and do not demonstrate an actual account login. The real-middleware negative test checks local signed-session handling without provider discovery.

The bounded session store supports one process. Restart ends its sessions; several independent instances require a shared durable store. No test or login grants operative Government, voting, acceptance, merge, release or execution authority.

For the exact tested source and results, use the checks on PR #34. A passing workflow is not deployment, enrollment or account activation.
