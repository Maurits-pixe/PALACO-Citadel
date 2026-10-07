# Register metadata schema boundary

Status: `DRAFT_PROPOSAL`  
Classification: `NON-CANONICAL MAPPING`  
Date: 2026-10-07  
Branch: `codex/palaco-register-schema-audit-20261007`

The pasted PCR-001/PCR-002/PCR-003/PMS-001 conversation is design input, not Citadel canon. The combined draft schema is stored in the PALACO work branch at `docs/schemas/draft/palaco-register-meta-schema-proposal-2026-10.json`.

Citadel boundary rules:

- Schema validation may report missing metadata; it may not silently assign `NON-CANONICAL`, rewrite a prior state or erase history.
- Approval and verification fields reference decisions and evidence. They do not grant authority by naming a role.
- Repository evidence must be pinned to a repository, ref, path and preferably a commit. A mutable branch is not an integrity proof.
- CI, compliance or verification results remain scoped evidence and never become runtime authorization.
- RIO remains the river and communication surface; ELIXER remains separate.
- Quay history remains append-only. Linnaeus/HORTUS data preserves uncertainty and provenance.
- The exact spelling `VORM9EVIN9` is required in future additions.

No Citadel runtime, authority model or canonical status registry is changed by this proposal.
