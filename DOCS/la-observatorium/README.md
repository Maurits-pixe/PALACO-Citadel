# Locus Amoenus — Het Observatorium

## Status
DRAFT · HOLD · read-only prototype. Deze map is **geen** live-monitoring, bewijsverificatie, identiteitsuitgifte of autorisatieservice. De bestaande Citadel-website op `main` blijft ongewijzigd tot een afzonderlijke integratie- en publicatiebeslissing.

## Navigatie en huidige functionaliteit
- De bestaande Citadel-navigatie op `index.html` bevat een kandidaatlink naar `/DOCS/la-observatorium/` op deze branch.
- Vijf schermen: Uitkijk, Bewijskamer, Geheugen, Wachttoren en Atelier.
- Handmatige, zelfgerapporteerde waarnemingen met gecombineerd classificatiefilter en lokale tekstzoekfunctie op onderwerp, beschrijving en bronverwijzing.
- Elke tijdlijnregel toont uitdrukkelijk `SELF_REPORTED_NOT_VERIFIED`; een zoekresultaat is nooit een Quay-, ERA- of WATERMERK-verificatie.
- Optionele persistentie in browseropslag, uitsluitend met expliciete toestemming.
- Bewaartoestemming wordt expliciet in een afzonderlijke lokale consent-markering bijgehouden. Zonder deze markering worden bestaande browsernotities niet ingelezen; bij uitzetten wordt de opgeslagen kopie verwijderd.
- Ongeldige tijdstempels en lege waarnemingen worden bij uitlezen geweigerd.
- JSON-export en begrensde JSON-herimport (`≤256 KB`, maximaal 100 notities, strikte schema- en ID-controle) met expliciete `authority: SELF_REPORTED_NOT_VERIFIED`.
- Import koppelt lokaal Atelier aan Geheugen, slaat bekende ID's over en geeft geen bewijs- of mandaatstatus. De gebruiker moet apart toestemming geven voor blijvende opslag.
- Geen upload, netwerkrequest, tokeninvoer, cryptografische attestatie of backend.
- Alleen tekstinhoud wordt als DOM-tekst ingevoegd, niet als HTML uitgevoerd.

## Data-contract (voorstel, niet geïntegreerd)
Een toekomstig canoniek observatiebericht kan minimaal bevatten:
`schema_version`, `event_id`, `world_id`, `citadel_id`, `source_id`, `source_digest`, `source_timestamp`, `received_timestamp`, `proof_reference`, `verification_state`, `policy_version` en `redaction_level`.

Er zijn aparte controles nodig voor authentieke bron, geldige handtekening, tijdsynchronisatie, gescoped toegang, replay/lineage, foutpaden en bewaartermijnen. Ontbrekende gegevens geven **UNKNOWN/HOLD**, nooit PASS.

## Koppelpuntvolgorde
1. Scope/authenticatie PALACO One en Citadel bepalen; openbaar alleen niet-gevoelige samenvattingen.
2. Quay provenance-adapter read-only met expliciete vertrouwde bronnen, geen direct browserprivilege.
3. ERA/EDTR metadata read-only met validatiestatus door afzonderlijke verifier.
4. WATERMERK-bewijsreferenties weergeven na echte verificatie.
5. Mobiele, toetsenbord-, offline-, privacy- en securityacceptatietesten; dán pas publicatiebesluit.

## Broncodecontrole
Voer lokaal uit: `node --test DOCS/la-observatorium/observatorium.test.mjs`.
Deze tests bewaken syntaxis, navigatielinks, consent en read-only indicatoren. Ze vervangen **geen** interactieve browser-, offline-, mobiele of securitytests. In deze wijziging is nog geen onafhankelijke runtime-uitvoering bevestigd.

## Import-beveiligingsgrenzen
Het geïmporteerde bestand blijft uitsluitend lokaal in de browser; er is geen upload. Het bestand mag uitsluitend het eigen exportformaat bevatten, met `SELF_REPORTED_NOT_VERIFIED`. Ongeldige notities, conflicterende ID's in hetzelfde bestand, te grote bestanden en overschrijding van de notitielimiet worden geweigerd. De import toont het aantal nieuwe notities en vraagt expliciet toestemming vóór wijziging van het lokale Geheugen. Lege bestanden, oversized JSON-inhoud en array-vormige enveloppen worden geweigerd. Import is niet cryptografisch gevalideerd en geldt nooit als canonieke provenance.

## Acceptatiechecklist
- [ ] Nieuwe route werkt in lokale/preview-host; geen 404.
- [ ] Alle bestaande Citadel-routes en i18n functioneren onveranderd.
- [ ] Mobiele breedtes 320–430px zonder horizontale scroll of dubbele navigatie.
- [ ] Formulier is met toetsenbord te bedienen; schermlezer meldt opslagstatus.
- [ ] Zonder opt-in worden nieuwe notities niet blijvend opgeslagen; bij uitzetten wordt de kopie gewist.
- [ ] JSON-export toont SELF_REPORTED_NOT_VERIFIED en importeert geen gezag.
- [ ] Geen geheimen zichtbaar in console/netwerkopslag; CSP/security review voltooid.
- [ ] Geen publieke site of live-autoriteit gewijzigd.

**Beslisstatus: HOLD.** De inhoud en integratie zijn codewijzigingen, geen onafhankelijk gevalideerde runtime.
