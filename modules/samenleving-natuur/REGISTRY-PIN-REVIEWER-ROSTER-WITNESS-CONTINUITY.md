# Reviewer Roster Witness Continuity — DRAFT / HOLD

Local read-only security preflight linking TWO signed checkpoint attestations to
the existing signed reviewer-roster transition and SHA-256 checkpoint hash chain.

## Security properties
- Validate prior checkpoint attestation against the caller-provided prior head pin.
- Evaluate the signed roster transition against the previous **signed** checkpoint.
- Calculate the only permitted candidate sequence, revision, roster digest and chain head.
- Reject any candidate checkpoint that differs from this exact calculated state.
- Verify the candidate's independent witness signature and key fingerprint.
- Reject witness issuedAt moving backwards; require both attestations valid at the supplied time.
- Deny malformed objects, accessors, injected keys, stale checkpoints and forged signatures.

## Limitations (mandatory gates)
The caller supplies witness key, key fingerprint, previous hash pin and current clock;
these inputs are NOT independently authenticated. No trusted clock, remote witness
key custody, independently read checkpoint, durable append-only ledger, atomic CAS,
revocation freshness or independent publication is established. A compromised
caller may substitute the entire chain and all pins. **Even a valid result is
not authorization.** All outputs retain DENY, NOT_ESTABLISHED and no state mutation.

Run:
`node --test modules/samenleving-natuur/registry-pin-reviewer-roster-witness-continuity.test.mjs`

GitHub Actions runs the same tests in the existing draft workflow.
PR #63: DRAFT/HOLD. No merge, release, deployment or PALACO MONO change.
