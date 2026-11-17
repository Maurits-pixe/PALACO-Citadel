# De Geheugenkamer · Citadel v0.5

Afzonderlijke, offline-first werkende HTML-proefmodule voor Locus Amoenus. De bestaande Citadel-startnavigatie bevat op deze **conceptbranch** een extra link naar de Geheugenkamer. Observatorium en Atelier blijven inhoudelijk ongewijzigd. De Sites-publicatie is **niet gewijzigd**.

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
- Lokaal concept zonder automatisch permanent opslaan; expliciete checkbox voor localStorage.
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

De 15 tests dekken navigatiecontinuïteit, vluchtige opslag als standaard, opslag-opt-in en wissen, expliciet herstel, append-only versieontwikkeling, zoeken, negatieve JSON-import, afwijzen van cyclische lineage, veilige tekstweergave, concept-bewijsuitwisseling, collectiefilters en bescherming tegen een verdwenen voorganger, dossierinspectie, export zonder uitgifte en ongeldige selectie na wissen. **Deze regressietests zijn toegevoegd, maar in deze wijzigingsronde nog niet uitgevoerd.**

## Acceptatie
Dit is een afzonderlijke reviewkandidaat. Niet gemerged of gepubliceerd. Uitvoeren van browser-/mobiele acceptatie, import-negatieve tests en integratiebeoordeling vóór opname in de bestaande site.