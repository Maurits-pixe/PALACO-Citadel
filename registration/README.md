# PALACO Registration Layer — local preview v0.2

Identity, ERA, WATERMERK, HOLOGRAM and proof registration remain bounded to **SINGLE-USER LOCAL PREVIEW / NOT ACTIVATED**.

- [Integration, storage, ERA and recovery](docs/PREVIEW-INTEGRATION.md)
- [Authorization inventory and remaining gaps](docs/AUTHORIZATION-MAP.md)
- [Verification dossier](docs/VERIFICATION-RECORDS.md)
- [GO-047-I1 incident-state inspection and recovery QA](docs/INCIDENT-RECOVERY-QA.md)

`LocalRegistry` now requires an operator-configured `allowedRoot` in addition to its data root. Both must be absolute. This is an intentional fail-closed API change. `ConfinedStore` enforces canonical paths, private permissions and atomic complete event publication; Windows ACL storage remains unsupported pending verification.

`createDraftPackage` connects the Atelier domain export to `PreviewAdapter`. Registration requires an exact template, maker/project binding, complete trajectory, bytes/hash checks, signed PREVIEW grant and signed application-level ERA attestation. `startLocalPreview` serves only an escaped, sandboxed preview on loopback with a per-session secret URL. Grant and ERA validity are checked on each request. The local browser wizard is not yet wired to import data into this adapter.

Run `npm run test:preview` for the 17 targeted/domain/integration tests. `npm run test:preview:browser` additionally requires installed Playwright Chromium. No personal data, data directory, private keys or fixture credentials belong in GitHub. Filesystem ownership is the current local trust boundary; this code does not establish a production identity service, external time authority, tenant isolation or an external ledger checkpoint.
