# NOVA online ontvangst v0.1

NOVA is een werkend onderdeel van het bestaande RIO-serverproces. Een browser kan bewust een kort verzoek naar de ontvangstservice sturen, het teruglezen, op wacht zetten, hervatten of intrekken. Dit opent geen contactruimte of chat en verleent geen bevoegdheden.

## Tijdelijk en begrensd

Een willekeurige browsersessie leeft maximaal 15 minuten. Een verzoek leeft maximaal 5 minuten, of korter als de sessie eerder afloopt. Per sessie zijn maximaal vier ontvangstbewijzen beschikbaar, ook nadat die ingetrokken of verlopen zijn. De sessie kan worden beëindigd om alles direct te verwijderen.

Gegevens staan uitsluitend in het geheugen van één serverproces. Een herstart of nieuwe deployment wist ze. Er is geen account, apparaatidentiteit, duurzame opslag, bezorggarantie, koppeling met BRI9ADE of end-to-endversleuteling. De sessie identificeert een browser met een tijdelijk cookie, geen mens. Gebruik korte testteksten en deel geen gevoelige gegevens.

De server maakt ingetrokken of verlopen verzoektekst leeg en verwijdert verlopen sessies uit zijn gegevensstructuren. Een periodieke opruiming draait minstens iedere seconde. Beperkte metadata van een gesloten verzoek blijft tot het einde van de sessie bestaan, zodat hergebruik van dezelfde verzoeksleutel wordt geweigerd. Dit is geen garantie dat JavaScript-geheugen onmiddellijk fysiek wordt overschreven.

## HTTP-contract

Alle endpoints gebruiken de prefix `/api/rio/nova`. JSON-antwoorden zijn `no-store`; de RIO-serviceworker slaat deze endpoints niet op.

| Methode en pad | Resultaat |
| --- | --- |
| GET `/runtime` | Publieke processtatus, tijd, limieten en `chatEnabled:false` |
| POST `/session`, body `{}` | Nieuwe sessie of hervatten van bestaande sessie; CSRF-token en eigen verzoeken |
| GET `/requests` | Ontvangstbewijzen en vaste sessievervaltijd |
| POST `/requests` | Ontvangst van `{text,idempotencyKey}`; 201 bij nieuw verzoek, 200 bij identieke herhaling |
| POST `/requests/:id/actions` | `{action,revision}` met `hold`, `resume` of `withdraw` |
| DELETE `/session`, body `{}` | Alle sessiegegevens verwijderen en cookie wissen |

Een ontvangstbewijs bevat `id,status,text,createdAt,expiresAt,revision`. Statussen zijn `RECEIVED`, `ON_HOLD`, `WITHDRAWN` en `EXPIRED`. Acties antwoorden met `{request:...}`; ze gebruiken de actuele revisie. Een oud revisienummer geeft 409. Een gesloten verzoek of verzoeksleutel geeft 410. Een onbekend of vreemd ontvangstbewijs geeft dezelfde 404.

Tekst telt maximaal 512 Unicode-codepunten en mag niet leeg of uitsluitend witruimte zijn. Verzoek-ID en idempotentiesleutel zijn 32 kleine hexadecimale tekens. Een idempotentiesleutel is uitsluitend binnen de eigen sessie geldig. Een identieke herhaling bewaart dezelfde ID, tijd en revisie; een veranderde tekst bij dezelfde sleutel geeft 409.

## Beveiliging en limieten

Schrijfacties vereisen de exacte ingestelde Origin, `application/json`, een schema zonder extra velden en maximaal 4 KiB body. Alle wijzigingen behalve de sessiestart vereisen ook `X-NOVA-CSRF`. Privé-GETs weigeren een expliciete vreemde Origin en browsermetadata die cross-site of same-site verkeer aanduidt.

Productie gebruikt `__Host-palacoNova`: 32 willekeurige bytes, `HttpOnly; Secure; SameSite=Strict; Path=/`. Het CSRF-token gebruikt afzonderlijke willekeurige bytes. HTTP is uitsluitend toegestaan met expliciete development-configuratie en een loopback-Origin; dan heet het cookie `palacoNova`.

Maximaal 256 sessies bestaan tegelijk. Maximaal 30 nieuwe sessies per minuut en 60 sessieacties per minuut zijn toegestaan. Hervatten telt als een sessieactie; eindigen blijft ook bij een uitgeput actiebudget beschikbaar. Limietfouten antwoorden met 429 of 503 en `Retry-After`. De module logt geen verzoektekst, ontvangst-ID, cookie of token.

## Testbaarheid en lifecycle

`mountNovaReception(app,options)` maakt per app een afzonderlijke, begrensde in-memory service. Een tweede mount op dezelfde app wordt geweigerd. De functie retourneert `close()`, die de opruimtimer stopt en gegevens verwijdert.

Standaard volgen deadlines de monotone verstreken tijd, verankerd aan de starttijd van het proces. Tests kunnen een eigen `now()` injecteren; achterwaartse beweging wordt begrensd tot de laatst waargenomen tijd. Tests mogen TTLs en limieten verlagen via `sessionTtlMs,requestTtlMs,maxSessions,maxRequests,creationLimit,actionLimit,rateWindowMs`. De productieplafonds kunnen hiermee niet worden verhoogd.
