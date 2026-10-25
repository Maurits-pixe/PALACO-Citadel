# H∆R∆M — voorlopig laboratoriummanifest v0.1

**LAB-CANDIDATE · SYNTHETIC · READ-ONLY · NOT OFFICIALLY ISSUED**

[haram-candidate.json](haram-candidate.json) legt het door de gebruiker aangeleverde
H∆R∆M-concept vast als één afzonderlijk, lokaal laboratoriumrecord. Het ID
`lab:haram:001` is uitsluitend een stabiele candidate-reference. Definitieve
ELIXER-ID, namespace, WORLD-/Citadel-binding, issuer, signer en reviewrefs blijven
expliciet onbekend. De synthetische tenant is een fixture, geen aangemaakt account.
Levensader blijft een onbevestigd L.A.-voorstel.

De bestaande kern gebruikt `HARA-LAB-001` / `H∆R∆` als module en H∆R∆M als persona.
Dat is geen bewezen identiteitsgelijkheid met deze nieuwe voorlopige naam.
`existingRuntime.binding=UNCONFIRMED` bewaart dit verschil; er is geen omzetter of
runtime-connector. Het bestaande v0.1-/v0.2-profiel wordt niet hernoemd of gewijzigd.
De HARA-knop in de RIO-preview blijft op zijn bestaande beschikbaarheidsstatus.

## Contract en package

Het aparte schema `elixer-lab-candidate-v0.1.json` weigert ontbrekende verplichte
velden, extra eigenschappen, andere namen/contexten en verruiming van rechten.
READ, EXPLAIN, PROPOSE en PRESENT zijn hier ontwerp-capabilities. PRESENT wordt
geen nieuwe engine-actie; `synthetic.public.read` verleent geen werkelijke toegang.
De drie persona-records beschrijven deterministische mocks; deze stap roept ze
niet aan. Consent, runtime, gedeelde widget/full-state en fixtures zijn hiermee
gespecificeerd, niet opnieuw aangesloten of als volledig MVP geaccepteerd.

De builder gebruikt de bestaande strikte canonicalJSON/SHA-256-code. De digest
staat buiten de gehashte payload `{format, manifest}`. `manifest.packageDigest`
blijft null als niet-uitgegeven bronveld. Er is geen zelfreferentiële hash of
stil gewijzigde bron. Een andere beschrijving of patchversie wijzigt de digest;
een andere objectkeyvolgorde niet. Het gebouwde object is diep bevroren.

Verificatie vraagt afzonderlijk de verwachte candidate-ID, versie en digest.
Een geldige hash toont inhoudsgelijkheid binnen die binding; geen handtekening,
formele provenance-validatie, onafhankelijke review of bevoegdheid. De CLI leidt
zijn verwachte digest zelf af en noemt dit expliciet een lokale self-check.
De CLI geeft een optionele exacte source-commit naast de packagebytes weer;
die commit is geen zichzelf bevattend manifestveld.

```text
node --test elixer-engine/test/lab-candidate.test.mjs
node --test elixer-engine/test/*.test.mjs
node elixer-engine/candidate-evidence.mjs
```

Geen netwerk, provider, mutatie, installatie, officiële uitgifte of activatie is
onderdeel van deze route. Schema-validatie controleert de begrensde vorm en
waarden; zij is geen classificatie van willekeurige tekst op persoonsgegevens.
Gebruik uitsluitend de meegeleverde synthetische input.

## Bronnen en volgende gate

- [ELIXER LABORATORIUM — Grondwet en Bouwplan v0.1](https://app.notion.com/p/50f3dbccda0a4e03a26476cdc6f44cd7)
- [ELIXER ENGINE — Kernelcontract v0.1](https://app.notion.com/p/bf8b28ff413049c5985caab475827458)
- Het H∆R∆M-manifestconcept en de twee aangeleverde tekstbijlagen van de gebruiker.

De oude snapshots onder `sources/` blijven behouden. De actuele aangeleverde
bijlagen worden afzonderlijk gehasht in het taakbewijs. Notion is alleen gelezen;
dit GitHub-artefact betekent niet dat de eerder geweigerde Notion-pagina is opgeslagen.

Review vóór verdere binding: bevestig module-/persona-identiteit en namespace;
leg expliciete WORLD/Citadel-fixtures vast; beoordeel package en testbewijs;
bevestig issuer-/signercontracten afzonderlijk. Hashing en geslaagde tests wijzigen
geen statusas in het bronmanifest. Officiële uitgifte en activatie blijven HOLD.
