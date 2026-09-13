# 08-IMPLEMENTATION

Concrete implementation assets: code, schemas, tests, examples, and setup.

## BRIGADE Guardian basis

- `profile.go` bevat de basisstructuur voor elke BRIGADE guardian.
- Elke guardian wordt vanaf het begin als `bekend` geregistreerd.
- De Expert Gardian-profielstructuur bevat onder andere de eigenschap `id`.

## RIO implementation profile

- [Profile and boundaries](../rio/README.md)
- [Conversation and subject schema](../rio/conversation.schema.json)
- [Transition policy](../rio/transition-policy.json)
- [Seven-language catalog](../rio/locales.json)
- [Runtime](../rio/runtime.mjs)
- [Conformance suite](../rio/conformance.mjs)
- [Web and touchscreen surface](../index.html)
- [Browser conformance suite](../tests/browser/rio-surface.spec.mjs)
- [Playwright configuration](../playwright.config.mjs)

Validate the profile from the repository root:

```bash
npm ci
npx playwright install chromium
npm test
```

This is a local implementation profile. Passing checks do not create canon, consent, permission, or authority.
