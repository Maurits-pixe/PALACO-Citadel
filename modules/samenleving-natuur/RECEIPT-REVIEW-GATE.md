# Citadel — lokale ontvangstbeoordeling (DRAFT / HOLD)

`receipt-review-gate.mjs` is een **geïsoleerde, alleen-lezen kandidaatmodule**. Er is geen koppeling met de gebruikersinterface, productiedatabase, identity provider of autorisatie-engine. De optionele import van deze module verleent geen toestemming.

`assessLocalReceiptReview(input)` beoordeelt aangeleverde claims over ledger, checkpoint, handtekening, reviewersregister, reviewerscheiding, uitgeversvertrouwen, intrekking en beleid. Ook vergelijkt zij twee syntactisch geldige, gelijke SHA-256-digeststrings; **zij berekent of verifieert die hashes niet zelf**.

## Extra scheiding tussen maker en reviewer

De lokale consistency gate vereist nu expliciete:
- `makerId` en `reviewerId`: verschillende, niet-lege, canonieke identificaties (maximaal 128 tekens, alleen `a-z 0-9 . _ : -`);
- `makerKeyFingerprint` en `reviewerKeyFingerprint`: verschillende, exact 64 tekens lange lowercase hexstrings.

Een aangeleverd `reviewerIndependent: true` is op zichzelf niet genoeg. Gelijke identiteiten, hergebruikte sleutelvingerafdrukken en ontbrekende/ongeldige velden worden afzonderlijk afgewezen. Dit is **slechts een lokale inconsistentiecontrole**: twee verschillende strings of sleutels bewijzen niet dat er twee onafhankelijke natuurlijke personen, rollen of geautoriseerde identiteiten bestaan. Alle velden, ook de issuer-trust-claim, komen uit onbeveiligde input en kunnen gefabriceerd zijn.

Ook bij volledig gemelde checks retourneert de module uitsluitend `trust: NOT_ESTABLISHED`, `authorization: DENY`, `executionAllowed: false`, `releaseAllowed: false`.

## Regressie

```sh
node --test modules/samenleving-natuur/receipt-review-gate.test.mjs
```

De workflow `citadel-nature-qa.yml` voert de Node-tests uit vóór de desktop- en mobiele Playwright-suite. Voor productie zijn onafhankelijke trust anchors, identiteit/key-attestation, echte cryptografische verificatie, actuele intrekking, beleidsautorisatie en gecontroleerde uitvoering vereist.

**PR #63 blijft Draft/HOLD. Geen merge, sleutelactivering, accountautorisatie of uitrol.**
