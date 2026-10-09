# Personal ambassador access — implementation and activation boundary

The human owner requested individual logins for the twelve future ambassadors. A provisional first contact has been provided privately in the conversation; it is not published here.

## Implemented source

- `toegang.html` and `portal.js`: a server-connected access page, one entry point per seat, session status, own-seat metadata and application logout.
- `auth/server.mjs`: a real OIDC-backed Node application, unavailable without real confidential-client and private-registry configuration.
- `auth/access-policy.mjs`: server-side issuer/subject membership checks, single-seat binding, expiry and revocation.
- `access-slots.json`: public presentation reservations only; never an authorization source.
- `auth/test/` and the pull-request workflow: application security checks. A mocked verified principal is not proof of a live identity-provider integration.

## Activation still pending

Provider account/client setup, actual issuer/client secrets, HTTPS hosting, a protected membership file, verified personal enrollment and the real provider login/callback/logout test remain required. No accounts, passwords, invitation tokens or operative governance rights are created by the repository source.

The provisional first contact is not a ratified constitutional appointment. Login and read-only post access do not grant voting, acceptance, merge, release or execution authority. App enrollment can be independently scoped and recorded without activating Government authority.

## Privacy and operation

Use one immutable personal provider identity per person. Keep contacts, secrets and memberships in the private runtime, outside this public repository. Do not authorize from a selected post, browser storage or an unverified email claim. Do not transfer a predecessor's credentials.

Recheck current membership on protected requests; suspend, revoke and expire access through the private registry. Audit administrative changes using protected attributable records. Invitations or account-enrollment messages have not been sent.

See [auth/README.md](auth/README.md) for runtime setup, callback, routes and test limits. Charter: #32; governance design: #33; implementation: draft PR #34.
