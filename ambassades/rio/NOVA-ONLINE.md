# NOVA online ontvangst en receptie v0.2

NOVA is een werkend onderdeel van het bestaande RIO-serverproces. Een browser kan bewust een kort verzoek naar de ontvangstservice sturen, het teruglezen en naar de receptie brengen. Daar kan dezelfde browsersessie een eerste ontvangstkeuze bevestigen of het verzoek weigeren. Op wacht zetten, hervatten en intrekken blijven beschikbaar.

De eerste bevestiging geldt uitsluitend voor deze receptie. Het is een knopkeuze in een tijdelijke browsersessie, geen bewijs van een menselijke identiteit of toestemming van een tweede persoon. De keuze opent geen contactruimte, privéruimte, verbinding of chat en verleent geen governance-, merge-, release- of uitvoeringsbevoegdheden. BRI9ADE- en STEWARD-controles, definitieve instemming van beide partijen en versleuteld contact zijn nog niet aangesloten.

## Tijdelijk en begrensd

Een willekeurige browsersessie leeft maximaal 15 minuten. Een verzoek leeft maximaal 5 minuten, of korter als de sessie eerder afloopt. Doorsturen, accepteren, weigeren, op wacht zetten of hervatten verlengt deze vaste termijnen niet. Per sessie zijn maximaal vier ontvangstbewijzen beschikbaar, ook nadat die geweigerd, ingetrokken of verlopen zijn. De sessie kan worden beëindigd om alles direct te verwijderen.

Gegevens staan uitsluitend in het geheugen van één serverproces. Een herstart of nieuwe deployment wist ze. Er is geen account, apparaatidentiteit, duurzame opslag, bezorggarantie, koppeling met BRI9ADE of end-to-endversleuteling. De sessie identificeert een browser met een tijdelijk cookie, geen mens. Gebruik korte testteksten en deel geen gevoelige gegevens.

De server maakt geweigerde, ingetrokken of verlopen verzoektekst leeg en wist daarbij ook de eerste bevestiging en de hervatstatus. Verlopen sessies worden uit zijn gegevensstructuren verwijderd. Een periodieke opruiming draait minstens iedere seconde. Beperkte metadata van een gesloten verzoek blijft tot het einde van de sessie bestaan, zodat hergebruik van dezelfde verzoeksleutel wordt geweigerd. Dit is geen garantie dat JavaScript-geheugen onmiddellijk fysiek wordt overschreven.

## HTTP-contract

Alle endpoints gebruiken de prefix `/api/rio/nova`. JSON-antwoorden zijn `no-store`; de RIO-serviceworker slaat deze endpoints niet op.

| Methode en pad | Resultaat |
| --- | --- |
| GET `/runtime` | Publieke processtatus v0.2, tijd, limieten, `receptionEnabled:true`, `firstAcceptanceEnabled:true` en `chatEnabled:false` |
| POST `/session`, body `{}` | Nieuwe sessie of hervatten van bestaande sessie; CSRF-token en eigen verzoeken |
| GET `/requests` | Ontvangstbewijzen en vaste sessievervaltijd |
| POST `/requests` | Ontvangst van `{text,idempotencyKey}`; 201 bij nieuw verzoek, 200 bij identieke herhaling |
| POST `/requests/:id/actions` | `{action,revision}` met `to_reception`, `accept`, `refuse`, `hold`, `resume` of `withdraw` |
| DELETE `/session`, body `{}` | Alle sessiegegevens verwijderen en cookie wissen |

Een ontvangstbewijs bevat `id,status,text,createdAt,expiresAt,revision,resumeTo,firstAcceptance`. De tijden zijn ISO-datums. `resumeTo` is alleen bij `ON_HOLD` gevuld met `RECEIVED` of `AT_RECEPTION`; elders is het `null`. `firstAcceptance` is alleen bij `FIRST_ACCEPTED` gevuld:

```json
{
  "acceptedAt": "2026-10-11T12:00:00.000Z",
  "scope": "reception-only",
  "actor": "browser-test-session"
}
```

De voorbeeldtijd is geen echt ontvangstbewijs. De server genereert de werkelijke tijd, scope en actor zelf. Deze velden kunnen niet door de client worden aangeleverd of aangepast. Bij alle andere statussen is `firstAcceptance:null`.

## Statussen en keuzes

| Huidige status | Actie | Nieuwe status en effect |
| --- | --- | --- |
| `RECEIVED` | `to_reception` | `AT_RECEPTION`; nog geen eerste bevestiging |
| `AT_RECEPTION` | `accept` | `FIRST_ACCEPTED`; eerste bevestiging met alleen receptiescope |
| `AT_RECEPTION` | `refuse` | `REFUSED`; tekst en bevestigingsvelden gewist |
| `RECEIVED` | `hold` | `ON_HOLD`, `resumeTo:RECEIVED` |
| `AT_RECEPTION` | `hold` | `ON_HOLD`, `resumeTo:AT_RECEPTION` |
| `FIRST_ACCEPTED` | `hold` | `ON_HOLD`, bevestiging gewist, `resumeTo:AT_RECEPTION` |
| `ON_HOLD` | `resume` | De door de server opgeslagen hervatstatus; `resumeTo` wordt weer `null` |
| Elke levende status | `withdraw` | `WITHDRAWN`; tekst en bevestigingsvelden gewist |
| Elke levende status | Vaste verzoektermijn verstreken | `EXPIRED`; tekst en bevestigingsvelden gewist |

Levende statussen zijn `RECEIVED`, `AT_RECEPTION`, `FIRST_ACCEPTED` en `ON_HOLD`. Rechtstreeks accepteren vanuit ontvangst of wachtstand is niet toegestaan. Een geaccepteerd verzoek dat op wacht wordt gezet, heeft na hervatten opnieuw een expliciete keuze bij de receptie nodig. Hervatten herstelt geen oude bevestiging. De browser verbergt verzoektekst, bevestiging en actieknoppen zodra de vaste termijn volgens zijn servertijdanker is bereikt, ook zonder verbinding. Hij toont dan dat het ontvangstbewijs vernieuwd moet worden; alleen een nieuw serverantwoord bevestigt de status `EXPIRED` en de actuele revisie.

`REFUSED`, `WITHDRAWN` en `EXPIRED` zijn gesloten statussen. Alle verdere acties en hergebruik van dezelfde verzoeksleutel geven 410. Een andere, niet toegestane overgang geeft 409. Een onbekende actie of extra veld geeft 400. Er bestaat geen actie of endpoint om chat, privétoegang of BRI9ADE-goedkeuring te openen.

Acties antwoorden met `{request:...}`; elke geldige overgang verhoogt de revisie één keer en bewaart de oorspronkelijke `createdAt` en `expiresAt`. Een oud revisienummer geeft 409. Een onbekend of vreemd ontvangstbewijs geeft dezelfde 404. Herhaalde actieknoppen kunnen zo geen tweede bevestiging of stille overschrijving maken.

Tekst telt maximaal 512 Unicode-codepunten en mag niet leeg of uitsluitend witruimte zijn. Verzoek-ID en idempotentiesleutel zijn 32 kleine hexadecimale tekens. Een idempotentiesleutel is uitsluitend binnen de eigen sessie geldig. Een identieke herhaling bewaart dezelfde ID, status, tijden, revisie en bevestigingsvelden; een veranderde tekst bij dezelfde sleutel geeft 409.

## Beveiliging en limieten

Schrijfacties vereisen de exacte ingestelde Origin, `application/json`, een schema zonder extra velden en maximaal 4 KiB body. Alle wijzigingen behalve de sessiestart vereisen ook `X-NOVA-CSRF`. Privé-GETs weigeren een expliciete vreemde Origin en browsermetadata die cross-site of same-site verkeer aanduidt.

Productie gebruikt `__Host-palacoNova`: 32 willekeurige bytes, `HttpOnly; Secure; SameSite=Strict; Path=/`. Het CSRF-token gebruikt afzonderlijke willekeurige bytes. HTTP is uitsluitend toegestaan met expliciete development-configuratie en een loopback-Origin; dan heet het cookie `palacoNova`.

Maximaal 256 sessies bestaan tegelijk. Maximaal 30 nieuwe sessies per minuut en 60 sessieacties per minuut zijn toegestaan. Alle receptiekeuzes tellen mee; hervatten van een sessie telt als een sessieactie. Eindigen blijft ook bij een uitgeput actiebudget beschikbaar. Limietfouten antwoorden met 429 of 503 en `Retry-After`. De module logt geen verzoektekst, ontvangst-ID, cookie of token.

## Testbaarheid en lifecycle

`mountNovaReception(app,options)` maakt per app een afzonderlijke, begrensde in-memory service. Een tweede mount op dezelfde app wordt geweigerd. De functie retourneert `close()`, die de opruimtimer stopt en alle verzoektekst, bevestigingen en sessiegegevens verwijdert.

Standaard volgen deadlines de monotone verstreken tijd, verankerd aan de starttijd van het proces. Tests kunnen een eigen `now()` injecteren; achterwaartse beweging wordt begrensd tot de laatst waargenomen tijd. Tests mogen TTLs en limieten verlagen via `sessionTtlMs,requestTtlMs,maxSessions,maxRequests,creationLimit,actionLimit,rateWindowMs`. De productieplafonds kunnen hiermee niet worden verhoogd.
