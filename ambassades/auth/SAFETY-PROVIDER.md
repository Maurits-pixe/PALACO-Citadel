# Aansluiting op een onafhankelijke veiligheidsdienst

De HTTPS-aansluiting is gebouwd. Er is nog geen echte veiligheidsdienst, private inschrijving of operationele issuer aangesloten. De publieke website houdt inloggen, accountaanmaak en persoonlijke toegang daarom op HOLD. Dit onderdeel maakt geen account, sleutel, issuerinschrijving, stewardbenoeming of veiligheidsgoedkeuring aan.

## Authbeleid en bewijsdekking

Dit is een afzonderlijk authentication-safety-profiel: `PALACO-AUTH-SAFETY-1`. Het gebruikt geen synthetische RIO-referencegoedkeuring en vertaalt de achttien bilaterale chatchecks niet naar accounttoegang. Het meldt geen aangesloten 6RI9ADE of STEWARD.

Elke actie/fase heeft vaste, volledige bewijsdekking:

| Actie/fase | Vereiste controles |
| --- | --- |
| login/signup — READINESS | SERVICE_READINESS, ACCESS_POLICY |
| login/signup — BEGIN, CALLBACK | CONTEXT_BINDING, ACCESS_POLICY, ABUSE_RISK |
| login/signup — COMPLETE | CONTEXT_BINDING, ACCESS_POLICY, ABUSE_RISK, PRINCIPAL_BINDING |
| session — SESSION | CONTEXT_BINDING, ACCESS_POLICY, ABUSE_RISK, PRINCIPAL_BINDING |

Iedere controle heeft een eigen ingeschreven Ed25519-key. Daarnaast zijn een afzonderlijke DECISION-key en REVOCATION-key nodig: zeven verschillende keys en inschrijvingen in totaal. Een alleen ondertekende APPROVED, lege controleset, losse hash, ontbrekende uitslag, UNKNOWN, dubbele controle of verkeerde issuer is onvoldoende.

Keys verschillen technisch; dat bewijst geen onafhankelijke mensen, organisaties of runtimes. De operator moet de werkelijke bevoegdheid, onafhankelijkheid en provenance van iedere issuer afzonderlijk vaststellen. De code controleert de handtekeningen, toegestane rol, exacte context, beleid, geldigheid en intrekking van issuerassertions. Zij bewijst niet zelfstandig dat alle feitelijke veiligheidscontroles zijn uitgevoerd of dat een fysieke mens aanwezig was.

## Private configuratie

`PALACO_AUTH_SAFETY_FILE` selecteert uitsluitend een absoluut pad naar een private configuratie. Het is geen approvalflag. Laat dit veld leeg zolang geen onafhankelijke dienst en bevoegde issuers zijn ingeschreven.

Het bestand moet buiten de repository en webroot staan, een rechtstreeks regulier bestand zijn en maximaal 65.536 bytes bevatten. Symlinks worden geweigerd. Op POSIX mogen andere gebruikers/groepen geen rechten hebben: gebruik bijvoorbeeld 0600 of 0400 en geef alleen het serveraccount de benodigde toegang. Windows-ACL's blijven de verantwoordelijkheid van de operator. De server genereert of schrijft dit bestand niet.

De configuratie heeft precies deze velden:

~~~text
schemaVersion: palaco-auth-safety-provider/0.1
classification: PRODUCTION
revision: versie-ID
applicationOrigin: exacte HTTPS-origin van deze toepassing
decisionEndpoint: vaste HTTPS-URL
revocationEndpoint: andere vaste HTTPS-URL op dezelfde service-origin
policyVersion: PALACO-AUTH-SAFETY-1
enrollmentEpoch: inschrijvingsversie-ID
authorizationToken: private bearercredential, 16–2048 toegestane tekens
issuedAt: canonieke ISO-tijd
expiresAt: canonieke ISO-tijd
enrollments: zeven afzonderlijke ingeschreven records
revokedEnrollmentIds: unieke ingetrokken inschrijvings-ID's
revokedDecisionIds: unieke ingetrokken bewijs-/besluit-ID's
~~~

Iedere enrollment bevat precies `id,role,publicKeyPem,status,enrollmentId,provenanceRef,issuedAt,expiresAt`. Rollen zijn SERVICE_READINESS, CONTEXT_BINDING, ACCESS_POLICY, ABUSE_RISK, PRINCIPAL_BINDING, DECISION en REVOCATION. De status moet ACTIVE zijn; IDs en publieke keys moeten onderling verschillen. Alleen een actuele Ed25519 SPKI PUBLIC KEY wordt geaccepteerd. Private PEM, callerkeys, responsekeys, dubbele rollen, intrekking en verval worden geweigerd.

Een bewust inactieve voorbeeldstructuur:

~~~json
{
  "schemaVersion": "palaco-auth-safety-provider/0.1",
  "classification": "PRODUCTION",
  "revision": "UNENROLLED",
  "applicationOrigin": "https://palaco-ambassades.onrender.com",
  "decisionEndpoint": null,
  "revocationEndpoint": null,
  "policyVersion": "PALACO-AUTH-SAFETY-1",
  "enrollmentEpoch": "UNENROLLED",
  "authorizationToken": null,
  "issuedAt": null,
  "expiresAt": null,
  "enrollments": [],
  "revokedEnrollmentIds": [],
  "revokedDecisionIds": []
}
~~~

Dit voorbeeld is ongeldig voor activering en geeft uitsluitend HOLD. Vul geen verzonnen dienst, sleutel of provenance in. Een ontbrekende, onveilige, onvolledige of verkeerde configuratie laat de openbare pagina's en NOVA beschikbaar en houdt authenticatie gesloten. Een volledige externe inschrijving moet bij het starten al bestaan; daarna worden configuratie en intrekking telkens opnieuw gelezen. Vervang wijzigingen atomair, verander revision/enrollmentEpoch bij een beleids- of sleutelwijziging en herstart na de eerste echte aansluiting.

## Twee HTTPS-aanvragen

Voor iedere veiligheidscontext maakt de host een nieuwe willekeurige 32-byte challenge. De eerste POST bevat precies:

~~~text
schemaVersion: palaco-auth-safety-request/0.1
audience: exacte applicationOrigin
policyVersion: PALACO-AUTH-SAFETY-1
enrollmentEpoch
trustRevision
context: bestaande exacte authcontext
challenge: 64 kleine hexadecimale tekens
~~~

De service antwoordt met precies `{schemaVersion:"palaco-auth-safety-response/0.1",controls:[...],decision:...}`. De adapter verifieert eerst iedere vereiste controle en daarna het afzonderlijk ondertekende besluit over de volledige gecontroleerde set.

Pas daarna ontstaat een nieuwe, aparte revocationchallenge. De tweede POST bevat `schemaVersion:"palaco-auth-revocation-request/0.1",audience,policyVersion,enrollmentEpoch,trustRevision,requestDigest,decisionId,proofSetDigest,challenge`. De afzonderlijke REVOCATION-issuer moet de actuele status van dat exacte besluit en die exacte set ondertekenen.

Beide vaste endpoints gebruiken HTTPS met normale TLS-certificaatcontrole, dezelfde service-origin en een bearercredential uit het private bestand. Userinfo, query, fragment, redirect en responsekeys worden geweigerd. Er is geen TLS-disableoptie; een proces dat TLS-controle expliciet uitschakelt wordt geweigerd.

De complete evaluatie heeft één deadline van drie seconden. Elke respons is maximaal 32.768 bytes, HTTP 200 en application/json. De adapter vraagt identityencoding en weigert gecomprimeerde responses. Er zijn maximaal 32 gelijktijdige evaluaties. Geen sleutel, token, complete bewijsset, privéreden of trustinventaris wordt gelogd of gepubliceerd.

## Ondertekende bewijsobjecten

Iedere envelope heeft precies `{algorithm:"Ed25519",body,signature}`. De signature is canonieke, niet-gepadde base64url van 64 bytes. De bytes voor signing zijn:

~~~text
UTF8("PALACO/AUTH-SAFETY/SIGNED-PROOF/v0.1\0" + canonicalSortedJSON(body))
~~~

JSON-objectkeys worden gesorteerd; alleen strings, booleans, null, veilige integers, arrays en gewone objecten zijn toegestaan. Digests zijn SHA-256 over alleen de canonieke JSON-bytes. Dit is een attestationformaat, geen E2EE- of wachtwoordprotocol.

CONTROL en DECISION hebben precies deze zestien bodyvelden:

~~~text
schemaVersion: palaco-auth-safety-proof/0.1
classification: PRODUCTION
id
issuerId
kind: CONTROL | DECISION
control: toegewezen controlecode bij CONTROL, anders null
action
phase
requestDigest
policyVersion
enrollmentEpoch
trustRevision
result: PASS bij CONTROL; APPROVED bij DECISION
proofSetDigest: null bij CONTROL; digest van de complete gesorteerde controles bij DECISION
issuedAt
expiresAt
~~~

Alle velden moeten dezelfde hostcontext, actie, fase, challenge, audience en policybinding vertegenwoordigen. De requestDigest bindt de volledige aanvraag. De proofSetDigest bindt de envelopes gesorteerd op controlcode. Geldigheid is maximaal dertig seconden. Het besluit mag niet vóór een vereiste controle zijn uitgegeven.

REVOCATION gebruikt dezelfde velden met kind REVOCATION, control null en result CURRENT, plus precies `decisionId,challenge,observedAt,revokedEnrollmentIds,revokedDecisionIds`. observedAt moet issuedAt zijn en niet vóór de besluituitgifte liggen. Zowel witnessleeftijd als geldigheidsperiode is maximaal vijf seconden. Ingetrokken gebruikte inschrijvingen of bewijs-ID's sluiten de beoordeling.

## Laatste lokale toelatingscheck

Vóór en na netwerkverwerking leest de adapter dezelfde private configuratiebytes. Iedere wijziging houdt de lopende beoordeling tegen. Een geverifieerde beslissing krijgt bovendien een private WeakMap-ticket; dit ticket komt niet in HTTP-JSON.

De authhelper bewaart de oorspronkelijke beslissing en roept de gepaarde synchrone `assertCurrent(decision)` opnieuw aan bij readinesspublicatie, begincommit, SDK-loginstate, de daadwerkelijke laatste SDK-loginredirect, callbackdispatch en finale COMPLETE-/SESSION-commit. Een requestgebonden redirectguard sluit ook asynchrone SDK-stappen na getLoginState af: direct vóór de native redirect moeten BEGIN-bewijs, vaste lease en dezelfde pending flow nog actueel zijn. Bij afwijzing wordt de flow verwijderd en het private cookie gewist; hij kan niet via een latere callback herleven. Die laatste check volgt na de allerlaatste asynchrone registerlezing. Zij controleert opnieuw de exacte private bestandbytes, enrollment/policy/revocationversie en de gezamenlijke vervaltijd. Er staat geen HTTP-await na deze laatste lokale controle.

Lokale intrekking of configuratiewijziging maakt een eerder ticket ongeldig. Remote status heeft een expliciete witnesslease van maximaal vijf seconden. Offline, timeout, een onbekende of verlopen witness geeft HOLD; de code heeft geen directe kennis van een nog niet ontvangen remote wijziging. Deze begrenzing is geen absolute veiligheidsgarantie.

## Gecontroleerde verificatie

De normale startfunctie gebruikt uitsluitend `createAuthSafetyProvider`, die PRODUCTION verlangt. Een afzonderlijke interne `createControlledAuthSafetyProvider` accepteert uitsluitend TEST_ONLY voor HTTPS- en cryptografische tests. SYNTHETIC_ONLY, TEST_ONLY en demo-identiteiten kunnen via de normale configuratie geen productietoelating krijgen. Er bestaat geen environmentflag voor testinschrijving.

Gecontroleerde fixtures mogen een echte lokale HTTPS-server, tijdelijke test-CA en Ed25519-keys gebruiken. Dat test transport, echte signatures, volledige dekking, contextbinding, intrekking, replay en verval; het schrijft geen echte persoon of veiligheidsdienst in. De bestaande OIDC-, privétoegang- en NOVA-tests blijven afzonderlijk nodig.

Voor werkelijke aansluiting blijven een onafhankelijke dienst, bevoegde private issuerinschrijvingen, actuele intrekkingsbron, providerconfiguratie en persoonlijke enrollment noodzakelijk. Dit bouwresultaat levert de aansluiting en houdt toegang gesloten zolang die ontbreken. De poort beschermt de lokale PALACO-routes en sessietoelating; registratie rechtstreeks bij een externe identiteitprovider valt onder diens eigen beleid en wordt niet door deze lokale code geblokkeerd.
