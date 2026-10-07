# Status

Canonical hierarchy established: 01-FOUNDATION through 08-IMPLEMENTATION, plus DOCS and ARCHIVE.

## RIO implementation snapshot

Verified on 2026-09-12:

- The [RIO implementation profile](../rio/README.md) contains a strict conversation and subject schema, transition policy, seven-language catalog, dependency-free runtime, and conformance suite.
- The conformance suite passes with 19 conversation fixtures.
- The [RIO web surface](../index.html) provides responsive VisitCard and touchscreen subject presentation.
- The repository browser suite checks the RIO surface on mobile and desktop Chromium before GitHub Pages deployment.

Reproduce the repository-backed checks from the repository root:

```bash
npm ci
npx playwright install chromium
npm test
```

This snapshot reports implementation evidence only. It does not establish canon, identity, consent, permission, authority, external delivery, or constitutional validity.
