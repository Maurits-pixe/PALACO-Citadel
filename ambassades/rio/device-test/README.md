# RIO verbindingstest met twee telefoons

Deze pagina test een tijdelijke verbinding tussen twee gasttestsessies via de
bestaande HTTPS-testserver. De server geeft uitsluitend gegenereerde
challenge/reply-codes door. Er is geen invoer voor persoonlijke berichten,
accounts, e-mailadressen of wachtwoorden.

De omgeving blijft `TEST_ONLY`, `ACCOUNT-1 HOLD`, `accountActive: false`,
`operativeAuthority: NONE` en `canOpenContact: false`.
De server kan de testcodes lezen: `endToEndEncrypted: false`.
Gasttestsessies bewijzen geen gecontroleerde accountidentiteit:
`authenticatedIdentity: false`.

## Twee afzonderlijke testopstellingen

| Opstelling | Doel | Bewijsgrens |
| --- | --- | --- |
| `GENERAL_INTERNET` | De bestaande gastproef via een internetverbinding; dit blijft de standaard | Heen-en-terug ontvangen door twee gasttestsessies |
| `MOBILE_CROSS_PROVIDER` | Twee fysieke telefoons, elk met mobiele data van een andere provider | Heen-en-terug ontvangen plus afzonderlijke verklaringen van beide deelnemers over de mobiele opstelling |

Op 13 oktober 2026 meldde de gebruiker dat de eerdere proef op twee telefoons
op hetzelfde wifi-netwerk was geslaagd. Dat is een door de gebruiker gemeld
fysiek resultaat, geen onafhankelijke waarneming door de server.
De nieuwe mobiele proef blijft **NIET UITGEVOERD** totdat de gebruiker die
afzonderlijk op de twee telefoons heeft uitgevoerd en vastgelegd.

De mobiele route is:

```text
Telefoon A · mobiele data provider A
    → HTTPS → tijdelijke PALACO RIO-testserver op Render
    → HTTPS → telefoon B · mobiele data provider B
    → ontvangstbevestiging en passend antwoord terug naar A
```

Beide telefoons verbinden met de openbare HTTPS-server. Er is geen vereiste
dat ze hetzelfde wifi-netwerk of hetzelfde IP-adres gebruiken.
De gasttestsessie is gebonden aan de eigen browsercookie.
Dit is een RIO-test via mobiele internettoegang; sms-aflevering, nummerportering
en het overdragen van een abonnement horen niet bij deze proef.

### Eerste mobiele opstelling: Youfone en Lebara

De gebruiker heeft **Youfone** en **Lebara** genoemd als de twee providers.
In Nederland gebruiken deze merken beide het KPN-netwerk, volgens de
[Youfone-publicatie over KPN](https://www.youfone.nl/pers/groen-licht-voor-overname-youfone)
en de [Lebara-providerinformatie](https://www.lebara.nl/).

Deze opstelling kan dus RIO-overdracht tussen twee verschillende
providerabonnementen testen. Zij bewijst geen overdracht tussen twee
onafhankelijke radionetwerken. De RIO-server controleert de provider,
het gebruikte mobiele netwerk en de fysieke toestellen niet.

## Mobiele proef uitvoeren

Voorbereiding: gebruik twee verschillende fysieke telefoons met elk een eigen
mobiel abonnement, SIM/eSIM en browser. Kies bijvoorbeeld A = Youfone en
B = Lebara. Gebruik op elk toestel de SIM/eSIM van de bedoelde provider voor
mobiele data; een dual-SIM-toestel kan een andere SIM voor data gebruiken.

1. Zet **wifi uit** op beide telefoons en **mobiele data aan**. Gebruik geen
   hotspot. Controleer op beide toestellen de gekozen data-SIM en dat internet
   via mobiele data werkt.
2. Open op beide telefoons de
   [RIO verbindingstest](https://palaco-ambassades.onrender.com/rio/device-test/).
   Kies op telefoon A de opstelling **verschillende mobiele providers** en maak
   een **nieuwe** uitnodiging. Laat deze pagina open.
3. Kopieer de uitnodigingslink op A en open die op B in de browser die B voor
   deze proef gebruikt. Tik op B op **Gebruik uitnodiging**.
   De link is één keer bruikbaar.
4. Controleer dat op beide schermen hetzelfde proefnummer en de mobiele
   opstelling staan. Elk bevestigt voor zijn eigen telefoon: wifi uit,
   mobiele data aan, een andere provider dan de andere telefoon en geen
   hotspot. Tik daarna op beide telefoons op **Ik doe mee aan deze testcodeproef**.
   Daarmee accepteert elk dezelfde scope `RIO_DEVICE_CHALLENGE_V1`.
5. Tik op A op **Stuur testcode naar de andere telefoon**.
6. Tik op B bij de ontvangen code op **Ik zie deze code · bevestig ontvangst**,
   daarna op **Antwoord met dezelfde testcode**.
7. Tik op A bij het ontvangen antwoord op
   **Ik zie deze code · bevestig ontvangst**.
8. Controleer op beide telefoons dat code en passend antwoord
   **Ontvangst bevestigd** tonen. Lees de twee bewijsregels afzonderlijk:
   HTTPS-overdracht bevestigd, en mobiele opstelling door beide deelnemers
   verklaard. Een nog niet bevestigde code is nog geen ontvangstbewijs.
9. Tik op één telefoon op **Sluit proef op beide telefoons**. Bewaar op die
   afsluitende telefoon de beperkte resultaatnotitie via de aangeboden download.
   Sluiten verwijdert de tijdelijke uitnodiging, koppeling en codes op de server.

Maak voor iedere nieuwe proef een nieuwe uitnodiging. Dezelfde wifi-proef,
een oude resultaatnotitie of een reeds verlopen koppeling geldt niet als
resultaat van deze mobiele proef.

### Algemene internetproef

Laat op A de standaardopstelling `GENERAL_INTERNET` staan om de bestaande
proef via wifi of andere internettoegang uit te voeren. Maak een nieuwe
uitnodiging, open hem op B, bevestig deelname op beide en voer dezelfde
challenge, ontvangstbevestiging, reply en terugbevestiging uit.
De mobiele verklaringen horen uitsluitend bij `MOBILE_CROSS_PROVIDER`.

## Resultaat lezen

| Status | Wat is vastgesteld |
| --- | --- |
| Ontvangst nog niet bevestigd (`acknowledged: false`) | De server heeft een gegenereerde code opgeslagen; de ontvangende gasttestsessie heeft deze nog niet bevestigd |
| Ontvangst bevestigd (`acknowledged: true`) | De ontvangende gasttestsessie heeft de code bevestigd |
| Passende heen-en-terugronde | Een challenge en de bijbehorende reply met dezelfde code zijn beide door hun ontvanger bevestigd |
| Beide toestemmingen (`consent.A` en `consent.B`) | Beide sessies hebben dezelfde testscope geaccepteerd |
| Mobiele verklaring A/B | De overeenkomstige deelnemer heeft de vier mobiele voorwaarden verklaard |
| Afgesloten of verlopen | De tijdelijke koppeling en codes zijn verwijderd en niet meer bruikbaar |

Een geslaagde fysieke mobiele proef vereist dat de gebruiker deze stappen op
beide fysieke telefoons uitvoert, de mobiele instellingen controleert en de
passende challenge/reply-ronde op hetzelfde paar bevestigt.

De verklaring heeft bron `PARTICIPANT_DECLARATION`.
`providersVerified: false` en `physicalDevicesVerified: false` blijven
expliciet zichtbaar in de bewijsvorm. De browser of relay kan wifi uit,
de actieve data-SIM, de provider of twee fysieke apparaten niet betrouwbaar
vaststellen. Twee automatische browsercontexten bewijzen de serverroute en
sessie-isolatie; zij vormen geen fysieke mobiele proef.

### Beperkte resultaatnotitie

De succesvolle sluitreactie bevat een beperkte `receipt`, uitsluitend voor
de telefoon die de proef sluit. De andere telefoon krijgt hierdoor geen
nieuw recht op een resultaatdownload. De receipt bevat alleen versie,
geteste servercommit indien beschikbaar, paaridentifier, opstelling,
sluitmoment, beperkte ontvangst- en verklaringsstatus en de gesloten
account-/encryptiegrens. Zij bevat geen testcodes, uitnodigingstokens,
gastcookies, CSRF-tokens of vrije berichttekst.

De download is een lokale kopie van deze beperkte sluitreactie.
Er ontstaat geen permanent serverarchief. Bewaar het bestand zelf als je het
resultaat wilt behouden; de koppeling is na sluiting niet meer opvraagbaar.
Een sluitnotitie zonder bevestigde heen-en-terugronde is geen geslaagde overdracht.

Noteer voor een aanvullende fysieke testnotitie alleen:

```text
UTC-testtijd:
Geteste servercommit:
Opstelling: GENERAL_INTERNET / MOBILE_CROSS_PROVIDER
Telefoon A / OS / browser:
Telefoon B / OS / browser:
Provider A / provider B (door gebruiker waargenomen):
Wifi op beide uit / mobiele data op beide aan / geen hotspot:
Paaridentifier:
Heen-en-terugronde bevestigd:
Mobiele verklaring A / B:
Test afgesloten / beperkte resultaatnotitie bewaard:
Fysieke uitkomst: PASS / FAIL / NIET UITGEVOERD
Bron fysieke uitkomst: GEBRUIKERSWAARNEMING
```

Noteer geen telefoonnummers, SIM-identifiers, apparaatserienummers,
uitnodigingstokens, gastcookies of debugdumps.

## Onderbreking, achtergrond en verval

Een paar verloopt uiterlijk na vijf minuten. Voer de stappen binnen die tijd
uit en houd de browserpagina's open. Een telefoon kan een achtergrondtab
pauzeren; controleer de actuele proefstatus wanneer je terugkeert.
Een andere tab op dezelfde telefoon kan dezelfde gastcookie gebruiken en
vervangt geen tweede fysiek toestel.

Er passen maximaal twintig gegenereerde diagnostische berichten in één paar.
Een verlopen proef of serverherstart wist de tijdelijke state.
Raakt de uitnodigingslink verloren, sluit de proef en maak een nieuwe
uitnodiging; de server geeft het uitnodigingstoken niet opnieuw uit.

Een tijdelijk netwerkprobleem bewijst geen aflevering.
**Dezelfde stap opnieuw proberen** herhaalt de bedoelde verzending met
dezelfde idempotency key. Maak geen nieuwe challenge om een ontbrekend
antwoord op een oude challenge te omzeilen. Controleer na herstel de
ontvangstbevestiging; start na verval een nieuwe proef.

## Afzonderlijke testgrens

De diagnostiek gebruikt een eigen `/api/rio/device-test`-namespace en een eigen
Secure, HttpOnly, host-only gastcookie `__Host-palacoDeviceTest`.
Bestaande NOVA-sessies, ACCOUNT-1, identity-providerconfiguratie en
productiegates worden hiermee niet geactiveerd.
Persoonlijke aanmelding en operationeel RIO-contact blijven gesloten.

Uitnodigingstokens hebben 64 hextekens, verlopen met het paar en kunnen maar één
keer door een andere gasttestsessie worden gebruikt. Het token verschijnt
uitsluitend bij de eerste succesvolle creatie van het paar.
Het uitnodigingsfragment wordt uit de browser-URL verwijderd vóór verdere
verwerking; het token wordt vervolgens in een verzoekbody verstuurd.

Paar-, uitnodigings- en berichtacties vereisen de eigen
`X-Device-Test-CSRF`-header. Elke paaractie bevat de oorspronkelijke `pairId`,
de verwachte paarrevisie en een idempotency key van 32 hextekens.
Vernieuwen of opnieuw proberen behoudt de binding aan de bedoelde proef.
Een oude bevestiging of afsluiting mag een nieuw paar niet wijzigen.

Beide rollen accepteren expliciet dezelfde testscope.
Alleen de ontvanger kan een bericht bevestigen.
Een reply vereist een bevestigde challenge van de andere rol;
per challenge kan één reply worden gemaakt.
De code-inhoud wordt door de server gegenereerd.

Paar-, uitnodigings-, verklarings- en berichtstate staat begrensd in
werkgeheugen. Sluiten verwijdert de koppeling, uitnodiging en codes en maakt
beide paarverwijzingen onbruikbaar; een volgend `GET /pair` levert geen paar
meer. Een beperkte sluitreactie kan voor een veilige herhaling tijdelijk bij
de afsluitende sessie beschikbaar blijven; zij bevat geen codes of tokens.
Verlopen of een serverherstart beëindigt de tijdelijke state.

## API-contract voor de controle

Alle routes staan onder `/api/rio/device-test`.

| Route | Doel |
| --- | --- |
| `POST /session` met `{}` | Eigen tijdelijke sessie en CSRF-token openen |
| `POST /pair` met `idempotencyKey` en optioneel `scenario` | Paar en eenmalige uitnodiging maken; zonder scenario geldt `GENERAL_INTERNET` |
| `POST /join` met `inviteToken`, `idempotencyKey` | Als tweede gasttestsessie deelnemen |
| `GET /pair` | Uitsluitend de eigen paarstate en beperkte bewijsstatus lezen |
| `POST /pair/actions` | `accept`, `challenge`, `reply`, `ack` of `close` met revisie en idempotency key |

De opstelling is bij creatie `GENERAL_INTERNET` of
`MOBILE_CROSS_PROVIDER` en blijft aan dat paar gebonden.

`accept` voegt `scope: RIO_DEVICE_CHALLENGE_V1` toe.
Voor `MOBILE_CROSS_PROVIDER` voegt ieder zijn eigen
`networkDeclaration` toe met exact vier velden:
`wifiOff: true`, `mobileDataOn: true`, `differentProviders: true` en
`noHotspot: true`. Ontbrekende, extra, niet-booleaanse of niet-ware
voorwaarden gelden niet als aanvaarde mobiele opstelling.
Dit zijn verklaringen van deelnemers, geen netwerkmeting.

`reply` en `ack` voegen de doel-`messageId` van 32 hextekens toe.
Andere inhoudsvelden of vrije berichttekst horen niet bij dit contract.
Een verlopen of niet-eigen paar geeft geen bruikbare paarstate terug.

## Bewijsstatus

CI- en live controles controleren de exact gepubliceerde commit.
Een succesvolle deployment of een geslaagde automatische servercontrole is
geen ingevulde fysieke testnotitie.
Tot de gebruiker de nieuwe mobiele proef op de twee telefoons bedient,
blijft de fysieke overdracht tussen Youfone en Lebara **NIET UITGEVOERD**.

Deze transportproef bewijst uitsluitend de tijdelijke diagnostische route.
Accountidentiteit, persoonsverificatie, end-to-endversleuteling en
operationeel RIO-contact blijven afzonderlijke bouw- en reviewpoorten.
