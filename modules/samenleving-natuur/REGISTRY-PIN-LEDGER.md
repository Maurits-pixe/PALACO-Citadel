# Registry pin ledger — append-only history verifier (DRAFT / HOLD)

A pure local verifier for hash-linked transitions between exact registry pins.
Each record binds sequence, previous record SHA-256, issuer, old pin and new pin.
The algorithm rejects missing/reordered links, altered pins, duplicates,
non-monotone revisions, issuer substitution and an incorrect head hash.

**No storage, transactions or CAS have been implemented.** This validates a
supplied history but neither creates nor persists it. In particular, a malicious
party could replace *both* the history and `expectedHeadHash`, or supply false
`genesisPin` / `expectedCurrentPin`. The security boundary requires independent,
protected head anchoring and real transactional compare-and-swap with audited
human authorization before an update can safely be committed.

Even a locally consistent ledger has `trust: NOT_ESTABLISHED`,
`authorization: DENY`, `executionAllowed: false`, `releaseAllowed: false`,
and `stateChanged: false` in every return path.

Test: `node --test modules/samenleving-natuur/registry-pin-ledger.test.mjs`.

**PR #63 is DRAFT/HOLD; no database writes, merge or production rollout.**
