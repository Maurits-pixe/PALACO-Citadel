# PALACO personal authentication service

## Implemented

A separate Node authentication service now sits behind the embassy access page. It uses `express-openid-connect` for the OIDC authorization-code login, token validation and a signed, secure session-ID cookie. Session contents remain on the server. The server checks a private issuer/subject-to-seat membership on each protected request. Login does not create or ratify ambassador appointments.

The public page is available as ordinary static presentation, but a functioning personal login requires this server plus real provider configuration. GitHub Pages alone cannot run the authentication service.

## Runtime setup

Use Node 24 or newer. Install dependencies in this directory with `npm install --ignore-scripts`, then run `npm start`. In production, put the service behind HTTPS. Configure only the actual reverse-proxy IP/CIDR if proxy trust is needed.

The environment variable names are listed in `.env.example`. That file is documentation; the service does not automatically load it. Set secrets with the deployment environment's private configuration mechanism.

Required:
- `OIDC_ISSUER_BASE_URL`: the HTTPS issuer supported by the selected identity provider.
- `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`: a real confidential OIDC application.
- `PALACO_BASE_URL`: the application's exact HTTPS origin.
- `PALACO_SESSION_SECRET`: 32 random bytes encoded as 64 hex characters.
- `PALACO_MEMBERS_FILE`: an absolute private file path outside the repository and web root.

Register `<PALACO_BASE_URL>/callback` as the OIDC callback at the provider. Configure its allowed logout destination to the exact application origin/access page supported by the middleware configuration. The provider must support authorization-code flow for confidential clients. Account security, verification, MFA and recovery are handled by the provider.

`NODE_ENV=development` permits a loopback HTTP application origin for local testing only; issuer transport remains HTTPS. Missing or invalid settings fail closed.

## Private seat memberships

Copy `members.example.json` to private storage outside the repository and protect it with operating-system access controls. Replace it atomically when changing memberships; never publish the runtime membership file.

A registry has `version: 1` and a `members` array. Each enabled record binds a verified provider issuer and immutable subject to exactly one canonical seat, with an optional expiration time. The actual field contract is enforced by `access-policy.mjs`.

There is no email-only authorization or automatic signup-to-seat assignment. The first provisional contact supplied in conversation still requires private provider enrollment and a verified subject. The other eleven people are unspecified. No contact, provider account or invitation has been provisioned by this code.

Do not reuse credentials when a successor takes a seat. Disable/revoke the old membership, enroll the new person and record the new binding. Membership is reloaded for every protected request; stale browser sessions cannot override a current denial. Runtime file protection and controlled writers remain an operator responsibility.

## Public and protected routes

- `GET /healthz`: service liveness.
- `GET /api/auth/status`: minimal availability/session status; no email, subject or membership dump.
- `GET /login?seat=PALACO-AMB-01`: validated seat-specific provider sign-in.
- `GET /callback`: middleware OIDC callback and membership admission.
- `GET /api/me`: the admitted person's seat and read-only application scope.
- `GET /api/seats/:seat`: same information only for the person's own seat.
- `POST /logout`: local application session logout with an origin check. A caller must not treat the browser-selected seat as permission.
- Exact public static assets only; backend/config/registry source is not served.

The read-only personal API grants no voting, independent acceptance, merge, release or execution right.

## Session deployment boundary

The initial server session store is bounded and in memory, for one server process. It keeps logout tombstones so a late concurrent response cannot restore a destroyed session ID. Restarting the process signs everybody out. Do not run several independent instances with this store; a durable shared store is required for that deployment.

The middleware owns state, nonce, PKCE, signed session IDs and cookie handling. Application code does not generate shared seat passwords or implement cryptographic login protocols.

## Tests and limitations

`npm test` runs application-level negative tests against the access policy and server. Identity fixtures deliberately stand in for a principal already verified by the mature OIDC middleware; these tests do not claim to validate a real provider account or a live login.

The pull-request workflow performs the test run separately from deployment. A real provider callback/login/logout test, HTTPS deployment and private account enrollment are still necessary before reporting a working login.

Local command and Node startup currently fail on the desktop; implementation and review therefore use the GitHub source branch and its CI. No live URL, account credentials or successful personal login is asserted by this README.

Browser tests exercise availability, own-seat display, changed-seat denial, refreshed membership denial and viewport fit using controlled API responses. They complement the server access tests and do not claim a live identity-provider login.
