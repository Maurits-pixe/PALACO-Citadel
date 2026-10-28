# Van NOVA-uitleg naar een bewuste proefkeuze

18 oktober 2026. DRAFT-vervolg op `e1ab2e163b5e6f83d965bc16d267f5a0e5e5b7b6`,
PR #47. Geen merge, deploy, Render-wijziging of echte proefuitnodiging.

## Gedrag

De NOVA-uitleg beschreef twee routes in elf talen, maar de routeknoppen stonden
alleen in het Nederlandse deel. Twee compacte kaarten binnen de uitleg laten
de gebruiker nu direct kiezen. Kop, toelichting, knopnaam en bestemmingsmelding
volgen alle elf bestaande talen; de proefpagina's blijven expliciet Nederlands.

De telefoonkaart noemt uitsluitend gemaakte testcodes en vertelt dat de server
ze kan lezen. De ontvangstkaart noemt een verzonnen verzoek en zegt dat een
ontvangstkeuze geen contact met een andere persoon opent. Beide links openen
een nieuw tabblad; de uitleg en haar huidige taal blijven in het oorspronkelijke
tabblad staan. De uitleg leest of bewaart geen taal, persoon of bericht.

In de normale runtime behouden de nieuwe links hun lokale routes. De bestaande
twee knoppen behouden hun bestaande gedrag. De statische builder controleert
vier afzonderlijke ID-/broncontracten en zet hun bestemming vast op
`https://palaco-ambassades.onrender.com/rio/device-test/` respectievelijk
`https://palaco-ambassades.onrender.com/rio/nova/`, zonder parameters.
De statische HTML toont de andere proefhost ook zonder JavaScript. De hostnaam
staat in een afzonderlijk LTR-element, ook bij een Arabische uitleg.

De nieuwe native links hebben `hreflang="nl"`, `target="_blank"` en
`rel="noopener noreferrer"`, met een beschrijving van Nederlands/nieuw tabblad.
Taalkeuze veroorzaakt geen externe aanvraag. Pas de expliciete navigatie opent
de proefsite. Er worden geen identiteit, sessiecode of taalparameters toegevoegd.
Dit zegt niets over de actuele bereikbaarheid of veiligheid van de openbare
dienst. Deze uitvoering heeft geen proefverzoek naar die dienst gestuurd.

Het bestaande ene beleefde live-statusgebied blijft behouden. De routegroep
heeft een naam; gewone links werken ook zonder scripts. De header kan nu bij
320 pixels met dubbele tekstgrootte omlopen zonder horizontale overloop.
De publieke lijst blijft 22 bestanden. Caches en publicatieprofiel veranderen niet.
Een aanvullende schermbeoordeling laat de nieuwe knoptekst in dezelfde
inline tekststroom lopen als het pijltje. Bij dubbele tekstgrootte blijft daardoor
meer ruimte voor hele woorden; de 44-pixelbediening blijft behouden.

## Verificatie en tegenbewijs

De nieuwe browserproeven controleren elf volledige routevertalingen, lokale
RTL/taal, native namen en minimaal 44-pixelbediening, geen opslag/cookies/API,
een scriptvrije fallback en beide toetsenbordnavigaties. Een lokale onderschepping
vangt de proefbestemming volledig af en bewijst de juiste URL, een ontbrekende
referrer/opener en het behouden oorspronkelijke tabblad. Dit is geen test tegen
de openbare dienst en geen fysieke telefoonacceptatie.

De normale receptiesuite controleert bovendien dat taalwisselen geen verkeer
toevoegt aan de bestaande twee statuslezingen en dat lokale links lokaal blijven.
De oorspronkelijke navigatie-, offline-, cache-, PP-, provider- en TLS-proeven
blijven behouden. Exacte CI-head, runs en aantallen staan in de draft-PR en het
uitvoeringsbewijs; alleen een voltooide geslaagde run telt als bewijs.

De eerste nieuwe ronde gaf 5/8 PASS: popup-meetinstrumentatie startte dubbel
en de desktopproef op 320 pixels/200% tekst vond een bestaande headeroverloop
van 41 pixels. De meting is idempotent gemaakt en de productheader laat tekst
omlopen; de asserties zijn behouden. Een gelijktijdige lokale herbouw onderbrak
een eerdere browserfixture (25/26 PASS). De volledige eindcontrole wordt
sequentieel uitgevoerd; CI gebruikte die volgorde al. Negatieve contexten zijn
buiten de publieke uitvoer bewaard. Er is geen retry toegevoegd om fouten te verbergen.

Een daaropvolgende normale receptieronde gaf 29/30 PASS: een bestaande
lifecycleproef wachtte op browser-netwerkboekhouding terwijl de app na volledig
gelezen bytes haar controller al afbrak. Een afzonderlijke ronde slaagde. De
fixture wacht nu op het werkelijke EOF van de onveranderde native body-reader,
met dezelfde echte GETs, geblokkeerde tweede lezing en alle abort-/status-/
verkeersasserties. Geen synthetische response, sleep, retry of hoger tijdslimiet.

## VORM9EVIN9 RECORD

- **Publiek en surface:** telefoon en computer, touch en toetsenbord; 320/390/1440 pixels en vergrote tekst.
- **Onderwerp:** NOVA, bestaande mascotte en wegwijzer; twee herkenbare proefkaarten, ontwerpstatus.
- **Touchflow:** taal kiezen, route lezen, native link bewust openen; uitleg blijft open.
- **Begrijpelijkheid:** per route één doel en een concrete beperking; Nederlands/nieuw tabblad vóór de knoppen.
- **Toegankelijkheid:** gelabelde groep/taalkeuze, lokale RTL, geïsoleerde host, focus, 44-pixelbediening, HTML-fallback en tekstomloop; geen certificeringsclaim.
- **RIO-context:** elf talen, twee bestaande proeven; geen identiteit, consent, authority of accountstatus veranderd.
- **Provenance en grens:** genoemde basis, vaste buildermappings en lokale interceptie; presentatie verleent geen toestemming.
- **Validatie:** nieuwe browserregressies plus bestaande suites; definitieve resultaten in het uitvoeringsbewijs.
- **Status:** `VORM9EVIN9_READY_WITH_CONDITIONS`.
- **Volgende stap:** menselijke beoordeling, eventueel moedertaal- en schermlezerreview; afzonderlijke toestemming voor publicatie blijft nodig.

## PALACO PROOF

**PALACO PROOF: ON**

- **Proposition:** de elf NOVA-uitlegversies bieden twee begrijpelijke, expliciete proefroutes zonder automatische contactactie of gegevensoverdracht.
- **Scope and criterion:** de genoemde source-head en de 22 bestanden van de statische bouwvariant; juist gedrag van links, taal, privacy en toegankelijkheid.
- **Evidence:** vaste URL-contracten, elf vertaalsets, browser-/HTTP-tests en behouden eerste fouten; de definitieve CI en pakketcontrole staan in het uitvoeringsbewijs.
- **Provenance:** vervolg op e1ab2e1, PR #47, lokale bron-/bouwmanifesten en exacte checkout in CI.
- **Falsification:** ontbrekende grens, verkeerde host/route, onverwachte opslag/achtergrondaanvraag, opener/referrer, onjuiste RTL of overloop laat de controles falen.
- **Status:** `PROVISIONAL` tot de exacte nieuwe commit en uitvoer hun eindcontroles hebben voltooid; het uitvoeringsbewijs legt het uiteindelijke oordeel vast.
- **Limits:** geen publicatie, openbare diensttest, registratie, echte chat/E2EE, operationele BRI9ADE of bestuurlijke goedkeuring. PALACO #50 blijft HOLD; #51/#60/#64 blijven open.
