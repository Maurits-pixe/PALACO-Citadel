# Status

Canonical hierarchy established: 01-FOUNDATION through 08-IMPLEMENTATION, plus DOCS and ARCHIVE.

## RIO implementation snapshot

Observed at repository revision `7b2e58c46c43951b8361b2131a3769f7770fd705` on 2026-09-12:

- The [RIO implementation profile](../rio/README.md) contains a strict conversation and subject schema, transition policy, seven-language catalog, dependency-free runtime, and conformance suite.
- The conformance suite passes with 19 conversation fixtures.
- The [RIO web surface](../index.html) provides responsive VisitCard and touchscreen subject presentation.
- Browser checks have been performed locally, but their automation is not yet stored in the repository.

Reproduce the repository-backed checks from the repository root:

```bash
node --check rio/localization.mjs
node --check rio/runtime.mjs
node --check rio/conformance.mjs
node rio/conformance.mjs
```

This snapshot reports implementation evidence only. It does not establish canon, identity, consent, permission, authority, external delivery, or constitutional validity.
