# GEHEUGENKAMER → BEWIJSKAMER → ERA · Handoff Contract v0.1

**Protocol:** `PALACO-CITADEL-HANDOFF-DRAFT-1`  
**Scope:** locally exported, manually transferred review request  
**Authority:** NONE  
**State:** SELF_REPORTED_NOT_VERIFIED / PENDING / HOLD

## Contractregels
1. De gebruiker kiest eerst een lokaal dossier en bevestigt daarna **eenmalige toestemming** voor de export. De toestemming wordt na export gereset en bij het kiezen van een ander dossier ongeldig.
2. Een export bevat uitsluitend de geselecteerde recordreferentie en de lokaal beschikbare lineage, met titel, bron, categorie, versienummer en apparaattijd. De originele herinnering wordt niet automatisch naar andere modules gestuurd.
3. Het handoff-document heeft `documentType: UNVERIFIED_MEMORY_REVIEW_REQUEST`, `destination.mode: MANUAL_FILE_TRANSFER_ONLY` en `destination.nextGate: ERA_EVIDENCE_REVIEW`. Dit is **geen** werkende ERA-integratie.
4. Het ontvangende systeem mag geen vertrouwen overnemen van het document: bron, identiteit, chronologie en volledigheid blijven `UNASSESSED`, `sourceVerified: false`, `clockAttested: false`.
5. `edtrIssued: false`, `authority: NONE`, `review: PENDING` mogen door het bronbestand **niet** naar hogere status worden gebracht.
6. Ontbrekende oudere versies zijn mogelijk bij gedeeltelijk lokaal geheugen. De ontvanger moet ontbrekende voorgangers zelfstandig signaleren en mag een gedeeltelijke keten niet als volledig aanmerken.
7. Dit is geen authenticatie-, juridische bewijs-, cryptografische ondertekenings- of netwerktransportfunctie. Exporttoestemming is geen toestemming voor latere upload of publicatie.

## Testen
```sh
node --test DOCS/la-geheugenkamer/geheugenkamer.test.mjs
```

Er zijn 18 regressiescenario's geschreven. **Uitvoering, browseracceptatie en onafhankelijke beveiligingsreview staan nog open.** De PR blijft DRAFT en HOLD.