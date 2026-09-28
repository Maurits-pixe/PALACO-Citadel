# Atelier → registratie → geïsoleerde preview · v0.2

Status: **SINGLE-USER LOCAL PREVIEW / NOT ACTIVATED**. Dit document vervangt de oudere opslagbeschrijving voor de hier genoemde functies. Het oorspronkelijke zes-testresultaat blijft historisch; deze integratieslice heeft een eigen testbereik.

## Uitgevoerde integratie

1. `createDraftPackage` gebruikt `atelier/builder.mjs` om de echte `citadel.json` en optionele assetbytes te hashen.
2. `PreviewAdapter.register` controleert bestandenset en bytes, exact template-ID/versie/hash, maker en project, alle L.A.-stappen, assetbinding, actuele PREVIEW-grant en ondertekende ERA-attestatie.
3. Onder één Citadel-writerlock controleert hij de bestaande makerbinding en de export-sequence. Een duplicate of oudere export wordt geweigerd.
4. Eén `DRAFT_REGISTERED`-event bevat pakket, verificatierecord, grantverwijzing en ERA-attestatie. Het event wordt volledig gestaged, gesynchroniseerd en atomair zonder overschrijven zichtbaar gemaakt. De eventtijd zelf blijft `LOCAL_SYSTEM_CLOCK / UNATTESTED`.
5. `preview` hercontroleert de geregistreerde bytes, grant, ERA-venster en de semantische receipt-binding. Er volgt hoogstens één previewresultaat per idempotency key. Dat receipt heeft geen activatiekracht.
6. De optionele lokale HTTP-server bindt uitsluitend `127.0.0.1`. Alleen een willekeurige sessie-URL geeft toegang; Host en methode worden gecontroleerd. Er is geen uploadendpoint, datamap of directory listing.
7. De server levert een iframe met lege sandbox, escaped tekst, CSP, no-store en no-referrer. Er wordt geen aangeleverde HTML, JavaScript, asset of URL uitgevoerd. Ieder nieuw verzoek controleert opnieuw op intrekking. Reeds gelezen bytes kunnen niet achteraf uit het geheugen van een kijker worden verwijderd.

RIO blijft de gids voor invoer en uitleg. De browserwizard schrijft niet rechtstreeks naar dit register. De adapter is de programmatische verbinding voor de Atelier-domainexport; een beveiligde import-UI blijft een afzonderlijk werkpunt.

## Operatorconfiguratie

```js
import { LocalRegistry } from './registration/registry.mjs';
import { PreviewAdapter } from './registration/preview.mjs';
import { startLocalPreview } from './registration/preview-server.mjs';

// Lees onderstaande waarden uitsluitend uit lokale operatorconfiguratie.
// De root bestaat vooraf, is privé, en ligt buiten de repository.
const registry = new LocalRegistry(config.dataRoot, {
  allowedRoot: config.allowedRoot,
  trustedKeys: config.issuerPublicKeys
});
const adapter = new PreviewAdapter(registry, {
  makerId: config.localMakerId,
  eraKeys: config.eraPublicKeys
});
await adapter.register(draftPackage, signedEraAttestation);
const host = await startLocalPreview(adapter);
const url = host.urlFor(citadelId, manifestSha256);
// Toon url alleen aan de lokale operator. host.server.close() beëindigt de sessie.
```

De allow-root en maker komen nooit uit pakketdata of een HTTP-aanvraag. Geen defaultroot en geen automatische sleutelaanmaak. PRIVATE sleutels worden niet opgeslagen of geëxporteerd. Grant- en ERA-keys moeten vooraf via een zelfstandig vertrouwd proces worden aangeleverd. De tests gebruiken uitsluitend tijdelijke fixturesleutels.

## Opslagprofiel

- Verplichte absolute `allowedRoot` en `dataRoot`; dataRoot moet daarbinnen liggen. Letterlijke `..`, ongeldige segmenten, symlinks in het hele pad en onveilige eventbestanden worden geweigerd.
- Canonieke realpathcontrole; root-device/inode wordt tijdens de sessie vastgehouden. Directories 0700; bestanden 0600; eventbestanden hebben één hardlink.
- Volledige staging met fsync; atomair `link` zonder overschrijven; directory-fsync. De tijdelijke extra hardlink wordt direct verwijderd. Een lezer ziet volledige bytes of krijgt een weigering.
- Geen bescherming tegen een kwaadwillende beheerder of proces onder dezelfde OS-user dat tussen checks paden vervangt. De root moet exclusief van de lokale operator zijn. Geen netwerkfilesystemgarantie of multi-user tenantisolatie.
- Gevalideerd op Linux/POSIX. Windows wordt expliciet geweigerd tot ACL-, symlink-, fsync- en crashgedrag zijn geverifieerd. Jouw computer is niet gekoppeld of gewijzigd. Rechtstreeks gebruik op Windows staat dus OPEN; WSL is evenmin op jouw laptop getest.

## ERA-profiel

De verplichte attestatie is een domeingebonden SHA-256/RSA-handtekening van een expliciet vertrouwde applicatiesigner. Zij bindt maker, Citadel, manifestdigest, export-sequence, observedAt en validUntil. Ontbrekend bewijs, onbekende key, gewijzigde inhoud, toekomsttijd of verlopen venster blokkeert toegang.

Dit is geen RFC 3161-token en geen bewijs van een atoomklok. De verifier vergelijkt het venster met de lokale klok; clock rollback/holdover en een onafhankelijke tijdsbron blijven OPEN. Er is geen automatische downgrade naar lokaal vertrouwen.

## Crash en herstel

- Fout vóór eventcommit: definitief event ontbreekt; normale exceptioncleanup verwijdert staging en lock.
- Abrupte processtop vóór commit: staging/lock kan blijven liggen. De volgende transactie leest de PID-markering, verwijdert alleen een lock van een niet meer bestaand proces en verwijdert onbereikbare staged bytes; een levende writer blijft fail-closed geblokkeerd.
- Crash ná registratie, vóór preview: het registratie-event blijft compleet. `preview` leest dat record opnieuw en schrijft het ontbrekende receipt eenmaal. Herregistratie is idempotent voor dezelfde sleutel en wordt als replay geweigerd voor een nieuwe sleutel.
- Fout ná atomair zichtbaar maken of tijdens directory-fsync: commitstatus kan onzeker zijn. Niet blind herhalen of verwijderen. Inspecteer de keten en hervat vanuit het aanwezige event.
- Een volledige rewritetruncatie door de beheerder is zonder extern ondertekend checkpoint niet detecteerbaar. Dat blijft een productiepoort.

## Verificatie

`node --test registration/preview.test.mjs registration/registry.test.mjs atelier/wizard.test.mjs atelier/builder.test.mjs citadel-proof/proof.test.mjs`

17 basis-tests PASS op Node 24/Linux, inclusief 11 integratietests. De remediation-suite voegt vijf regressietests toe voor clock rollback, receipt-semantiek, trust-conflict/rollback, idempotente response-loss recovery en de monotone trust registry. Ze behandelen een echte loopback-HTTP-preview, payloadmanipulatie, templateversie, grant/expiry/scope/revocation, ERA-missing/forged/expired/future, duplicate/replay/concurrent admission, twee makers op hetzelfde object, traversal/root escape/symlink/mode, een echte child-process exit na registratie, en fouten vóór sync/commit zonder gedeeltelijk definitief event.

De aparte Chromium-test (`registration/preview.browser.test.mjs`) controleert daadwerkelijke iframe-rendering, markup en parent-isolatie. Lokale uitvoering was BLOCKED: browserbinary ontbreekt. De toegevoegde CI-workflow installeert Chromium en voert die test uit. Een workflowbestand is geen bewijs van een groene run; controleer de exacte commitresultaten.

Geen conformiteitsclaim voor AVG, NIST, OWASP, RFC 3161 of RFC 8785. Geen activatie, execution commit, publieke publicatie of productie-autorisatie.
