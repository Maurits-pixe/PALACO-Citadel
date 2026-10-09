# PALACO Ambassadeposten & Ambassadeurs

A standalone Dutch website presenting the twelve design seats from [GO-GOV-12-001 / #33](https://github.com/Maurits-pixe/PALACO-Citadel/issues/33), under [parent charter #32](https://github.com/Maurits-pixe/PALACO-Citadel/issues/32).

## Open the website

Open `index.html` in a browser or serve this directory with an ordinary static web server. The public website has no build step, external font or image dependency. Its ordinary post directory remains readable offline. Personal login uses the separate Node service documented in `auth/README.md`. GitHub links require network access.

This is a separate website entry point. The existing Citadel homepage and its publication configuration are not changed.

## Included

- Twelve permanently visible seat cards with expand/collapse profiles.
- Search by seat ID, title and remit, plus a website-only thematic filter.
- All cards remain readable without JavaScript.
- Nomination, eligibility, appointment, activation and succession explanation.
- Quorum and YES thresholds from #33.
- Governance boundary statements and links to #32, #33 and #30.
- Responsive layout, keyboard focus, skip link, labelled controls, result count announcements and reduced-motion support.

Names and appointment records are intentionally absent because #33 creates none. This website is a presentation snapshot dated 2026-10-09; it is not a live registry. The filter categories are editorial navigation and do not create constitutional institutions.

## Governance state

DESIGN DEFINED; REVIEW / RATIFICATION OPEN; NOT OPERATIVE.

The website does not appoint people, grant individual authority, perform ballots, process nominations, determine independent acceptance or confer merge/release/execution rights.

## Validation and publication status

Source checks confirmed:
- twelve seat cards and twelve appointment-status notices;
- unique HTML IDs and resolved internal navigation targets;
- all twelve canonical seat IDs present;
- no external script or stylesheet dependencies.

Browser rendering, interaction tests and online deployment have **not** been verified. The local command environment and Node runtime failed before startup during implementation. Source validation alone is not confirmation of a functioning browser preview.

Before publishing, verify in a real browser:
1. At desktop and 375px mobile widths, confirm all content fits without horizontal scrolling.
2. Search `audit` (seat 07), `PALACO-AMB-12` (seat 12), and `wetenschappelijke` (seat 03).
3. Select each thematic group; confirm the card count changes; combine a query with a group and verify the empty state.
4. Reset the filters and confirm all twelve cards return.
5. Expand every profile with keyboard and pointer; inspect focus and read the appointment status.
6. Disable JavaScript and confirm all twelve cards and profile disclosures remain readable.
7. Follow each internal navigation anchor and check the three GitHub sources.

Online publication remains pending. A branch, commit or pull request is not a live website. No live URL is claimed in this draft.

## Personal login implementation

`toegang.html` is now connected through `portal.js` to the OIDC Node service under `auth/`. Real sign-in remains unavailable without provider/client settings, HTTPS deployment and private subject-to-seat memberships. The static reservations do not create accounts. See [PERSONAL-ACCESS.md](PERSONAL-ACCESS.md) and [auth/README.md](auth/README.md).
