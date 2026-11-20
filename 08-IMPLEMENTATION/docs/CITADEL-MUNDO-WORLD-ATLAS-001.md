# MUNDO World Atlas — Citadel-integratie (DRAFT/HOLD)

## Opgeleverd
Zelfstandige offline-first HTML-bouwpreview: `08-IMPLEMENTATION/examples/mundo-world-atlas-preview.html`. Responsief voor mobiele en desktopschermen, zonder externe afhankelijkheden of netwerkverzoeken. Met zoekveld, zeven bekende wereld-ID's, geselecteerde wereld, live tekststatus voor schermlezers, toetsenbordbediening en ondersteuning voor `prefers-reduced-motion`.

De conceptuele bol is **geen** feitelijke geografische kaart. Alleen de uit de projectcontext bekende wereldnamen zijn opgenomen: W-0001 EARTH, W-0002 PLUTO, W-0003 EVA, W-0004 RIO, W-0005 PALACO, W-0006 6IO en W-0007 E9O. Andere gegevens ontbreken totdat een gecontroleerde bron wordt verbonden.

## Integratie met oorspronkelijk privé-Sites-project

Het doelproject is `sites-project://appgprj_6ab7a775b77c81919762aeaabdd5a25c` (L.A. — Citadel Preview). **Dit bestand is nog niet in dat project geplaatst.** De GitHub-repository heeft geen bewezen automatische synchronisatie met dit Sites-project. De preview mag niet via een onbeveiligd publicatiepad worden ingezet alsof het een werkelijke privéomgeving is.

Hostvereisten voor integratie:
1. Bevestig de actuele Citadel- en PALACO ONE-authenticatie en autorisatie **voordat** de Atlas zichtbaar wordt.
2. Verifieer feitelijke bestaande route, navigatie en paginacontainer; verzin geen URL.
3. Vervang de lokale lijst uitsluitend door gecontroleerde MUNDO-wereldgegevens met lineage en toegangsbeleid.
4. Koppel eventuele profielfuncties pas na privacybesluit; de huidige preview slaat niets op en stuurt niets door.
5. Laat uitsluitend de eigenaar de functionele acceptatie uitvoeren volgens de bestaande HOLD-procedure.

**Niet uitgevoerd:** functionele tests, merge, live Sites-bewerking, publicatie, account- of rolwijzigingen. **DRAFT/HOLD.**

## MUNDO-ATLAS-EXPLORER-002 — lokale navigatie en wereldvergelijking

De bestaande HTML-preview is uitgebreid met:
- Vorige/volgende wereldknoppen die cyclisch door de zeven bekende wereld-ID's bladeren.
- Een dekkingsoverzicht: zeven lokaal bekende wereldnamen, nul aangesloten live dataverbindingen en geen persistente opslag.
- Een expliciet te openen/sluiten vergelijkingspaneel waarin twee wereldprofielen naast elkaar staan.
- Een toegankelijke selectie voor de tweede wereld, `aria-pressed` op de vergelijkingsknop, bestaande `aria-live`-meldingen bij het veranderen van de actieve wereld en mobiele éénkolomsweergave voor de vergelijkingskaarten.

De vergelijkingsgegevens worden via `textContent` opgebouwd uit de vaste previewlijst, zonder dynamische HTML-injectie. De Atlas vermeldt bekende namen en wereld-ID's als projectcontext, maar heeft geen geverifieerde geometrie, geografische kaart, eigendomsinformatie, wereldstatus of directe MUNDO-bron. Die velden worden daarom **niet geverifieerd** of **niet gekoppeld** genoemd. De vergelijking is uitsluitend sessielokale UI-toestand in geheugen, zonder `localStorage`, cookies, externe API's of hashroutering.

De Atlas blijft zelfstandig en is niet in de originele privé-Sites-app geïnstalleerd. Voor werkelijk gebruik moet de Citadel-host authenticatie en autorisatie afhandelen voordat de component zichtbaar wordt. Functionele tests zijn op verzoek niet uitgevoerd. Geen merge, publicatie of autorisatievrijgave: **DRAFT/HOLD**.
