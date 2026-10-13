# PALACO personal authentication service

## Implemented

A separate Node authentication service now sits behind the embassy access page. Login and account creation additionally require server-side safety approval. The public process has no trusted approval service connected, so those operations and private APIs remain on HOLD even if OIDC settings are present. See [SAFETY-APPROVAL.md](SAFETY-APPROVAL.md) and the implemented [signed HTTPS provider adapter](SAFETY-PROVIDER.md). It uses `express-openid-connect` for the OIDC authorization-code login, token validation and a signed, secure session-ID cookie. The callback additionally verifies the incoming RS256 ID-token signature with JOSE against the configured issuer's HTTPS discovery/JWKS metadata. Session contents remain on the server. The server checks a private issuer/subject-to-seat membership on each protected request. Login does not create or ratify ambassador appointments.

The public page is available as ordinary static presentation, but a functioning personal login requires this server, real provider configuration and a separately connected trusted safety verifier. GitHub Pages alone cannot run the authentication service.

## Runtime setup

Use Node 24 or newer. Install dependencies in this directory with `npm ci --ignore-scripts`, then run `npm start`. In production, put the service behind HTTPS. Configure only the actual reverse-proxy IP/CIDR if proxy trust is needed. See [DEPLOYMENT.md](DEPLOYMENT.md) for the isolated container, private Compose settings and Render blueprint.

The environment variable names are listed in `.env.example`. That file is documentation; the service does not automatically load it. Set secrets with the deployment environment's private configuration mechanism.

Required:
- `OIDC_ISSUER_BASE_URL`: the HTTPS issuer supported by the selected identity provider.
- `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`: a real confidential OIDC application.
- `PALACO_BASE_URL`: the application's exact HTTPS origin.
- `PALACO_SESSION_SECRET`: 32 random bytes encoded as 64 hex characters.
- `PALACO_MEMBERS_FILE`: an absolute private file path outside the repository and web root.
- `PALACO_AUTH_SAFETY_FILE`: an optional absolute private enrollment/configuration file for an independently connected safety provider. Empty, missing, incomplete or fixture configuration keeps authentication on HOLD. The path is configuration, not an approval flag.

Register `<PALACO_BASE_URL>/callback` as the OIDC callback at the provider. Configure its allowed logout destination to the exact application origin/access page supported by the middleware configuration. The provider must support authorization-code flow with PKCE for confidential clients, RS256 ID tokens, HTTPS discovery and JWKS. Copy its exact discovery issuer, including any trailing slash, into the issuer setting. Account security, verification, MFA and recovery are handled by the provider.

`NODE_ENV=development` permits a loopback HTTP application origin for local testing only; issuer transport remains HTTPS. Missing or invalid settings fail closed.

## Private seat memberships

Copy `members.example.json` to private storage outside the repository and protect it with operating-system access controls. Replace it atomically when changing memberships; never publish the runtime membership file.

A registry has `version: 1` and a `members` array. Each enabled record binds a verified provider issuer and immutable subject to exactly one canonical seat, with an optional expiration time. The actual field contract is enforced by `access-policy.mjs`.

There is no email-only authorization or automatic signup-to-seat assignment. The first provisional contact supplied in conversation still requires private provider enrollment and a verified subject. The other eleven people are unspecified. No contact, provider account or invitation has been provisioned by this code.

Do not reuse credentials when a successor takes a seat. Disable/revoke the old membership, enroll the new person and record the new binding. Membership is reloaded for every protected request; stale browser sessions cannot override a current denial. Runtime file protection and controlled writers remain an operator responsibility.

## Public and protected routes

- `GET /healthz`: service liveness.
- `GET /api/auth/status`: minimal availability/session status and mandatory `securityApproval`; HOLD masks authenticated status and seat data.
- `GET /login?seat=PALACO-AMB-01`: separately approved, validated seat-specific provider sign-in.
- `GET /signup?seat=PALACO-AMB-01`: separately approved Auth0 signup hint; no automatic seat assignment.
- `GET /callback`: pre-SDK safety check, OIDC callback, fresh safety recheck and membership admission.
- `GET /api/me`: the admitted person's seat and read-only application scope.
- `GET /api/seats/:seat`: same information only for the person's own seat.
- `POST /logout`: local application session logout with an origin check. A caller must not treat the browser-selected seat as permission.
- Exact public static assets only; backend/config/registry source is not served.

The read-only personal API grants no voting, independent acceptance, merge, release or execution right.

## Session deployment boundary

The initial server session store is bounded and in memory, for one server process. It keeps logout tombstones so a late concurrent response cannot restore a destroyed session ID. Restarting the process signs everybody out. Do not run several independent instances with this store; a durable shared store is required for that deployment.

The middleware owns state, nonce, PKCE, signed session IDs and cookie handling. JOSE supplies the explicit extra ID-token signature verification. Application code does not generate shared seat passwords or implement cryptographic login protocols.

## Tests and limitations

`npm test` runs application-level safety approval, access, callback, HTTP and session-store checks. Most identity fixtures stand in for a principal already verified upstream; the suite also uses the actual middleware to reject unsigned/forged session-ID cookies.

`npm run test:oidc` exercises the real middleware against a controlled HTTPS OIDC provider with synthetic principals and an explicit internal test approval evaluator. The runner creates an ephemeral test certificate, trusts it through the child process's extra CA setting and leaves production TLS validation intact. Discovery, code exchange, PKCE, nonce, audience, expiry, signatures, own-seat admission and logout are checked without enrolling a real person. A passing controlled-provider test does not establish that an external provider account works.

The pull-request workflow also runs browser checks for mobile/desktop access-page flows using controlled API responses, then builds and starts the actual nonroot image with read-only runtime restrictions. Container checks use an empty private fixture registry and verify that missing configuration or invalid membership data leaves personal access closed.

The public website is hosted at https://palaco-ambassades.onrender.com with personal access on HOLD. Real provider setup, trusted safety approval integration, private enrollment and a live login/callback/logout test remain necessary before reporting a working individual account. Validation runs in GitHub Actions. This code creates no provider client, accounts or invitations.
