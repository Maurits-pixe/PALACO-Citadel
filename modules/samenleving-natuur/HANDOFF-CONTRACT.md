# PALACO Citadel — Samenleving & Natuur: overdrachtscontract v1.0-rc15

Status: **DRAFT / HOLD**. Dit is een lokaal import/export-contract, geen serverprotocol, digitale handtekening, formeel bewijs of automatische koppeling met Wereldatlas/Geheugenkamer.

## Doel

Gegevens blijven standaard op het apparaat. Uitwisseling vindt uitsluitend plaats door een expliciet gedownload en gekozen JSON-bestand. Gebruikers dienen vóór delen te controleren op persoonsgegevens en kwetsbare natuurlocaties.

### Eigen register

`palaco-citadel-natuur-v1` met `entries`. Dit is een **back-upformaat** dat een gebruiker na expliciete bevestiging kan terugzetten; geen handoff-formaat voor andere modules.

### Overdracht

`palaco-citadel-handoff-v1`:
- `source`: `citadel/samenleving-natuur`;
- `privacy`: `minimal-user-controlled` (standaard) of `full-user-controlled`;
- `authority`: `unverified-user-observations` (informatief, geen ondertekend bewijs);
- `records`: ten hoogste 500 items;
- `intendedRecipient`: expliciet `wereldatlas` of `geheugenkamer` bij nieuwe exports;
- `transferMode`: `manual-file-preview-only` — uitsluitend lokale overdracht via een door de gebruiker gekozen bestand;
- `summary`: per conceptueel leefgebied geaggregeerde tellingen, geen geografische coördinaten.

Compatibiliteit: oudere handoff-v1-pakketten zonder deze twee aanvullende velden blijven leesbaar. Bij aanwezigheid worden beide velden strikt gevalideerd. De bestemming is **een intentieveld**, geen routering, authenticatie of bewijs van verwerking door de ontvangende module.

Bij beschadigde of incompatibele lokale opslag zijn gewone back-up- en handoff-exports geblokkeerd. Alleen de ruwe originele opslag kan dan als tekst worden veiliggesteld; een misleidend leeg exportpakket wordt voorkomen.

Minimaal record: `sequence` (integer vanaf 1), `category`, `conceptualArea`, `verification`, `recordedMonth` (YYYY-MM). Dit type is **alleen ter inzage** en kan nooit automatisch tot volledige observaties worden verheven.

Volledig record: `id`, `title`, `category`, `conceptualArea`, `verification`, `description`, `observedAt` (ISO-achtige datumtijd). Deze velden kunnen identificerende of vertrouwelijke informatie bevatten. Volledige export vereist daarom extra bevestiging.

## Invoerbeleid

1. Bestanden boven 2 MB, onbekende schema's, verkeerde bron, ongeldige categorie/gebied/status, ongeldige datum en te veel records worden afgewezen.
2. Het systeem vergelijkt ID's en inhoud tegen het **actuele** lokale register en tegen eerdere kandidaten in hetzelfde pakket.
3. Een identiek bestaand record wordt overgeslagen; een ID met afwijkende inhoud wordt afgewezen.
4. De gebruiker ziet aantallen en moet expliciet toestemming geven, gevolgd door een tweede bevestiging.
5. Alle nieuwe records krijgen bij import `nog te verifiëren`, ongeacht de status in het pakket.
6. De ontvangst verwerkt geen automatische synchronisatie, netwerkanvragen of serverautorisatie.
7. **Beperking:** inhoudsduplicaten en device-klokken bieden geen cryptografische herkomstgarantie; identieke data kan legitiem zijn. Een later cryptografisch contract moet afzonderlijk worden beoordeeld.

## Tests

De repository bevat `module.spec.mjs` met Playwright-regressies voor navigatie, geïsoleerde controles, expliciete toestemming, import-replay en minimale pakketten.

Vanaf de repository-root met devDependencies en browser geïnstalleerd:

```sh
npx playwright test --config modules/samenleving-natuur/playwright.config.mjs
```

De ingebouwde tien controles in de Ontvangstruimte kunnen zonder wijzigingen aan gebruikersdata worden uitgevoerd en als JSON-rapport worden geëxporteerd. **Een aanwezige test is geen geslaagde test**: registreer runnerresultaten en browser-/mobiele evidence voordat HOLD wordt heroverwogen.

## Lokale ontvangstdemonstratie rc11

`recipient-preview.html` is een zelfstandige, alleen-lezen ontvangstpreview voor de twee **beoogde** ontvangers. De gebruiker kiest een ontvangend hoofdstuk en importeert handmatig een bestand. Het bestand wordt lokaal gecontroleerd op schema, bron, eventuele bestemming, privacyvorm, categorie, conceptuele zone, verificatiestatus, uniciteit en tijdnotatie. Inhoud verschijnt alleen als tekst, niet als HTML. Bij wijziging van het hoofdstuk of bij wissen wordt de tijdelijke weergave verwijderd. Er is geen opslag, synchronisatie, autorisatie, servercommunicatie, authenticiteitscontrole of verbinding met live Wereldatlas/Geheugenkamer. Bestaande handoff-v1-bestanden zonder ontvangersveld zijn voor compatibiliteit bruikbaar wanneer de gebruiker handmatig een bestemming kiest.

De preview is **geen bewijs** dat een ontvangende module zelf het pakket verwerkt. Een werkelijke integratie vergt aparte implementatie en acceptatie in beide doelapplicaties.

## Ontvangstbeveiliging rc12

De alleen-lezen ontvanger weigert minimaal gelabelde bestanden wanneer records alsnog `id`, `title`, `description` of `observedAt` bevatten. Daarmee voorkomt de preview dat persoonsgegevens onopgemerkt als privacy-minimale gegevens worden behandeld. Dubbele `sequence`-waarden worden afgewezen. Wijziging van de ontvanger of wissen trekt een eerder geladen voorvertoning in; lopende asynchrone bestandslezingen mogen die niet opnieuw zichtbaar maken. Nieuwe browserregressies controleren deze invarianten. Dit verandert niets aan de autorisatiestatus van externe modules.

## Exacte recordschema's rc13

De alleen-lezen ontvangstpreview staat per record uitsluitend de expliciet gespecificeerde velden toe. Voor minimaal: `sequence`, `category`, `conceptualArea`, `verification`, `recordedMonth`. Voor volledig: `id`, `title`, `category`, `conceptualArea`, `verification`, `description`, `observedAt`. Onbekende, ontbrekende of aanvullende velden veroorzaken afwijzing van het gehele pakket. Deze striktheid geldt voor de v1-ontvangstpreview; schema-uitbreidingen vergen een afzonderlijke versie en review. Metadata op pakketniveau is niet in deze veldwhitelist opgenomen. Dit is nog geen cryptografische herkomst- of authenticiteitscontrole.

## Metadata-integriteit rc14

De alleen-lezen ontvangstpreview controleert optionele pakketmetadata bij aanwezigheid: `authority` moet `unverified-user-observations` blijven, `transferMode` blijft handmatig, `exported` moet een valide datumtijd zijn en `destinationHints` moet beide bekende bestemmingen exact eenmaal bevatten. Een meegeleverde `summary` moet overeenkomen met het aantal records, de status van verificatie, actieve conceptuele zones en de `flora`-/`fauna`-/totaaltellingen voor elk van de zes zones. Ontbrekende `summary` blijft toegestaan voor oudere v1-pakketten. De controles bieden consistentiecontrole, **geen cryptografische authenticiteit of digitale handtekening**; een aanvaller kan gegevens én tellingen tegelijk veranderen. Uitgebreide gegevenscontracten vereisen expliciete review.

## SHA-256-integriteitslaag rc15

Nieuwe Citadel-overdrachtspakketten bevatten `integrity: { algorithm: "SHA-256", canonicalization: "palaco-sorted-json-v1", digest: "<64 kleine hextekens>" }`. De hash wordt berekend over het volledige pakket **zonder** de `integrity`-eigenschap. Canonicalisatie: recursief op lexicografische sleutelvolgorde gesorteerde objecten, arrays behouden hun oorspronkelijke volgorde, primitive waarden via JSON-serialisatie; vervolgens UTF-8 en SHA-256 met WebCrypto. Ontvangst controleert de hash vóór weergave; bij een afwijking volgt afwijzing. Oudere pakketten zonder `integrity` blijven leesbaar, met zichtbare waarschuwing dat integriteit niet cryptografisch is gecontroleerd. Onbekende algoritmes of malformed digest worden geweigerd. Deze laag biedt detectie van niet-bijgewerkte wijzigingen na export, **geen digitale handtekening, sleutelbezit, vertrouwde bron, authenticiteit of autorisatie**. Een tegenstander kan inhoud en hash samen wijzigen. Geen netwerkverkeer en geen automatische registratie in de ontvangende modules.
