# RIO chat clear lifecycle — draft

Phase baseline: `584032e840438382a5393e501523f527b3d1ed6f`.
PR #47 stays draft against `codex/rio-reception-availability-lifecycle`.
No merge, deployment, Render mutation or account activation is part of this change.

## Human behavior and implementation boundary

Confirming “Clear this conversation” completes the existing chat reset in the
form activation turn. It removes the old transcript, draft, selected subject,
follow-ups and input error, then creates exactly one welcome in the current
language and returns focus to the composer. The separate Engine memory, dossier,
consent, questions and answers are preserved.

Keeping the conversation or pressing Escape leaves chat content and context
intact and returns focus to the clear control. The native cancel event is handled
explicitly. A form submit without the explicit confirm submitter keeps the chat.
The confirmation dialog, labels, translations and layout remain the existing ones.

The delayed native `close` event performs no content or focus work. Newer input,
a later focus action or a newly opened confirmation therefore cannot be overwritten
by the older event. Normal form submission and Escape remain native browser actions.
There is no added backdrop behavior, timer, retry or synthetic close event.

Only `chat-preview.mjs` and the root worker cache version change in the public
bundle. Root v46 waits normally for old controlled clients to close; app v7,
NOVA's eleven languages and the other twenty public files stay byte-identical to
the baseline package. No root `skipWaiting` or `clients.claim` is introduced.

## Verification and provenance

`tests/rio-unified-preview/chat-clear-lifecycle.spec.mjs` adds isolated mobile
and desktop regressions. They observe actual native submit/cancel/close ordering,
snapshot same-turn state, insert a later public-control interaction, and exercise
reopening before the earlier native close has completed. Focus and DOM observations
do not certify physical phone use or actual assistive-technology announcements.

Preserve the failing baseline observations alongside passing changed-source
records. They must identify the actually served source hashes and parent HEAD;
a pre-commit test is not described as having run on a later final commit.
The delivery report binds final commit/tree, exact-head CI job checkout evidence,
local before/after results, package bytes, screenshots and archive comparison.
Do not infer new test results from older green workflows or static inspection.

The package matrix separately measures compact layouts, seven expanded greeting
views and native dialog action reachability. Its screenshot scope does not prove
the lifecycle ordering; the dedicated regressions do. Large-text French dialog
choices may require vertical scrolling.

PALACO's 24 October read-only metadata snapshot and historical staging/provider/TLS
evidence retain their recorded collection and execution dates. Reusing that
snapshot is not a new PALACO test, log read or acceptance decision. #50 stays HOLD
until its own evidence and decision conditions are resolved.

## VORM9EVIN9 RECORD

- **Publiek en surface:** existing RIO VisitCard, mobile/desktop, touch and keyboard.
- **Onderwerp:** temporary conversation and explicit clear choice; preview state.
- **Touchflow:** open confirmation, keep or confirm, immediately continue working.
- **Begrijpelijkheid:** clearing finishes with the chosen action; subsequent work
  remains the visitor's current work.
- **Toegankelijkheid:** existing named native dialog, safe default, Escape and
  synchronous focus restoration; no delayed focus steal. Manual acceptance is open.
- **RIO-context:** seven VisitCard languages, eleven NOVA languages, separate Engine
  and chat; no identity, consent or permission is inferred from presentation.
- **Provenance en grens:** source baseline above and source-bound regressions;
  RIO CONNECTS; VORM9EVIN9 EXPLAINS; CONSTITUTION GOVERNS.
  PRESENTATION ≠ PERMISSION.
- **Validatie:** results and exact final source binding are recorded in the separate
  delivery report after execution, including preserved contrary observations.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** finish executable lifecycle and delivery validation, followed
  separately by physical-device and manual accessibility acceptance.

## PALACO PROOF

PALACO PROOF: ON.

- **Proposition:** explicit clearing finishes state and focus in its own activation;
  an older native close cannot mutate newer work or focus.
- **Scope and criterion:** isolated Chromium mobile/desktop, native confirmation
  and Escape, final source/package binding; Engine and unrelated data preserved.
- **Evidence:** dedicated native-event records, before/after counterevidence,
  existing integration regressions and separately scoped final CI/package checks.
- **Provenance:** baseline commit above; final commit/tree and actual execution
  identities must be bound in the delivery report.
- **Falsification:** old data remains after confirmation returns, newer draft,
  subject or focus changes at delayed close, reopening consumes an older result,
  cancellation loses content, or Engine data changes.
- **Status:** PROVISIONAL — this source note specifies the criterion; the separate
  executed report supplies the final bounded result.
- **Limits:** no secure memory erasure claim, real phone/email verification,
  provider/account activation, P.P. issuance, operational chat/E2EE, BRI9ADE,
  physical-device or manual screenreader acceptance, merge or deployment.

