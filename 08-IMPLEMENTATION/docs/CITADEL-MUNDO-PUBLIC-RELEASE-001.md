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
