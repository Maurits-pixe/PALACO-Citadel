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

## Extension 017 — Explicit protected-container ownership check

The protected-container contract additionally requires `isProtectedContainerAuthorized(container): boolean`. This host-owned decision must independently establish that the exact element is associated with the CURRENT authorized private route and session; a connected DOM node alone does not prove this.

The adapter invokes this callback both **before** rendering and **after** DOM mount, alongside container identity and context-version checks. Failure or an exception rejects the mount; on post-mount failure, it removes only the newly created scoped view. The real host must provide the predicate and must revoke before changing routes, permissions, or session.

**Compatibility:** this is an intentional stricter host interface. Any future integration of `connectAtlasProtectedContainer` must supply the additional callback; absent callbacks cause construction to fail. This is not a working authentication or ownership verifier without the actual Citadel host.

**Acceptance:** untested / HOLD. No modifications to the private Citadel Sites application; no merge or real user session handling. The public Atlas only documents the safeguard.

## Extension 018 — unknown-event terminal recovery boundary

The private `mundo-atlas-host-contract.ts` no longer normalizes unexpected context event values to a recoverable session-change notification. Any unknown event terminates the connection: the lifecycle is revoked, its event subscription is released (if installed) and `activate()` is thereafter permanently stale. The real host must explicitly construct a new integration after independently checking the new protected context.

Known events still revoke the current view while allowing a separate subsequent host-authorized activation. An event observed during subscription makes registration fail and tears down the provisional bridge. Error paths still rely on the host honoring synchronous and atomic subscription/disposal requirements; software cannot guarantee that malicious or defective host callbacks have actually removed their own DOM/listeners.

**Owner acceptance scenarios not executed:** unknown event after active mount; unknown event during registration; known event during in-flight source verification; event callback reentrancy; release callback throwing; stale requests after terminal closure. No production authentication claims, functional acceptance or private Sites changes.

## Extension 019 — explicit recovery generation and no replay

New private module: `08-IMPLEMENTATION/src/citadel/mundo-atlas-explicit-recovery.ts`. Its `createAtlasRecoverySupervisor()` tracks a monotonically increasing generation (epoch), a single connected host integration, and at most one in-flight recovery factory.

- `invalidate()` immediately rejects older generations and disposes the old connection. The caller must invoke it BEFORE changing protected session, route, permissions or mount.
- `reconnect(createFresh)` requires the real Citadel host to explicitly provide a **new** verified `ConnectedAtlasHost`; it never calls a backend, guesses identity, or reuses the previous approval or source envelope. A generation change during asynchronous construction disposes the late connection instead of activating it.
- `activate(input,worldId,kind)` only passes a NEW host-supplied envelope through the current verified connection; failures do not trigger automatic replay or reconnection. Late results after invalidation are reported as stale.
- If a host cleanup callback throws, the supervisor enters a permanently quarantined state and will not connect again. `dispose()` irreversibly closes the supervisor.

This is a composition safeguard, not end-to-end proof of authentication, source integrity or correct implementation of the host event contract. It must only be used after independently establishing route/session authorization. Any new integration must provide new source input and a fresh, unique context version. Private host functions and release callbacks still require owner acceptance; no functional tests were run.

Public Render only shows a static description of this recovery policy. The original Citadel Sites project, PR #58 DRAFT/HOLD, and production permissions remain unchanged.

## Extension 020 — stale or mount-failed invalidates the current bridge

The private `mundo-atlas-explicit-recovery.ts` now invalidates the current host connection if `activate()` finishes with `stale` or `mount-failed`, as long as that same connection and generation are still current. No later request can reuse that connection; the host must explicitly construct a new integration with a fresh authorization decision and new source envelope. A normal `denied` authorization result still denies access and does not automatically trigger a retry or a new connection.

The existing supervisor revocation generation ensures delayed results cannot replace the current generation after a session or route change. A host teardown exception permanently quarantines the supervisor. These are engineering conditions, not proof of end-to-end session security; the host must still deliver synchronous pre-transition events, trusted context versions, authentic source verification and DOM cleanup.

**Unexecuted owner acceptance scenarios:** stale completion; mount-failed completion; denial without automatic retry; cleanup throwing; old delayed request completing after explicit reconnect; duplicate activation. Do not mark these PASS without real test evidence. Original private Citadel unchanged; PR #58 DRAFT/HOLD.

## Extension 021 — generation-scoped single-flight activation

The private `mundo-atlas-explicit-recovery.ts` now reserves an `inFlight` request token synchronously before invoking `ConnectedAtlasHost.activate()`. A concurrent call receives `denied` and never triggers its own host callback or interrupts the existing request. The token contains the current supervisor generation and exact host object identity.

`invalidate()` advances the generation and releases the token. The `finally` cleanup for an old promise only releases a token that still belongs to that same request. Consequently, a late completion cannot clear a lock for a new host connection established after explicit invalidation. A late result from a different generation reports `stale`; failing or stale mounts on the current generation still revoke their connection as in extension 020. Reconnection and normal requests do not automatically repeat sources or previous grant decisions.

**Acceptance scenarios not run:** two simultaneous activations; invalidation while verification is pending; reconnect before an old promise settles; old finalizer after new activation; host throwing during activation; failed disposal quarantine; ordinary denial without a host restart. Private host authenticity, session transitions and source verification still require owner acceptance. No tests, merge or Citadel Sites modifications.

## Extension 022 — revocation-first protected world transitions

New private-only module: `08-IMPLEMENTATION/src/citadel/mundo-atlas-world-transition.ts` provides `createAtlasWorldTransition()` and `switchWorld(worldId,kind,createFresh)`.

Before invoking host-controlled asynchronous source creation, it reserves a single-flight switch and synchronously invalidates the previous Atlas supervisor connection. The protected host must supply a **fresh** `ConnectedAtlasHost` and immutable source envelope via `createFresh`. The current recovery supervisor then performs its own connection registration, world/layer source checks, authentication delegation and protected mount lifecycle. The coordinator neither caches nor reconstructs the old world, old permission, or old source. A denied or failed new world activation invalidates the new connection; no rollback to the prior map occurs.

A generation counter ensures that an explicit `beforeContextChange()` or `dispose()` makes an in-progress world transition stale; no old callback may publish an older world as the current one. The coordinator rejects overlapping switch calls and invalid world/layer identifiers. It does not implement, discover or replace the Citadel router; real host event ordering, source immutability and authorization remain required.

**Unexecuted acceptance cases:** switch while old source verification is pending; switch to a denied world; route change while new host registration is pending; duplicate switch; missing source envelope; host callback throws; old view cleanup throws. No private-site deployment, no merge and no functional test evidence; PR #58 remains DRAFT/HOLD.

## Extension 023 — explicit protected Citadel route navigation bridge

New private module: `08-IMPLEMENTATION/src/citadel/mundo-atlas-navigation-bridge.ts` exports `createAtlasNavigationBridge(host)`. It composes the existing revocation-first WorldTransition 022 with **host-provided** route confirmation. The only required callbacks are `commitProtectedWorldRoute(worldId)` (synchronous, fail closed), `readProtectedRouteWorldId()` and `createFreshWorld(worldId,kind)` (asynchronous, source-specific).

Ordering is intentional: WorldTransition synchronously revokes its prior Atlas connection **before** the navigation bridge invokes `commitProtectedWorldRoute`. It confirms the requested world is the current protected route before starting source acquisition, and checks again after the source arrives. A changed route causes the newly acquired connection to be disposed instead of passed to the Atlas. The protected WorldTransition then performs a fresh connection, source admission and authorization before any new mount. Overlapping navigations are denied. `beforeContextChange()` and `dispose()` invalidate in-flight navigation generations.

**Strict host obligations:** route commit must be synchronous and must not be a guessed browser API; the REAL host must deliver BEFORE-change events for all session, permission and route mutations, and ensure commit semantics and readback are trustworthy. Event callbacks that invalidate the navigation request will cause fail-closed stale results rather than bypassing a transition. Source callbacks must provide immutable, independently verified envelopes and fresh host sessions, never reuse prior identity claims. The navigation bridge itself neither controls an existing ChatGPT Sites editor nor asserts real PALACO ONE authentication.

**Acceptance cases NOT RUN:** route commit denial; route mismatch before/after source resolution; logout while source is pending; world switch after old view revocation; duplicated navigation; late source cleanup; misbehaving host route callback. No private deployment, no merge; PR #58 DRAFT/HOLD.

## Extension 024 — route plus protected context binding

The private `mundo-atlas-navigation-bridge.ts` now requires the host callback `readProtectedContextVersion(): string | null`. After the protected route is committed, the bridge reads and validates the current opaque context version together with the requested world ID. After asynchronous `createFreshWorld` completes, it verifies **both** route ID and context version again. A context mismatch (even with an unchanged world ID) rejects the result and disposes the newly created connection. This prevents same-route context changes from silently reusing a source gathered under different permissions.

The host MUST increment/rotate this unique opaque version on route, session, identity and permission transitions; never reuse a prior value or embed an identifying token. The callback must represent the protected host state, not a client URL parameter or local storage claim. This is a stricter integration contract; absent callback causes constructor failure.

No actual protected Citadel routing/session adapter is connected. Unexecuted acceptance scenarios: same world with changed session; permissions changed while source is pending; changed route with unchanged context; late source disposal; invalid/empty context version. Original Citadel Sites app unchanged. PR #58 DRAFT/HOLD; no functional tests, merge or private deployment.

## Extension 025 — PALACO ONE / Citadel / MUNDO protected session handoff

A new private composition module `08-IMPLEMENTATION/src/citadel/mundo-atlas-session-handoff.ts` defines `createAtlasSessionHandoff(host,navigation)`, where `host` supplies ONLY explicit trusted callbacks `establishProtectedSession(): Promise<boolean>` and `readProtectedSessionVersion(): string | null`. No assumed PALACO ONE API, session token, account, identity, network request or public URL is processed here.

A requested `handoff(worldId,kind)` first revokes the current MUNDO navigation context **synchronously**, before the real protected host begins establishing a fresh session. Only affirmative, independent host approval and a validated opaque session-version string allow `navigation.navigate` (023) to proceed. The original navigation module controls world route commit, immutable fresh source acquisition and authorization delegation. Once navigation completes, the new handoff module checks the same session version again; a mismatch revokes the Atlas and reports stale. Concurrent handoffs are denied. `beforeSessionChange` must be invoked synchronously BEFORE any logout, login, identity switch or permission alteration. A teardown exception quarantines this adapter; disposal is terminal.

**Critical host responsibilities:** provide the real PALACO ONE authentication verification and Citadel protected session permissions, generate non-reused opaque session versions on every relevant change, synchronously deliver BEFORE-change events and guarantee source integrity checks. This adapter cannot verify identity, authenticate users or prove a real Citadel session exists. It is not connected to the original Citadel Sites app and should not be loaded into the public Atlas.

**Unexecuted owner acceptance:** logout while session establishment pending; permission change during navigation; same world under a different account; failed independent session establishment; navigation denial; concurrent handoff; lifecycle teardown exception. No tests, merge or private deployment. PR #58 remains DRAFT/HOLD.
