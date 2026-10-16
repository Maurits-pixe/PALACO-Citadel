# Eén RIO-preview: VisitCard, NOVA en de offline app

16 oktober 2026. **DRAFT / VOORBEREIDING. Geen merge, publicatie of
Render-instellingenwijziging uitgevoerd.** De gebruiker heeft na de oorspronkelijke
uitrolvraag expliciet gekozen: samenvoeging en tests als draft voorbereiden,
nog niet publiceren.

## Vastgestelde bronnen en bestemming

| Onderdeel | Vastgestelde bron |
| --- | --- |
| Tijdelijke VisitCard-preview | `Maurits-pixe/PALACO-Citadel`, `render/rio-preview-temporary`, `efda74f0b8f2e91bd694c770564d29ca669ab846` |
| NOVA, P.P.-model en offline app van deze chat | draft #45, `3a1c67551ef4925728e1c136fcdef001e653df27` |
| Behouden previewadres | `https://palaco-rio-preview-temporary.onrender.com` |
| Bestaande previewdienst | `srv-db8lc73rjlhs738nl3jg`, statische site in `M.B.'s workspace` |
| Huidige live previewdeployment | `dep-db8see3l550s73f1mt6g`, bron `efda74f…` |
| Bestaande proefserver | `https://palaco-ambassades.onrender.com`, dienst `srv-db4ktlqj9qps73cuvg7g`, bron `fb762718a72a7e5f2d04bda9178a6842a498bb86` |

Deze gegevens zijn alleen-lezen via Render en GitHub vastgesteld. De openbare
preview-index was HTTP 200 en bytegelijk aan de vastgepinde bron:
SHA-256 `732378d9adf97e88b7038a020cf4884aa9830329fd8faf94040aae044b9d4826`.
De twee bestaande diensten staan op handmatige publicatie. De andere werkruimte
`PALACO RIO` bevat een afzonderlijke PALACO-dienst; die is geen doel van deze draft.

## De samengevoegde ervaring

- `/`: bestaande VisitCard, onderwerpen, ELIXER-uitleg, deterministische
  Engine-oefening en afzonderlijke lokale chatdemo, met een nieuw NOVA-paneel
  in zeven talen.
- `/rio/`: de bestaande lokale app, elf talen, eigen installatie en contacten.
  Een wederzijdse navigatie verbindt VisitCard, app en receptie.
- `/rio/reception/`: NOVA, de P.P.-uitleg, het telefoon-OF-e-mailvoorbeeld en
  BRI9ADE-ontwerprollen. De twee proeven openen op de bestaande HTTPS-proefserver.
- `/rio/download`: zelfstandige HTML-app onder 100 KiB, ook zonder netwerk
  bruikbaar. De normale webapp gebruikt een extern eigen script zodat de
  voorbereide CSP geen inline scripts toestaat.

Een bevestigd telefoonnummer **of** bevestigd e-mailadres, via P.P. aan het
individuele ID gekoppeld, geeft chattoelating in het ontwerp. Wifi of mobiel
verandert dat ID niet. Deze pagina's voeren geen registratie, contactverificatie,
P.P.-uitgifte, echte accountaanmelding of chatactivering uit. De gedeelde
PALACO-context vervangt de afzonderlijke actor niet.

De tijdelijke chat en het Engine-dossier leven afzonderlijk in de geopende
VisitCard-pagina; navigatie draagt die inhoud niet over. De bestaande
taalkeuze gebruikt sessieopslag en appcontacten blijven lokale appgegevens.
De statische receptie zelf doet geen API-aanvraag en maakt geen sessie of opslag.
Deze samenvoeging verplaatst geen browsergegevens tussen de twee hosts en
maakt geen gedeelde account- of browsersessie aan.

## Bewuste technische grens

De bestaande tijdelijke dienst blijft een **statische site**. De bouwstap
kopieert een expliciete lijst van 22 publieke bestanden naar `render-dist`;
geen backendcode, testfixtures, persoonsregister, sleutels of accountcontracten.
De bestaande Citadel-dashboardbestanden aan de repositoryroot worden niet
overschreven. De nieuwe VisitCard-bron staat onder `ambassades/rio/visitcard/`.

De opgebouwde receptie krijgt de expliciete presentatievariant `static-preview`.
Zij toont **Niet bevestigd**, meldt dat zij geen bereikbaarheid meet en start
geen runtime-GET. De gewone servervariant behoudt haar eigen twee GET's en
offline-/herstelbescherming. Er is geen CORS-openstelling, proxy naar private
API's of versoepeling van Origin/Host-controles toegevoegd.

De appdownload en webapp krijgen navigatie in hun eigen bouwvariant. De
canonieke appbron en serviceworker v3 blijven ongewijzigd. Alleen de gecombineerde
webappvariant gebruikt cache v4 met vijf exacte bronnen, inclusief `/rio/start.js`.

## Caches, offline en privacy

De oude root-worker v35 verwijderde bij activering alle andere caches. De nieuwe
worker v36 verwijdert uitsluitend oude `palaco-rio-shell-`-caches en leest
uitsluitend zijn eigen cache. Hij bewaart twaalf exact genoemde publieke
bronnen, waaronder het NOVA-beeld. Andere origins, queryvarianten, POST's,
account-/API-routes en downloads vallen buiten deze cache.

De root-update gebruikt geen `skipWaiting` of `clients.claim`: bestaande
gecontroleerde VisitCard-pagina's mogen eerst sluiten. De `/rio/`-app heeft haar
eigen worker en cachefamilie. De migratietest activeert eerst de werkelijke vaste
v35-code op een leeg profiel, maakt daarna app- en onbekende caches aan en
test pas dan de wachtende v36-update. Hij beweert niet dat de oude destructieve
v35-activering veilig was. Beide apps worden daarna daadwerkelijk offline herladen.

De eerste integratierun vond nog externe Unsplash-afbeeldingsverzoeken in de
overgenomen preview. De CSP blokkeerde die; de strikte netwerkasserties bleven
terecht rood (4/10 geslaagd, 6 mislukt). De bron is gecorrigeerd naar een lokaal
CSS-landschap. Alle zeven talen en onderwerp-/chatmetadata benoemen nu een
fictieve illustratie met ontwerpstatus; er is geen echte foto of locatiebewijs
verzonnen en geen externe afbeelding gedownload. De oorspronkelijke fout blijft
onderdeel van de verificatiegeschiedenis.

## Reproduceerbare controle

```sh
node --test scripts/build-rio-unified-preview.test.mjs
npx playwright test --config tests/rio-unified-preview/playwright.config.mjs
npx playwright test --config ambassades/rio/reception/playwright.config.mjs
```

De bouwproeven controleren de daadwerkelijke publieke uitvoer en hashes,
gescheiden download-/webvariant, oorspronkelijke appbytes, vaste proefhost,
gesloten vlaggen en handmatige statische configuratie. De browserproeven
controleren navigatie, zeven/elf talen, RTL, uitleg zonder API-verkeer,
download als werkelijk offline bestand, cachegrenzen en werkelijke wachtende
update met behoud van lokale contacten en onbekende caches.

Lokaal geslaagd: drie bouwproeven, tien gezamenlijke browserproeven en daarna
twee aanvullende kernscenario's voor illustratie, ELIXER, expliciete
Engine-toestemming met bronverwijzing, afzonderlijke chat, wissen/herladen
en afwezigheid van bericht-/dossierinhoud in opslag. Die extra test had eerst
een onjuiste CSS-selector; de bestaande tekstassertie is behouden en alleen
de selector gecorrigeerd. Beide gevallen slagen daarna. Ook de bestaande
serverreceptiesuite slaagt met 28 proeven.

De schermcontrole omvat root en receptie op 320, 390 en 1440 pixels en op
390 pixels met daadwerkelijk root- en bodytekst van 32 pixels. Geen overloop,
JavaScript-/consolefouten of API-/externe aanvragen. Een impliciete favicon-404
is opgelost met bestaande pictogrammen. Extra onderruimte maakt de volledige
footeruitleg ook bij dubbele tekstgrootte vrij van de vaste chatknop. De
nieuwe knoppen zijn met werkelijke klik- en hittests gecontroleerd. Dit is
geen algemene toegankelijkheidscertificering of fysieke apparaattest.

Het configuratievoorstel `ambassades/deployment/render-unified-preview.yaml`
is JSON in geldige YAML-vorm. Het is lokaal gevalideerd tegen het officiële
[Render-schema](https://render.com/schema/render.yaml.json), opgehaald op
16 oktober 2026, SHA-256
`8a3fb8da6b4f55fe686fbefa790e011d3dd7895f013f355953c572a21ab6494a`,
met jsonschema 4.25.1, Draft 2020-12. De Render CLI is hier niet aanwezig;
er is geen Blueprint toegepast en geen deploy gestart. Exacte nieuwe head,
CI-runs, aantallen en schermmetingen worden in de draft-PR vastgelegd.

## Klaargezette latere uitrol en terugweg

Deze stappen zijn een voorbereide procedure, geen verleende publicatietoestemming:

1. Laat de exacte nieuwe head, de beide volledige CI-runs, het publieke
   bouwmanifest, de beveiligingsheaders en menselijke bevindingen beoordelen.
2. Controleer opnieuw service-ID, statische runtime, eigenaar en huidig live
   deployment-ID. Bewaar een volledige instellingenmomentopname. Hergebruik
   uitsluitend de genoemde tijdelijke dienst; maak geen vervangende dienst aan.
3. Pas na een afzonderlijke publicatieopdracht: richt die bestaande dienst
   op de beoordeelde bron, `node scripts/build-rio-unified-preview.mjs` en
   `render-dist`, met automatisch publiceren uit en de voorgestelde headers.
   Geen geheime variabelen of nieuwe account-/providerinstellingen toevoegen.
4. Controleer alleen openbare GET's, exacte bronhashes, CSP, lokale navigatie
   en de vaste proefserverlinks. Een fysieke twee-apparatenproef vereist
   afzonderlijke waarneming en mag niet uit browseremulatie worden afgeleid.
5. Bij een fout: stop verdere wijzigingen en herstel de vorige vaste deployment
   en opgeslagen instellingen. **De oude v35-worker heeft een destructieve
   cache-activering.** Rol daarom niet blind ook de worker terug: een veilige
   herstelbuild houdt de begrensde cachelogica, verhoogt het versienummer en
   herstelt de vorige overige pagina's. Browsercache en lokale contacten zijn
   geen herstelbare serverbackup. Bewaar negatieve test- en deploymentbewijzen.

De bestaande proefserver en de afzonderlijke PALACO-dienst blijven buiten
deze procedure. Persoonlijke accounts, werkelijke P.P.-registratie,
contactverificatie, finale instemming, operationele BRI9ADE en E2EE blijven
afzonderlijke aansluitingen. Menselijke acceptatie #50 blijft HOLD; historische
oorzaken #51/#60/#64 worden niet als opgelost aangemerkt.

## VORM9EVIN9 RECORD en PALACO PROOF

VORM9EVIN9: `VORM9EVIN9_READY_WITH_CONDITIONS`. Doelgroep is de gebruiker op
telefoon en computer; de kaart, NOVA en app geven een herkenbare vervolgstap.
Touch, focus, RTL en reflow worden in lokale browser- en schermcontroles
beoordeeld. Presentatie verleent geen identiteit, consent of bevoegdheid.

**PALACO PROOF: ON**

- **Proposition:** beide gepinde RIO-bronnen vormen één begrensde statische preview met gescheiden lokale state en caches.
- **Scope and criterion:** alleen de gebouwde publieke uitvoer, lokale browserproeven en CI op de exacte draft-head.
- **Evidence:** bronpinnen, actuele Render-readbacks, publieke indexhash, bouwmanifest, positieve en negatieve browseruitvoer.
- **Provenance:** genoemde commits, diensten en deployment-ID; oorspronkelijke previewhashes staan naast de geïmporteerde bron, uitvoerhashes buiten de publieke map.
- **Falsification:** externe achtergrondaanvraag, account/API-publicatie, cacheverlies, automatische oude-pagevervanging of onjuiste contactclaim faalt de controles.
- **Status:** `PROVISIONAL` totdat volledige CI en schermcontrole op de nieuwe head voltooid zijn.
- **Limits:** geen publicatie, echte verificatie, fysieke telefoonacceptatie, zelfstandig werkende chatdienst of bestuurlijke bevoegdheid.
