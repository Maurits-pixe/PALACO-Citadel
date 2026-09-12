# RIO Implementation Profile

This directory is a local implementation profile that turns the active RIO specifications into a small, testable contract. It does not create PALACO canon, grant constitutional authority, establish consent, or provide authorization.

## Canonical Binding

The profile is derived from:

- `RIO-UNIVERSAL-001.md`
- `RIO-FABRIC-001.md`
- `RIO-PLATFORM-001.md`
- `RIO-UIC-001.md`
- `RIO-VISITCARD-001.md`
- `VISITCARD-CONSENT-001.md`
- `VISITCARD-PROV-001.md`
- `VISITCARD-REVOKE-001.md`
- `CANONIEKE_FORMULE.md`

Where this implementation profile and a higher active source conflict, the higher active source governs and this profile must be revised. The exact transition graph, endpoint states, permission actions, identifiers, and supplemental object fields are local versioned implementation choices because the active RIO texts do not fully define them.

## Files

- `conversation.schema.json` defines the RIO conversation object, visual subject contract, and bounded vocabulary.
- `transition-policy.json` defines the local fail-closed transition profile and records its source binding.
- `locales.json` defines the seven provisional language catalogs and text direction.
- `localization.mjs` resolves locale tags and translates stable RIO status identifiers.
- `runtime.mjs` exports conversation validation and fail-closed transition checks.
- `conformance.mjs` tests the runtime with positive and negative fixtures without external dependencies.

## Boundaries

- Communication, presence, membership, connectivity, delivery, and acknowledgement do not create authority.
- `authority_effect` is always `NONE`.
- Connecting, activating, resuming, bridging, or handing off requires explicit consent, verified identity, valid endpoints, permissions, and provenance as applicable.
- VisitCard discovery is not consent. Revoked or expired VisitCards cannot advance to accepted or connected use.
- Viewing, opening, or choosing a subject is presentation only. It does not change consent, permissions, conversation state, or authority.
- A complete ELIXER subject retains its own `object_reference`; its card or preview never replaces the ELIXER identity, content, provenance, state, or governance.
- Conversation state, delivery state, VisitCard encounter state, trust, consent, and constitutional event status remain separate.
- Provenance forms a linear chain: every non-initial record references the immediately previous record. Timestamps are non-decreasing; a record may share its predecessor's timestamp but may never predate it.
- Unknown fields, enum values, identity conflicts, broken references, missing provenance, backward transitions, and transitions from `CLOSED` fail closed.

## Runtime API

`runtime.mjs` exports `createConversation`, `grantConsent`, `revokeConsent`, `expireConsent`, `setConversationLocale`, `sendMessage`, `invalidateVisitcard`, `validateConversation`, `canTransition`, `canTransitionVisitcardEncounter`, `canAdvanceDelivery`, `transitionConversation`, `transitionVisitcardEncounter`, and `advanceMessageDelivery`, plus the loaded `schema` and `policy`.

`createConversation(input)` starts in `DISCOVERED` with `NOT_REQUESTED` consent, no allowed actions, no messages, `authority_effect: NONE`, and an initial provenance record. It rejects incomplete input, unknown fields, and unknown actors without returning a conversation.

`grantConsent(conversation, grant, provenanceRecord)` requires explicit actions, visibility, and a valid time window. It records `CONSENT_GRANTED` but does not change conversation state or create authority. `revokeConsent(conversation, revokedAt, provenanceRecord)` removes all allowed actions, records `CONSENT_REVOKED`, retains message history and earlier provenance, and moves `CONNECTED`, `ACTIVE`, or `RESUMED` conversations to `PAUSED`.

`expireConsent(conversation, provenanceRecord)` changes `GRANTED` consent with a finite `valid_until` to `EXPIRED` when `provenanceRecord.recorded_at` is on or after that deadline. It removes allowed actions, pauses active communication, retains the original deadline, messages, and provenance, and keeps expiration distinct from revocation. Conversation connection and VisitCard acceptance use the same provenance timestamp to reject operations before `valid_from` or after `valid_until`, making the time decision replayable without relying on the machine clock.

Mutation APIs return `{ ok, errors, conversation? }`, leave their source object unchanged, append a record linked directly to the latest provenance record on success, and return no candidate conversation on failure. Every new provenance record must be timestamped at or after the latest existing record. Delivery updates reject unchanged, backward, unknown-message, and duplicate-provenance operations.

`context.subjects` optionally carries machine-readable subjects for touch and other presentation surfaces. Each subject has a stable `subject_id`, type, human name, preview and provenance references, meaning, state, boundary, explicit next action, and `presentation_effect: NONE`. Supported types are `SYMBOL`, `IMAGE`, `PHOTO`, `OBJECT`, `PERSON`, `PLACE`, `VISITCARD`, `CONVERSATION`, and `ELIXER`; supported states are `CURRENT`, `REVOKED`, `EXPIRED`, and `UNKNOWN`. Subject identifiers must be unique within a conversation, every subject provenance reference must resolve to that conversation's provenance chain, and an `ELIXER` subject must include its independent `object_reference`.

`setConversationLocale(conversation, requestedLocale, provenanceRecord)` changes only the presentation locale and appends a linked provenance record. It preserves conversation state, participants, context, consent, permissions, messages, and `authority_effect: NONE`. Regional tags normalize to a supported base language, unsupported tags visibly fall back to English, and unchanged requests or invalid provenance fail without returning a candidate conversation.

`sendMessage(conversation, message, provenanceRecord)` appends a message with runtime-controlled delivery state `CREATED` and a linked provenance record. It requires a `CONNECTED`, `ACTIVE`, or `RESUMED` conversation, granted `SEND_MESSAGE` permission, a timestamp inside the consent validity window, a known sender, a matching provenance actor, and unique message and provenance identifiers. It leaves the source conversation unchanged, preserves all non-message state, never changes authority, and returns no candidate conversation on failure.

`transitionVisitcardEncounter(conversation, targetState, provenanceRecord)` follows the configured `ENCOUNTERED → INTRODUCED → RECOGNIZED → ACCEPTED → CONNECTED` graph and changes only the VisitCard encounter state plus linked provenance. Acceptance and connection require a valid VisitCard and granted `REQUEST_CONNECTION` permission. A VisitCard can become `CONNECTED` only after its conversation is `CONNECTED`, `ACTIVE`, or `RESUMED`. Missing cards, skipped or backward transitions, revoked or expired cards, missing consent, invalid provenance, and unchanged transitions fail without a candidate. VisitCard connection never creates authorization or authority.

`invalidateVisitcard(conversation, validity, provenanceRecord)` changes a `VALID` VisitCard to `REVOKED` or `EXPIRED`, appends linked provenance, and pauses a `CONNECTED`, `ACTIVE`, or `RESUMED` conversation. It preserves the reached encounter state as history and retains consent, permissions, messages, prior provenance, and `authority_effect: NONE`. An invalidated VisitCard cannot advance further. Repeated invalidation, changing one invalid status into another, missing cards, unsupported targets, and invalid provenance fail without a candidate conversation.

## Languages

RIO provisionally supports:

- `nl` — Nederlands (default)
- `en` — English (fallback)
- `de` — Deutsch
- `fr` — Français
- `es` — Español
- `ar` — العربية (`rtl`)
- `zh` — 中文

Regional BCP-47 tags resolve to their supported base language, such as `de-DE` to `de`, `ar-SA` to `ar`, and `zh-CN` to `zh`. Unsupported languages fall back visibly to English. Stable RIO status identifiers, state transitions, consent, provenance, proof, and governance semantics never change with presentation language. Missing message identifiers fail closed instead of displaying invented text.

## Validation

Run from the repository root:

```bash
node --check rio/localization.mjs
node --check rio/runtime.mjs
node --check rio/conformance.mjs
node rio/conformance.mjs
```

A passing conformance run proves only that the checked artifacts satisfy this implementation profile. It does not prove runtime integration, user identity, consent, external delivery, or constitutional authorization.
