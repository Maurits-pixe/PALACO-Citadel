# 6RI9ADE — ondertekende evidencecontrole v0.1

Deze bouwstap maakt de negen specialiteiten controleerbaar in een **SYNTHETIC_ONLY / REFERENCE_ONLY** evaluator. De evaluator verifieert echte Ed25519-handtekeningen op testbewijzen. De testuitgevers en menselijke sessiereceipts zijn fixtures; er zijn geen productie-identiteiten of veiligheidsdiensten ingeschreven.

## Achttien controles, twee menselijke poorten

Voor iedere rol BG01–BG09 is één actuele uitslag nodig van de afzenderkant én één van de ontvangerkant. Alle achttien plaatsen blijven afzonderlijk zichtbaar. Een JSON-veld PASS, een rolnaam, een zelf meegestuurde publieke sleutel of een synthetische humanConfirmed-boolean is onvoldoende.

De volgorde is:

1. Een afzonderlijk ondertekend sessiereceipt bevestigt het exacte afzenderverzoek.
2. Een afzonderlijk ondertekend ontvangende sessiereceipt laat NOVA toe tot de geïsoleerde ontvangstzone. Het bindt ook het eerste receipt.
3. Achttien rol-/partijgebonden attestations binden de gezamenlijke toelatingsdigest en hetzelfde exacte contract.
4. Pas daarna kunnen beide finale sessiereceipts hetzelfde contract én de digest van de complete gecontroleerde evidenceset bevestigen.

BG03 controleert in stap 3 het verzoek en de NOVA-toelating. Hij hoeft daar nog geen finale toestemming te eisen; dat zou de route circulair maken. Finale bevestigingen worden apart beoordeeld.

## Exacte binding en vertrouwde uitgevers

Het contactcontract bindt request-ID, challenge-ID, beide accounts/apparaten en hun tenant/WORLD/CITADEL, beide keyversies, scope, policyversie, P.P.-bindingsversie, 5CRIPTIE-bindingsversie en de geldigheidsperiode. De eerste scope is uitsluitend chat:text.

Iedere attestation bevat versie, type, eigen ID, toegewezen issuer-ID, rol, partij, contractdigest, toelatingsdigest, checkpoint, uitslag, bewijsdigest, issue time en expiry. Sleutels worden uitsluitend opgehaald uit de vertrouwde hostsnapshot. Een issuerrecord bindt ook de rol, partij, account, apparaat, keyversie, context en geldigheidsperiode.

Ondertekende bodies gebruiken vastgelegde gesorteerde JSON-bytes met een afzonderlijk 6RI9ADE-referencedomein. De implementatie gebruikt de [Ed25519-verificatie van Node.js](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback). Andere sleuteltypen, private PEM in een public-keyveld, niet-canonieke signatures, onbekende velden, verkeerde context of een verkeerde rol/partij worden afgewezen. Dit is evidenceverificatie, geen nieuw E2EE-protocol.

## Uitkomsten

| Uitkomst | Betekenis |
|---|---|
| HOLD | Evidence ontbreekt, is onbekend, ongeldig, tegenstrijdig, verlopen of ingetrokken; een vertrouwde actuele snapshot ontbreekt. |
| STOP | Een actuele, geauthenticeerde en exact gebonden guard meldt FAIL, of de vertrouwde host meldt blokkering/intrekking/verval. |
| READY_FOR_FINAL_CONFIRMATION | Alle achttien ondertekende referencechecks melden PASS; beide exacte finale bevestigingen ontbreken nog. |
| REFERENCE_GATE_SATISFIED | Alle achttien checks en beide exacte finale reference-receipts zijn geldig. |

**Elke uitkomst houdt canOpenContact=false, operativeAuthority=NONE, runtimeConnected=false en externalSideEffect=false.** Een volledige positieve reference-evaluatie opent geen verbinding en levert geen operationeel veiligheidsbewijs.

Een geldige FAIL gaat vóór ontbrekende andere rollen. Een vervalste of buiten de context vallende FAIL kan geen geauthenticeerde afwijzing creëren. Gedetailleerde rolbevindingen zijn interne informatie; een toekomstige client mag daarmee geen blokkadelijsten of privéredenen onthullen.

## Tijd, intrekking en checkpoints

Attestations en receipts moeten na de juiste eerdere stap zijn uitgegeven, binnen hun eigen en de contracts-/uitgeversgeldigheid vallen en niet zijn ingetrokken. Dubbele plaatsbezetting of hergebruik van evidence-ID's wordt afgewezen. Gewijzigde evidence maakt oude finale bevestigingen ongeldig.

De host levert een synchrone, maximaal dertig seconden oude snapshot met huidige challenge-/contactstatus, revocationgegevens en uitgevers. Voor terugkeer wordt dezelfde actuele snapshot en geldigheid opnieuw gecontroleerd. Een wijziging tijdens de beoordeling houdt de positieve uitkomst tegen.

SERVICE_COMMIT en QUEUED_DELIVERY zijn afzonderlijke **referencecheckpoints**. De attestation tekent het checkpoint mee, zodat een commit-check niet stilzwijgend als aflevercheck geldt. Een andere complete evidenceset vereist bij deze reference-evaluator nieuwe exacte finale receipts. Dit implementeert geen duurzame contact-/outboxlevenscyclus en claimt geen automatische overdracht van bestaande menselijke toestemming naar nieuwe evidence.

Een ondertekende challenge bindt het verzoek, maar is op zichzelf geen replaypreventie. De evaluator consumeert niets: herhaalde beoordeling heeft geen effect. Werkelijke replaypreventie vereist een duurzame, atomische hostregistratie, samen met consentcontrole bij servicecommit én vlak vóór iedere aflevering.

## Wat nog openstaat

Handtekeningen bewijzen welke vertrouwde testuitgever een assertion heeft ondertekend. Zij bewijzen niet dat alle negen veiligheidscontroles echt zijn uitgevoerd, dat een fysieke mens klikte, dat E2EE draait of dat absolute veiligheid bestaat.

Productie-inschrijving van de negen identiteiten en toegestane attestations, echte account-/apparaatregistratie, menselijke receiptuitgifte, P.P./5CRIPTIE-contracten, duurzame challenge-/consentopslag, E2EE en berichtaflevering blijven afzonderlijke aansluitingen. De bestaande [bronbinding](CONTACT-FOUNDATION.md) blijft daarbij leidend voor wat daadwerkelijk gevonden of alleen ontworpen is.

## Verificatie

~~~text
npm run test:rio:contact
node rio/brigade-evidence-demo.mjs
~~~

De demo bevat uitsluitend synthetische scenario's. Hij serialiseert evaluatorresultaten; privésleutels of complete trustregistraties worden niet meegenomen. GitHub Actions bewaart het rapport naast het bronbindingsrapport en de bestaande kernevidence.

## Message-bound request v0.2

The durable reference outbox adds an exact `transferBinding` to the v0.2 request: message ID, SHA256 of decoded opaque bytes, byte length (1–4096), canonical base64url encoding and idempotency key. These fields enter the full signed contract digest and exact final receipts. The original v0.1 gate remains supported but cannot authorize outbox storage. See [durable outbox contract](./REFERENCE-OUTBOX.md).
