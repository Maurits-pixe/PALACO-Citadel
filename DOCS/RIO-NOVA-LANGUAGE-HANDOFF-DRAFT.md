# Jouw RIO-taal meenemen naar de NOVA-uitleg

18 oktober 2026. DRAFT-vervolg op bf6d8652e0785377325c78d219fb6f31e276533d,
PR #47. Geen merge, deploy, Render-wijziging of echte uitnodiging uitgevoerd.

## Probleem en gedrag

De VisitCard en online app onthielden hun eigen taal, maar hun NOVA-link ging
naar een uitleg die opnieuw de browsertaal koos. Een expliciete Franse keuze
kon daardoor bij NOVA Engels worden. De lokale links dragen nu uitsluitend de
gekozen taalcode in een fragment, bijvoorbeeld
`/rio/reception/#nova-explained:fr`.

De VisitCard kan haar zeven talen meegeven, de online app haar elf talen.
De nieuwe labels verwijzen naar de vertaalde NOVA-uitleg en blijven aangeven
dat de overige receptie Nederlands is. Documenttaal en hreflang blijven nl.
De normale proefroutes en de account-/contactgrenzen veranderen niet.

NOVA accepteert uitsluitend een exact fragment met een van de elf ondersteunde
kleine tweelettercodes. Geen URL-decoding, extra velden, rol, actor, query of
gedeeltelijke match. Een geldige code heeft voorrang op de browsertaal;
anders gelden de ondersteunde browserbasistaal en vervolgens Nederlands.
Een geldig eigen hashchange past de uitleg opnieuw toe. Gewone ankers en
ongeldige hashes resetten een handmatige keuze niet. De selector schrijft geen
URL, geschiedenis, cookie, API of browseropslag. NOVA leest ook geen taalvoorkeur
uit de bestaande app-/VisitCard-sessieopslag.

De taalcode staat in het adres van deze lokale navigatie; zij is geen identiteit
of bevoegdheid. Een fragment is geen HTTP-query en verandert de cachekey niet.
Na expliciete navigatie naar die uitleg krijgt de benoemde sectie focus en wordt
zij in beeld gebracht. De volgende Tab gaat naar de taalselector. Een handmatige
taalkeuze houdt haar focus; een willekeurig fragment verplaatst geen focus via
deze code. Gewone browserankerwerking blijft bestaan.

De zelfstandige file-app opent een andere publieke previewhost. Haar links
blijven vast, zonder taalfragment of query, online en offline. Ook de echte
proeflinks dragen geen taal- of identiteitsgegevens mee. Er wordt geen gekozen
taal naar een andere host doorgestuurd. Zonder JavaScript blijven de eerlijke
Nederlandse uitleg, grenzen en uitgeschakelde selector beschikbaar.

## Bestaande installaties

Het gewijzigde root-integration.mjs en app-start.js zitten in gescheiden
cache-first shells. De rootcache wordt daarom v38-nova-language-handoff en
uitsluitend de gegenereerde appcache wordt v6. De oorspronkelijke appbron en
bronworker v3 blijven intact. De publieke lijst blijft 22 bestanden; CSP,
queryweigering, cache-uitsluitingen en publicatieprofiel veranderen niet.
De receptie wordt niet als offline pagina gecachet.

De bestaande echte v35-migratie blijft draaien. Een nieuwe proef gebruikt
bytevaste v37/v5-workers van de vorige preview: beide nieuwe workers moeten
echt wachten terwijl hun oude pagina's open zijn. Eerst sluit alleen de app;
v6 mag activeren terwijl de root blijft wachten. Daarna sluit de root en mag
v38 activeren. Contacten, een onbekende cache, afzonderlijke registraties,
nieuwe taallinks en echte offline reloads moeten behouden blijven. Dit bewijst
de worker/cacheovergang met actuele HTML; geen reconstructie van de hele oude UI.
Herkomst en SHA256 van de vaste LF-fixtures staan in de test-README.

## Verificatie

De nieuwe taalproeven controleren beide vertrekpunten, alle toegestane codes,
URL-/browser-/NL-voorrang, ongeldige en gemanipuleerde hashes, gewone ankers,
focus en toetsenbord, geen NOVA-opslag/API/cookies, scriptvrije fallback, de
zelfstandige file-app en 320-pixelweergave. Publieke navigatie wordt volledig
lokaal onderschept, zodat de test geen openbare proef activeert.
De bestaande taal-, route-, offline-, contact- en cacheproeven blijven behouden.
Alleen de bedoelde href-/cacheverwachtingen veranderen; er komt geen retry of
ruimere tijdslimiet. Exacte CI-head en eindresultaten volgen in de draft-PR en
het uitvoeringsbewijs; een lopende controle telt niet als geslaagd bewijs.

## VORM9EVIN9 RECORD

- **Publiek en surface:** telefoon en computer, touch en toetsenbord.
- **Onderwerp:** bestaande NOVA-uitleg, elf talen en twee bestaande proefroutes; ontwerpstatus.
- **Touchflow:** taal in RIO kiezen, expliciet naar NOVA gaan, uitleg in die taal lezen; volgende Tab naar taalselector.
- **Begrijpelijkheid:** label benoemt vertaalde uitleg en Nederlandse receptie; de gebruiker hoeft de taal niet opnieuw te kiezen.
- **Toegankelijkheid:** benoemde focusbare sectie, lokale taal/RTL, 44-pixelkeuze, scriptvrije Nederlandse fallback; geen certificeringsclaim.
- **RIO-context:** alleen een gevalideerde taalcode in een lokale link; geen identiteit, account, consent of authority aangepast.
- **Provenance en grens:** genoemde basis, vaste workers en bouwmanifest; presentatie verleent geen toestemming.
- **Validatie:** nieuwe browser-/migratieproeven en behouden regressies; exacte eindresultaten in het uitvoeringsbewijs.
- **Status:** `VORM9EVIN9_READY_WITH_CONDITIONS`.
- **Volgende stap:** menselijke beoordeling en eventuele moedertaal-/schermlezerreview; publicatie blijft een afzonderlijke beslissing.

## PALACO PROOF

**PALACO PROOF: ON**

- **Proposition:** de expliciete RIO-taal bereikt lokaal de NOVA-uitleg zonder extra opslag, API, externe taaldoorgifte of contactactie.
- **Scope and criterion:** nieuwe draft-head, 22 publieke bestanden, exacte fragmenten en gescheiden worker/cacheovergang.
- **Evidence:** broncode, whitelists, browser-/HTTP-proeven, vaste workerbytes en actuele CI in het uitvoeringsbewijs.
- **Provenance:** vervolg op bf6d865, PR #47, gecontroleerde fixtures van die preview en expliciete CI-checkout.
- **Falsification:** verkeerde taal/host, onverwachte opslag/verkeer/focus, gewijzigde gewone ankers, update die open pagina's overneemt of contact-/cacheverlies laat de controles falen.
- **Status:** `PROVISIONAL` totdat de exacte nieuwe commit en uitvoer hun eindcontroles hebben voltooid.
- **Limits:** geen publicatie, openbare dienstacceptatie, echte registratie/chat/E2EE, fysieke telefoonacceptatie of operationele BRI9ADE. PALACO #50 blijft HOLD; #51/#60/#64 blijven open volgens de laatste broncontrole.
