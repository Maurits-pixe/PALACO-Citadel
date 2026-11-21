# MUNDO Atlas — Protected Host Integration 016

**Status:** DRAFT / HOLD — engineering contract only. No production activation, no PR merge and no modifications to the original private ChatGPT Sites Citadel. Functional acceptance is reserved for the owner.

## Architecture

The private host supplies the only trusted integration point to `connectAtlasProtectedContainer(contract)` in `08-IMPLEMENTATION/src/citadel/mundo-atlas-protected-container.ts`.

The composed flow is:

1. Host registers synchronous **before-change** events for logout, session change, permission change, route replacement and atlas closure.
2. The host independently authenticates the source and verifies a canonical payload SHA-256 digest and the current user's access to the world/layer.
3. The Atlas contract validates schema, allowed world ID, layer type and bounded payload structure.
4. `prepareAuthorizedAtlasView` prepares an immutable read model after the trusted host accepts it.
5. `createAtlasMountLifecycle` checks current context and authorization immediately before and after mount.
6. The protected container adapter obtains a host-owned element, checks its connected state and reads the context version before presenting. After presenting, it again verifies container **identity**, connected state and context version. It synchronously disposes its own DOM subtree if any check fails.
7. Every host transition must synchronously call the registered **before-change** handler before touching its session, route, permissions or protected DOM container.

## Required private host capabilities

`subscribeBeforeChange(handler)` must be atomic on registration failure, deliver before-change events synchronously and return an idempotent unsubscribe callback.

`authorizeAndVerify(envelope)` must independently validate authenticated provenance, digest of the canonical immutable payload, issuer trust and the applicable authorization policy. A supplied `verified: true` flag, matching digest string or public client assertion is not sufficient.

`isStillAuthorized(worldId,kind)` must read current protected host policy, not a cached authorization boolean.

`readContextVersion()` must return a fresh, nonreused opaque version for each relevant context transition, never an identity or access token.

`currentProtectedContainer()` must return the actual protected element for the current route or `null`. It must not return public document/body or a stale detached node.

## Prohibited behaviors

- No fallback to a public page, guessed selector, previous identity or sample data after denial.
- No importing these private modules into `examples/mundo-public`.
- No exposing private routes, tokens, identifying claims, geographic records or EDTR details.
- No authoritative declaration of verification, ownership or PALACO ONE access without the real trusted host.
- No activation, merge or production rollout while the project remains HOLD.

## Integration and review boundaries

The source adapter has been improved to remove a newly mounted DOM subtree if a host callback changes its context or replaces the container during mount. This is an engineering safeguard, **not an end-to-end security certification**. Container privacy and genuine access control remain host responsibilities.

Suggested owner-review acceptance scenarios, **not executed**: before-change during subscription; logout during source verification; route replacement while mounting; container replacement during callback; repeated dispose; rejected digest; reused context version; invalid point coordinates; host cleanup failure.

## Public preview

The public Render demonstration shows a static explanation of this integration contract. It does not import or exercise any privileged function and contains no live MUNDO records.
