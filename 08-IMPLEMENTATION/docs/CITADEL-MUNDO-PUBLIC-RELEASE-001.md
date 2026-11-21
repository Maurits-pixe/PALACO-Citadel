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
