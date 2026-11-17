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
