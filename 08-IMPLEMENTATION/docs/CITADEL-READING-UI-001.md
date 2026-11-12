# CITADEL-READING-UI-001 — Leeskompas-integratiecontract

**Status:** DRAFT / HOLD. Geen site-deployment, geen gebruikerstest en geen autorisatie.

## Scope

De eigenaar-privé Citadel bevat vijf regio's. Deze bouwbijdrage levert vijf geïsoleerde TypeScript-modules:

- `reading-state.ts`: bewaarbeleid en opslagfouten afschermen.
- `reading-ui.ts`: zichtbare tekst en gebruikersgestuurde acties zonder browserafhankelijkheden.
- `reading-chapter.ts`: versiegebonden hoofdstukbladwijzers, gevalideerd met de werkelijke hoofdstuk-ID's van de site.
- `reading-routes.ts`: vertrouwd routemanifest, hoofdstuk-allowlist en veilige hervatbestemmingen zonder automatische navigatie.
- `reading-region-bridge.ts`: expliciete, controleerbare vertaling tussen oudere Leeskompas-regio-ID's en de nieuwe canonieke ID's.

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
