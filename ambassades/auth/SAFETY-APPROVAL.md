# Verplichte veiligheidsgoedkeuring voor inloggen en accountaanmaak

De server vereist een afzonderlijke veiligheidsgoedkeuring vóór inloggen en vóór accountaanmaak. Die controle staat los van NOVA's eerste receptiekeuze en zijn controlepoort. Een bevestigde receptiekeuze, lokale sessiecontrole, browsercheckbox of meegestuurde PASS verleent geen goedkeuring voor een account.

## Huidige aansluiting

Er is geen vertrouwde veiligheidsgoedkeuringsdienst aangesloten in de publieke server. Daarom blijft de uitkomst `HOLD`. Dit blijft ook zo als later alleen de Auth0-/OIDC-instellingen worden ingevuld. De server fabriceert geen 6RI9ADE-, STEWARD-, identiteit- of veiligheidsbewijs.

`GET /api/auth/status` antwoordt met de normale configuratievelden en dit exacte publieke object:

~~~json
{
  "required": true,
  "available": false,
  "outcome": "HOLD",
  "reason": "TRUSTED_SAFETY_APPROVAL_MISSING",
  "loginAllowed": false,
  "signupAllowed": false
}
~~~

Dit object staat onder `securityApproval`. De bovenliggende waarden `available` en `authenticated` blijven bij HOLD `false`; er wordt geen zetel, e-mailadres, subject, sessiecapability of privé-afwijzingsreden getoond.

Zonder geldige veiligheidsaansluiting antwoorden `/login`, `/signup`, `/callback`, `/api/me` en `/api/seats/:seat` met HTTP 503 en `{"error":"SAFETY_APPROVAL_REQUIRED"}`. De controle staat vóór de SDK-router en dekt ook hoofdletter- en afsluitende-slashvarianten van callbackpaden. Er vindt geen redirect naar de identiteitprovider, codewisseling, accountaanmaak of sessietoelating plaats.

Openbare pagina's, RIO, NOVA en processtatus blijven beschikbaar. Uitloggen blijft beschikbaar voor een bestaande geconfigureerde sessie met de bestaande Origin-controle; een ontbrekende veiligheidsgoedkeuring mag het afsluiten niet verhinderen.

## Interne testaansluiting en toekomstige verifier

`buildApp({authSafetyEvaluator})` biedt een expliciete functieafhankelijkheid voor gecontroleerde proeven of een later afzonderlijk aangesloten verifier. De normale startfunctie geeft deze afhankelijkheid niet mee. Er bestaat geen omgevingsvariabele, browserbody, queryparameter of header waarmee een gebruiker de aansluiting of een goedkeuring kan inschakelen.

De evaluator krijgt uitsluitend een door de host gegenereerde, bevroren context:

~~~text
schemaVersion: palaco-auth-safety-context/0.1
requestId: nieuw willekeurig server-ID
action: login | signup | session
phase: READINESS | BEGIN | CALLBACK | COMPLETE | SESSION
seat: exact gekozen/geautoriseerde zetel, of null bij readiness
flowId: afzonderlijk publiek serverflow-ID, of null
sessionBinding: digest van de private flowcapability of gecontroleerd sessiecookie, of null
principalBinding: digest van geverifieerde issuer/subject, of null
~~~

Een positieve testbeslissing moet precies deze velden hebben:

~~~text
schemaVersion: palaco-auth-safety-decision/0.1
outcome: APPROVED
context: exact dezelfde hostcontext
issuedAt: canonieke ISO-tijd
expiresAt: canonieke ISO-tijd
~~~

De beslissing mag maximaal zestig seconden geldig zijn, moet actueel zijn en mag niet vóór haar uitgifte worden gebruikt. Boolean true, een los PASS-veld, een onbekende context, verkeerd type, extra veld, ongeldige tijd, verlopen beslissing of een fout van de evaluator geeft geen toelating. De host wacht maximaal vijf seconden op de evaluator. Private foutdetails worden niet gepubliceerd.

Deze interne proeven hebben synthetische principals en een expliciete testverifier. Een geslaagde proef bewijst de werking van de poort en haar bindings; zij bewijst geen operationele 6RI9ADE, fysieke menselijke identiteit of absolute veiligheid. Een toekomstige echte adapter moet onafhankelijk zijn ingeschreven, actuele veiligheidsuitslagen en intrekking controleren en de vereiste echte evidence verifiëren. Een zelf meegestuurde sleutel of clientassertion is geen vertrouwde adapter.

## Afzonderlijke login- en signupflows

Na geldige begincontrole krijgt iedere flow:

- Een private capability van 32 willekeurige bytes in `__Host-palacoAuthSafety`: `Secure; HttpOnly; SameSite=Lax; Path=/`.
- Een apart publiek willekeurig flow-ID dat de SDK via `authSafetyFlowId` aan zijn bestaande statebinding toevoegt.
- Een vaste actie `login` of `signup`, één exacte zetel en maximaal vijf minuten geldigheid.

De private capability komt nooit in de URL, SDK-state of publieke status. HTTP-development gebruikt uitsluitend loopback en het cookie `palacoAuthSafety`. Lax is nodig voor de normale cross-site top-level GET van de identiteitprovider; de SDK bewaakt daarnaast zijn eigen getekende transactioncookie, state, nonce, PKCE en tokencontrole.

De server bewaart maximaal 128 gelijktijdige flows in tijdelijk procesgeheugen. Een herstart wist ze. Opnieuw beginnen met dezelfde browsercapability vervangt de oude flow. Verlopen en gesloten flows kunnen niet worden hervat met oude cookies.

`GET /login?seat=...` vraagt vóór de providerredirect een eigen BEGIN-beslissing. `GET /signup?seat=...` doet hetzelfde voor de afzonderlijke signupactie en gebruikt daarna uitsluitend de officiële Auth0-hint `screen_hint=signup` via de bestaande OIDC-login. Deze route maakt zelf geen account of zetellidmaatschap aan. Ook een eventueel nieuw provideraccount moet nog afzonderlijk tot het private zetelregister worden toegelaten.

## Callback en actuele sessietoegang

De callback moet de eigen private capability én de bijbehorende SDK-transactioncookie hebben. Een flow wordt vóór iedere asynchrone callbackcontrole voor één verwerking gereserveerd. Zonder actuele CALLBACK-goedkeuring bereikt hij de SDK-codewisseling niet.

Na cryptografische controle van het binnenkomende token moeten het publieke SDK-flow-ID, de originele actie, de exacte zetel en het geverifieerde nieuwe subject overeenkomen. Dan volgt een afzonderlijke COMPLETE-beslissing. De host leest het private lidmaatschap opnieuw en controleert daarna de actuele vervaltijd en dezelfde flowbinding synchroon. Pas bij dat laatste toelatingsbesluit wordt de flow verbruikt. Er staat geen asynchrone stap tussen de laatste controle en lokale sessietoelating.

Een geweigerde of ongeldige SDK-callback sluit eveneens de gereserveerde flow; retry of replay vereist een nieuwe begincontrole. Oude goedkeuringen kunnen niet voor een andere zetel, actie, flow of principal worden hergebruikt.

Voor iedere private API-aanvraag en voor een zichtbare persoonlijke status volgt een nieuwe SESSION-controle op het huidige geverifieerde subject en de digest van het daadwerkelijke SDK-sessiecookie. Een expliciet geïnjecteerde upstream-identiteitsfixture mag alleen in gecontroleerde applicatietests zonder echt SDK-cookie worden gebruikt. De normale startfunctie heeft geen zulke fixture.

Na de laatste asynchrone registerlezing controleert een private, eenmalige synchrone ticketfunctie opnieuw verval en actuele sessie-/principalbinding. De publieke readinessbeslissingen worden eveneens na de laatste asynchrone stap opnieuw op verval gecontroleerd. Een beslissing die tijdens een trage registerlezing verloopt, levert geen sessie of private gegevens op en wordt niet langer als APPROVED gepubliceerd.

HOLD, intrekking, onbereikbaarheid of verlopen goedkeuring sluit persoonlijke toegang en verbergt het zetelgegeven. Dit wist een bestaand SDK-sessierecord niet automatisch; uitloggen blijft de expliciete afsluitroute. Terugkeer vereist altijd een nieuwe actuele goedkeuring bij de volgende private aanvraag.

## Grenzen en verificatie

De Auth0-/OIDC-provider blijft verantwoordelijk voor zijn eigen accountbeveiliging, wachtwoordbeleid, MFA en herstel. De veiligheidsgoedkeuringspoort vervangt die controles, tokenverificatie of private zetelautorisatie niet. Accountaanmaak en inloggen verlenen geen governance-, stem-, acceptance-, merge-, release- of uitvoeringsbevoegdheden.

De helper en zijn private state vallen buiten de publieke bestandsallowlist. Tests moeten zowel de standaard gesloten productieconfiguratie als expliciete gecontroleerde goedkeuring, verkeerde bindings, verval, intrekking, callbacks, replay, sessies en logout controleren. Een gecontroleerde positieve OIDC-proef is geen bewijs dat een echte veiligheidsdienst of individueel account live is aangesloten.
