# De Geheugenkamer · Citadel v0.6

Afzonderlijke, offline-first werkende HTML-proefmodule voor Locus Amoenus. De bestaande Citadel-startnavigatie bevat op deze **conceptbranch** een extra link naar de Geheugenkamer. Observatorium en Atelier blijven inhoudelijk ongewijzigd. De Sites-publicatie is **niet gewijzigd**.

## Bewijskamer-ontvanger (nieuwe proefmodule)
Er is nu een afzonderlijke lokale ontvanger op [`../la-bewijskamer/`](../la-bewijskamer/) die het handoff-JSON-formaat kan controleren en als niet-geverifieerd dossier kan presenteren. De ontvangende interface heeft een eigen [README](../la-bewijskamer/README.md) en regressietests. Dit is geen backendintegratie of officiële bewijsverificatie.

## Overdrachtscontract v0.6
- Bewijskamer/ERA-overdrachtsconcept via expliciet geselecteerd dossier met een **aparte checkbox voor eenmalige toestemming**.
- Uitvoer is een handmatig te verplaatsen JSON-bestand `PALACO-CITADEL-HANDOFF-DRAFT-1`, niet een automatische systeemkoppeling.
- Trust, beoordeling, bronverificatie, klokattest en EDTR-uitgifte staan standaard op onbevestigd of geblokkeerd.
- Toestemming vervalt na export, selectie van een ander dossier of wissen van de selectie.
- Protocol en ontvangende beoordelingsvoorwaarden: [HANDOFF-CONTRACT.md](HANDOFF-CONTRACT.md).

## Dossierinspectie v0.5
- Inspecteer per geselecteerde herinnering een **alleen-lezen** dossier met WIE/WAT/WAAR/WAAROM/HOE, herkomst en expliciete truststatus.
- Volg gekoppelde voorgangers in omgekeerde versievolgorde; eventueel ontbrekende voorgangers worden vermeld als niet aanwezig in het lokale archief.
- Exporteer alleen de geselecteerde versie met lokaal beschikbare lineage als `PALACO-CITADEL-DOSSIER-DRAFT-1`. De export is **geen** certificaat of onafhankelijk gevalideerd bewijs.
- Het wissen van herinneringen maakt een eerder geselecteerd dossier ongeldig, zodat een verouderde selectie niet geëxporteerd wordt.

## Functionele verbindingen
- Nieuw lokaal geheugenlandschap: verzamelingen Persoonlijk, Wereld, Atelier, Observatorium en Citadel met aantallen en directe filters.
- Duidelijke navigatielinks naar Observatorium, Atelier en Citadel; er is **geen** gedeelde datastore, automatische export of autorisatie over die routes heen.
- Nieuwe versie weigeren als de eerdere recordreferentie ondertussen gewist is.

## Functionaliteit
- Responsieve luxueuze Citadel-weergave, mobiel/desktop en toetsenbordbediening.
- Herinneringen met WIE/WAT/WAAR/WAAROM/HOE, bron en collectie.
- Zoekveld, collectiefilter, sorteerrichting en geschiedenis per versie (append-only binnen tab).
- Lokaal concept zonder automatisch permanent opslaan; expliciete checkbox voor localStorage. Bestaande opgeslagen gegevens worden bij nieuwe opt-in niet overschreven: eerst expliciet herstellen.
- JSON-import/export met schema- en lengtecontrole, 256-KB importlimiet, maximaal 100 records, deduplicatie per ID en lineage-conflictcontrole.
- Herstel van een eerder lokaal archief uitsluitend na expliciete gebruikersactie; geen automatische restore.
- Afzonderlijk *Bewijskamer-dossier (concept)* met record-ID, verwijzing naar vorige versie, bron en statusvelden: geen inhoudelijke verificatie of officiële EDTR-uitgifte.
- UTC van het apparaat (presentatietijd, **niet** een ERA atoomtijdmeting).
- Vertrouwenslabel `SELF_REPORTED_NOT_VERIFIED`.

## Beveiligingsgrenzen
- Er is geen backend, netwerkverzoek, authenticatie, upload of automatische synchronisatie.
- JSON-import is onbetrouwbare data; weergave uitsluitend via textContent (geen HTML-injectie).
- Alleen lokale concepten: `authority: NONE`, `LOCAL_DRAFT_ONLY`; ERA/EDTR-uitgifte **HOLD**.
- Geen claim van cryptografisch bewijs, atomaire tijd, onafhankelijke verificatie of juridisch onweerlegbare append-only-opslag.
- Browseropslag is **niet versleuteld**. Voer geen gevoelige persoonsgegevens in.

## Lokale regressiecontroles
Voer vanuit de repository-root uit:

```sh
node --test DOCS/la-geheugenkamer/geheugenkamer.test.mjs
```

De 18 tests dekken navigatiecontinuïteit, vluchtige opslag als standaard, opslag-opt-in en wissen, expliciet herstel, append-only versieontwikkeling, zoeken, negatieve JSON-import, afwijzen van cyclische lineage, veilige tekstweergave, concept-bewijsuitwisseling, collectiefilters en bescherming tegen een verdwenen voorganger, dossierinspectie, export zonder uitgifte, ongeldige selectie na wissen, geblokkeerde overdracht zonder toestemming en eenmalige overdrachtstoestemming. **CI-uitvoering geslaagd (17 november 2026): 18/18 Geheugenkamer, 10/10 Bewijskamer-handoff en 7/7 triage; totaal 35/35 PASS.** Zie [GitHub Actions-run 44021549355](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44021549355). Browser-/mobiele acceptatie en security review blijven HOLD.

## Offline-data-integriteit
- Na paginavernieuwing wordt een eerder lokaal archief **niet automatisch** geladen.
- De opslagcheckbox weigert inschakelen als een ander archief al op het apparaat aanwezig is; eerst via `Laad eerder lokaal archief` herstellen.
- Herstel van ongeldige gegevens wordt geweigerd. Uitschakelen van de opslagcheckbox wist de lokale opslag van deze module.
- Twee nieuwe echte Chromium-testscenario’s controleren dit op mobiele viewport. Uitvoering en uitslag zijn te verifiëren via GitHub Actions.

## Volledige historische voorgangerketen · v3.3
- Een expliciete **versleutelde kluisopslag** weigert voortaan een geheugenmomentopname wanneer een versie een `previousId` noemt die niet in dezelfde momentopname aanwezig is. Bestaande validatie van revisienummers, chronologie, duplicaten en cirkelverwijzingen blijft gelden.
- Een gedeeltelijk historisch importarchief mag zichtbaar blijven als lokaal concept voor onderzoek, maar mag **niet** stilzwijgend als complete versleutelde kluis worden verzegeld. Herstel eerst de ontbrekende voorgangers of gebruik een volledige export.
- De beslissing over import of het bekijken van oudere gedeeltelijke archieven wordt hierdoor niet onbedoeld veranderd. De aanvullende controle vindt plaats bij het opslaan van een nieuwe versleutelde kluismomentopname.
- Twee nieuwe mobiele Chromium-testgevallen controleren (1) weigering van een verweesde versie na gedeeltelijke legacy-import, zonder wijziging van opslag, en (2) succesvol bewaren en opnieuw ontsluiten van een complete keten met oorsprong en opvolger.
- Dit is volledigheidscontrole van lokale conceptdossiers, **geen** authenticiteitsverklaring, tijdattest of EDTR-uitgifte. Onafhankelijke review en fysieke mobiele acceptatie blijven HOLD.

## Historische dossierconflicten · v3.2
- De controle vóór het vervangen van een versleutelde kluis vereist naast behoud van alle eerdere record-ID's voortaan ook **exact gelijkblijvende inhoud van elk eerder opgeslagen record**.
- Een bestaand ID met gewijzigde velden wordt expliciet geweigerd: oudere herinneringen mogen niet stilzwijgend worden herschreven door een lokaal conflicterende versie.
- De reeds bestaande mergecontrole bij kluisontgrendeling wijst niet-identieke records met hetzelfde ID eveneens af.
- Twee aanvullende mobiele Chromium-regressies testen een inhoudsconflict bij kluisoverschrijving en bij ontgrendeling. De opgeslagen versleutelde bytes moeten in beide gevallen behouden blijven.
- Voor bewuste wijzigingen gebruikt de Geheugenkamer de bestaande functie **Nieuwe versie**, die een nieuw record toevoegt met een verwijzing naar zijn voorganger. Fysieke apparaattests en onafhankelijke securityreview blijven HOLD.

## Legacy-format hardening · v3.1
- Onbekende of niet-objectvormige kluisschema's worden bij expliciete ontgrendeling meteen geweigerd zonder ze te openen of gegevens te importeren.
- Een bestaande kluis groter dan 256 KB mag niet worden overschreven; ongeldige revisie-enveloppen met verkeerd getypeerd revisienummer of ongeldig `parentDigest` worden vóór migratie afgewezen.
- Twee extra mobiele Chromium-proeven testen onbekende schema's, een beschadigde revisie-envelop en een te grote kluis; na weigering blijven kluisbytes en actieve herinneringen onaangetast.
- De controles wijzigen geen bestaande kluis automatisch en vervangen geen onafhankelijke securityreview of fysieke apparaattests.

## Versleutelde kluis-migratie · v3.0
- De bestaande, oudere **platte AES-256-GCM-kluisblob** blijft op een nieuwe pagina gesloten. De status noemt het oude formaat, maar het openen vereist altijd de juiste wachtzin.
- Ontgrendelen ontsleutelt en valideert het legacy archief, zonder de opgeslagen bytes automatisch te veranderen. Er vindt **geen automatische migratie** plaats.
- Na expliciete ontgrendeling kan de gebruiker met dezelfde oorspronkelijke wachtzin de bestaande kluis handmatig opnieuw opslaan als `PALACO-CITADEL-VAULT-2`. De nieuwe envelop krijgt revisie **2** en een SHA-256 `parentDigest` van de oorspronkelijke kluisblob.
- Een afwijkende wachtzin blokkeert de migratie zonder de oude ciphertext te vervangen. Alle oude record-ID's moeten in het actieve geheugen aanwezig blijven.
- Twee aanvullende mobiele Chromium-proeven controleren (1) gesloten legacy-kluis, handmatig openen, migratie, bewaarde dossierinhoud en opnieuw openen na herladen, en (2) blokkade bij foutieve wachtzin.
- Bestaande gegevens van testgebruikers mogen niet zonder back-up of fysieke acceptatie naar een andere browser worden gekopieerd. Ook deze migratie bewijst **geen** identiteit, bronherkomst of ERA/EDTR-autorisatie.

## Verifieer wachtzin vóór definitief verwijderen · v2.9
- De handeling **Verwijder apparaatkluis** vereist voortaan twee expliciete controles: een definitieve bevestiging **en een opnieuw ingevoerde wachtzin** waarmee het bestaande AES-256-GCM-archief daadwerkelijk kan worden ontsleuteld en op SHA-256-integriteit wordt gecontroleerd.
- De wachtzininvoer wordt direct leeggemaakt; de wachtzin wordt niet in browseropslag vastgelegd. Onjuiste wachtzin, beschadigde kluis, een ingetrokken tab-autorisatie of tussentijdse wijziging weigert de verwijdering zonder de bestaande ciphertext aan te passen.
- De finale opslagwijziging valt nog altijd binnen de exclusieve Web Lock en toetst opnieuw het operatietoken en de exacte originele kluisblob.
- De bestaande verwijderproeven zijn uitgebreid met de noodzakelijke wachtzininvoer. Twee aanvullende mobiele Chromium-proeven testen onjuiste wachtzinnen en de onderbreking van een vertraagde verwijdering door het vergrendelen van de tab.
- Dit betreft browsergerichte beveiliging, **geen** bescherming tegen onbevoegde toegang tot het volledige browserprofiel, directe opslagmanipulatie of schadelijke scripts op dezelfde origin.

## Geverifieerde kluisoverschrijving en gegevensbehoud · v2.8
- Bij het vervangen van een bestaande versleutelde apparaatkluis wordt de opgegeven wachtzin **eerst gecontroleerd door het bestaande archief daadwerkelijk te ontsleutelen** en de SHA-256-integriteit te valideren. Een verkeerde wachtzin wordt geweigerd voordat een nieuwe kluisblob wordt opgeslagen.
- Vooraf wordt gecontroleerd of **alle record-ID's uit de vorige versleutelde momentopname** nog aanwezig zijn in het actieve geheugen. Onbedoeld verlies van eerder opgeslagen dossiers door een onvolledige momentopname wordt geweigerd. Voor bewust archiefverwijdering bestaat een afzonderlijke bevestigde handeling.
- Het oude versleutelde bestand blijft bij een mislukte controle exact behouden. Nieuwe, niet-opgeslagen herinneringen in de geopende tab blijven eveneens staan.
- Twee extra echte Chromium-touchtests controleren een verkeerde wachtzin bij overschrijven (en succesvolle latere opslag met de juiste wachtzin) en het weigeren van een snapshot waar eerder opgeslagen records ontbreken.
- De controles zijn lokaal en vervangen geen onafhankelijke cryptografische/securityreview. De bestaande browser-lock- en kluisversiecontroles blijven gelden.

## Hervergrendeling trekt schrijf- en verwijderrechten in · v2.7
- Handmatig **Vergrendel deze tab** wist behalve het actieve geheugen nu ook de in deze tab onthouden kluisbasis (`vaultBaseRaw`); het eerder ontgrendelde kluisexemplaar mag niet meer worden overschreven of verwijderd.
- Zolang een bestaande kluis aanwezig is, kan pas na opnieuw ontgrendelen met de wachtzin bewust worden opgeslagen of verwijderd. Een nieuwe losse notitie na vergrendeling geeft geen toestemming om de opgeslagen kluis te vervangen.
- Twee Chromium-touchregressies toetsen dat vergrendelen een bestaande kluis beschermt tegen zowel overschrijven als verwijderen en dat na expliciete herontgrendeling bewust verwijderen opnieuw mogelijk is.
- Deze wijziging is lokale gebruikersinterface- en opslagbeveiliging, geen bestandssysteemautorisatie of beveiliging tegen kwaadaardige scripts. Fysieke mobiele acceptatie en onafhankelijke securityreview blijven HOLD.

## Leesbare kluisstatus en fysieke apparaatacceptatie · v2.6
- De Geheugenkamer toont een **alleen-lezen kluisstatus** met `role=status` en `aria-live=polite`. De status vermeldt uitsluitend aanwezigheid en, bij een geldige revisie-envelop, een versienummer; er worden geen herinneringen of wachtzinnen ontsloten.
- Bij herladen wordt een aanwezige kluis nog altijd **niet automatisch ontgrendeld**. De status verwerkt ook ontbrekende, beschadigde, onbekende of te grote opslag en wordt bijgewerkt na bewaren, verwijderen en externe browser-tabwijzigingen.
- Twee Chromium-testscenario's simuleren mobiele statusovergangen en een beschadigde opslagblob zonder privégegevens in de melding.
- Het document [MOBIELE-ACCEPTATIE-v2.6.md](MOBIELE-ACCEPTATIE-v2.6.md) bevat een concreet 9-stappenprotocol voor echte Android/Chrome- en iPhone/Safari-apparaten, inclusief bewijsvelden en een expliciete HOLD-gate.
- De fysieke apparaten zijn **niet** via deze CI getest; de broncode blijft DRAFT en ongepubliceerd op de live Citadel-site.

## Mobiele foutafhandeling en gegevensbehoud · v2.5
- Twee extra Chromium-touchtests controleren of een **verkeerde kluiswachtzin** en een **gewijzigde ciphertext** worden geweigerd zonder de bestaande herinneringen te veranderen.
- Bij een foutieve kluiswachtzin blijft zowel het actieve geheugen als de versleutelde kluisblob ongewijzigd; na de poging staat de wachtzininvoer leeg.
- Bij import van een beschadigd AES-256-GCM-bestand blijven reeds ingevoerde herinneringen zichtbaar en wordt geen nieuwe onversleutelde browseropslag gemaakt.
- Dit zijn negatieve regressieproeven in een gesimuleerde mobiele browser. Ze vervangen geen onafhankelijke cryptografische veiligheidsbeoordeling of acceptatie op een fysiek apparaat.

## Mobiele herstelbeveiliging · v2.4
- De asynchrone JSON-import bewaakt nu het oorspronkelijke geheugen en een operatietoken. Een tussentijdse wijziging of vergrendeling annuleert de nog lopende import voordat records worden samengevoegd.
- De beveiliging geldt ook tijdens trage AES-256-GCM-ontsleuteling: een vergrendelde mobiele tab mag niet door een eerder gestarte bestandsimport opnieuw worden gevuld.
- Twee aanvullende echte Chromium-touchtests gebruiken vertraagde sleutelafleiding om te controleren dat (1) vergrendelen tijdens import geen herinneringen heropent en (2) het aanmaken van een nieuwe herinnering tijdens import de oudere bestandssnapshot niet stilzwijgend toevoegt.
- Een afgewezen import verandert de reeds aanwezige herinneringen niet en start geen ongevraagde apparaatopslag.
- Fysieke tests op Android en iOS blijven nodig; Chromium-touchsimulatie garandeert niet hetzelfde bestands- en opslaggedrag op echte telefoons.

## Mobiele aanraakacceptatie · v2.3
- Twee extra Chromium-browserproeven testen viewportbreedtes **320 px en 360 px**, mobiele aanraakbediening en een gesimuleerde telefooncontext.
- Kluisproef: herinnering invoeren, versleuteld bewaren, controleren dat geen oude onversleutelde opslag is ontstaan, pagina herladen (gesloten), bewust ontgrendelen met wachtzin en de actieve tab na bevestiging vergrendelen.
- Bestandsproef: versleuteld archief op een mobiele browsercontext downloaden, met de bestandskiezer invoeren in een tweede mobiele context, SHA-256/AES-256-GCM-validatie doorlopen en controleren dat geen automatische localStorage ontstaat.
- De proeven verifiëren de browserlogica en de gesimuleerde aanraakinteractie; **ze zijn geen fysieke iPhone- of Android-tests**. Werkelijke mobiele bestandskiezers, toetsenborden en opslagbeleid vereisen aanvullende acceptatie op echte apparaten.
- Bestaande desktop-Chromium-, Firefox-, WebKit- en Node-controles blijven verplicht.

## Cross-browser-acceptatie · v2.2
- De CI bevat naast de bestaande Chromium-regressies twee afzonderlijke Playwright-matrixjobs op Ubuntu 24.04 voor **Firefox** en **WebKit**.
- Beide browsers testen handmatige AES-256-GCM-archiefexport en -import over geïsoleerde browsercontexten: geen leesbare titel in de versleutelde bestandsbytes, correcte ontsleuteling, geen stilzwijgende opslag.
- De kluisproef verifieert per engine het ondersteunde gedrag: waar Web Locks beschikbaar zijn, kan de kluis versleuteld worden opgeslagen en na expliciete ontgrendeling terugkomen; anders moet opslag fail-closed worden geweigerd zonder onversleutelde fallback. Een geslaagde test betekent **niet** automatisch dat iedere engine Web Locks ondersteunt.
- **Geverifieerd:** [GitHub Actions-run #44244131191](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44244131191): **63/63 PASS** (35 Node + 24 Chromium + 2 Firefox + 2 WebKit), vier jobs succesvol.
- Grenzen: gesimuleerde browsers in Linux-CI zijn geen fysieke Windows/Android/iOS-apparaten; iOS Safari, mobiele Firefox, brede toegankelijkheid en onafhankelijke security/privacy-review blijven open.

## Racecontrole en directe compatibiliteitsmelding · v2.1
- Twee nieuwe echte Chromium-scenario's: twee versleutelde schrijvers concurreren achter een door een derde tab bezette Web Lock; slechts één snapshot wordt opgeslagen, en een verouderde tweede schrijver wordt afgewezen.
- Een test zonder `navigator.locks` controleert dat de versleutelde kluis **niet** wordt opgeslagen en dat geen onversleutelde fallback wordt gebruikt.
- Als Web Locks niet beschikbaar is, meldt de Geheugenkamer dat nu **vóór** een kostbare PBKDF2-sleutelafleiding. De lokale gegevens blijven voorlopig uitsluitend in de geopende tab.
- Geverifieerde basis: [GitHub Actions #44241693594](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44241693594), **59/59 PASS** (35 Node en 24 Chromium), op commit `4a04181122c16e893d5c2886607363788c26dd69`. De aanvullende test op de snellere compatibiliteitsmelding wordt afzonderlijk door CI uitgevoerd.
- Web Locks coördineert alleen samenwerkende tabs van dezelfde origin. Dit is geen volledige databanktransactie, geen fysieke mobiele acceptatie en geen bewijs van herkomst of ERA/EDTR-autorisatie.

## Exclusieve cross-tab schrijflock · v2.0
- Versleuteld kluisschrijven en het verwijderen van de kluis maken gebruik van de **Web Locks API** (exclusieve locknaam `palaco.citadel.geheugenkamer.vault.write`), gedeeld door tabs van dezelfde origin.
- De exclusieve lock omvat de laatste controle van revisie/opslagstatus én de daadwerkelijke localStorage-mutatie. Een tweede tab kan niet tegelijk via dezelfde appcode een kluis schrijven of verwijderen.
- Bij afwezigheid van Web Locks wordt de mutatie **fail-closed geweigerd**. Het openen en gebruiken van bestaande dossiers blijft gescheiden van deze schrijfacties.
- Verwijderen controleert de bekende huidige kluisversie opnieuw; het wissen van een onbekende of inmiddels gewijzigde kluis wordt geweigerd. Bewust verwijderen vereist nog steeds een bevestiging.
- Chromium-browserproeven bezetten de exclusieve lock in tab A en controleren dat opslaan en verwijderen in tab B wachten tot de lock vrijkomt.
- **Grenzen:** de Web Locks API coördineert alleen code die dezelfde lock respecteert. Andere scripts, browserextensies of directe localStorage-wijzigingen kunnen dit omzeilen. Web Locks garandeert geen duurzame, transactionele commit of synchronisatie tussen apparaten. Browserondersteuning buiten Chromium moet nog worden geaccepteerd.

## Revisies en bescherming tegen verouderde tabbladen · v1.9
- De versleutelde apparaatkluis gebruikt voortaan een envelop `PALACO-CITADEL-VAULT-2` met `revision` (beginnend bij 1) en `parentDigest` (SHA-256 van de vorige volledig opgeslagen kluisblob). De bestaande AES-256-GCM-archiefinhoud blijft versleuteld.
- Na succesvol ontgrendelen wordt de exacte opslagversie als uitgangspunt van deze tab onthouden. Bij bewust opnieuw bewaren moet de actuele kluisblob daarmee overeenkomen. Een tweede, verouderde tab kan dus niet zonder voorafgaand ontgrendelen de inmiddels aanwezige kluis vervangen.
- Bestaande versleutelde kluizen van v1.6–v1.8 worden bij ontgrendelen gelezen; de eerstvolgende bewuste opslag migreert die kluis naar revisie 2. De exportbestanden uit v1.5 blijven ongewijzigd.
- Bij iedere overschrijving is nog steeds een afzonderlijke bevestiging vereist. Het mechanisme verhindert het ongemerkt vervangen van een onbekende snapshot; het is **geen onvoorwaardelijke datafusie**.
- Deze revisie- en parent-digestvelden zijn lokale conflicthulpmiddelen, geen geauthenticeerde externe historie of officieel bewijscertificaat.
- Er is **geen atomaire compare-and-swap** in localStorage. Twee exact gelijktijdige schrijfacties kunnen theoretisch nog racen tussen de laatste controle en opslag. Een toekomstige transactielaag, bijvoorbeeld IndexedDB, blijft daarvoor nodig.
- Twee Chromium-proeven testen oplopende revisies en weigering van overschrijven vanuit een verouderd tabblad.
- **CI gecontroleerd op 18 november 2026:** [run #44238500301](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44238500301) slaagde met **55/55 tests**: 35 Node-regressies en 20 Chromium-browserproeven. Voor de Chromium-tests is de runner vastgezet op Ubuntu 24.04 omdat de gebruikte Playwright-versie Ubuntu 26.04 nog niet ondersteunde.

## Tab-overstijgende wijzigingsmeldingen · v1.8
- De Geheugenkamer luistert naar het browser-`storage`-event voor de versleutelde apparaatkluis en de oude onversleutelde opslag.
- Wijzigingen of verwijderingen vanuit een **andere tab** maken lopende versleutel- en ontgrendelbewerkingen ongeldig, met een zichtbare melding; hiermee wordt voorkomen dat een vertraagde ontsleuteling na verwijdering van de kluis alsnog herinneringen zichtbaar maakt.
- Twee nieuwe echte Chromium-browserproeven: verwijdering vanuit een tweede tab tijdens bewust vertraagde sleutelafleiding blokkeert late ontgrendeling; wijzigingen in onversleutelde opslag worden gemeld.
- **Geverifieerd:** [GitHub Actions-run 44082472099](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44082472099): **53/53 PASS** (35 Node, 18 Chromium) op codecommit `774db27431615f8822f84b199524698aa5e5dc18`.
- Beperkingen: `storage`-events bieden geen atomaire locking. Parallelle schrijfacties in verschillende tabs kunnen nog steeds een race veroorzaken. Deze wijziging detecteert bekende externe veranderingen en blokkeert gerelateerde lopende bewerkingen, maar vormt **geen garantie op serialiseerbare transacties**, geen server-synchronisatie en geen beveiliging tegen kwaadaardige origin-scripts.

## Gelijktijdige wijzigingen en kluisintegriteit · v1.7
- Versleuteld bewaren en ontgrendelen krijgen elk een uniek operatienummer en een momentopname van het actieve geheugen. Na de asynchrone sleutelafleiding moet de huidige toestand nog overeenkomen met het uitgangspunt; anders wordt de bewerking geweigerd.
- Nieuwe herinneringen, herstel, JSON-import, wissen, vergrendelen en verwijderen van de kluis maken een nog lopende kluisoperatie ongeldig. Zo kan een late ontgrendeling een bewust vergrendelde tab niet opnieuw vullen.
- Direct vóór een versleutelde opslag worden het originele kluisobject, de onversleutelde opslagstatus, de expliciete opslagcheckbox en de actuele gegevens opnieuw gecontroleerd. Bij een afwijking wordt niet opgeslagen.
- Nieuwe Chromium-tests zetten PBKDF2-sleutelafleiding doelbewust stil om twee racecondities te testen: een nieuw geheugenrecord tijdens encryptie en vergrendelen tijdens ontgrendeling. Beide worden fail-closed afgebroken.
- **Geverifieerd:** [GitHub Actions-run 44080171193](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44080171193): **51/51 PASS** (35 Node-tests, 16 Chromium-tests) op codecommit `274d3c7081867733ce9e70a4b778573f0cd0c1cc`.
- **Beperking:** localStorage biedt geen atomaire compare-and-swap tussen verschillende tabs. Dit voorkomt meerdere praktische races in één tab, maar garandeert geen transactionele synchronisatie of bescherming tegen kwaadaardige scripts op dezelfde origin. Geen officiële ERA/EDTR-autorisatie.

## Versleutelde lokale apparaatkluis · v1.6
- `Bewaar versleutelde kluis` slaat een AES-256-GCM-versleutelde kopie van de huidige archiefsnapshot in de lokale browseropslag op, onder een afzonderlijke sleutel `palaco.citadel.geheugenkamer.vault.v1`. Er is geen automatisch opslaan van daaropvolgende wijzigingen.
- `Ontgrendel kluis` vraagt opnieuw de wachtzin en controleert de AEAD-tag, het archiefschema, SHA-256, recordvalidatie, lineage en conflicten voordat een dossier in de huidige tab zichtbaar wordt. **Na herladen is de tab altijd leeg**, totdat de gebruiker zelf ontgrendelt.
- `Vergrendel deze tab` wist de huidige herinneringen uit de actieve weergave na bevestiging, maar alleen wanneer er geen onversleutelde lokale opslag actief of aanwezig is. **Dit is geen geheugenuitwissing op OS-niveau.**
- `Verwijder apparaatkluis` vereist een afzonderlijke bevestiging. Een bestaande kluis overschrijven vereist eveneens expliciete bevestiging en kan oude gegevens onherstelbaar vervangen.
- De module weigert versleutelde kluisopslag als de oude onversleutelde browseropslag actief of aanwezig is. Omgekeerd wordt onversleutelde opslag geweigerd zolang een versleutelde kluis bestaat. Dit voorkomt onbedoelde gelijktijdige dubbelopslag.
- De wachtzin wordt niet persistent opgeslagen en na gebruik uit het invoerveld gewist. **Verloren wachtzin betekent verloren toegang**; vergeet niet een veilige back-up te maken.
- Grenzen: lokale browseropslag blijft kwetsbaar voor kwaadaardige scripts op dezelfde origin, browsercompromittering en toegang terwijl de tab is ontgrendeld. De opslag is een bewuste snapshot; latere wijzigingen vereisen handmatig opnieuw opslaan.
- Dit is een geïsoleerde conceptfunctie en **geen formele autorisatie, digitale handtekening of ERA/EDTR-uitgifte**.

## Optionele archiefversleuteling · v1.5
- Afzonderlijke knop `Exporteer versleuteld (.json)` met een zelfgekozen wachtzin van minimaal 12 tekens (maximaal 256). De normale SHA-256 JSON-export blijft ongewijzigd beschikbaar.
- Versleutelde bestanden gebruiken `PALACO-CITADEL-GEHEUGEN-ENCRYPTED-1`, AES-256-GCM met willekeurige 96-bits IV en 128-bits authenticatietag; de sleutel wordt per export afgeleid via PBKDF2-HMAC-SHA-256 met **310.000 iteraties** en een willekeurige salt van 16 bytes.
- De oorspronkelijke v2-archiefstructuur inclusief SHA-256-integriteitscontrole bevindt zich *binnen* de versleutelde inhoud. Bij import worden eerst de AEAD-authenticatietag en daarna de v2-checksum gecontroleerd, voordat recordvalidatie en samenvoeging plaatsvinden.
- De wachtzin wordt na gebruik uit het invoerveld gewist en niet naar een server verzonden of in localStorage geplaatst. Opslag van wachtzinnen in browserwachtwoordmanagers, clipboard of geheugen kan daarmee niet categorisch worden uitgesloten.
- Een verkeerde wachtzin, onjuiste encryptiemetadata of gewijzigd versleuteld bestand leidt tot weigering van import. Als Web Crypto niet beschikbaar is, stopt de bewerking.
- **Vergeten wachtzin = geen herstelroute.** De gebruiker moet deze zelf veilig bewaren. Een korte of voorspelbare wachtzin blijft vatbaar voor offline wachtwoordaanvallen.
- De versleuteling garandeert geen onafhankelijke herkomstverificatie, digitale handtekening, ERA/EDTR-uitgifte of veiligheid van de gegevens nadat zij op het scherm zijn ontsleuteld. Browseropslag na een bewuste opslagkeuze blijft onveranderd **onversleuteld**; deze functie versleutelt uitsluitend geëxporteerde bestanden.
- Geautomatiseerde Chromium-browserproeven testen een versleutelde export/import-ronde en het weigeren van verkeerde wachtzinnen en gemanipuleerde ciphertext.

## Integriteitscontrole · v1.4
- Nieuwe export: `PALACO-CITADEL-GEHEUGEN-2` met `integrity.algorithm: SHA-256` en een digest over het complete archief (zonder het digestveld zelf).
- Bij import wordt een gewijzigde of beschadigde v2-export geweigerd voordat records worden samengevoegd. Een niet-beschikbare Web Crypto-omgeving veroorzaakt een foutmelding in plaats van een onbeveiligde v2-export of v2-import.
- Oudere v1-bestanden blijven importeerbaar met een duidelijke waarschuwing dat **geen checksumcontrole** plaatsvindt. Deze legacy-compatibiliteit is geen bewijs van integriteit.
- **Belangrijk:** een checksum zonder digitale handtekening of vertrouwde sleutel bewijst niet wie het bestand maakte en beschermt niet tegen iemand die inhoud én checksum bewust opnieuw genereert. Geen EDTR, identiteitsattest of authentieke bewijsverklaring.
- De SHA-256-functie vereist een veilige browsercontext (bijvoorbeeld HTTPS of localhost).

## Portabele JSON-archieven · v1.3
- De offline JSON-export kan op een tweede apparaat handmatig worden geïmporteerd, zonder automatische browseropslag of netwerkverkeer.
- Herhaalde import van identieke records resulteert niet in duplicaten. Botsende records met dezelfde ID maar afwijkende inhoud blijven geblokkeerd.
- Import accepteert geen archief met verhoogde `authority`, afwijkende `status` of onverwachte recordvelden. Oudere minimale archieven zonder autoriteitsmetadata blijven voor compatibiliteit mogelijk, met alleen de lokale `SELF_REPORTED_NOT_VERIFIED`-status.
- Browserintegratie bewezen met [GitHub Actions-run 44032482971](https://github.com/Maurits-pixe/PALACO-Citadel/actions/runs/44032482971): **43/43 PASS** (35 Node-regressies en 8 Chromium-browserproeven) op commit `8a322d21f83a797849e0c5e8cea0ce39464ba669`. Browseremulatie is geen fysieke apparaattest.

## Acceptatie
Dit is een afzonderlijke reviewkandidaat. Niet gemerged of gepubliceerd. Uitvoeren van browser-/mobiele acceptatie, import-negatieve tests en integratiebeoordeling vóór opname in de bestaande site.