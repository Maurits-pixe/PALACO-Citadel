# PALACO ATELIER / LABORATORIUM — Citadel vertical slice v0.1

`la-foundation.v0.1.json` defines a reusable L.A. template sourced from `EVA-LA-001`, with a separate identity for each new Citadel. Its source status is DRAFT. The template preserves the constitutional kernel and ordered L.A. trajectory; design fields are limited to an allowlist. OR6IT is declared as the WORLD development ELIXER and only receives an entry contract for an independently verified official ACTIVE Citadel. No WORLD is created by this module.

`builder.mjs` provides the domain functions: create a draft, record the ten L.A. stages, customize permitted fields, register creative assets with hashes and renderer provenance, and construct a DRAFT proof manifest through `citadel-proof`. Run `node --test atelier/builder.test.mjs citadel-proof/proof.test.mjs`.

The currently implemented scope is a **local domain reference**, not a wizard or production platform. Caller supplied maker IDs, project IDs, official status, authority verification and export sequence are untrusted unless validated by a server. A deployed Atelier needs authenticated tenancy and project isolation, persisted append-only audit with concurrency control, safe rendering and asset scanning, durable sequence tracking, independent review, signing key enrollment and a separate activation service. The source Notion pages were not independently accessible in this session; this contract follows the supplied design brief and requires a canonical content review before activation.

Next UI milestone: guided New Citadel flow using this contract, isolated preview in the L.A. layout, accessible customization controls, and export download. WORLD and ELIXER builders follow after the Citadel path is integrated and verified. Generated assets remain `CREATIVE_ASSET`, never proof or authority.

## Begeleide wizard en RIO

`wizard.html` is de zichtbare New Citadel route, bereikbaar vanaf de Citadel homepage. RIO's local guide explains the current step and points out missing input. It cannot choose on behalf of the maker, verify evidence, grant a role, or activate a Citadel. The browser downloads a local DRAFT JSON concept. This download is **not** a signed manifest, verifiable package, official Citadel, or secure multi-user record. The server side Builder must validate this input and run `draftExport` with exact file bytes and durable export sequence before it can claim a proof package. Browser flow has a DOM contract test but has not received real browser visual QA in this run.


## Grand Studio v1.1 — aanvullende ontwerpruimte

- Open `atelier/studio.html` voor een zelfstandige, lokaal werkende maquette (12×8, 96 percelen). De bestaande `wizard.html` blijft de begeleide New Citadel-conceptprocedure.
- Veertien gereedschappen, vijf architectuurstijlen, vijf sferen, schaalkeuze, ontwerpgeschiedenis (undo/redo), dertig lokale momentopnamen, lokale browseropslag, JSON-import/export en statische SVG-export.
- Drie vrij aanpasbare starters: Tuin der Rust, Stad aan het Water en Koninklijk Kwartier. Voorbeelden vervangen het actieve lokale ontwerp uitsluitend na bevestiging.
- De ontwerpanalyse en tekstuele ontwerpbrief zijn **indicatieve creatieve adviezen**, geen vastgestelde bouwkundige, ecologische of juridische beoordeling.
- Beveiligingsgrens: browserbestanden blijven `DRAFT` met `authority: NONE`. Import weigert een onbekend schema of claims op bevoegdheid. Geen accountkoppeling, serverregistratie, EDTR-uitgifte, OR6IT-activatie of WORLD-creatie.
- De ontwerpstudio staat op een afzonderlijke PR-branch. Niet publiceren of mergen zonder code review en echte browsertests, inclusief mobiel en importscenario's.

## Panorama v1.0 — lokale isometrische presentatie

`panorama.html` leest hetzelfde browseropslagconcept als `studio.html` en toont een isometrisch architectuurbeeld met vier standpunten, zoom, visuele hoogte en instelbaar licht. SVG-export bevat uitsluitend een creatieve DRAFT-visualisatie. Dit is een volumetrische 2.5D-schets, geen fysieke 3D-engine of gevalideerd bouwkundig model. De functie ondersteunt lege/ongeldige browseropslag zonder servercontact, en claimt geen account-, WORLD-, EDTR- of activatierechten. De maquette uit de Grand Studio blijft de enige lokale ontwerpbron.

**Acceptatievoorwaarde:** test in een echte browser op mobiel en desktop vóór publicatie. Controleer alle vier de cameraweergaven, laden van opgeslagen concepten, exports en behandeling van ongeldig importmateriaal.

## Interieuratelier v1.0 — luxe ontwerp op drie verdiepingen

`interieur.html` is een aanvullende lokale ontwerpruimte voor de Citadel met drie onafhankelijke 10×8-verdiepingen (240 vakken), veertien ruimtelijke categorieën plus gum, vijf materiaalcollecties, vijf lichtsferen, een luxe voorbeeldindeling, undo/redo, browseropslag, schema-gevalideerde JSON-import/export en per-verdieping SVG-export.

De module heeft een eigen opslagruimte (`palaco.citadel.atelier.interior.v1`) en wijzigt de bestaande `studio.html`-maquette, `panorama.html`, `wizard.html` of de officiële Citadel-identiteit niet. De onderlinge navigatie is uitgebreid, zonder een bestaande route te vervangen. Import accepteert alleen schema `palaco.citadel.atelier.interior/1`, `state: DRAFT`, `authority: NONE`, exact drie verdiepingen en bekende ruimtetypen.

**Grenzen:** ruimtes zijn artistieke plattegrondconcepten, geen gecertificeerde maten of constructie-/brandveiligheidstoets. Er is geen serveropslag, login, EDTR-uitgifte, OR6IT-activatie of WORLD-creatie. Broncode-syntaxis gecontroleerd; visuele en mobiele browsertests blijven een releasevoorwaarde. Houd de PR in DRAFT / HOLD.

## Atelier Regiekamer v1.0 — module-overstijgend creatief dossier

`regiekamer.html` is een aanvullende, statische, lokale projecthub. Zij leest (zonder te muteren) de bestaande browseropslag van Grand Studio en Interieuratelier. Panorama is een weergave van Grand Studio, geen derde ontwerpbron; New Citadel Wizard blijft een afzonderlijk DRAFT-traject. De Regiekamer bewaart uitsluitend een aparte ontwerpnotitie onder `palaco.citadel.atelier.regiekamer.note.v1`. Alle vier bestaande modules linken naar de Regiekamer.

Projectoverzicht: aantallen ingerichte exterieur- en interieurpercelen, natuur/water, ruimtelijke functies en niet-normatieve ontwerpchecks. Export: één samenhangend, **niet-geverifieerd creatief DRAFT JSON-dossier** (sanitized fields uit beide maquettes, alleen schema-goedgekeurde invoer), plus een TXT-overzicht. Dit dossier is nadrukkelijk **niet** het officiële Citadel proof manifest en bevat geen authenticiteitshandtekening of authority.

Geen automatische koppeling van PALACO ONE of WORLD/OR6IT, geen extern schrijven, geen serveraudit of actieve Site-update. Syntaxis en de expliciete `DRAFT / NONE`-controle zijn statisch nagekeken; functionele browser-, export-, toegankelijkheids- en mobiele acceptatietests blijven vereist voordat deze PR wordt gemerged of gepubliceerd.

## Ontwerpgalerij v1.1 — read-only preview in de Regiekamer

De Regiekamer biedt nu vier tabbladen: **exterieur (12×8)**, **begane grond**, **eerste verdieping** en **tweede verdieping** (elk 10×8). De galerij leest uitsluitend gevalideerde lokale DRAFT-brondata; er is geen extra masterkopie en er worden geen wijzigingen aan de maquette of het interieur opgeslagen. De editor-link verwijst naar de oorspronkelijke bewerkmodule. Elke geldige laag kan afzonderlijk als schematisch SVG-beeld worden geëxporteerd. Indien een ontwerp ontbreekt of ongeldig is, verschijnt een neutrale lege visualisatie en wordt export geblokkeerd.

De pure renderer staat in `regiekamer-gallery.js`, met tests in `regiekamer-gallery.test.cjs`. Draai in een Node-omgeving: `node --test atelier/regiekamer-gallery.test.cjs`. De checks dekken vier zichtlagen, gegevensisolatie, DRAFT/NONE-gates, afmetingen en XML-escaping. Een aanvullende bron- en runtimefunctiecontrole is uitgevoerd, maar echte browser/desktop/mobile acceptatie en CI zijn nog niet vastgesteld. Laat release en merge op HOLD staan.

## Portable projectarchief v1.2 — herstelbaar creatief DRAFT-werk

De Regiekamer kan een gecombineerd **PALACO-Atelier-Compleet-Project-DRAFT.json** bewaren en herstellen. Het pakket bevat alleen gevalideerde exterieurvelden (naam, schaal, stijl, sfeer, 96 percelen), gevalideerde interieurvelden (naam, materialen, sfeer en drie verdiepingen van 80 vakken) en een ontwerpnotitie van maximaal 6000 tekens. De afzonderlijke opslaggebieden blijven de primaire bronnen; export is een kopie en laat autorisaties, creatiegeschiedenis en officiële bewijsclaims weg.

`regiekamer-bundle.js` controleert expliciet schema `palaco.citadel.atelier.portable/1`, `state: DRAFT`, `authority: NONE`, bekende objectcategorieën en het bestandformaat. De import vraagt bevestiging, schrijft uitsluitend de bekende lokale Atelier-sleutels en probeert bij een schrijffout alle oorspronkelijke waarden te herstellen. Een uitzonderlijk opslagfalen kan ook rollback verhinderen; dat wordt expliciet gemeld en blijft een risico van `localStorage`. Er is geen transactiegarantie tussen browsers, apparaten of tabbladen en geen cryptografische validatie.

Gerichte cases staan in `regiekamer-bundle.test.cjs`: round-trip, ongeautoriseerde en onbekende gegevens, exacte schrijfscope, eenmalige schrijffout met rollback en permanente opslagfouten. Testcommando: `node --test atelier/regiekamer-bundle.test.cjs atelier/regiekamer-gallery.test.cjs`. Nog vereist: echte browseracceptatie, mobiele export/import en conflictgedrag bij meerdere tabs. Niet mergen/publiceren zonder review.

## Regiekamer v1.7 — importpreflight en tabconflicten (2026-11-17)

De portable projectimport toont nu vóór bevestiging de namen en het aantal ingerichte exterieur- en interieurpercelen, plus de lengte van de ontwerpnotitie. Onopgeslagen wijzigingen in de Regiekamer-notitie worden expliciet gemeld.

`regiekamer-bundle.js` bevat voortaan `snapshot(storage)`, waarmee drie ruwe waarden van de lokale Atelier-opslag worden gelezen. De restore-aanroep accepteert een optionele verwachte snapshot en weigert overschrijven als de waarden sinds de importpreview veranderd zijn. Bestaande oproepen zonder deze parameter blijven ondersteund. `regiekamer-bundle.test.cjs` heeft aanvullende regressiecategorieën voor stale previews, overeenkomende snapshots en ongeldige snapshots (8 testcases totaal).

**Beperking:** browser-`localStorage` heeft geen atomair compare-and-swap. Een gelijktijdige wijziging precies tussen de vergelijking en het schrijven kan niet volledig worden uitgesloten. De controle verkleint het overschrijfrisico, maar vervangt geen transactionele backend, onafhankelijk reviewproces of formele autorisatie. Ook deze versie blijft DRAFT/HOLD en niet live gepubliceerd.

## Releasepoort v1.8 — geïsoleerde Atelier-validatie

Een aparte pull-request-workflow, `.github/workflows/atelier-validation.yml`, controleert wijzigingen onder `atelier/**` zonder GitHub Pages-deployrechten. De workflow draait met Node.js 22, read-only repositoryrechten en twee groepen tests: (1) portable projectarchief, galerij en statische modulecontracten; (2) de oorspronkelijke builder-, wizard- en proof-tests. De bestaande Pages-deployworkflow en releasebevoegdheden blijven ongewijzigd.

De browser-UMD-scripts worden in de Node-tests nu met `node:vm` geladen in plaats van via `require()`: het project heeft namelijk `"type":"module"`. Assertions zijn aangepast om verschillen tussen JavaScript-realms niet ten onrechte als inhoudelijke fouten te beoordelen. De zes nieuwe `atelier/atelier-surface.test.cjs`-contractcontroles verifiëren modulecontinuïteit, wederzijdse navigatie, inline JavaScript-syntaxis, lokale afhankelijkheden, DRAFT/NONE en het behoud van de New Citadel Wizard.

**Nog te bevestigen:** daadwerkelijke GitHub Actions-uitvoering met groen resultaat, visuele browser-QA, mobiele interface-QA en datamigratie/gelijktijdige-tabscenario's. Een statische test bewijst geen volledige webapp-functionaliteit. Tot die controles slagen blijft PR #60 DRAFT / HOLD en vindt geen publicatie plaats.

## Atelier v1.9 — mobiele en desktop-browseracceptatie

De PR-validatie is uitgebreid met `tests/browser/atelier.spec.mjs`. Deze Playwright-tests draaien met de bestaande `playwright.config.mjs` op twee Chromium-schermformaten: mobiel 390×844 en desktop 1440×900. Getest worden (1) editor → interieur → Regiekamer → galerij, (2) portable DRAFT-export, herstel en afwijzen van authority-claims en (3) panorama-camerastandpunten en wederzijdse module-navigatie. Ze vergen geen productieaccount of servermutaties.

De workflow `.github/workflows/atelier-validation.yml` installeert vergrendelde npm-afhankelijkheden en Chromium, voert bestaande domein- en contracttests uit en draait gericht de nieuwe browsertests. De workflow heeft uitsluitend `contents: read` en geen deployrechten.

**Releasegate:** broncode/testdefinitie toegevoegd betekent nog niet dat de nieuwe browsertests daadwerkelijk geslaagd zijn. De status blijft HOLD totdat de workflow een bevestigde success-conclusie heeft, inclusief Playwright, en een onafhankelijke visuele/manual review is uitgevoerd.

## Atelier v2.0 — offline navigatie en cache-integriteit

De bestaande Citadel-serviceworker `sw.js` precachet met versiesleutel `palaco-rio-shell-v6` nu eveneens `atelier/studio.html`, `atelier/panorama.html`, `atelier/interieur.html`, `atelier/regiekamer.html` en beide gedeelde Regiekamer-scripts. De oorspronkelijke shellbestanden en wizard blijven behouden. Dit is een additieve aanpassing op de PR-branch; de live site is niet bijgewerkt.

Een extra Playwright-scenario in `tests/browser/atelier.spec.mjs` controleert eerst de aanwezigheid van alle zes nieuwe resources in de Service Worker-cache, schakelt daarna Chromium offline en bezoekt achtereenvolgens Regiekamer, Grand Studio, Interieuratelier, Panorama en Wizard. Het scenario draait met de bestaande mobile/desktop projectconfiguraties.

**Grenzen:** het offlinepad werkt pas nadat de serviceworker succesvol geïnstalleerd en de assets gecachet zijn. Bestaande browseropslag blijft apparaatlokaal. Er zijn geen offline autorisaties, cryptografische uitgiftes, automatische synchronisatie, of formele projectregistraties. De nieuwe tests moeten succesvol op de nieuwste PR-SHA zijn uitgevoerd voordat de offlineclaim als volledig geaccepteerd geldt. Merge en publicatie blijven HOLD.

## Atelier v2.1 — zichtbaar offline-verbindingskompas

De Regiekamer toont nu expliciet of `sw.js` beschikbaar is en alle zes benodigde creatieve modules/resources in `palaco-rio-shell-v6` zijn opgenomen. De weergave onderscheidt **Offline gereed** (verbonden + volledige cache), **Offline actief** (offline + volledige cache), **Nog niet offline gereed** en **Offline beperkt**. Bij twijfel of niet-toegankelijke cache wordt geen positieve claim getoond. Een knop biedt opnieuw controleren; netwerk- en serviceworkerstatuswijzigingen verversen de waarneming.

De offline-acceptatietest controleert nu zowel de succesvolle offline-indicatie als een opzettelijk onvolledige cache (5 van 6). De functionaliteit biedt geen permanente gegevensgarantie of automatische synchronisatie tussen apparaten. De eerdere succesvolle browser- en CI-runs horen bij v2.0; een nieuwe volledige GitHub-acceptatierun moet v2.1 apart bevestigen. PR #60 blijft DRAFT / HOLD en geen productiepublicatie vindt plaats.

## Atelier v2.2 — gecontroleerd offlinepakket-herstel

Het Verbindingskompas van `regiekamer.html` heeft een knop **Herstel offlinepakket**. Deze werkt uitsluitend wanneer een internetverbinding beschikbaar is. Via de bestaande serviceworker worden alleen ontbrekende bestanden van de zes Atelier-assets opgehaald en aan `palaco-rio-shell-v6` toegevoegd; reeds gecachete bestanden blijven intact. Er worden geen lokale creatieve ontwerpgegevens of DRAFT-projectbestanden aangepast.

Na voltooiing telt de interface opnieuw alle resources en meldt hoeveel bestanden ontbraken. Fouten en offlinegebruik krijgen een expliciete melding, zonder succesclaim. De Playwright-suite test (1) het herstellen van een opzettelijk verwijderd cachebestand en (2) de weigering om netwerkloos herstel als succesvol te presenteren. Dit is een herstelhulpmiddel voor browserbestanden, **niet** voor verloren browser-`localStorage`-data, accounts of serverregistraties.

De eerdere v2.1-runs op commit `85f9347cb1bcde285efb62256a594189f8f773b5` zijn alle groen bevestigd. v2.2 heeft opnieuw een afzonderlijke CI-/browsercontrole nodig. De PR blijft DRAFT/HOLD; geen live-publicatie.

## Atelier v2.3 — transparante importvergelijking

De Regiekamer berekent voortaan vóór elk portable-projectherstel via `regiekamer-bundle.js` een pure `preview(current,incoming)`. Deze toont de aantallen veranderende en leeg te maken percelen in exterieur en de drie interieurlagen, plus expliciete waarschuwingen bij verwijdering van een compleet onderdeel of vervanging van de ontwerpnotitie. De gebruiker krijgt de samenvatting vóór de bevestigingsdialoog. Annuleren schrijft niets. Na bevestiging blijft de bestaande snapshotcheck van kracht, zodat gewijzigde lokale gegevens niet stilzwijgend worden overschreven.

Twee nieuwe Node-cases dekken inhoudelijk verschil, verwijdering, niet-muterend vergelijken en afwijzing van `authority: OWNER`. Een aanvullende Playwright-case controleert dat annulering na een getoond verwijderingsrisico de oorspronkelijke ontwerpgegevens behoudt. Een afzonderlijke PR-run moet de nieuwste uitbreiding valideren. Deze preview is alleen voor creatief DRAFT-werk en geen formele revisie/vergunning of cryptografische authenticiteitscontrole. PR #60 blijft DRAFT/HOLD.

## Atelier v2.4 — omkeerbaar lokaal DRAFT-projectherstel

Bij een bevestigde projectimport in de Regiekamer maakt `regiekamer-bundle.js` **vóór het overschrijven** een lokale herstelkopie van het huidige gevalideerde creatieve project, onder sleutel `palaco.citadel.atelier.regiekamer.recovery.v1`. Zonder ruimte voor die kopie gaat de import niet door. Onleesbare of niet-DRAFT-bronnen worden niet automatisch overschreven. Het bestaande snapshotconflictmechanisme blijft actief. Na import komt de knop **Herstel vorig lokaal ontwerp** beschikbaar; hij toont het verschil, vraagt bevestiging en kan de vorige lokale versie terugzetten. Bij terugzetten wordt de direct voorgaande opgeslagen versie omwisselbaar bewaard als nieuwe herstelkopie. Alleen de laatste lokale toestand wordt bijgehouden, geen onbeperkt versiebeheer.

Regressietests controleren het checkpoint, éénstaps-herstel, omwisseling, corrupte brondata, gelijktijdige wijziging, opslaglimieten en ongeldige/ongeautoriseerde herstelkopieën. Een nieuwe Playwright-test doorloopt het herstel in de Regiekamer met echte browseropslag. **Belangrijk:** dit mechanisme is uitsluitend lokaal in dezelfde browser en vervangt geen geëxporteerde back-up of cross-device synchronisatie; browsergegevens wissen kan ook de herstelkopie verwijderen. Een multi-key `localStorage`-transactie is niet atomair. Ook v2.4 blijft DRAFT/HOLD in PR #60 totdat de actuele CI en browseracceptatie zijn bevestigd.

## Atelier v2.5 — herstelkopie exporteren voor bewaring buiten de browser

De Regiekamer biedt nu naast **Herstel vorig lokaal ontwerp** de knop **Exporteer herstelkopie (JSON)**. Deze wordt uitsluitend ingeschakeld als een valide lokale herstelkopie beschikbaar is. De export leest het eerdere DRAFT-ontwerp met `getRecovery()`, valideert opnieuw via het portable schema `palaco.citadel.atelier.portable/1` en downloadt `PALACO-Atelier-Vorige-Versie-DRAFT.json`. Het huidige ontwerp en de opgeslagen herstelkopie worden niet gewijzigd. Interne metadata van de recovery-slot (zoals het opgeslagen herstelmoment) wordt niet geëxporteerd.

De bestaande Playwright-herstelscenario's controleren nu ook bestanddownload, schema, `authority: NONE`, inhoud van het eerdere ontwerp en behoud van het huidige ontwerp. De statische contractsuite bewaakt de aanwezigheid van de exportactie en de validatie via `getRecovery`. Hiermee is de vorige versie ook buiten het lokale browserprofiel te bewaren, maar opslag/verzending van het bestand blijft een gebruikershandeling. Automatische synchronisatie, cryptografische integriteitsverklaring en officiële uitgifte zijn buiten scope. PR #60 blijft DRAFT/HOLD in afwachting van de nieuwe browser- en CI-controles plus onafhankelijke visuele review.

## Atelier v2.6 — bestandinspectie en SHA-256-vingerafdruk

De Regiekamer heeft een aparte **Controleer een projectbestand zonder import**-actie. De gebruiker kan een `.json`-bestand kiezen (maximaal 150 KB); de controle decodeert de oorspronkelijke UTF-8-bytes, valideert de inhoud uitsluitend via het bestaande portable DRAFT-contract, telt exterieur-/interieurvakken en vermeldt de notitielengte. Vervolgens wordt met de Web Crypto API een SHA-256-vingerafdruk berekend over de **ongewijzigde bestandsbytes**. Een onjuist schema, ongeldige codes of `authority !== NONE` wordt afgewezen. Deze handeling schrijft niets naar de creatieve opslag, maakt geen herstelkopie en autoriseert geen project.

De vingerafdruk is bedoeld voor handmatige bestandsvergelijking/integriteitscontrole; **niet** voor authenticatie, cryptografische herkomstbewijzen of officiële goedkeuring. Zonder externe vertrouwde referentiewaarde kan een checksum geen manipulatie aantonen. De browseracceptatie vergelijkt de getoonde SHA-256 met Node's onafhankelijke `crypto.createHash`, en controleert dat het huidige project bij geldige of geweigerde inspectie behouden blijft. v2.6 vereist opnieuw bevestigde CI-/Chromium-acceptatie en blijft in DRAFT/HOLD op PR #60 zonder productiepublicatie.

## Atelier v2.7 — vergelijking tegen een eerder vastgelegde SHA-256-referentie

De niet-destructieve projectinspectie in de Regiekamer ondersteunt nu een optionele SHA-256-referentie van exact 64 hexadecimale tekens. Het bestand wordt nog altijd als portable DRAFT/NONE-ontwerp gevalideerd, waarna zijn ruwe bytes worden gehasht. Bij een ingevulde referentie verschijnt een expliciete uitkomst: **REFERENTIE KOMT OVEREEN** of **WAARSCHUWING: SHA-256 KOMT NIET OVEREEN**. Hoofdletters in de ingevoerde hex-waarde worden geneutraliseerd voor de vergelijking. Een ongeldige invoerlengte of niet-hexadecimale invoer leidt tot weigering. Zonder referentie wordt uitsluitend de berekende vingerafdruk getoond en wordt er geen overeenkomst geclaimd.

De referentie wordt niet opgeslagen of verzonden; er zijn geen ontwerpwijzigingen, privileged writes of automatische import. Dit is alleen een **byte-voor-byte integriteitsvergelijking** tegen een door de gebruiker aangeleverde waarde. Voor betrouwbaarheid moet die waarde vooraf onafhankelijk en op een vertrouwde plaats zijn vastgelegd. SHA-256 op zichzelf authenticeert noch afzender noch Citadel-bevoegdheid. De Playwright-test controleert een correcte referentie, een bewust verkeerde referentie, ongeldige invoer en geen onbedoelde lokale projectmutaties. v2.7 blijft DRAFT/HOLD, met afzonderlijke CI-/browseracceptatie en fysieke UX-review als releasevoorwaarden.

## Atelier v2.8 — afzonderlijk SHA-256-controlebewijs

Na succesvolle niet-destructieve projectinspectie heeft de Regiekamer een knop **Bewaar SHA-256-referentie (TXT)**. De lokaal gegenereerde tekst bevat de SHA-256 van de exacte oorspronkelijke bestandsbytes, de bestandsnaam en een expliciete verklaring dat dit geen digitale handtekening, bewijs van herkomst of officiële toestemming is. Er is geen serveropslag, geen vertrouwde tijdstempel en geen officiële PALACO-bevoegdheid.

De download is uitsluitend beschikbaar na geldige schema- en integriteitsinspectie. Een nieuw te controleren bestand schakelt de knop eerst uit; wanneer de nieuwe controle faalt, blijft de knop uitgeschakeld en kan de oude referentie niet per ongeluk aan het volgende bestand worden gekoppeld. De browseracceptatie test de gedownloade TXT-inhoud en het uitschakelen na ongeldige invoer. De referentie moet **afzonderlijk en veilig** bewaard worden, aangezien een gewijzigd projectbestand én een meegewijzigde referentie anders schijnbaar overeen kunnen komen. v2.8 blijft DRAFT/HOLD tot nieuwe GitHub-acceptatie en onafhankelijke visuele mobiele review.

## Atelier v2.9 — herstel TXT-controlebewijs en import van SHA-256-referenties

De v2.8-browseracceptatie vond een echte fout: de bestandsnaam in het TXT-controlebewijs werd onbedoeld gewijzigd door een te brede regex. De bestandsnaam-sanitisatie is beperkt tot ASCII-besturingskarakters; de oorspronkelijke normale bestandsnaam blijft intact.

De Regiekamer kan nu ook een eerder geëxporteerd **SHA-256-referentiebestand (TXT)** inlezen. De importer accepteert uitsluitend lokale tekstbestanden tot 4 KB met een SHA-256-regel van exact 64 hexadecimale tekens, vult daarmee het bestaande optionele referentieveld en vereist vervolgens **een nieuwe bestandscontrole**. Een nieuwe of ongeldige referentie maakt een eerder downloadbaar controlebewijs direct ongeldig in de UI. Geen gegevens worden naar een server verzonden en er worden geen lokale ontwerpen gewijzigd.

De browseracceptatie dekt het export/import-roundtrip, het behoud van de bestandsnaam, checksumvergelijking en weigering van ongeldige TXT-invoer. Een geïmporteerde referentie is niet automatisch betrouwbaar; de gebruiker moet de herkomst onafhankelijk kennen. Er wordt geen identiteitsbewijs, cryptografische handtekening, officiële timestamp of authorization verleend. Nieuwe volledige CI-acceptatie is vereist; PR #60 blijft DRAFT/HOLD.

## Atelier v3.0 — versheidscontrole van integriteitsbewijzen

De Regiekamer voorkomt nu dat een oude SHA-256-inspectie geldig lijkt nadat de gebruiker het verwachte SHA-256-veld handmatig heeft gewijzigd. Iedere invoerwijziging maakt de vorige verificatie ongeldig, vergrendelt de TXT-controlebewijsexport en vraagt om het opnieuw selecteren van het JSON-projectbestand. Wanneer de gekozen DRAFT-bron niet overeenkomt met een ingebrachte referentie, blijft de knop **Bewaar SHA-256-referentie** uitgeschakeld. Zonder referentie kan na een geldige broninspectie nog altijd een nieuwe onbevoegde SHA-256-referentie worden geëxporteerd.

Mobiele en desktop-Playwrighttests dekken handmatig gewijzigde referenties, blokkering van export bij een hash-mismatch en de nieuwe controles in de oorspronkelijke export/import-roundtrip. De statische contractsuite borgt het referentie-invoerlistener en de mismatchpoort. Dit is een lokale integriteitscontrole: geen ondertekening, bewezen herkomst of officiële autorisatie. PR #60 blijft DRAFT/HOLD totdat de actuele GitHub-workflows en onafhankelijke visuele beoordeling zijn afgerond.

## Atelier v3.1 — controle-uitkomsten behoren altijd bij de nieuwste selectie

De Regiekamer gebruikt nu een oplopend lokaal revisienummer voor de niet-destructieve SHA-256-projectinspectie en het inlezen van TXT-referenties. Iedere nieuwe JSON-selectie, TXT-selectie en handmatige wijziging van de verwachte SHA-256 maakt nog lopende inspecties onmiddellijk ongeldig. Na asynchrone bestandslezing en na de digestberekening wordt gecontroleerd of de uitkomst nog bij de nieuwste gebruikersactie hoort. Alleen die actuele uitkomst mag de status of de exportknop bijwerken. Ook verouderde foutmeldingen worden onderdrukt, zodat ze een nieuwere geldige controle niet overschrijven.

Twee Playwright-regressieproeven simuleren expliciet een vertraagde oudere JSON-bestandslezing en een referentiewijziging terwijl een oudere inspectie nog loopt. De statische contractsuite controleert de aanwezigheidsvoorwaarden van de revisiebewaking. Deze bescherming is lokaal en onafhankelijk van formele autoriteit: DRAFT / authority NONE. De bestaande offline-DRAFT-projectarchieven, de wizard en de live Citadel blijven onaangeroerd. Productiepublicatie blijft HOLD tot nieuwe CI/browseracceptatie en onafhankelijke visuele review.

## Atelier v3.2 — projectexport met bijpassend SHA-256-referentiebestand

De Regiekamer kan voortaan direct na het downloaden van het complete creative DRAFT-projectbestand een apart `PALACO-Atelier-Projectexport-SHA256-DRAFT.txt` aanbieden. De hash wordt berekend over **exact de UTF-8-bytes van de geserialiseerde JSON-tekst** die aan de browserdownload wordt aangeboden, niet over een herbouwd projectmodel. De knop voor het TXT-controlebewijs is standaard uitgeschakeld, en wordt per export opnieuw vergrendeld totdat de bijbehorende digest voltooid is. Bij een volgende export vervalt de oude hash. De export blijft lokaal en kent geen serverregistratie, ondertekening of bevoegdheidsuitgifte.

De Playwright-suite vergelijkt de sha256 van de echt gedownloade JSON-bytes onafhankelijk met de TXT-referentie via Node crypto. Een tweede testcase controleert dat een nieuw exportbestand ook een bijpassende nieuwe vingerafdruk oplevert. Zo kan een gebruiker zijn projectbestand en de afzonderlijk te bewaren hash direct na export vastleggen. Een SHA-256-hash bevestigt zonder een extern vertrouwde referentie geen authenticiteit. Deze wijziging blijft DRAFT/HOLD en vereist opnieuw alle CI-/Chromium-acceptaties en onafhankelijke visuele review.

## Atelier v3.3 — controleer het daadwerkelijke gedownloade projectbestand

De Regiekamer biedt nu, direct nadat een compleet projectpakket is geëxporteerd en de SHA-256-digest beschikbaar is, de aparte invoer **Controleer het gedownloade JSON tegen je laatste export**. Hiermee kan de gebruiker het werkelijk op schijf opgeslagen bestand opnieuw selecteren. De functie controleert opnieuw het portable DRAFT/NONE-contract, berekent de SHA-256 over de ruwe bestandsbytes en vergelijkt deze met de digest van de **laatste export uit deze sessie**. Ze onderscheidt **CONTROLE GESLAAGD**, **WAARSCHUWING: ... wijkt af** en **Exportcontrole geweigerd**. Ze verandert geen ontwerpen, controlebewijzen of servergegevens.

Bij elke nieuwe projectexport wordt de vorige bestandscontrole onmiddellijk ingetrokken. Een oplopend exportrevisienummer voorkomt dat een vertraagde oudere bestandslezing of digest het resultaat van een nieuwere export kan overschrijven. De Playwright-suite test exacte matching, gewijzigde DRAFT-payloads, geweigerde OWNER-claims en een vertraagde eerdere controle tijdens een nieuwe export. Het bewijs is een lokale integriteitsvergelijking; geen officiële signature, externe attestatie of garantie voor downloads. PR #60 blijft DRAFT/HOLD tot de nieuwe CI/Chromium-controles en onafhankelijk mobiele visuele beoordeling.

## Atelier v3.4 — projectbestand en checksumreferentie als bestandspaar controleren

De Regiekamer kan één portable DRAFT-projectbestand (.json, max. 150 KB) samen met precies één lokaal SHA-256-tekstbewijs (.txt, max. 4 KB) inspecteren. De twee bestanden worden in een enkele lokale handeling gelezen, zonder projectimport of opslagwrites. Het JSON moet het bestaande portable schema met authority NONE doorstaan; het TXT-bestand moet precies één geldige SHA-256-regel bevatten. SHA-256 wordt berekend over de exacte JSON-bestandsbytes en vergeleken met de referentie. Het resultaat is geslaagd, afwijkend of geweigerd. Een nieuwe selectie maakt de vorige asynchrone bestandscontrole ongeldig.

Playwright test het geldige bestandspaar, gewijzigde inhoud, ongeldig OWNER-project, dubbele SHA-regels en behoud van de huidige browseropslag. De waarde van de SHA is alleen bruikbaar indien de TXT-referentie eerder onafhankelijk vertrouwd is vastgelegd; overeenkomende bestanden bewijzen op zichzelf geen authenticiteit of officiële Citadel-bevoegdheid. PR #60 blijft DRAFT/HOLD tot CI, browseracceptatie en onafhankelijke visuele review.

## Atelier v3.5 — downloadbaar rapport na geslaagde JSON/TXT-paarcontrole

De Regiekamer biedt een nieuw **Bewaar inspectierapport (JSON)**-commando wanneer een gecombineerd DRAFT-projectbestand en SHA-256-referentiebestand werkelijk overeenkomen. De export bevat uitsluitend het schema palaco.citadel.atelier.inspection/1, DRAFT/authority NONE, de uitkomst MATCH, een lokale controletijd, de twee bestandsnamen, SHA-256, bezette exterieur-/interieurvakken, notitielengte en expliciete beperkingen. Creatieve ontwerpgegevens worden niet opgenomen. Dit is **geen EDTR, digitale handtekening, officiële attestatie of bewijs van herkomst**.

De knop is standaard uitgeschakeld en wordt direct vergrendeld bij elke volgende selectie. Een afwijkend of ongeldig bestandspaar kan nooit een rapport van die controle exporteren. Een Playwright-regressietest downloadt het JSON-rapport en controleert schema, hash, namen, beperkingen, afwezigheid van ontwerpen en blokkering na afwijzing. De oorspronkelijke DRAFT-projectarchieven en de live Citadel blijven onaangeroerd. CI/browseracceptatie en een onafhankelijke visuele/fysieke mobiele review blijven vereist; PR #60 is DRAFT/HOLD.

## Atelier v3.6 — drievoudige hercontrole van eerder opgeslagen DRAFT-bewijsstukken

De Regiekamer kan een **creatief project-JSON**, een **SHA-256-referentie-TXT** en het eerder gedownloade **DRAFT-inspectierapport-JSON** in één handeling lokaal hercontroleren. De JSON-bestanden worden aan hun schema onderscheiden. De portable-projectvalidator en het rapportcontract eisen state DRAFT, authority NONE, purpose LOCAL_INTEGRITY_COMPARISON_ONLY en result MATCH. Opnieuw berekende SHA-256 van de oorspronkelijke projectbytes moet overeenkomen met zowel de TXT-referentie als de hash in het rapport. De bestandsnamen van project en referentie, aantallen exterieur-/interieurvakken en notitielengte moeten overeenkomen met het verslag. Fouten en afwijkingen worden gescheiden weergegeven, zonder opslag- of serverwrites.

De browsertest maakt eerst een echt inspectierapport via de bestaande paarcontrole, laadt alle drie de bestanden opnieuw, en test negatieve wijzigingen in de tellingen, SHA-256 en authority. Een revisienummer zorgt dat verouderde, asynchrone controles de nieuwste uitkomst niet kunnen overschrijven. De inspectiedatum in een lokaal bestand is niet onafhankelijk geattesteerd en bewijst geen werkelijk tijdstip. Ook drie overeenkomende zelfbeheerde bestanden bewijzen **geen authenticiteit, officiële herkomst of PALACO-bevoegdheid**. PR #60 blijft DRAFT/HOLD: nieuwe CI- en mobiele/desktop-browsertests plus onafhankelijke fysieke review zijn afzonderlijke poorten.

## Atelier v3.7 — strikt inspectierapportcontract

De lokale drievoudige hercontrole accepteert uitsluitend de bekende velden van het bestaande inspectierapport-schema `palaco.citadel.atelier.inspection/1`. Onbekende of ontbrekende velden worden geweigerd; een zelf toegevoegd permissie-, autorisatie- of commando-veld kan geen geldige DRAFT-uitkomst opleveren. De vier verplichte beperkingen moeten exact aanwezig zijn. Ook moet het lokale controletijdstip een syntactisch en kalendertechnisch geldige canonieke UTC-ISO-tijdstempel zijn. De ontwerptellingen moeten gehele, niet-negatieve waarden binnen hun maximale dimensies zijn (exterieur 96, interieur 240 en notitielengte 6000); bestaande inhoudelijke vergelijking met het portable ontwerp en de SHA-256 blijft verplicht.

Dit is **format- en integriteitsvalidatie**, niet een cryptografische handtekening of onafhankelijke tijdattestatie. Een zelfgeschreven rapport kan ondanks een geldig formaat geen identiteit, herkomst, officiële uitgifte of bevoegdheid bewijzen. De Playwright-acceptatie dekt ingevoegde rechtenvelden, verdwenen waarschuwingen, foutieve datum en negatieve tellingen. De originele ontwerpdata en de live Citadel blijven onaangeroerd. PR #60 blijft DRAFT/HOLD tot de nieuwe CI-/browsercontroles en onafhankelijke visuele en fysieke mobiele beoordeling.

## Atelier v3.8 — verplichte binding van checksum-TXT aan JSON-bestandsnaam

Bij de gecombineerde twee- en drievoudige dossiercontrole moet het SHA-256-referentie-TXT voortaan precies één `Bestand: <naam>.json`-regel hebben. Die naam moet exact overeenkomen met de geselecteerde portable JSON-bestandsnaam (na dezelfde begrensde sanitisatie die ook de export van inspectierapporten gebruikt). Ontbrekende, dubbele en afwijkende naamregels worden geweigerd, óók als de SHA-256-bytes verder overeenkomen. De SHA-256 van het bronbestand, het portable DRAFT/NONE-contract, de rapportvelden en de niet-destructieve verwerking blijven afzonderlijke verplichte controles.

Dit voorkomt verwisseling tussen bestanden bij normaal lokaal archiefbeheer; het vormt nadrukkelijk **geen onafhankelijke authenticatie of bewijs van herkomst**. Een gebruiker kan een zelfgeschreven TXT en JSON immers gezamenlijk aanpassen. Bestanden die na export hernoemd zijn, moeten opnieuw gecontroleerd worden met een bij die bestandsnaam passend controlebewijs. Playwright test bij twee- en drievoudige inspectie zowel een onjuiste naam als ontbrekende of dubbele naamregels. PR #60 blijft DRAFT/HOLD: onafhankelijke fysieke/mobiele UX-review en nieuwe CI-/browseracceptatie blijven voorwaarden.

## Atelier v3.9 — strikt TXT-formaat voor SHA-256-bewijzen

De gecombineerde JSON/TXT-paarcontrole en de drievoudige project/TXT/inspectierapportcontrole gebruiken nu dezelfde afgebakende TXT-parser. Deze accepteert precies één `SHA-256:`-regel (64 hexadecimale tekens) en één `Bestand:`-regel, met uitsluitend de bekende PALACO-header en de bestaande waarschuwingsteksten als optionele extra regels. Andere niet-lege regels, nepvelden zoals `Authority: OWNER` of `Signature: TRUSTED`, afwijkende hoofdletterlabels en schadelijke besturingstekens worden afgewezen. De naam moet blijven overeenkomen met het geselecteerde JSON-bestand. Bestaande door de Regiekamer geëxporteerde controlebewijzen en de bestaande minimale testbewijzen blijven compatibel.

Playwright dekt nieuwe afwijzingen voor ingesloten autoriteitsclaims, zogenaamde handtekeningen, afwijkend gespelde checksumlabels, vervalste goedkeuringsteksten en NUL-besturingstekens. De twee- en drievoudige controle blijven read-only, met de overige DRAFT/NONE-contracten en SHA-256-vergelijkingen ongewijzigd. De parser biedt geen ondertekening, geen onafhankelijke oorsprongsattestatie en geen geverifieerde bevoegdheid. DRAFT/HOLD blijft gelden tot CI, mobiele/desktop-browseracceptatie en een onafhankelijke visuele en fysieke test.

## Atelier v4.0 — losse SHA-256-referentie-import onder hetzelfde strikte contract

Bij het **los inlezen van een SHA-256-TXT-referentie** via de Regiekamer geldt voortaan dezelfde afgebakende parser als bij de twee- en drievoudige controle. Het bestand moet één geldige SHA-256-regel en precies één projectbestandsnaam bevatten, mag uitsluitend de bekende PALACO-notities gebruiken en kan geen verborgen bevoegdheidsclaims, handtekeningen, extra naamregels of ongeldige besturingstekens bevatten. De importer registreert de bestandsnaam uitsluitend tijdelijk in de geopende pagina, samen met de SHA-256.

Na het inlezen moet een volgende losse JSON-projectinspectie niet alleen met de hash overeenkomen maar ook precies de bij de referentie vastgelegde JSON-bestandsnaam hebben. Bij elke handmatige wijziging van het hashveld wordt deze bestandsnaamkoppeling weer gewist; oude inspectie-uitkomsten en exportknoppen blijven ongeldig. Bij geweigerde TXT-invoer worden referentie en bestandsnaam gewist. Er worden geen gegevens geïmporteerd naar het creatieve ontwerp, geen servers aangeroepen en geen officiële bevoegdheden uitgegeven.

De Playwright-suite controleert geldige roundtrips, onjuist benoemde JSON-bestanden, misleidende Authority- en Signature-regels, dubbele en ontbrekende naamregels en NUL-besturingstekens. Het strikte contract beperkt verwisselingen en misleidende TXT-inhoud, maar biedt geen cryptografische herkomstgarantie. Releasepoort: DRAFT/HOLD, met onafhankelijke mobiele/visuele review en volledig groene nieuwe CI-tests vereist.

## Atelier v4.1 — robuuste TXT-parser tegen duplicatie en Unicode-misleiding

De gedeelde parser voor losse TXT-import, JSON/TXT-paarcontrole en drievoudige dossiercontrole heeft extra fail-closed grenzen. Naast de bestaande vaste SHA-256- en Bestand-regels worden dubbele bekende toelichtingsregels geweigerd. Per TXT zijn maximaal acht niet-lege regels en maximaal 256 tekens per regel toegestaan (naast de bestaande grens van 4 KB voor ingelezen TXT). Unicode-richtingstekens uit de ranges U+202A–U+202E en U+2066–U+2069 worden geweigerd, ook in de naam van een geselecteerd JSON-project, zodat tekst visueel niet in omgekeerde richting kan worden gepresenteerd terwijl de onderliggende bytes verschillen.

Bestaande door de Regiekamer gegenereerde TXT-referenties blijven compatibel. Playwright-regressies simuleren dubbele vaste toelichtingen, te lange regels en Unicode-bidirectionele markeringen; statische contractchecks zijn bijgewerkt. Deze lokale validatie bewijst nog steeds geen identiteit, digitale ondertekening, vertrouwde herkomst of officiële PALACO-bevoegdheid. De branch blijft DRAFT/HOLD; vóór vrijgave blijven nieuwe CI/browseracceptatie en onafhankelijke visuele/fysieke mobiele tests vereist.

## Atelier v4.2 — race-veilige bestandselecties en controleopruiming

De Regiekamer beschermt de export-hercontrole nu niet alleen tegen nieuwe projectexports, maar ook tegen twee snel opeenvolgende **bestandsselecties binnen dezelfde export**. Een aparte selectie-revisie wordt bij iedere nieuwe selectie verhoogd en bij elke volgende export ongeldig verklaard. Wanneer een oudere `File.arrayBuffer()` of `crypto.subtle.digest()` later voltooit, mag die oudere operatie geen nieuwe SHA-256-uitslag overschrijven.

Daarnaast geldt bij de vijf asynchrone bestandscontroles (projectexporthercontrole, JSON/TXT-paarcontrole, drievoudige rapportcontrole, losse TXT-import en losse JSON-inspectie): alleen de nog actuele revisie mag zijn `input[type=file]` bij afronding terugzetten. Een achterhaalde taak mag niet het bestandsveld van een nieuwere selectie wissen. Browserregressies simuleren twee vertraagde bestandslezingen binnen dezelfde export en twee snel opeenvolgende TXT-referenties; de oude bewerking wordt eerst vrijgegeven terwijl de nieuwe selectie nog actief is. De nieuwe uitslag en naamkoppeling blijven leidend. Dit is een UI-integriteitsmaatregel zonder wijzigingen aan creatieve ontwerpdata, officiële registraties of autorisaties. DRAFT/HOLD blijft van kracht tot alle CI-/mobiele/desktop-browserchecks en onafhankelijke fysieke en visuele acceptatie zijn voltooid.

## Atelier v4.3 — tijdelijke controlestatus veilig wissen

De Regiekamer heeft een expliciete knop **Wis tijdelijke controlestatus**. Die trekt gelijktijdig alle nog lopende asynchrone controles in (export en de bijbehorende hercontrole, JSON/TXT-paarcontrole, drievoudige inspectie, losse SHA-256-TXT-import en losse JSON-verificatie). Alle tijdelijke checksums, geladen bestandsnaamkoppelingen, optionele handmatig ingeladen SHA-256-referenties, inspectieresultaten en downloadbevoegde *DRAFT*-rapportstatussen worden gereset. De exportknoppen voor referentiebewijs en inspectierapport worden uitgeschakeld. Statusregels tonen dat voor een nieuwe controle opnieuw bestanden moeten worden geselecteerd; een nieuwe JSON-export kan daarna de normale lokale integriteitsstappen weer starten.

De reset verandert **geen** opgeslagen creatieve kaarten, interieurs, notities, herstelkopieën of andere projectbestanden, en verstuurt niets naar servers. Nieuwe Playwright-acceptatie dekt een reset tijdens vertraagde bestandslezingen, het uitblijven van oude verificatie-uitkomsten, het blokkeren van een eerder gereed controlebewijs en een frisse export ná de reset. De reset is een lokale tijdelijke sessiehandeling, geen officiële intrekking van reeds gedownloade bestanden of geauthenticeerde rechten. Releasepoort blijft DRAFT/HOLD tot de huidige CI/browsertests en onafhankelijke fysieke en visuele mobiele acceptatie volledig zijn afgerond.

## Atelier v4.4 — toegankelijke Regiekamer op mobiel en met toetsenbord

De vijf bestandsinvoervelden voor exporthercontrole, JSON/TXT-paarcontrole, drievoudige dossiercontrole, losse JSON-inspectie en losse TXT-referentie-import zijn nu semantisch verbonden met hun status- en instructietekst via `aria-describedby`. Alle bestandsvelden en actieknoppen hebben minimaal 44 px aanraakhoogte. Toetsenbordfocus is zichtbaar bij invoervelden. Lange SHA-256-waarden en statusmeldingen breken af zodat zij op smalle schermen niet onnodig horizontaal uitlopen.

De knop **Wis tijdelijke controlestatus** verwijst nu expliciet naar zijn niet-destructieve uitleg. Na een reset verplaatst de toetsenbordfocus naar de live statusmelding, zodat assistieve technologie de bevestiging kan vinden. Deze focusverplaatsing laat de status- en DRAFT-beveiligingsgrenzen ongemoeid; creatieve ontwerpen en lokale herstelkopieën blijven opgeslagen. Playwright controleert deze affordances in de bestaande mobiele en desktop-Chromiumconfiguraties; onafhankelijke toegankelijkheids- en fysieke mobiele acceptatie blijft nodig vóór vrijgave. PR #60 blijft DRAFT/HOLD.

## Atelier v4.5 — uniforme validatie van bestandsnamen

De Regiekamer gebruikt nu een gedeelde `safeProjectFilename`-validator in de losse project-JSON-inspectie, de JSON/TXT-paarcontrole, de drievoudige dossierverificatie en bij het los inlezen van het SHA-256-TXT-controlebewijs. Geselecteerde creatieve projectbestanden moeten een niet-lege, correct begrensde `.json`-naam hebben (maximaal 120 tekens) zonder directoryscheidingstekens, besturingstekens, Unicode-richtingstekens of misleidende randspaties. De naam uit een TXT-bewijs moet aan dezelfde eisen voldoen. Daardoor kan het TXT niet onder een ogenschijnlijk andere naam een geldig dossier aanvoeren. De SHA-256 wordt nog steeds over originele JSON-bytes berekend, en de DRAFT/authority NONE-contracten blijven verplicht.

Dit verandert alleen de plaatselijke bestandsnaamvalidatie en niet het creatieve project, de bestaande opslag, de herstelkopieën of eerder gedownloade bestanden. Browserregressies toetsen negatieve namen en de geldige doorloop. SHA-256 plus een valide naam bewijst geen auteurschap, vertrouwde herkomst of bevoegdheid. Alle releasepoorten blijven DRAFT/HOLD, inclusief een onafhankelijke mobiele/visuele beoordeling.

## Atelier v4.6 — veilige annulering van bestandskeuze

De Regiekamer reageert nu op de browsergebeurtenis `cancel` bij alle vijf bestandsinvoervelden. Een geannuleerde JSON-inspectie maakt de vorige controle-uitkomst en de mogelijkheid tot export van een nieuw SHA-256-bewijs ongeldig; een geannuleerde losse TXT-import wist de tijdelijk ingelezen SHA-256-referentie en de bestandsnaamkoppeling. Annuleren van een JSON/TXT-paarcontrole maakt een eerder beschikbaar DRAFT-inspectierapport opnieuw onbeschikbaar. Bij de drievoudige dossiercontrole wordt de status expliciet op geannuleerd gezet. Bij de hercontrole van een eerdere projectexport vervalt alleen de actuele hercontrole-uitkomst: de eerder berekende exporthash en de mogelijkheid om het oorspronkelijke exportbewijs te downloaden blijven behouden.

Alle annuleringshandelingen verhogen relevante revisienummers zodat nog actieve bestandslezingen en SHA-256-berekeningen geen geldige uitslag kunnen terugplaatsen. Ook een `change`-gebeurtenis zonder bestand wordt voor de drie enkelvoudige bestandsvelden als annulering behandeld. Playwright test de ingreep na geldige inspecties en het behoud van de bestaande export. Dit is lokale UI-integriteit, geen intrekking van eerder gedownloade documenten of een officiële identiteitsbeslissing. De live Citadel blijft ongewijzigd en PR #60 blijft DRAFT/HOLD.

## Atelier v4.7 — uniforme controle van TXT-bestandsnamen

Bij alle drie routes die een SHA-256-TXT-bewijs inlezen (losse referentie-import, JSON/TXT-paarcontrole en drievoudige dossiercontrole) wordt nu ook de **naam van het TXT-bestand zelf** via een gedeelde validator gecontroleerd. Alleen niet-lege `.txt`-bestandsnamen van maximaal 120 tekens zonder directorytekens, verborgen besturingstekens, bidirectionele Unicode-stuurtekens of misleidende randspaties zijn toegestaan. De bestaande `safeProjectFilename`-controle op de creatieve JSON-bestandsnaam blijft afzonderlijk verplicht. Bij het maken van het DRAFT-inspectierapport wordt de gevalideerde TXT-naam rechtstreeks vastgelegd; bij drievoudige hercontrole moet deze naam overeenkomen met het rapportveld `receiptFile`.

De browsersuite bevat nieuwe negatieve proeven met misleidende Unicode-richting, padtekens, overmatige naamlengte en een onjuiste extensie, evenals een positieve paar- en drievoudige hercontrole. Dit beperkt verwisseling en misleidende lokale dossiermetadata; het levert **geen** cryptografische handtekening, geauthenticeerde herkomst of officiële bevoegdheid. Alle controleprocessen blijven lokaal en read-only; creatieve ontwerpen blijven ongewijzigd. PR #60 blijft DRAFT/HOLD tot de nieuwe CI, desktop/mobile browseracceptatie en onafhankelijke fysieke/visuele review zijn voltooid.

## Atelier v4.8 — bestandsnaamcontrole óók voor inspectierapport-JSON

De drievoudige verificatie van creatief project, SHA-256-TXT en DRAFT-inspectierapport controleert voortaan de **bestandsnamen van beide JSON-bestanden** meteen na het vaststellen van de bestandstypen en vóór het lezen van de inhoud. De gedeelde `safeProjectFilename`-validator weigert misleidende Unicode-richtingstekens, map- en padtekens, voor- of achterliggende spaties en overmatige lengte. Dit geldt nu net zo goed voor de bestandsnaam van het inspectierapport als voor de creatieve project-JSON. De eerdere validatie van de TXT-bestandsnaam, de exacte koppeling van TXT aan het creatieve JSON-bestand, de rapportvelden, het DRAFT/NONE-contract en de cryptografische SHA-256-vergelijking blijven actief.

De regressietests herhalen een geldige drievoudige controle na pogingen met een misleidend genoemd rapport. De ingreep is een lokale bestandsnaam-/integriteitscontrole en geen officiële attestatie of digitale handtekening. PR #60 blijft DRAFT/HOLD; productiepublicatie en merge zijn uitgesloten tot onafhankelijke visuele/fysieke mobiele review en volledige automatische acceptatie.

## Atelier v4.9 — eenduidige volgorde van SHA-256-TXT-regels

De gedeelde TXT-parser accepteert voortaan uitsluitend de **canonieke regelvolgorde** voor lokale SHA-256-bewijzen: optioneel precies één van de twee historische PALACO-headers, dan `SHA-256: <64 hextekens>`, gevolgd door `Bestand: <projectnaam.json>`, en daarna maximaal één exemplaar van elk van de twee bestaande toelichtingen in hun vaste volgorde. Een minimaal TXT-bewijs met alleen de SHA-256- en Bestand-regel blijft toegestaan. Bestanden met omgekeerde labels, verwisselde toelichtingen of meerdere verschillende PALACO-headers worden geweigerd, ook wanneer de SHA-256 en JSON-bytes verder overeenkomen.

Alle drie de routes (los inladen, JSON/TXT-paarcontrole en drievoudige rapportcontrole) gebruiken dezelfde regels. Browserregressies tonen de afwijzingen en de blijvend geldige roundtrip zonder mutatie van ontwerpen. De controle bewijst byte-integriteit tegen een opgegeven referentie, niet de identiteit of bevoegdheid van de maker. DRAFT/HOLD, zonder merge of publicatie, blijft gelden tot CI en onafhankelijke fysieke en visuele mobiele acceptatie zijn afgerond.

## Atelier v5.0 — ondubbelzinnige bestandsidentiteit voor drievoudige dossiers

De Regiekamer weigert bij de drievoudige lokale dossiercontrole twee JSON-bestanden met **exact dezelfde bestandsnaam**. De creatieve project-JSON en het DRAFT-inspectierapport moeten afzonderlijk herkenbare namen hebben, ook wanneer beide bestanden inhoudelijk geldig zijn. Deze extra controle vindt vóór het lezen en parsen van de geselecteerde bestanden plaats. Ze vult de bestaande checks aan op veilige JSON/TXT-namen, de koppeling tussen projectnaam en SHA-256-TXT, het beperkte DRAFT-inspectierapportschema, bijpassende aantallen, de verplichte beperkingen en de SHA-256-vergelijking van de oorspronkelijke projectbytes.

De browseracceptatie controleert dat twee verschillende JSON-bestanden met dezelfde naam worden geweigerd en dat een daaropvolgend dossier met twee verschillende namen wel opnieuw geldig kan worden gecontroleerd. Het gaat uitsluitend om lokale consistentie van bestandsselecties; een bestandsnaam biedt geen cryptografisch herkomstbewijs, digitale handtekening of PALACO-autorisatie. De opgeslagen creatieve gegevens blijven ongewijzigd en PR #60 blijft DRAFT/HOLD.

## Atelier v5.1 — strikte behandeling van lege TXT-regels

De gedeelde SHA-256-TXT-parser accepteert niet langer stilzwijgend lege regels. Een bewijs mag eindigen met precies één regeleinde (LF of CRLF) of zonder afsluitend regeleinde; **lege regels vóór, tussen of na de verplichte en optionele velden worden geweigerd**. Daarmee zijn de bestaande canonieke regelvolgorde, unieke SHA-256- en Bestand-regel, optionele PALACO-header en optionele vaste toelichtingen ook structureel ondubbelzinnig. Bestaande door de Regiekamer gegenereerde referenties blijven compatibel.

Browserregressies controleren in alle drie de lokale routes (losse TXT-import, JSON/TXT-paarcontrole, drievoudige project-/rapportcontrole) expliciet dat blanco tussenregels, blanco beginregels en extra afsluitende blanco regels worden geweigerd. Geldige LF-/CRLF-bestanden blijven bruikbaar en de opgeslagen creatieve ontwerpen veranderen niet. Dit is een parser-/integriteitsmaatregel, geen bewijs van herkomst, handtekening of bevoegdheid. DRAFT/HOLD; geen merge of publicatie zonder onafhankelijke visuele/fysieke mobiele acceptatie.

## Atelier v5.2 — duidelijk lokaal inspectieresultaat

De Regiekamer toont bij de drievoudige project-/SHA-256-TXT-/rapportcontrole een toegankelijk, read-only **inspectieresultaatpaneel**. Het onderscheidt ondubbelzinnig de toestanden `idle` (geen actuele controle), `pending` (bezig), `match` (bestandsbytes en lokaal DRAFT-rapport komen overeen), `mismatch` (SHA-256 wijkt af) en `rejected` (formaat of voorwaarden ongeldig). Bij MATCH en MISMATCH verschijnen de gecontroleerde project-, TXT- en rapportbestandsnamen en de berekende SHA-256. De tekst vermeldt telkens de grens `DRAFT · AUTHORITY NONE` en dat een lokale overeenkomst geen herkomst, digitale ondertekening of bevoegdheid bevestigt.

Bij annuleren van de bestandskeuze of het wissen van tijdelijke controles wordt het paneel teruggezet op 'geen actuele controle'. De bestaande statusmelding voor assistieve technologie blijft behouden; er zijn geen knoppen voor registratie of autorisatie toegevoegd. Browserregressies toetsen de overgangen MATCH, MISMATCH, GEWEIGERD, annuleren, hercontroleren en reset, zonder wijzigingen aan creatieve opslag. PR #60 blijft DRAFT/HOLD totdat alle CI-/browserchecks én onafhankelijke fysieke mobiele en visuele review zijn voltooid.

## Atelier v5.3 — transparante drievoudige SHA-256-vergelijking

Het resultaatpaneel van de drievoudige lokale dossiercontrole toont bij MATCH en MISMATCH de **drie afzonderlijke SHA-256-waarden**: berekend uit de oorspronkelijke project-JSON-bestandsbytes, opgegeven in de bijbehorende TXT-referentie en vastgelegd in het DRAFT-inspectierapport. De vergelijking maakt daarmee inzichtelijk of een afwijking uit de TXT-referentie of uit het inspectierapport komt. De drie waarden worden uitsluitend als tekst weergegeven, niet in de creatieve lokale opslag geschreven of naar servers verzonden.

Bij een nieuwe controle verdwijnen de oude waarden onmiddellijk; bij ongeldige invoer, annulering of het wissen van de tijdelijke controlestatus blijven de hashvelden verborgen én leeg. De bestaande statusmeldingen, bestandsnaam- en rapportcontracten, DRAFT/authority NONE en het verbod op uitgifte blijven actief. Browserregressies testen de exacte drie hashes, één afwijkend rapportveld en het wissen van verouderde waarden na afwijzing, annulering en reset. De lokale vergelijking bewijst geen herkomst, auteurschap, officiële ondertekening of bevoegdheid. PR #60 blijft DRAFT/HOLD.

## Atelier v5.4 — dubbele top-level JSON-velden blokkeren

De drievoudige lokale verificatie accepteert geen JSON-objecten met **dubbele top-level sleutels**. De gebruikelijke `JSON.parse`-functie bewaart bij een dubbele sleutel stilzwijgend de laatst opgegeven waarde, wat een misleidend rapport met bijvoorbeeld twee verschillende `authority`-, `result`- of `sha256`-velden mogelijk maakt. De Regiekamer parseert de JSON nog steeds conform de JSON-standaard, maar controleert daarnaast iedere top-level propertynaam in de **oorspronkelijke tekst**. Unicode-escapes in sleutels worden daarbij eerst naar hun werkelijke naam gedecodeerd. Een dubbele naam, ook als één exemplaar als `\\u0061uthority` is geschreven, wordt afgewezen.

De extra controle geldt voor beide JSON-bestanden die bij de drievoudige dossiercontrole zijn geselecteerd. Binnenliggende JSON-stringwaarden en geneste objectstructuren worden niet ten onrechte als extra top-level sleutels geteld. Browserregressies controleren de afwijzing van dubbele bevoegdheid-, resultaat- en hashvelden, en dat één geldige geëscapete sleutel nog steeds functioneert. De read-only vergelijking en de creatieve opslag blijven ongewijzigd; SHA-256 over de projectbytes en DRAFT/authority NONE blijven verplicht. Dit is geen officiële attestatie. PR #60 blijft DRAFT/HOLD.

## Atelier v5.5 — afwijkingen per SHA-256-bron aanwijzen

De Regiekamer toont bij de bestaande drievoudige lokale dossiercontrole nu **per bron een expliciet oordeel** naast de SHA-256-waarde: voor zowel de TXT-referentie als het inspectierapport verschijnt `KOMT OVEREEN` of `WIJKT AF`, elk vergeleken met de SHA-256 berekend over de originele bytes van de geselecteerde creatieve JSON. Zo is te zien of de TXT-referentie afwijkt, het DRAFT-inspectierapport afwijkt of beide afwijken. De overeenstemming van beide bronnen met de projectbytes blijft nodig voor het algemene MATCH-resultaat.

Bij een nieuwe selectie, afwijzing, annulering of het wissen van tijdelijke controlestatus worden beide bronverdicts opnieuw leeggemaakt en worden eerdere vergelijkingswaarden verborgen. Browserregressies toetsen beide afzonderlijke afwijkingen, beide tegelijk, een correcte vergelijking en reset zonder mutaties aan creatieve opslag. Deze UI-verduidelijking voegt geen nieuwe bevoegdheid of cryptografische herkomstgarantie toe. PR #60 blijft DRAFT/HOLD; geen merge of publicatie.

## Atelier v5.6 — platformonafhankelijke herkenning van JSON-bestandsnamen

De drievoudige lokale dossiercontrole voorkomt nu ook dat de creatieve project-JSON en het DRAFT-inspectierapport **dezelfde bestandsidentiteit** krijgen door verschillen in hoofdletters of canoniek equivalente Unicode-schrijfwijzen. Voor de controle op onderling onderscheiden bestandsnamen worden beide namen met Unicode NFC genormaliseerd en hoofdletterongevoelig vergeleken. Zo worden bijvoorbeeld `inspection.json` en `INSPECTION.JSON`, of `café.json` en dezelfde naam met een los combining accent, als een botsing behandeld.

De oorspronkelijke bestandsnamen zelf worden **niet aangepast** en de TXT-/rapportkoppelingen blijven exact: er vindt geen stilzwijgende hernoeming of import plaats. Het voorkomt verwarring bij overdracht tussen bijvoorbeeld Windows en andere bestandssystemen. Browserregressies testen hoofdlettervarianten en Unicode-equivalenten én bevestigen dat daarna een geldig dossier nog steeds gecontroleerd kan worden. De DRAFT/authority NONE-grenzen, SHA-256-vergelijkingen en read-only ontwerpgegevens blijven behouden; dit is geen bewijs van auteurschap, ondertekening of herkomst. PR #60 blijft DRAFT/HOLD.

## Atelier v5.7 — bescherming tegen onzichtbare Unicode-tekens in bestandsnamen

De validators voor creatieve project-JSON en SHA-256-TXT-referenties weigeren nu aanvullende **onzichtbare Unicode-opmaaktekens** in lokale bestandsnamen. De uitbreiding omvat onder meer zero-width space/joiner/non-joiner (U+200B–U+200D), direction marks (U+200E/U+200F, U+061C), soft hyphen (U+00AD), word joiner (U+2060), BOM/zero-width no-break space (U+FEFF) en de verwante onzichtbare formatteringscodes in de expliciete validator. Zulke tekens kunnen twee verschillend gecodeerde namen op het scherm identiek laten lijken of verwarring veroorzaken bij overdracht tussen apparaten.

De al bestaande regels voor extensie, lengte, scheidingstekens, randspaties en bidirectionele sturing blijven gelden. De Regiekamer past deze validatie toe bij losse JSON-inspectie, TXT-referentie-import, JSON/TXT-paarcontrole en drievoudige dossiercontrole; ook de naam in de TXT-inhoud wordt gecontroleerd. Bestaande normale Unicode-letters en accenten blijven toegestaan. Browserregressies dekken de nieuwe weigeringsgevallen in de bestaande verificatieroutes; er worden geen bestanden hernoemd, geïmporteerd of geüpload. DRAFT/authority NONE en PR #60 DRAFT/HOLD blijven gehandhaafd.

## Atelier v5.8 — Windows-bestandsnamen veilig overdragen

De gedeelde validators voor JSON-projecten en TXT-bewijzen weigeren nu ook **gereserveerde Windows-apparaatnamen**, waaronder `CON.json`, `PRN.json`, `AUX.json`, `NUL.txt`, `COM1.json`–`COM9.json` en `LPT1.txt`–`LPT9.txt`, inclusief bekende Unicode-superscriptcijfers in COM/LPT-namen. Windows behandelt zulke namen ook met een extensie als apparaatnamen, waardoor archiveren of uitwisselen kan mislukken. Ook tekens die Windows in bestandsnamen verbiedt (`< > : " | ? *`) worden expliciet geweigerd.

Deze validatie werkt voor losse JSON-inspectie, TXT-import, JSON/TXT-paarcontrole en de drievoudige project-/referentie-/rapportcontrole. De normale geldige Unicode-namen, SHA-256-bytecontroles en de precieze koppeling tussen project en referentie blijven behouden. Er worden geen bestaande bestanden hernoemd of aangepast. Browserregressies controleren gereserveerde namen en verboden tekens voor de verschillende routes, gevolgd door geldige hercontroles. PR #60 blijft DRAFT/HOLD zonder autorisatie, EDTR-uitgifte, merge of publicatie.

## Atelier v5.9 — ondubbelzinnige bestandsextensies

De gezamenlijke bestandsnaamvalidators van de Regiekamer weigeren nu namen met een **spatie of een extra punt direct vóór de verplichte bestandsextensie**. Voorbeelden zijn `naam .json`, `naam..json`, `receipt .txt` en `NUL .txt`. Deze namen zijn bij kopiëren, hernoemen of synchroniseren tussen Windows en andere bestandssystemen gemakkelijk te verwarren met anders genoemde bestanden. Gewone namen als `ontwerp.json`, `versie.1.json` en `referentie.txt` blijven bruikbaar.

Deze aanvulling geldt voor alle bestaande lokale controles die `safeProjectFilename` of `safeReceiptFilename` gebruiken, inclusief de naam in een TXT-controlebewijs en de drievoudige dossiercontrole. Bestaande SHA-256-bytevalidatie, inspectierapportcontracten en DRAFT/authority NONE blijven ongewijzigd. Negatieve browserregressies testen de nieuwe varianten, gevolgd door de bestaande geldige acceptatie. Er vindt geen bestandshernoeming, import, autorisatie of serverupload plaats. PR #60 blijft DRAFT/HOLD.

## Atelier v6.0 — dubbele sleutels in alle JSON-objecten weigeren

De drievoudige lokale dossierverificatie controleert nu op **dubbele JSON-objectvelden op iedere nestingdiepte** in zowel het creatieve project als het DRAFT-inspectierapport. Waar v5.4 alleen dubbele top-level sleutels afwees, houdt v6.0 voor ieder object een afzonderlijke verzameling sleutelnamen bij, ook in objecten binnen arrays. Unicode-geëscapete namen worden vóór vergelijking gedecodeerd. Zo worden bijvoorbeeld twee `authority`-sleutels binnen één genest object geweigerd, zelfs wanneer één ervan als `\\u0061uthority` is geschreven. Een gelijknamige sleutel in twee *verschillende* objecten is toegestaan.

De bestaande `JSON.parse`-syntaxiscontrole, oorspronkelijke projectbyte-SHA-256, TXT-grammatica, rapportbinding, read-only resultaatweergave en DRAFT/authority NONE blijven intact. Browserregressies controleren duplicaten in direct geneste objecten, objecten binnen arrays, dieper geneste objecten, Unicode-aliassen én een aangepast creatief project. Geldige dossiers blijven te verifiëren zonder import of wijziging aan de lokale opslag. Dit is een controle op eenduidige JSON-structuur, geen bewijs van herkomst of bevoegdheid. PR #60 blijft DRAFT/HOLD.

## Atelier v6.1 — uniforme JSON-structuurcontrole bij alle bestandsinvoer

De in v6.0 ingevoerde controle op dubbele JSON-objectsleutels op **elke nestingdiepte** werkt nu ook bij alle andere routes die externe projectbestanden lezen: losse projectinspectie, JSON/TXT-paarcontrole, hercontrole van een gedownloade export en het daadwerkelijk terugzetten van een lokaal projectbestand. Voorheen gebruikten die routes uitsluitend de gewone projectschemaparser, die door de standaardwerking van `JSON.parse` eerder voorkomende dubbele veldwaarden kan overschrijven. Nu wordt de oorspronkelijke JSON-tekst eerst met de gezamenlijke duplicaatcontrole beoordeeld, vóór validatie van het projectschema of eventuele terugzetactie.

Een onbetrouwbaar JSON-bestand met bijvoorbeeld een verborgen tweede `authority` in een genest array-object wordt expliciet geweigerd. De bestaande byte-exacte SHA-256-verificatie, read-only controles, herstelbevestiging en DRAFT/authority NONE-contracten blijven gelden. Browserregressies toetsen de afwijzing in alle vier de aanvullende routes, bevestigen dat een ongeldig herstel de creatieve opslag niet wijzigt en dat normale geldige ontwerpen nog steeds kunnen worden geïnspecteerd. PR #60 blijft DRAFT/HOLD, zonder merge of publieke uitrol.

## Atelier v6.2 — begrensde JSON-nesting vóór verwerking

De gedeelde strikte bestandsparser van de Regiekamer weigert nu JSON-projecten en inspectiebestanden met een **nestingdiepte boven 64 object-/arrayniveaus**. Deze limiet wordt tijdens een structurele, stringbewuste scan toegepast **voordat de gewone `JSON.parse` draait**. Haakjes binnen JSON-stringwaarden tellen dus niet als structurele niveaus. Hiermee wordt overmatig diep geneste invoer ook bij kleine bestanden vroegtijdig afgebroken; de reeds aanwezige controles op dubbele sleutels op iedere objectdiepte blijven actief.

Dezelfde bescherming geldt voor losse projectinspectie, JSON/TXT-paarcontrole, exporthercontrole, lokale projectherstel/import en drievoudige dossiercontrole. Browserregressies bewijzen dat te diep geneste dossiers worden geweigerd, de creatieve opslag na geweigerd herstel ongewijzigd blijft en normale geldige projecten nog steeds worden aanvaard. De bestaande 150-KB-grens, SHA-256-bytevergelijking, DRAFT/authority NONE en alle andere veiligheidsgrenzen blijven behouden. Geen EDTR, autorisatie, merge of productiepublicatie; PR #60 blijft DRAFT/HOLD.

## Atelier v6.3 — maximaal 4.096 JSON-objectvelden per dossier

De gezamenlijke strikte parser van de Regiekamer telt nu alle **objectsleutels in het volledige geselecteerde JSON-bestand**, inclusief velden binnen geneste objecten en objecten in arrays. Boven **4.096 velden** wordt het bestand afgewezen vóór `JSON.parse`, om buitensporige verwerking door objecten met zeer veel kleine velden te voorkomen. De limiet staat los van de bestaande maximale nestingdiepte van 64 en de bestandslimiet van 150 KB. Strings en array-elementen die geen objectvelden zijn tellen niet als objectsleutel. Dubbele keys blijven afzonderlijk verboden.

De bescherming geldt voor lokale projectinspectie, JSON/TXT-paarverificatie, hercontrole van een export, herstel/import en drievoudige dossiercontrole. Een grensoverschrijding geeft een expliciete afwijzingsmelding zonder wijziging van creatieve gegevens; een normaal geldige DRAFT blijft compatibel. De nieuwe browserregressie behandelt al deze invoerpaden en controleert opnieuw de creatieve opslag. PR #60 blijft DRAFT/HOLD; geen autorisatie, digitale handtekening, EDTR of live-publicatie.

## Atelier v6.4 — maximaal 256 tekens per JSON-objectveldnaam

De gezamenlijke, stringbewuste JSON-invoercontrole weigert nu objectsleutels met **meer dan 256 tekens**. De limiet geldt op iedere objectdiepte, inclusief objecten in arrays. Een veldnaam wordt eerst als JSON-string gedecodeerd, zodat Unicode-escapes niet buiten de lengtecontrole vallen; het gaat om JavaScript-stringlengte (UTF-16-code-eenheden). Normale, langere **veldwaarden** blijven onderhevig aan het bestaande projectschema, maar vallen niet onder deze specifieke sleutellimiet.

Deze extra resourcegrens geldt uniform bij losse JSON-inspectie, JSON/TXT-paarcontrole, exporthercontrole, projectherstel/import en drievoudige dossiercontrole. Regressietests toetsen afwijzing van 257 tekens, een Unicode-escaped variant, een grensgeval met 256 tekens en ongewijzigde lokale opslag. De reeds geldende 4.096 objectvelden, nestingdiepte 64, bestandsgrootte 150 KB, dubbele-veldencontrole, SHA-256 en DRAFT/authority NONE blijven behouden. PR #60 blijft DRAFT/HOLD; geen merge, uitgifte of productiepublicatie.

## Atelier v6.5 — strikte UTF-8-bestandsdecodering bij lokaal projectherstel

De lokale import-/herstelroute voor creatieve JSON-projecten gebruikt nu dezelfde **strikte UTF-8-decodering** als de bestaande inspectie- en verificatieroutes. In plaats van `File.text()`, dat ongeldige UTF-8-bytepatronen stilzwijgend kan vervangen door U+FFFD, worden de originele bestandsbytes gelezen en met `TextDecoder('utf-8', {fatal:true})` gedecodeerd. Ongeldige bytes veroorzaken de expliciete foutmelding `Projectbestand bevat ongeldige UTF-8-bytes`, vóór JSON-structuurvalidatie, ontwerpvergelijking, bevestigingsdialoog of herstel.

De browserregressie controleert meerdere soorten ongeldige bytevolgorden en bevestigt dat **geen herstelbevestiging verschijnt en de lokale creatieve opslag ongewijzigd blijft**. Een geldige UTF-8-import met Nederlandse accenten en emoji blijft leesbaar en toont zoals voorheen eerst een bevestiging; de regressie annuleert die bevestiging zonder opslagwijzigingen. De overige grenzen voor JSON, SHA-256, DRAFT/authority NONE en offline-first blijven van kracht. PR #60 blijft DRAFT/HOLD; geen merge, uitgifte of live-publicatie.

## Atelier v6.6 — verouderde asynchrone projectimport veilig afbreken

De lokale `bundleImport`-route heeft nu een eigen **revisie-/annuleringscontrole**. Wanneer een bestand nog wordt gelezen en de gebruiker ondertussen een ander bestand kiest, de bestandsselectie annuleert of de tijdelijke controles wist, wordt het oudere leesresultaat genegeerd zodra de asynchrone bestandslezing is afgerond. Daardoor kan een verouderde import geen latere statusmelding overschrijven, geen onverwachte herstelbevestiging openen en geen eerder opgeslagen creatieve ontwerpen vervangen.

Elke nieuwe selectie verhoogt de revisie. Zowel `cancel` als het wissen van tijdelijke controles trekken lopende imports in, wissen de file-input en geven een heldere status terug. De `catch`- en `finally`-afhandeling van verouderde importverzoeken mogen niet alsnog de nieuwe gebruikersinterface aanpassen. Een Playwright-regressie simuleert bewust vertraagde `File.arrayBuffer()`-aanroepen en controleert vervanging, annulering en reset; de lokale creatieve opslag blijft gelijk. Bestaande strikte UTF-8- en JSON-validaties, het herstelbevestigingsvenster en DRAFT/authority NONE blijven behouden. PR #60 blijft DRAFT/HOLD; geen merge of productiepublicatie.

## Atelier v6.7 — lopende import onderbreken bij tabbladwijzigingen

De Regiekamer trekt nu een **lopende asynchrone projectimport** expliciet in wanneer een ander browsertabblad tijdens het lezen van een bestand lokale Atelier-ontwerpgegevens of de opgeslagen ontwerpnotitie wijzigt (inclusief een volledige `localStorage.clear()`). De `storage`-eventhandler verhoogt de importrevisie, wist de bestandselectie en meldt dat het projectbestand opnieuw moet worden gekozen. Zodra de oudere `arrayBuffer()`-lezing afrondt, wordt het resultaat genegeerd. Er verschijnt geen herstelbevestiging voor een achterhaalde invoer, en de actuele opslag blijft intact.

De vernieuwing vult v6.6 aan: herselectie, handmatige annulering en het wissen van controles blijven eveneens lopende imports intrekken. Een tweedelige Playwright-tabbladsimulatie controleert dat een in een ander tabblad opgeslagen ontwerpnotitie zichtbaar blijft, terwijl een vertraagde import wordt afgewezen. De bestaande strikte UTF-8- en JSON-validatie, recovery-snapshot-controles, DRAFT/authority NONE en offline-first verwerking blijven ongewijzigd. PR #60 blijft DRAFT/HOLD, zonder merge of productiepublicatie.

## Atelier v6.8 — onopgeslagen notitiebewerking onderbreekt lopende import

Wanneer een gebruiker in dezelfde Regiekamer tijdens een vertraagde projectbestandslezing de ontwerpnotitie bewerkt, wordt de lopende import meteen ongeldig verklaard. De revisie wordt verhoogd en de bestandskeuze gewist. Een later binnenkomend bestandsresultaat mag geen herstelbevestiging openen, de nieuwe onopgeslagen tekst overschrijven of bestaande lokale ontwerpen aanpassen. De zichtbare status vraagt om het projectbestand opnieuw te kiezen.

Een Playwright-browserregressie gebruikt een bewust vertraagde `File.arrayBuffer()`, wijzigt de notitie vóór voltooiing en controleert de ontbrekende bevestigingsdialoog, de intacte tekst en ongewijzigde opslag. De bescherming sluit aan op v6.6 (annulering) en v6.7 (andere tabbladen). PR #60 blijft DRAFT/HOLD; geen EDTR, autorisatie, merge of live-publicatie.

## Atelier v6.9 — uniforme bestandsnaamcontrole bij projectherstel

De herstel-/importfunctie controleert nu vóór het lezen van de bytes de projectbestandsnaam via dezelfde `safeProjectFilename`-validator die al bij de onafhankelijke DRAFT-projectverificatie wordt gebruikt. Daardoor worden onjuiste extensies, Windows-apparaatnamen, dubbele punten direct voor `.json`, verborgen opmaaktekens en andere misleidende of ongeldige namen afgewezen zonder herstelbevestiging of schrijfactie. Normale `.json`-projectnamen blijven bruikbaar.

Een nieuwe Playwright-regressie test meerdere onveilige bestandsnamen, daarna een geldige bestandsnaam, en controleert dat afgewezen bestanden geen bevestiging openen en opgeslagen creatieve ontwerpen intact blijven. De bestaande bescherming tegen vertraagde imports (v6.6–v6.8) en de strikte UTF-8-/JSON-controles blijven behouden. PR #60 blijft DRAFT/HOLD, zonder merge, EDTR, autorisatie of live-publicatie.

## Regiekamer v6.10 — strikte herstelkopie-tijdstempels (2026-11-22)

Het lokale herstelrecord vereist nu een volledig, daadwerkelijk bestaande UTC-tijdstempel in canonieke `YYYY-MM-DDTHH:mm:ss.sssZ`-vorm. Onmogelijke kalenderdatums, onvolledige datums, tijdzone-offsets en achtervoegsels worden vóór het terugzetten geweigerd. Dit verandert geen geldige, door `toISOString()` gemaakte herstelkopieën en maakt geen claim op een vertrouwde klok of cryptografisch bewijs. Een gerichte Node-regressietest dekt geldige en ongeldige voorbeelden. **DRAFT / HOLD / DENY**; CI, onafhankelijke review en mobiele browseracceptatie blijven vereist.

## Regiekamer v6.11 — herstelpunt-conflictcontrole (2026-11-22)

Bij `undoLastImport` wordt het rauwe herstelrecord vastgelegd en vóór de volgende schrijffase opnieuw gecontroleerd. Als een ander tabblad het herstelrecord tijdens selectie of voorbereiding wijzigt, wordt het terugzetten afgebroken zonder een verouderd herstelpunt te gebruiken. Twee Node-regressies simuleren vervanging op beide momenten. Het bestaande importpad zonder undo gebruikt dezelfde interface zonder extra verplicht argument. **Beperking:** `localStorage` biedt geen atomair compare-and-swap: een wijziging na de laatste controle blijft mogelijk. Een backend-transactie en onafhankelijke review zijn nodig voor sterkere garanties. Status DRAFT/HOLD/DENY; geen merge of live-publicatie.

## Regiekamer v6.12 — import bewaakt het geselecteerde herstelpunt (2026-11-22)

Tijdens de importpreview wordt naast de drie creatieve opslagwaarden ook de ruwe herstelkopie vastgelegd. Na expliciete gebruikersbevestiging geeft de Regiekamer deze verwachte herstelkopie door aan `restoreWithRecovery`. De bestaande controles in de bundelmodule weigeren een import wanneer een ander tabblad of een gelijktijdige handeling de herstelkopie tussentijds veranderde, en controleren opnieuw vóór het schrijven van de nieuwe herstelkopie. Zo wordt een gewijzigd herstelpunt niet onopgemerkt overschreven. De browserregressie simuleert een wijziging tijdens de bevestiging en controleert de foutmelding, intacte creatieve opslag en behoud van de gewijzigde herstelkopie.

Deze bescherming is een optimistic-concurrency-check, geen atomaire transactie: `localStorage` heeft geen compare-and-swap. PR #60 blijft DRAFT / HOLD / DENY; geen EDTR, merge of live-publicatie.

## Regiekamer v6.12 — herstelkopie beschermen tijdens foutafhandeling (2026-11-22)

Na het schrijven van een lokale DRAFT-herstelkopie controleert de import of die waarde nog aanwezig is voordat de ontwerpen worden aangepast. Als een ander tabblad de kopie direct heeft vervangen, stopt de import voordat de ontwerpbronnen worden geschreven. Bij een fout tijdens het herstel wordt een herstelkopie alleen teruggedraaid indien de bewaarde waarde nog exact overeenkomt met de door de import geschreven kopie. Een herstelkopie van een ander tabblad wordt niet overschreven. Twee regressies testen deze situaties.

**Grenzen:** localStorage biedt geen atomair compare-and-swap of transactionele isolatie. Gelijktijdige updates tussen controles zijn mogelijk. Bij gedeeltelijke opslagfouten is handmatige controle nodig. Geen productie-, rechten- of bewijsclaim. **DRAFT / HOLD / DENY**; Node- en browser-CI en onafhankelijke review blijven vereist.

## Regiekamer v6.13 — conflictbewuste rollback van ontwerpbronnen (2026-11-22)

De lokale import noteert welk ontwerpveld een schrijfpoging heeft ondergaan. Bij een fout behandelt de rollback uitsluitend de reeds geprobeerde velden in omgekeerde volgorde. Als de actuele waarde nog gelijk is aan de door deze import bedoelde waarde, kan de oorspronkelijke waarde worden hersteld. Is de actuele waarde inmiddels anders dan zowel de oude als de eigen nieuwe waarde, dan blijft die nieuwere waarde onaangeroerd en meldt de procedure expliciet een conflict. Nog niet aangeraakte ontwerpvelden worden nooit meer preventief herschreven. De bestaande regressie voor een onveranderde eerste schrijffout is bijgewerkt en twee cases testen gelijktijdige updates en overslaan van onaangeraakte sleutels.

**Begrenzing:** localStorage ondersteunt geen atomair compare-and-swap. Ook na een controle blijft een race mogelijk; dit is best-effort rollback en geen database-transactie. De branch blijft **DRAFT / HOLD / DENY**; CI en onafhankelijke browser-/veiligheidsreview zijn vereist vóór merge of publicatie.

## Regiekamer v6.14 — herstelvoorstel gebonden aan vooraf bekeken herstelkopie (2026-11-22)

Bij de knop **Herstel vorig lokaal ontwerp** legt de Regiekamer nu vóór de verschilpreview de ruwe herstelkopie vast. Na expliciete bevestiging wordt deze exacte waarde meegegeven aan `undoLastImport`. Als het herstelpunt tijdens de dialoog verandert, wordt de handeling afgewezen voordat er creatieve gegevens worden teruggezet. Dit voorkomt dat het systeem ongemerkt een ander herstelpunt gebruikt dan de gebruiker heeft bekeken. Het bestaande conflictmechanisme in `restoreWithRecovery` blijft daarnaast actief.

De statische contracttest borgt de nieuwe parameter, terwijl een browserregressie het herstelpunt tijdens de bevestiging vervangt en controleert dat de creatieve opslag ongewijzigd blijft. Beperking: lokale browseropslag biedt geen atomaire transacties; dit levert geen volledige concurrentiegarantie. PR #60 blijft DRAFT/HOLD/DENY; geen merge, EDTR of live-publicatie.

## Regiekamer v6.14 — verificatie na herstel (2026-11-22)

De `restore`-functie leest na de schrijfpogingen de drie Atelier-opslagsleutels opnieuw en vergelijkt de ruwe opslagwaarden met de exacte bedoelde waarden, inclusief expliciet ontbrekende ontwerpen. Een stil genegeerde schrijfactie of tussentijdse wijziging wordt niet als geslaagde import gerapporteerd. Bij afwijkingen gaat de bestaande conflictbewuste best-effort rollback in werking: een door een ander tabblad gewijzigde waarde wordt niet bewust overschreven. Drie nieuwe Node-regressies controleren stil schrijfverlies, afwijking tijdens teruglezen en succesvolle opslag.

**Grenzen:** browser-localStorage kent geen atomaire transacties of compare-and-swap; ook na deze terugleescontrole kan een andere tab de waarde wijzigen. Deze wijziging biedt geen duurzame synchronisatie, veiligheidsattestatie of autorisatie. **DRAFT/HOLD/DENY**. CI, onafhankelijke code-review en desktop-/mobiele browseracceptatie blijven vereist.

## Regiekamer v6.15 — onopgeslagen notitie behouden bij wijzigingen in andere tabbladen (2026-11-22)

Bij een `storage`-wijziging van de creatieve ontwerpnotitie vergelijkt de Regiekamer de zichtbare tekst met de eerder opgeslagen waarde uit het event. Heeft de gebruiker in het huidige tabblad onopgeslagen tekst, dan blijft deze tekst intact; er verschijnt een Nederlandstalige conflictmelding met het advies eerst te exporteren of wijzigingen te vergelijken. Is de notitie lokaal ongewijzigd, dan wordt de nieuwe opgeslagen tekst wel overgenomen. Het wissen van een remote notitie maakt de niet-bewerkte editor leeg. De eerdere importannulering bij externe wijzigingen blijft behouden.

Een Playwright-tweede-tabbladscenario test zowel bescherming van onopgeslagen tekst als normale synchronisatie van een schone editor. Een statische contracttest bewaakt het onderscheid. Dit is geen automatische merge en voorkomt niet dat een gebruiker later handmatig een andere versie overschrijft; voor sterke synchronisatie is een versiegebonden opslagcontract nodig. **PR #60 DRAFT/HOLD/DENY**; geen merge, EDTR of live-publicatie.

## Regiekamer v6.15 — privacyvriendelijk rollback-diagnostiek (2026-11-22)

Bij een fout in `restore()` levert de fout nu een stabiele statuscode op: `ATELIER_RESTORE_ROLLED_BACK` wanneer de rollback volgens teruglezing is geslaagd, of `ATELIER_RESTORE_REVIEW_REQUIRED` wanneer een conflict of opslagfout handmatige controle vereist. Het object `error.rollback` geeft per categorie (`exterior`, `interior`, `note`) alleen een label: `untouched`, `original`, `restored`, `conflict` of `failed`. Ontwerpinhoud en notities worden niet opgenomen. De bestaande Nederlandstalige foutmeldingen blijven gehandhaafd. Drie Node-regressies dekken geslaagde rollback, concurrerende edit en stil mislukte rollback.

Deze labels zijn momentopnames, geen blijvende garantie. Browser-`localStorage` kent geen transacties en andere tabbladen kunnen gegevens direct na de controle wijzigen. **DRAFT / HOLD / DENY**, zonder bevoegdheidsverlening of publieke uitrol; geautomatiseerde tests en onafhankelijke review blijven vereist.

## Regiekamer v6.16 — verouderde notitie-opslag weigeren (2026-11-22)

De knop **Notitie bewaren** controleert nu eerst of de actuele opgeslagen notitiewaarde nog overeenkomt met de waarde die deze Regiekamer als uitgangspunt had. Als een ander tabblad tussentijds heeft opgeslagen, weigert de knop de schrijfactie en blijft de eigen, onopgeslagen tekst in de editor zichtbaar. De gebruiker krijgt een expliciete melding om te exporteren en versies te vergelijken. Een schone editor synchroniseert zoals voorheen met wijzigingen uit andere tabbladen; na een geldige opslag, import of undo wordt de uitgangswaarde bijgewerkt.

Playwright test twee tabbladen, het afwijzen van een conflicterende opslag, behoud van nieuwere lokale opslag, en een normale opslag na herladen. Een statische contracttest bewaakt dat de vergelijking vóór de schrijfopdracht gebeurt. **Beperking:** localStorage kent geen atomair compare-and-swap; bij strikt gelijktijdig schrijven blijft een race mogelijk. Deze verbetering beschermt een reeds waarneembaar conflict maar is geen transactiesysteem. PR #60 blijft DRAFT / HOLD / DENY, geen merge of live-publicatie.

## Regiekamer v6.16 — toegankelijke herstelmeldingen (2026-11-22)

`regiekamer.html` toont na een herstel- of importfout met `error.rollback` en een herkende foutcode een afzonderlijk statuspaneel met `role="status"`, `aria-live="polite"` en `aria-atomic="true"`. Het paneel geeft per bron (exterieur, interieur, ontwerpnotitie) uitsluitend vaste Nederlandse statusomschrijvingen voor `untouched`, `original`, `restored`, `conflict` en `failed`. De weergave gebruikt DOM `textContent` en geen `innerHTML` of creatieve inhoud. Bij een nieuwe import of undo wordt de vorige diagnostiek verborgen; onbekende fouten blijven via de bestaande generieke melding zichtbaar. Twee statische UI-contracttests zijn toegevoegd.

Dit is een lokale DRAFT-UI zonder transactiegarantie, officiële audit, externe identiteit of autonome herstelbevoegdheid. Schermlezer-, mobiele en end-to-end-browsertests moeten nog onafhankelijk worden bevestigd. **DRAFT/HOLD/DENY**; niet mergen of publiceren.

## Regiekamer v6.17 — bewust laden van opgeslagen ontwerpnotitie (2026-11-22)

De Regiekamer heeft een afzonderlijke knop **Laad opgeslagen notitie** voor herstel na een conflict tussen tabbladen. Als de opgeslagen tekst afwijkt van de huidige editor, vraagt het systeem eerst expliciete bevestiging omdat onopgeslagen tekst anders verdwijnt. Bij annuleren blijft de editor intact. Na bevestiging wordt de actuele opslag opnieuw gelezen, in de editor getoond en pas daarna als nieuwe uitgangsversie geaccepteerd; dit is een alleen-lezen handeling, geen opslagmutatie. De v6.16-conflictcontrole bij de knop **Bewaar notitie lokaal** blijft actief.

Playwright test annuleren, expliciet overnemen en daarna veilig opslaan vanuit twee browservensters. De eerdere v6.15-browserregressie is aangepast: handmatig gelijkgemaakte tekst is nog geen toestemming om een afgewezen conflict te negeren; na herladen wordt de opgeslagen versie pas aangenomen. Een statische contracttest eist de bevestiging en verbiedt schrijfacties in de nieuwe laadfunctie.

**Beperking:** niet-atomaire localStorage en browsergebonden opslag bieden geen sterkere synchronisatie- of back-upgaranties. PR #60 blijft DRAFT/HOLD/DENY; geen merge, EDTR of publicatie.

## Regiekamer v6.18 — begeleide herstelcontrole (2026-11-22)

Bij een herkende rollbackfout toont het bestaande toegankelijke statuspaneel ook een alleen-lezen checklist. Wanneer `ATELIER_RESTORE_REVIEW_REQUIRED` is gemeld, adviseert het de gebruiker te stoppen met bewerken, waar mogelijk een DRAFT-export te maken, de afzonderlijke exterieur- en interieurontwerpen te vergelijken, de opgeslagen ontwerpnotitie bewust te controleren en pas daarna opnieuw te importeren. Bij een volledig gecontroleerde rollback is de lijst korter. De adviezen zijn vaste tekst; ze lezen geen creatieve inhoud, voeren geen opslagmutatie of automatische reparatie uit en verdwijnen bij het resetten van het statuspaneel. De al bestaande v6.17-knop voor bewust herladen van de notitie blijft behouden.

Een aanvullende statische UI-contracttest verifieert de toegangspunten, vaste teksten, veilige DOM-opbouw en het ontbreken van opslagmutaties in de nieuwe checklistcode. Dit is geen onafhankelijke browseracceptatie. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol. `localStorage` blijft niet-transactioneel.

## Regiekamer v6.19 — opgeslagen notitie teruglezen na schrijfactie (2026-11-22)

De knop **Bewaar notitie lokaal** meldt pas succes nadat de beoogde notitietekst is geschreven én direct uit `localStorage` is teruggelezen. Een stil genegeerde opslagbewerking of een afwijkende teruggelezen waarde levert een expliciete waarschuwing op; de onopgeslagen tekst blijft in de editor en de bekende uitgangsversie wordt niet voortijdig bijgewerkt. Daardoor wordt bij een latere nieuwe poging een werkelijk waarneembaar opslagconflict nog steeds geweigerd. De bestaande v6.16-check vóór het schrijven blijft actief.

Twee Playwright-regressies simuleren een stil genegeerde `setItem`-aanroep en een schrijfactie die een andere waarde achterlaat; na herstel van normale browseropslag kan respectievelijk veilig opgeslagen worden of wordt het conflict geblokkeerd. Een statische contracttest borgt de volgorde schrijven → teruglezen → uitgangswaarde vastleggen.

**Beperking:** een directe terugleescontrole is geen duurzame opslaggarantie of atomaire transactie. Een ander tabblad kan later alsnog wijzigen. PR #60 blijft **DRAFT/HOLD/DENY**; geen merge, EDTR, autorisatie of live-publicatie.

## Regiekamer v6.20 — toetsenbordfocus en browserregressie (2026-11-22)

De begeleide herstelcontrole krijgt na een mislukte herstelactie programmatic focus via `tabindex="-1"` en `focus({preventScroll:true})`. Daardoor kan de gebruiker direct de foutdiagnostiek bereiken zonder een permanente extra tabstop. Bij een volgend herstelverzoek wordt de oude status verborgen. Twee Playwright-tests zijn toegevoegd voor een smal mobiel scherm (390 × 844, conflictstatus, drie statusregels, vijf herstelstappen, focus, opslag ongewijzigd en reset) en desktop (1280 × 800, gecontroleerde rollback, kort stappenoverzicht en focus). Een aanvullende statische contracttest borgt de focuslogica. De tests simuleren UI-statusmeldingen en leveren **geen** bewijs van een echte screenreader- of fysieke mobiele acceptatie.

De bestaande v6.19-notitieopslagtests blijven behouden. `localStorage` blijft niet-transactioneel; er is geen autonome reparatie, machtiging, EDTR, merge of publieke uitrol. **DRAFT/HOLD/DENY**; CI, onafhankelijke toegankelijkheidsreview en fysieke mobiele controles blijven open.

## Regiekamer v6.21 — import- en rollbackregressies in browser (2026-11-22)

Twee nieuwe Playwright-scenario's voeren de echte bestandsimport via `#bundleImport` uit met een geldige creatieve DRAFT-payload. Een geïnjecteerde schrijffout tijdens het bewaren van de ontwerpnotitie controleert dat een eerder geschreven exterieur wordt teruggedraaid, de oorspronkelijke opslag behouden blijft en het statuspaneel de korte checklist toont. In het tweede scenario simuleert de opslagadapter een wijziging van het exterieur door een ander tabblad tijdens diezelfde fout: de herstelprocedure meldt een conflict, toont vijf begeleidingsstappen en mag de concurrerende waarde niet overschrijven. De tweede test gebruikt een mobiele viewport van 390 × 844; beide toetsen programmatische focus en voorkomen het tonen van private inhoud in diagnosevelden.

Deze tests injecteren synchronische opslaginterferentie om interleavings reproduceerbaar te maken; ze zijn geen bewijs van volledige cross-tab-isolatie of een test op een fysiek mobiel toestel. Er is geen productie-uitrol. **DRAFT/HOLD/DENY**; uitvoering van Playwright, CI en menselijke review blijven releasevoorwaarden.

## Regiekamer v6.22 — notitieversie beschermen tijdens laadbevestiging (2026-11-22)

Bij **Laad opgeslagen notitie** wordt de exacte ruwe opslagwaarde vóór de bevestigingsdialoog onthouden. Na bevestiging leest de Regiekamer de opgeslagen notitie opnieuw. Als deze waarde tijdens de dialoog is veranderd, wordt het laden geweigerd en blijft de eigen onopgeslagen tekst én de bekende baseline intact. Dit voorkomt dat een bevestiging van de ene versie ongemerkt toestemming geeft om een andere versie te laden. Een geldige, onveranderde versie kan nog steeds expliciet worden geladen. De bestaande v6.16-conflictcontrole bij opslaan blijft actief.

Playwright simuleert de tussentijdse wijziging tijdens de dialoog en controleert dat de editor niet verandert en een volgende verouderde opslag wordt geweigerd. Een statische contracttest borgt de volgorde oorspronkelijke waarde → teruglezen → vergelijken → baseline bijwerken. **Beperking:** browseropslag kent geen atomaire transacties en vormt geen duurzaam back-upmedium. PR #60 blijft DRAFT/HOLD/DENY, zonder merge, EDTR of live-publicatie.

## Regiekamer v6.23 — regressie met twee echte browsertabbladen (2026-11-22)

Playwright heeft twee aanvullende scenario's met twee pagina's binnen dezelfde browsercontext. Tijdens een bevestigingsdialoog voor bestandsimport schrijft het tweede tabblad een nieuwere ontwerpnotitie: het eerste tabblad moet de import weigeren, de onopgeslagen editorinhoud behouden, de nieuwe opgeslagen notitie ongemoeid laten en geen herstelrecord aanmaken. In de tweede test verandert het tweede tabblad de inhoud van de lokale herstelkopie tijdens het bevestigen van **Herstel vorig lokaal ontwerp**. De undo moet het gewijzigde herstelpunt weigeren, de drie huidige ontwerpbronnen behouden en de andere tab zijn herstelkopie laten bestaan.

Deze tests gebruiken echte gedeelde browseropslag en twee Playwright-pagina's, maar zijn nog niet als geslaagd uitgevoerd bevestigd. Browserdialogen zijn gesynchroniseerde testinterleavings; hiermee zijn niet alle mogelijke races of fysieke mobiele apparaten afgedekt. **DRAFT / HOLD / DENY**, geen merge of publieke uitrol.

## Regiekamer v6.24 — betrouwbare cross-tab-importtest en herstelknoppen (2026-11-22)

De twee v6.23-browserproeven bleken niet correct gesynchroniseerd. Het oorspronkelijke importscenario probeerde een tweede tabblad te laten schrijven terwijl het blokkerende bevestigingsvenster openstond. De nieuwe Playwright-proef vertraagt in plaats daarvan expliciet het lezen van het projectbestand, laat in het tweede tabblad een echte opslagwijziging plaatsvinden en verifieert dat de lopende import wordt geannuleerd, zonder bevestiging of overschrijven van de onopgeslagen ontwerpnotitie.

Ook worden de knoppen voor **Herstel vorig lokaal ontwerp** en **Exporteer herstelkopie** nu automatisch opnieuw beoordeeld wanneer een ander tabblad de herstelkopie toevoegt of verwijdert. Een tweede browserproef verifieert beide richtingen. Een statisch contract bewaakt de refresh-koppeling. De eerdere v6.23-claims van geslaagde tests worden niet overgenomen: die uitvoering faalde in vier desktop-/mobiele varianten; de nieuwe v6.24-uitvoering moet nog slagen.

Het betreft browserlokale DRAFT-functionaliteit zonder atomaire transacties, back-end-synchronisatie, autorisatie of EDTR. **DRAFT/HOLD/DENY**; geen merge of productiepublicatie.

## Regiekamer v6.25 — herhaalde conflicten en herstel na browserherladen (2026-11-22)

Twee Playwright-browserscenario's toetsen het bestaande opslag- en herstelgedrag. In een echte gedeelde browsercontext schrijft het tweede tabblad achtereenvolgens drie geldige ontwerpnotities, terwijl het eerste tabblad een afwijkende onopgeslagen versie vasthoudt. De oorspronkelijke editorinhoud moet blijven staan, de laatste opgeslagen revisie moet behouden blijven en opslaan vanuit de verouderde editor moet worden geweigerd. Een tweede scenario bewaart na een import een lokale DRAFT-herstelkopie, herlaadt de Regiekamer, controleert dat de drie ontwerpbronnen én de ruwe herstelkopie gelijk zijn gebleven en voert vervolgens een expliciet bevestigde undo uit.

Dit zijn toegevoegde testgevallen, geen geverifieerde PASS-uitkomsten. Browseropslag is apparaat-/browsergebonden en kent geen transactionele conflictisolatie. De tests maken geen automatische herstelbeslissing en veranderen geen productiegegevens. **DRAFT / HOLD / DENY**, zonder merge of live-publicatie.

## Regiekamer v6.26 — volledige opslagwisactie vanuit ander tabblad (2026-11-22)

De Regiekamer behandelt nu ook het browser-`storage`-event met `key === null` bij een volledige `localStorage.clear()` in een ander tabblad. De bestaande beveiliging voor onopgeslagen ontwerpnotities blijft leidend: bij een lokaal gewijzigde tekst toont het Atelier een waarschuwing en behoudt het de editor én de oorspronkelijke opslagbaseline, waardoor de verouderde tekst niet stilzwijgend opnieuw wordt opgeslagen. Als de editor niet lokaal is gewijzigd, wordt de notitie leeg gemaakt en de baseline op `null` gezet; daarna kan de gebruiker een nieuwe notitie veilig opslaan.

Twee Playwright-scenario's met echte tabbladen controleren beide situaties, inclusief de volgende opslagactie. Een statische contracttest bewaakt de expliciete afhandeling van `key === null`. Herstelknoppen worden bij wissen al opnieuw beoordeeld; deze wijziging maakt het gedrag van de notitie consistent. `localStorage` is geen atomair opslagmedium of duurzame back-up. PR #60 blijft **DRAFT/HOLD/DENY**; geen merge, officiële autorisatie, EDTR of live-publicatie.

## Regiekamer v6.27 — herstelkopie uit een vastgelegde bronmomentopname (2026-11-22)

`restoreWithRecovery()` bouwt de lokale herstelkopie nu uit dezelfde reeds gecontroleerde ruwe opslagmomentopname (`prior`) die tijdens de import wordt gebruikt, in plaats van de ontwerpen later opnieuw te lezen via `read(storage)`. Onmiddellijk vóór het schrijven wordt de volledige actuele momentopname nogmaals met `prior` vergeleken. Als een tweede tabblad tussen deze controles de lokale ontwerpbronnen wijzigt, wordt de import geweigerd vóór het herstelrecord of ontwerpen worden geschreven. Twee extra Node-regressies dekken tussentijdse notitiewijzigingen en inhoudelijke overeenstemming van een geslaagde herstelkopie met de vastgelegde DRAFT-bron.

Deze controle is best-effort: `localStorage` heeft geen atomaire compare-and-swap en verdere races zijn mogelijk. Node-/browseruitvoering en onafhankelijke review op de nieuwe HEAD zijn nog niet bevestigd. **DRAFT / HOLD / DENY**; geen merge, EDTR of productiepublicatie.

## Regiekamer v6.28 — herstelkopie bij schrijffout na mutatie (2026-11-22)

Sommige opslagadapters kunnen eerst een waarde wijzigen en daarna alsnog een fout werpen. Bij een fout van `setItem(RECOVERY, ...)` leest de Regiekamer nu de werkelijke opgeslagen waarde terug. Als deze gelijk is aan de eigen zojuist geschreven herstelkopie, probeert de code uitsluitend die eigen kopie terug te zetten naar de vooraf aanwezige herstelwaarde en controleert de uitkomst opnieuw. Als een ander tabblad intussen de herstelkopie heeft gewijzigd, blijft die concurrerende waarde intact en wordt de import geweigerd. Wanneer terugdraaien niet aantoonbaar lukt, meldt het systeem expliciet een onbekende of onvolledige herstelstatus; het claimt geen succesvolle terugdraaiing.

Drie Node-regressies dekken een write-then-throw, een concurrerende herstelkopie tijdens de fout en een niet-bevestigde rollback. De controles blijven best-effort, omdat `localStorage` niet-transactioneel is. De nieuwe tests zijn toegevoegd maar nog niet als PASS geverifieerd. **DRAFT/HOLD/DENY**, geen merge, EDTR of publieke uitrol.

## Regiekamer v6.29 — synchronisatie van statische testcontracten (2026-11-22)

De actuele GitHub-validatie van v6.28 faalde op twee oudere statische verwachtingen in `atelier-surface.test.cjs`. Deze tests verwezen rechtstreeks naar `e.newValue`, terwijl de Regiekamer sinds v6.26 via `const latest=e.key===null?null:e.newValue` ook een volledige `localStorage.clear()` uit een ander tabblad veilig verwerkt. Beide contracttests controleren nu de feitelijke veilige route via `latest`, inclusief behoud van onopgeslagen tekst en correct bijwerken van de bekende notitiebaseline. Dit is een testcorrectie, geen uitbreiding van bevoegdheden of wijziging van productiecode. Nieuwe GitHub CI moet op deze commit nog slagen. **DRAFT/HOLD/DENY**, geen merge of publicatie.

## Regiekamer v6.30 — terugleescontrole na herstelkopie-rollback (2026-11-22)

Als een ontwerpimport mislukt nadat de tijdelijke herstelkopie is geschreven, probeert `restoreWithRecovery()` de vooraf aanwezige herstelkopie te herstellen of de tijdelijke kopie te verwijderen. Na deze opruiming leest de functie de herstelopslag nu terug. Alleen wanneer de werkelijke waarde exact overeenkomt met de vooraf vastgelegde ruwe waarde, wordt de oorspronkelijke importfout opnieuw gemeld. Bij een stil genegeerde opruiming, een concurrerende wijziging of een lees-/schrijffout wordt expliciet gemeld dat de herstelkopie **niet aantoonbaar** is teruggezet; de functie claimt dan geen geslaagde rollback.

Drie Node-regressies zijn toegevoegd voor een stil genegeerde delete, een correct herstelde eerdere herstelkopie en een andere waarde tijdens cleanup. Deze code verandert geen bevoegdheden en verleent geen transactionele garantie: `localStorage` heeft geen atomaire compare-and-swap. De tests zijn opgeslagen maar nog niet als PASS bevestigd. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.31 — verouderde opslaggebeurtenissen neutraliseren (2026-11-22)

Browser-storage-events kunnen vertraagd worden verwerkt wanneer een tabblad op de achtergrond stond. Daarom leest de Regiekamer bij een ontvangen wijziging van de ontwerpnotitie of een volledige opslagwisactie de **werkelijk actuele notitie** opnieuw uit localStorage. De event.newValue-payload wordt niet meer als actuele versie aangenomen. Heeft de huidige editor onopgeslagen tekst, dan blijft deze zichtbaar en houdt de bestaande conflictcontrole opslaan tegen als de onderliggende opslag is gewijzigd. Bij een schone editor wordt de actuele opgeslagen versie getoond en als nieuwe uitgangswaarde vastgelegd.

Twee Playwright-tests simuleren een vertraagd opslag-event met een verouderde payload en controleren respectievelijk een schone editor (actuele inhoud en veilig verder opslaan) en onopgeslagen werk (behoud plus conflictweigering). Twee eerdere statische contracttests zijn aangepast en een nieuwe statische toets bewaakt de live-lezing.

**Grenzen:** de live-lezing is geen atomair compare-and-swap of duurzame synchronisatie; localStorage blijft browsergebonden. **DRAFT/HOLD/DENY**, geen merge, EDTR of live-publicatie.

## Regiekamer v6.32 — controle op herstelkopie na validatie (2026-11-22)

`undoLastImport()` vergelijkt na het parsen en valideren van een herstelrecord de actuele ruwe opslagwaarde opnieuw met de exact geselecteerde herstelkopie. Als een ander tabblad de kopie vervangt tijdens die validatie, weigert de undo de operatie vóór het overschrijven van de drie Atelier-bronnen. De bestaande controles in `restoreWithRecovery()` blijven daarnaast actief. Twee Node-regressies behandelen wijziging van de herstelkopie tussen parsen en uitvoering, en corrupte of niet-geautoriseerde herstelrecords. In alle weigeringen blijven de creatieve ontwerpgegevens ongewijzigd.

Dit is een extra best-effort verificatie; `localStorage` biedt geen transactionele opslag of atomaire compare-and-swap. De tests zijn vastgelegd maar zijn op de nieuwe HEAD nog niet als geslaagd bevestigd. **DRAFT/HOLD/DENY**, geen merge, EDTR of publieke uitrol.

## Regiekamer v6.33 — geen valse conflictmelding bij verouderde opslag-events (2026-11-22)

Bij een browser-storage-event voor een ontwerpnotitie leest de Regiekamer eerst de daadwerkelijk opgeslagen waarde opnieuw. Heeft de editor lokale onopgeslagen tekst, dan verschijnt een conflictmelding uitsluitend wanneer deze opgeslagen waarde echt afwijkt van de bekende baseline. Een vertraagde of opnieuw verzonden gebeurtenis met een verouderde payload veroorzaakt dus geen onterechte waarschuwing als de opgeslagen notitie niet veranderd is. Is de opslag wel veranderd, dan blijft het bestaande beschermingsmechanisme actief en wordt een verouderde schrijfactie geweigerd. Een schone editor synchroniseert nog steeds naar de actuele opgeslagen versie.

Twee Playwright-regressies controleren een vals alarmsignaal zonder opslagwijziging en een werkelijk opslagconflict met misleidende event-payload. Een statische contracttest borgt dat de live opslag wordt gelezen vóór de conflictmelding. **Grenzen:** geen atomaire compare-and-swap en geen duurzame browserback-up. **DRAFT/HOLD/DENY**, zonder merge, EDTR of live-publicatie.

## Regiekamer v6.34 — beschadigde herstelkopieën tussen echte tabbladen (2026-11-22)

Twee nieuwe Playwright-browsertests gebruiken twee pagina's in dezelfde browsercontext. In de eerste schrijft het tweede tabblad ongeldige JSON naar de lokale herstelkopie. De Regiekamer moet zijn undo-knop uitschakelen, de leesfout tonen en de drie ontwerpbronnen onaangetast laten. De test probeert ook programmatisch `undoLastImport` op de corrupte kopie, die geweigerd moet worden. In de tweede schrijft het tweede tabblad een herstelrecord met `authority: OWNER`. De bestaande DRAFT/NONE-grens moet die onbevoegde herstelkopie afwijzen, de herstelknop uitschakelen en de huidige ontwerpbronnen behouden, zonder de concurrerende herstelkopie zelf te wijzigen.

De bron van de herstelkopie is onbetrouwbare lokale opslag; het bestaan van een JSON-record verleent nooit autoriteit. De tests zijn toegevoegd, maar hun PASS is nog niet aangetoond op de nieuwe HEAD. Browser-`localStorage` blijft niet-transactioneel. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.35 — contracttest betrouwbaar uitvoeren (2026-11-22)

Een statische regressietest voor notitieconflicten overschaduwde de bestaande bestandsleesfunctie `read()` met een lokale constante `read`. Door de JavaScript temporal dead zone faalde de test vóór de eigenlijke controles. De lokale positievariabele is hernoemd naar `readPosition`; de test verifieert opnieuw de volgorde van actuele opslaglezing, herkenning van onopgeslagen bewerkingen en echte conflictdetectie. Er zijn geen functionele wijzigingen in het Atelier en de drie bestaande creatieve opslagbronnen blijven ongemoeid. De eerder geconstateerde v6.34-validatiefout is hiermee in code gecorrigeerd; bevestiging door de nieuwe CI-uitvoering blijft vereist. **DRAFT/HOLD/DENY**; geen merge of publicatie.

## Regiekamer v6.36 — verificatie- en vrijgaveregister (2026-11-22)

Dit is een **release-gate-checklist**, niet een verklaring dat een controle is geslaagd. De status van dynamische checks verandert na nieuwe commits: controleer altijd de **actuele PR-head**. **Onbekend, niet uitgevoerd, pending of failure = BLOCKED**. Een succesvolle deploy-preview verleent geen toestemming voor merge of publieke uitrol.

| Gate | Acceptatiecriterium | Vereist bewijs | Vrijgavestatus |
| --- | --- | --- | --- |
| G01 — DRAFT/NONE | Uitsluitend bekende DRAFT-schemas; geen autoriteitsverhoging | Node-contracttests en negatieve corruptie-/authority-tests | **NIET VRIJGEGEVEN** |
| G02 — gegevensbehoud | EX, IN, NOTE blijven intact bij geweigerde import of corrupte recovery | Node-foutinjecties en browserregressies | **NIET VRIJGEGEVEN** |
| G03 — tabconflicten | Geen stille overschrijving van concurrente ontwerpen of herstelkopieën | Playwright met twee echte tabbladen | **NIET VRIJGEGEVEN** |
| G04 — rollback | Verifiëren via teruglezing; onvolledige rollback wordt niet als PASS gemeld | Tests voor write-then-throw, stille fout en concurrente wijziging | **NIET VRIJGEGEVEN** |
| G05 — toegankelijkheid | Toetsenbordfocus, schermlezerfeedback en mobiele bruikbaarheid | Playwright plus handmatige toetsenbord-, schermlezer- en telefoontests | **NIET VRIJGEGEVEN** |
| G06 — offline/portabiliteit | DRAFT-export/import werkt offline, na reload en met limieten | Browser-scenario's, offline smoke tests, SHA-256-controle | **NIET VRIJGEGEVEN** |
| G07 — repositorykwaliteit | Alle verplichte checks op dezelfde SHA geslaagd; onafhankelijke review | GitHub CI en reviewrecord met volledige SHA | **NIET VRIJGEGEVEN** |
| G08 — bevoegdheid | Afzonderlijk GO-13-besluit pas na volledige verificatie | Expliciete bevoegde toestemming | **HOLD / DENY** |

### Bewijsdiscipline

1. Registreer per vrijgavekandidaat commit-SHA, controlenaam, status, tijdstip, reviewer en observatie. Een groene controle op een oudere commit telt niet.
2. Bij ontbrekende, wachtende of mislukte checks blijft de release geblokkeerd; een Vercel-preview is geen bewijs van volledige functionele acceptatie.
3. Creatieve DRAFT-bestanden en herstelkopieën geven nooit rechten voor identiteit, EDTR, officiële Citadels of productiegegevens.
4. localStorage blijft zonder atomair compare-and-swap, duurzame back-up, cross-device synchronisatie of transactiegarantie.
5. Bij afwijking: corrigeer in de Draft-branch, voeg een gerichte regressie toe en verzamel bewijs op de nieuwe HEAD. Geen merge of publicatie zonder aparte GO.

**GitHub-status vóór deze documentatiewijziging:** commit 2f0fe7cefd57323e595c381eef4e24f84830145b had één geslaagde Vercel-status, twee pending en één failure. Deze oudere uitslag is geen bewijs voor de commit van dit register. **Eindbesluit: DRAFT / HOLD / DENY.**

## Regiekamer v6.37 — browsertest herstelstatus na initialisatie (2026-11-22)

De v6.36 GitHub-validatie faalde in desktop- en mobiele Chromium op één scenario: de test maakte in het huidige tabblad rechtstreeks een herstelkopie aan via de JavaScript-API en verwachtte onmiddellijk dat de bij paginalading geïnitialiseerde herstelknop actief zou zijn. Binnen hetzelfde tabblad wordt voor zo'n rechtstreeks opslagcommando geen `storage`-event verzonden. De test herlaadt nu de Regiekamer voordat hij de herstelknoppen controleert en vervolgens een tweede tabblad de herstelkopie laat beschadigen. Hiermee wordt de echte herstelstart na paginalading getest en blijft de fail-closed afhandeling van beschadigde herstelkopieën intact. Productiecode is niet gewijzigd. De nieuwe v6.37 CI moet nog worden bevestigd. **DRAFT/HOLD/DENY** — geen merge, EDTR of publicatie.

## Regiekamer v6.38 — controleerbaar vrijgavebewijs (2026-11-22)

Het bestand [release-evidence-v6.38.json](release-evidence-v6.38.json) legt de acht bestaande vrijgavegates G01–G08 machineleesbaar vast, inclusief bewijsbronnen, releaseblokkades en de expliciete beslissing **HOLD / DENY**. Dit is een momentopname en **geen live CI-badge**: de geobserveerde commit-SHA is `d6f7fbd2a3631c438fe581acb22d5a779035ef7a`. Na een nieuwe commit gelden deze observaties niet automatisch voor de nieuwe HEAD.

### Bevestigde observaties op de geobserveerde commit

- GitHub Actions **CI**, run 44993986670: afgerond, **success** (job build).
- GitHub Actions **Citadel local preview conformance**, run 44993986708: afgerond, **success** (job preview).
- GitHub Actions **Atelier DRAFT validation**, run 44993986635: **in_progress** bij raadpleging (Atelier isolated regression and contract checks); **geen PASS**.
- Vercel: twee pending contexten, één failure en één andere pending context; afzonderlijke deploychecks vormen **geen volledige testbevestiging**.

### Interpretatie en vrijgavegrens

De machineleesbare registratie maakt onderscheid tussen een **bewezen positief resultaat voor één specifieke check** en een **niet-vrijgegeven gate**. Er zijn nog geen complete Node-/Playwright-resultaten voor alle vereiste regressies, menselijke schermlezer- en telefoontests, onafhankelijke code-review en formele GO-13-vrijgave op een identieke nieuwe commit aangetoond. Alle gates blijven daarom fail-closed en er is **geen releasegoedkeuring**. De JSON bevat geen geheime gegevens, gebruikersontwerpen of bevoegdheidsclaims. Er is in v6.38 geen runtime- of productgedrag gewijzigd. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.39 — veilige foutafhandeling bij ontoegankelijke notitieopslag (2026-11-22)

Een opslaggebeurtenis vanuit een ander tabblad kan binnenkomen terwijl browserbeleid, een extensie of een opslagadapter de notitie tijdelijk niet laat uitlezen. De Regiekamer beschermt de huidige editor nu met een afgevangen fout rondom het opnieuw lezen van de actuele notitie. Bij een leesfout verschijnt een duidelijke melding, terwijl de bestaande tekst en bekende opslagbaseline ongewijzigd blijven. De gebeurtenis leidt niet langer tot een ongecontroleerde fout of een onterecht gesynchroniseerde versie. Na herstel van browseropslag kan een gebruiker opnieuw proberen op te slaan; de bestaande conflictcontrole blijft van kracht.

Twee Playwright-regressies injecteren een SecurityError op het uitlezen van de notitie tijdens een opslag-event, zowel voor een onopgeslagen als een reeds opgeslagen editor. Een statische contracttest controleert de foutafhandeling. Dit levert geen garantie voor volledige beschikbaarheid of duurzame browseropslag: localStorage blijft niet-transactioneel en apparaatgebonden. **DRAFT/HOLD/DENY**; geen merge, EDTR, machtiging of publieke uitrol.

## Regiekamer v6.40 — actuele workflowresultaten herleidbaar bewaren (2026-11-22)

Het nieuwe [release-evidence-v6.40.json](release-evidence-v6.40.json) documenteert de gecontroleerde toestand op **commit 1a588e407627d8a67fa9d6794646d31576bc595f (v6.39)**. Dat is een historische momentopname, **niet** de nieuwe HEAD waarop dit bestand wordt toegevoegd. De volgende GitHub Actions-workflows waren alle drie afgerond met `success`: CI (run 44994431690, build), Citadel local preview conformance (run 44994431723, preview) en Atelier DRAFT validation (run 44994431673, isolated regression and contract checks). Van de vier Vercel-contexten waren palaco-citadel, palaco-citadel-qosn en palaco-citadel-c6xt geslaagd; palaco-citadel-qrat stond op `failure`.

De acht gates G01–G08 blijven **niet vrijgegeven**: geslaagde workflows bewijzen niet afzonderlijk dat alle acceptatievoorwaarden van iedere gate zijn vervuld. Er ontbreekt onder meer bewijs van de fysieke mobiele en schermlezeracceptatie, een onafhankelijke code-review en expliciete GO-13-toestemming. Bovendien moet iedere nieuwe HEAD opnieuw worden gecontroleerd. Het register houdt alle `release_pass`-waarden expliciet op `false`, `release_approved` op `false` en de publicatiegrens op `DENY`. Deze ronde wijzigt geen runtime, identiteit, EDTR of productiegegevens. **DRAFT/HOLD/DENY**; geen merge of publieke uitrol.

## Regiekamer v6.41 — geen misleidende synchronisatiemelding voor oude opslag-events (2026-11-22)

Een verouderd of opnieuw aangeboden browser-storage-event mag de bevestiging **Ontwerpnotitie lokaal bewaard** niet overschrijven als de werkelijk opgeslagen notitie nog precies overeenkomt met de bekende baseline van de schone editor. De Regiekamer leest de actuele browseropslag nog steeds opnieuw en voert alleen de synchronisatie plus berichtupdate uit als die waarde daadwerkelijk is veranderd. Wanneer de opgeslagen notitie wél is gewijzigd, werkt de schone editor normaal bij. De bestaande bescherming tegen overschrijven van onopgeslagen tekst en de foutafhandeling bij ontoegankelijke opslag blijven onveranderd.

Twee browserregressies controleren het behouden van de opslagbevestiging bij een achterhaalde gebeurtenis en het verwerken van een werkelijke opslagwijziging. Een statisch contract beschermt de nieuwe revisievoorwaarde. Deze aanpassing is uitsluitend voor lokale DRAFT-UI-feedback en vormt geen transactionele of duurzame opslaggarantie. **DRAFT/HOLD/DENY**, geen merge, EDTR of productiepublicatie.

## Regiekamer v6.42 — CI-bewijs tot op testcasusniveau (2026-11-22)

Het bestand [test-case-evidence-v6.42.json](test-case-evidence-v6.42.json) registreert geselecteerde testcasussen met hun werkelijke GitHub Actions-logmarkeringen. De bron is de **Atelier DRAFT validation** workflow, run **44997681110**, job **137132144542**, op de exacte v6.41-commit **f21c98ca6b35ab097fbf61188dc9b27639021edd**. Uit het opgevraagde joblog zijn de volgende testsamenvattingen bevestigd: **64/64** statische en data-/bundletests (0 mislukt), **5/5** domein-/wizardtests (0 mislukt), en **140** geslaagde desktop-/mobiele Chromium-browsertests. Ook de afzonderlijke opslag- en hersteltests zijn in het log herkenbaar via de opgenomen testnamen en ok-markeringen.

Dit bewijst de geobserveerde testuitvoering op **die eerdere commit**, niet de teststatus van de nieuwe v6.42-HEAD. Het register vermeldt expliciet dat handmatige schermlezertoetsen, fysieke mobiele acceptatie, zelfstandige code-review, alle verplichte deploymentchecks en GO-13-toestemming nog niet als voltooid zijn aangetoond. Geen enkele G01–G08-gate wordt automatisch vrijgegeven. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.43 — opslaggebeurtenissen beperken tot Atelier localStorage (2026-11-22)

De Regiekamer neemt alleen een browser-`storage`-event in behandeling wanneer de `storageArea` daadwerkelijk de lokale `localStorage` van deze pagina is. Een gelijknamige sleutel vanuit `sessionStorage` of een kunstmatig event zonder juiste opslagbron kan daardoor geen lopende import annuleren, geen herstelknoppen verversen en geen notitiefeedback beïnvloeden. Bestaande bescherming tegen conflicterende lokale opslagwijzigingen blijft ongewijzigd.

Twee Playwright-regressies controleren een ongerelateerde sessieopslagmelding tijdens een geslaagde notitieopslag en tijdens een bewust vertraagde projectimport. Een statische contracttest controleert dat de broncontrole vóór de import- en herstelacties plaatsvindt. Dit voorkomt onterechte acties, maar biedt geen atomaire opslaggarantie. **DRAFT/HOLD/DENY**; geen merge, EDTR, autorisatie of productiepublicatie.

## Regiekamer v6.44 — uitvoerbare fail-closed bewijscontrole (2026-11-22)

De nieuwe offline module [release-gate.cjs](release-gate.cjs) beoordeelt een kandidaat-commit tegenover een opgegeven machineleesbaar bewijsregister. Voor G01–G08 geeft hij per gate de erkende en ontbrekende bewijscategorieën terug. Alleen bewijs dat de exacte kandidaat-SHA vermeldt, een expliciete positieve testuitkomst heeft, door een reviewer is beoordeeld en een niet-lege bronverwijzing bevat, komt überhaupt in aanmerking. Een historisch register met een andere `observed_commit_sha` kan nooit automatisch bewijs voor een nieuwe commit leveren.

**Veilige voorbeeldopdracht voor uitsluitend diagnostiek:**
```sh
node atelier/release-gate.cjs <VOLLEDIGE_40_HEX_SHA> atelier/release-evidence-v6.40.json
```

Met `--enforce` eindigt het proces met een niet-nul exitcode zolang het besluit geen GO is. In deze DRAFT-implementatie blijft het resultaat **altijd HOLD / DENY**, ook als een onbetrouwbaar lokaal JSON-bestand ten onrechte alle vinkjes op PASS of de autoriteit op OWNER zet. Deze module **kent geen bevoegdheid toe, voert geen merge uit, en publiceert niets**. De acht bewijscategorieën moeten voor formele vrijgave nog onafhankelijk worden beoordeeld en gekoppeld aan het bevoegde GO-13-besluit.

Vijf tests in [release-gate.test.cjs](release-gate.test.cjs) toetsen verouderde SHA, ontbrekende handmatige acceptatie, ongefundeerd of niet-beoordeeld bewijs, vervalste GO/OWNER-claims en ongeldige invoer. Voer uit met `node --test atelier/release-gate.test.cjs`. Tot succesvolle uitvoering en onafhankelijke review wordt **geen PASS** geclaimd. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.45 — veilige opslagbroncontrole bij geblokkeerde browseropslag (2026-11-22)

De v6.43-controle van de bron van browser-storage-events vergelijkt de `storageArea` met de `localStorage` van de Regiekamer. Wanneer een browserbeveiligingsbeleid het benaderen van de `localStorage`-eigenschap zelf weigert, kan die vergelijking een `SecurityError` veroorzaken. De broncontrole is nu afgeschermd: bij een toegangsweigering verschijnt een waarschuwing, bestaande ontwerptekst wordt niet aangepast en een eventueel lopende bestandsimport wordt niet door een onbeoordeelbare gebeurtenis geannuleerd. De import behoudt zijn eigen bestaande verificatie bij daadwerkelijke uitvoering.

Twee Playwright-regressies simuleren een geweigerde browseropslag-eigenschap: één met onopgeslagen ontwerpnotitie en één tijdens het vertraagde lezen van een DRAFT-projectbestand. De statische contracttests controleren dat de foutafhandeling vóór de import- en synchronisatieacties staat. Dit is een **best-effort** veiligheidsverbetering, geen garantie dat export of opslag bij geblokkeerde browseropslag alsnog mogelijk is. **DRAFT/HOLD/DENY**, zonder merge, EDTR, autorisatie of live-publicatie.

## Regiekamer v6.46 — fail-closed vrijgavecontrole in Atelier CI (2026-11-22)

De bestaande workflow `.github/workflows/atelier-validation.yml` voert nu ook `node --test atelier/release-gate.test.cjs` uit en controleert daarna met de daadwerkelijke GitHub Actions `GITHUB_SHA` dat het historische bewijsregister `atelier/release-evidence-v6.40.json` **geen vrijgave** kan verlenen. De diagnose moet acht gates met `pass: false` rapporteren, `decision: HOLD`, `publication: DENY` en `release_approved: false`. Met `--enforce` moet de evaluator bovendien een niet-nul exitcode teruggeven. Een onverwacht geaccepteerde DRAFT-release laat de ontwikkelworkflow falen.

De normale *verwachte* HOLD is geen CI-fout: het gaat om een automatische regressie van de vrijgavegrens, **niet** om een verzoek tot uitrol. De al bestaande Atelier-data-, domein- en Playwright-tests blijven in dezelfde workflow aanwezig. Bewijs uit een historische bron-SHA geldt nooit automatisch voor de nieuwe PR-merge-SHA. De diagnose is offline/read-only, maakt geen release-artifact openbaar en vraagt geen extra GitHub-permissies.

Deze workflowwijziging is gepusht, maar de nieuwe Actions-run moet de toegevoegde stappen nog daadwerkelijk als geslaagd bevestigen. Alle releasegates blijven **DRAFT / HOLD / DENY**; geen merge, EDTR, officiële Citadel of publieke uitrol.

## Regiekamer v6.47 — onderscheid verouderde eventmeldingen en werkelijke importconflicten (2026-11-22)

Bij het starten van het asynchroon lezen van een DRAFT-projectbestand legt de Regiekamer de actuele ruwe opslagmomentopname van exterieur, interieur en notitie vast. Wanneer tijdens het lezen een relevante `storage`-melding van een ander tabblad aankomt, leest de Regiekamer de actuele bronnen opnieuw en vergelijkt die met de startmomentopname. Alleen bij een werkelijk verschil wordt de lopende import geannuleerd. Verouderde of herhaalde meldingen die niet overeenkomen met een daadwerkelijke wijziging verbreken de import niet meer. Als de opgeslagen bronnen niet controleerbaar zijn, blijft de afhandeling veilig conservatief: de import wordt afgebroken.

Twee Playwright-regressies controleren een verouderd event zonder opslagwijziging en een echte gelijktijdige notitiewijziging in een tweede tabblad. Een statisch contract bewaakt de volgorde opslagmomentopname → livevergelijking → eventuele annulering. De bestaande controle na het lezen en vóór het schrijven blijft gehandhaafd. Deze browserlokale bewaking is niet atomair en garandeert geen volledige isolatie tussen tabbladen. **DRAFT/HOLD/DENY**; geen merge, EDTR of productiepublicatie.

## Regiekamer v6.48 — schema- en bewijsregels strikt controleren (2026-11-22)

De offline fail-closed evaluator `release-gate.cjs` weigert nu ongeldige registers expliciet: alleen `palaco.citadel.atelier.release-evidence/1` is toegestaan, bewijsregels moeten een array van maximaal 1000 items vormen, en elke regel moet een bekende gate, toegestane bewijscategorie, status, 40-tekens-commit-SHA, reviewvlag en bronveld bevatten. Onbekende gates en bewijscategorieën worden niet meer stilzwijgend genegeerd. Zo ontstaan geen schijnbaar volledige rapportages uit deels defecte invoer.

Vier aanvullende Node-tests toetsen onbekende schema's, ongeldig bewijs, grenswaarden en de bestaande regel dat zelfs een geldig positief bewijs nooit automatisch een GO oplevert. De tests zijn door de bestaande `Atelier DRAFT validation`-workflow opgenomen via `node --test atelier/release-gate.test.cjs`, maar de uitvoering op deze nieuwe HEAD moet nog apart worden bevestigd. De check blijft diagnostisch en kent geen autorisatie toe. **DRAFT / HOLD / DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.49 — bestandsimport opnieuw controleren na asynchrone lezing (2026-11-22)

De Regiekamer controleert de ruwe opslagmomentopname van exterieur, interieur en ontwerpnotitie zowel **vóór** als **onmiddellijk na** het asynchroon lezen van een DRAFT-projectbestand. Dit is noodzakelijk omdat programmatische wijzigingen vanuit hetzelfde tabblad geen browser-`storage`-event in dat tabblad veroorzaken. Is een van de bronwaarden tijdens het lezen gewijzigd, dan wordt de import geweigerd vóór het verwerken van de externe inhoud of het tonen van een bevestigingsdialoog. De actuele brongegevens worden niet overschreven en er wordt geen herstelkopie aangemaakt. Ook worden interne momentopnamen bij expliciete annulering of bewerking van de lokale notitie opgeruimd.

Twee Playwright-regressies controleren een programmatische wijziging vanuit hetzelfde tabblad tijdens een vertraagde file-read en een ongewijzigde bron waarbij de gewone DRAFT-importbevestiging bereikbaar blijft. Een statische contracttest borgt de volgorde bronmomentopname → file-read → nieuwe momentopname → vergelijking → voltooiing. Deze controle is **best effort** en vervangt geen atomaire compare-and-swap; de bestaande validatie en conflictcontroles vlak vóór het schrijven blijven vereist. **DRAFT / HOLD / DENY**; geen merge, EDTR, autorisatie of productiepublicatie.

## Regiekamer v6.50 — tegenstrijdige bewijsregels blokkeren vrijgave (2026-11-22)

De offline evaluator `release-gate.cjs` vergelijkt beoordeelde bewijsregels nu op **gate + bewijscategorie + exacte kandidaat-SHA**. Als voor dezelfde categorie op dezelfde commit zowel `pass` als `fail` is geregistreerd, telt die categorie **niet** als geaccepteerd en verschijnt ze expliciet onder `conflicts` en als `conflicting_evidence` in de releaseblokkades. Ook een enkele geverifieerde `fail` blijft een ontbrekend positief bewijs. Een fout uit een andere commit vervuilt daarentegen niet de actuele kandidaatbeoordeling.

Drie nieuwe Node-tests dekken een PASS/FAIL-conflict, een afzonderlijke FAIL en isolatie van oudere commitresultaten. De al bestaande CI voert deze regressietests mee uit. **Alle gates blijven HOLD/DENY**, ook als afzonderlijke categorieën voldoende positief bewijs bevatten; de evaluator kent geen bevoegdheid toe. Uitvoering van de nieuwe tests op v6.50 is nog niet bevestigd. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.51 — bewerkingen tijdens importbevestiging beschermen (2026-11-22)

Vlak vóór de importbevestiging bewaart de Regiekamer de huidige, eventueel onopgeslagen ontwerpnotitie in het geheugen. Na een bevestigend antwoord controleert de import opnieuw of die tekst onveranderd is. Als een browserintegratie, extensie of ander programma tijdens de bevestiging de editor heeft aangepast, wordt de import **vóór** het terugzetten van de DRAFT-bronnen afgebroken, blijft de nieuwere tekst zichtbaar en wordt geen herstelkopie voor de geweigerde import geschreven. Bij ongewijzigde tekst blijft het normale importpad beschikbaar, met behoud van de reeds aanwezige controles op de opslagmomentopname en herstelkopie.

Twee Playwright-tests simuleren een aangepaste `confirm`-functie: één wijzigt de onopgeslagen editor tijdens de dialoog en verwacht weigering zonder gegevensverlies, één bevestigt zonder bewerking en verwacht een normale DRAFT-import. Een statische contracttest bewaakt de volgorde notitiemomentopname → bevestiging → hercontrole → daadwerkelijke import. Dit is een best-effort browserlokale beveiliging en geen transactionele garantie. **DRAFT/HOLD/DENY**, geen merge, EDTR of publieke uitrol.

## Regiekamer v6.52 — dubbele bronnen en onafhankelijke reviewers (2026-11-22)

De offline evaluator `release-gate.cjs` controleert nu of eenzelfde geverifieerde bron met dezelfde uitkomst meerdere malen is opgevoerd voor dezelfde gate, bewijscategorie en kandidaatcommit. Die dubbele gegevens worden als `duplicates` gemeld, de bewijscategorie wordt niet als geaccepteerd gezien en de blokkade `duplicate_evidence` verschijnt expliciet. Meerdere daadwerkelijk verschillende bronverwijzingen worden niet als duplicaat aangemerkt.

Voor de categorie `G07/independent_review` geldt aanvullend dat afzonderlijke, niet-lege `reviewer_id` en `author_id` vereist zijn en niet identiek mogen zijn. Ontbrekende of gelijke identifiers leveren `reviewGaps` en `reviewer_independence_unverified` op. Deze tekenreekscontrole levert **geen cryptografische identiteitsverificatie** en bewijst niet dat de opgegeven personen werkelijk de review hebben uitgevoerd. Onafhankelijke GitHub-review en bevoegd GO-13-besluit blijven vereist.

Vier Node-regressies dekken dubbele bronnen, verschillende bronnen, self-review en verschillend opgegeven reviewer/auteur. De bestaande CI-workflow neemt deze tests mee. De nieuwe HEAD moet nog als PASS worden geverifieerd. Alle acht gates blijven in deze DRAFT-evaluator **HOLD/DENY**. Geen merge, EDTR of publieke uitrol.

## Regiekamer v6.53 — GitHub-reviewherkomst aan kandidaatcommit koppelen (2026-11-22)

Voor de diagnostische categorie `G07/independent_review` zijn niet alleen verschillende auteur- en revieweridentificaties vereist, maar voortaan ook een positief numeriek PR-nummer, een positief numeriek GitHub-review-ID, een GitHub-reviewlink met hetzelfde PR- en reviewnummer, en `reviewed_commit_sha` die exact overeenkomt met de beoordeelde kandidaatcommit. Verschillende schrijfwijzen van dezelfde reviewer/auteur worden bij de vergelijking hoofdletterongevoelig behandeld. Ontbrekend, verouderd of intern inconsistent reviewbewijs wordt als `reviewer_independence_unverified` geblokkeerd.

Drie aangepaste/nieuwe Node-regressies toetsen ontbrekende herkomst, intern consistent ingevulde reviewgegevens en een verkeerde commit, review-ID of dezelfde auteur/reviewer. De bestaande CI neemt ze mee. **Deze URL- en identiteitscontroles verifiëren de review niet rechtstreeks tegen GitHub**: zonder onafhankelijke API-controle van daadwerkelijke reviewstatus, identiteit en commit is het slechts herleidbare zelfgerapporteerde invoer. Bovendien blijft de DRAFT-evaluator altijd **HOLD / DENY**. Er is geen merge, EDTR of publieke uitrol.

## Regiekamer v6.54 — read-only GitHub-reviewaudit (2026-11-22)

De nieuwe offline module [github-review-audit.cjs](github-review-audit.cjs) leest een reeds afzonderlijk opgehaalde GitHub-reviewlijst en beoordeelt per review de toestand `APPROVED`, revieweridentiteit ten opzichte van de auteur, de exacte beoordeelde commit-SHA en een consistente GitHub PR-/reviewlink. Een `COMMENTED`, `CHANGES_REQUESTED`, zelfreview, onjuiste reviewidentiteit of historische commit wordt niet als toepasselijke onafhankelijke goedkeuring meegeteld. Het resultaat blijft in **alle** gevallen `decision: HOLD`, `publication: DENY` en `release_approved: false`.

Gebruik uitsluitend als diagnostiek met een vooraf onafhankelijk opgehaalde JSON-reviewlijst:
```sh
node atelier/github-review-audit.cjs reviews.json <VOLLEDIGE_40_HEX_SHA> 60 <PR_AUTEUR_LOGIN>
```

**Waarneming via de verbonden GitHub-reviewlijst:** PR #60 had op het observatiemoment **0 ingediende reviews**. Daarom bestaat er geen verifieerbare onafhankelijke review om als vrijgavebewijs op te nemen. De vijf nieuwe tests [github-review-audit.test.cjs](github-review-audit.test.cjs) behandelen lege reviewlijsten, exact passende review, eerdere commit, self-review, niet-goedgekeurde toestand, ongeldige URL en ongeldige invoer. Ze zijn toegevoegd aan de bestaande Atelier DRAFT-validationworkflow.

**Vertrouwensgrens:** de audit doet geen netwerkverzoek en een willekeurig lokaal JSON-bestand bewijst **niet** zijn eigen GitHub-herkomst. Alleen een afzonderlijke, actuele API-verificatie kan de reviewfeitelijkheid bevestigen. Geen bevoegdheidsverhoging, merge, EDTR of publieke uitrol. **GO-13 DRAFT / HOLD / DENY**.

## Regiekamer v6.55 — stille wijzigingen in onopgeslagen notities tijdens importlezing (2026-11-22)

Bij de start van een asynchrone DRAFT-import onthoudt de Regiekamer nu naast de persistente bronmomentopname ook de **huidige, eventueel onopgeslagen tekst in de editor**. Meteen nadat het externe bestand is gelezen, vergelijkt zij deze tekst opnieuw. Een programmatische wijziging van `textarea.value` verstuurt niet vanzelf een `input`-event; zonder deze controle kan een eerdere importcontrole dat stille verschil missen. Als de tekst intussen is gewijzigd, volgt een weigering **vóór** het verwerken en voorstellen van de import. De nieuwere tekst blijft zichtbaar, zonder dat de weigering een herstelkopie schrijft. Bij ongewijzigde tekst blijft de normale bevestiging bereikbaar. De tijdelijke notitiemomentopname wordt tevens opgeruimd bij annulering en bij bronconflicten tijdens de leesfase.

Twee Playwright-regressies simuleren een stille editorwijziging en een ongewijzigde onopgeslagen notitie tijdens vertraagde bestandslezing. Een statische contracttest controleert de volgorde notitiemomentopname → file-read → notitievergelijking → importpreview. Het blijft een lokale best-effort beveiliging zonder transactionele opslaggarantie. **DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.56 — ingetrokken en tegenstrijdige GitHub-reviewhistorie (2026-11-22)

De read-only `github-review-audit.cjs` houdt rekening met **opeenvolgende beoordelingen van dezelfde reviewer**. Een eerdere `APPROVED` telt niet langer mee wanneer een nieuwere GitHub-review `CHANGES_REQUESTED`, `DISMISSED`, `COMMENTED` of een goedkeuring voor een andere commit toont. De audit sorteert de beoordelingsvolgorde op controleerbare `submittedAt`/`submitted_at`-tijdstempels. Als bij meerdere reviews de chronologie ontbreekt of gelijk is, worden alle betrokken reviews uit voorzorg gemarkeerd als `ambiguous_review_history` en niet positief geteld. Herhaalde numerieke review-ID's blokkeren alle kopieën met `duplicate_review_id`.

Vijf nieuwe regressies beschermen tegen een ingetrokken goedkeuring, een latere goedkeuring voor een andere SHA, ontbrekende chronologie, dubbele IDs en een daadwerkelijk latere geldige goedkeuring die nog steeds geen releasebevoegdheid krijgt. De bestaande Atelier DRAFT-workflow neemt de tests automatisch mee.

**Bewijsbeperking:** dit is nog steeds een offline audit van aangeleverde metadata. Een lokaal bestand kan geen authenticiteit, volledigheid of actuele GitHub-status aantonen. Een daadwerkelijk ingetrokken review of een niet-aangeleverde nieuwere review kan alleen met een actuele, onafhankelijk opgehaalde reviewlijst worden vastgesteld. Het besluit blijft onder alle omstandigheden **DRAFT / HOLD / DENY**; geen merge, EDTR of publieke uitrol.

## Regiekamer v6.57 — volledigheid en actualiteit GitHub-reviewlijst (2026-11-23)

De read-only `github-review-audit.cjs` beoordeelt nu naast individuele reviews ook de aangeleverde **ophaalmomentopname** (`provenance`). Voor de diagnostische melding `review_list_complete_claim` moeten `pr_number`, `head_sha`, `total_count`, `pagination_complete: true`, `has_next_page: false` en `fetched_at` kloppen met de kandidaat en de lijst. Het ophaalmoment mag niet in de toekomst liggen en mag bij beoordeling niet ouder zijn dan **15 minuten**. Ontbrekende, achterhaalde, onvolledig gepagineerde of aan een andere PR/HEAD gekoppelde momentopnamen krijgen expliciete `review_list_issues`.

**De metadata blijft zelfgerapporteerde invoer**: zelfs wanneer alle velden plausibel zijn, staat `evidence_usable` op `false`, `decision` op `HOLD` en `publication` op `DENY`. Dit verhindert dat een gemanipuleerd of onvolledig lokaal JSON-bestand als door GitHub geauthenticeerd bewijs wordt aangemerkt. Een onafhankelijk opgehaalde volledige API-response en actuele reviewverificatie blijven vereist.

Vijf nieuwe regressietests controleren ontbrekende herkomst, onvolledige paginering en aantallen, oude/toekomstige tijden, verkeerde PR/HEAD en ogenschijnlijk correcte maar niet-geauthenticeerde metadata. De bestaande Atelier DRAFT-validatieworkflow voert deze tests mee uit; uitvoering op de nieuwe commit wordt afzonderlijk gecontroleerd. Geen merge, EDTR, bevoegdheid of publieke uitrol. **GO-13 DRAFT / HOLD / DENY**.

## Regiekamer v6.58 — ingetrokken importbevestiging mag nooit alsnog schrijven (2026-11-23)

Een import kan ongeldig worden tijdens het bevestigingsvenster, bijvoorbeeld door een nieuwe bestandskeuze of een geannuleerde bestandsselectie. Na een bevestigend antwoord controleert de Regiekamer nu opnieuw of het actuele `importRevision` nog overeenkomt met de revisie waarvoor het DRAFT-project werd bekeken. Is het verzoek ingetrokken of vervangen, dan stopt de oude import vóór de herstelactie; de bijbehorende herstelkopie wordt niet aangemaakt en reeds bestaande creatieve ontwerpgegevens blijven staan. De eerdere bescherming tegen wijzigingen in de editor tijdens bevestiging blijft actief.

Twee Playwright-regressies bootsen een annulering tijdens de bevestiging na, met een lege editor en met een eerder bewaarde lokale notitie. Een statisch contract bewaakt de volgorde bevestiging → revisiecontrole → herstelactie. Deze beveiliging is browserlokaal, best-effort en verleent geen extra autorisatie. Nieuwe CI moet op deze HEAD nog worden gecontroleerd. **DRAFT/HOLD/DENY**, geen merge, EDTR of publieke uitrol.

## Regiekamer v6.59 — GitHub API-reviewverzameling (2026-11-23)

De nieuwe read-only module [github-review-collector.cjs](github-review-collector.cjs) haalt tijdens een pull-requestworkflow de PR-gegevens en reviews rechtstreeks op via de GitHub REST API. De API-aanroepen zijn uitsluitend **GET** en de workflow heeft `contents: read` en `pull-requests: read`. De verzamelaar volgt reviewpagina's van maximaal 100 items, weigert ongeldige antwoorden, geeft een afgebroken of onvolledig pagineringstraject nooit uit als volledig, en controleert de PR-head nogmaals na de verzameling. Een tussentijds gewijzigde head resulteert in een fout in plaats van verouderd bewijs.

Vijf tests in [github-review-collector.test.cjs](github-review-collector.test.cjs) controleren lege reviewlijsten, paginering, gelijktijdig veranderende PR-head, ongeldige API-respons en de maximale pagineringsgrens. De tests draaien samen met de bestaande read-only reviewaudit in Atelier DRAFT validation. De nieuwe workflowstap `Observe current GitHub PR review history without publication` gebruikt alleen een kortlevend GitHub Actions-token, werkt uitsluitend op `pull_request` en kan bij API-storingen als niet-blokkerende diagnose falen: **die fout kan nooit als approval worden verwerkt**.

De observatie is gebonden aan de API-respons uit die workflow, maar geeft geen blijvende authenticiteitsgarantie voor gekopieerde JSON. De collector geeft uitsluitend aantallen, kandidaat-SHA en HOLD/DENY-status weer; geen access token, volledige reviewerslijst, persoonsgegevens of nieuwe publicatie. GitHub-reviewstatus en formeel bevoegd GO-13-besluit blijven aparte controles. **GO-13 DRAFT/HOLD/DENY**; geen merge, EDTR of publieke uitrol.
