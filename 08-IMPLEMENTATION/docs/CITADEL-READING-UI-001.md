# CITADEL-READING-UI-001 — Leeskompas-integratiecontract

**Status:** DRAFT / HOLD. Geen site-deployment, geen gebruikerstest en geen autorisatie.

## Scope

De eigenaar-privé Citadel bevat vijf regio's. Deze bouwbijdrage levert twee geïsoleerde TypeScript-modules:

- `reading-state.ts`: bewaarbeleid en opslagfouten afschermen.
- `reading-ui.ts`: zichtbare tekst en gebruikersgestuurde acties zonder browserafhankelijkheden.

Het contract is uitsluitend voor **presentatievoortgang**. Het is geen PALACO ONE-identiteit, Citadel-toegangscontrole, ERA/EDTR-bewijs, watermerk, consensus of uitvoeringsmandaat.

## Aansluiten in de bestaande site

1. Laat de huidige Citadel-site en de vijf regiopagina's de bron van waarheid voor routes en toegangsrechten blijven.
2. Maak pas in de browser een lokale `StoragePort` aan, bijvoorbeeld een adapter rond `localStorage`, binnen een try/catch. Geef geen gedeelde browser-storage door aan onbetrouwbare frames.
3. Toon `readingView(storage)` zonder bij pagina-initialisatie enige save/enable-functie te gebruiken.
4. Verbind de knop **Leesplek onthouden** alleen met `requestEnableMemory(storage)` bij een expliciete klik. Toon `message` uit het resultaat.
5. Roep `recordChapterSelection(storage, regionId)` uitsluitend aan na een bewuste hoofdstukselectie. Gebruik nooit automatische scroll- of hydration-events om de bewaarde positie te vervangen.
6. Laat **Verder lezen** `requestResume(storage)` gebruiken. Wanneer dit een regio oplevert, valideer de toegankelijke route voordat de bestaande router navigatie en focus beheert.
7. Vraag bevestiging voor **Wis leesplekken**. Geef alleen daarna `requestClearMemory(storage, true)` door.
8. Toon de status `unavailable` als de browser lokale opslag blokkeert. Meld niet dat gegevens gewist of opgeslagen zijn als de opslagoperatie geen succes teruggeeft.
9. Verhoog pas bij site-integratie de bestaande serviceworker-cacheversie. Cache geen persoonlijke posities of sessies.
10. Laat de rondreisgeschiedenis, officiële registers en alle bestaande access gates onaangeroerd.

## Bewust buiten scope

Geen serverupload, cookies, telemetrie, profielkoppeling, PP-nummer, documentuitgifte, bewijsverificatie, loginautorisatie, openbare publicatie of automatische migratie van legacy opslag.

## Open reviewvragen

- Of de bestaande site dezelfde vijf regio-ID's gebruikt; zo niet een expliciete een-op-een mapping vastleggen.
- Hoe de bestaande site hoofdstukken binnen een regio identificeert; deze module bewaart momenteel **regio**, niet exact hoofdstuk of scrollpositie.
- Of locale opslag in de bestaande site elders met andere sleutels is geïmplementeerd; voorkom dubbele toestanden.
- Browser en mobiel focusgedrag na navigatie moeten door de eigenaar later worden geobserveerd.

## Acceptatie

Alle wijzigingen blijven DRAFT / HOLD totdat de integratie beoordeeld is. Geen PASS-claim zonder gebruikerstests en verifieerbaar bewijs.
