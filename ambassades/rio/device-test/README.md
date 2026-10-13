# RIO verbindingstest met twee telefoons

Deze pagina test één tijdelijke verbinding tussen twee gasttestsessies via de
bestaande HTTPS-testserver. De server geeft uitsluitend gegenereerde
challenge/reply-berichten door. De pagina bevat geen invoer voor persoonlijke
berichten, accounts, e-mailadressen of wachtwoorden.

De omgeving blijft `TEST_ONLY`, `ACCOUNT-1 HOLD`, `accountActive: false`,
`operativeAuthority: NONE` en `canOpenContact: false`.
Berichten zijn leesbaar voor de testserver; `endToEndEncrypted: false`.
De gasten vertegenwoordigen geen gecontroleerde accountidentiteit:
`authenticatedIdentity: false`.
De test gebruikt hetzelfde wifi-netwerk als afgesproken testopstelling, en
loopt via HTTPS naar de bestaande server.

## Uitvoeren op de twee fysieke telefoons

Voorbereiding: gebruik twee verschillende fysieke telefoons met een eigen
browser en internettoegang op hetzelfde wifi-netwerk. Open op beide de
[RIO verbindingstest](https://palaco-ambassades.onrender.com/rio/device-test/).
De browser moet de bestaande HTTPS-verbinding vertrouwen. Lokale certificaten,
accountregistratie en een nieuwe hostingdienst zijn hiervoor niet nodig.

1. Open de testpagina op telefoon A en tik op **Maak uitnodiging**. Laat deze
   pagina openstaan.
2. Tik op A op **Kopieer link** en open die link op telefoon B.
   Tik daar op **Gebruik uitnodiging**. Gebruik de link één keer.
3. Tik op beide telefoons op **Ik doe mee aan deze testcodeproef**. Daarmee
   accepteert elk dezelfde testscope `RIO_DEVICE_CHALLENGE_V1`.
4. Tik op A op **Stuur testcode naar de andere telefoon**.
5. Tik op B bij de ontvangen code op **Ik zie deze code · bevestig ontvangst**, daarna op
   **Antwoord met dezelfde testcode**. Tik op A bij dat antwoord op **Ik zie deze code · bevestig ontvangst**.
6. Controleer op beide telefoons dat dezelfde tijdelijke verbinding wordt
   getoond en dat code én antwoord **Ontvangst bevestigd** (`acknowledged: true`) tonen.
   **Ontvangst nog niet bevestigd** is nog geen ontvangstbevestiging.
7. Tik op **Sluit proef op beide telefoons**. De uitnodiging en berichten worden uit de
   tijdelijke serveropslag verwijderd. Maak voor een nieuwe proef een nieuwe
   uitnodiging.

De uitnodigingslink staat alleen tijdelijk in deze pagina. Raakt die link na
vernieuwen of sluiten verloren, sluit dan de proef en maak een nieuwe uitnodiging.
Een paar verloopt na vijf minuten; gebruik daarna een nieuwe uitnodiging.
Er passen maximaal twintig diagnostische berichten in één paar.
Een andere tab op dezelfde telefoon gebruikt mogelijk dezelfde gastcookie
en vervangt daarom de tweede fysieke telefoon niet.

## Resultaat lezen

| Status | Wat is vastgesteld |
| --- | --- |
| Ontvangst nog niet bevestigd (`acknowledged: false`) | De server heeft het gegenereerde bericht ontvangen |
| Ontvangst bevestigd (`acknowledged: true`) | De andere gasttestsessie heeft het ontvangen bericht bevestigd |
| Beide toestemmingen (`consent.A` en `consent.B`) | Beide sessies hebben dezelfde testscope geaccepteerd |
| Afgesloten of verlopen | De tijdelijke verbinding is verwijderd en niet meer bruikbaar |

De fysieke twee-telefoontest is geslaagd wanneer de gebruiker de stappen op
beide fysieke telefoons heeft uitgevoerd en challenge én reply op het
overeenkomstige paar zijn bevestigd. Twee automatische browsercontexten
bewijzen de werking en sessie-isolatie van de server; fysieke telefoonbediening
moet afzonderlijk worden vastgelegd.

Noteer alleen testdatum/tijd, de geteste servercommit, telefoonlabels A/B,
OS/browserversies, paar- en berichtidentifiers en de waargenomen statussen.
Noteer geen telefoonnummers, apparaatserienummers, uitnodigingstokens,
gastcookies of debugdumps. Een beperkte testnotitie kan zo worden ingevuld:

```text
UTC-testtijd:
Geteste servercommit:
Telefoon A / OS / browser:
Telefoon B / OS / browser:
Paaridentifier:
Challengeidentifier / status op B:
Replyidentifier / status op A:
Beide scopes geaccepteerd:
Test afgesloten:
Uitkomst: PASS / FAIL / NIET UITGEVOERD
```

## Afzonderlijke testgrens

De diagnostiek gebruikt een eigen `/api/rio/device-test`-namespace en een eigen
Secure, HttpOnly, host-only gastcookie `__Host-palacoDeviceTest`.
Bestaande NOVA-sessies, ACCOUNT-1, identity-providerconfiguratie en
productiegates worden hiermee niet geactiveerd.

Uitnodigingstokens hebben 64 hextekens, verlopen met het paar en kunnen maar één
keer door een andere gasttestsessie worden gebruikt. Het token verschijnt
uitsluitend bij de eerste succesvolle creatie van het paar. Het
uitnodigingsfragment wordt uit de browser-URL verwijderd vóór verdere verwerking;
het token wordt vervolgens in een verzoekbody verstuurd.

Paar- en uitnodigingsacties vereisen de eigen `X-Device-Test-CSRF`-header.
Elke paaractie bevat de oorspronkelijke `pairId`, de verwachte paarrevisie en een
idempotency key van 32 hextekens. Vernieuwen of opnieuw proberen behoudt de binding
aan de bedoelde proef. Een oude bevestiging of afsluiting mag een nieuw paar niet wijzigen. Beide rollen accepteren
expliciet dezelfde testscope. Alleen de ontvanger kan een bericht bevestigen.
Een reply vereist een bevestigde challenge van de andere rol; per challenge
kan één reply worden gemaakt. De inhoud wordt door de server gegenereerd.

Paar-, uitnodigings- en berichtstate staat begrensd in werkgeheugen.
Sluiten verwijdert het paar, de uitnodiging en de berichten en maakt beide
paarverwijzingen onbruikbaar; een volgend `GET /pair` levert geen paar meer.
Verlopen of een serverherstart beëindigt de tijdelijke state.
De huidige transportproef bewijst de diagnostische serverroute; accountidentiteit,
persoonsverificatie en end-to-end-encryptie worden apart getest en blijven HOLD.

## API-contract voor de controle

Alle routes staan onder `/api/rio/device-test`.

| Route | Doel |
| --- | --- |
| `POST /session` met `{}` | Eigen tijdelijke sessie en CSRF-token openen |
| `POST /pair` met `idempotencyKey` | Paar en eenmalige uitnodiging maken |
| `POST /join` met `inviteToken`, `idempotencyKey` | Als tweede gasttestsessie deelnemen |
| `GET /pair` | Uitsluitend de eigen paarstate lezen |
| `POST /pair/actions` | `accept`, `challenge`, `reply`, `ack` of `close` met revisie en idempotency key |

`accept` voegt `scope: RIO_DEVICE_CHALLENGE_V1` toe.
`reply` en `ack` voegen de doel-`messageId` van 32 hextekens toe.
Andere inhoudsvelden of vrije berichttekst horen niet bij dit contract.
Een verlopen of niet-eigen paar geeft geen bruikbare paarstate terug.

## Bewijsstatus

CI- en live controles moeten de exact gepubliceerde commit controleren.
Een succesvolle deployment of een geslaagde desktopcontrole is geen ingevulde
fysieke testnotitie. Tot de gebruiker de twee telefoons bedient, blijft dat
onderdeel **NIET UITGEVOERD**.
