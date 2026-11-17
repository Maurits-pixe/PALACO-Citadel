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
