# HARA runtime · HARAM huishoudagent v0.1

HARA levert een lokale ontwikkelruntime. HARAM is daarin de zichtbare huishoudagent voor gesprekken, taken, boodschappen en expliciet opgeslagen notities. De agent gebruikt de officiële OpenAI Agents SDK en een server-side sleutel. De bestaande synthetische ELIXER-candidate blijft een afzonderlijk artefact.

## Starten

Node.js 24 of hoger. Vanuit de repository:

```text
npm --prefix hara-runtime ci --ignore-scripts
npm --prefix hara-runtime start
```

Open http://127.0.0.1:4193/. De server luistert uitsluitend op loopback. `PORT` kan een andere vrije lokale poort kiezen. De ingang vanuit het HARA-dashboard verwijst naar de standaardpoort. Er wordt niets naar Render of een publieke host gepubliceerd.

De sleutel wordt via de beveiligde OpenAI Developers-flow in de genegeerde rootfile `.env.local` gezet; de startopdracht leest deze server-side. Sleutels horen nooit in browsercode, Git, SQLite, logs of een chatbericht. De standaard is `gpt-6-astra`; een expliciet ingestelde `HARAM_MODEL` kiest een ander beschikbaar model. De actuele basis volgt de [officiële SDK-quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart). Voor eenvoudige experimenten is `gpt-6-luna` een mogelijke starterkeuze; modelwisselen vervangt geen ontbrekend API-tegoed.

De SDK is gekozen omdat deze host de opslag, concrete hulpmiddelen en toestemmingsbeslissingen beheert. De SDK verzorgt de agentlus; zie [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk).

## Wat werkt

- Een echt AI-transport en tool-lus, zonder nagebootste antwoorden in de normale runtime.
- Zelf lokaal taken, boodschappen en notities invoeren, ook zonder API-sleutel of AI-toestemming. `Zelf iets toevoegen` maakt eerst een voorstel; `Goedkeuren` voert de exacte lokale wijziging uit. Ook afronden, heropenen en vergeten gaan via een aparte kaart.
- Expliciete toestemming voor berichten/gesprekscontext naar OpenAI. Huishoudcontext heeft een afzonderlijke keuze.
- Server-owned gesprek en sessie; actor- en huishoudclaims uit een browserbericht worden geweigerd.
- Huishouden lezen en concrete voorstellen maken voor een taak, boodschap of notitie; een bestaande taak/boodschap afronden of een notitie vergeten.
- Een aparte bevestigingskaart. De host bindt de exacte actie aan actor, huishouden, sessie, digest, basisrevisie en tien minuten geldigheid. Zonder bevestiging wordt geen huishouditem veranderd.
- Atomische SQLite-wijziging met uitvoerbewijs. Herhaling van dezelfde bevestiging levert hetzelfde receipt zonder dubbele wijziging.
- Pauzeren/intrekken breekt het werkelijke providerverzoek af. Een laat antwoord kan niet alsnog worden gepubliceerd. Een gewijzigd toestemmingsbereik of gewist gesprek verwerpt eerdere AI-gesprekscontext en AI-voorstellen. Eigen lokale voorstellen behouden hun afzonderlijke sessiebereik en blijven bruikbaar.

## Zelf bijhouden zonder AI

Open in `Je huishouden` de keuze `Zelf iets toevoegen`. Kies taak, boodschap of notitie en vul titel, eventuele details en datum in. `Voorstel bekijken` toont de exacte inhoud als `Door jou ingevoerd`; pas `Goedkeuren` verandert het overzicht. De knoppen `Afronden`, `Heropenen` en `Vergeten` op bestaande items maken eveneens eerst een voorstel. Een datum is geen automatisch alarm.

Deze lokale handelingen roepen OpenAI niet aan en veranderen geen AI-toestemming. Geef je later toestemming voor huishoudcontext, dan kunnen bevestigde items wel met een volgend AI-gesprek meegaan. Open lokale voorstellen zijn geen modelcontext. Tijdens een lopende AI-beurt in dezelfde browsersessie wacht lokale wijziging op afronding of expliciet pauzeren.

Nieuwe voorstellen en receipts onderscheiden `LOCAL_OPERATOR` van `AGENT_MODEL`; de host kiest die herkomst en bindt haar in digestversie 2. Bestaande records behouden hun oorspronkelijke versie-1-digests en receipts. Hun herkomst is `LEGACY_UNSPECIFIED`, zonder achteraf AI- of menselijke oorsprong toe te kennen. De SQLite-schemauitbreiding gebeurt in één transactie. Er mogen acht lokale voorstellen tegelijk openstaan en maximaal 24 per minuut worden gemaakt; bevestigen en afwijzen gebruiken dezelfde sessie-, CSRF-, revisie- en vervalcontrole.

Open voorstellen horen bij hun huidige browsersessie in het draaiende proces. Een herstart herstelt hun bevestigingsmogelijkheid niet; bevestigde huishoudgegevens en receipts blijven bewaard.

De agent beschikt over `read_household` en `propose_household_change`. Het model krijgt geen uitvoerende schrijf-, shell-, netwerk-, mail-, betaal- of apparaattool. Het bevestigen in de interface voert de begrensde lokale transactie uit. Die hostcontrole is een aparte grens naast de SDK-lus; presentatie of modeltekst kan haar niet overslaan.

## Opslag, identiteit en grenzen

Bevestigde items, voorstellen, intrekkingen en receipts staan in `hara-runtime/.data/household.sqlite`, buiten Git. De lokale opslag is niet als versleuteld, onafhankelijk ondertekend of productieklaar gecertificeerd. Dit proces beheert één lokaal huishouden voor de operator van deze computer. Een nieuwe browser ziet het bevestigde lokale huishouden, maar krijgt geen toestemming voor AI-verwerking en kan voorstellen uit een andere sessie niet bevestigen. Dit is geen multi-user- of telefoon/providerlogin.

Gesprek en providertoestemming zijn process-local. Herstart behoudt de bevestigde huishoudgegevens maar herstelt geen AI-toestemming. De gespreksbuffer is begrensd op veertig berichten; maximaal twaalf worden bij een volgende beurt gebruikt. Vergeten verwijdert de actieve notitie; eerdere voorstelinhoud blijft in de lokale historie. Het is geen volledige gegevenswissing. Intrekken haalt eerder naar OpenAI verzonden gegevens niet terug. `store:false` en uitgeschakelde tracing voorkomen aangevraagde Responses-opslag en SDK-traces; dit is geen claim over alle providerretentie.

Er zijn geen externe agenda's, e-mailaccounts, aankopen, slimme apparaten, automatische alarmen of achtergrondtaken aangesloten. Dat zijn afzonderlijke toekomstige verbindingen met eigen toestemming en tests. De Matriarch-relatie blijft CONFIRMED op Maurits' verklaring en verleent geen impliciete toolrechten. Het oorspronkelijke `lab:haram:001`-manifest, package, identiteit en de bestaande synthetische EXECUTE/ACTIVE-engine worden niet omgezet in deze runtime.

## Verificatie

```text
npm --prefix hara-runtime test
npx playwright test --config hara-runtime/playwright.config.mjs
```

De unit-/SDK-/HTTP-tests gebruiken een expliciet testmodel of testprovider. De browsertests gebruiken de werkelijke lokale server met een begrensde testprovider; ze bewijzen geen live modelantwoord. De nieuwe workflow `HARA household runtime` draait ook op de huidige draft-PR-basis.

```text
npm --prefix hara-runtime run smoke
```

Deze afzonderlijke opdracht gebruikt echt OpenAI-API-verkeer en kan API-tegoed verbruiken. Zij werkt uitsluitend op een synthetisch huishouden in het geheugen: lezen, één voorstel, geen mutatie vóór bevestiging, één lokale bevestiging en idempotent herhalen. Zij leest nooit de echte huishoud-DB.

De eerste liveproef van 26 oktober 2026 bevestigde toegang tot het ingestelde model, maar het antwoordverzoek eindigde met `429 / credit_balance_exhausted`. Daarom is er nog geen succesvolle live AI-beurt geclaimd. De runtime toont hiervoor een veilige foutmelding en behoudt het concept in het invoerveld. [API billing](https://platform.openai.com/settings/organization/billing) is een externe menselijke accountactie; de runtime koopt geen tegoed en roteert geen sleutels.

Status: **LOCAL DEVELOPMENT / DRAFT**. Geen merge, publieke deploy, officiële ELIXER-uitgifte of productieactivatie.
