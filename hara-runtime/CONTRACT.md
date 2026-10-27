# HARA / HARAM — lokaal runtimecontract v0.1

Bron: Maurits' directe opdracht van 26 oktober 2026: “geef HARA runtime en bouw HARAM als een volwaardige (huishoudings) AI agent”. Dit artefact concretiseert de lokale ontwikkelbouw. De bestaande grenzen rond draft, merge, publieke deploy en productieactivatie blijven gelden.

## Gescheiden rollen

- HARA: de lokale host, opslag, toestemmingscontrole en transactionele uitvoergrens.
- HARAM / H∆R∆M: de zichtbare AI-agent die uitlegt, leest en wijzigingen voorstelt.
- Operator: de lokale gebruiker van deze computer. Dit is geen geverifieerd PALACO-persoons-ID.
- OpenAI: modelprovider na expliciete toestemming. Het model kiest nooit zijn eigen actor, huishouden of bevoegdheid.

Er wordt geen officiële ELIXER-ID, issuer, signer, namespace of WORLD/Citadel-binding uitgegeven. De bestaande labcandidate blijft ongewijzigd. Maurits' CONFIRMED Matriarch-record blijft een afzonderlijk relatiebesluit.

## Uitvoerbare keten

1. Een lokale browser krijgt een host-owned sessie en CSRF-token, met afzonderlijke lokale en AI-scopes. Zonder AI-toestemming is het gesprek PAUSED; het lokale huishouden blijft bruikbaar.
2. Chattoestemming laat berichten en begrensde gespreksgeschiedenis naar OpenAI gaan. Huishoudcontext vereist een afzonderlijke keuze.
3. De SDK-agent mag de huidige context lezen en een strikt gestructureerd voorstel maken. Op dit moment wijzigt geen huishouditem.
4. De gebruiker ziet actie, inhoud en effect en bevestigt de voorstel-digest.
5. De host controleert actor, huishouden, sessie, huidige toestemming, digest, basisrevisie en verval opnieuw.
6. Eén SQLite-transactie schrijft het item, de nieuwe revisie, voorstelstatus, audit-event en receipt. Dezelfde bevestiging krijgt hetzelfde receipt terug.

De modeltoolset bevat uitsluitend `read_household` en `propose_household_change`. Er is geen modeltool waarmee direct items, autorisaties, bestanden, accounts of externe diensten kunnen worden gewijzigd. De menselijke bevestigingsroute is de concrete lokale uitvoertoelating.

Eigen lokale invoer gebruikt `/api/local/proposals` en de bijbehorende aparte bevestigings-/afwijzingsroutes. Deze route verlangt een geldige lokale sessie, exacte Origin, CSRF-token en actie, maar geen chattoestemming, OpenAI-configuratie of toestemming voor delen van huishoudcontext. De host bindt de bron `LOCAL_OPERATOR`; AI-tools krijgen uitsluitend `AGENT_MODEL`. Bron, actor, huishouden en scope zijn geen toegestane browservelden. Een AI-voorstel kan niet via de lokale route worden bevestigd, ook niet na intrekken of als herhaalde bevestiging.

Nieuwe voorstellen binden de herkomst in digestversie 2. De transactionele SQLite-migratie bewaart bestaande versie-1-bytes en receipts; hun herkomst blijft `LEGACY_UNSPECIFIED`. Historische herkomst wordt niet achteraf als AI of mens bevestigd. Intrekken, een AI-toestemmingswijziging of gesprek resetten trekt uitsluitend de AI-scope in; eigen lokale voorstellen behouden hun lokale scope. Beide routes delen de actuele huishoudrevisie. Tijdens een AI-beurt in dezelfde browsersessie worden lokale voorstelmutaties met BUSY geweigerd. Andere browsers delen de huishoudrevisie als conflictgrens. Een sessie kan acht lokale voorstellen openhouden en er maximaal 24 per minuut maken.

## Acties

`add` maakt een task, shopping-item of memory-notitie. `complete` wijzigt de afvinkstatus van een bestaande taak of boodschap. `forget` verwijdert uitsluitend een actieve memory-notitie. Iedere actie vereist een eigen voorstel en bevestiging. Een datum is een opgegeven kalenderdatum, geen scheduler of notificatie. De huidige host heeft geen timers of externe kalenderverbinding.

Voorstellen vervallen na tien minuten en zijn aan één basisrevisie gebonden. Een gelijktijdige wijziging maakt een eerder voorstel stale. AI-intrekking maakt open AI-voorstellen onbruikbaar, breekt providerverkeer af en verwerpt laat afgeleide output. Herstart herstelt huishouditems en receipts, maar geen providerconsent, chatsessie of bevestigingsscope voor open voorstellen.

## Grenzen

Alleen `127.0.0.1` wordt gebonden. HTTP Host en Origin worden exact gecontroleerd; mutaties vereisen een sessiegebonden CSRF-token en JSON. Sleutels en interne providerdiagnostiek zijn geen browserdata. Het serverbestand, de env-file en SQLite-bestanden behoren niet tot de publieke routes of de statische RIO-bundel.

Het huishouden is lokaal en gedeeld door sessies van dezelfde computeroperator. Dit contract claimt geen geauthenticeerde meerdere personen, tenantdienst, versleutelde opslag, gecertificeerde privacy, externe uitvoering of productiegeschiktheid. Bestaande voorstelinhoud blijft lokale historie; “vergeten” is geen volledige historische gegevenswissing.

Een succesvolle test met een testmodel bewijst geen echte AI-beurt. Modeltoegang, beschikbare API-credits, een werkelijke providerbeurt en formele governance worden afzonderlijk gerapporteerd. `READY` betekent dat lokale toestemming en configuratie aanwezig zijn; `providerConnection: VERIFIED` ontstaat pas na een daadwerkelijk geslaagde beurt in dat proces. Het is geen productie- of ELIXER-activatiestatus.
