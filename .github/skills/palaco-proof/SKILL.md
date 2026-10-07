---
name: palaco-proof
description: "PALACO PROOF is the shared proof layer for every PALACO agent. Use to verify claims, decisions, changes, outputs, authority, evidence, provenance, validation, replayability, and unresolved uncertainty. Supports explicit PALACO PROOF ON and PALACO PROOF OFF modes without disabling constitutional or safety constraints."
argument-hint: "Geef `ON` of `OFF` en de PALACO-zaak, claim, wijziging of uitvoer die bewijscontrole vereist."
user-invocable: true
disable-model-invocation: false
---

# PALACO PROOF

Apply a common, bounded proof discipline to every PALACO agent without changing that agent's role or creating authority.

## Toggle

- Default mode for PALACO agents: `PALACO PROOF ON`.
- `PALACO PROOF ON` enables the full procedure and proof record for the current request.
- `PALACO PROOF OFF` disables the additional proof procedure and proof record for the current request.
- A user may state that `ON` or `OFF` persists for the current conversation. Otherwise the choice applies only to the current request.
- The latest explicit user choice takes precedence.
- Always report the effective mode as `PALACO PROOF: ON` or `PALACO PROOF: OFF`.

`OFF` never disables the agent's own constitutional limits, required authorization, safety rules, tool restrictions, evidence duties, or governance gates. It only suppresses this additional shared proof layer. Do not interpret absence of proof reporting as proof of validity.

## Proof Law

Apply when mode is `ON`:

> geen autoriteit zonder constitutie,
> geen uitvoering zonder toelating,
> geen gevolg zonder bewijs,
> geen bewijs zonder provenance,
> geen evolutie zonder governance.

Proof supports a claim; it does not itself grant authority, permission, validity, or constitutional approval.

## Procedure

1. **Identify the proposition**
   - State exactly what claim, change, action, result, or authority assertion is being tested.
   - Separate observation, interpretation, recommendation, determination, authorization, and execution.

2. **Set scope and criterion**
   - Name the applicable domain, boundary, time, repository or artifact revision, and proof criterion.
   - Do not generalize beyond the tested scope.

3. **Collect evidence**
   - Prefer active canonical sources, primary records, reproducible checks, schemas, tests, hashes, manifests, and immutable records.
   - Record repository path and revision when available.
   - Treat legacy sources only as historical evidence unless active canon explicitly promotes them.

4. **Bind provenance**
   - Connect every material item to origin, version, change identity, custodian when known, and collection or validation method.
   - Mark inaccessible sources and broken lineage; never silently reconstruct missing links.

5. **Challenge the proof**
   - Seek contradictory evidence, scope leakage, circular reasoning, self-authorization, stale baselines, alternative explanations, and preserved dissent.
   - State what observation would falsify the claim.

6. **Run verification**
   - Use the cheapest focused check that can disprove the proposition.
   - For implementation, report the exact test or validation and its actual result.
   - Do not claim success from inspection alone when an executable check exists.

7. **Classify the result**
   - `PROVEN_WITHIN_SCOPE`: criterion satisfied with traceable evidence.
   - `PROVISIONAL`: evidence supports the claim but named conditions or uncertainty remain.
   - `CONTESTED`: material evidence or legitimate interpretations conflict.
   - `INSUFFICIENT_EVIDENCE`: required evidence or provenance is missing.
   - `DISPROVEN_WITHIN_SCOPE`: the criterion failed or stronger evidence contradicts the claim.
   - `NOT_TESTED`: no valid verification was performed.

Use the least conclusive status justified by the evidence. A proof status outside proven jurisdiction is advisory only.

## Agent Integration

PALACO PROOF is a base layer, not a replacement persona:

- preserve the active agent's identity, function, tools, and output contract;
- add proof work only where relevant to that function;
- never fuse specialist roles or let one agent speak for another;
- route material constitutional determination through the established Mentor/TRIAS path;
- preserve dissent and unresolved evidence instead of forcing consensus.

## Output

When `ON`, append a concise section:

### PALACO PROOF

- **Proposition:** what was tested
- **Scope and criterion:** applicable boundary and success condition
- **Evidence:** sources, records, checks, and relevant counterevidence
- **Provenance:** origin, revision, lineage, and validation method
- **Falsification:** strongest challenge and disconfirming condition
- **Status:** exactly one proof status
- **Limits:** uncertainty, excluded scope, and required next gate

When `OFF`, do not produce the proof record. Report only `PALACO PROOF: OFF` and continue under the active agent's normal constraints.
