# RIO: een tijdelijke oefening afzonderlijk leegmaken

20 oktober 2026. Draft PR #47, voortbouwend op 34866d52a10e961018d82ebf39cedf7d5186fd12.
PALACO PROOF: ON. Geen merge, deploy, publicatie of Render-wijziging.

De VisitCard krijgt **Maak oefening leeg**. Eerst verschijnt een keuze met
**Oefening behouden** als beginfocus. Bevestigen maakt herinnering, concepten,
toestemming, antwoord en bronnen van alleen deze oefening leeg. Chat en onderwerp
blijven staan. Een volgende oefening vraagt opnieuw toestemming en krijgt nieuwe
IDs. Zonder scripts blijft de knop uitgeschakeld.

De rekenkern bewaart een actuele geserialiseerde momentopname per dossier. Alleen
de webreferentie loslaten bleek onvoldoende. `disposeSessionDossier` vervangt nu
die actuele inhoud door een inhoudsvrije markering, met behoud van het gereserveerde
ondoorzichtige ID. Oude snapshots kunnen geen van de zes mutaties uitvoeren of
hetzelfde dossier opnieuw maken. Andere dossiers blijven bruikbaar. Een tweede
opruimactie op een al gemarkeerd, structureel geldig dossier is zonder gevolg.
Onbekende, verouderde of gewijzigde actieve snapshots worden geweigerd. Dit levert
geen authority of bewijs van formele consent-intrekking op. Caller-held kopieën en
fysiek wissen uit browsergeheugen vallen buiten deze lokale opruimactie.

Ook een succesvol vervangen herinneringsdossier ruimt de vorige momentopname op.
Daarbij verdwijnt ook het eerdere zichtbare antwoord met zijn bronverwijzing;
een antwoord bij de vorige herinnering wordt niet als antwoord bij de nieuwe getoond.
Een mislukte nieuwe voorbereiding laat het bestaande dossier behouden en ruimt
alleen zijn eigen voorbereiding op. Bij een opruimfout toont de webinterface de
weigering en claimt zij geen voltooide reset.

De nieuwe native dialoog heeft een titel, uitleg, veilige beginfocus, annuleren,
Escape en achtergrondklik. Wissen en focusherstel gebeuren synchroon; er volgt
geen uitgestelde focusverplaatsing vanuit een close-event. Een open vaste chat
kon het herinneringsveld bedekken. Daarom keert focus bij open chat terug naar de
zichtbare sluitknop van die chat; zonder open chat naar het herinneringsveld na
bevestigen of de startknop na annuleren. De chat wordt niet automatisch gesloten.

De zeven VisitCard-talen en Arabische schrijfrichting blijven behouden. NOVA houdt
elf talen. Rootcache v41 wacht op bestaande gecontroleerde tabs; appcache v7 en
de zelfstandige download blijven gelijk. Geen root skipWaiting/clients.claim,
nieuwe opslag, API of gewijzigde toegang. De eerder gemaakte vertrekkeuze blijft
chat en afzonderlijke Engine-oefening beschermen.

## Verificatie en tegenbewijs

Vier nieuwe Node-tests controleren opruimen, idempotentie, ID-reservering, alle zes
oude dossierhandelingen, onafhankelijkheid, ongeldige invoer en nieuwe toestemming.
Zes nieuwe browserscenario's per mobiel/desktop controleren de volledige flow,
chat/onderwerpbehoud, veilige annulering, geen late focusdiefstal, nieuwe oefening,
vertrekbewaking, zeven talen, 320px/dubbele tekst en werkelijk offline werken.
De workflow voert nu 15 Node- en 74 browsergevallen uit. Resultaten en exacte
commitbinding worden afzonderlijk vastgelegd in het bouwrapport en CI-bewijs.

De eerste twaalf UI-proeven alleen bewezen geen vrijgave van de interne snapshot.
Bronreview vond dat ontbrekende pad en ook het oude vervangingspad.
Een volgende bronreview vond een zichtbaar oud antwoord na succesvolle vervanging;
ook dat antwoord en zijn bronnen worden nu direct verborgen en leeggemaakt. Vier
geometriewaarnemingen toonden vervolgens dat focus bij open chat bedekt of buiten
beeld kon zijn; daarop is het zichtbare focusdoel aangepast. De eerste vier nieuwe
Node-tests stopten al in hun voorbereiding door ongeldige learning/vraag-ID's.
Alleen de fixtures zijn gecorrigeerd naar de vereiste prefix; de validator is
ongewijzigd. Dit tegenbewijs blijft in de lokale reviewhistorie bewaard.

PALACO PR75 is op 20 oktober alleen-lezen gecontroleerd: reeds gesloten en op
17 oktober gemerged in zijn featurebasis, niet main. Historische exacte-head runs
38807839052 en 38807839023 blijven SUCCESS; stagingadapter-, provider/account-binding-
en TLS-bewijs is synthetisch en vandaag niet opnieuw uitgevoerd. Het optionele
startupdiagnostic-onderdeel was daar overgeslagen. PALACO #50 blijft HOLD; #51,
#60 en #64 zijn open. Echte provider/contactbevestiging, P.P.-uitgifte, operationele
chat/E2EE, BRI9ADE en fysieke telefoon-/screenreaderacceptatie blijven open.

## VORM9EVIN9 RECORD

- **Publiek en surface:** lokale VisitCard op telefoon en desktop, touch en toetsenbord.
- **Onderwerp:** afzonderlijke tijdelijke Engine-oefening, met zichtbare lege/toestemming-nodig-status.
- **Touchflow:** leegmaken kiezen, behouden of expliciet bevestigen, directe feedback en zichtbare vervolgfocus.
- **Begrijpelijkheid:** korte titel en concrete waarschuwing; chat en onderwerp worden expliciet genoemd.
- **Toegankelijkheid:** native namen/uitleg, veilige focus, Escape, achtergrondklik, RTL, 44px acties en dubbele tekst; handmatige acceptatie open.
- **RIO-context:** zeven talen, eigen tijdelijke consent en dossier, onafhankelijke chatcontinuïteit, geen nieuwe rechten.
- **Provenance en grens:** broncode en geïsoleerde synthetische tests; presentatie verleent geen identiteit, permission of authority.
- **Validatie:** vier core- en twaalf browsergevallen toegevoegd; definitieve uitslag en schermbewijs in het aan de commit gebonden bouwrapport.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** geteste draft beoordelen en later fysieke telefoon-/screenreaderproef uitvoeren binnen expliciet toegelaten omgeving.

## PALACO PROOF

- **Proposition:** de eigen oefening kan leeg zonder verlies van chat/onderwerp, achtergebleven actuele core-inhoud of bruikbare oude snapshots.
- **Scope and criterion:** lokale VisitCard, vaste openbare assets, zeven talen, geïsoleerde Chromiumprofielen; alle betreffende tests slagen op de uiteindelijke head.
- **Evidence:** coretests, browserscenario's, CI-logs, manifest/hashes en schermcontrole; eerste snapshot-/focusgebreken en fixturefouten blijven tegenbewijs.
- **Provenance:** voortbouwend op 34866d5; exacte nieuwe head/tree, CI-run IDs en pakketcontroles staan in de uiteindelijke levering.
- **Falsification:** een oud dossier dat nog muteert, behouden private core-inhoud, onbedoeld chatverlies, bedekte focus of een nieuwe netwerk-/opslagactie weerlegt de claim.
- **Status:** PROVISIONAL.
- **Limits:** definitieve CI en pakketcontrole nog vast te leggen; geen secure erasure, caller-copyvernietiging, formele consent-intrekking, echte toelating, fysieke acceptatie, merge of deploy.
