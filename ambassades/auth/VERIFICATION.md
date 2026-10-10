# Personal login verification boundaries

Use Node 24. Run `npm ci --ignore-scripts` and `npm test` in this directory.

The application suite contains 41 checks: 9 membership-policy, 17 HTTP/configuration, 7 callback-admission and 8 server-session checks. Identity fixtures explicitly assume upstream validation. The actual middleware also rejects unsigned and incorrectly signed session IDs.

Run `npm run test:oidc` for thirteen integration scenarios. These use the real OIDC middleware, an HTTPS loopback provider, ephemeral RSA signing keys and a private synthetic membership file. The runner creates a one-day test CA certificate and trusts it only in the fresh test child. TLS validation stays enabled. Scenarios cover discovery/code exchange with matching PKCE, secure signed cookies, wrong signatures/nonce/audience/issuer/expiry, transaction state/cookie failure, unlisted and wrong-seat principals, account switching, revocation and signed-cookie replay after logout.

The browser suite has five scenarios on each of mobile and desktop Chromium. Run `npx playwright test tests/browser/ambassades-auth.spec.mjs` from the repository root after installing the browser dependencies and Chromium. It uses controlled API responses rather than real user accounts.

The PR workflow also builds the isolated production image, validates the Compose configuration and starts the image as its nonroot user under read-only filesystem restrictions. Container smoke checks verify public pages, absence of runtime/private publication and closed personal access with missing configuration or invalid registry data. Fixture secrets belong only to disposable local tests.

## What the checks establish

Configuration and authorization fail closed. Unknown, wrong-seat, suspended, expired and revoked memberships do not receive protected application metadata. Callback admission explicitly verifies the incoming RS256 ID token with JOSE using the configured HTTPS issuer's discovery/JWKS metadata, then matches exact issuer/subject membership. Public serving excludes backend sources and private records. Signed session IDs are required; destroyed sessions cannot be restored by a late response. The access page closes its personal display when current status denies access.

## What remains to verify against a real provider

A real enrolled account must complete provider login, exact callback, signed session creation, own-seat access and logout over the selected host's HTTPS origin. A different enrolled person must be denied that seat. Confirm the issuer/subject mapping from the provider's verified identity and test the selected provider's recovery/MFA configuration.

Synthetic HTTPS-provider integration demonstrates the protocol/application path, not real provider provisioning, account enrollment or publication. No real contact or enabled runtime membership is included.

The bounded session store supports one process. Restart ends its sessions; several independent instances require a shared durable store. No test or login grants operative Government, voting, acceptance, merge, release or execution authority.

For the exact tested source and results, use PR #34's checks. A passing workflow is not deployment, enrollment or account activation.
