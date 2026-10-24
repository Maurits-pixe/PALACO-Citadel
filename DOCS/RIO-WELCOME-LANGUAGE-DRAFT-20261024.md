# RIO: de eerste begroeting volgt je taal

24 oktober 2026. Fasebasis a0c1d55a604d7a279308f6fcaf9da75bf4588600,
tree 557dba5dc03a8dbf46da63fa1fc4be8598741356. Draft PR #47.
PALACO PROOF: ON. Geen merge, deploy, publicatie of Render-wijziging.

De eerdere beelden toonden Nederlandse bediening met een Engelse begroeting
en Arabische bediening met een Spaanse begroeting. De chat maakt zijn eerste
welkomstbericht bij het laden; de bestaande taalwissel vertaalt alleen de
bediening. Dat is verwarrend wanneer er nog geen bericht is verstuurd.

De verbetering werkt uitsluitend de bestaande, enige systeembegroeting bij
zolang er nog geen bezoekersbericht of voorgestelde vraag is verstuurd. Dezelfde
berichtnode blijft bestaan; tekst, taal en schrijfrichting volgen de zeven
VisitCard-talen. Een concept of gekozen onderwerp wordt daarbij niet gewist.
Er wordt geen nieuw bericht toegevoegd en geen focus- of scrollfunctie aangeroepen.
Een andere tekstlengte of RTL kan wel natuurlijke herindeling en scrollbegrenzing
door de browser veroorzaken; pixelgelijke scrollposities worden niet beloofd.

Na de eerste vrije invoer, FAQ of onderwerpvraag blijven alle bestaande berichten,
antwoorden, namen, taalmetadata en schrijfrichtingen intact. Een volgende vraag
gebruikt de dan gekozen taal. Alleen expliciet bevestigd wissen maakt zoals
voorheen een nieuwe eerste begroeting; die mag weer met de taal meeveranderen.
Annuleren of Escape vertaalt of verwijdert geen gespreksgeschiedenis.

De begrenzing gebruikt de bestaande verzondenberichtstatus plus een private
referentie naar de eigen welkomstnode en de voorwaarde dat dit de enige lognode
is. Geen vergelijking van berichttekst en geen herkenning van bezoekers op basis
van hun woorden. De bestaande tijdelijke-werkstatus en vertrekkeuze blijven gelijk.
Er ontstaat geen nieuwe opslag, API, cookie, account of authority.

De rootcache wordt v45; oude gecontroleerde tabs mogen de gewone waiting-route
afronden. Geen root skipWaiting/clients.claim. Appcache v7, NOVA met elf talen,
offline download, vormgeving en overige openbare bestanden blijven bytegelijk
aan de vorige levering, behalve chat-preview.mjs en sw.js.

## Bewijs en tegenbewijs

Twee nieuwe browsergevallen per mobiel/desktop bewaken de eerste begroeting,
alle zeven talen/RTL, bestaande node-identiteit, concept en onderwerpidentiteit,
bewaren van verzonden geschiedenis, nieuwe antwoorden en bevestigd/afgebroken
wissen. De daadwerkelijke negatieve oude uitslag en definitieve lokale/CI- en
pakketuitslagen komen met head/tree en bronhash in het gebonden bouwrapport.
Het aantal unified-browsergevallen wordt 82; een telling is pas een uitslag
nadat de betreffende run daadwerkelijk is uitgevoerd.

De oude bron faalde aantoonbaar in alle vier nieuwe gevallen: de eerste
Nederlandse keuze behield de Engelse tekst en en/LTR-metadata. De bestaande
ES-initialisatie, geschiedenis, concept/onderwerp, nieuw Chinees antwoord en
wisroute slaagden, maar de daaropvolgende Arabische keuze hield de nieuwe
Chinese begroeting met zh/LTR-metadata vast. Dezelfde enige node bleef bestaan;
het probleem was dus taalcontinuïteit, niet ongewenst toevoegen of wissen.
De vier negatieve JSONs en foutcontexten staan ongewijzigd in
work/welcome-language-before-20261024. De werkelijk geserveerde oude chatbron
had SHA256 024ab1e36342467e7e1d17be4d8f75802ad4d0f049f525f64434b270e973ee64.

De log behoudt zijn bestaande rol, live-instellingen en leesbediening. Tests
kunnen DOM/focus/netwerk aantonen, geen werkelijke screenreaderaankondiging
certificeren. Fysieke telefoon- en handmatige toegankelijkheidsacceptatie blijven open.

PALACO PR75 en issues #50/#51/#60/#64 zijn op 24 oktober alleen-lezen bekeken.
PR75 was al op 17 oktober in zijn eigen featurebasis gemerged, niet main.
De bestaande stagingadapter-/provider-/TLS-runs blijven historisch bewijs;
vandaag zijn geen PALACO-joblogs herlezen of tests herhaald. Issue #50 blijft HOLD.
Echte contactbevestiging, provider/account-activering, P.P.-uitgifte,
operationele chat/E2EE en BRI9ADE blijven open.

## VORM9EVIN9 RECORD

- **Publiek en surface:** lokale VisitCard op telefoon en desktop, touch en toetsenbord.
- **Onderwerp:** de enige eerste RIO-begroeting, met bestaande tekst en taalstatus.
- **Touchflow:** taal kiezen, begroeting lezen, concept maken of onderwerp kiezen; na verzenden blijft de geschiedenis intact.
- **Begrijpelijkheid:** de begroeting gebruikt dezelfde taal als de bediening zolang nog niets is verstuurd.
- **Toegankelijkheid:** juiste lang/dir, dezelfde berichtnode, bestaande leesregio en geen nieuwe focus- of scrollactie; handmatige acceptatie open.
- **RIO-context:** zeven VisitCard-talen, elf NOVA-talen, eigen concept/onderwerp en ongewijzigde toelatingsgrenzen.
- **Provenance en grens:** bestaande vertalingen en brongebonden tests; presentatie verleent geen identiteit, consent of authority.
- **Validatie:** gerichte voor-/natest, exacte-head CI en pakketcontrole volgens het definitieve bouwrapport.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** het geteste draft beoordelen; fysieke apparaat-/screenreaderacceptatie afzonderlijk uitvoeren.

## PALACO PROOF

- **Proposition:** de nog onbeantwoorde begroeting volgt de taal; verzonden geschiedenis blijft ongewijzigd.
- **Scope and criterion:** zeven lokale VisitCard-talen, mobiele/desktop-Chromium, expliciete taalkeuze en bestaande wisroute; alle betreffende controles slagen op de laatste head.
- **Evidence:** eerdere beelden, nieuwe regressies, bronhashes, exacte-head CI en pakketbewijs; negatieve uitslagen blijven behouden.
- **Provenance:** bovenstaande fasebasis; nieuwe head/tree, werkelijke uitvoeringstijden en hashes staan in de levering.
- **Falsification:** oude begroetingstaal blijft staan, een historische node verandert, concept/onderwerp verdwijnt of nieuwe opslag/netwerk/focus ontstaat.
- **Status:** PROVISIONAL.
- **Limits:** definitieve uitvoering nog vast te leggen; geen echte toelating, automatische vertaling van geschiedenis, algemene toegankelijkheidscertificering, merge of deploy.
