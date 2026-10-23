# RIO: meer ruimte voor grote tekst

23 oktober 2026. Fasebasis 4b2257961999a8bb25ff911322196055633a8d6e; draft PR #47.
PALACO PROOF: ON. Geen merge, deploy of Render-wijziging.

De Franse schermafbeelding van de vorige levering toont bij 320px en 32px
root-/bodytekst een samengedrukte chattitel. Het woord 'bonjour' valt uiteen
naast de knoppen. De eerdere geometriecontrole bewees bereikbare focus en geen
horizontale overflow, maar geen voldoende brede leesruimte voor de titel.
De native bevestigingsvensters gebruikten bovendien de browsergrens in em:
250px breed bij dubbele tekst, tegenover 282px bij gewone tekst op hetzelfde scherm.

De kleine CSS-correctie laat de chatkop naar meerdere rijen afbreken als titel
en knoppen niet samen passen. De titelgroep krijgt een flexbasis van 12rem en
kan de volle rij gebruiken. De knoppen blijven in hun bestaande DOM-volgorde en
krijgen maximaal de beschikbare breedte. Dit werkt ook voor de compacte chat op
een breed desktopscherm; een viewport-breakpoint alleen is daarvoor onvoldoende.
De lettergrootte wordt niet verkleind.

De drie native keuzes (chat wissen, oefening leegmaken en verder kijken) krijgen
een eigen max-width van calc(100% - 32px), onafhankelijk van de lettergrootte.
De bestaande breedtecaps, padding, maximale hoogte en verticale scroll blijven
gelden. De beperkte native em-grens hoeft de inhoud daardoor niet meer extra
smal te maken. De onderwerpkaart en overige vensters worden niet aangepast.

De indeling verandert geen inhoud, taal of rechten. Chatconcept,
onderwerp, vergrote chat en afzonderlijke Engine-oefening blijven bestaan. De
rootcache gaat naar v43 en wacht op oude gecontroleerde tabs; de appcache blijft
v7. Er is geen root skipWaiting/clients.claim, nieuwe opslag of netwerkbestemming.

CI vond daarnaast een bestaande focusrace na de vertrekkeuze. Het native venster
herstelde de focus al bij sluiten; een later close-event focuste de oude link
opnieuw. Een gerichte proef met echt Escape en een volgende focusactie vóór
de applicatie-close-handler toonde op mobiel én desktop dat de Engine-knop zijn
focus verloor. De twee negatieve waarnemingen blijven bewaard. De reparatie rondt
sluiten en focus synchroon af bij behouden, Escape, achtergrondklik en de gewone
nieuw-tabkeuze. De latere handler ruimt uitsluitend openbare bestemmingstekst op
en slaat een inmiddels heropend venster over. De href blijft bestaan tot na de
native klikactie, zodat target=_blank zijn normale werking houdt.

Vergeleken met de vorige levering veranderen drie openbare bestanden: styles.css,
integration.mjs en sw.js. De overige negentien, de app, NOVA en de zelfstandige
offlineversie blijven bytegelijk. Dit verleent geen toegang of nieuwe rechten.

## Bewijsgrens

De oude schermafbeeldingen en geometrie blijven behouden. Nieuwe gerichte
browsergevallen moeten de titelbreedte, rijverdeling, het ongesplitste Franse
woord, alle drie dialoogbreedtes, bereikbare scrollacties en zichtbare focus
daadwerkelijk controleren. Ze gebruiken lokale synthetische concepten en de
strikte pakketserver; er wordt geen publieke dienst benaderd. De volledige CI
controleert daarna dezelfde nieuwe commit. Resultaten, head/tree, negatieve
eerste uitslagen en pakketvergelijking worden in de definitieve levering vastgelegd.

Een bestaande native Control-click-proef liep in Linux-CI vast. Extra
diagnostiek behield de primaire fout: het activeren van een achtergrondtab in
de standaard headless shell bereikte de deadline. Alleen de proef met native
tab-/downloadgebaren gebruikt daarom de volledige Chromium-browser via het
[officiële nieuwe headless-kanaal](https://playwright.dev/docs/browsers#chromium-new-headless-mode).
Alle oorspronkelijke asserts en de deadline blijven; geen retries of skips.
Andere gevallen houden hun bestaande browser. De precieze oorzaak binnen
Chromium is hiermee niet bewezen en blijft als onzekerheid gerapporteerd.

Een volgende CI-run op b2ca92d had 77/78 PASS: de tabgebaren en nieuwe indeling
slaagden, maar de mobiele resetkeuze bleef verborgen. Dit leidde tot de hierboven
bewezen applicatiefout. De oorspronkelijke timing trad lokaal niet vanzelf op;
de gerichte eventvolgorde maakt het focusverlies aantoonbaar zonder sleeps of
synthetisch close-event. Tests bewaken ook dat een oude close een opnieuw
geopende keuze niet leegmaakt. Definitieve uitslagen staan in de levering.

PALACO PR75 is op 23 oktober alleen-lezen hercontroleerd: al extern gemerged in
zijn eigen featurebasis, niet main. Bestaande exacte-head runs zijn historisch
groen; hun stagingadapter-, accountbinding- en TLS-dekking is vandaag niet opnieuw
uitgevoerd. PALACO #50 blijft HOLD en #51/#60/#64 zijn open. Echte bevestiging van
telefoon/e-mail, provider/account-activering, P.P.-uitgifte, operationele chat/E2EE,
BRI9ADE en fysieke telefoon-/screenreaderacceptatie blijven open.

## VORM9EVIN9 RECORD

- **Publiek en surface:** VisitCard op smalle telefoon en compacte/brede desktopchat, touch en toetsenbord.
- **Onderwerp:** tijdelijke chat en drie bevestigingskeuzes; dezelfde inhoud en status met meer leesruimte.
- **Touchflow:** chat openen/vergroten, keuze openen, behouden of expliciet bevestigen; directe vervolgfocus zonder latere focusdiefstal.
- **Begrijpelijkheid:** titel en knoppen delen geen te smalle kolommen; grote letters blijven groot.
- **Toegankelijkheid:** extra rij waar nodig, 44px acties, RTL, native dialoog, verticale scroll, synchrone focus en reduced-motion.
- **RIO-context:** zeven VisitCard-talen, elf NOVA-talen, aparte tijdelijke oefeningen en ongewijzigde permissions.
- **Provenance en grens:** bestaande schermafbeeldingen/geometrie en nieuwe tests; presentatie verleent geen identiteit of authority.
- **Validatie:** nieuwe gerichte browsergevallen en exacte-head CI volgens het definitieve bouwrapport; fysieke acceptatie blijft open.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS.
- **Volgende stap:** afronden van reproduceerbaar layout-/pakketbewijs en later afzonderlijke fysieke toegankelijkheidsacceptatie.

## PALACO PROOF

- **Proposition:** grote tekst behoudt voldoende titel-/dialoogruimte; de vertrekkeuze behoudt inhoud en pakt geen volgende focusactie terug.
- **Scope and criterion:** lokale Chromium-preview, zeven talen, smal scherm en compacte desktopchat; geometrie en bediening slagen op dezelfde commit.
- **Evidence:** oud Frans scherm als tegenbewijs voor bredere leesbaarheidsclaim, oude breedtemetingen, nieuwe browsergevallen en CI/pakketcontrole.
- **Provenance:** fasebasis 4b22579; definitieve head/tree, runs, metingen en hashes staan in de levering.
- **Falsification:** titel blijft samengedrukt, dialoog houdt de em-krimp, knop raakt buiten bereik, een oude close pakt focus of wist een heropende keuze, concept gaat verloren of extra netwerk/opslag ontstaat.
- **Status:** PROVISIONAL.
- **Limits:** definitieve controles nog vast te leggen; geen algemene toegankelijkheidscertificering, echte toelating, fysieke acceptatie, merge of deploy.
