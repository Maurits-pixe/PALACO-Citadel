# GO-EMERALD-008 — DE EERSTE ECHTE MINERALENWERELD-LAAG

## Scope

GO-EMERALD-008 operationaliseert de registry-specificatie met strikt gescheiden lagen:

1. MINERAL REGISTRY (complete canonieke mineralenset; 6239+ species)
2. EMERALD WORLD REGISTRY (één immutable EW-ID per species)
3. PALACO WORLD ALLOCATION (huidige capaciteit: 4444 world slots)

Geen enkele laag mag een andere laag overschrijven.

## Canonical examples

Eerste alfabetische canonieke wereldidentiteiten:

- EW-0001 Abellaite
- EW-0002 Abelloemringerite
- EW-0003 Abelsonite
- EW-0004 Abenakiite-(Ce)
- EW-0005 Abernathyite
- EW-0006 Abhurite
- EW-0007 Abramovite
- EW-0008 Abswurmbachite
- EW-0009 Abuite
- EW-0010 Acanthite

Dit is een ordering sample; volledige 6239-ingestie blijft GO-EMERALD-006 uitvoerwerk.

## Identity law

MINERAL NAME ≠ PALACO WORLD ID.

Een mineralogische naam representeert wetenschappelijke identiteit; EW-ID representeert PALACO infrastructuuridentiteit.

## Canonical world record

Een world-record bevat minimaal:

- world_id
- world/mineral canonical naam
- registry bron en epoch
- allocation state + optional slot
- immutable identity flag
- provenance verified flag
- watermerk/hologram/citadel/immortal IDs
- authority flags sovereign=false, constitutional=false

## Expansion validity

Een world buiten 4444-capaciteit blijft volledig geldig met:

- allocation.state = WORLD_PENDING
- allocation.slot = null
- expansion.eligible = true

NO SLOT ≠ NO WORLD.

## Allocation registry

Slots OW-0001..OW-4444 vormen een aparte mutable allocatielaag:

- OW slot mapping kan wijzigen via constitutionele ∆ transitions
- EW-ID verandert nooit
- capaciteitsexpansie voegt nieuwe OW slots toe zonder EW remapping

## Ordering and immutability

Alphabetische canonical ordering bepaalt initiële toekenning; later toegevoegde species krijgen EW-NEXT zonder historische EW-hernummering.

## Dual-index model

Twee indexen blijven parallel:

- Canonical Name Index: naam → EW-ID (kan inhoudelijk evolueren)
- Immutable World Index: EW-ID → huidige canonical naam (ID blijft stabiel)

## Constitutional update model

Elke release update is versie-overgang:

REGISTRY(t0) → ∆ → REGISTRY(t1)

met evidence, provenance en authorization gates.

## Safety boundary

Emerald Imperium mag registreren, ordenen, visualiseren en verifiëren; het mag geen sovereignty of constitutionele authority claimen.

Constitutionele volgorde blijft:

CONSTITUTION > GOVERNANCE > POLICY > ACTION

## GO-EMERALD-008 status

🟢 SEALED

Canonieke componenten:

- EMERALD MINERAL REGISTRY
- EMERALD WORLD REGISTRY
- WORLD ALLOCATION REGISTRY
- EMERALD EXPANSION LEDGER
- CANONICAL NAME INDEX
- IMMUTABLE WORLD INDEX

Iedere mineral species kan een unieke Emerald World Identity hebben, ongeacht actuele 4444-slotbeschikbaarheid.

De Edelsteenbuurt kan onbeperkt groeien zonder hernummering of verlies van historische identiteit.

∆ GO-EMERALD-008 — SEALED.
