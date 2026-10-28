# NOVA uitgelegd in alle beschikbare talen

18 oktober 2026. **DRAFT. Geen merge, deploy of Render-wijziging uitgevoerd.**

## Basis en doel

PR #46 is buiten deze uitvoering gemerged naar de RIO-voorbereidingsbranch.
De vervolgwijziging begint bij `dd0f8c1b26b63a916c87ee2002116a6deff07697`,
boom `76060aed80e393325d55a9607f9a3f98992949a3`, van
`codex/rio-reception-availability-lifecycle` (draft #45). De hoofdbranch bevat
andere ontwikkeling; er is geen merge met die ontwikkeling uitgevoerd.

De gebruiker vroeg tijdens de uitvoering: **leg NOVA in alle beschikbare talen uit**.
De receptie krijgt daarom een herkenbare NOVA-uitlegkaart met de elf talen van
de bestaande RIO-app: Nederlands, Engels, Duits, Frans, Spaans, Italiaans,
Portugees, Russisch, vereenvoudigd Chinees, Arabisch en Esperanto.

## De uitleg

De kaart benoemt in iedere taal dezelfde drie dingen: NOVA wijst de weg,
de gebruiker kiest, en deze uitleg registreert of bevestigt niemand en opent
geen echte chat. BRI9ADE blijft een ontwerp; de negen controles worden hier
niet uitgevoerd. De bestaande mascotte blijft behouden.

De taalkeuze heeft een zichtbaar label, eigen taalaanduiding en 48-pixelbediening.
Arabisch gebruikt RTL binnen de kaart. De pagina zelf en overige receptietekst
blijven Nederlands; de kaart meldt dat expliciet in alle elf talen.
De browsertaal kiest de eerste uitleg indien ondersteund, anders Nederlands.
Er wordt hier geen taalvoorkeur gelezen of geschreven in browseropslag.
Een taalselectie veroorzaakt geen API-aanvraag, cookie of registratie.

Zonder JavaScript blijven de Nederlandse titel, drie uitlegblokken en grenzen
leesbaar. De taalselector blijft dan uitgeschakeld. De fallbackmelding staat
standaard in gewone HTML en verdwijnt pas nadat de taalkeuze werkt.

## Taal tussen VisitCard en app

De VisitCard ondersteunt zeven talen, de app elf. Een expliciete taalkeuze in
dezelfde tab wordt gedeeld via de bestaande sessiesleutel `palaco-language`.
Dit is uitsluitend een taalcode, geen persoons-ID, contact, bericht of dossier.
De online app valideert de code en respecteert een geldige expliciete `?lang`.
De lokale reviewserver houdt zijn bestaande queryweigering; de interne links
voegen geen query toe. De queryprioriteit wordt op de geïsoleerde testfixture
bewezen en verruimt de lokale server niet.

De VisitCard valideert de bewaarde keuze vóór het tonen. Talen die alleen in
de app bestaan leiden tot de ondersteunde browsertaal, anders Nederlands.
Die weergavefallback overschrijft de appkeuze niet. Een echte nieuwe keuze op
de VisitCard mag de voorkeur wel wijzigen. Geweigerde of volle opslag stopt
de pagina niet. Het gedownloade bestand leest of schrijft geen nieuwe
sessietaalvoorkeur. Geen voorkeur wordt tussen hosts overgedragen.

De receptielinks kondigen in zeven/elf talen aan dat de receptie Nederlands is
en gebruiken `hreflang="nl"`. De NOVA-uitlegkaart op die pagina is wel vertaald.
Twee bestaande marketingzinnen die gespreksoverdracht of bewaren suggereerden
zijn in zeven talen vervangen door de werkelijke grens: chat en Engine blijven
op de geopende pagina, tijdelijke berichten worden niet bewaard.

## Bouw, cache en hosting

De publieke lijst blijft exact 22 bestanden; geen extra register, API, bronrecord
of vertaalservice wordt gepubliceerd. De canonieke appbron en bronworker v3
blijven ongewijzigd; de gecombineerde bouwvariant gebruikt appcache v5 voor
het gewijzigde startscript. De rootcache wordt v37-unified-language.
De bestaande wachtende update, gescheiden cachefamilies en uitsluitingen voor
query, POST, vreemde oorsprong, account/API en download blijven behouden.
De rootworker cachet de receptiepagina niet; offline navigatie wordt bewezen
voor de geïnstalleerde VisitCard en app, niet voor de receptie.

Het uitsluitend voorbereide Render-profiel noemt nu de nieuwe draftbranch
`codex/rio-nova-multilingual-draft`; automatisch publiceren blijft uit.
De betekenis van branch en autoDeployTrigger is gecontroleerd tegen de
[officiële Blueprint-specificatie](https://render.com/docs/blueprint-spec).
Er is geen Blueprint toegepast, geen dienst gewijzigd en geen deploy gestart.

De volledige receptiesuite vond aanvankelijk vier fouten: de nieuwe kaart
voegde een tweede live-meldingsgebied toe, terwijl de bestaande regel er één
toestaat. De kaart gebruikt nu de gewone gelabelde taalkeuze en laat het
bestaande live-statusgebied intact. De oorspronkelijke asserties zijn behouden;
de nieuwe taalsuite controleert dezelfde grens in alle elf talen.

De containeraanmaak strandde vóór de appbuild tweemaal op een externe ECR
HTTP429-downloadlimiet. De CI-bron wordt daarom de officiële
`docker.io/library/node`, vastgepind op exact dezelfde indexdigest
`sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`.
De opgehaalde officiële indexbytes en linux/amd64-verwijzing zijn geverifieerd
tegen de eerder waargenomen ECR-digests; dit is hetzelfde basisbeeld.
Er zijn geen inloggegevens opgeslagen. Alleen het CI-buildargument verandert;
het Dockerfile en de Render-diensten worden niet gewijzigd.

## Controle en behouden tegenbewijs

De eerste nieuwe browserronde gaf 24/26 PASS. De twee fouten betroffen de
fallbackmelding binnen `noscript` in het scriptvrije browserprofiel. De gewone
HTML-fallback is hersteld; de melding- en zichtbaarheidsasserties blijven bestaan.
Daarna slagen alle 26 browserproeven. Foutcontexten zijn buiten de publieke
uitvoer behouden. De elf vertalingen zijn geschreven en op samenhang nagekeken;
er wordt geen moedertaalreview of toegankelijkheidscertificering geclaimd.

De regressies bewijzen alle elf titels, gevulde teksten en grensverklaringen,
NL-paginataal met plaatselijke RTL, bediening, geen opslag/API/cookies,
gemeenschappelijke en app-only talen, ongeldige codes, geweigerde opslag,
queryprioriteit, daadwerkelijke offline navigatie en het zelfstandige bestand.
De bestaande Engine-, tijdelijke-chat-, contact- en cache-isolatieproeven blijven
ook draaien. CI op de exacte nieuwe head en schermmetingen worden in de
nieuwe draft-PR en het uitvoeringsrapport vastgelegd.

## VORM9EVIN9 RECORD

- **Publiek en surface:** gebruiker op telefoon en computer, met touch en toetsenbord.
- **Onderwerp:** NOVA als bestaande mascotte en wegwijzer; herkenbare uitlegkaart in elf talen.
- **Touchflow:** expliciete taalselector; geen gekoppelde consent- of contactactie.
- **Begrijpelijkheid:** drie korte onderdelen: weg wijzen, zelf kiezen, gesloten grenzen.
- **Toegankelijkheid:** 48-pixelkeuze, eigen taal/RTL, gelabelde uitleg en leesbare HTML-fallback; het bestaande ene live-statusgebied blijft behouden. Browser- en schermcontrole, geen certificeringsclaim.
- **RIO-context:** elf uitlegversies, zeven VisitCard-talen; alleen een bestaande sessietaalcode wordt tussen VisitCard en app gedeeld.
- **Provenance en grens:** genoemde basis, bestaande mascotte, geschreven vertalingen; kijken verleent geen toelating.
- **Validatie:** 26 lokale browserproeven na gecorrigeerde fallback; exacte CI en schermmetingen volgen in het uitvoeringsbewijs.
- **Status:** `VORM9EVIN9_READY_WITH_CONDITIONS`.
- **Volgende stap:** menselijke beoordeling en desgewenst moedertaal-/schermlezerreview, zonder automatische publicatie.

## PALACO PROOF

**PALACO PROOF: ON**

- **Proposition:** NOVA wordt in alle elf beschikbare app-talen uitgelegd met dezelfde grenzen; lokale taalkeuze blijft bruikbaar bij navigatie en opslagfouten.
- **Scope and criterion:** de gecombineerde statische uitvoer en de genoemde browser-/pakketproeven op de nieuwe draft-head.
- **Evidence:** vertaalteksten, bron-/bouwmanifest, positieve en negatieve browseruitvoer en exacte CI in de PR.
- **Provenance:** basis dd0f8c1, expliciete bronwijzigingen en behouden negatieve eerste run.
- **Falsification:** ontbrekende of afwijkende grensverklaring, onverwachte opslag/API, kapotte offline navigatie of opgeheven toegangsgrens faalt de controles.
- **Status:** `PROVISIONAL` tot volledige CI en schermcontrole op de nieuwe head zijn bevestigd.
- **Limits:** geen echte P.P.-registratie, contactbevestiging, accountactivering, chat, E2EE of fysieke telefoonacceptatie. #50 blijft HOLD; historische oorzaken #51/#60/#64 blijven open.
