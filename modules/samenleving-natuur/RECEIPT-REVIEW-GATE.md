# Citadel — lokale ontvangstbeoordeling (DRAFT / HOLD)

`receipt-review-gate.mjs` is een **geïsoleerde, alleen-lezen kandidaatmodule**. Er is geen koppeling met de gebruikersinterface, productiedatabase, identity provider of autorisatie-engine. De optionele import van deze module verleent geen toestemming.

De functie `assessLocalReceiptReview(input)` beoordeelt uitsluitend of *aangeleverde beweringen* over ledgerbinding, checkpointbinding, handtekening, reviewersregister, reviewerscheiding, uitgeversvertrouwen, intrekkingsactualiteit en beleid volledig zijn, plus of twee opgegeven digestvelden syntactisch correct en gelijk zijn.

**Cruciale grens:** de functie valideert zelf geen digitale handtekeningen en berekent geen hashes. Alle invoervelden zijn door een aanroeper manipuleerbaar. Ook bij een complete rapportage geeft zij altijd `trust: NOT_ESTABLISHED`, `authorization: DENY`, `executionAllowed: false` en `releaseAllowed: false` terug. Een volledig lokale rapportage is dus **geen bewijs van cryptografische of organisatorische betrouwbaarheid**.

Uitvoeren vanaf de repository-root:

```sh
node --test modules/samenleving-natuur/receipt-review-gate.test.mjs
```

Voor productie is afzonderlijk vereist: onafhankelijke trust anchors, geauthenticeerde reviewer-identiteit en rol-/functiescheiding, actuele intrekkingsinformatie, gevalideerde bewijsherkomst, een ondertekende beleidsbeslissing en gecontroleerde executie. **PR #63 blijft Draft/HOLD; geen merge of uitrol.**
