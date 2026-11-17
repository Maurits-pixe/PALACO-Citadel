# PALACO Citadel — Samenleving & Natuur: overdrachtscontract v0.9

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
- `summary`: per conceptueel leefgebied geaggregeerde tellingen, geen geografische coördinaten.

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
npx playwright test modules/samenleving-natuur/module.spec.mjs
```

De ingebouwde tien controles in de Ontvangstruimte kunnen zonder wijzigingen aan gebruikersdata worden uitgevoerd en als JSON-rapport worden geëxporteerd. **Een aanwezige test is geen geslaagde test**: registreer runnerresultaten en browser-/mobiele evidence voordat HOLD wordt heroverwogen.
