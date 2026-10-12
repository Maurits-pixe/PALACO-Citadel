# NOVA online ontvangst, receptie en controlepoort v0.3

NOVA is een werkend onderdeel van het bestaande RIO-serverproces. Een browser kan bewust een kort verzoek naar de ontvangstservice sturen, het teruglezen en naar de receptie brengen. Daar kan dezelfde browsersessie een eerste ontvangstkeuze bevestigen of het verzoek weigeren. Na de eerste ontvangstkeuze kan de sessie de server om een actuele beoordeling bij de controlepoort vragen. Op wacht zetten, hervatten en intrekken blijven beschikbaar.

De eerste bevestiging geldt uitsluitend voor deze receptie. Het is een knopkeuze in een tijdelijke browsersessie, geen bewijs van een menselijke identiteit of toestemming van een tweede persoon. De keuze opent geen contactruimte, privéruimte, verbinding of chat en verleent geen governance-, merge-, release- of uitvoeringsbevoegdheden. De controlepoort bevestigt alleen de bestaande lokale sessievoorwaarden. De veiligheidsdiensten van 6RI9ADE en STEWARD, definitieve instemming van beide partijen en versleuteld contact zijn nog niet aangesloten.

## Tijdelijk en begrensd

Een willekeurige browsersessie leeft maximaal 15 minuten. Een verzoek leeft maximaal 5 minuten, of korter als de sessie eerder afloopt. Doorsturen, accepteren, weigeren, op wacht zetten of hervatten verlengt deze vaste termijnen niet. Per sessie zijn maximaal vier ontvangstbewijzen beschikbaar, ook nadat die geweigerd, ingetrokken of verlopen zijn. De sessie kan worden beëindigd om alles direct te verwijderen.

Gegevens staan uitsluitend in het geheugen van één serverproces. Een herstart of nieuwe deployment wist ze. Er is geen account, apparaatidentiteit, duurzame opslag, bezorggarantie, koppeling met BRI9ADE of end-to-endversleuteling. De sessie identificeert een browser met een tijdelijk cookie, geen mens. Gebruik korte testteksten en deel geen gevoelige gegevens.

De server maakt geweigerde, ingetrokken of verlopen verzoektekst leeg en wist daarbij ook de eerste bevestiging, de hervatstatus en de controlebeoordeling. Alle andere geldige actieovergangen wissen een eerdere controlebeoordeling; opnieuw beoordelen vervangt haar. Verlopen sessies worden uit zijn gegevensstructuren verwijderd. Een periodieke opruiming draait minstens iedere seconde. Beperkte metadata van een gesloten verzoek blijft tot het einde van de sessie bestaan, zodat hergebruik van dezelfde verzoeksleutel wordt geweigerd. Dit is geen garantie dat JavaScript-geheugen onmiddellijk fysiek wordt overschreven.

## HTTP-contract

Alle endpoints gebruiken de prefix `/api/rio/nova`. JSON-antwoorden zijn `no-store`; de RIO-serviceworker slaat deze endpoints niet op.

| Methode en pad | Resultaat |
| --- | --- |
| GET `/runtime` | Publieke processtatus v0.3, tijd, limieten, `receptionEnabled:true`, `firstAcceptanceEnabled:true`, `checkGateEnabled:true`; `guardianRuntimeConnected`, `stewardRuntimeConnected`, `finalConsentEnabled` en `chatEnabled` zijn `false` |
| POST `/session`, body `{}` | Nieuwe sessie of hervatten van bestaande sessie; CSRF-token en eigen verzoeken |
| GET `/requests` | Ontvangstbewijzen en vaste sessievervaltijd |
| POST `/requests` | Ontvangst van `{text,idempotencyKey}`; 201 bij nieuw verzoek, 200 bij identieke herhaling |
| POST `/requests/:id/actions` | `{action,revision}` met `to_reception`, `accept`, `refuse`, `hold`, `resume`, `withdraw` of `request_checks` |
| DELETE `/session`, body `{}` | Alle sessiegegevens verwijderen en cookie wissen |

Een ontvangstbewijs bevat `id,status,text,createdAt,expiresAt,revision,resumeTo,firstAcceptance,checkGate`. `checkGate` begint als `null` en is uitsluitend gevuld na een actuele beoordeling van een nog geldig `FIRST_ACCEPTED` verzoek in dezelfde sessie. De tijden zijn ISO-datums. `resumeTo` is alleen bij `ON_HOLD` gevuld met `RECEIVED` of `AT_RECEPTION`; elders is het `null`. `firstAcceptance` is alleen bij `FIRST_ACCEPTED` gevuld:

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
| `FIRST_ACCEPTED` | `request_checks` | Blijft `FIRST_ACCEPTED`; actuele `HOLD`-beoordeling, revisie verhoogd, ontvangstkeuze en vaste termijnen behouden |
| `RECEIVED` | `hold` | `ON_HOLD`, `resumeTo:RECEIVED` |
| `AT_RECEPTION` | `hold` | `ON_HOLD`, `resumeTo:AT_RECEPTION` |
| `FIRST_ACCEPTED` | `hold` | `ON_HOLD`, bevestiging gewist, `resumeTo:AT_RECEPTION` |
| `ON_HOLD` | `resume` | De door de server opgeslagen hervatstatus; `resumeTo` wordt weer `null` |
| Elke levende status | `withdraw` | `WITHDRAWN`; tekst en bevestigingsvelden gewist |
| Elke levende status | Vaste verzoektermijn verstreken | `EXPIRED`; tekst en bevestigingsvelden gewist |

Levende statussen zijn `RECEIVED`, `AT_RECEPTION`, `FIRST_ACCEPTED` en `ON_HOLD`. Rechtstreeks accepteren vanuit ontvangst of wachtstand is niet toegestaan. Een geaccepteerd verzoek dat op wacht wordt gezet, heeft na hervatten opnieuw een expliciete keuze bij de receptie nodig. Hervatten herstelt geen oude bevestiging. De browser verbergt verzoektekst, bevestiging en actieknoppen zodra de vaste termijn volgens zijn servertijdanker is bereikt, ook zonder verbinding. Hij verbergt dan ook een eerdere controlebeoordeling. Hij toont dat het ontvangstbewijs vernieuwd moet worden; alleen een nieuw serverantwoord bevestigt de status `EXPIRED` en de actuele revisie.

`REFUSED`, `WITHDRAWN` en `EXPIRED` zijn gesloten statussen. Alle verdere acties en hergebruik van dezelfde verzoeksleutel geven 410. Een andere, niet toegestane overgang geeft 409. Een onbekende actie of extra veld geeft 400. Er bestaat geen actie of endpoint om chat, privétoegang of BRI9ADE-goedkeuring te openen.

Acties antwoorden met `{request:...}`; elke geldige overgang verhoogt de revisie één keer en bewaart de oorspronkelijke `createdAt` en `expiresAt`. Een oud revisienummer geeft 409. Een onbekend of vreemd ontvangstbewijs geeft dezelfde 404. Herhaalde actieknoppen kunnen zo geen tweede bevestiging of stille overschrijving maken.

Tekst telt maximaal 512 Unicode-codepunten en mag niet leeg of uitsluitend witruimte zijn. Verzoek-ID en idempotentiesleutel zijn 32 kleine hexadecimale tekens. Een idempotentiesleutel is uitsluitend binnen de eigen sessie geldig. Een identieke herhaling bewaart dezelfde ID, status, tijden, revisie en bevestigingsvelden; een veranderde tekst bij dezelfde sleutel geeft 409.

## Actuele controlepoort

De actie `request_checks` is uitsluitend toegestaan bij `FIRST_ACCEPTED`. De server beoordeelt de bestaande receptiescope, sessie, ontvangstkeuze en vaste vervaltijd. Een geldige beoordeling verhoogt de revisie één keer en bewaart de oorspronkelijke ontvangstkeuze, `createdAt` en `expiresAt`. Herhaald beoordelen vereist steeds het nieuwe revisienummer en vervangt de vorige beoordeling. Het is geen contactopening.

`checkGate` heeft precies deze velden:

~~~text
schemaVersion: nova-check-gate/0.1
policyVersion: NOVA-CHECK-GATE-0.1
receiptId: eigen ontvangst-ID
currentRevision: actuele ontvangstbewijsrevisie
receptionAcceptedAt: oorspronkelijke eerste ontvangstkeuze, ISO
scope: reception-only
evaluatedAt: serverbeoordelingstijd, ISO
expiresAt: oorspronkelijke verzoekvervaltijd, ISO
outcome: HOLD
reason: CONNECTIONS_MISSING
localChecks:
  session: CONFIRMED
  receptionChoice: CONFIRMED
  scope: CONFIRMED
  expiry: CONFIRMED
guards: negen afzonderlijke {id,roleCode,sender:UNKNOWN,receiver:UNKNOWN}
steward: UNKNOWN
canOpenContact: false
finalConsentEnabled: false
sourceBinding:
  repository: Maurits-pixe/PALACO-Citadel
  commit: 74dcf9535733af2f37a729b3a11f2269d5d594db
  path: rio/brigade-specialties.json
  blobSha: d938ba81c91b48704d566a448af87f0f0c2465bd
~~~

De vier `CONFIRMED`-waarden betreffen uitsluitend deze lokale browserproef. Zij bewijzen geen menselijke identiteit, geen tweede partij, geen bilaterale veiligheidscontrole en geen end-to-endversleuteling. Alle achttien rol-/partijplaatsen blijven afzonderlijk `UNKNOWN`. STEWARD blijft eveneens onbekend. Ontbrekende echte aansluitingen houden de uitkomst altijd op `HOLD`, ook wanneer alle lokale voorwaarden bevestigd zijn. Er wordt geen finale instemming of overdrachtsrecht uitgegeven.

| Bodyguard | Specialiteit / roleCode |
| --- | --- |
| 6RI9ADE-BG-01 | Identiteit en apparaat / `IDENTITY` |
| 6RI9ADE-BG-02 | Adres en bestemming / `ADDRESS` |
| 6RI9ADE-BG-03 | Menselijke toestemming / `HUMAN_CONSENT` |
| 6RI9ADE-BG-04 | Toegang en beleid / `SCOPE_POLICY` |
| 6RI9ADE-BG-05 | Versleuteling en sleutels / `E2EE_KEYS` |
| 6RI9ADE-BG-06 | Inhoud en integriteit / `CONTENT_INTEGRITY` |
| 6RI9ADE-BG-07 | Herhaling en volgorde / `REPLAY_ORDER` |
| 6RI9ADE-BG-08 | Privacy en metadata / `PRIVACY` |
| 6RI9ADE-BG-09 | Aflevering en intrekking / `DELIVERY_REVOCATION` |

De manifestkopie in `ambassades/auth/brigade-specialties.json` bevat exact de gepinde bronbytes. De servermodule controleert bij het laden hun Git-blob-ID en de negen afzonderlijke ontwerpbindings. Gewijzigde of ontbrekende manifestbytes verhinderen het starten van de controlepoort. Deze bronintegriteit is geen inschrijving van operationele agenten; alle rollen blijven ontwerpidentiteiten zonder aangesloten veiligheidsdienst. De synthetische reference-evaluator en zijn testuitgevers worden niet gebruikt in dit online onderdeel.

Een interne binding bewaart welke actuele sessie, ontvangstbewijsrevisie en eerste ontvangstkeuze bij de beoordeling horen. Die sessiecapability wordt nooit geserialiseerd. Antwoorden geven alleen een afzonderlijke kopie van de openbare beoordelingsvelden terug zolang die exacte binding nog geldig is. Gewijzigde revisie, ontvangstkeuze, status, sessie of verval maakt haar onbruikbaar. GET vernieuwen en een identieke verzoekherhaling wijzigen de revisie niet en kunnen dezelfde actuele beoordeling teruggeven.

Vlak vóór de synchrone actiecommit leest de server opnieuw de tijd en ruimt hij verlopen staat op. Een intussen verlopen verzoek geeft 410; een verlopen of verdwenen sessie geeft 401. Een ongeldige klok geeft 503. Geen van die fouten publiceert een nieuwe beoordeling. De client kan geen uitslagen, sleutels, uitgevers, snapshots of beoordelingsvelden insturen: de actiebody blijft precies `{action,revision}`.

## Beveiliging en limieten

Schrijfacties vereisen de exacte ingestelde Origin, `application/json`, een schema zonder extra velden en maximaal 4 KiB body. Alle wijzigingen behalve de sessiestart vereisen ook `X-NOVA-CSRF`. Privé-GETs weigeren een expliciete vreemde Origin en browsermetadata die cross-site of same-site verkeer aanduidt.

Productie gebruikt `__Host-palacoNova`: 32 willekeurige bytes, `HttpOnly; Secure; SameSite=Strict; Path=/`. Het CSRF-token gebruikt afzonderlijke willekeurige bytes. HTTP is uitsluitend toegestaan met expliciete development-configuratie en een loopback-Origin; dan heet het cookie `palacoNova`.

Maximaal 256 sessies bestaan tegelijk. Maximaal 30 nieuwe sessies per minuut en 60 sessieacties per minuut zijn toegestaan. Alle receptiekeuzes en controlebeoordelingen tellen mee; hervatten van een sessie telt als een sessieactie. Eindigen blijft ook bij een uitgeput actiebudget beschikbaar. Limietfouten antwoorden met 429 of 503 en `Retry-After`. De module logt geen verzoektekst, ontvangst-ID, cookie of token.

## Testbaarheid en lifecycle

`mountNovaReception(app,options)` maakt per app een afzonderlijke, begrensde in-memory service. Een tweede mount op dezelfde app wordt geweigerd. De functie retourneert `close()`, die de opruimtimer stopt en alle verzoektekst, bevestigingen, controlebeoordelingen en sessiegegevens verwijdert.

Standaard volgen deadlines de monotone verstreken tijd, verankerd aan de starttijd van het proces. Tests kunnen een eigen `now()` injecteren; achterwaartse beweging wordt begrensd tot de laatst waargenomen tijd. Tests mogen TTLs en limieten verlagen via `sessionTtlMs,requestTtlMs,maxSessions,maxRequests,creationLimit,actionLimit,rateWindowMs`. De productieplafonds kunnen hiermee niet worden verhoogd.
