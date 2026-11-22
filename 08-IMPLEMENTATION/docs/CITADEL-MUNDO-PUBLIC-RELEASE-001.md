# MUNDO World Atlas — publicatiepakket v0.1 (DRAFT)

## Publiek bestand
- `08-IMPLEMENTATION/examples/mundo-public/index.html`
- Zelfstandig HTML-document, werkt zonder externe scripts, fonts, API's, cookies en opslagsleutels.
- Bevat uitsluitend de zeven bekende wereldnamen en wereld-ID's, een conceptuele bol, vergelijking, hoofdstukken en schematische lagen.
- Geen feitelijke geografie, eigendomsregister, persoonsgegevens, login, PALACO ONE-sessies, EDTR-uitgiftes of privé-Citadel-data.

## Expliciete scheiding
**Dit is niet de originele L.A. — Citadel Preview.**
Het oorspronkelijke ChatGPT Sites-project `appgprj_6ab7a775b77c81919762aeaabdd5a25c` blijft privé. Er is geen geverifieerde technische koppeling van deze GitHub-ontwikkelbranch naar de bestaande Sites-app. Publicatie van die oorspronkelijke site kan niet op basis van dit document worden geclaimd.

## Publiceer uitsluitend de publieke submap
Voor een externe statische host:
1. Verbind uitsluitend de juiste GitHub-repository en de expliciete ontwikkelbranch met toestemming van de eigenaar.
2. Gebruik `08-IMPLEMENTATION/examples/mundo-public` als **publish directory**. Publiceer niet de root, andere Citadel-modules, gedeelde opslagbestanden of beheerpagina's.
3. Geen omgevingsvariabelen, privésleutels, authenticatietokens of databaseverbindingen toevoegen.
4. Schakel automatische productiepublicatie uit totdat de eigenaar de preview controleert.
5. Controleer na deployment dat de publieke host alleen de demonstratie serveert, geen directory-listing of andere repository-inhoud. De gebruiker voert de functionele acceptatie uit.
6. Een publieke Atlas vereist geen PALACO ONE-login; de échte beschermde Citadel blijft daarvan volledig gescheiden.

## Beperkingen
De publieke pagina is een conceptdemonstratie zonder cartografische data; het woord 'publiek' verleent geen rechten of toegang tot PALACO-werelden. De pagina zelf is in GitHub voorbereid, maar er is **nog geen publieke live URL uitgegeven of geverifieerd**. Geen functionele tests en geen merge uitgevoerd. Citadel PR #58 blijft **DRAFT/HOLD**.

## EXPLORER-004 — Constellatie en ontdekkingspad

De publieke demonstratie op Render heeft een additioneel wereldnavigatiegedeelte:
- Een **constellatie-index** voor de zeven bekende wereldnamen met selecteerbare, duidelijk gemarkeerde wereldknoppen.
- Toetsenbordnavigatie via pijltjestoetsen, Home en End, met focusoverdracht naar de geselecteerde wereldknop.
- Een uitsluitend in het huidige browsergeheugen opgeslagen **ontdekkingspad** met bezochte werelden, een voortgangsindicator en een knop om het pad te wissen.
- Geen cookies, localStorage, accountgegevens of netwerkverzoeken vanuit deze functies.

Dit is een interface voor **ontdekte registervermeldingen**, niet voor echte reisroutes, astronomische coördinaten of geregistreerde bezoeken. Bij herladen wordt het pad gewist. De zeven wereldnamen zijn bekende projectcontext; geografie en eigendom blijven niet geverifieerd.

De originele privé-Citadel Sites-app is niet gewijzigd. De publieke Render-site is onafhankelijk en gebruikt alleen de directory `08-IMPLEMENTATION/examples/mundo-public`, met autoDeploy uit. De DRAFT PR #58 is niet gemerged. Functionele acceptatie blijft bij de eigenaar.

## ATLAS-COCKPIT-005 — navigatie en conceptbolbediening

De publieke Atlas bevat nu een compact, mobiel bruikbaar cockpitmenu met ankerlinks naar Wereldregister, Ontdekkingspad, Wereldprofiel en World Studio. De interactieve illustratie heeft aparte knoppen voor draaien (stappen van 30°), in- en uitzoomen (70–130% in stappen van 10%) en het herstellen van de neutrale positie. Tekstuele hoek- en zoomweergave, toetsenbordbediening, begrijpelijke knopnamen en `prefers-reduced-motion` zijn opgenomen.

De wereldbol is een **artistieke CSS-illustratie**, geen aardeprojectie, geografisch informatie- of navigatiesysteem. Rotatie verandert uitsluitend de afbeeldingshoek; zoom verandert uitsluitend de afbeeldingsgrootte. Er worden geen nieuwe werelden, locaties, plaatsnamen, regio's, rechten, accounts of data gemaakt. Bediening blijft in tabbladgeheugen en wordt niet opgeslagen of verzonden.

De wijziging is onderdeel van de publieke Render-preview op een afzonderlijke statische site, niet van de afgeschermde L.A. Citadel Sites-app. CI/functionele tests zijn niet uitgevoerd; de originele GitHub PR #58 blijft DRAFT/HOLD en is niet gemerged. De Render-deployment is een afzonderlijke, door de eigenaar toegestane demonstratiepublicatie met autoDeploy uit.

## ATLAS-OBSERVATORY-006 — artistieke sfeerbolbediening

De publieke MUNDO World Atlas heeft nu een verfijnde CSS-wereldbol met:
- zeven onderscheidbare, **uitsluitend artistieke** kleurpaletten voor de reeds bekende wereld-ID's;
- illustratieve licht- en diepteschaduw, zonder externe afbeeldingen of scripts;
- handmatige kanteling (−30° tot 30°), lichtinval (15–75%) en de bestaande hoek-/zoomregeling;
- zichtbare tekstwaarden, toetsenbordbedienbare schuifregelaars en een herstelknop die alle illustratie-instellingen terugzet;
- behoud van `prefers-reduced-motion` en responsieve bediening.

**Geen claim van werkelijke 3D-geometrie:** de bol is CSS-vormgeving. Lichtinval en kanteling berekenen geen fysisch accurate baan, topografie, klimaat, coördinaten of astronomische toestand. Er is geen live kaartbron, sessie, persoonsgegeven, tracking, lokale opslag of nieuw PALACO-account aan toegevoegd.

Publicatie betreft uitsluitend de al toegestane openbare demonstratie op Render; de originele L.A. — Citadel Preview blijft privé. GitHub PR #58 blijft DRAFT/HOLD en wordt niet gemerged. Functionele acceptatie door de eigenaar staat nog open.

## ATLAS-LIBRARY-007 — doorzoekbare atlasbibliotheek

De publieke MUNDO-Atlas heeft een expliciet bibliotheekoverzicht met **21 conceptuele hoofdstukvermeldingen**: de zeven bekende werelden × de drie bestaande categorieën Wereldidentiteit, Geografie en Herkomst & bewijs.

De bibliotheek bevat een zoekveld, wereldfilter, hoofdstukfilter, zichtbare resultaatteller en knoppen die de geselecteerde wereld en het hoofdstuk openen in het reeds bestaande World Studio-paneel. De knoppen verplaatsen ook de toetsenbordfocus naar de hoofdstuktitel. De atlasnavigatie bevat een directe ankerlink naar de bibliotheek. Alle data komt uit de bestaande statische lijst en wordt als tekst aan de DOM toegevoegd; er worden geen extra werelden, documenten, rechten, geografie of eigendomsclaims geïntroduceerd.

**Bronstatus en privacy:** alleen wereldnamen/ID's zijn bekende projectcontext; geografische gegevens, lineage-dossiers, EDTR-uitgiftes en eigendom zijn niet gekoppeld of geverifieerd. Zoektermen en filters blijven uitsluitend in browsergeheugen en worden niet opgeslagen of verzonden. Dit is geen live bibliotheekbackend.

De afzonderlijke publieke Render-preview mag handmatig worden bijgewerkt op het al toegestane adres; autoDeploy blijft uit. De echte privé-Citadel Sites-frontend, autorisaties en de DRAFT/HOLD-status van PR #58 blijven ongewijzigd. Geen functionele tests uitgevoerd.

## ATLAS-SOURCE-MATRIX-008 — controleerbare bronstatus per wereld

De openbare Atlas bevat een **bron- en bewijsregister** met zeven wereldregels en vijf expliciet onderscheiden velden: bekende naam/ID uit de lokale projectcontext, geografische bron, herkomst/EDTR, live koppeling en inspectie.

Elke regel heeft een toegankelijke inspectieactie die het gekozen wereldprofiel opent en de ontbrekende voorwaarden toelicht. Alle wereldvermeldingen zijn momenteel gelijk geclassificeerd: naam en ID zijn lokaal bekende projectcontext; geografische gegevens en live MUNDO-bronnen zijn **niet gekoppeld**, herkomst/EDTR is **niet geverifieerd**. Dit is geen uitspraak dat echte externe bronnen niet bestaan: uitsluitend dat ze niet bij deze publieke demonstratie zijn aangesloten.

De bronmatrix gebruikt uitsluitend vaste gegevens, `textContent`, geen externe services, geen opgave van handtekeningen of uitgifte van verificatiebewijzen. Voor echte gegevens moeten bronauthenticiteit, revisies, toegangsbeleid en lineage afzonderlijk worden gecontroleerd door de originele, afgeschermde MUNDO/Citadel-host.

De publieke Render-site mag handmatig bijgewerkt worden; autoDeploy blijft uit. De oorspronkelijke privé-Citadel, PALACO ONE-identiteitslaag en DRAFT/HOLD PR #58 blijven ongewijzigd. Functionele acceptatie door de eigenaar blijft open.

## MUNDO-ATLAS-SOURCE-CONTRACT-009 — toekomstige beschermde bronkoppeling

Er is een zuiver TypeScript-integratiecontract toegevoegd in `08-IMPLEMENTATION/src/citadel/mundo-atlas-source-contract.ts`. Het is **niet opgenomen als uitvoerbaar bronverbindingsscript in de publieke Atlas**.

- `AtlasSourceEnvelope` benoemt schema, wereld-ID, laagtype, bron-ID, revisie, SHA-256-digest, anonieme contextversie en inhoud.
- `hasAtlasSourceShape` controleert uitsluitend het formaat: dit bewijst **geen** herkomst, autorisatie of geldigheid van inhoud.
- `admitAtlasSource` accepteert alleen een passend wereld-ID en laagtype na een expliciete, door de echte Citadel/MUNDO-host aangeleverde `authorizeAndVerify`-controle, een actuele synchrone machtigingscontrole en een stabiele contextversie vóór en na die controles.
- Ongeldige of ontbrekende context, een geweigerde bron, uitzondering of ontbrekende callback leidt tot `denied`. Een intussen gewijzigde context leidt tot `stale`.
- De host moet zelfstandig digest en canonieke inhoud vergelijken, provenance authenticeren, de payload tegen mutatie tijdens verificatie beschermen, een werkelijk actuele rechtenbeslissing nemen en een niet-hergebruikte contextrevisie leveren. Deze taken zijn nadrukkelijk **niet** door dit contract geïmplementeerd.

De openbare MUNDO-pagina heeft nu een verklarend paneel **Toelatingsgrenzen voor nieuwe atlaslagen** met drie principes: bronintegriteit, actuele autorisatie en contextbewaking. Dit paneel biedt geen upload, private endpoint of omweg naar Citadel. Het is geen claim dat bronvalidatie nu daadwerkelijk actief is op de openbare Atlas.

Geen functionele tests, merge, productieautorisaties of wijzigingen aan de originele privé-Sites-app. Het afzonderlijke publieke Render-demonstratiekanaal kan handmatig worden bijgewerkt terwijl GitHub PR #58 **DRAFT/HOLD** blijft.

## MUNDO-ATLAS-LAYER-MODEL-010 — begrensde toekomstige gegevenstypen

Er is een nieuw TypeScript-model: `08-IMPLEMENTATION/src/citadel/mundo-atlas-layer-model.ts`.
- Het geografische laagcontract vraagt een bekende wereld-ID, schema `palaco.mundo.geography.v1`, projectie `EPSG:4326` en maximaal 512 unieke, benoemde kaartpunten met eindige coördinaten (latitude −90…90, longitude −180…180).
- Het bewijsreferentiecontract vraagt schema `palaco.mundo.evidence.v1`, dezelfde bekende wereld-ID en maximaal 128 unieke, onpersoonlijke referenties met citatiecode en SHA-256-digest.
- Beide shape-predicaten controleren alleen **structuur en grenzen**, niet juistheid van geografie, geldigheid van bewijzen, herkomst, rechten of cryptografische echtheid.
- `admitAtlasSource` uit broncontract 009 weigert nu ook verkeerd gevormde of met de envelope strijdige geografische/bewijspayloads vóór aanroep van de vertrouwde host. De host moet de inhoud bij verificatie onveranderlijk behandelen en nadien zelfstandig autoriseren; het model levert geen datasnapshot of cryptografische hashberekening.
- De publieke Atlas bevat nu een apart **Datamodel 010**-overzicht. Dit is uitsluitend verklarende informatie: de site haalt **geen** geografische punten, bewijsdossiers of persoonlijke gegevens op.

Deze ontwikkeling is gescheiden van het oorspronkelijke privé-Sites-project. De publieke Render-preview mag handmatig worden bijgewerkt; autoDeploy blijft uit. Geen functionele tests, merge, identiteitswijzigingen of toegangsvrijgaven uitgevoerd. GitHub PR #58 blijft DRAFT/HOLD.

## MUNDO-RENDER-PROJECTION-011 — toegelaten weergavegegevens

De module `08-IMPLEMENTATION/src/citadel/mundo-atlas-render-projection.ts` levert de functie `prepareAuthorizedAtlasView`. Deze roept het bestaande hostgebonden toelatingscontract aan en accepteert niet zelfstandig een willekeurige bron. Bij weigering of gewijzigde context retourneert de module `denied` of `stale`, **nooit** voorbeeldinhoud als fallback.

Na toelating controleert de module het wereld-ID en laagtype opnieuw. Een geografische laag wordt omgezet in begrensde, genormaliseerde punten `x=(longitude+180)/360` en `y=(90-latitude)/180` voor een **equirectangulaire schematische presentatie**; bewijsreferenties worden als veilige, eenvoudige velden overgenomen. Alle resultaatobjecten en -arrays worden bevroren. Na de projectie volgen nogmaals een contextversiecheck en een actuele hostautorisatiecheck.

Dit is een **dataprojectie, geen rechtstreeks aangestuurde DOM-/SVG-renderer**: de uiteindelijke vertrouwelijke gebruikersinterface moet een echte, door de host gecontroleerde mount- en revoke-cyclus toepassen; labels als tekst behandelen; privacy en bewijsverificatie door de host afdwingen; en het goedgekeurde bronobject onveranderlijk houden gedurende de verificatie. Het model verifieert zelf geen signatures of digests en verleent geen rechten.

Op de afzonderlijke openbare Atlas is alleen een **lege schematische rendererzone** toegevoegd, met expliciet nul geografische punten en nul bewijsreferenties. De pagina importeert deze private module niet en heeft geen bron-API, identiteitskoppeling, privégegevens of uploadfunctionaliteit.

Geen functionele tests uitgevoerd; de privé-Citadel blijft ongemoeid, PR #58 DRAFT/HOLD, geen merge. Alleen de reeds toegestane publieke Render-demonstratie kan handmatig worden bijgewerkt.

## MUNDO-ATLAS-MOUNT-LIFECYCLE-012 — privé hostgestuurde intrekking

Nieuw: `08-IMPLEMENTATION/src/citadel/mundo-atlas-mount-lifecycle.ts` met `createAtlasMountLifecycle(host)`. Deze module is uitsluitend voor een toekomstige beschermde Citadel-host bedoeld en is **niet** in de publieke Atlas geïmporteerd.

Het contract vereist een actuele, onafhankelijke hostverificatie via de bestaande bronprojectie en een synchrone `mount(view)` die een opruimhandle teruggeeft. Een activatie reserveert haar token **vóór** het uitvoeren van host-callbacks en controleert aanvraagtoken, epoch, actuele contextversie en machtiging gedurende de overdracht, ook na montage. `beforeContextChange()` trekt het actieve beeld synchroon in en maakt lopende aanvragen verouderd; `dispose()` sluit de levenscyclus definitief. Oudere opruimhandles worden niet aangeboden om nieuwe views te manipuleren.

**Hostvereisten:** de echte host moet route-, rechten- en sessiewijzigingen vooraf aankondigen, de contextversie bij elke wijziging onveranderlijk vernieuwen (niet hergebruiken), de oorspronkelijke bron gedurende broncontrole onveranderlijk houden, en de `mount`-opruimhandle correct en synchrone afscherming laten uitvoeren. Bij een foutieve hostimplementatie is dit TypeScript-contract geen bewijs van complete beveiliging. Er is nog geen echte PALACO ONE/router/DOM-koppeling of functionele verificatie.

De publieke World Atlas bevat uitsluitend een verklarend paneel *Beschermde Atlasweergave*. Geen live private kaartpunten, autorisatie of gegevensopslag. De bestaande publieke Render-preview mag handmatig worden geüpdatet; de originele L.A. Citadel Sites-app, PR #58 DRAFT/HOLD en het mergeverbod blijven ongewijzigd. Geen functionele tests uitgevoerd.

## MUNDO-ATLAS-DOM-ADAPTER-013 — afgeschermde DOM-presentatie

De privéhostadapter `08-IMPLEMENTATION/src/citadel/mundo-atlas-dom-adapter.ts` bevat `mountAtlasDomView(container, view)`. Deze adapter is **geen** eigen router, autorisatiemodule of publieke datalaag. Een vertrouwde host mag hem uitsluitend aanroepen via een succesvol toegelaten `AtlasViewHost.mount(view)` binnen de bestaande levenscyclus 012.

- Alle kaartlabels, wereldnamen, revisies en referenties worden uitsluitend als tekst opgebouwd, met `textContent`. Er zijn geen `innerHTML`-, HTML-template-, netwerk- of externe afbeeldingsfuncties.
- Voor geografische data tekent de adapter alleen een lege, schematische equirectangulaire container en eventuele host-toegelaten punten. Invoerposities moeten eindig zijn en tussen 0 en 1 liggen. Een tekstlijst biedt ook zonder visuele kaart toegang tot de puntnamen.
- Voor bewijsdata maakt de adapter een eenvoudige lijst met alleen de reeds toegelaten, onpersoonlijke referentievelden.
- De gehele DOM-structuur wordt los van de pagina voorbereid en pas na opbouw toegevoegd aan de opgegeven hostcontainer.
- Elke weergave retourneert een idempotente, op haar eigen wortelelement gerichte `dispose()`. Dit voorkomt dat vertraagde opruiming van een oude weergave de nieuwste mount verwijdert.

**Nog te koppelen:** de daadwerkelijke beschermde Citadel-container, PALACO ONE-sessie, router, vóór-wijziging-event en bronverificatie. Dit bestand biedt geen automatische toegang tot het oorspronkelijke ChatGPT Sites-project. Er is nog geen functionele acceptatie uitgevoerd.

De publieke Render-preview is uitsluitend uitgebreid met een verklarend onderdeel *Beschermde kaartpresentatie*; de private adapter wordt niet geïmporteerd. DRAFT/HOLD, geen merge of privépublicatie.

## MUNDO-ATLAS-HOST-CONTRACT-014 — echte hostevents als expliciete grens

De privéhostmodule `08-IMPLEMENTATION/src/citadel/mundo-atlas-host-contract.ts` biedt `connectAtlasHostContract(contract)` met zes vereiste hostfuncties: `subscribeBeforeChange`, `authorizeAndVerify`, `isStillAuthorized`, `readContextVersion`, `mount`, en een door `subscribeBeforeChange` teruggegeven `unsubscribe`-functie. Dit zijn expliciet aan te leveren functies van de **werkelijke beschermde Citadel-host**. Er zijn geen PALACO ONE- of router-API's geraden of geïmplementeerd.

De module bindt de callback-methodes aan hun oorspronkelijke object om class-gebaseerde hostimplementaties te ondersteunen, en registreert één synchrone BEFORE-change-luisteraar. Bij logout, sessiewissel, rechtenwijziging, routevervanging of sluiten van de Atlas wordt de bestaande `createAtlasMountLifecycle` ingetrokken. Onbekende eventnamen leiden eveneens tot intrekking. Een event tijdens registratie wordt beschouwd als onbetrouwbare context; de installatie faalt en ruimt op. Een ongeldig unsubscribe-resultaat faalt eveneens. Als intrekking faalt, mag de verbinding niet opnieuw activeren. `dispose()` is definitief en ruimt luisteraar en view op.

**Trustvoorwaarden:** eventregistratie moet atomair zijn; als een externe `subscribeBeforeChange` halverwege gooit, moet de host zelf een eventueel geregistreerde luisteraar weghalen. De host moet gegarandeerd **vóór** wijzigingen gebeurtenissen versturen en een unieke, niet-hergebruikte contextversie leveren. De verbinding zelf bewijst niet dat een callback de echte sessie of rechten juist vertegenwoordigt. Test- en productieacceptatie blijven HOLD.

Op de aparte publieke Render-preview is uitsluitend een **beschrijvend Hostcontract 014-paneel** toegevoegd. Geen daadwerkelijke PALACO ONE-, router- of Citadel-koppeling, persoonsgegevens of privéwerelddata. De originele L.A. Sites-app is niet gewijzigd, GitHub PR #58 blijft DRAFT/HOLD; geen tests of merge.

## MUNDO-ATLAS-PROTECTED-CONTAINER-015 — hostgebonden DOM-koppeling

Nieuw: `08-IMPLEMENTATION/src/citadel/mundo-atlas-protected-container.ts` met `connectAtlasProtectedContainer(contract)`. Het contract bestaat uit door de **echte** Citadel-host aan te leveren functies: `subscribeBeforeChange`, `authorizeAndVerify`, `isStillAuthorized`, `readContextVersion` en `currentProtectedContainer`.

De adapter bindt deze hostfuncties aan het bestaande `connectAtlasHostContract` (014), dat `createAtlasMountLifecycle` (012) gebruikt. Pas na toegelaten bronprojectie en actuele machtigingscontroles kan de DOM-adapter (013) een beschermde kaartweergave creëren. `currentProtectedContainer` wordt op het montagemoment opgevraagd; null, een losgekoppeld element of een ontbrekende documentcontext leidt tot weigering van de montage. Er is **geen** fallback naar `document.body`, een CSS-selector, een nieuw aangemaakte documentwortel of de publieke Atlas.

**Noodzakelijke hostgaranties:** de host moet daadwerkelijk bewijzen dat de teruggegeven container tot de geautoriseerde privéroute behoort; alle wijzigingen **vóór** de overgang melden; de contextversie strikt vernieuwen; en bronintegriteit en toegang onafhankelijk vaststellen. De adapter kan op basis van alleen een HTML-element niet controleren dat de route echt privé is. De browser- en gebruikersacceptatie is nog niet uitgevoerd.

De aparte openbare Render-pagina bevat alleen een **verklarend Containercontract 015-paneel**, zonder import van de privémodule, accounts, brongegevens of eventkoppelingen. Oorspronkelijke L.A. Citadel Sites-app ongewijzigd; GitHub PR #58 DRAFT/HOLD; geen functionele tests, merge of private uitrol.

## MUNDO-HOST-INTEGRATION-016 — context- en containerbewaking

De bestaande `mundo-atlas-protected-container.ts` is aangescherpt: hij leest de context vóór de hostcontainer wordt opgevraagd, eist een verbonden, geldige hostcontainer en bevestigt na DOM-montage opnieuw **dezelfde containeridentiteit**, verbonden toestand en dezelfde contextversie. Bij falen wordt de net gemonteerde kaart direct opgeruimd; een oude opruiming wist geen nieuwere kaart. De overige controles in de hostgebonden levenscyclus blijven van kracht.

Nieuw integratiedocument: `08-IMPLEMENTATION/docs/CITADEL-MUNDO-HOST-INTEGRATION-016.md` met concrete eisen voor hostevents, bronverificatie, autorisatie, contextversies en de privémount. Het document bevat uitsluitend niet-uitgevoerde scenario's voor latere eigenaaracceptatie.

De publieke Render Atlas toont een **uitsluitend verklarend** Hostintegratie 016-paneel. Er wordt geen private TypeScript-module op die pagina geladen en geen echte Citadel-sessie of kaart ontsloten. Oorspronkelijke ChatGPT Sites Citadel niet gewijzigd; PR #58 blijft DRAFT/HOLD; geen functionele tests, merge of private uitrol.

## MUNDO-TRUSTED-CONTAINER-017 — dubbele privémachtiging

De private `mundo-atlas-protected-container.ts` vereist nu de extra door de host geleverde functie `isProtectedContainerAuthorized(container)`. Deze controle gebeurt vóór en na een gemonteerde kaartweergave, naast de bestaande contextversie-, DOM-verbondenheids- en containeridentiteitscontroles. De noodzakelijke vertrouwensbeslissing komt uitsluitend van de echte beschermde Citadel-host; een bestaande HTML-node geldt niet als autorisatiebewijs. Ontbreekt de functie, dan wordt het connectorcontract afgewezen. Faalt de controle na montage, dan verwijdert de adapter zijn eigen nieuwe DOM-mount.

De publieke Atlas heeft een apart, louter verklarend paneel **Vertrouwensgrens 017**. Geen feitelijke PALACO ONE-inlogkoppeling, privéroutes of persoonlijke records zijn geopend. Handleiding `CITADEL-MUNDO-HOST-INTEGRATION-016.md` bijgewerkt. Geen functionele tests, private Sites-wijziging of merge; PR #58 blijft DRAFT/HOLD.

## MUNDO-EVENT-RECOVERY-018 — onbekende hostevents als terminale fout

De privé `mundo-atlas-host-contract.ts` sluit de verbinding definitief bij een niet-herkend context-event, in plaats van het event naar een herbruikbare sessiewissel te vertalen. Een bekende hostmelding trekt het actuele beeld in via de bestaande lifecycle. Na een onbekend event wordt een nieuwe activatie geweigerd totdat de echte host een nieuwe, gecontroleerde verbinding heeft aangemaakt.

De publieke MUNDO Atlas bevat een verklarend paneel **Herstelgrenzen 018**; deze openbare pagina registreert geen sessie-events of login, en laadt geen privékaartpunten. De hostintegratiehandleiding bevat een lijst met nog niet uitgevoerde eigenaaracceptatiescenario's. De oorspronkelijke privé-Citadel blijft ongewijzigd, PR #58 blijft DRAFT/HOLD. Geen functionele tests of merge.

## MUNDO-EXPLICIT-RECOVERY-019 — herstel zonder aanvraagherhaling

Nieuwe private TypeScript-module `08-IMPLEMENTATION/src/citadel/mundo-atlas-explicit-recovery.ts`. De module bewaakt een oplopende generatie per herstelsituatie, maakt lopende oude aanvragen ongeldig, accepteert hoogstens één herregistratie tegelijk en vereist een volledig nieuwe, expliciet door de werkelijke Citadel-host aangemaakte verbinding. Oud bronmateriaal en vroegere autorisatie worden niet automatisch opnieuw gebruikt of opgeslagen. Een mislukte hostopruiming brengt de supervisor definitief in quarantaine.

De publieke World Atlas bevat uitsluitend een informatief paneel **Herstelprotocol 019**. Er is geen aangesloten private host, identiteitsprovider, backend of live bewijsmateriaal. Het is voorbereid ontwikkelwerk: geen functionele tests of productieacceptatie. De oorspronkelijke Citadel Sites-frontend blijft ongewijzigd; GitHub PR #58 blijft DRAFT/HOLD en er is niet gemerged.

## MUNDO-RECOVERY-020 — intrekking bij verouderde of mislukte kaartmontage

De private supervisor `mundo-atlas-explicit-recovery.ts` trekt voortaan de huidige hostverbinding in als een kaartaanvraag de status `stale` of `mount-failed` teruggeeft, mits die hostverbinding en generatie nog actueel zijn. Een daaropvolgende kaartaanvraag vereist opnieuw expliciete hostregistratie en een nieuwe bronaanvraag, zonder automatische replay van gegevens of machtiging. De status `denied` blijft een afwijzing en start nooit automatisch een herstelprocedure.

De publieke Atlas is uitsluitend uitgebreid met een verklarende sectie **Herstelprotocol 020**; de privésupervisor is niet geïmporteerd in de openbare Render-site. Voor de eigenaar zijn niet-uitgevoerde acceptatiescenario's in de hostintegratiehandleiding opgenomen. Originele privé-Citadel ongewijzigd, PR #58 DRAFT/HOLD, geen functionele tests of merge.

## MUNDO-SINGLE-FLIGHT-021 — één aanvraag per hostverbinding

De private `mundo-atlas-explicit-recovery.ts` reserveert nu vóór de asynchrone hostactivatie een token met de actuele generatie en exact dezelfde hostverbinding. Gelijktijdige nieuwe aanvragen worden afgewezen zonder het huidige verzoek te onderbreken. Na een expliciete contextintrekking wordt het oude token ongeldig. Een laat aflopende oude aanvraag kan daarna de vergrendeling van een recentere hostverbinding niet wissen. Er wordt niets automatisch opnieuw afgespeeld of geautoriseerd.

De publieke Atlas heeft uitsluitend een verklarende sectie **Aanvraagvergrendeling 021**; er worden geen beschermde modules, privémachtigingen of gebruikersgegevens ingeladen. De hostintegratiehandleiding bevat niet-uitgevoerde scenario's voor eigenaaracceptatie. De originele Citadel Sites-app is niet gewijzigd, PR #58 blijft DRAFT/HOLD en er zijn geen functionele tests of merge uitgevoerd.

## MUNDO-WORLD-TRANSITION-022 — intrekking vóór een nieuwe wereld

De nieuwe private module `08-IMPLEMENTATION/src/citadel/mundo-atlas-world-transition.ts` implementeert een expliciete wereldwissel: bestaande kaartrechten en lopende aanvragen worden eerst via de herstel-supervisor ongeldig gemaakt. Daarna mag uitsluitend de werkelijke, beschermde Citadel-host een volledig nieuwe verbinding met een nieuwe bron voor de gekozen wereld leveren. Onjuiste wereld-ID's, overlappende wissels en onbetrouwbare bronaanvragen worden geweigerd. Bij mislukking wordt de oude kaart niet automatisch teruggebracht. Het generatiebeheer zorgt dat een eerder gestart verzoek geen toegang overneemt na contextwijziging.

De publieke demonstratie bevat enkel de verklarende sectie **Wereldwissel 022**. Geen Citadel-router, PALACO ONE-sessie, echte bronnen, privérechten of productionele kaartweergave gekoppeld. Nog geen functionele tests; originele privé-Citadel niet gewijzigd; PR #58 DRAFT/HOLD en geen merge.
