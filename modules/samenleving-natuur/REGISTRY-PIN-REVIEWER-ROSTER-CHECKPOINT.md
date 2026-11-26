# Reviewer Roster Checkpoint — DRAFT/HOLD

A read-only, domain-separated SHA-256 linked checkpoint **preflight** for
the signed reviewer roster transition. It checks that the caller's expected
checkpoint matches the supplied current checkpoint (a local CAS comparison),
that issuer fingerprint, previous exact roster digest and trusted revision
floor match, and that the transition is signed and strictly increasing.

A passing result returns a **hypothetical** proposed checkpoint only.
There is no database transaction, durable checkpoint, independently
authenticated current state, external notarization, publication or
authorization. An attacker can fabricate BOTH supplied pins. No claim
of independent protection is made.

Every result retains DENY / NOT_ESTABLISHED / stateChanged=false.
PR #63 Draft/HOLD, no merge or PALACO MONO writes.

Run: `node --test modules/samenleving-natuur/registry-pin-reviewer-roster-checkpoint.test.mjs`.
