# CITADEL · Geheugenkamer — fysiek mobiel acceptatieprotocol v2.6

Status: **PREPARED / NOT EXECUTED / HOLD**. Dit is een begeleid protocol, **geen** bewijs dat iOS/Android-acceptatie is uitgevoerd.

## Voorwaarden
- Test op een fysiek Android-toestel met Chrome en, afzonderlijk, op een fysieke iPhone met Safari. Noteer per test apparaatmodel, OS, browserversie, datum/tijd met tijdzone en de daadwerkelijk geopende URL.
- Gebruik uitsluitend **synthetische testherinneringen**, geen echte identiteitsgegevens of gevoelige persoonlijke informatie.
- De v2.6-code staat in de DRAFT-branch van PR #61; voer geen test op de live ChatGPT Site uit alsof daar deze wijzigingen al gepubliceerd zijn.
- Maak zo nodig vooraf een versleutelde back-up en bewaar de wachtzin buiten de app. Gebruik een apart testprofiel/browseropslag om bestaande gebruikersdata ongemoeid te laten.
- Test alleen onder HTTPS of een ondersteunde beveiligde context. Web Locks en Web Crypto moeten voor versleutelde apparaatopslag beschikbaar zijn. Als Web Locks ontbreekt: documenteer **BLOCKED / FAIL-CLOSED** en forceer geen onversleutelde fallback.

## Sequentie per apparaat
1. Open Geheugenkamer in een nieuw testprofiel. Controleer dat de status **Apparaatkluis: niet aanwezig** toont; geen herinneringen zichtbaar.
2. Maak één synthetisch dossier aan. Sla de kluis bewust versleuteld op met een unieke testwachtzin (12+ tekens). Controleer dat de status uitsluitend aanwezigheid en revisie toont, geen dossierdetails.
3. Sluit de browser volledig en open opnieuw. Controleer dat **0** herinneringen zichtbaar zijn, dat de kluisstatus aangeeft dat de kluis aanwezig maar gesloten is en dat niet automatisch wordt ontgrendeld.
4. Voer een onjuiste wachtzin in en druk op **Ontgrendel kluis**. Controleer dat het dossier gesloten blijft en de kluis niet wordt overschreven.
5. Ontgrendel met de correcte wachtzin. Controleer dat het synthetische dossier leesbaar is; vergrendel de tab, bevestig de waarschuwing en verifieer dat het dossier verdwijnt.
6. Exporteer één **versleuteld JSON-bestand** en controleer via de platform-bestandskiezer dat het bestand vindbaar en opnieuw importeerbaar is in een schoon testprofiel. Geen automatische plaintext-opslag; geen automatische autorisatie.
7. Probeer een bewust beschadigde kopie van het testarchief te importeren. De import moet worden geweigerd terwijl een reeds bestaand synthetisch dossier intact blijft.
8. Controleer toegankelijkheid: 320–390 px schermbreedte, schermrotatie, 200% zoom waar beschikbaar, virtueel toetsenbord, zichtbare focus, leesbare meldingen en bedienbare knoppen.
9. Probeer verwijdering van de testkluis met een **onjuiste wachtzin**: verwacht weigering en behoud van de versleutelde kluis. Voer daarna de **oorspronkelijke wachtzin opnieuw in**, bevestig de definitieve verwijdering en controleer dat de status **niet aanwezig** aangeeft. Verwijder testbestanden uit gedeelde downloadlocaties.

## Bewijsvelden per stap
- Test-ID: `CITADEL-MOB-v2.6-{ANDROID|IOS}-{01..09}`
- Apparaat / OS / browser / browserversie:
- URL en versie/commit:
- Datum/tijd (ISO 8601 met tijdzone):
- Verwachte observatie:
- Werkelijke observatie:
- Resultaat: `PASS`, `FAIL`, `BLOCKED`, of `NOT_RUN`
- Bewijs: lokale screenshot-/rapportreferentie zonder wachtzin of persoonsgegevens
- Waarnemer; onafhankelijke reviewer:
- Opmerkingen / herstelactie:

## Gate
**HOLD** totdat beide platforms fysiek en aantoonbaar zijn getest, eventuele afwijkingen hersteld en onafhankelijk beoordeeld zijn. Browseremulatie telt niet als fysiek bewijs. Geen merge, geen live uitrol, geen ERA/EDTR-uitgifte op basis van dit protocol.
