# RIO Subsystem Maintenance Handoff

This is a navigation and continuity record, not new canon. Detailed contracts remain in the
linked specifications and implementation files.

## Canon and implementation boundary

- Start with [`RIO-PLATFORM-001.md`](../RIO-PLATFORM-001.md),
  [`RIO-UNIVERSAL-001.md`](../RIO-UNIVERSAL-001.md), and
  [`RIO-UIC-001.md`](../RIO-UIC-001.md). RIO connects communication across surfaces; communication,
  presence, delivery, or acknowledgement does not create authority. The interface invariant is
  same meaning across different presentations.
- The code in this directory is a derived, versioned implementation profile, not canon or an
  authorization service. If it conflicts with a higher active source, revise the profile to match
  that source. The precise state graphs, identifiers, and supplemental fields are local profile
  choices; do not describe them as universally settled canon.
- Use [`README.md`](README.md) as the implementation index and
  [`transition-policy.json`](transition-policy.json) as the machine-readable profile.

## Operational invariants to preserve

- New conversations begin `DISCOVERED`, with consent `NOT_REQUESTED`, no allowed actions or
  messages, and `authority_effect: NONE`.
- Consent is separate from connection. Connection, resumption, VisitCard acceptance, and sending
  require their applicable identity, endpoint, permission, consent-window, and provenance checks.
- Provenance is a direct chronological chain: each new record links to the immediately preceding
  record and cannot precede its timestamp. Mutations leave their source object unchanged and return
  no candidate object on failure.
- Consent revocation and expiry are separate outcomes. Both remove allowed actions and pause active
  communication while retaining prior messages and provenance; expiry requires a finite deadline.
- Message creation begins at delivery state `CREATED`. Later delivery transitions must follow the
  declared order and are recorded as provenance. This local state change does not prove external
  delivery.
- Unknown fields or enum values, identity conflicts, broken references, missing consent or
  provenance, invalidated VisitCards, backward transitions, and transitions from `CLOSED` fail
  closed. Presentation locale may change wording, never governance semantics.

## Feature maturity and validation

- The core schema, runtime, locale resolver, transition policy, and dependency-free conformance
  suite are executable local artifacts.
- Contact/6RI9ADE material includes design drafts and reference/test foundations. The documented
  outbox and contact preview do not activate live contact, network delivery, production E2EE, real
  identities, or a hosted relay. Check the maturity statement in [`README.md`](README.md) before
  presenting these as runtime services.
- From the repository root, run `npm run test:rio` for the focused RIO conformance suite. The
  profile also documents direct syntax checks and `node rio/conformance.mjs`.
- A passing conformance run checks only the local implementation profile. It does not prove
  deployment integration, real identity, human consent, external delivery, or constitutional
  authorization.

## Related repository context

The static AETHER page at `/citadel/iii6v9/` encrypts locally in the browser. The separate
`bastion-backend/` is a synthetic local demo API, and the root Docker Compose service serves the
static Citadel site only. None of these establishes a live RIO transport, RIO authorization,
external delivery, or a connection between AETHER and Bastion.
