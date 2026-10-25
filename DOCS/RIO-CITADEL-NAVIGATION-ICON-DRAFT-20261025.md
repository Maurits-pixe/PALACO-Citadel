# Citadel: origineel groen icoon in de RIO-navigatie

25 oktober 2026 · Draft PR 47 · fasebasis `00d1ed1e30532b791122b998f8c272aa70e40896`.
Geen merge, deploy of wijziging aan de bestaande Citadel-bestemming.

De zichtbare naam Citadel in de onderste navigatie wordt vervangen door het
door de gebruiker aangewezen groene beeld. De gebruiker koos uiteindelijk
uitdrukkelijk het onbewerkte origineel. De afbeelding wordt bytegelijk overgenomen;
afgewezen bewerkingen worden niet in de openbare bundel opgenomen.

## Herkomst en uitvoering

- Bron: gebruikersbijlage `codex-clipboard-434d4543-69ce-4605-a8cb-a5d506885902.png`.
- SHA256: `d5e0a25241eee79650ba481e4c7ebb01bf7d2792e97219b363888b7138909ea1`.
- PNG: 267 × 267 pixels, 93.133 bytes; bronbestand niet opnieuw gecodeerd of verscherpt.
- Openbaar asset: `/citadel-icon.png`, als binaire bytes gekopieerd door de builder.
- Weergave: 36 × 36 CSS-pixels, zonder afsnijden of afgeronde hoeken.
- Eén visueel verborgen naam Citadel blijft aanwezig; het decoratieve beeld heeft
  lege alt-tekst. De bestaande vertaalde aanduiding Consument blijft behouden.
- De bestaande link, vertrekwaarschuwing, focusmarkering en tikvlakken blijven werken.
- De expliciete openbare bundel en reviewserver bevatten nu 23 bestanden.
  Rootcache v49 neemt het icoon mee voor offline gebruik; appcache blijft v7.
  Oude v35/v37-cachefixtures krijgen het nieuwe bestand niet achteraf toegeschreven.
- De rootworker wacht normaal op oude gecontroleerde pagina's; geen geforceerde
  activatie, browsergegevens wissen of herladen van gebruikerstabs.

Dit record koppelt het gebruikte beeld aan de gebruikersbijlage. Een eerdere
zoektocht vond het donkere L.A.-favicon, maar de gebruiker wees dat af. Dit
record beweert niet dat de bijlage bytegelijk uit een geverifieerde GitHub-bron komt.

## Validatie

De 15 pakket-/HTTP-/corecontroles zijn op Windows uitgevoerd: 14 geslaagd,
0 mislukt, 1 symlinkcontrole overgeslagen wegens ontbrekend Windows-privilege.
Linux-CI moet die controle op de definitieve commit uitvoeren. De eerste
sandboxpoging kon lokale testverbindingen niet openen; dezelfde controles slagen
met toegang tot de eigen loopback-server. Dit is geen productfout.

De gerichte bestaande browserregressies slagen 28/28 in 88,188055 seconden:
navigatie, zelfstandige offline-app, oude workerupdates, cachescheiding en
vertrekkeuzes. Daarnaast slagen zeven oorspronkelijke-icoonproeven op 320, 390
en 1440 pixels, NL/AR en Franse 32px-tekst. Alle negen beelden zijn daadwerkelijk
bekeken; exacte bronbytes laden ook offline. Toegankelijke naam, native Tab-focus,
vertrekdialoog en behouden concepten zijn apart uitvoerbaar gecontroleerd.
Definitieve exacte-head CI krijgt zijn eigen uitvoertijd in het externe bouwrapport.
Een lokaal resultaat vóór commit wordt niet als definitieve CI-head beschreven.

## VORM9EVIN9 RECORD

- **Publiek en surface:** RIO-VisitCard, smalle mobiele en brede desktopnavigatie.
- **Onderwerp:** het door de gebruiker aangewezen groene Citadel-beeld, onbewerkt origineel.
- **Touchflow:** herkenbare Citadel-link; bestaande expliciete vertrekkeuze bij tijdelijk werk.
- **Begrijpelijkheid:** pictogram vervangt zichtbare merknaam; Citadel-naam blijft voor ondersteunende technologie en vertrekdialoog.
- **Toegankelijkheid:** 36px beeld binnen bestaand minimaal 44px tikvlak, toetsenbordfocus, RTL en vergrote tekst worden gecontroleerd; geen echte schermlezeracceptatie geclaimd.
- **RIO-context:** bestaande talen en afzonderlijke concepten; geen nieuwe identiteit, toestemming of rechten.
- **Provenance en grens:** gebruikersbijlage met exacte hash; de afbeelding verleent geen toegang. PRESENTATION ≠ PERMISSION.
- **Validatie:** 14 pakketcontroles geslaagd en één Windows-skip; 28 browserregressies en zeven icoonproeven geslaagd, negen beelden bekeken. Exacte-head CI wordt apart gebonden.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** draft-CI en lokaal afleverpakket afronden; fysieke telefoon-/schermlezeracceptatie blijft afzonderlijk.

## PALACO PROOF

PALACO PROOF: ON.

- **Proposition:** de Citadel-link toont het gekozen originele groene beeld en behoudt naam, bediening, vertrekkeuze en offline beschikbaarheid.
- **Scope and criterion:** bytegelijke PNG en expliciete 23-bestandenbundel; begrensde browsermetingen en beeldreview op mobiel/desktop, RTL en vergrote tekst.
- **Evidence:** bronhash, 23-bestandenmanifest, 14 pakket-/HTTP-controles, 28 bestaande browserregressies, zeven icoonproeven, negen bekeken beelden en exacte offline-afbeeldingsbytes. Uitvoerbestanden en tijden staan in de externe afleverregistratie.
- **Provenance:** bovenstaande fasebasis en gebruikersbijlage; final commit/CI krijgen hun eigen tijd en hash, zonder terugdatering.
- **Falsification:** gewijzigde bronbytes, afgewezen variant, leeg/onjuiste naam, onbereikbare link, verloren concept of offline ontbrekend icoon weerlegt de claim.
- **Status:** PROVEN_WITHIN_SCOPE.
- **Limits:** afbeelding niet als canonieke GitHub-brandbron geverifieerd; fysieke telefoon, werkelijke schermlezeruitspraak en echte account-/chattoelating vallen buiten deze wijziging. Geen merge of deploy.
