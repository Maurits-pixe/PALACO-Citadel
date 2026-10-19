# RIO: verder kijken zonder je tijdelijke oefening te verlaten

19 oktober 2026. Aanvulling op draft PR #47, uitgangspunt
`136806815c114732dcac99a368b48874f1ccff70`. Geen merge, deploy of Render-wijziging.

Een gebruiker kan bezig zijn met een chatconcept, gekozen onderwerp, verstuurd
voorbeeldbericht of aparte Engine-oefening wanneer die NOVA, de app of een
taakbalkplek opent. Alleen voor de twee RIO-routes en drie bestaande openbare
taakbalklinks verschijnt dan een keuze: **Blijf hier** of **Open in nieuw tabblad**.
Het huidige tabblad en de tijdelijke inhoud blijven open. De keuze verleent
geen toestemming, identiteit of chattoegang.

De eigenaar van elke oefening levert alleen een boolean of er tijdelijk werk
bestaat. De koppeling leest geen berichten, dossier, onderwerp of conceptinhoud.
De nieuwe tab heeft geen opener of verwijzer. NOVA krijgt het bestaande
taalfragment; de app krijgt uitsluitend de publieke taalcode via zijn bestaande
`?lang=`-parser. Het oorspronkelijke appadres blijft `/rio/`.
De draagbare reviewserver accepteert deze taalroute met één exacte bekende code;
andere velden, dubbelingen, coderingen en padaliassen blijven geweigerd.

Zonder tijdelijk werk is er geen extra stap. Ankers binnen de pagina, downloads,
bestaande nieuwe-tablinks en gewijzigde muisklikken behouden hun gewone gedrag.
Dit bewaakt geen adresbalk, browserterugknop, sluiten of herladen; er is geen
beforeunload-prompt of nieuwe opslag. Browserherstel is geen gegarandeerde
bewaarfunctie of bewijs van wissen. De oude stellige wistekst is daarom begrensd.

Rootcache v40 bevat de gewijzigde openbare bestanden. De gegenereerde appcache
blijft v7, omdat die appbytes niet wijzigen. De bestaande wachtende-updategrens
blijft gelden: rond oefeningen af en sluit oude previewtabs voordat de update
kan activeren. Wis geen browsergegevens; daarmee kunnen lokale contacten verdwijnen.

## VORM9EVIN9 RECORD

- **Publiek en surface:** VisitCard op telefoon en desktop, touch en toetsenbord.
- **Onderwerp:** tijdelijke lokale chat of Engine-oefening; geen operationeel contact.
- **Touchflow:** route kiezen, veilig beginnen bij blijven, expliciet apart openen.
- **Begrijpelijkheid:** korte titel en concrete uitleg; zichtbare bestemming en host.
- **Toegankelijkheid:** native dialog, titel/uitleg, Escape, achtergrondklik, focusherstel,
  acties minimaal 44px, zeven root-talen en Arabisch RTL.
- **RIO-context:** alleen een bekende taalcode naar de volgende route. Menselijke
  persoonsidentiteiten en gedeelde context blijven gescheiden.
- **Provenance en grens:** bestaande modules en vijf bestaande adressen; geen
  opslag, payloadoverdracht, contactverificatie, uitvoeringsrecht of toestemming.
- **Validatie:** uitvoerbare browsergevallen in `departure-choice.spec.mjs`, naast
  bestaande taal-, offline-, cache-, provider/account-binding- en TLS-controles.
  De verzamelde resultaten worden per exacte PR-head in het afleverrapport vastgelegd.
- **Status:** `VORM9EVIN9_READY_WITH_CONDITIONS`; fysieke telefoon- en
  screenreaderacceptatie staan nog open.
- **Volgende stap:** onafhankelijke acceptatie en afzonderlijk besloten aansluiting.

## PALACO PROOF

PALACO PROOF: ON.

- **Proposition:** de vijf bewaakte routes laten tijdelijke inhoud op de open
  VisitCard staan, zonder die inhoud naar een nieuw tabblad door te geven.
- **Scope and criterion:** uitsluitend deze lokale browserkeuze; geldige publieke
  bestemming, geen payload, behoud van invoer/focus en bruikbare kleine tekstlayout.
- **Evidence:** gerichte browsergevallen en volledige bestaande CI op de exacte
  commit; resultaten en eventueel tegenbewijs horen bij het afleverrapport.
- **Provenance:** genoemde uitgangscommit, productmodules, vaste adressen en
  reproduceerbare lokale testfixtures. Openbare proefdiensten worden niet benaderd.
- **Falsification:** verlies van invoer bij annuleren, overdracht van inhoud,
  onverwachte opslag/netwerkactiviteit of onbereikbare acties weerleggen de claim.
- **Status:** `PROVISIONAL` in dit ontwerp-/bronrecord; alleen geslaagde uitvoerbare
  controles rechtvaardigen een begrensde bewezen status in het afleverrapport.
- **Limits:** geen echte identiteit, chat/E2EE, BRI9ADE, publicatie of fysieke acceptatie.
  PALACO #50 blijft HOLD; #51, #60 en #64 vereisen hun eigen bewijs.
