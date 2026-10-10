# Contracten en implementatiekoppeling

Deze module concretiseert acht technische contracten uit het [ELIXER ENGINE-kernelcontract v0.1](https://app.notion.com/p/bf8b28ff413049c5985caab475827458). De schemas onder schemas/ bevatten de v0.1-vormen. Contractvalidatie is strikt: vereiste velden worden niet aangevuld en onbekende eigenschappen zijn niet toegestaan. Een expliciete null-autorisatie is iets anders dan een ontbrekend autorisatieveld.

| Technisch contract | Functie in de eerste kern |
| --- | --- |
| elixer-manifest-v0.1 | H∆R∆-identiteit en versie, package-digest, persona-adapters, begrensde capabilities, permissies, synthetische dataclassificatie en inactieve uitgifte-/activatiestatus |
| elixer-runtime-request-v0.1 | Expliciete actor en context, intentie, versie, digest, beleidsversie, toestemmingsreferentie, scope, afzonderlijke autorisatie, verval en correlatie |
| elixer-runtime-result-v0.1 | Getypeerde uitkomst, zeven onafhankelijke statusassen, minimale scope, herkomst, onzekerheid, persona-resultaten, dissent en trace |
| elixer-capability-policy-v0.1 | Begrenzing van acties en scope; capabilities geven geen toestemming of bevoegdheid |
| elixer-consent-v0.1 | Actor- en contextgebonden synthetische toestemming met verval en intrekking |
| elixer-revocation-v0.1 | Expliciete actualiteit en ingetrokken referenties; onbekende actualiteit blijft onzeker |
| elixer-trace-receipt-v0.1 | Controleerbare laboratoriumjournalverwijzing; geen productie- of uitvoeringsreceipt |
| elixer-surface-binding-v0.1 | FULL_ELIXER en WIDGET met dezelfde canonieke resultaatreferentie, digest en volledige toestand |

## Verantwoordelijkheden

| Onderdeel | Ontwerpvereiste |
| --- | --- |
| Contractvalidatie | Manifest, aanvraag, beleid, consent en revocation eerst controleren; geen defaults voor ontbrekende vereiste informatie |
| Integriteit | SHA-256-digest over strikt canonieke JSON; mismatches blokkeren voordat persona's worden aangeroepen |
| Context | Vertrouwde actor, tenant, wereld en citadel zijn onafhankelijk van de aanvraag; een mismatch mag geen contextgegevens opvragen |
| Policy en consent | Scope is beperkt tot expliciete, overlappende rechten; private synthetische gegevens vereisen geldige consent |
| Actualiteit | Verval en intrekking vóór gegevensgebruik en vóór publicatie controleren; eerder verkregen gegevens geven geen blijvende rechten |
| Persona-orchestratie | Drie deterministische mocks; adviezen blijven adviezen en afwijkende stemmen blijven behouden |
| Uitvoering | v0.1 blijft read-only; v0.2 heeft één expliciet toegestaan synthetisch onderhoudsprofiel |
| Surface-projectie | Eén uitkomst voor ELIXER en widget, inclusief alle onzekerheid en statusassen |
| Trace | Append-only journal met hashketen; gebeurtenissen en reasoncodes zonder onnodige gegevens |

## Onafhankelijke assen

PACKAGE, CONFORMANCE, AUTHORITY, DISTRIBUTION, ACTIVATION, FRESHNESS en EXECUTION blijven afzonderlijke assen. Een integriteitscontrole of geslaagde tests mogen nooit automatisch AUTHORITY, DISTRIBUTION, ACTIVATION of EXECUTION wijzigen. De eerste kern blijft een LAB_CANDIDATE, ook wanneer engineeringcontroles slagen.

## Grenzen van deze concretisering

De broncontracten vragen om een eerste synthetische testomgeving. Zij definiëren nog geen concrete productie-identiteitsdienst, consentregister, gesigneerde proof-uitgever, duurzaam auditregister of executor. Deze eerste kern sluit dergelijke systemen niet impliciet aan.

De schemas valideren vorm en begrensde waarden. De engine voert de semantische controles uit, waaronder contextbinding, digestvergelijking, actualiteit en het verschil tussen consent en authorization. Een schema-valid object is op zichzelf geen toestemming of authority.

Conformance-, browser- en journalcontroles zijn reviewmateriaal. Zij vervangen geen onafhankelijke institutionele beoordeling of formele acceptatie. Er is geen merge, release, officiële distributie of productieactivatie onderdeel van deze implementatie.

Bronnen:
- [ELIXER ENGINE — Kernelcontract v0.1](https://app.notion.com/p/bf8b28ff413049c5985caab475827458)
- [ELIXER LABORATORIUM — Grondwet en Bouwplan v0.1](https://app.notion.com/p/50f3dbccda0a4e03a26476cdc6f44cd7)

## Onderhoudsuitvoering v0.2

De architect heeft uitvoering expliciet toegestaan en HARA benoemd voor het onderhoud van consumentenwebsites, apps en ELIXERS. MUNDO betekent WORLD/PLANET. CITADEL begrenst toelating en context; VORM9EVIN9 verzorgt de presentatie.

| Aanvullend contract | Functie |
| --- | --- |
| elixer-operation-v0.1 | Exacte onderhoudshandeling, geregistreerd doel, verwachte basisdigest, nieuwe inhoud en idempotency-key |
| elixer-execution-authorization-v0.1 | Host-owned, actor/context/package/policy/consent/opdrachtgebonden autorisatie met uitgifte, verval en intrekking |
| elixer-action-receipt-v0.1 | Daadwerkelijk gecommitteerde synthetische wijziging, vorige/nieuwe versie en hashes, replay-referentie en PROCESS_MEMORY-status |

`validateManifest` controleert naast schema-vorm de samenhang van twee expliciete profielen: v0.1.0 blijft INACTIVE met EXECUTE verboden; v0.2.0 is een ACTIVE synthetisch onderhoudsprofiel met uitsluitend public.read en consumer.maintenance.write. Een willekeurige ACTIVE-wijziging aan het oude profiel wordt geweigerd. Beleidsvalidatie wijst conflicterende allow/forbid-regels af.

De uitvoeren-route vraagt eerst de actuele toestemming en autorisatie op; een persona-call is hiervoor niet nodig. Een meerderheid of een druk op een knop geeft op zichzelf geen rechten. De klik is de expliciete opdracht voor de reeds afzonderlijk gecontroleerde, exacte testautorisatie.

De huidige executor vervangt alleen de toegestane presentatievelden van een geregistreerd synthetisch object. Hij kan geen scripts, bestanden, links, configuratie, permissies, constitutionele inhoud of deployopdrachten uitvoeren. WORLD/tenant/Citadel zijn onafhankelijk van de aangeleverde aanvraag gebonden. Verkeerde basisdigest en gewijzigde replay worden geweigerd.

## VORM9EVIN9-record

- **Publiek en surface:** lokale testgebruiker; browser op desktop en smal mobiel scherm.
- **Onderwerp:** één fictieve consumentenwebsite met versie en zichtbare onderhoudsstatus.
- **Touchflow:** scenario kiezen, de concrete wijziging lezen, expliciet testonderhoud uitvoeren, directe laad- en resultaatfeedback.
- **Begrijpelijkheid:** korte menselijke eerste uitleg; technische statusassen blijven inspecteerbaar in beide weergaven.
- **Toegankelijkheid:** minimaal 44px primaire knop, toetsenbordbediening, zichtbare focus, aria-live feedback, reduced-motion en veilige mobiele marges.
- **Betekenis en grens:** ELIXER en widget tonen dezelfde canonieke uitkomst; onzekerheid en verval blijven zichtbaar. PRESENTATION ≠ PERMISSION.
- **Validatie:** toegewezen kernel- en browserchecks worden op de exacte GitHub-broncommit uitgevoerd; de PR vermeldt de daadwerkelijk waargenomen resultaten.
- **Status:** VORM9EVIN9_READY_WITH_CONDITIONS — synthetische lokale onderhoudsverbinding; productieverbinding en institutionele review staan apart.

## ELIXER HARA-huishouden

Het aanvullende `elixer-household-v0.1`-contract bindt een HARA-huishouden aan tenant, WORLD/MUNDO en Citadel. De uitvoeringsaanvraag, versiegebonden manifest en host-autorisatie verwijzen naar hetzelfde huishouden. De commit gate valideert actualiteit, intrekking, context, geregistreerde doelen en de autorisatiegebonden huishouden-digest. CITADEL(S) en MUNDO(S) delen geen impliciete globale onderhoudsrechten.
