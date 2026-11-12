# CITADEL-READING-UI-001 — Leeskompas-integratiecontract

**Status:** DRAFT / HOLD. Geen site-deployment, geen gebruikerstest en geen autorisatie.

## Scope

De eigenaar-privé Citadel bevat vijf regio's. Deze bouwbijdrage levert drie geïsoleerde TypeScript-modules:

- `reading-state.ts`: bewaarbeleid en opslagfouten afschermen.
- `reading-ui.ts`: zichtbare tekst en gebruikersgestuurde acties zonder browserafhankelijkheden.
- `reading-chapter.ts`: versiegebonden hoofdstukbladwijzers, gevalideerd met de werkelijke hoofdstuk-ID's van de site.

Het contract is uitsluitend voor **presentatievoortgang**. Het is geen PALACO ONE-identiteit, Citadel-toegangscontrole, ERA/EDTR-bewijs, watermerk, consensus of uitvoeringsmandaat.

## Aansluiten in de bestaande site

1. Laat de huidige Citadel-site en de vijf regiopagina's de bron van waarheid voor routes en toegangsrechten blijven.
2. Maak pas in de browser een lokale `StoragePort` aan, bijvoorbeeld een adapter rond `localStorage`, binnen een try/catch. Geef geen gedeelde browser-storage door aan onbetrouwbare frames.
3. Toon `readingView(storage)` zonder bij pagina-initialisatie enige save/enable-functie te gebruiken.
4. Verbind de knop **Leesplek onthouden** alleen met `requestEnableMemory(storage)` bij een expliciete klik. Toon `message` uit het resultaat.
5. Roep `recordChapterSelection(storage, regionId)` uitsluitend aan na een bewuste hoofdstukselectie. Gebruik nooit automatische scroll- of hydration-events om de bewaarde positie te vervangen.
6. Laat **Verder lezen** `requestResumeChapter(storage, registry)` gebruiken wanneer een hoofdstukbladwijzer bestaat; val anders terug op `requestResume(storage)` voor de bestaande regio-opslag. Valideer de toegankelijke route voordat de router navigeert. De hoofdstukregistratie moet afkomstig zijn uit de vertrouwde Citadel-frontend, nooit uit de URL of geïmporteerde JSON.
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
