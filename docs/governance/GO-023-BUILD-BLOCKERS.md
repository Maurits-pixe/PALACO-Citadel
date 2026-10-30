# GO-023 — Build blockers

Status: HOLD — BUILD NOT VERIFIED

Repository tree inspection at dd92c0d2 shows:

- `crates/palaco-foundation/Cargo.toml` is absent.
- `crates/palaco-foundation/src/lib.rs` is absent.
- Existing Foundation provenance depends on `crate::evidence::Proof` and serde/uuid/chrono.
- Existing Kernel imports Foundation identity, authority, evidence, errors, proof and provenance contracts; these modules have not been verified as present.
- `src/lib.rs` exists at repository root but root Cargo.toml is virtual workspace-only, so it is not a compiled root package.
- Kernel references `AuthorizationDecision` which requires reconciliation with Foundation.
- Existing `History::verify_replay` starts at `current_state` rather than a stored genesis state; replay correctness must be reviewed before any verification claim.
- Existing `ConstitutionalResponse::permits_action` matches Allow without independently checking evidence and authorization; this is a security review blocker.

Do not fabricate Foundation API types to silence compiler errors. First reconcile existing contracts and test semantics, then run cargo fmt, cargo clippy and cargo test. No release, merge, production authorization or constitutional promotion.
