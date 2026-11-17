# De Geheugenkamer · Citadel v0.6

Afzonderlijke, offline-first werkende HTML-proefmodule voor Locus Amoenus. De bestaande Citadel-startnavigatie bevat op deze **conceptbranch** een extra link naar de Geheugenkamer. Observatorium en Atelier blijven inhoudelijk ongewijzigd. De Sites-publicatie is **niet gewijzigd**.

## Bewijskamer-ontvanger (nieuwe proefmodule)
Er is nu een afzonderlijke lokale ontvanger op [`../la-bewijskamer/`](../la-bewijskamer/) die het handoff-JSON-formaat kan controleren en als niet-geverifieerd dossier kan presenteren. De ontvangende interface heeft een eigen [README](../la-bewijskamer/README.md) en regressietests. Dit is geen backendintegratie of officiële bewijsverificatie.

## Overdrachtscontract v0.6
- Bewijskamer/ERA-overdrachtsconcept via expliciet geselecteerd dossier met een **aparte checkbox voor eenmalige toestemming**.
- Uitvoer is een handmatig te verplaatsen JSON-bestand `PALACO-CITADEL-HANDOFF-DRAFT-1`, niet een automatische systeemkoppeling.
- Trust, beoordeling, bronverificatie, klokattest en EDTR-uitgifte staan standaard op onbevestigd of geblokkeerd.
- Toestemming vervalt na export, selectie van een ander dossier of wissen van de selectie.
- Protocol en ontvangende beoordelingsvoorwaarden: [HANDOFF-CONTRACT.md](HANDOFF-CONTRACT.md).

## Dossierinspectie v0.5
- Inspecteer per geselecteerde herinnering een **alleen-lezen** dossier met WIE/WAT/WAAR/WAAROM/HOE, herkomst en expliciete truststatus.
- Volg gekoppelde voorgangers in omgekeerde versievolgorde; eventueel ontbrekende voorgangers worden vermeld als niet aanwezig in het lokale archief.
- Exporteer alleen de geselecteerde versie met lokaal beschikbare lineage als `PALACO-CITADEL-DOSSIER-DRAFT-1`. De export is **geen** certificaat of onafhankelijk gevalideerd bewijs.
- Het wissen van herinneringen maakt een eerder geselecteerd dossier ongeldig, zodat een verouderde selectie niet geëxporteerd wordt.

## Functionele verbindingen
- Nieuw lokaal geheugenlandschap: verzamelingen Persoonlijk, Wereld, Atelier, Observatorium en Citadel met aantallen en directe filters.
- Duidelijke navigatielinks naar Observatorium, Atelier en Citadel; er is **geen** gedeelde datastore, automatische export of autorisatie over die routes heen.
- Nieuwe versie weigeren als de eerdere recordreferentie ondertussen gewist is.

## Functionaliteit
- Responsieve luxueuze Citadel-weergave, mobiel/desktop en toetsenbordbediening.
- Herinneringen met WIE/WAT/WAAR/WAAROM/HOE, bron en collectie.
- Zoekveld, collectiefilter, sorteerrichting en geschiedenis per versie (append-only binnen tab).
- Lokaal concept zonder automatisch permanent opslaan; expliciete checkbox voor localStorage. Bestaande opgeslagen gegevens worden bij nieuwe opt-in niet overschreven: eerst expliciet herstellen.
- JSON-import/export met schema- en lengtecontrole, 256-KB importlimiet, maximaal 100 records, deduplicatie per ID en lineage-conflictcontrole.
- Herstel van een eerder lokaal archief uitsluitend na expliciete gebruikersactie; geen automatische restore.
- Afzonderlijk *Bewijskamer-dossier (concept)* met record-ID, verwijzing naar vorige versie, bron en statusvelden: geen inhoudelijke verificatie of officiële EDTR-uitgifte.
- UTC van het apparaat (presentatietijd, **niet** een ERA atoomtijdmeting).
- Vertrouwenslabel `SELF_REPORTED_NOT_VERIFIED`.

## Beveiligingsgrenzen
- Er is geen backend, netwerkverzoek, authenticatie, upload of automatische synchronisatie.
- JSON-import is onbetrouwbare data; weergave uitsluitend via textContent (geen HTML-injectie).
- Alleen lokale concepten: `authority: NONE`, `LOCAL_DRAFT_ONLY`; ERA/EDTR-uitgifte **HOLD**.
- Geen claim van cryptografisch bewijs, atomaire tijd, onafhankelijke verificatie of juridisch onweerlegbare append-only-opslag.
- Browseropslag is **niet versleuteld**. Voer geen gevoelige persoonsgegevens in.

## Lokale regressiecontroles
Voer vanuit de repository-root uit:

```sh
node --test DOCS/la-geheugenkamer/geheugenkamer.test.mjs
```

De 18 tests dekken navigatiecontinuïteit, vluchtige opslag als standaard, opslag-opt-in en wissen, expliciet herstel, append-only versieontwikkeling, zoeken, negatieve JSON-import, afwijzen van cyclische lineage, veilige tekstweergave, concept-bewijsuitwisseling, collectiefilters en bescherming tegen een verdwenen voorganger, dossierinspectie, export zonder uitgifte, ongeldige selectie na wissen, geblokkeerde overdracht zonder toestemming en eenmalige overdrachtstoestemming. **CI-uitvoering geslaagd (17 november 2026): 18/18 Geheugenkamer, 10/10 Bewijskamer-handoff en 7/7 triage; totaal 35/35 PASS.** Zie [GitHub Actions-run 44021549355](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44021549355). Browser-/mobiele acceptatie en security review blijven HOLD.

## Offline-data-integriteit
- Na paginavernieuwing wordt een eerder lokaal archief **niet automatisch** geladen.
- De opslagcheckbox weigert inschakelen als een ander archief al op het apparaat aanwezig is; eerst via `Laad eerder lokaal archief` herstellen.
- Herstel van ongeldige gegevens wordt geweigerd. Uitschakelen van de opslagcheckbox wist de lokale opslag van deze module.
- Twee nieuwe echte Chromium-testscenario’s controleren dit op mobiele viewport. Uitvoering en uitslag zijn te verifiëren via GitHub Actions.

## Integriteitscontrole · v1.4
- Nieuwe export: `PALACO-CITADEL-GEHEUGEN-2` met `integrity.algorithm: SHA-256` en een digest over het complete archief (zonder het digestveld zelf).
- Bij import wordt een gewijzigde of beschadigde v2-export geweigerd voordat records worden samengevoegd. Een niet-beschikbare Web Crypto-omgeving veroorzaakt een foutmelding in plaats van een onbeveiligde v2-export of v2-import.
- Oudere v1-bestanden blijven importeerbaar met een duidelijke waarschuwing dat **geen checksumcontrole** plaatsvindt. Deze legacy-compatibiliteit is geen bewijs van integriteit.
- **Belangrijk:** een checksum zonder digitale handtekening of vertrouwde sleutel bewijst niet wie het bestand maakte en beschermt niet tegen iemand die inhoud én checksum bewust opnieuw genereert. Geen EDTR, identiteitsattest of authentieke bewijsverklaring.
- De SHA-256-functie vereist een veilige browsercontext (bijvoorbeeld HTTPS of localhost).

## Portabele JSON-archieven · v1.3
- De offline JSON-export kan op een tweede apparaat handmatig worden geïmporteerd, zonder automatische browseropslag of netwerkverkeer.
- Herhaalde import van identieke records resulteert niet in duplicaten. Botsende records met dezelfde ID maar afwijkende inhoud blijven geblokkeerd.
- Import accepteert geen archief met verhoogde `authority`, afwijkende `status` of onverwachte recordvelden. Oudere minimale archieven zonder autoriteitsmetadata blijven voor compatibiliteit mogelijk, met alleen de lokale `SELF_REPORTED_NOT_VERIFIED`-status.
- Browserintegratie bewezen met [GitHub Actions-run 44032482971](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44032482971): **43/43 PASS** (35 Node-regressies en 8 Chromium-browserproeven) op commit `8a322d21f83a797849e0c5e8cea0ce39464ba669`. Browseremulatie is geen fysieke apparaattest.

## Acceptatie
Dit is een afzonderlijke reviewkandidaat. Niet gemerged of gepubliceerd. Uitvoeren van browser-/mobiele acceptatie, import-negatieve tests en integratiebeoordeling vóór opname in de bestaande site.