# Locus Amoenus — Het Observatorium

## Status
DRAFT · HOLD · read-only prototype. Deze map is **geen** live-monitoring, bewijsverificatie, identiteitsuitgifte of autorisatieservice. De bestaande Citadel-website op `main` blijft ongewijzigd tot een afzonderlijke integratie- en publicatiebeslissing.

## Navigatie en huidige functionaliteit
- De bestaande Citadel-navigatie op `index.html` bevat een kandidaatlink naar `/DOCS/la-observatorium/` op deze branch.
- Vijf schermen: Uitkijk, Bewijskamer, Geheugen, Wachttoren en Atelier.
- Handmatige, zelfgerapporteerde waarnemingen met classificatiefilter in de tijdlijn en optionele persistentie in browseropslag.
- Bewaartoestemming wordt expliciet in een afzonderlijke lokale consent-markering bijgehouden. Zonder deze markering worden bestaande browsernotities niet ingelezen; bij uitzetten wordt de opgeslagen kopie verwijderd.
- Ongeldige tijdstempels en lege waarnemingen worden bij uitlezen geweigerd.
- JSON-export `palaco-la-observatory-local-v1` met expliciete `authority: SELF_REPORTED_NOT_VERIFIED`.
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
