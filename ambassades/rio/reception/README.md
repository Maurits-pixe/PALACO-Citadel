# NOVA · de RIO-receptie

Deze Nederlandstalige ingang helpt iemand kiezen tussen de bestaande
telefoonproef en de online NOVA-receptie. NOVA wijst de weg; de pagina maakt
geen account, koppeling of veiligheidsgoedkeuring aan.

**Status: DRAFT. De nieuwe route `/rio/reception/` is in deze bouwstap niet
gepubliceerd. Geen merge of deployment uitgevoerd.** De implementatie bouwt
voort op de bestaande gedeployde broncommit
`fb762718a72a7e5f2d04bda9178a6842a498bb86`. Een groen lokaal resultaat of CI
publiceert deze nieuwe pagina niet.

## Beveiligde testopzet op de bestaande host

Gebruik de bestaande openbare HTTPS-host
`https://palaco-ambassades.onrender.com`. Hiervoor is geen nieuwe host,
providerclient, database, accountinschrijving, LAN-poort of lokaal
vertrouwd certificaat nodig. De twee bestaande routes zijn:

- [RIO-telefoonproef](https://palaco-ambassades.onrender.com/rio/device-test/):
  tijdelijke gasttestsessies met door de server gemaakte challenge/reply-codes.
- [NOVA online receptie](https://palaco-ambassades.onrender.com/rio/nova/):
  tijdelijk proefverzoek, ontvangst, eerste receptiekeuze en een gesloten
  controlepoort.

De nieuwe receptie is een voorstel voor dezelfde host en dezelfde oorsprong.
Zij opent de bestaande routes via gewone links. Op de nieuwe pagina worden
geen sessie-, uitnodigings-, koppelings- of berichtendpoints aangeroepen.
Na bewuste navigatie blijft iedere afzonderlijke proefpagina haar bestaande
sessiegedrag volgen.

HTTPS beschermt het vervoer naar de server. De server kan de gegenereerde
testcodes en NOVA-proeftekst lezen. Dit is geen end-to-endversleuteling,
persoonsverificatie, persoonlijk account of operationeel contact.

## Handmatige proef met twee apparaten

Begin met `GENERAL_INTERNET`, de standaardopstelling van de bestaande
telefoonproef. Gebruik twee eigen apparaten met afzonderlijke browsersessies,
bijvoorbeeld een telefoon en een laptop. Voor bewijs van twee fysieke
telefoons moeten ook daadwerkelijk twee verschillende telefoons worden
gebruikt; twee tabs met dezelfde gastcookie vervangen dat niet.

1. Open de bestaande telefoonproef op apparaat A. Laat
   **Algemene internetproef** geselecteerd en kies **Maak uitnodiging**.
2. Open de eenmalige uitnodigingslink op apparaat B en kies
   **Gebruik uitnodiging**. Houd beide pagina's open.
3. Controleer dat beide schermen hetzelfde proefnummer tonen. Bevestig op
   beide apparaten **Ik doe mee aan deze testcodeproef**. Dit accepteert
   uitsluitend `RIO_DEVICE_CHALLENGE_V1`.
4. Kies op A **Stuur testcode naar de andere telefoon**.
5. Bevestig op B de ontvangen code met
   **Ik zie deze code · bevestig ontvangst**. Kies vervolgens
   **Antwoord met dezelfde testcode**.
6. Bevestig op A ook de ontvangst van dat antwoord. Controleer de bij elkaar
   horende challenge en reply: beide moeten **Ontvangst bevestigd** tonen.
   Een opgeslagen maar niet bevestigde code bewijst nog geen ontvangst.
7. Kies **Sluit proef op beide telefoons**. Bewaar desgewenst op het
   afsluitende apparaat de aangeboden beperkte resultaatnotitie.

De tijdelijke koppeling verloopt uiterlijk na vijf minuten. Bij sluiten,
verval of een serverherstart verdwijnt de tijdelijke proefstate. Begin daarna
met een nieuwe uitnodiging. Deel de uitnodigingslink alleen met je eigen
tweede testapparaat; neem het token niet op in een testverslag.

Beide apparaten mogen hun gewone internetverbinding gebruiken. Hetzelfde
wifi-netwerk of IP-adres is voor deze algemene internetproef niet vereist.
De afzonderlijke opstelling `MOBILE_CROSS_PROVIDER` is bedoeld voor twee
fysieke telefoons met verschillende providerabonnementen: wifi uit, mobiele
data via de bedoelde eigen SIM/eSIM, geen hotspot en afzonderlijke
deelnemersverklaringen. De server verifieert die providers, instellingen of
fysieke apparaten niet. Volg daarvoor de
[gedeployde apparaatproefhandleiding](https://github.com/Maurits-pixe/PALACO-Citadel/blob/fb762718a72a7e5f2d04bda9178a6842a498bb86/ambassades/rio/device-test/README.md).

Een bruikbaar verslag bevat alleen testtijd, geteste servercommit,
opstelling, apparaatlabels A/B, OS/browserversies, de beperkte
ontvangststatussen en of de proef is afgesloten. Bewaar geen telefoonnummers,
SIM-identifiers, uitnodigingstokens, gastcookies, CSRF-tokens of debugdumps.
Een automatische browserproef vervangt geen waarneming op fysieke apparaten.

## De receptie afzonderlijk proberen

Open de bestaande NOVA-receptie en kies expliciet
**Start / hervat testsessie**. Gebruik een kort, verzonnen verzoek. Breng het
ontvangstbewijs naar de receptie en maak daar een eerste ontvangstkeuze.
De controlepoort kan daarna uitleggen welke lokale receptievoorwaarden zijn
vastgelegd en welke veiligheidsaansluitingen ontbreken. De uitkomst blijft
`HOLD`; deze eerste keuze opent geen contactruimte of chat.

Een verzoek leeft maximaal vijf minuten en een NOVA-testsessie maximaal
vijftien minuten, in begrensd procesgeheugen. Kies de bestaande
sessiebeëindiging om de eigen gegevens te verwijderen. Verdere details en
statusovergangen staan in [NOVA-ONLINE.md](../NOVA-ONLINE.md).

## Bereikbaarheid is een afzonderlijke controle

Bij laden leest de nieuwe receptie precies deze twee openbare processtatussen:

- `GET /api/rio/nova/runtime`
- `GET /api/rio/device-test/runtime`

De aanvragen gebruiken `credentials: omit`, `cache: no-store` en
`redirect: error`, met een afbreektermijn van acht seconden, een begrenzing
van 8192 ontvangen bytes, JSON-contenttype en strikte UTF-8-decodering.
De componentnaam, versie en bekende gesloten veiligheidsvlaggen moeten
overeenkomen met de bestaande modules. Een fout, afwijkende component,
geopende bevoegdheid, onjuist type, ongeldige JSON/UTF-8, te grote body of
verlopen aanvraag geeft **Niet bevestigd** voor die route. Een fout in de
ene aanvraag maakt de andere niet tot een geslaagde controle.

Er zijn geen automatische retries of periodieke polls. De paginacode zet
geen cookies en gebruikt geen lokale opslag. **Opnieuw controleren** start een nieuwe controle alleen op een
expliciete klik en is tijdens een lopende controle uitgeschakeld.
Een buildreferentie wordt alleen als twaalf hextekens getoond wanneer de
telefoonproef een geldige veertigtekens commitreferentie geeft; anders staat
er **Onbekend**. Willekeurige antwoordtekst wordt niet weergegeven.

**Bereikbaar** betekent uitsluitend dat de gecontroleerde component op deze
aanvraag antwoordde met de verwachte gesloten proefgrens. Het bewijst geen
heen-en-terugoverdracht, aflevering, identiteit, menselijke toestemming,
uitgevoerde guardiancontrole of end-to-endversleuteling. De vaste tekst
**Een verbinding is hier nog niet getest** blijft daarom altijd zichtbaar.

## VORM9EVIN9, NOVA en BRI9ADE

Het presentatieontwerp volgt de
[VORM9EVIN9-bron](https://github.com/Maurits-pixe/PALACO-Citadel/blob/6774682f0c34c3bc45e02768980347b7117b3d3d/.github/agents/palaco-vorm9evin9.agent.md):
korte concrete zinnen, herkenbare keuzes, tikvlakken van ten minste 44 CSS-pixels,
zichtbare focus, toetsenbordbediening, smalle mobiele reflow en respect voor
reduced motion. De pagina gebruikt één beleefde feedbackregio. Technische
uitleg staat in een native `details`-element. Presentatie verleent geen
toegang of bevoegdheid.

`nova.png` is een **nieuw mascottevoorstel voor deze receptie**, gemaakt voor
deze opdracht. Het is geen teruggevonden historische canon, geverifieerde
persoon, veiligheidsdienst of bron van toestemming. De afbeelding staat op
de eigen host; er wordt geen externe beeldservice geladen.

De BRI9ADE-sectie toont negen specialiteiten uit het gepinde
[6RI9ADE-controleontwerp](https://github.com/Maurits-pixe/PALACO-Citadel/blob/6774682f0c34c3bc45e02768980347b7117b3d3d/rio/CONTACT-FOUNDATION.md):

| Rol | Specialiteit |
| --- | --- |
| BG01 | Identiteit en apparaat |
| BG02 | Adres en bestemming |
| BG03 | Menselijke toestemming |
| BG04 | Toegang en beleid |
| BG05 | Versleuteling en sleutels |
| BG06 | Inhoud en integriteit |
| BG07 | Herhaling en volgorde |
| BG08 | Privacy en metadata |
| BG09 | Aflevering en intrekking |

Alle rollen blijven `DESIGN_ONLY`, `UNENROLLED` en `NOT_CONNECTED`; geen
beschikbaarheidsantwoord maakt ze tot `PASS`. De historische gelijkstelling
van `BRIGADE`, `BRI9ADE` en `6RI9ADE` blijft `UNKNOWN` volgens
[contact-source-binding.json](https://github.com/Maurits-pixe/PALACO-Citadel/blob/6774682f0c34c3bc45e02768980347b7117b3d3d/rio/contact-source-binding.json).
Deze presentatie verandert die bronbinding niet.

Persoonlijke accounts, operationeel contact, finale bilaterale instemming,
aangesloten veiligheidsdiensten en end-to-endversleuteling blijven gesloten
of niet aangesloten. Deze bouwstap voegt geen muterende endpoint toe en
verandert de bestaande NOVA-, telefoonproef- of accountcontracten niet.

## Controle vóór een eventuele publicatie

De review omvat exacte statische route-allowlists en CSP, uitsluitend twee
GET-aanvragen bij laden, onafhankelijke foutafhandeling, byte- en tijdgrenzen,
geen verborgen sessies of opslag, expliciete refresh, echte navigatie naar
de bestaande proeven, toetsenbordfocus en reflow op 320, 390 en 1440 pixels.
Controleer dat de bestaande sessie-, toestemmings-, ontvangst- en
veiligheidstests daarnaast blijven slagen. Rapporteer de werkelijke CI- en
handmatige resultaten afzonderlijk. Geen van deze controles is op zichzelf
een publicatiebesluit.

## Bewijsgrens van deze bouwstap — 16 oktober 2026

De lokale Node-proeven slagen: 59 authenticatieproeven (inclusief vier nieuwe
HTTP-routeproeven) en 59 bestaande NOVA-/apparaatproeven. De nieuwe ingang
heeft 18 browserproeven op mobiel en desktop; bestaande NOVA heeft 38 en de
zelfstandige RIO-app 24. De browser gebruikt de bij de lockfile horende
Chromium-revisie 1243. Foutantwoorden worden met lokale fixtures getest;
de gewone bereikbaarheid en navigatie met de echte lokale HTTP-app.

De eerste Windows-checkout zette de gepinde manifestbytes en inline HTML
om naar CRLF. Daardoor weigerde de manifestcontrole terecht te starten en
blokkeerde de bestaande CSP terecht het inline script. Canonieke LF-bytes
herstellen loste dat op. `.gitattributes` bewaart die bytes bij volgende
checkouts; er is geen manifestpin, CSP-permissie of beveiligingscontrole
verruimd. De mislukte pogingen worden hiermee verklaard, niet uitgewist.

De lokale OIDC-/TLS-integratie haalt 44 van 45 proeven. De overblijvende
bestaande proef verwacht POSIX-bestandsrechten via `chmod 0644`, terwijl de
implementatie die controle expliciet niet op Windows toepast. Linux-CI
moet de volledige 45 bevestigen. Certificaatvertrouwen, PKCE, ondertekende
providerantwoorden en gesloten accountbinding zijn hiermee afzonderlijk
getest; geen echte identityprovider of account is geactiveerd.

Een uitsluitend lezende HTTPS-controle op 16 oktober bevestigde HTTP 200
voor beide bestaande pagina's en beide runtimes. De live telefoonproef
rapporteerde nog steeds broncommit `fb762718a72a7e5f2d04bda9178a6842a498bb86`
en gesloten account-, contact- en E2EE-vlaggen. Daarbij zijn geen gasttestsessies,
uitnodigingen, koppelingen of berichten aangemaakt.

VORM9EVIN9-beoordeling: `VORM9EVIN9_READY_WITH_CONDITIONS`. De nieuwe pagina
blijft een reviewbaar voorstel. Publicatie, menselijke acceptatie en een
daadwerkelijke proef met twee fysieke apparaten zijn niet uitgevoerd.
Historische PALACO-blokkades #50 (menselijke acceptatie) en de onbekende
oorzaken van #51/#60/#64 worden door deze presentatie niet gesloten.
