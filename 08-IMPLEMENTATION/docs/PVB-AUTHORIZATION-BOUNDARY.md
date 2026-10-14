# PVB authorization boundary repair

Status: ENGINEERING REPAIR · NOT AN ISSUER / MANDATE SERVICE.

## Removed authorization bypass

At baseline `6774682f0c34c3bc45e02768980347b7117b3d3d`, the legacy
`authorize({ verifiedVisitCard, mandate })` helper returned true whenever both
values were JavaScript-truthy. An empty object, `true`, or a record claiming
`state: REVOKED` and an unrelated scope could authorize. A truthy string in
`verifiedVisitCard` also passed. The existing G-0008 assertion covered only an
absent mandate.

The helper now returns a frozen `{ authorized: false, reason }` on every path.
It does not inspect a caller-supplied mandate as trusted evidence. Present or
apparently ACTIVE/EFFECTIVE metadata, a signature string, issuer names, PASS
flags and callbacks cannot enable an authorization result.

Input fields are read through own data descriptors; inherited claims and
accessors do not establish verification and payload getters are not invoked.
Invalid input and descriptor/proxy errors produce a denial without echoing input.

| Condition | Reason |
| --- | --- |
| Non-record request, unsupported prototype, malformed mandate accessor or descriptor failure | INVALID_AUTHORIZATION_REQUEST |
| Own data field verifiedVisitCard is absent or not the boolean true | VISITCARD_VERIFICATION_REQUIRED |
| Own mandate data field is absent, null or undefined after strict verification | MANDATE_REQUIRED |
| Any supplied mandate value | MANDATE_VERIFICATION_UNAVAILABLE |

The old G-0008 no-mandate result remains compatible. There is deliberately no
fallback to `MANDATE_PRESENT`, no supported positive path and no per-request
verifier callback or caller-controlled enable flag.

## Scope and trust contract

This closes the unsafe legacy permit path. It does **not** implement full issuer,
scope, expiry or revocation validation, enroll an issuer, adopt a new mandate
profile, create an identity or issue a VISITCARD. Revoked, expired, wrong-scope,
wrong-actor and otherwise unverified records are denied because no trusted
mandate-verification service is connected.

The existing PVB signing/vector/lineage/time routines continue to produce their
reference evidence. A valid signature remains separate from current PVB trust,
constitutional authority, action-specific authorization and execution.

A future positive authorizer needs an explicitly adopted mandate profile and a
host-configured trusted verification boundary, not new input booleans. It must
independently verify:

- issuer appointment and effective authority under the selected policy;
- authentic signer/key binding and exact mandate bytes;
- requested actor, target/object type, action and scope, including exclusions;
- policy/profile version, trusted time, current validity and current revocation;
- subject/object/context binding and freshness at the action decision point.

Missing, stale, conflicted, unverifiable or revoked evidence must deny. Defining
these requirements does not fill any real bootstrap or issuer fields.

## Verification

Run both suites:

```sh
node 08-IMPLEMENTATION/tests/pvb015.test.mjs
node --test 08-IMPLEMENTATION/tests/pvb-authorization.test.mjs
```

The original golden vector and 63 reported case labels are a separate legacy
reference suite. The new denial regressions include the reproduced revoked /
wrong-scope case and a genuinely verified Ed25519 test card with an untrusted
mandate. Their passing result is evidence of the closed authorization boundary,
not full PVB-V1 conformance or real mandate acceptance.

Canonical source boundaries: [PVB-011](../../%E2%88%86%20GO-011%20%E2%80%94%20PVB-011)
and [PVB-012](../../%E2%88%86%20PVB-012%20%E2%80%94%20CONFORMANCE%20TEST%20SUITE%20%26%20ADVERSARIAL%20TESTING).
The source audit is recorded in the private
[VISITCARD repo-audit](https://app.notion.com/p/e2b44c37cab54720a85046bed31e726e).
