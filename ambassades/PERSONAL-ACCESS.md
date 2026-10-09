# Personal ambassador login — preparation, not active authentication

The human owner requested individual logins for the twelve future ambassadors.

## Current state

- Twelve public seat reservations are represented in `access-slots.json`.
- `toegang.html` provides one individually addressable future access point per seat, linked from its website profile.
- No accounts, passwords, sessions, invitation tokens, protected data or operative rights are created.
- The owner supplied a private contact for the provisional first ambassador. That address is retained only in the conversation for future private provisioning; it is not committed here, and no invitation has been sent.
- The remaining eleven identities are unspecified.
- A provisional login contact does not ratify a constitutional appointment.
- The public JSON is presentation/design data, never an authoritative server membership registry.

The existing repository registration preview is explicitly not a production identity provider; see `registration/docs/AUTHORIZATION-MAP.md`. No new Ambassador Site exists in the Sites account at the time of inspection.

## Target account architecture

Use a managed personal identity provider instead of shared seat passwords. Each person has an immutable provider identity; each membership separately binds that identity to a stable seat ID, appointment reference, term, status and narrowly scoped application permissions.

Provider registration/enrollment and application authorization are separate. Successful authentication does not confer an ambassador role automatically. The application must check active membership, suspension, expiration and revocation on each protected server request. Never trust the selected seat, URL fragment, browser storage, hidden buttons or email submitted by a caller as proof of identity or authority.

Use the hosting provider's supported identity mechanism after reading its implementation instructions. Do not invent Sites identity headers or trust headers that clients can supply. Sites visitor access is an outer access boundary; seat membership still requires a separately verified application record. No provider settings, user IDs, credentials or account activity are fabricated by this implementation.

## Invitation and enrollment requirements

1. Obtain the person's intended private identity/contact and seat designation.
2. Establish the authentication provider and verify the issuer and application boundary.
3. Create/invite the personal account through the provider's documented secure flow. Sending an invitation is a separate external communication and has not been performed.
4. Verify control of the account; bind the stable provider user ID, not an unverified email claim.
5. Record the appointment and separately reviewed application permissions in a private backend.
6. Enable only the specific person's application access after the required checks pass.
7. Revoke membership immediately on suspension/expiry/replacement; invalidate relevant sessions. Never hand credentials to a successor.

Store contacts, credentials, MFA/recovery material, sessions and private membership records outside this public repository. Use provider MFA and secure recovery where supported. Session management and protected APIs must remain server-side. No local browser login simulation is implemented.

## Required verification before activation

- Unauthenticated and valid-but-unassigned users cannot open any protected personal workspace.
- A member cannot access a different seat by changing a URL, request body or browser storage.
- Expired, suspended, revoked and replaced members lose access on the next protected request, including with an older session.
- Enrollment tokens cannot be reused; logout/revocation invalidates access as required by the provider design.
- Invalid, forged or wrong-issuer identity claims cannot produce an authenticated principal.
- Direct API calls enforce the same checks as page navigation.
- Authentication grants none of voting, independent acceptance, merge, release or execution powers.

## Outstanding work

A real backend/provider integration, private membership store, deployment, end-to-end security tests and personal provisioning remain pending. Local command and Node runtimes failed before startup. The static page and slot register alone do not satisfy the request for functioning individual logins.

Sources: [#32](https://github.com/Maurits-pixe/PALACO-Citadel/issues/32), [#33](https://github.com/Maurits-pixe/PALACO-Citadel/issues/33); implementation tracked in draft [PR #34](https://github.com/Maurits-pixe/PALACO-Citadel/pull/34).
