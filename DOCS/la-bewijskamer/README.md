# De Bewijskamer · Citadel v0.2

Afzonderlijke offline-first **ontvangende proefmodule** binnen dezelfde Citadel-repository, zonder verbinding naar live systemen.

## Van Geheugenkamer naar Bewijskamer
1. Selecteer in de Geheugenkamer een dossier, geef **eenmalige exporttoestemming** en maak `PALACO-CITADEL-HANDOFF-DRAFT-1` als lokaal JSON-bestand.
2. Open `DOCS/la-bewijskamer/index.html` via de Citadel-navigatie.
3. Selecteer het eerder geëxporteerde JSON-bestand in de Bewijskamer.
4. Inspecteer aangeleverde versie-ID's, bron, apparaat-UTC, gedeeltelijke lineage en onveranderlijk onbeoordeelde trustvelden.
5. Schrijf indien gewenst een lokale beoordelingsnotitie en exporteer die als `PALACO-CITADEL-BEWIJSKAMER-LOCAL-ASSESSMENT-1`.

## Ontvangsttriage v0.2
- `INVALID_PACKET`: schema-, autorisatie- of lineage-controles falen; het pakket wordt geweigerd.
- `NEEDS_SOURCE_MATERIAL`: er is een lege bronverwijzing of de ontvangen lineage begint met een ontbrekende voorganger.
- `READY_FOR_HUMAN_REVIEW`: uitsluitend minimale documentatie is aanwezig voor **menselijke beoordeling**; nooit bewijs van juistheid, identiteit, toestemming of authenticiteit.
- Een apart JSON-concept `PALACO-CITADEL-TRIAGE-DRAFT-1` bevat uitsluitend lokale intakebevindingen. Dit is geen officiële beoordeling of autorisatie.
- Deze triage is een indicatie van **aanlevervolledigheid**, geen bewijskracht. De ontvangende partij moet alle bronnen zelfstandig beoordelen.


## Browseracceptatie (v1.0 kandidaat)
De nieuwe `browser-smoke.test.mjs` start een lokale HTTP-server en test de echte HTML-interface in Chromium op desktopformaat en met mobiele iPhone-viewportemulatie. Het scenario maakt een herinnering aan, controleert dat localStorage standaard leeg blijft, weigert overdracht zonder toestemming, exporteert een eenmalig conceptbestand, importeert dit in de Bewijskamer en weigert een gemanipuleerde autoriteitsstatus. De tests draaien op een tijdelijke GitHub Actions-runner; er is geen live publicatie.

```sh
npm install --no-save --no-package-lock --ignore-scripts playwright@1.56.1
npx playwright install --with-deps chromium
node --test DOCS/la-bewijskamer/browser-smoke.test.mjs
```

Een geautomatiseerde mobiele viewporttest is geen handmatige apparaattest. Cross-browser, touch-gebruik en toegankelijkheidsreview blijven afzonderlijke acceptatiepunten.

## Grensbewaking
- De ontvanger accepteert uitsluitend het vastgelegde schema met **exacte verwachte velden**, beperkende lengtes en maximaal 100 lineage-records.
- Er wordt geweigerd bij autorisatie-escalatie, ontbrekende toestemming, verkeerd doel, dubbel ID, cyclische of onderbroken aangeleverde versievolgorde, te grote bestanden of een ontbrekend eindrecord.
- Een onbekende voorganger aan het **begin** van een pakket betekent `partial: true`. Dit is nooit een volledige genealogie.
- Er is geen upload, netwerkfunctie, opslag in localStorage, accountkoppeling, cryptografisch attest of officiële ERA-beoordeling.
- Weergave van onbetrouwbare inhoud gebruikt uitsluitend `textContent`, geen HTML-interpolatie.
- De ontvanger kan uitsluitend een **lokale, niet-geverifieerde** notitie exporteren; `review: NOT_VERIFIED`, `authority: NONE`, `edtrIssued: false`.
- Het handoff-veld `consent.given` is metadata van de bron en **geen onafhankelijk bewijs van toestemming**. De ontvanger verifieert het bestaan van dit veld, niet de authenticiteit ervan.
- Ook bij een geldig schema is het document **niet onafhankelijk geverifieerd**.

## Regressietests

```sh
node --test DOCS/la-bewijskamer/handoff.test.mjs
node --test DOCS/la-bewijskamer/triage.test.mjs
node --test DOCS/la-geheugenkamer/geheugenkamer.test.mjs
```

**CI-verificatie 17 november 2026:** GitHub Actions-run [44021549355](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44021549355) is geslaagd. Geheugenkamer 18/18, Bewijskamer-handoff 10/10, triage 7/7: **35/35 PASS, 0 FAIL** op commit `78823a1fb8741665538ed81072b318ebfd4ee575`. De bestaande placeholder-CI is vervangen door Node 22 regressiecommando's in `.github/workflows/ci.yml`. **Browser- en mobiele acceptatie, privacybeoordeling en externe code-review blijven HOLD.** PR is DRAFT en Sites is niet gepubliceerd.
