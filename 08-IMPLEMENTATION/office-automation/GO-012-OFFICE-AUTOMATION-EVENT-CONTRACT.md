# GO-012 — PALACO OFFICE AUTOMATION EVENT CONTRACT

**Status:** PROPOSED  
**Layer:** 08-IMPLEMENTATION  
**Version:** 1.0.0  
**Authority:** PALACO Foundation / constitutional execution model  
**Scope:** Outlook Mail, Outlook Calendar, OneDrive/SharePoint, Notion, Planner/To Do, scheduled briefings  
**Primary rule:** ACCESS ≠ AUTHORIZATION

## 1. Purpose

GO-012 defines the canonical event contract for PALACO Office Automation.

The Office layer SHALL transform external application activity into traceable PALACO events before any decision or execution is permitted.

Canonical flow:

IDENTITY → FRAME → STRUCTURE → TERRITORY → AUTHORITY → RESPONSIBILITY → POLICY → CONSTITUTION → TIME → TRACEABILITY → DECISION → AUTHORIZATION → CITADEL

Operational flow:

SOURCE → INTAKE → NORMALIZE → PROVENANCE → CLASSIFY → EVIDENCE → DECISION → AUTHORIZATION → EXECUTION → TRACE

No external notification is itself an authorization.

## 2. Constitutional execution rules

1. **NO ACTION BEFORE CONTEXT**
2. **NO AUTHORITY WITHOUT PROVENANCE**
3. **NO DECISION WITHOUT EVIDENCE**
4. **NO EXECUTION WITHOUT AUTHORIZATION**
5. **ACCESS ≠ AUTHORIZATION**
6. Invalid or incomplete events MUST fail closed.
7. Missing provenance MUST prevent decision/execution.
8. A revoked authorization MUST stop pending execution and retries.
9. Expiration MUST remain distinct from revocation.
10. Every consequential action MUST remain reconstructable from its trace.

RIO MAY interpret, summarize, classify, and propose. RIO MUST NOT become an implicit authority boundary.

## 3. PALACO_EVENT_V1

Every normalized event SHALL contain:

- `event_id`: immutable PALACO event identifier.
- `event_type`: canonical event type.
- `event_version`: contract version.
- `source.system`: originating system.
- `source.connector`: connector identity.
- `source.object_type`: message, event, document, task, page, etc.
- `source.object_id`: immutable external object identifier.
- `occurred_at`: source occurrence time.
- `received_at`: PALACO intake time.
- `actor`: source actor when available.
- `classification`: domain/category/confidence/priority.
- `evidence`: references to source material and attachments.
- `context_refs`: related PALACO/source objects.
- `proposed_action`: optional action proposal.
- `authorization`: state/reference; never inferred from connector access.
- `execution`: state/result; absent until authorized execution.
- `provenance`: parent event and source integrity references.
- `trace_id`: end-to-end trace identifier.
- `idempotency_key`: deterministic duplicate-prevention key.

## 4. Event types

The minimum canonical set is:

- EMAIL_RECEIVED
- EMAIL_UPDATED
- EMAIL_MOVED
- EMAIL_FLAGGED
- MEETING_CREATED
- MEETING_UPDATED
- MEETING_CANCELLED
- MEETING_STARTED
- MEETING_ENDED
- DOCUMENT_CREATED
- DOCUMENT_UPDATED
- DOCUMENT_MOVED
- TASK_CREATED
- TASK_UPDATED
- TASK_COMPLETED
- NOTION_PAGE_CREATED
- NOTION_PAGE_UPDATED
- SCHEDULED_EVENT
- BRIEFING_REQUESTED
- AUTHORIZATION_REQUESTED
- AUTHORIZATION_GRANTED
- AUTHORIZATION_REJECTED
- EXECUTION_STARTED
- EXECUTION_COMPLETED
- EXECUTION_FAILED
- REVOKE_REQUESTED
- REVOKED

Unknown event types SHALL be quarantined rather than executed.

## 5. Provenance boundary

The source object is evidence, not authority.

For every event:

`source object → source reference → normalized event → evidence → decision → authorization → execution → trace`

The source identifier SHALL be preserved.

A PALACO identifier MAY be derived from the source identifier, but the external identifier MUST NOT be discarded.

Cryptographic provenance SHALL follow the PALACO canonical serialization rule:

**WHAT IS SIGNED SHALL BE EXACTLY WHAT IS VERIFIED.**

A signature proves authenticity/integrity. A Watermerk proves lineage. Neither grants authority.

## 6. Idempotency

Every automation capable of creating or changing state SHALL have a deterministic idempotency key.

Example:

`SHA-256(source_system | source_object_id | action_type | destination)`

Repeated delivery of the same source event MUST NOT create duplicate consequential actions.

For invoices, the attachment identity MUST participate in the fingerprint.

This is mandatory because the same external message may be observed more than once.

## 7. Ordering

`occurred_at` and `received_at` are separate fields.

The system MUST NOT assume that later receipt means newer source state.

When ordering is ambiguous:

- retain both timestamps;
- preserve source sequence/version when available;
- classify state as uncertain where necessary;
- do not silently overwrite evidence.

## 8. Authorization levels

### L0 — READ
Read, fetch, inspect, classify, summarize.

### L1 — LOW-RISK WRITE
Create non-sensitive organizational artifacts such as a proposed task, draft briefing, or internal trace.

### L2 — SENSITIVE WRITE
Move mail, alter source records, create externally consequential tasks, or modify governed content.

### L3 — HIGH-IMPACT
Send external communications, delete records, financial actions, security-sensitive actions, or other irreversible/high-consequence operations.

Default: **fail closed**.

No L2/L3 action SHALL execute solely because a connector has write permission.

## 9. Authorization state machine

`NONE → REQUESTED → GRANTED → EXECUTING → COMPLETED`

Alternative terminal states:

- REJECTED
- FAILED
- REVOKED
- EXPIRED

Rules:

- GRANTED is not EXECUTING.
- REVOKED is terminal for that authorization instance.
- EXPIRED is distinct from REVOKED.
- A REVOKED authorization MUST block retries.
- Execution MUST retain the authorization reference that permitted it.

## 10. REVOKE

REVOKE is a first-class constitutional gate.

Upon valid revocation:

1. stop pending execution;
2. cancel queued retries;
3. prevent new execution under the revoked authorization;
4. preserve all provenance;
5. emit a REVOKED event;
6. retain the previous authorization state for audit/replay.

A system MUST NOT interpret revocation as deletion of history.

## 11. Microsoft Graph notification boundary

For Outlook mail and calendar, Microsoft Graph supports subscriptions for message and event changes. Subscriptions can receive created, updated, and deleted changes, and Outlook resources also support lifecycle notifications for cases such as removed or missed subscriptions. citeturn0search0turn0search1

PALACO SHALL therefore treat a Graph notification as an **INTAKE SIGNAL**, not as complete truth.

Minimum pipeline:

`Graph notification → validate notification → source reference → controlled fetch → evidence snapshot → PALACO_EVENT_V1`

For basic notifications, the subscription `clientState` SHALL be validated before business logic. Rich notifications require additional authenticity validation. citeturn0search2turn0search5

Subscription renewal and lifecycle recovery SHALL be operational responsibilities. A removed, missed, or reauthorization-required subscription SHALL enter a controlled recovery state rather than silently continuing. citeturn0search1turn0search4

## 12. Office automation workflows

### 12.1 Factuurassistent

Trigger:
`EMAIL_RECEIVED`

Conditions:
- attachment present;
- invoice classification confidence above configured threshold;
- source provenance valid.

Proposal:
- store invoice evidence in governed storage;
- create a finance follow-up task.

No payment is authorized by this workflow.

### 12.2 Notion Project Manager

Trigger:
`NOTION_PAGE_CREATED` or `NOTION_PAGE_UPDATED`

Proposal:
- summarize;
- extract action points;
- create proposed tasks.

The extracted task remains a proposal until its authorization policy permits execution.

### 12.3 Website Health Monitor

Trigger:
`EMAIL_RECEIVED`

Classification:
- website;
- security;
- outage;
- hosting;
- maintenance.

Criticality MAY raise priority, but priority does not itself grant execution authority.

### 12.4 Daily Executive Briefing

Trigger:
`SCHEDULED_EVENT`

The briefing SHALL distinguish:

- observed facts;
- evidence references;
- unresolved items;
- calendar context;
- finance context;
- follow-up items;
- proposed priorities;
- authorization requests.

A proposed priority is not an instruction.

### 12.5 Flagged Email

Trigger:
`EMAIL_FLAGGED`

Proposal:
- create follow-up task linked to source message and trace.

### 12.6 Project Updates

Trigger:
`DOCUMENT_CREATED` / `DOCUMENT_UPDATED`

Proposal:
- create or update a project task with source provenance.

### 12.7 Meeting Briefing

Trigger:
`MEETING_CREATED` / scheduled pre-meeting event.

At T-30 minutes:
- gather meeting evidence;
- identify related projects/tasks;
- produce briefing;
- do not mutate meeting content unless authorized.

### 12.8 Meeting Closeout

Trigger:
`MEETING_ENDED`

Proposal:
- extract decisions;
- identify action points;
- link participants and evidence;
- create proposed tasks.

## 13. Failure states

The following SHALL fail closed:

- invalid event;
- missing source identifier;
- missing provenance;
- invalid signature;
- duplicate consequential action without valid idempotency handling;
- missing authorization;
- revoked authorization;
- expired authorization;
- unavailable source when evidence is required;
- ambiguous source state where destructive action would be required.

The system SHALL report **UNKNOWN / INCOMPLETE** rather than fabricate missing information.

## 14. Audit and replay

Every consequential transition SHALL be replayable from:

`event_id + trace_id + source_reference + evidence + policy + authorization + execution_result`

The system SHALL preserve enough information to answer:

- What happened?
- Where did it originate?
- What evidence existed?
- What did PALACO infer?
- What action was proposed?
- Who/what authorized it?
- What executed?
- What was the result?
- Was authorization later revoked?

## 15. Implementation target

Recommended Rust modules:

```
office/
  event/
    id.rs
    envelope.rs
    event_type.rs
    provenance.rs
    idempotency.rs
    trace.rs
  intake/
    outlook_mail.rs
    outlook_calendar.rs
    onedrive.rs
    sharepoint.rs
    notion.rs
  policy/
    authorization.rs
    revoke.rs
    execution_gate.rs
  briefing/
    executive.rs
    meeting.rs
  tests/
    provenance.rs
    idempotency.rs
    revoke.rs
    authorization.rs
    fail_closed.rs
```

The implementation SHALL inherit PALACO Foundation constraints:

- Rust edition 2024;
- rust-version 1.90;
- no `unsafe_code`;
- no `unwrap`;
- no `todo!`;
- no standard-library Mutex/RwLock where prohibited by the Foundation architecture;
- canonical serialization for signed material;
- explicit Result-based error propagation.

## 16. GO-012 acceptance criteria

GO-012 is considered implementation-ready when:

- [ ] PALACO_EVENT_V1 is schema-defined.
- [ ] Event identity and source identity are separate and linked.
- [ ] Idempotency is deterministic.
- [ ] Provenance is mandatory.
- [ ] Authorization is explicit.
- [ ] REVOKE is first-class.
- [ ] Expiration is distinct from revocation.
- [ ] Execution is fail-closed.
- [ ] Graph lifecycle recovery is represented.
- [ ] Unknown/incomplete evidence cannot silently become a decision.
- [ ] Consequential execution retains authorization and trace references.
- [ ] Tests cover duplicate delivery, missing provenance, missing authorization, revocation, expiration, and fail-closed behavior.

**Canonical constitutional statement:**

> EXTERNAL EVENT ≠ AUTHORITY.  
> PROVENANCE ENABLES EVIDENCE.  
> EVIDENCE ENABLES DECISION.  
> AUTHORIZATION ENABLES EXECUTION.  
> REVOKE STOPS AUTHORIZED EXECUTION.  
> TRACEABILITY PRESERVES THE WHOLE CHAIN.
