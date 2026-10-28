# RIO subject dialog focus lifecycle — draft

Phase baseline: `6e77a4098e4c8cc0addb616a35b056c06fe2411e`.
PR #47 remains draft against `codex/rio-reception-availability-lifecycle`.
No merge, publication, deployment, Render mutation or account activation.

## Human behavior and boundary

Closing a subject card completes its return focus within that action. Native
Escape uses the same synchronous close path. A delayed native close event no
longer moves focus after a later interaction or reads state from another card.

“Continue with this subject” still selects and publishes that explicit subject
and opens chat in the same activation turn. It closes without a separate explicit
return-focus step, allowing the existing chat opening to focus the composer.
The shared cross-close flag and delayed focus listener are removed. Selection,
publication, chat opening and the original immediate browser return focus already
worked; this change prevents later interference rather than adding authority.

The existing tile-opening behavior stays: opening a subject temporarily hides
the chat. Dismissing the card keeps the existing selected context and does not
automatically restore chat visibility or choose the viewed candidate.
Close, backdrop, Escape and the existing swipe path share the close helper.
Gesture detection itself is unchanged; a mouse/keyboard test is not a new
touchscreen acceptance test.

Public subject identifiers, provenance, type, state, ELIXER object reference and
presentation effect retain their values. Looking grants no identity, permission,
consent or operative authority. Chat history, drafts and the separate Engine
memory, dossier, answer and consent are not reset by closing a card.

Only `app.js` and root cache v48 change in the public bundle. Twenty files remain
byte-identical to the baseline package, including chat, Engine core/web adapter,
styles, integration, app/NOVA and offline download. The separate app cache stays
v7; the root worker still waits normally without skipWaiting or clients.claim.

## Evidence and limits

`tests/rio-unified-preview/subject-dialog-lifecycle.spec.mjs` observes actual
native close events, public controls, metadata and later focus actions on mobile
and desktop. Separate closing paths and rapid successive explicit subject choices
must keep the newest interaction. Baseline failures and passing changed-source
records retain their actual source hashes and HEAD; harness setup errors are
kept separately and do not count as product failures.

A final executed report binds commit/tree, exact-head CI checkout logs, actual
local results, package bytes and scoped image review. New subject screenshots
measure presentation and native action reachability; pixels do not prove event
ordering, selected-history preservation or real screenreader announcements.

The earlier 24 October PALACO metadata snapshot keeps its original collection
times and historical staging/provider/TLS chain. Reusing it is not a new PALACO
read, rerun or acceptance. Physical device/manual accessibility acceptance and
the real contact/provider/P.P./chat/E2EE/BRI9ADE connections remain open.

## VORM9EVIN9 RECORD

- **Publiek en surface:** RIO subject cards on mobile/desktop, keyboard and
  pointer; existing seven VisitCard languages and ELIXER detail sheet.
- **Onderwerp:** symbolic/image/illustration/ELIXER subjects with stable public
  identity, provenance, state and explicit continuation.
- **Touchflow:** open, inspect, close or continue; a newer focus action or card
  remains current after older native close events.
- **Begrijpelijkheid:** viewing is separate from choosing; continuing is the
  visitor's existing explicit action, without implicit permission.
- **Toegankelijkheid:** native dialog, Escape, immediate return focus and no
  delayed focus theft; physical touch and real screenreader acceptance remain open.
- **RIO-context:** selected subject, chat history and separate Engine work retain
  their boundaries; language/RTL and public identifiers remain intact.
- **Provenance en grens:** source baseline and source-bound native records.
  RIO CONNECTS; VORM9EVIN9 EXPLAINS; CONSTITUTION GOVERNS.
  PRESENTATION ≠ PERMISSION.
- **Validatie:** actual before/after, CI, public package and presentation outcomes
  are recorded separately after execution.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** finish bounded executable verification, then independent
  physical-device and manual accessibility acceptance.

## PALACO PROOF

PALACO PROOF: ON.

- **Proposition:** older native subject close events cannot overwrite later
  public focus or a newer explicit subject interaction.
- **Scope and criterion:** isolated Chromium mobile/desktop, named native close/
  Escape/backdrop and continuation paths, stable public metadata and package bytes.
- **Evidence:** source-bound baseline counterevidence, real native event records,
  ordinary selected-context preservation, final CI and separate presentation probes.
- **Provenance:** baseline above; final delivery binds exact head/tree, served
  source, harness identity, job checkout logs, screenshots and archive hashes.
- **Falsification:** later focus is pulled back, an older close affects a newer
  card, dismissal publishes a new selection, IDs/context change or private work
  is lost or sent away.
- **Status:** PROVISIONAL — criteria in this source note; bounded execution
  outcome belongs to the separate final report.
- **Limits:** no actual physical swipe/device or screenreader certification,
  secure-memory erasure, identity/provider activation, P.P. issuance, live chat,
  E2EE/BRI9ADE, merge/deploy or new historical PALACO staging/TLS acceptance.

