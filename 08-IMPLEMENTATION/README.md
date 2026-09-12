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

Validate the profile from the repository root:

```bash
node --check rio/localization.mjs
node --check rio/runtime.mjs
node --check rio/conformance.mjs
node rio/conformance.mjs
```

This is a local implementation profile. Passing checks do not create canon, consent, permission, or authority.
