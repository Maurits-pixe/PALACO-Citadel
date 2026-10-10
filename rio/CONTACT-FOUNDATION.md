# 6RI9ADE — negen bodyguards en RIO-bronbinding v0.1

Dit is een nieuw **DESIGN_DRAFT**, op expliciet verzoek van de architect op 2026-10-10. De negen bodyguards krijgen eigen logische rol-ID's en specialiteiten. Dit zijn geen achteraf verzonnen historische agentidentiteiten en nog geen aangesloten veiligheidsdiensten.

**Doel:** sterke, toetsbare bescherming van overdracht. Absolute veiligheid is geen garantie. Bij ontbrekend, verlopen, onbereikbaar of tegenstrijdig bewijs blijft contact op **HOLD**. Een aangetoonde verboden of vervalste overdracht wordt geweigerd.

## De negen specialiteiten

| Bodyguard | Specialiteit | Hoofdcontrole |
|---|---|---|
| BG01 | Identiteit en apparaat | Account, sessie, toestel en vertrouwde evidence-uitgever horen bij dezelfde actuele partij. |
| BG02 | Adres en bestemming | P.P.-eigenaar, ontvanger en CITADEL/MUNDO-context komen overeen; oude rechten volgen geen heruitgifte. |
| BG03 | Menselijke toestemming | NOVA-toelating en finale instemming zijn afzonderlijk; beide partijen bevestigen hetzelfde exacte contactcontract. |
| BG04 | Toegang en beleid | Alleen afgesproken scope, actuele policy en minimale rechten; eerste scope is chat:text. |
| BG05 | Versleuteling en sleutels | Bewezen E2EE-stack, geauthenticeerde toestelsleutels en zichtbare sleutelwisselingen. |
| BG06 | Inhoud en integriteit | Geauthenticeerde berichtcontext en veilige weergave aan de endpoints; mascottes en tekst blijven data. |
| BG07 | Herhaling en volgorde | Replay, verkeerde epochs en dubbele verwerking stoppen; begrensde herordening en retries blijven mogelijk. |
| BG08 | Privacy en metadata | Minimale gegevens, veilige meldingen en audit; geen plaintext of privéredenen bij de relay/afzender. |
| BG09 | Aflevering en intrekking | Actuele rechten bij servicecommit én vlak vóór aflevering, duurzame outbox en herstel; blokkering/intrekking stopt nieuw verkeer. |

[brigade-specialties.json](brigade-specialties.json) beschrijft per rol concrete controles, stopvoorwaarden, plaats van uitvoering en grenzen. Alle negen rollen zijn **DESIGN_ONLY**, **UNENROLLED** en **NOT_CONNECTED**.

## Gemeenschappelijke overdrachtsregel

Iedere toekomstige operationele uitslag moet dezelfde aanvraag/verbinding, beide partijen en apparaten, exact contactcontract, scope, policyversie, sleutelepoch, vertrouwde evidence-uitgever en vervaltijd binden. Een ontbrekende controle mag niet verdwijnen achter één groen totaalvlaggetje.

De route blijft:

**Menselijk verzoek → NOVA → geïsoleerde receptie → eerste menselijke toelating → bilaterale veiligheidscontroles → definitieve menselijke instemming → begrensd contact.**

BG03 verifieert receipts en beslist niet namens een mens. Een technische PASS, lezen, op wacht of een AI-uitspraak maakt geen menselijke toestemming. Nieuwe voorwaarden vereisen nieuwe bevestiging. Geen bodyguard kan zelfstandig sociale acceptatie, extra scope of institutionele bevoegdheid uitgeven.

BG05 en BG06 werken voor sleutel- en inhoudcontroles aan de endpoints. De relay krijgt geen toegang tot E2EE-plaintext of privésleutels. Integriteit bewijst niet dat inhoud waar of onschadelijk is. Intrekking kan eerder ontvangen berichten of screenshots niet gegarandeerd terughalen.

## BRIGADE-bron gevonden

De eerdere algemene zoektocht miste twee bestaande bronnen. Ze zijn nu exact gebonden aan PALACO-Citadel commit **117e3ba7023aafd040b0babc89b878beb1dc0cc8**:

| Bron | Wat deze bron ondersteunt | Git-blob-SHA |
|---|---|---|
| [BIG BANG, sectie XL](https://github.com/Maurits-pixe/PALACO-Citadel/blob/117e3ba7023aafd040b0babc89b878beb1dc0cc8/CANON/00-big-bang/%23%20%E2%98%84%EF%B8%8F%20THE%20BIG%20BANG%20%E2%80%94%20PALACO#L1231) | Vermelding van het BRIGADE-concept als ecosystemische laag. | 701324fd30ca0c88af928a24e43c66274db51110 |
| [Guardian-profielbasis](https://github.com/Maurits-pixe/PALACO-Citadel/blob/117e3ba7023aafd040b0babc89b878beb1dc0cc8/08-IMPLEMENTATION/profile.go#L12) | Profielvelden: ID, BrigadeID, Status, KnownFromStart en ExpertiseDomain. | 1716ee6893558976cf6db18dc338e350c572bc8e |

Dit bewijst niet dat de historische bron de namen BRIGADE, BRI9ADE en 6RI9ADE gelijkstelt, negen specifieke identiteiten benoemt of live veiligheidschecks uitvoert. De nieuwe specialiteiten komen uit de huidige opdracht. De Guardian-constructorwaarde 'bekend' is geen geverifieerde identiteit of veiligheidsattestation.

## Wat deze bouwstap uitvoert

[contact-source-binding.json](contact-source-binding.json) registreert de bronpins en open operationele bindings. [contact-readiness.mjs](contact-readiness.mjs) controleert de vaste repository, commit, paden, ondersteunde claims en de exacte bronbytes tegen hun Git-blob-identiteit. Het rapport berekent bovendien SHA256 van ieder gecontroleerd bestand en van het nieuwe specialiteitenontwerp.

- Geldige bronnen geven **BRIGADE_REFERENCE_BOUND**.
- Wijziging, ontbrekende bytes, pinvervanging of onbewezen claims geven **SOURCE_BINDING_UNRESOLVED**.
- Een geldig negenrollenontwerp geeft **DESIGN_DRAFT**; ongeldige, ontbrekende of dubbele rollen geven **INVALID**.
- Ieder resultaat houdt **contactStatus=HOLD**, **canOpenContact=false** en **operativeAuthority=NONE**.

Er is geen nieuwe berichtkern of openbare muterende endpoint toegevoegd. Deze controle sluit aan op het bestaande RIO-referentieprofiel en kan bronnen en ontwerp uitleggen. Zij is geen authenticator, E2EE-implementatie, evidence-uitgever of contactexecutor. HARA-onderhoudsautorisatie kan contacttoestemming niet vervangen.

## Nog te verbinden

Operationele agentidentiteiten/capabilities, bilaterale runtime-evidence, P.P.-registratie en het 5CRIPTIE-ID-contract blijven **UNKNOWN**. Daarna volgen geauthenticeerde menselijke receipts, duurzame contactservice en E2EE-tekstrelay.

Het [RIO CONTACT-fundament v0.1](https://app.notion.com/p/a69dd64d85664c809b8b723630785a52) rapporteert twintig synthetische tests. De ZIP-digest en die tests zijn in deze bronbindingsstap niet onafhankelijk geverifieerd; zij blijven REPORTED_ONLY. De nieuwe GitHub-tests controleren de bronbinding, schemastructuur en expliciete ontwerpgrenzen afzonderlijk. Zij bewijzen niet de inhoudelijke betekenis van vrije ontwerptekst of de uitvoering van de negen veiligheidscontroles.

Het masterplan noemt de toekomstige productieaansluiting onder `crates/palaco-citadel/src/rio/` in Maurits-pixe/PALACO. Deze locatie bestond niet op de onderzochte commit db664274c3760cca3fef19d23945e3c79dbe7f8c. Deze stap maakt daarvan geen implementatieclaim. Toekomstige muterende contactservice volgt een afzonderlijk contract; bestaande read-only RIO-bewijsroutes mogen geen schrijfrechten krijgen.

## Controle

~~~text
npm run test:rio:contact
node rio/contact-readiness.mjs
~~~

De tweede opdracht geeft een lokaal leesbaar JSON-rapport. Bij ongeldige bronbinding of een ongeldig specialiteitenontwerp eindigt zij met een foutstatus. Een succesvolle controle bewijst uitsluitend de gecontroleerde bron-/ontwerpconsistentie, geen operationele veilige aflevering.

## Volgende gebouwde referencecontrole

[Ondertekende 6RI9ADE-evidencecontrole](BRIGADE-EVIDENCE.md) beoordeelt achttien bilaterale uitslagen en twee afzonderlijke menselijke poorten met echte handtekeningverificatie op synthetische fixtures. Dit brengt het ontwerp samen zonder contact te openen of operationele identiteiten te claimen.
