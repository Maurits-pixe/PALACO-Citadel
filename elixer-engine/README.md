# ELIXER ENGINE — eerste synthetische kern v0.1

Deze afzonderlijke module implementeert een eerste uitvoerbaar laboratorium voor het [ELIXER ENGINE-kernelcontract v0.1](https://app.notion.com/p/bf8b28ff413049c5985caab475827458), binnen de grenzen van het [ELIXER LABORATORIUM — Grondwet en Bouwplan v0.1](https://app.notion.com/p/50f3dbccda0a4e03a26476cdc6f44cd7). De eerste kandidaat is H∆R∆, met deterministische adapters voor H∆R∆M, CHINGCHING en HANNIE.

**Status: engineering draft / LAB_CANDIDATE.** Alle gegevens zijn synthetisch. Authority blijft NONE, distribution NOT_ALLOWED en activation INACTIVE. De kern verleent geen operationele bevoegdheid, merge-, release- of uitvoeringsrechten. De bestaande ambassadewebsite en haar hosting maken geen deel uit van deze module.

## Lokaal gebruiken

Node.js 24 of hoger is vereist. De kern zelf heeft geen externe pakketafhankelijkheden.

Vanuit de repository:

~~~text
npm --prefix elixer-engine test
node elixer-engine/preview/server.mjs
~~~

Open daarna http://127.0.0.1:4187. De preview luistert uitsluitend op het lokale loopbackadres. PORT kan desgewenst worden ingesteld op een getal tussen 1024 en 65535.

De preview bevat negen vaste situaties: een geldige aanvraag, ontbrekende toestemming, intrekking, verval, een offline afhankelijkheid, persona-onenigheid, een ongeoorloofde context of scope, een gewijzigd package en een uitvoeringsverzoek. Iedere aanvraag krijgt een nieuwe synthetische fixture; de preview is geen persistent register.

De browsercontroles gebruiken de reeds aanwezige Playwright-ontwikkelafhankelijkheid van de repository:

~~~text
npm ci
npx playwright install chromium
npx playwright test --config elixer-engine/playwright.config.mjs
~~~

De workflow voor deze module voert de kerncontroles en browsercontroles uit. Een geslaagde test is een engineeringobservatie. Onafhankelijke institutionele beoordeling en formele vrijgave blijven afzonderlijke voorwaarden.

## Gedrag van de kern

Een aanvraag doorloopt contractvalidatie, package-integriteit, een expliciet vertrouwde identiteit en context, beleid, toestemming, intrekking en verval, scopebeperking, deterministische persona-adapters en een trace. Ontbrekende of tegenstrijdige informatie blijft zichtbaar; de kern verzint geen identiteit, toestemming, autorisatie of proof.

Toestemming voor synthetische huishoudgegevens staat los van autorisatie voor een handeling. Een interne persona-meerderheid vormt hoogstens een voorstel. Geen persona of capability kan zichzelf rechten toekennen.

Externe uitvoering is in deze eerste kern geblokkeerd. Een uitvoeringsverzoek zonder autorisatie kan als EXECUTION_PENDING_AUTHORIZATION worden vastgelegd. Ook een aangeleverde autorisatiereferentie sluit geen executor aan en maakt uitvoering niet mogelijk. Er zijn geen betalingen, agenda-mutaties, productiegegevens, externe modelaanroepen of automatische activeringen.

De volledige ELIXER en de widget projecteren één immutable canonieke uitkomst. Beide behouden dezelfde resultaatreferentie, toestandsdigest, zeven statusassen, scope, herkomst, onzekerheid, toestemming, autorisatie, afwijkende stemmen en trace. Een compacte weergave mag deze grenzen niet verbergen.

## Integriteit, herkomst en trace

De package-digest gebruikt reproduceerbare canonieke JSON en SHA-256. Dit bewijst alleen dat de package-inhoud overeenkomt met de verwachte digest. Het verifieert geen uitgever of handtekening en geeft geen officiële PROOF, VISITCARD of distributiebevoegdheid.

De trace is een append-only hashketen in het geheugen. De laboratoriumreceipt maakt de waargenomen stappen controleerbaar binnen die journalinstantie. De receipt is geen bewijs van externe uitvoering, geen productieauditregister en niet bestand tegen het vervangen van een volledige journalhistorie. Voor duurzame opslag, handtekeningen, institutionele uitgifte, authenticatie, echte consentregistratie en een executor zijn afzonderlijke ontwerpen en beoordelingen nodig.

De schemas en implementatiekoppeling staan in [CONTRACTS.md](CONTRACTS.md). De broncontracten zijn ontwerpbronnen; deze module wijzigt hun inhoud of formele status niet.
