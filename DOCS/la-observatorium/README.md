# Locus Amoenus — Het Observatorium

## Status
DRAFT · HOLD · read-only prototype. Deze map is **geen** live-monitoring, bewijsverificatie, identiteitsuitgifte of autorisatieservice. De bestaande Citadel-website op `main` blijft ongewijzigd tot een afzonderlijke integratie- en publicatiebeslissing.

## Navigatie en huidige functionaliteit
- De bestaande Citadel-navigatie op `index.html` bevat een kandidaatlink naar `/DOCS/la-observatorium/` op deze branch.
- Vijf schermen: Uitkijk, Bewijskamer, Geheugen, Wachttoren en Atelier.
- Handmatige, zelfgerapporteerde waarnemingen met gecombineerd classificatiefilter en lokale tekstzoekfunctie op onderwerp, beschrijving en bronverwijzing.
- Elke tijdlijnregel toont uitdrukkelijk `SELF_REPORTED_NOT_VERIFIED`; een zoekresultaat is nooit een Quay-, ERA- of WATERMERK-verificatie.
- Een knop per waarneming opent een read-only inspectiepaneel in de Bewijskamer met classificatie, bronverwijzing, apparaat-/importtijd en tekst. Het paneel vermeldt expliciet dat Quay, ERA/EDTR en WATERMERK niet zijn geverifieerd en verleent geen mandaat.
- Als een geselecteerde waarneming uit het lokale Geheugen verdwijnt, wordt de inspectieselectie gewist.
- Optionele persistentie in browseropslag, uitsluitend met expliciete toestemming.
- Bewaartoestemming wordt expliciet in een afzonderlijke lokale consent-markering bijgehouden. Zonder deze markering worden bestaande browsernotities niet ingelezen; bij uitzetten wordt de opgeslagen kopie verwijderd.
- Ongeldige tijdstempels en lege waarnemingen worden bij uitlezen geweigerd.
- JSON-export en begrensde JSON-herimport (`≤256 KB`, maximaal 100 notities, strikte schema- en ID-controle) met expliciete `authority: SELF_REPORTED_NOT_VERIFIED`.
- Import koppelt lokaal Atelier aan Geheugen, slaat bekende ID's over en geeft geen bewijs- of mandaatstatus. De gebruiker moet apart toestemming geven voor blijvende opslag.
- Geen upload, netwerkrequest, tokeninvoer, cryptografische attestatie of backend.
- Alleen tekstinhoud wordt als DOM-tekst ingevoegd, niet als HTML uitgevoerd.

## Lokale referentie-inspectie (v0.2)
De Bewijskamer onderscheidt optioneel handmatig aangebrachte prefixes `QUAY:`, `ERA:` en `WATERMERK:`. Dit zijn **uitsluitend tekstlabels**. Er volgt geen netwerkopvraag, cryptografische validatie, trust-evaluatie of verlening van bevoegdheid. Zonder referentie verschijnt `BRON ONTBREEKT`; bij iedere andere referentie blijft de verificatiestatus `NIET GEVERIFIEERD`.

Bij herimport wordt een al bestaand ID alleen overgeslagen als tijd, onderwerp, classificatie, referentie en inhoud overeenkomen. Een inhoudelijk conflict weigert de volledige import voordat notities worden toegevoegd. Zo wordt verschillend bewijs niet onder één lokale sleutel samengevoegd.

## Lokaal inspectiedossier (v0.3)
Een geselecteerde waarneming kan vanuit de Bewijskamer als JSON worden geëxporteerd. Het dossier bevat de originele lokale notitie en expliciete verificatiegrenzen (Quay niet verbonden, ERA/EDTR niet gecontroleerd, WATERMERK niet gevalideerd, geen bevoegdheid). Het dossier krijgt een SHA-256-digest over de UTF-8 bytes van `JSON.stringify(content)`, waarbij `content` precies de velden `schema`, `observation`, `source_status` en `verification` bevat. De `integrity`-sectie wordt pas daarna toegevoegd.

Een SHA-256-digest is **geen** digitale handtekening en authenticeert noch de gebruiker noch de bron. Verificatiestatus blijft `SELF_REPORTED_NOT_VERIFIED`. Als de WebCrypto SHA-256-functie ontbreekt, wordt de dossierexport geweigerd; er vindt geen stille degradatie naar een dossier zonder hash plaats. De export wordt uitsluitend op het apparaat gedownload.

## Lokale SHA-256-dossiercontroleur (v0.4)
De Bewijskamer kan een geëxporteerd `palaco-la-inspection-v1` inspectiedossier (maximaal 256 KB) lokaal teruglezen. De controle vereist exact de velden `schema`, `observation`, `source_status`, `verification`, `integrity` en de verplichte inhoudsvelden. Er mogen geen extra sleutels in de gecontroleerde objecten staan. Alle verificatiestatussen moeten expliciet onbekend/niet uitgevoerd blijven en `authority` moet `NONE` zijn.

De controleur bouwt de canonieke inhoud opnieuw op met de door de exporteur gebruikte veldvolgorde en vergelijkt `SHA-256(UTF8(JSON.stringify(content)))` met de aangeleverde digest. Bij overeenkomst staat uitsluitend **INTEGRITEIT KOMT OVEREEN**, met de waarschuwing dat **authenticiteit NIET GEVERIFIEERD** blijft. Bij ongeldig schema, ongeldige status, ontbrekende WebCrypto of een afwijkende hash wordt niet goedgekeurd. Er wordt niets geüpload, geen notitie ingevoerd en geen mandaat verleend.

Dit formaat kan alleen integriteit *binnen het zelfverklaarde dossier* aantonen. Een aanvaller kan een aangepast dossier opnieuw hashen; daarom is ondertekening via vertrouwde sleutels, bronattestatie en onafhankelijke lineage-verificatie vereist voordat een toekomstige bewijsstatus boven `SELF_REPORTED_NOT_VERIFIED` mag uitstijgen.

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

## Reproduceerbare end-to-end integriteitstests (Node.js)
De nieuwe suite `DOCS/la-observatorium/dossier-roundtrip.test.mjs` gebruikt de **echte** functies uit de ingebedde browsercode en Node.js WebCrypto (SHA-256). Scenario's: gelijkblijvend dossier, gewijzigde inhoud, gewijzigde digest, ongeoorloofde autoriteitsverhoging, extra/ongeldige velden en een opnieuw gehasht maar nog steeds onbevoegd dossier.

Voer lokaal uit:
```sh
node --test DOCS/la-observatorium/observatorium.test.mjs DOCS/la-observatorium/dossier-roundtrip.test.mjs
```
De workflow `.github/workflows/la-observatorium.yml` is toegevoegd voor pull-requestcontroles zonder deployment of publicatie. Een geslaagde Node.js-test dekt geen browser- of mobiele downloadworkflow. Beslissing blijft HOLD tot daadwerkelijke CI-uitkomst en interactieve acceptatie bekend zijn.

## Chromium-browseracceptatie (v0.5)
De geïsoleerde test `DOCS/la-observatorium/browser-acceptance.test.mjs` serveert de Observatorium-HTML via een lokale HTTP-server, zonder toegang tot een live Citadel-service. Met Playwright/Chromium doorloopt hij voor 320, 390 en 1280 pixels: formulierinvoer, Geheugen, inspectie in de Bewijskamer, dossierdownload, integriteitscontrole van het dossier en afwijzing van een gemanipuleerde kopie. Hij controleert ook op horizontale overflow, JavaScript-runtimefouten en het feit dat lokale permanente opslag standaard uit staat.

De workflow `.github/workflows/la-observatorium.yml` voert dit uit in een aparte job op pull requests. Deze controle simuleert mobiele schermbreedtes op desktop-Chromium en is **niet** gelijk aan een test op echte mobiele Safari, Android of de bestaande ChatGPT Sites-host.

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
