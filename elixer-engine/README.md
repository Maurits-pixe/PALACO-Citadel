# HARA — ELIXER ENGINE met onderhoudsuitvoering v0.2

HARA onderhoudt consumentenwebsites, apps en ELIXERS binnen een **MUNDO (WORLD/PLANET)**. **CITADEL** begrenst toegang en context. **VORM9EVIN9** maakt de presentatie begrijpelijk en toegankelijk. Dit volgt de expliciete richting van de architect in deze opdracht.

De eerste uitvoeringsverbinding werkt op één geregistreerd, synthetisch consumentenobject in het geheugen. HARA kan daarvan de titel, uitleg en toegankelijke naam bijwerken van versie 0.1.0 naar 0.1.1. De ontvangstbewijzen vermelden de versie en digest vóór en na de wijziging.

## Gebruik

Node.js 24 of hoger. De kern heeft geen externe dependencies.

~~~text
npm --prefix elixer-engine test
node elixer-engine/preview/server.mjs
~~~

Open http://127.0.0.1:4187. Kies **HARA: toegestaan testonderhoud** en druk op **Voer testonderhoud uit**. Het openen van de pagina of opvragen van een toestand voert niets uit. Een expliciete POST voert één vaste, vooraf gebonden testopdracht uit. Herhaling levert hetzelfde onderhoudsreceipt en veroorzaakt geen dubbele wijziging.

~~~text
node elixer-engine/demo.mjs execution-authorized
node elixer-engine/evidence.mjs
npm ci --ignore-scripts
npx playwright install chromium
npx playwright test --config elixer-engine/playwright.config.mjs
~~~

Er zijn tien synthetische situaties. Het bestaande v0.1-profiel blijft uitsluitend lezen; het afzonderlijke v0.2-profiel staat de ene begrensde onderhoudshandeling toe. De manifestversie en volledige definitie worden samen aan de package-digest gebonden.

## Uitvoering

Een aanvraagref is alleen een verwijzing. De engine leest de daadwerkelijke autorisatie uit een vertrouwde hostregistratie. Die registratie bindt actor, tenant, WORLD, Citadel, ELIXER-versie, package-digest, beleid, toestemming en de volledige onderhoudsopdracht, inclusief doel, basisdigest, nieuwe inhoud en idempotency-key.

Consent voor lezen is geen toestemming voor onderhoud. De opdracht vereist afzonderlijk `consumer.maintenance.write`-consent én een actuele uitvoeringsautorisatie. Beleid en manifest moeten EXECUTE expliciet toestaan. Een afwijkende actor, onbekend doel, verkeerde basisversie, gewijzigd verzoek, ingetrokken autorisatie of vervallen registratie stopt vóór de wijziging.

Direct vóór commit wordt een consistente, synchrone snapshot van de vertrouwde registraties opnieuw gecontroleerd. Het nieuwe object, idempotency-record en actie-receipt worden vervolgens samen opgeslagen via één in-process referentiewijziging. Er is geen netwerk- of modelaanroep tussen de laatste controle en die commit.

Na commit blijft EXECUTION=COMMITTED waarheidsgetrouw, ook als de klok of geldigheid daarna verandert. De receipt beschrijft de daadwerkelijk uitgevoerde handeling. Verlopen rechten mogen geen volgende handeling toestaan, maar wissen geen historische uitvoering.

## Status en aansluitingen

ACTIVATION=ACTIVE geldt uitsluitend voor het expliciet gebonden synthetische v0.2-profiel. Authority blijft NONE en distribution NOT_ALLOWED. Production activation is niet aangesloten. De testautorisatie `lab-architect-001` is een synthetische fixture, geen geverifieerde identiteit of institutionele uitgifte.

De bekende CITADEL-bron is [Maurits-pixe/PALACO-Citadel](https://github.com/Maurits-pixe/PALACO-Citadel). MUNDO is de door de gebruiker gedefinieerde WORLD/PLANET, geen aangenomen websiteadres. [maintenance-targets.json](maintenance-targets.json) legt de rollen en huidige aansluitstatus vast. Er is nog geen runtime-connector voor echte consumentenwebsites, apps of ELIXERS.

Onderhoud, replay-ledger, canonieke historiek en receipts zijn alleen process-local. Herstarten reset het testobject; deze versie claimt geen duurzame opslag of productie-audit. Een hash bevestigt inhoud, niet een officiële handtekening, PROOF of distributiebevoegdheid.

## Bronnen en presentatie

- [ELIXER ENGINE — Kernelcontract v0.1](https://app.notion.com/p/bf8b28ff413049c5985caab475827458)
- [ELIXER LABORATORIUM](https://app.notion.com/p/50f3dbccda0a4e03a26476cdc6f44cd7)
- [VORM9EVIN9](../.github/agents/palaco-vorm9evin9.agent.md)
- [Technische contracten en rollen](CONTRACTS.md)

De broncontracten zijn gesnapshot in sources/ en behouden hun oorspronkelijke ontwerpstatus. v0.2 concretiseert de later door de architect toegestane onderhoudsuitvoering. Het is reviewbare broncode; onafhankelijke beoordeling vóór release blijft een afzonderlijke stap.

## Huishouden per CITADEL/MUNDO

Iedere CITADEL/MUNDO-context heeft een eigen huishouden: **ELIXER HARA**. De uitvoerbare testinstantie heeft een host-owned household-record, een eigen household-reference en expliciet geregistreerde consumentenobjecten. De autorisatie bindt ook de volledige huishouden-digest. Een andere WORLD, Citadel, household of niet-geregistreerd doel kan die toestemming niet overnemen. Het model maakt geen globale HARA-bevoegdheid aan.
