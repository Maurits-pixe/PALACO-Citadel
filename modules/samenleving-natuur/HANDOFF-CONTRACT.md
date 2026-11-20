# PALACO Citadel — Samenleving & Natuur: overdrachtscontract v1.0-rc27

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

## Ontvangstbeleid rc16 — standaard SHA-256 vereist

De lokale alleen-lezen ontvanger **weigert standaard** v1-pakketten zonder `integrity`. Gebruikers kunnen de optie `Oud pakket zonder SHA-256-hash bewust toestaan` expliciet inschakelen om legacy-data te bekijken, met een duidelijke waarschuwing dat er geen cryptografische integriteitscontrole is uitgevoerd. Bij wijziging van deze optie wordt iedere geladen preview ingetrokken, de bestandskeuze gereset en een eventuele lopende asynchrone verwerking ongeldig gemaakt. Voor pakketten met een aanwezige hash is SHA-256-verificatie altijd verplicht, ook wanneer de legacy-optie aanstaat: een niet-kloppende hash wordt nooit via de uitzondering geaccepteerd. Deze instelling wordt niet opgeslagen; na herladen geldt opnieuw het strengste beleid. Deze beperking beschermt tegen onbedoelde acceptatie van ongecontroleerde pakketten, maar levert nog altijd geen authenticiteit, identiteit, sleutelbeheer of autorisatie op.

## Lokale handtekeningverificatie rc17 (laboratorium)

De zelfstandige read-only ontvanger bevat een afzonderlijk laboratorium voor **losse digitale handtekeningen**. Input: (1) reeds lokaal geladen en SHA-256-gecontroleerd handoff-JSON-pakket, (2) handmatig aangeleverde publieke EC P-256-sleutel als JWK met `kty`, `crv`, `x`, `y`, (3) een detached JSON-handtekening met exact `schema: "palaco-citadel-signature-v1"`, `algorithm: "ECDSA-P256-SHA256"`, `keyFingerprint` en `signature` (base64). Het handtekeningbewijs wordt berekend over de UTF-8-gecodeerde `palaco-sorted-json-v1`-canonicalisatie van het **volledige pakket, inclusief integrity**. De sleutelvingerafdruk is SHA-256 van de canonical JSON van uitsluitend de vier publieke JWK-velden. Verificatie verloopt met WebCrypto ECDSA P-256/SHA-256. Geen privésleutel wordt ontvangen of bewaard en geen sleutel wordt automatisch als vertrouwd aangemerkt. Een geldige handtekening betekent enkel dat de bijbehorende privésleutel de ondertekende bytes heeft ondertekend; **niet** dat de ondertekenaar tot PALACO behoort, de sleutel geautoriseerd is, de gegevens waar zijn of EDTR-bewijs is uitgegeven. Een operationele vertrouwenslaag vereist een afzonderlijk goedgekeurd sleutelregister, revocatie, sleutelrotatie, beleidscontrole en menselijke acceptatie. De labuitslag wordt niet opgeslagen en verleent geen autorisatie.

## Lokale intrekkingscontrole rc18 — uitsluitend denylist

Het handtekeninglaboratorium accepteert optioneel een lokaal JSON-bestand met exact `schema: palaco-citadel-revocations-v1` en `fingerprints: [<sha256-fingerprint>, ...]`. Maximaal 500 unieke, kleine hexadecimale SHA-256-vingerafdrukken en maximaal 20 KB bestand. Komt de vingerafdruk van de opgegeven publieke sleutel op de lijst voor, dan wordt een handtekeningcontrole geweigerd met status **SLEUTEL INGETROKKEN volgens lokaal aangeleverde lijst**. Bij afwezigheid van een vermelding wordt vertrouwen **niet** toegekend: er is geen goedgekeurde bron, identiteit, lifecycle, handtekening op de revocatielijst of actualiteitsgarantie. Geen opslag van de lijst, geen sleutelregister, geen automatische rechten. Wijzigingen in pakket, handtekening, publieke sleutel of intrekkingslijst maken eerdere voorlopige verificatie-uitkomsten ongeldig en worden beschermd tegen vertraagde asynchrone afronding. Voor productie zijn een authenticiteitscontrole van de lijst, vertrouwde distributie, expiratie, sleutelrotatie en beleidsscheiding noodzakelijk.

## Getekende intrekkingslijst v2 · rc19

Naast legacy v1 accepteert het alleen-lezen lab optioneel een getekende v2-lijst met exact `schema: palaco-citadel-revocations-v2`, `issuerFingerprint`, `issuedAt`, `expiresAt`, `fingerprints` en `signature` (ECDSA P-256/SHA-256 als base64). De gebruiker levert de **publieke uitgeverssleutel** apart als EC P-256 JWK aan. De SHA-256-vingerafdruk hiervan moet overeenkomen met `issuerFingerprint`. De handtekening wordt gecontroleerd over UTF-8 `palaco-sorted-json-v1` van het JSON-object zonder `signature`. Een v2-lijst is maximaal 31 dagen geldig, mag niet verlopen zijn en `issuedAt` mag maximaal vijf minuten in de toekomst liggen. Een verlopen, onjuist ondertekende of gemanipuleerde v2-lijst blokkeert de verificatie, ook wanneer de betreffende gebruikerssleutel niet op de lijst staat. V1 blijft beschikbaar als expliciet lokaal niet-authenticeerbaar terugvalformaat. **De publieke uitgeverssleutel wordt handmatig opgegeven, niet aan een onafhankelijk PALACO-trust anchor getoetst.** Ook een cryptografisch geldige v2-lijst is daarom NIET VERTROUWD. Er is geen sleutelregister, geen anti-rollback-persistentie, geen ondertekende beleidsketen of live autorisatie. Voor productie zijn goedgekeurde trust anchors, distributie, rotatie, revocatie en onafhankelijke review vereist.

## Opt-in anti-rollback voor getekende v2-lijsten · rc20

Het lokale handtekeninglaboratorium kan na een **succesvolle cryptografische v2-lijstcontrole** en afzonderlijke gebruikerstoestemming het `issuedAt`-tijdstip vastleggen onder de sleutel `palaco.citadel.revocation-pin.v1.<issuerFingerprint>` in browser-localStorage. Een later aangeboden v2-intrekkingslijst met dezelfde uitgeversvingerafdruk en een vroeger `issuedAt`-tijdstip wordt geblokkeerd. Het vastleggen is monotone (een nieuw pin-tijdstip mag niet lager zijn), en voor de bediening is een aparte bevestiging nodig. Niet-vastgelegde resultaten hebben geen anti-rollbackgarantie. Dit beleid blijft beperkt tot **deze browser/opslagcontext**, waarvan de inhoud kan worden gewist, vervangen of omzeild; het is dus geen beveiligde monotone teller of betrouwbaar server-anker. Lijsten met hetzelfde uitgiftetijdstip maar andere inhoud worden hiermee nog niet als replay gedetecteerd. De uitgeverssleutel is nog niet onafhankelijk vertrouwd en een lokaal vastgelegde datum verleent geen PALACO-autorisatie. Uitval van de lokale opslag verhindert het succesvol vastleggen. Voor operationele bescherming zijn een vertrouwd en gesigneerd distributiekanaal, versie-/epoch-regels, sleutelrotatiebeleid, beveiligde monotone opslag en audit noodzakelijk.

## Inhoudsgebonden anti-rollback · rc21

De optionele lokale vastlegging bewaart nu een JSON-object `{issuedAt, digest}` per uitgeversvingerafdruk onder dezelfde opslagprefix. `digest` is een SHA-256-hexwaarde over de canonical JSON van de **volledige ondertekende v2-intrekkingslijst**, inclusief `signature`. Een oudere `issuedAt` wordt geweigerd; bij hetzelfde tijdstip wordt een afwijkende inhoudsvingerafdruk eveneens geweigerd. Een identiek opnieuw aangeboden bestand is toegestaan. Oudere opslagrecords die uitsluitend een tijdstip bevatten blijven herkenbaar, maar een v2-lijst met **hetzelfde** tijdstip wordt uit veiligheid geweigerd omdat een inhoudsvergelijking ontbreekt. Een recenter, correct ondertekend v2-bestand kan met expliciete bevestiging de vastlegging upgraden. De lokale opslag is nog steeds door de gebruiker manipuleerbaar/wisbaar en levert geen veilige monotone teller, vertrouwde root of operationele bevoegdheid. Dit mechanisme voorkomt geen hergebruik van hetzelfde getekende bestand en geen rollback op andere apparaten.

## Sleutelrotatiecontract v1 · rc22 (alleen lokaal laboratorium)

De zelfstandige read-only ontvangstpreview ondersteunt een los rotatiebestand met exact de velden `schema: "palaco-citadel-key-rotation-v1"`, `epoch` (positief geheel getal), `issuedAt` (geldige ISO-datum niet meer dan vijf minuten in de toekomst), `oldFingerprint`, `newFingerprint` en `signature`. Zowel de oude als de opvolgende publieke P-256-sleutel wordt handmatig als uitsluitend publieke EC-JWK verstrekt. De beide SHA-256-vingerafdrukken worden berekend over canonical JSON van alleen `kty`, `crv`, `x` en `y` en moeten exact bij het bestand horen. Het rotatiedocument wordt met de **oude** P-256-sleutel geverifieerd via ECDSA/SHA-256, over canonical JSON zonder de `signature`-eigenschap. De oude en nieuwe sleutel moeten verschillend zijn. Manipulatie van tijdstip, epoch of sleutelvingerafdruk maakt de handtekening ongeldig. De uitkomst is alleen `cryptografisch geldige sleutelopvolging` of afwijzing; geen sleutel wordt door dit document als vertrouwd, door PALACO uitgegeven of geautoriseerd aangemerkt. De epoch wordt nog niet tegen een onafhankelijk vertrouwd, persistent sleutelregister gecontroleerd en deze stap activeert de opvolgende sleutel niet. Operationele rotatie vereist een apart vertrouwd register, rollen- en bevoegdhedenbeleid, revocatie van de oude sleutel, menselijke beoordeling en audit.

## Lokaal sleutelregistercontract v1 · rc23

Optioneel bij de sleutelopvolgingspreview: een **alleen-lezen**, handmatig aangeleverd JSON-register met exact `schema: "palaco-citadel-key-registry-v1"`, `epoch` (niet-negatief veilig geheel getal), `activeFingerprint` (64 kleine SHA-256-hextekens) en `status: "active"`. Na succesvolle ECDSA-verificatie van de rotatieverklaring moet de oude sleutelvingerafdruk exact de actieve sleutel in het register zijn en moet `rotation.epoch = registry.epoch + 1`. Afwijkende epochs, onbekende of ingetrokken status of een verkeerde sleutel worden afgewezen. Een wijziging van het register maakt eerdere UI-resultaten ongeldig. Het register wordt **niet opgeslagen, niet gewijzigd en niet cryptografisch geauthenticeerd**. Het is daarom nadrukkelijk geen betrouwbaar PALACO-trust anchor en kan geen opvolgingssleutel activeren, eigenaar aanwijzen, bevoegdheden overdragen of een EDTR uitgeven. Voor een operationele registerspecificatie zijn ondertekende snapshots met onafhankelijke root, sleutelrotatiebeleid, anti-rollback, maker-checker-goedkeuring, tijdgebonden revocatie en audit vereist.

## Getekend sleutelregistersnapshot v2 · rc24

Het lokale read-only sleutelrotatielab accepteert optioneel een v2-snapshot met exact `schema: "palaco-citadel-key-registry-v2"`, `epoch`, `activeFingerprint`, `status: "active"`, `issuerFingerprint`, `issuedAt`, `expiresAt`, `signature`. De uitgever levert handmatig een publieke EC P-256 JWK aan. Zijn SHA-256-vingerafdruk over de canonical JSON van de vier publieke velden moet overeenkomen met `issuerFingerprint`. De ECDSA P-256/SHA-256-handtekening wordt geverifieerd over de canonical JSON van het register zonder `signature`. Uitgiftetijd mag niet meer dan vijf minuten in de toekomst liggen, `expiresAt` moet in de toekomst liggen en de geldigheid mag maximaal 31 dagen zijn. Een verlopen of gemanipuleerd snapshot wordt geweigerd; na verificatie volgen dezelfde controle op actieve oude sleutel en epoch+1. Een ouder v1-register blijft als expliciet niet-geauthenticeerd formaat geaccepteerd voor het lab. **Een handmatig aangeboden publieke uitgeverssleutel is geen trust anchor; ondertekening alleen verleent geen PALACO-identiteit, bevoegdheid, sleutelactivering of EDTR-uitgifte.** Er is nog geen onafhankelijk gecontroleerd rootcertificaat, maker-checker, veilig anti-rollback-register of live registerdistributie.

## Gescheiden maker-checker-handtekeningen · rc25

Het lokale alleen-lezen rotatielab heeft een optionele, **expliciet in te schakelen** strengere controle `Twee afzonderlijke handtekeningen vereisen`. Bij inschakeling zijn een geldig ondertekend **v2-registersnapshot**, een tweede publieke P-256 JWK en een afzonderlijke checker-attestatie nodig. Het checkercontract bevat exact `schema: "palaco-citadel-registry-approval-v1"`, `decision: "approve"`, `issuedAt`, `registryDigest`, `checkerFingerprint` en `signature`. `registryDigest` is SHA-256 over de canonical JSON van het volledige **getekende** registersnapshot (inclusief maker-signature). `checkerFingerprint` is SHA-256 van de publieke checker JWK (`kty`, `crv`, `x`, `y`), moet van de publieke maker/uitgever verschillen, en de checker-handtekening wordt met WebCrypto ECDSA P-256/SHA-256 over de attestatie zonder `signature` gecontroleerd. De goedkeuring mag niet vóór het uitgiftetijdstip van het register liggen, niet na `expiresAt` en niet meer dan vijf minuten in de toekomst. Een ontbrekend bestand, onjuiste digest, ontbrekende tweede sleutel of ongeldig tijdstip leidt in deze strengere modus tot afwijzing. De optie wordt niet opgeslagen en wijzigt geen register of sleutel. Dit bewijst **alleen twee cryptografische ondertekeningen**: beide publieke sleutels blijven handmatig aangeleverd en NIET VERTROUWD. Dit is nog geen onafhankelijk geauthenticeerde maker-checker-governance, geen goedgekeurd trust anchor, geen eigenaarstoestemming en geen operationele PALACO-autorisatie. De eerdere compatibiliteitsmodus blijft beschikbaar; productie moet fail-closed governance, onafhankelijke trust anchors, approval/audit beleid en gekwalificeerde menselijke acceptatie afdwingen.

## Lokale verificatie-audit v1 · rc26

Na een uitgevoerde (geslaagde of afgewezen) rotatiecontrole kan de gebruiker een **handmatig JSON-auditrapport** exporteren: `schema: palaco-citadel-rotation-audit-v1`, `result` (zoals `CRYPTOGRAPHICALLY_VALID_UNTRUSTED`, `DENIED_SIGNATURE`, `DENIED_REGISTRY`, `DENIED_VALIDATION`, `DENIED_INPUT`), `checkedAt`, `policy`, `oldFingerprint`, `newFingerprint`, `epoch`, `trust: untrusted-local-inputs`, `authorization: DENY`, `issuance: HOLD`, aanwezigheid van invoer en `fileSha256` van lokaal geselecteerde bestanden. De export bevat **geen privésleutels of ruwe observatiegegevens**. De uitvoer is een niet-ondertekend lokaal zelfrapport, geen onafhankelijk bewijs of onveranderbare audit trail; hij kan na downloaden worden aangepast. Bij een wijziging in relevante invoervelden of wissen van de preview wordt het oude auditresultaat ingetrokken. De export laat geen status- of bevoegdheidsverhoging toe en verstuurt niets naar een server of doelapp. Voor productie zijn onafhankelijke trust anchors, gebeurtenis-ID's, ondertekende append-only audit, policy-evaluatie en expliciete menselijke besluitvormingsbevoegdheid noodzakelijk.

## Auditrapportintegriteit rc27 — SHA-256, geen authenticiteit

Nieuw lokaal geëxporteerde `palaco-citadel-rotation-audit-v1`-rapporten hebben een `integrity`-object met exact `algorithm: SHA-256`, `canonicalization: palaco-sorted-json-v1` en een digest van 64 kleine hextekens. De SHA-256 wordt berekend over de UTF-8-canonicalisatie van het volledige auditrapport **zonder `integrity`**, maar inclusief `authorization: DENY`, `issuance: HOLD`, uitkomstcode, tijdstip, sleutelfingerprints en `fileSha256`. De zelfstandige lokale ontvangstpreview kan een eerder gedownload JSON-auditrapport (maximaal 100 KB) inlezen en het contract, verplichte veiligheidsstatus en deze digest opnieuw controleren. Ontbrekende, vervalste of niet-kloppende digests leiden tot afwijzing. Het opnieuw kiezen van een bestand maakt een eerdere uitslag ongeldig. **Deze hash is geen digitale handtekening.** Iedereen kan een rapport aanpassen en de SHA-256 opnieuw berekenen. Er is geen onafhankelijke bronidentiteit, officieel auditbewijs, append-only keten, veilige klok of bevoegdheidsbesluit. De import schrijft niets naar een register en activeert nooit sleutels of EDTR-uitgifte. Voor productierijp bewijs blijft een goedgekeurde handtekening, vertrouwd tijdstip, beveiligde opslag en menselijke besluitvorming nodig.
