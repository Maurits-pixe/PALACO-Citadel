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
