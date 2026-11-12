# CITADEL-READING-UI-001 — Leeskompas-integratiecontract

**Status:** DRAFT / HOLD. Geen site-deployment, geen gebruikerstest en geen autorisatie.

## Scope

De eigenaar-privé Citadel bevat vijf regio's. Deze bouwbijdrage levert zestien geïsoleerde TypeScript-modules:

- `reading-state.ts`: bewaarbeleid en opslagfouten afschermen.
- `reading-ui.ts`: zichtbare tekst en gebruikersgestuurde acties zonder browserafhankelijkheden.
- `reading-chapter.ts`: versiegebonden hoofdstukbladwijzers, gevalideerd met de werkelijke hoofdstuk-ID's van de site.
- `reading-routes.ts`: vertrouwd routemanifest, hoofdstuk-allowlist en veilige hervatbestemmingen zonder automatische navigatie.
- `reading-region-bridge.ts`: expliciete, controleerbare vertaling tussen oudere Leeskompas-regio-ID's en de nieuwe canonieke ID's.
- `reading-navigation.ts`: gebruikersgestuurde, toegangsafhankelijke navigatieoverdracht met focusresultaat.
- `reading-epoch.ts`: lokale aanvraagcoördinator die oudere hervataanvragen ongeldig maakt.
- `reading-controller.ts`: integreert de aanvraagcoördinator met de navigatieadapter en de levenscyclus van de lezer.
- `reading-lifecycle.ts`: verbindt expliciete UI-levenscyclusgebeurtenissen en bevestigd wissen aan het afbreken van lopende hervataanvragen.
- `reading-presenter.ts`: presenteert mobiele hervatstatus, toegankelijke meldingen en laat late antwoorden vervallen.
- `reading-dom.ts`: optionele, host-gekoppelde DOM-uitvoer en gecontroleerde focus op bestaande hoofdstuk- of regiokoppen.
- `reading-route-port.ts`: host-gekoppelde navigatiepoort die daadwerkelijke route-rendering en juiste regiocontainer verifieert vóór focus.
- `reading-mount.ts`: één gecontroleerd montagepunt voor bestaande opslag, router, Leeskompas-elementen en presentatieadapter.
- `reading-manifest-gate.ts`: fail-closed toelating van een compleet, uniek en geldig vijfregiomanifest voordat een leesweergave kan worden gemonteerd.
- `reading-preflight.ts`: read-only beoordeling van manifest, lokale toestemming en mogelijke hervatbestemming zonder autorisatie.
- `reading-admin.ts`: privacy-minimalistisch, read-only beheerbeeld met generieke statuscontroles en vaste HOLD-vrijgave.

Het contract is uitsluitend voor **presentatievoortgang**. Het is geen PALACO ONE-identiteit, Citadel-toegangscontrole, ERA/EDTR-bewijs, watermerk, consensus of uitvoeringsmandaat.

## Aansluiten in de bestaande site

1. Laat de huidige Citadel-site en de vijf regiopagina's de bron van waarheid voor routes en toegangsrechten blijven.
2. Maak pas in de browser een lokale `StoragePort` aan, bijvoorbeeld een adapter rond `localStorage`, binnen een try/catch. Geef geen gedeelde browser-storage door aan onbetrouwbare frames.
3. Toon `readingView(storage)` zonder bij pagina-initialisatie enige save/enable-functie te gebruiken.
4. Verbind de knop **Leesplek onthouden** alleen met `requestEnableMemory(storage)` bij een expliciete klik. Toon `message` uit het resultaat.
5. Roep `recordChapterSelection(storage, regionId)` uitsluitend aan na een bewuste hoofdstukselectie. Gebruik nooit automatische scroll- of hydration-events om de bewaarde positie te vervangen.
6. Laat **Verder lezen** `resolveResumeTarget(storage, manifest)` gebruiken. Het vertrouwde manifest moet worden afgeleid uit de gecontroleerde huidige frontend-routes en hoofdstukkoppen. Bij een onbekend hoofdstuk wordt uitsluitend op een bekende regio teruggevallen; de router moet altijd toegang controleren voordat hij navigeert of de focus verplaatst. De hoofdstukregistratie mag nooit afkomstig zijn uit de URL of geïmporteerde JSON.
6a. Roep `recordChapterBookmark(storage, registry, {region, chapterId})` alleen aan na een uitdrukkelijke hoofdstukselectie. Bestaande regio-bladwijzers worden niet stilzwijgend gemigreerd.
7. Vraag bevestiging voor **Wis leesplekken**. Geef alleen daarna `requestClearMemory(storage, true)` door. De wisactie verwijdert toestemming, regiopositie én hoofdstukpositie.
8. Toon de status `unavailable` als de browser lokale opslag blokkeert. Meld niet dat gegevens gewist of opgeslagen zijn als de opslagoperatie geen succes teruggeeft.
9. Verhoog pas bij site-integratie de bestaande serviceworker-cacheversie. Cache geen persoonlijke posities of sessies.
10. Laat de rondreisgeschiedenis, officiële registers en alle bestaande access gates onaangeroerd.

## Bewust buiten scope

Geen serverupload, cookies, telemetrie, profielkoppeling, PP-nummer, documentuitgifte, bewijsverificatie, loginautorisatie, openbare publicatie of automatische migratie van legacy opslag.

## Open reviewvragen

- Of de bestaande site dezelfde vijf regio-ID's gebruikt; zo niet een expliciete een-op-een mapping vastleggen.
- Hoe de bestaande site hoofdstukken binnen een regio identificeert; pas na verificatie daarvan kan een vertrouwde `ChapterRegistry` worden aangesloten. De nieuwe module bewaart het hoofdstuk-ID, niet de scrollpositie.
- Of locale opslag in de bestaande site elders met andere sleutels is geïmplementeerd; voorkom dubbele toestanden.
- Browser en mobiel focusgedrag na navigatie moeten door de eigenaar later worden geobserveerd.

## Acceptatie

Alle wijzigingen blijven DRAFT / HOLD totdat de integratie beoordeeld is. Geen PASS-claim zonder gebruikerstests en verifieerbaar bewijs.

## Compatibiliteit en grenzen hoofdstukbladwijzers

- Bestaande regio-bladwijzers (`v1`) blijven ongemoeid totdat de gebruiker expliciet een nieuw hoofdstuk kiest.
- Nieuwe hoofdstukbladwijzers gebruiken een apart `v2`-sleutelveld; onbekende hoofdstuk-ID's worden genegeerd.
- Een onbekende of niet langer aanwezige hoofdstuk-ID geeft geen hervatbestemming; de integrator kan daarna een bestaande regio-bladwijzer aanbieden.
- Opslagbevestiging gebeurt via direct teruglezen. Bij opslagfalen is er geen succesmelding.
- De UI mag het hoofdstuk-ID uitsluitend tegen de eigen actuele DOM/routeconfiguratie toetsen. Een externe link, parameter of JSON-import is geen autoritatieve registratie.
- Geen automatische test of sitepublicatie uitgevoerd; DRAFT en HOLD blijven gehandhaafd.

## Nieuwe routeresolutie — CITADEL-READING-ROUTES-001

- De ontwikkelaar levert een vaste `SiteRouteManifest` met per regio een root-relatief pad, hoofdstuk-ID en zichtbare hoofdstuktitel.
- `chapterRegistryFromManifest(manifest)` leidt een hoofdstuk-allowlist af en sluit dubbele IDs binnen een regio uit.
- `resolveResumeTarget(storage, manifest)` retourneert een doel met `kind: chapter | region | none`.
- De resolver voert zelf **geen** routing, scroll, focusverplaatsing, externe requests of authenticatie uit.
- Routepaden moeten door de integrator uit eigen, vertrouwde Citadel-code komen; niet uit localStorage, queryparameters, imports of formulieren.
- De echte routepaden en hoofdstuk-ID's zijn **nog niet** uit de Sites-bron geverifieerd. Vul dus geen vermoedelijke slugs in en claim geen actieve website-integratie.

## Regio-ID-koppeling — CITADEL-REGION-BRIDGE-001

De voorgestelde mapping is **geen runtime-waarneming** van de momenteel gepubliceerde Sites-bron. Controleer alle waarden tegen de bestaande `data-region`-attributen en de actuele routes voordat de module wordt gekoppeld:

| Leeskompas-ID | Interne regio-ID |
| --- | --- |
| `samenleving` | `samenleving-natuur` |
| `geheugen` | `geheugen-tijd` |
| `proof` | `proof-bewijs` |
| `atelier` | `atelier` |
| `eva` | `eva` |

Gebruik `toCanonicalRegion(id)` uitsluitend voor het normaliseren van vertrouwde regiogegevens. `createCanonicalManifest(entries)` accepteert alleen bekende unieke regio's en verschillende opgegeven paden. **De retourwaarde is geen autorisatie**; `chapterRegistryFromManifest` valideert de paden en hoofdstukken afzonderlijk en de router moet nogmaals toegangscontrole uitvoeren.

De adapter is niet automatisch verbonden met de reeds bestaande localStorage-sleutels van de Sites-code. Er is nadrukkelijk **geen migratie** gedaan: dit voorkomt dat het toevoegen van een module oude leesplekken of toestemming overschrijft.

### Integratieblokkades

1. De werkelijke actuele Sites-bron, bestaande opslaglogica en regio-/hoofdstuk-ID's moeten naast dit manifest worden gelegd.
2. Bij afwijkende regio-ID's wordt het contract aangepast op basis van die bron; niet door onbekende waarden blind te accepteren.
3. De bestaande private toegang en ERA/EDTR/ONE-beveiliging blijven ongewijzigd.
4. De eigenaar voert functionele en mobiele acceptatietests pas uit wanneer de frontend-integratie expliciet ter beoordeling wordt aangeboden.

## Route-hardening — CITADEL-ROUTE-GATE-002

Een regio-entry wordt voortaan **geheel geweigerd** zodra pad of hoofdstuklijst ongeldig blijkt. Dit geldt bij het opbouwen van het manifest én bij het kiezen van een hervatbestemming. De toelatingsvoorwaarden zijn:

- Een root-relatief Citadel-pad zonder URL-schema, query, fragment, procentcodering, dot-segment of backslash.
- Maximaal 256 hoofdstukken per regio, ieder met een unieke ASCII-hoofdstuk-ID van maximaal 96 tekens.
- Een niet-lege hoofdstuktitel van maximaal 120 tekens zonder controlekarakters.
- Geen dubbele regio's of identieke paden binnen de aangeleverde regioverzameling.
- Ongeldige regio's leveren geen hoofdstuk- of regiohervatting op; er wordt geen alternatieve URL bedacht.

**Reviewgrens:** dit is statische bronverharding in een concept-PR. De werkelijke Sites-routes zijn niet ingelezen, er is niet gemerged, en er zijn geen functionele of mobiele tests uitgevoerd. De site-autorisatie blijft buiten deze presentatiemodule en moet onafhankelijk worden uitgevoerd.

## CITADEL-READING-CONSISTENCY-003 — Voorrang en gedeeltelijke opslag

De volgende invarianten gelden voor expliciete acties:

1. Een expliciete regiokeuze verwijdert eerst een mogelijk verouderde v2-hoofdstukbladwijzer, vóór het bewaren van de nieuwe v1-regio. Als het wissen mislukt, meldt de opslagfunctie geen succes.
2. Een expliciete hoofdstukkeuze wordt vóór elke wijziging tegen het vertrouwde hoofdstukregister gevalideerd.
3. Bij een geldige hoofdstukkeuze wordt eerst de regio opgeslagen (waarbij v2 wordt gewist), en daarna de nieuwe v2-bladwijzer. Zo kan de vorige hoofdstukbladwijzer niet ten onrechte voorrang blijven houden.
4. Bij een gedeeltelijke opslag meldt de interface apart dat de regio is opgeslagen maar het hoofdstuk niet. Het is geen atomaire opslagtransactie; de integrator mag geen volledige bladwijzer claimen zonder bevestiging.
5. Paginastart, hydration en automatische scroll-events voeren nooit een schrijfactie uit; alle wijzigingen vereisen een bewuste gebruikeractie.

**Reviewstatus:** DRAFT / HOLD. Geen test-PASS, merge of Sites-publicatie. De werkelijke website-integratie en acceptatie blijven open.

## CITADEL-READING-NAVIGATION-001 — veilige navigatieoverdracht

De frontend kan vanuit een **expliciete** klik op `Verder lezen` de methode `openSavedReadingPlace(storage, manifest, port)` aanroepen. De host moet een `NavigationPort` aanbieden met:

1. `canOpen(target)`: een verplichte, zelfstandige toegangsbeslissing op basis van de werkelijke Citadel-sessie, niet op basis van het bookmark of het manifest alleen. Bij weigering of fout: geen navigatie.
2. `navigate(path)`: de bestaande router opent uitsluitend het eerder gevalideerde lokale pad en bevestigt voltooiing.
3. `focusChapter(id)`: pas na succesvolle navigatie wordt de bestaande hoofdstukkop opgezocht en van keyboardfocus voorzien. De router moet een eigen DOM-allowlist hanteren; de waarde is nooit een CSS-selector of URL.
4. `focusRegion()`: alternatief wanneer alleen de regio werd onthouden.

De adapter rapporteert `no-bookmark`, `blocked`, `navigation-failed`, `focus-failed` of `opened`. Een mislukte toegangscontrole leidt niet tot een andere bestemming; een focusfout wordt niet als volledig geslaagd gemeld. Deze module neemt geen eigen security-besluit, gebruikt geen browserglobale variabelen en verandert geen lokaal opgeslagen persoonsgegevens.

**Aanvullende integratievoorwaarde:** de host dient sessieveranderingen tijdens asynchrone navigatie zelf opnieuw te toetsen. De adapter is geen vervanging voor route-guards, server-side autorisatie, CSP of toegangsbeleid. De huidige Sites-frontend is nog niet gekoppeld en niet op mobiel getest. Status blijft DRAFT / HOLD.

## CITADEL-READING-SESSION-GATE-002 — sessie en gelijktijdige tikken

De `NavigationPort` verlangt nu ook `isCurrent()`. De eigenaar-frontend moet dit koppelen aan een aanvraag- en sessiegeneratie; **niet** aan alleen de URL of de aanwezigheid van een cookie. `openSavedReadingPlace` controleert het token vóór en na asynchrone stappen en verifieert `canOpen` opnieuw ná de navigatie maar vóór focusverplaatsing. Nieuwe resultaatstatus: `stale`.

De optionele helper `createResumeRequestCoordinator()` geeft per bewuste tik een nieuwe `ResumeRequest`. De volgende tik maakt vorige verzoeken ongeldig. Roep `invalidateAll()` aan bij logout, routewissel, wisseling van identiteit/toegangsrechten, sluiten van de lezer of het wissen van leesplekken. Elke `NavigationPort.isCurrent` dient zowel dit verzoek als de actuele geauthenticeerde sessie te controleren. Een verlopen aanvraag mag niet alsnog focus of een successtatus krijgen.

**Belangrijke grens:** een al gestart `navigate()`-effect kan hiermee niet teruggedraaid worden. De host-router moet zelf vóór én tijdens het wijzigen van een beschermde route autorisatie afdwingen en waar nodig annulering ondersteunen. De adapter is geen beveiligingsgrens op zichzelf. Geen tests, merge of Sites-publicatie in deze ronde; DRAFT/HOLD blijft gehandhaafd.

## CITADEL-READING-CONTROLLER-001 — levenscycluskoppeling

`createReadingController(store, manifest, navigationPort)` retourneert `resume()`, `invalidate()` en `dispose()`. De frontend mag `resume()` uitsluitend starten naar aanleiding van een expliciete klik/tik op de knop Verder lezen. Een nieuwe aanvraag maakt de vorige ongeldig; oude resultaten worden geen succesmeldingen.

**Verplichte hostverbindingen:**

- `navigationPort.isCurrent()` controleert de daadwerkelijke huidige sessie én routecontext en faalt gesloten bij onzekerheid.
- `navigationPort.canOpen(target)` levert de echte toegangstoets, vóór en na navigatie.
- `navigationPort.navigate(path)` moet zélf de routeguard en eventuele annulering bij sessiewissel afdwingen; de controller draait een reeds begonnen routereffect niet terug.
- `navigationPort.focusChapter(id)` en `focusRegion()` verplaatsen focus alleen na bevestigde navigatie en herbevestigde toegang. Het hoofdstuk-ID is geen CSS-selector.
- Na uitloggen, sessie-/routewissel, leesgegevens wissen, of het sluiten van het Leeskompas: `controller.invalidate()`. Bij definitief verwijderen van de component: `controller.dispose()`.

**Niet geleverd:** koppeling met de huidige Sites-runtime, DOM-implementatie, live autorisatie, deploy, functionele tests. De code is een voorstel voor integratie op een DRAFT-branch. GO-13/HOLD blijft gehandhaafd.

## CITADEL-READING-LIFECYCLE-001 — frontend-gebeurtenissen

De integrator maakt **per actuele lezerweergave** één instantie via `createReadingLifecycle(storage, manifest, navigationPort)`. De integrator moet vervolgens onderstaande contracten afdwingen:

| Hostgebeurtenis | Verplichte actie vóór effect |
| --- | --- |
| Klik/tik op Verder lezen | `resumeFromClick()` alleen op directe gebruikersinteractie |
| Uitloggen | `beforeChange('logout')` vóór logout/route-effect |
| Sessie gewijzigd | `beforeChange('session-changed')` vóór vervanging van sessiecontext |
| Rechten gewijzigd | `beforeChange('permissions-changed')` vóór vervangen van toegangscontext |
| Route vervangen | `beforeChange('route-replaced')` vóór de router van route verandert |
| Lezer sluiten | `beforeChange('reader-closed')`; de instantie kan daarna niet meer hervatten |
| Leesplekken wissen | Bevestiging tonen en daarna `clearReadingMemoryAfterConfirmation(true)` aanroepen |
| Lezer ontkoppeld | `dispose()` oproepen en alle callbacks opruimen |

Bij niet-bevestigd wissen retourneert `clearReadingMemoryAfterConfirmation(false)` uitsluitend de geannuleerde actie zonder lopende navigatieaanvragen te wijzigen. Bij bevestigd wissen wordt de lopende aanvraag vóór de opslagwijziging ongeldig gemaakt.

**Veiligheidsgrens:** deze module registreert geen browser-events en is niet gekoppeld aan de actuele ChatGPT Sites-frontend. De host moet lifecycle-events daadwerkelijk verbinden en toegang afdwingen in de router/backend. Een al lopend `navigate()`-effect kan niet uitsluitend door request-invalidation worden teruggedraaid. De echte frontendbron en hoofdstukroutes moeten vóór integratie gecontroleerd worden. Geen merge, tests, site-deploy of autorisatie; **DRAFT / HOLD**.

## CITADEL-READING-PRESENTER-001 — mobiele status en toegankelijkheid

De host initialiseert per zichtbare Leeskompas-weergave `createReadingPresenter(storage, trustedManifest, navigationPort, presentationPort)`. De presenter maakt alleen **gegevens voor UI-uitvoer**; hij wijzigt geen HTML, stuurt geen netwerkverzoeken en geeft geen autorisatie.

### Verplichte frontend-verbinding

- Alleen een expliciete klik of tik op de hervatknop roept `onResumeClick()` aan. Tijdens de aanvraag toont `presentation.render` de toestand `busy`; de host kan de knop tijdelijk als bezet markeren.
- De host toont `kind`, `message` en `view` via tekstinhoud, **niet** via `innerHTML` of een uit een bookmark samengestelde URL.
- `presentation.announce` gebruikt een vooraf bestaand, onopvallend `aria-live=polite`-statusgebied. Het mag geen modal, onverwachte focusverplaatsing of alarmvenster veroorzaken.
- De echte hoofdstukfocus volgt uitsluitend na succesvolle, opnieuw geautoriseerde navigatie via `NavigationPort.focusChapter`. De presenter verricht zelf geen focusoperatie.
- Bij route-, sessie- en rechtenwijzigingen roept de host eerst `beforeChange(...)` aan. Bij sluiting `beforeChange('reader-closed')`, daarna `dispose()` bij vernietiging van de component.
- Na expliciete bevestiging van wissen roept de host `onClearConfirmed()` aan; de presenter meldt opslagfouten zonder een succesvolle verwijdering te suggereren.
- Een late reactie van een eerder verzoek krijgt geen nieuwe zichtbare of gesproken status. Ontkoppelde componenten leveren geen meldingen meer.

### Responsieve vormgeving (integratievereisten)

- Aanraakvlakken: streef naar ten minste 44 × 44 CSS-pixels waar de vormgeving dit toelaat.
- Bedienbare elementen blijven met toetsenbord bereikbaar, met duidelijke zichtbare focus.
- De host voorkomt dat lange regio- of hoofdstuknamen buiten het mobiele scherm vallen.
- Houd systeeminstellingen voor verminderde animatie (`prefers-reduced-motion`) aan.
- Leesstatus is niet uitsluitend afhankelijk van kleur; toon korte Nederlandse teksten.

**Status:** Dit is nog géén uitgevoerde mobiele acceptatietest en géén wijziging aan de live Citadel-site. De bestaande private toegang, routerautorisatie en HOLD blijven onveranderd.

## CITADEL-READING-DOM-001 — concrete frontend-adapter (nog niet aangesloten)

De bestaande Citadel-frontend moet vier eigen elementen leveren aan `createReadingDomPresentation({ resumeButton, statusText, liveStatus, memoryText })`. De adapter schrijft uitsluitend `textContent`, zet de `disabled`-status van de hervatknop, `aria-busy` en een vaste statusindicator. Hij maakt geen HTML aan, installeert geen listeners en accepteert geen bestemmings-URL uit opslag. Het host-element `liveStatus` moet vooraf `aria-live="polite"` of `role="status"` bezitten; gebruik een afzonderlijk zichtbaar statuselement om dubbele aankondigingen te beperken.

De door de host na autorisatie en geslaagde navigatie aan te roepen helpers zijn:

- `focusTrustedChapter(routeContainer, chapterId)`: zoekt alleen bestaande H1-H6-koppen binnen de vertrouwde routecontainer en vergelijkt de ID als ruwe string, zonder een door de bladwijzer samengestelde CSS-selector. Onbekende of dubbel aanwezige ID's geven `false`.
- `focusTrustedRegion(routeContainer)`: gebruikt alleen de vooraf aanwezige H1-kop met `data-citadel-region-heading` in de vertrouwde regiocontainer.
- De helpers zetten indien nodig `tabindex=-1`, proberen keyboardfocus en melden alleen succes als de bedoelde kop daadwerkelijk de actieve focus bezit. Ze nemen geen route- of autorisatiebeslissing.

**Aansluitvolgorde:** controleer eerst de bestaande Sites-DOM-structuur en hoofdstuk-ID's; koppel daarna de echte router en toegangsguards aan `NavigationPort`; maak pas daarna de presenter en DOM-adapter aan in de actuele lezerweergave. De host registreert de klik/tik-events en roept op uitloggen, routewissel of ontkoppeling de levenscyclusfuncties aan. Houd rekening met CSS-aanraakvlakken van circa 44×44px, zichtbare focus en `prefers-reduced-motion`.

Er zijn nog **geen** functionele, browser-, mobiele of toegankelijkheidstests uitgevoerd en deze module is niet op de privéwebsite ingezet. DRAFT/HOLD blijft gehandhaafd.

## CITADEL-READING-FOCUS-GATE-002 — zichtbare hoofdstukfocus

De optionele DOM-focushelpers controleren nu bij iedere expliciete hervatactie of de vertrouwde routecontainer en de bedoelde kop nog aan het document zijn gekoppeld. Koppen binnen verborgen of inactieve voorouders (inclusief `hidden`, `inert`, `aria-hidden=true`, `display:none` en `visibility:hidden/collapse`) worden niet gefocust. De kop moet een zichtbare layoutbox hebben. Er is uitsluitend focus naar **één** bestaande hoofdstuk- of regiokop mogelijk; dubbele ID's en meerdere gemarkeerde regiokoppen zijn ambigu en worden geweigerd.

Een door de focushelper tijdelijk toegevoegd `tabindex=-1` wordt bij mislukte focus hersteld. Bij een geslaagde focus blijft het attribuut staan om toetsenbordnavigatie en ondersteunende technologie niet abrupt te verstoren. De host-router blijft eigenaar van toegangscontrole, routewisselingen en het wachten totdat de juiste regio volledig is gerenderd.

**Open reviewpunt:** de daadwerkelijke Sites-DOM-structuur, eventuele overlays en mobiele schermlezer-interactie zijn nog niet in de originele site gecontroleerd. Geen tests of deployment uitgevoerd; DRAFT/HOLD blijft gelden.

## CITADEL-READING-ROUTE-PORT-001 — rendergereedheid vóór focus

`createRenderedRoutePort(host)` verbindt een bestaande, door de site beveiligde router met de eerder gebouwde `NavigationPort`. Het contract `RenderedRouteHost` verlangt:

- `isCurrent()`: onafhankelijke status van de actuele sessie/aanvraag. Bij false/exception weigert de poort verdere focus.
- `canOpen(target)`: echte toegangstoets uit Citadel, vóór en na de routerovergang via de bestaande navigatieadapter.
- `navigateAndRender(path)`: navigeren **en** pas true teruggeven wanneer de juiste geautoriseerde route klaar is. Dit is een hosttaak; de poort gebruikt geen polls, timers of giswerk.
- `activePath()`: werkelijk actief pad uit de gecontroleerde router, niet uit een opgeslagen bookmark.
- `renderedContainer(path)`: de actuele verbonden regio- of hoofdstukcontainer uit de eigen frontend. Nooit zoeken vanaf `document.body` of via een door gebruikersinvoer samengestelde selector.

De focushelpers worden pas aangeroepen als alle bovenstaande voorwaarden opnieuw slagen. Een pad dat wel bestaat maar nog geen gereed gerenderde container heeft, geeft geen navigatiesucces. De router moet sessie-/routewisselingen en in-flight navigatie zelfstandig kunnen blokkeren; deze poort implementeert **geen** beveiliging van de onderliggende route.

**Integratiestatus:** code in GitHub DRAFT-PR, nog niet verbonden met de originele Citadel Sites-router of zijn werkelijke DOM. De eigenaar voert mobiele en functionele tests later uit. Geen merge, productiepublicatie of autorisatie; **HOLD**.

## CITADEL-READING-ROUTE-EPOCH-002 — overlappende navigaties

De gerenderde-routepoort houdt een **eigen monotone navigatierevisie** bij. Elke nieuwe `navigate(path)` maakt de voorgaande routeaanvraag en de eerder toegestane focusbestemming ongeldig. De host ontvangt nu bij `navigateAndRender(path, isRequestCurrent)` een verzoekgebonden controlefunctie en moet deze **vóór elke routerwijziging en na elke asynchrone stap** raadplegen.

Een eerdere routeaanvraag die te laat gereed komt, mag de bestemming niet opnieuw instellen en mag geen focus geven. Alleen als het verzoek nog actueel is, het renderen bevestigd is, de actuele router exact hetzelfde pad rapporteert en de verbonden routecontainer bestaat, wordt de bestemming vrijgegeven. Bij een uitzondering of een gewijzigde sessie wordt de operatie geweigerd.

**Beperking:** de adapter kan op zichzelf geen reeds uitgevoerde routermutatie ongedaan maken. Daarom is de controlefunctie in de host-router vereist; de host behoudt bovendien zijn eigen toegangsguards. Deze signature-wijziging moet door de integrator worden verwerkt bij het aansluiten op de originele Citadel Sites-code. DRAFT/HOLD; geen functionele tests, merge of websitepublicatie.

## CITADEL-READING-MOUNT-001 — één integratiepunt

`mountReadingCompass({ storage, manifest, router, elements })` koppelt **uitsluitend na reeds vastgestelde private toegang** de bestaande bouwblokken: `createRenderedRoutePort`, `createReadingDomPresentation` en `createReadingPresenter`. De host moet de echte `ReadingDomElements`, de vertrouwde routes en hoofdstuk-ID's, en een geautoriseerde `RenderedRouteHost` leveren. Dit is geen PALACO ONE-login of nieuwe Citadel-toegangscontrole.

De koppeling registreert precies één click-listener op de aangeleverde hervatknop; er wordt geen automatische hervatting tijdens mount gestart en geen toestemming gegeven of leesplek opgeslagen. De teruggegeven interface biedt `beforeChange(change)`, `clearAfterConfirmation()` en `dispose()`. De host moet de eerste functie aanroepen vóór uitloggen, sessie- of rechtenwijziging en routevervanging; bij het sluiten van de lezer moet hij `beforeChange('reader-closed')` gevolgd door `dispose()` gebruiken. De integrator mag `clearAfterConfirmation()` uitsluitend vanuit een reeds bevestigde wisactie aanroepen. `dispose()` verwijdert de eventlistener en maakt lopende opdrachten ongeldig.

De montage mag maar eenmaal tegelijk per Leeskompas-weergave gebeuren. Dubbele montage kan anders dubbele eventlisteners en dubbele navigatieaanvragen opleveren; de host bezit de componentlevenscyclus. Bij routereffecten blijft onafhankelijke autorisatie én bewaking van de actuele aanvraag verplicht. De werkelijke ChatGPT Sites-code is nog niet aan deze adapter gekoppeld.

**Reviewstatus:** DRAFT/HOLD. Geen functionele tests, mobiele acceptatie, merge of live publicatie uitgevoerd.

## CITADEL-READING-MOUNT-GUARD-002 — dubbele montage voorkomen

`mountReadingCompass` reserveert voortaan de reeds door de host aangeleverde hervatknop in een module-lokale `WeakSet`. Een tweede gelijktijdige montage op dezelfde knop faalt onmiddellijk met `CITADEL_READING_ALREADY_MOUNTED`; er wordt geen tweede kliklistener geregistreerd of extra presenter gecreëerd. De registratie wordt bij `dispose()` vrijgegeven, ook als het opruimen van de presenter zelf een fout veroorzaakt. Bij falende initialisatie wordt de reservering eveneens vrijgegeven.

De host moet de montagefout behandelen als een integratieprobleem en de bestaande, al gemonteerde instantie in stand laten. Een nieuwe montage is alleen toegestaan nadat de vorige is ontkoppeld. Deze bewaking geldt per geladen module-instantie; zij vervangt geen componentlevenscyclusbeheer door de host en beschermt niet tegen dubbel ingeladen kopieën van dezelfde bundel.

**Status:** uitsluitend een wijziging in de GitHub DRAFT-PR. Geen functionele tests, merge of Sites-publicatie. De private frontend en autorisatie blijven HOLD.

## CITADEL-READING-MANIFEST-GATE-001 — toelating vóór montage

`admitReadingManifest(manifest)` controleert statisch of het door de host aangeleverde manifest precies de vijf bekende Citadel-regio's bevat. De toelating weigert onbekende of ontbrekende regio's, onveilige of onvolledige routes, lege hoofdstukverzamelingen, dubbelzinnige hoofdstukgegevens en dubbele paden tussen regio's. Zij geeft `ok: true` of een reden `missing-manifest`, `unknown-region`, `missing-region`, `invalid-route` of `duplicate-path` terug.

`mountReadingCompass` voert deze controle uit **vóór** de knopreservering, presenterinitialisatie en eventlistenerregistratie. Bij afwijzing werpt de mount een `CITADEL_READING_MANIFEST_REJECTED`-fout op. De bestaande Site moet deze fout zonder privédetails aan de gebruiker kunnen tonen; de oorspronkelijke Citadel-toegangscontrole blijft ongewijzigd en krijgt geen autorisatie van deze check. Het manifest moet zijn samengesteld op basis van geverifieerde werkelijk bestaande frontend-routes, niet op basis van opslag, URL-parameters of fictieve slugs.

**Integratiegrens:** omdat de werkelijke originele Sites-routes en hoofdstukken nog niet in deze PR zijn geverifieerd, is dit een strenge voorbereidende controle; hij bewijst niet dat de huidige privéwebsite hiermee kan worden gemonteerd. Geen functionele tests, merge of deployment uitgevoerd. **DRAFT/HOLD**.

## CITADEL-READING-PREFLIGHT-001 — read-only integratiebeoordeling

`inspectReadingPreflight(storage, manifest)` geeft een statische momentopname van manifesttoelating, lokaal geheugen (`enabled`, `disabled`, `unavailable`), beschikbare hervatbestemming (`chapter`, `region`, `none`) en generieke aandachtspunten. `canOfferResume` betekent uitsluitend dat een lokale hervatbestemming in de gegeven gegevens aanwezig is; **nooit** dat de site toegankelijk, geautoriseerd, aangesloten of getest is.

De functie schrijft geen opslag en geeft geen ruwe persoonsgegevens of opgeslagen inhoud terug. Zij kan vóór een toekomstige integratie voor de beheerweergave worden gebruikt, maar is niet automatisch aangeroepen bij pagina-initialisatie en is niet verbonden met de live site. De bestaande host-router blijft verplicht eigen toegangscontroles uit te voeren.

**Consistentiecorrectie:** een opgeslagen v2-hoofdstukbladwijzer wordt alleen gelezen of geschreven wanneer het hoofdstuk behoort tot dezelfde regio als de actuele, met toestemming bewaarde v1-regiopositie. Bij tegenspraak wordt de hoofdstukbladwijzer genegeerd; de route-resolver kan dan uitsluitend naar een geldige regio terugvallen. Er vindt geen stille migratie plaats.

**Reviewstatus:** GitHub DRAFT / HOLD. Geen functionele tests, merge, live Sites-deploy of autorisatie.

## CITADEL-READING-ADMIN-001 — read-only beheerstatus

`createReadingAdminSnapshot(storage, manifest, evidence)` bouwt een momentopname met zeven controles: manifest, lokale opslag, eventuele hervatmogelijkheid, geverifieerde oorspronkelijke Sites-routes, host-toegangscontrole, daadwerkelijk aangesloten frontend en door de eigenaar uitgevoerde acceptatie. Het beeld geeft alleen **PRESENT**, **HOLD** of **BLOCKED** weer en bevat geen bewaarde hoofdstuk-ID's, routepaden, persoonsgegevens, sessie-identificatoren of ruwe opslagwaarden. `release` blijft in deze module altijd `HOLD`.

`evidence` bevat uitsluitend door de host aangeleverde markeringen `unverified` / `reviewed`; `reviewed` betekent **niet** dat deze module zelfstandig documenten, autorisatie of gebruikersacceptatie heeft geverifieerd. Bewijsverwijzingen en ondertekening moeten via het bestaande, onafhankelijk beoordeelde Citadel/ERA-beheerproces worden geregeld. Dit is uitdrukkelijk **geen** autorisatiepoort.

`renderReadingAdminSnapshot(container,snapshot)` kan het resultaat als statische tekstlijst in een reeds geautoriseerde beheerpagina zetten via `textContent` en DOM-creatie; geen `innerHTML`, verborgen sleutels, navigatie-effecten of opslagwijzigingen. De oorspronkelijke Sites-beheerpagina is nog niet met deze module verbonden. De host moet vóór iedere aanroep onafhankelijk vaststellen dat de gebruiker het beheerbeeld mag zien.

**DRAFT/HOLD:** GitHub-broncode voorbereid; geen uitgevoerde tests, geen merge, geen privatesite-deployment, geen claim van werkelijk gecontroleerde hostintegratie.
