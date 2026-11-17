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

## Herstelbaar wissen bij browseropslagfout (v1.9)
De knop **Wis lokale notities** houdt de bestaande notities in het geheugen van het open tabblad beschikbaar zolang de permanente verwijdering niet aantoonbaar is voltooid. De toepassing bereidt de verwijdering voor, controleert met `save()` of logboek en toestemmingsmarkering zijn verdwenen en herstelt bij een fout de in-memory lijst. De interface meldt dan **Wissen NIET bevestigd**; de gebruiker kan het logboek nog inspecteren of als JSON exporteren. Bij bevestigde verwijdering verdwijnen ook de notities uit het tabblad.

Een extra Chromium-acceptatietest simuleert een `removeItem`-fout, inspecteert de resterende tijdlijn en exporteert de behouden notities. Dit garandeert geen herstel na sluiten van het tabblad; de gegevens zijn dan afhankelijk van de werkelijke browseropslag. De code blijft DRAFT/HOLD totdat de integrale browseracceptatie onafhankelijk is geslaagd.

## Wis-alles trekt ook bewaartoestemming in (v1.8)
De actie **Wis lokale notities** bevestigt vooraf dat naast de tabbladnotities ook de bewaartoestemming wordt ingetrokken. De applicatie zet de bewaarkeuze uit vóór `save()` en bevestigt een geslaagde verwijdering alleen als zowel het opgeslagen notitielogboek als de toestemmingsmarkering ontbreken. Hierdoor wordt bij actieve toestemming niet langer per ongeluk een leeg logboek opnieuw opgeslagen.

Een aparte Chromium-test maakt een opgeslagen notitie, wist alles na bevestiging, controleert dat beide sleutels ontbreken en controleert dezelfde toestand na herladen. De nieuwe test is toegevoegd maar pas als acceptatiebewijs bruikbaar na een werkelijk geslaagde browserrun. Status blijft HOLD.

## Herstelgrendels voor import en gewoon wissen (v1.7)
Zolang een lokale notitiekopie beschadigd is of de opslagstatus niet onafhankelijk kan worden bevestigd, weigert het Observatorium zowel een nieuwe JSON-import als de gewone knop **Wis lokale notities**. Hiermee kan een onleesbare bestaande kopie niet onopgemerkt door een import of normale wisactie verloren gaan. De afzonderlijke herstelprocedure blijft beschikbaar, inclusief een onveranderde ruwe download en een expliciet bevestigde reset.

Als de opslag tijdens importeren of normaal wissen faalt, vermeldt de interface dat alleen het huidige tabblad is gewijzigd en dat de blijvende opslag **niet bevestigd** is. Dit is geen bewijs dat de oorspronkelijke lokale kopie fysiek is gewist. Aparte Chromium-tests zijn toegevoegd voor geblokkeerde import, geblokkeerd wissen en een geforceerde mislukte wisactie. De release blijft HOLD totdat de tests daadwerkelijk zijn afgerond.

## Ruwe herstelkopie vóór verwijderen (v1.6)
Bij een beschadigd of onleesbaar lokaal notitielogboek biedt de herstelmodus een afzonderlijke knop **Download onleesbare kopie (lokaal)**. Deze download bevat de onveranderde ruwe tekst uit de bestaande lokale notitiekopie en heeft extensie `.txt` om niet te suggereren dat het om een gevalideerd JSON-dossier gaat. De download verandert noch de gegevens noch de bewaartoestemming. Een expliciete bevestiging blijft noodzakelijk voordat de lokale kopie en toestemming definitief worden gewist. De inhoud kan gevoelig zijn: bewaar de herstelkopie veilig en deel haar niet zonder noodzaak.

De Chromium-test vergelijkt de gedownloade bytes met de onleesbare bronwaarde en verifieert dat downloaden niets wist. Dit vormt geen cryptografische attestatie of bewijs. De release blijft HOLD tot browser- en mobiele acceptatie.

## Lokale ID's en statusmeldingen (v1.5)
Nieuwe lokale waarnemingen krijgen waar beschikbaar een `crypto.randomUUID()`-identificatie. Als die methode ontbreekt, wordt een lokaal gegenereerde ID samengesteld uit het apparaattijdstip en een oplopende teller, met extra controle op bestaande ID's. Het betreft uitsluitend een **lokale sleutel**, nooit een bewijs van identiteit of authenticiteit.

Als het bewaren van een toegevoegde waarneming niet kan worden bevestigd, meldt de interface uitdrukkelijk dat de notitie slechts tijdens de huidige sessie aanwezig is. Deze melding mag de eerdere opslagfout niet maskeren. Extra Chromium-tests controleren unieke IDs zonder UUID-generator en het foutpad voor lokale opslag. Browseracceptatie blijft HOLD totdat een volledige testjob daadwerkelijk is geslaagd.

## Verifieerbare wis- en bewaarstatus (v1.4)
Opslag en het intrekken van bewaartoestemming worden pas als geslaagd gemeld nadat de toepassing via `localStorage.getItem` controleert dat de notities en toestemmingsmarkering de verwachte waarden hebben. Wanneer schrijven, wissen of teruglezen faalt, claimt de interface geen succes. De permanente opslag wordt geblokkeerd en een expliciete herstelknop blijft beschikbaar. Ook die herstelprocedure verifieert dat beide opslagwaarden daadwerkelijk zijn verdwenen vóór de blokkade wordt opgeheven.

De geautomatiseerde Chromium-tests simuleren afzonderlijk een mislukte `setItem`- en `removeItem`-bewerking. Deze tests zijn toegevoegd, maar de browserteststatus blijft onbevestigd tot een succesvolle volledige CI-run. De applicatie kan geen fysieke vernietiging van eerder gekopieerde browser-, schijf- of systeemback-ups garanderen.

## Beschermd herstel bij onleesbare lokale gegevens (v1.3)
Bij actieve bewaartoestemming wordt een opgeslagen JSON-notitiekopie bij het openen volledig op schema, limiet, geldige velden en unieke IDs gecontroleerd. Een niet-parseerbare, ongeldige of intern conflicterende kopie wordt niet stilzwijgend gefilterd of met een lege verzameling overschreven. In plaats daarvan blijft de bestaande kopie lokaal aanwezig en wordt permanente opslag geblokkeerd; de applicatie toont **HERSTEL VEREIST**.

De eigenaar van het apparaat kan de beschadigde kopie uitsluitend na een expliciete bevestiging wissen. Annuleren behoudt de oorspronkelijke kopie. Daarna wordt de toestemmingsmarkering eveneens verwijderd en kan men opnieuw toestemming geven. Er wordt geen officiële historie hersteld en nooit een authenticiteits- of mandaatstatus toegekend. Voor deze grenzen zijn afzonderlijke Chromium-acceptatiescenario's toegevoegd; de testuitkomst blijft onbevestigd totdat CI een afgeronde browsertest meldt.

## Offline privacy- en herstelacceptatie (v1.2)
De Chromium-browseracceptatie bevat nu onafhankelijke scenario's voor niet-opgeslagen notities (verdwijnen bij herladen), expliciete bewaartoestemming (overleven herladen), intrekken van toestemming (lokaal opgeslagen notities en consentmarkering worden gewist) en verweesde opslag (een oude notitiekopie zonder actieve toestemming wordt bij openen verwijderd).

De introductie van deze tests is **geen** geslaagde browseracceptatie totdat GitHub Actions alle scenario's heeft uitgevoerd. De Observatorium-release blijft HOLD. De browserkopie is alleen een lokaal hulpmiddel; de canonieke bewijsgeschiedenis en de Citadel-hoofdsite worden niet gewijzigd.

## Stale-result beveiliging (v1.1)
Wanneer een gebruiker een ander JSON-inspectiedossier kiest, wordt een oude uitkomst `INTEGRITEIT KOMT OVEREEN` onmiddellijk vervangen door `controle nog niet uitgevoerd`. Iedere controle krijgt een opeenvolgend lokaal volgnummer; oudere asynchrone file-read- en SHA-256-uitkomsten mogen geen status of bestandsselectie van een nieuwere controle wijzigen. Een positieve uitslag geldt alleen voor de **laatst gecontroleerde bestandsinhoud**, nooit voor een nieuw geselecteerd dossier. Een Chromium-browsertest bewaakt deze overgang.

## Branchgerichte browsertests (v1.0)
De workflow is uitgebreid met een `push`-trigger die uitsluitend geldt voor `feature/la-observatorium-readonly-20261117` en relevante Observatorium- of workflowbestanden. De bestaande `pull_request`- en `workflow_dispatch`-triggers blijven behouden. Deze trigger dient uitsluitend om CI opnieuw te laten draaien; hij merged, deployed of publiceert niets. De workflow heeft alleen `contents: read` en de test bewaakt dit contract.

Let op: de GitHub connector voor commit-workflowhistorie retourneert in deze omgeving uitsluitend pull-request-geïnitieerde runs. Een `push`-getriggerde run kan daardoor plaatsvinden zonder zichtbaar te zijn in dat overzicht. Beschouw de browseracceptatie uitsluitend als PASS wanneer een afgeronde workflow en testuitkomst onafhankelijk terug te lezen zijn; tot dat moment blijft HOLD.

## Chromium-versieconsistentie (v0.9)
In de afgeronde GitHub-run `44023639342` faalden alle drie de browserscenario's **vóór paginaopstart**: de lokale Playwright-library verwachtte een browser executable onder `chromium_headless_shell-1194`, terwijl `npx playwright install` een nieuwere revision (`1255`) downloadde. Dit was een CI-dependencyfout, geen bewezen defect in het Observatorium.

De workflow gebruikt daarom expliciet `./node_modules/.bin/playwright install --with-deps chromium` in plaats van een automatisch door `npx` gekozen CLI, gevolgd door een controle of `chromium.executablePath()` daadwerkelijk bestaat. Pas de volgende voltooide browserjob bepaalt de acceptatiestatus; zonder die uitkomst blijft HOLD.

## Browserharnas betrouwbaarheid (v0.8)
De acceptatieharnas sluit de lokale HTTP-server voortaan ook als Chromium niet kan starten, en ruimt browserprocessen op na ieder scenario. De browserstart en HTTP-navigatie hebben afzonderlijke timeouts. Een mislukking of hang is geen bewijs van een defect in het Observatorium zelf; de CI-log moet het test- of applicatiefoutpad expliciet aantonen. De browseruitkomst blijft HOLD tot een volledige run is afgerond.

## Mobiele acceptatie en diagnose (v0.7)
Het lange statuslabel in de Citadel-header mag op schermen van 320px en breder afbreken; de header-inhoud mag geen horizontale overflow afdwingen. De browserjourney controleert 320, 390 en 1280 pixels en meldt expliciet of een eventuele storing plaatsvindt bij navigatie, dossierexport, hash-verificatie of afwijzing van manipulatie. Browseracties zijn begrensd met afzonderlijke timeouts, zodat een vastgelopen controle niet ten onrechte als PASS wordt behandeld.

De voorafgaande Chromium-job is als `cancelled` aangemerkt en levert dus geen acceptatiebewijs. Pas een afgeronde browserjob met PASS én aanvullende handmatige mobiele controle volstaan om de teststatus te verhogen. Release blijft HOLD.

## Mobiele toegankelijkheid (v0.6)
De vijf hoofdstukken volgen een tablist/tab/tabpanel-structuur met zichtbare focusindicatoren en minimale tabhoogte van 44px. Pijltjes links/rechts selecteren het volgende/vorige hoofdstuk, Home gaat naar het eerste en End naar het laatste; slechts de geselecteerde tab staat in de normale tabvolgorde.

De Chromium-acceptatietest controleert deze toetsenbordnavigatie en bewaakt tevens dat de standaard uitgeschakelde opslag geen lokale persoonsgegevens persisteert. Een eerdere Chromium-run werd geannuleerd tijdens een reeks commits; dit was geen vastgesteld functioneel PASS of FAIL.

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
