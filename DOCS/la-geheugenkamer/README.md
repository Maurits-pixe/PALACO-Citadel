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

## Revisies en bescherming tegen verouderde tabbladen · v1.9
- De versleutelde apparaatkluis gebruikt voortaan een envelop `PALACO-CITADEL-VAULT-2` met `revision` (beginnend bij 1) en `parentDigest` (SHA-256 van de vorige volledig opgeslagen kluisblob). De bestaande AES-256-GCM-archiefinhoud blijft versleuteld.
- Na succesvol ontgrendelen wordt de exacte opslagversie als uitgangspunt van deze tab onthouden. Bij bewust opnieuw bewaren moet de actuele kluisblob daarmee overeenkomen. Een tweede, verouderde tab kan dus niet zonder voorafgaand ontgrendelen de inmiddels aanwezige kluis vervangen.
- Bestaande versleutelde kluizen van v1.6–v1.8 worden bij ontgrendelen gelezen; de eerstvolgende bewuste opslag migreert die kluis naar revisie 2. De exportbestanden uit v1.5 blijven ongewijzigd.
- Bij iedere overschrijving is nog steeds een afzonderlijke bevestiging vereist. Het mechanisme verhindert het ongemerkt vervangen van een onbekende snapshot; het is **geen onvoorwaardelijke datafusie**.
- Deze revisie- en parent-digestvelden zijn lokale conflicthulpmiddelen, geen geauthenticeerde externe historie of officieel bewijscertificaat.
- Er is **geen atomaire compare-and-swap** in localStorage. Twee exact gelijktijdige schrijfacties kunnen theoretisch nog racen tussen de laatste controle en opslag. Een toekomstige transactielaag, bijvoorbeeld IndexedDB, blijft daarvoor nodig.
- Twee Chromium-proeven testen oplopende revisies en weigering van overschrijven vanuit een verouderd tabblad.

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