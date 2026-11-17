# De Geheugenkamer · Citadel v0.1

Afzonderlijke, offline-first werkende HTML-proefmodule voor Locus Amoenus. De bestaande Citadel-startnavigatie bevat op deze **conceptbranch** een extra link naar de Geheugenkamer. Observatorium en Atelier blijven inhoudelijk ongewijzigd. De Sites-publicatie is **niet gewijzigd**.

## Functionaliteit
- Responsieve luxueuze Citadel-weergave, mobiel/desktop en toetsenbordbediening.
- Herinneringen met WIE/WAT/WAAR/WAAROM/HOE, bron en collectie.
- Zoekveld, collectiefilter, sorteerrichting en geschiedenis per versie (append-only binnen tab).
- Lokaal concept zonder automatisch permanent opslaan; expliciete checkbox voor localStorage.
- JSON-import/export met schema- en lengtecontrole, 256-KB importlimiet, maximaal 100 records, deduplicatie per ID.
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

De tests dekken navigatiecontinuïteit, vluchtige opslag als standaard, opslag-opt-in en wissen, append-only versieontwikkeling, zoeken, negatieve JSON-import en veilige tekstweergave. **Deze regressietests zijn toegevoegd, maar in deze wijzigingsronde nog niet uitgevoerd.**

## Acceptatie
Dit is een afzonderlijke reviewkandidaat. Niet gemerged of gepubliceerd. Uitvoeren van browser-/mobiele acceptatie, import-negatieve tests en integratiebeoordeling vóór opname in de bestaande site.