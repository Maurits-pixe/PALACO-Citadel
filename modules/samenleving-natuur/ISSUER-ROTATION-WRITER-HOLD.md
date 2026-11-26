# PALACO Citadel — Issuer Writer HOLD Contract QA

A deliberately **disabled** PostgreSQL writer API is exercised solely inside
a disposable PostgreSQL 16 GitHub Actions service. The scratch function
`propose_rotation(expected_sequence, new_fingerprint, reviewer_a, reviewer_b)`
always raises SQLSTATE `42501` and contains no data-modifying statements.

The test checks:
- `EXECUTE` is revoked from `PUBLIC` and an untrusted role;
- no untrusted `UPDATE` or `INSERT` privileges exist;
- the function is `SECURITY INVOKER`, not `SECURITY DEFINER`;
- an untrusted invocation fails;
- even fixture-owner calls with seemingly distinct reviewer names, duplicated
  reviewers, a stale sequence or empty reviewers fail closed;
- the current PIN and the audit history remain byte-for-byte unchanged.

**Reviewer strings are NOT signatures or authorization evidence.**
This is a denial-only control, not a working writer or credible dual approval.
An actual writer must be independently reviewed and coupled to verified
reviewer identity, cryptographic evidence, protected key custody, atomic
compare-and-swap, and independently durable history before it can be enabled.

The script exits before creating anything unless scratch-only CI variables
are present, but environmental flags alone are not a security boundary.
No production database, role, function, or deployment is touched.

PR #63 remains Draft/HOLD. Authorization DENY.
