# PALACO LEVENSADER WEB · v0.1-alpha.1-readonly

**Status: RELEASE CANDIDATE — NOT PUBLISHED / QA INCOMPLETE**

This folder is a self-contained, read-only distribution candidate for the existing PALACO objects. It does not replace the private v0.1-alpha site.

## Contents

- `index.html` — page, CSS, JavaScript and the frozen object fixture embedded for a single-file static preview.
- `objects.json` — exact audit snapshot of the 13 embedded objects (not fetched by the page). Compare it with the embedded data before packaging or changing either file.
- `README.md` — release scope and gates.
- No external assets, provider secrets, live AI, account code or production data.

The page uses only conceptual descriptions and synthetic fixture metadata. Repository URLs pin source snapshots; source text does not establish runtime operation. The seven WORLD anchors have `UNKNOWN` status and no exact repository source.

## Release gates

| Gate | Result |
| --- | --- |
| JavaScript parses; 13 unique object IDs; all relation IDs resolve | PASS (script-level check, 2026-09-25) |
| Valid RIO and Pluto route, Proof notice, unknown object route | PASS (script-level check, 2026-09-25) |
| Embedded fixture matches `objects.json` | PASS at creation; repeat before release |
| Mobile visual QA | NOT TESTED |
| Light and dark visual QA | NOT TESTED |
| Keyboard focus and contrast in browser | NOT TESTED |
| RIO → relations → Proof/audit in browser | NOT TESTED |
| Non-authorized account denied access to site and direct object URL | NOT TESTED |
| Static package built and published to a private Sites version | NOT DONE |

A Sites access list currently permits the owner and no external visitors for v0.1-alpha; that configuration is not the required negative access test for this candidate. A hidden URL is not an access boundary. The standalone HTML must not be distributed through a public host while private source links remain in its fixture.

## Decision

Publish as `v0.1-alpha.1-readonly` only after every pending browser and access gate passes. On any failure, fix that boundary and repeat the affected check. Do not activate accounts, AI, mentors, dashboards, or additional WORLDs as part of this candidate.
